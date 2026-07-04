# Prompt: build the Jobtool Dashboard workspace (clean rebuild)

Copy everything below this line into a fresh session on the target branch.

---

Build a **Dashboard workspace** for this repo (Jobtool — Tidewell admin panel). It is the
landing view of the app: business state at a glance, plus a drag-and-drop OCR upload that
processes scanned job cards in the background while the user works elsewhere. Follow this
spec exactly — it encodes decisions already made and tested; don't re-litigate them.

Read `CLAUDE.md` first for the architecture. Key facts you will rely on:
- All HTTP handling lives in `server/api.js` (`handleRequest`), shared by Vite middleware
  (dev) and `server.js` (prod). Data is JSON files in `data/` (`jobs.json`, `customers.json`,
  `interactions.json`, `backup-log.json`). Code must run in both ESM and CJS.
- Frontend: React 18 SPA. `src/App.jsx` switches workspaces; `src/services/storage.js` has
  `createJob`/`patchJob`/`uploadImage` and emits/subscribes a `tidewell:jobs:changed` event.
- OCR is client-side: `src/services/documentIntelligence.js` calls Azure Document
  Intelligence (`prebuilt-layout`, API `2024-11-30`); endpoint/key live in browser
  localStorage (`tidewell.ocr.endpoint`, `tidewell.ocr.key`). `result.parsed.fields` is a
  map of `{ value, confidence, found }` per field. `src/services/techMatcher.js` exports
  `matchTechnicians(raw, techList)`; `src/services/ocrFieldConfig.js` exports
  `loadOcrFieldConfig()`.
- Jobs in the capture queue have `status: 'printed'` and no `capturedAt`; finished jobs
  carry an ISO `capturedAt`. OCR-imported jobs carry an `ocrImport` object
  (`at`, `sourceFileName`, `averageWordConfidence`, `extractedFields`).
- Interactions (follow-ups log) are newest-first; ids embed their epoch (`L-<ms>`); each has
  `customerId`, display `date` ("26 Jun 2026"), `time`, `by`, `did`
  (`call|whatsapp|email|visit|note|task`), optional `dids` array when several methods were
  logged at once, `said`, `followUpIso`, `followUpTime`. Customers have `settled`,
  `invoices[] { no, amount, paid }`.

## 1. Workspace wiring

- `src/admin/WorkspaceSwitch.jsx`: segmented control with three tabs — Dashboard
  (icon `layout`), Recapture (`clipboard`), Follow-ups (`phone`) — rendered in every
  workspace's top bar so the app feels like one shell.
- `src/App.jsx`: workspace state persisted to localStorage key `tidewell.workspace`
  (valid values `dashboard|recapture|followups`), **default `dashboard`**. Render
  `DashboardPanel` with props `workspaceSwitch` (the switch element) and
  `onNavigate(workspaceId)`.

## 2. Server: `GET /api/dashboard` (one aggregated payload)

Add to `server/api.js`. Read jobs, customers, interactions once; return:

- `pendingCapture` — jobs with `status === 'printed' && !capturedAt`.
- `capturedToday` — jobs whose `capturedAt` starts with today's ISO date.
- `totalOutstanding` — over unsettled customers, sum of unpaid invoice amounts.
- Single pass over interactions (they're newest-first) building: `activePlan` = first
  `followUpIso` seen per customer; `contacted` = Set of customerIds with any non-`task`
  entry. Then: `overdueCount` (unsettled, has plan, plan < today), `needsFirst`
  (unsettled, not in contacted), `openFollowups` (unsettled with any unpaid invoice).
  Do NOT rescan interactions per customer — use the Set.
- `recentActivity` — merged feed, newest first, top 10, of:
  - non-`task` interactions → `{ id, ts, customerName, did, dids, date, said, by }`
    (ts from the `L-<ms>` id; fall back to `Date.parse(date + ' ' + time)`);
  - job events: per job, if `capturedAt` → did `'captured'`, said
    `` `Job ${ref} · R ${charges.total} captured into Sage` ``, by `'Admin'`; if
    `ocrImport?.at` → did `'scanned'`, said `` `Job card ${ref} imported from ${sourceFileName}` ``,
    by `'OCR'`. Give each a display `date` formatted like the interactions ("26 Jun 2026").
  - Sort by `ts` desc, slice 10.
- `lastBackup` — parsed `backup-log.json` or null.

## 3. Frontend: `src/admin/DashboardPanel.jsx`

Top bar identical to the other workspaces (Brand block, the workspace switch, a refresh
icon-button). Body inside `div.db-scroll > div.db-wrap`.

**Data lifecycle** — one `load(silent = false)` that fetches `/api/dashboard`; throws on
`!res.ok`. Non-silent sets a `loading` flag (used only for the very first paint and the
refresh button spinner). On success store data + `refreshed` timestamp; on failure set a
`stale` flag but keep showing the last data. Refresh triggers: mount; every 60s
(silent); window `focus` (silent); `subscribeJobsChanged` from storage.js (silent — so
background OCR imports bump the numbers live). Clean all of them up on unmount.

**Header row**: `tw-h1` "Dashboard", `tw-sub` with today's date ("2 Jul 2026") and
"· updated HH:MM" from a real time formatter (never slice a formatted date string). When
`stale && data`: small red note "Couldn't refresh — showing last loaded data".

**Stat cards** (4, clickable `<button class="db-stat t-{tone}">`):
| Card | Value | Note | Tone | Click |
|---|---|---|---|---|
| In capture queue | pendingCapture | "N captured today" else "Jobs awaiting recapture" | >5 amber, >0 brand, 0 green | recapture |
| Open follow-ups | openFollowups | "R X outstanding" (en-ZA format) else "All accounts clear" | >0 brand, 0 green | followups |
| Overdue follow-ups | overdueCount | "Past their scheduled date" | >0 danger, 0 green | followups |
| Need first contact | needsFirst | "No interaction logged yet" | >0 amber, 0 green | followups |

**Quick actions**: two `tw-btn`s — "Go to capture queue (N)" and "View follow-ups · N
overdue".

**Recent activity card**: header "Recent activity" + small "View all" button → followups.
Each row: customer name + date on the left (fixed ~160px), then one colored `.verb v-<did>`
chip **per entry in `dids ?? [did]`** (labels: Called, WhatsApp, Emailed, Visited, Note,
Captured, Scanned) followed by the `said` text (truncate ~110 chars), and `by` on the
right. Empty state: "No activity yet."

**Backup footer**: quiet centered line — check/alert icon, "Last backup <date> · OneDrive/
Local folder", error text if failed.

**States**: first load → centered spinner; fetch failed with no data → the scan card still
renders, then a `tw-empty` "Could not load dashboard data." message.

## 4. Background OCR from the dashboard

Azure Document Intelligence **free (F0) tier real limits** (verified against Microsoft
docs — do not trust other numbers): 1 analyze POST/sec, 1 GET/sec (poll no faster than
every 2s), only first 2 pages read per request, 4 MB max document, 500 pages/month.

**`src/services/ocrUsage.js`** — monthly page counter in localStorage key
`tidewell.ocr.usage.v1` as `{ month: 'YYYY-MM', pages }`; auto-resets when the month
changes. Export `FREE_TIER_PAGES = 500`, `WARN_AT_PAGES = 450`, `getOcrUsage()`,
`recordOcrPages(n)` (dispatches window event `tidewell:ocrusage:changed`),
`subscribeOcrUsage(fn)`.

**`src/services/documentIntelligence.js`** — set poll interval to 2000ms, and after each
successful analyze call `recordOcrPages(uniquePageNumbersInWords || 1)` so both the OCR
tab and the background queue count against the same allowance.

**`src/services/ocrQueue.js`** — module-singleton queue (survives workspace switches; lost
on browser close, by design). Item: `{ id, fileName, mimeType, size, dataUrl, status:
'queued'|'processing'|'done'|'error', error, jobRef, needsReview }`. Exports
`getOcrQueue()`, `subscribeOcrQueue(fn)` (window event `tidewell:ocrqueue:changed`),
`clearFinishedOcr()`, `enqueueOcrFiles(fileList)`.
- Enqueue validation (rejected files become `error` items with plain-English reasons):
  mime must match `image/*` or `application/pdf`; size ≤ 4 MB ("Over the 4 MB Azure
  free-tier size limit — rescan at a lower resolution.").
- Sequential pump (one in flight): if endpoint/key missing, fail all queued items with
  "Azure OCR is not configured — open Settings (gear icon in Recapture) first." Space
  analyze submissions ≥1500ms apart (module-level `lastSubmitAt`). On errors matching
  `/429|too many requests|throttl/i` retry after 5s, then 15s, then give up.
- On success, **auto-create a capture record** (same shape the OCR tab creates —
  reference its `createCaptureRecord`): normalize the OCR date (d/m/y → ISO); validate it
  is a real calendar date; fuzzy-match technicians via `/api/technicians` +
  `matchTechnicians`; upload the scan via `uploadImage` (failure non-fatal); `createJob`
  with `status 'printed'`, `jobType 'OCR import - admin capture required'`, charges/customer
  fields from `result.parsed.fields`, and `ocrImport { at, sourceFileName,
  averageWordConfidence, extractedFields, needsReview, reviewReasons }`.
  `needsReview` is true when the date is invalid (create anyway with `date: ''`) or
  `averageWordConfidence < 0.65`; put human-readable reasons in `reviewReasons`.
- Mark item `done` with the created `ref`, clear its `dataUrl` (free memory).

**Dashboard scan card** (renders even while stats are loading/failed): `db-card` titled
"Scan job cards"; right side shows "N / 500 free pages this month" + a tiny progress
meter, both turning red/bold from 450. Below: a dashed drop zone (`db-drop`) — click opens
a hidden multi-file input (`accept="image/*,application/pdf"`), dragover highlights it,
drop enqueues. Copy: "**Drop scanned job cards here** or click to choose files" + hint
"JPEG, PNG or PDF · max 4 MB each · they process in the background while you work". Under
it, one row per queue item: status icon (clock / spinning sync / green check / red alert),
bold filename (ellipsis), status text ("Waiting…", "Reading the scan…", "Added to capture
queue as JC-XXXX-XX", "— flagged: check fields" in amber, or the error in red). Footer:
"N still processing — you can carry on working" / "All done" + a "Clear finished" button.

**`src/admin/Worklist.jsx`** — in the queue item subtitle, when `job.ocrImport?.needsReview`,
render a small amber "CHECK OCR" chip whose `title` tooltip is the joined `reviewReasons`.

## 5. Styling — `src/styles/dashboard.css` (import in `main.jsx` after followups.css)

Match the existing design system; **derive every color from `core.css` tokens** (`--surface`,
`--line`, `--ink-*`, `--brand-bg`, `--amber-bg`, `--danger-bg`, `--green-bg`, `--radius`,
`--shadow-sm/md`) so dark mode works free. Known traps: `.tw-card` has **no padding** —
give dashboard cards their own (`db-card`: surface bg, 1px `--line` border, `--radius`,
`--shadow-sm`, `padding 16px 18px`); the `.verb`/`.v-call` etc. chip classes in
followups.css are global — reuse them, adding `.v-captured` (finished blue) and
`.v-scanned` (violet) here.

- `.db-wrap`: `max-width 1760px`, centered, `padding 22px 28px 44px` — fills a 1920px
  screen with gutters.
- `.db-grid`: `repeat(auto-fit, minmax(215px, 1fr))` stat grid.
- `.db-stat`: white card, 30px pastel icon "bubble" (brand/green/amber/danger bg tokens),
  uppercase 11px label in `--ink-3`, 27px/800 tabular number (amber/danger value colors on
  those tones only), 12px note in `--ink-2`; hover lifts (`--shadow-md`, translateY(-1px)).
- `.db-cols`: single column by default; at `min-width:1140px` becomes
  `minmax(430px,5fr) 7fr` — scan card + quick actions left, activity right.
- Drop zone: `--surface-2` bg, 1.5px dashed `--line-strong`, radius 12; hover/dragover →
  brand border + `--brand-bg`; 38px brand icon bubble.
- Activity/queue rows separated by 1px `--line` top borders, no outer table.

## 6. Acceptance checks

1. `npm run build` clean; `node server.js` serves at :3741.
2. `curl /api/dashboard` returns all keys; a job with `capturedAt` appears in
   `recentActivity` interleaved by timestamp among interactions.
3. POST an interaction with `"dids": ["call","whatsapp"]` → feed row shows two chips.
4. Drop an oversized/wrong-type file → immediate friendly error row, no Azure call.
5. With Azure configured: drop 2–3 scans, switch to Follow-ups and back — queue keeps
   processing; each lands in the capture queue (Recapture tab) with the scan attached;
   invalid-date/low-confidence ones show the amber CHECK OCR chip; the "In capture queue"
   stat updates without a manual refresh; the page counter increments.
6. Narrow the window below ~1140px → layout stacks to one column; stat grid wraps.
