/**
 * stress-api.js
 * Tests concurrent write integrity and API throughput.
 *
 * Tests:
 *  1. Concurrent PATCHes to the same job (race condition / last-write-wins check)
 *  2. Concurrent POSTs (data loss check — all new records must survive)
 *  3. Rapid sequential PATCHes (simulates fast checklist ticking)
 *
 * Run: node scripts/stress-api.js
 * Requires the Vite dev server to be running on localhost:5173.
 */

const BASE = 'http://localhost:5173';
const CONCURRENT_PATCHES = 20;
const CONCURRENT_POSTS   = 10;
const SEQUENTIAL_PATCHES = 8;   // matches checklist item count

let passed = 0;
let failed = 0;

function pass(msg) { console.log(`  ✓  ${msg}`); passed++; }
function fail(msg) { console.error(`  ✗  ${msg}`); failed++; }
function header(msg) { console.log(`\n── ${msg}`); }

/* ---------- helpers ---------- */
async function apiGet(path) {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return r.json();
}

async function apiPost(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

async function apiPatch(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: r.ok ? await r.json() : null };
}

async function apiDelete(id) {
  const r = await fetch(`${BASE}/api/jobs/${id}`, { method: 'DELETE' });
  return r.ok;
}

function makeGuid() {
  const h = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${h()}${h()}-${h()}-${h()}-${h()}-${h()}${h()}${h()}`;
}

function ms(start) { return `${(Date.now() - start).toLocaleString()} ms`; }

/* ================================================================
   TEST 1 — Concurrent PATCHes to the same record
   Expected failure: last-write-wins will lose some intermediate
   writes, but the final value must be one of the submitted values
   (not empty / corrupted).
   ================================================================ */
async function testConcurrentPatches(targetId) {
  header(`Test 1 — ${CONCURRENT_PATCHES} concurrent PATCHes → same job (${targetId.slice(0, 8)}…)`);
  const sentValues = Array.from({ length: CONCURRENT_PATCHES }, (_, i) => `STRESS-INV-${String(i).padStart(4, '0')}`);
  const t = Date.now();

  const results = await Promise.allSettled(
    sentValues.map((v) => apiPatch(`/api/jobs/${targetId}`, { invoiceNumber: v }))
  );

  console.log(`  Elapsed: ${ms(t)}`);

  const ok  = results.filter(r => r.status === 'fulfilled' && r.value.status === 200).length;
  const err = results.filter(r => r.status === 'rejected' || r.value?.status !== 200).length;
  console.log(`  Responses — 200: ${ok}  errors: ${err}`);

  if (err > 0) fail(`${err} requests returned non-200`);
  else pass('All requests returned 200');

  // Verify the final persisted value is one of the submitted values (not corrupted)
  const jobs = await apiGet('/api/jobs');
  const job  = jobs.find(j => j.id === targetId);
  if (!job) {
    fail('Target job missing from jobs.json after concurrent writes!');
    return;
  }
  if (sentValues.includes(job.invoiceNumber)) {
    pass(`Final invoiceNumber "${job.invoiceNumber}" is a valid submitted value (last-write-wins OK)`);
  } else {
    fail(`Final invoiceNumber "${job.invoiceNumber}" is not one of the submitted values — possible corruption`);
  }
}

/* ================================================================
   TEST 2 — Concurrent POSTs (new records must all survive)
   ================================================================ */
async function testConcurrentPosts() {
  header(`Test 2 — ${CONCURRENT_POSTS} concurrent POSTs (no records should be lost)`);

  const ids = Array.from({ length: CONCURRENT_POSTS }, () => makeGuid());
  const jobs = ids.map((id) => ({
    id,
    ref: `STRESS-${id.slice(0, 6).toUpperCase()}`,
    status: 'printed',
    jobType: 'Stress test',
    jobAssignedTo: 'Stress Bot',
    customer: { name: 'Stress Customer', address: '1 Test St', phone: '0600000000' },
    tech: 't1',
    jobDone: 'Stress test record',
    materials: '',
    invoiceNumber: '',
    invoiceCustomer: 'Stress Customer',
    charges: null,
    date: new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString(),
  }));

  const t = Date.now();
  const results = await Promise.allSettled(jobs.map(j => apiPost('/api/jobs', j)));
  console.log(`  Elapsed: ${ms(t)}`);

  const ok  = results.filter(r => r.status === 'fulfilled' && r.value.status === 201).length;
  const err = results.filter(r => r.status !== 'fulfilled' || r.value.status !== 201).length;
  console.log(`  Responses — 201: ${ok}  errors: ${err}`);

  // Check how many actually landed in jobs.json
  const all   = await apiGet('/api/jobs');
  const found = ids.filter(id => all.some(j => j.id === id)).length;
  const lost  = CONCURRENT_POSTS - found;

  if (found === CONCURRENT_POSTS) {
    pass(`All ${CONCURRENT_POSTS} new records found in jobs.json`);
  } else {
    fail(`${lost} record(s) lost — concurrent POSTs overwrote each other`);
  }

  // Cleanup: delete the stress-test jobs
  await Promise.allSettled(ids.map(id => apiDelete(id)));
  console.log(`  Cleaned up ${ids.length} stress records.`);
}

/* ================================================================
   TEST 3 — Rapid sequential PATCHes (checklist tick simulation)
   All 8 must complete and capturedAt must be stamped.
   ================================================================ */
async function testSequentialPatches(targetId) {
  header(`Test 3 — ${SEQUENTIAL_PATCHES} rapid sequential PATCHes (checklist tick sim)`);

  const taskIds = Array.from({ length: SEQUENTIAL_PATCHES }, (_, i) => `d${i + 1}`);
  const progress = {};
  const timings  = [];
  const t0 = Date.now();

  for (const taskId of taskIds) {
    progress[taskId] = true;
    const t = Date.now();
    const res = await apiPatch(`/api/jobs/${targetId}`, { progress });
    timings.push(Date.now() - t);
    if (res.status !== 200) {
      fail(`PATCH for task ${taskId} returned ${res.status}`);
    }
  }

  const total = Date.now() - t0;
  const avg   = Math.round(timings.reduce((s, n) => s + n, 0) / timings.length);
  const max   = Math.max(...timings);
  console.log(`  Total: ${total} ms  |  avg: ${avg} ms/req  |  slowest: ${max} ms`);

  const ok = timings.filter(t => t < 500).length;
  if (ok === SEQUENTIAL_PATCHES) {
    pass(`All ${SEQUENTIAL_PATCHES} PATCHes completed under 500 ms each`);
  } else {
    fail(`${SEQUENTIAL_PATCHES - ok} PATCHes exceeded 500 ms — server may be queuing`);
  }

  // Verify progress was persisted correctly
  const jobs  = await apiGet('/api/jobs');
  const job   = jobs.find(j => j.id === targetId);
  const ticks = Object.values(job?.progress || {}).filter(Boolean).length;
  if (ticks === SEQUENTIAL_PATCHES) {
    pass(`All ${SEQUENTIAL_PATCHES} progress ticks persisted correctly`);
  } else {
    fail(`Only ${ticks}/${SEQUENTIAL_PATCHES} ticks persisted — writes may have been dropped`);
  }
}

/* ================================================================
   TEST 4 — GET throughput under load (read performance with 1000 records)
   ================================================================ */
async function testGetThroughput() {
  header('Test 4 — GET /api/jobs throughput (10 sequential reads, 1000-record payload)');
  const timings = [];

  for (let i = 0; i < 10; i++) {
    const t = Date.now();
    const jobs = await apiGet('/api/jobs');
    timings.push(Date.now() - t);
    if (i === 0) console.log(`  Record count: ${jobs.length.toLocaleString()}`);
  }

  const avg = Math.round(timings.reduce((s, n) => s + n, 0) / timings.length);
  const max = Math.max(...timings);
  const min = Math.min(...timings);
  console.log(`  Response times — avg: ${avg} ms  |  min: ${min} ms  |  max: ${max} ms`);

  if (avg < 200) {
    pass(`Average GET time ${avg} ms is under 200 ms`);
  } else {
    fail(`Average GET time ${avg} ms exceeds 200 ms — JSON read/parse may be slow at scale`);
  }
}

/* ================================================================
   MAIN
   ================================================================ */
async function main() {
  console.log('Tidewell Admin Panel — API stress test');
  console.log(`Target: ${BASE}\n`);

  // Verify server is up
  let jobs;
  try {
    jobs = await apiGet('/api/jobs');
    console.log(`Connected. ${jobs.length.toLocaleString()} jobs in store.`);
  } catch (e) {
    console.error(`Cannot reach ${BASE}/api/jobs — is the dev server running?\n${e.message}`);
    process.exit(1);
  }

  // Pick a stable target job for patch tests (first job in list)
  const target = jobs[0];
  if (!target) {
    console.error('No jobs found — run seed-jobs.js first.');
    process.exit(1);
  }

  await testGetThroughput();
  await testConcurrentPatches(target.id);
  await testConcurrentPosts();
  await testSequentialPatches(target.id);

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed  ${failed} failed`);
  if (failed > 0) {
    console.log('\nNote: failures are expected on concurrent write tests —');
    console.log('the flat-file API has no locking. See stress test plan for details.');
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
