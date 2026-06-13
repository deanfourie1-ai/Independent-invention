/**
 * seed-jobs.js
 * Backs up data/jobs.json, then adds 1000 synthetic captured (history) jobs.
 * Run: node scripts/seed-jobs.js
 */

import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR   = join(__dirname, '../data');
const DATA_FILE  = join(DATA_DIR, 'jobs.json');
const BACKUP     = join(DATA_DIR, 'jobs.backup.json');

const HISTORY_COUNT = 1000;

/* ---------- tiny helpers (mirrors storage.js exactly) ---------- */
function makeGuid() {
  const h = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${h()}${h()}-${h()}-${h()}-${h()}-${h()}${h()}${h()}`;
}
function refOf(guid) {
  return `JC-${guid.slice(0, 4).toUpperCase()}-${guid.slice(5, 7).toUpperCase()}`;
}

/* ---------- synthetic data pools ---------- */
const FIRST = ['Sam','Dee','Marcus','Priya','Tom','Lena','Chris','Zara','Ben','Aisha'];
const LAST  = ['Smith','Patel','Johnson','Okafor','Raman','Hale','Boyd','Whitfield','Nkosi','Chen'];
const STREETS = ['Oak Ave','Main Rd','Church St','Park Lane','Station Rd','High St','Elm Close','Mill Rd'];
const SUBURBS = ['Bethlehem','Harrismith','Reitz','Vrede','Cornelia','Memel','Warden','Kestell'];
const JOB_TYPES = ['Burst pipe','Geyser replacement','Drain blockage','Leak repair','New installation','Maintenance','Emergency call-out','Quote visit'];
const TECHS  = ['t1','t2','t3','t4','t5'];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randAmount(min, max) { return (randInt(min * 100, max * 100) / 100).toFixed(2); }

function isoDateDaysAgo(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}
function isoDateTimeRandom(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(randInt(7, 17), randInt(0, 59), randInt(0, 59), 0);
  return d.toISOString();
}

function makeSyntheticJob(index) {
  const id   = makeGuid();
  const ref  = refOf(id);
  const tech = rand(TECHS);
  const first = rand(FIRST);
  const last  = rand(LAST);
  const customerName = `${first} ${last}`;
  const daysAgo = randInt(0, 365);
  const jobDate  = isoDateDaysAgo(daysAgo);
  const capturedAt = isoDateTimeRandom(Math.max(0, daysAgo - 1));

  // 30% of jobs bill to a different entity
  const billsDiff = Math.random() < 0.3;
  const invoiceCustomer = billsDiff
    ? `${rand(LAST)} Properties (Pty) Ltd`
    : customerName;

  const callOut = randAmount(350, 850);
  const labour  = randAmount(200, 4200);
  const total   = (parseFloat(callOut) + parseFloat(labour)).toFixed(2);

  return {
    id,
    ref,
    status: 'printed',
    jobType: rand(JOB_TYPES),
    jobAssignedTo: `${rand(FIRST)} ${rand(LAST)}`,
    customer: {
      name:    customerName,
      address: `${randInt(1, 999)} ${rand(STREETS)}, ${rand(SUBURBS)}`,
      phone:   `06${randInt(10000000, 99999999)}`,
    },
    tech,
    jobDone: `Attended to ${rand(JOB_TYPES).toLowerCase()} at customer premises. Work completed satisfactorily.`,
    materials: index % 4 === 0 ? '' : `${randInt(1, 5)}× pipes, ${randInt(1, 3)}× fittings`,
    invoiceNumber: `INV-${randInt(10000, 99999)}`,
    invoiceCustomer,
    charges: {
      callOutFee: `R ${callOut}`,
      labour:     `R ${labour}`,
      materials:  index % 4 === 0 ? '' : `R ${randAmount(50, 600)}`,
      notes:      '',
      total:      `R ${total}`,
    },
    date:       jobDate,
    time:       `${randInt(7, 16)}:${String(randInt(0, 59)).padStart(2, '0')}`,
    photos:     randInt(0, 4),
    printedBy:  'admin',
    printedAt:  new Date(jobDate + 'T12:00:00Z').toLocaleString(),
    updated:    'Captured and printed',
    priority:   Math.random() < 0.1,
    ocrImport:  null,
    imagePath:  null,
    updatedAt:  capturedAt,
    capturedAt,
  };
}

/* ---------- main ---------- */
mkdirSync(DATA_DIR, { recursive: true });

// Backup existing data
let existing = [];
try {
  existing = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  copyFileSync(DATA_FILE, BACKUP);
  console.log(`Backed up ${existing.length} existing job(s) → data/jobs.backup.json`);
} catch {
  console.log('No existing jobs.json found — starting fresh.');
}

console.log(`Generating ${HISTORY_COUNT} synthetic history records…`);
const synthetic = Array.from({ length: HISTORY_COUNT }, (_, i) => makeSyntheticJob(i));

// Existing real jobs at the front (capture queue), synthetic behind them
const merged = [...existing, ...synthetic];
writeFileSync(DATA_FILE, JSON.stringify(merged, null, 2), 'utf-8');

const captured = merged.filter(j => j.capturedAt).length;
const queued   = merged.filter(j => !j.capturedAt).length;

console.log(`Done. Total: ${merged.length} jobs`);
console.log(`  History (capturedAt set): ${captured}`);
console.log(`  Capture queue:            ${queued}`);
console.log(`  File: data/jobs.json`);
