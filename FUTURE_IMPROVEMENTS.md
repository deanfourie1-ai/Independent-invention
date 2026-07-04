# Future improvements

Parking lot for ideas discussed but not yet built. Nothing here is committed work;
it's a reference for when we pick the next thing to tackle.

---

## 1. Risk status / "blacklist" for non-paying customers

A way to flag and reference chronic non-payers so the office can stop doing work
(or extending credit) for them.

### Reframe: tiered risk status, not a binary blacklist
A single on/off "blacklist" is blunt and risky (it wrongly brands someone who is
withholding payment over a legitimate dispute). Use a small ladder instead:

- **Watch** — slipping, keep an eye (amber)
- **Hold** — no further work / no credit until cleared (orange)
- **Blacklisted** — chronic non-payer, refuse / hand to legal (red)
- **Disputed** — *separate* state; not bad faith, must not pollute the risk list

Reuses the coloured-pill pattern already built for the "Fully paid" flag.

### The four design forks

**1. How does a customer land on it — manual, automatic, or hybrid?**
Recommended: **hybrid — system suggests, human confirms.** We can compute a simple
risk score from data we already store:
- oldest invoice age (`days`)
- size of outstanding
- **broken promises** — count of past follow-ups where a promised-to-pay date lapsed
  with no settlement (derivable from interactions)
- **silence** — many logged attempts, never settled
- **repeat offender** — was settled before, now owes again

The tool flags candidates; the admin confirms the tier. Auto-suggest stops it relying
on someone remembering; human-confirm avoids unfair auto-branding.

**2. What does an entry record?**
Tier, **reason code** (broken promises / gone silent / partial-only / refuses /
dispute), free-text note, **who flagged it + when**, outstanding-at-time, and an
optional **review date** ("revisit in 30 days"). The interaction history is the
evidence trail.

**3. Where is it referenced — inform only, or actually block?**
- (a) Pill + a "Risk" filter/group inside follow-ups (easy, self-contained).
- (b) Warning on the **Recapture / job-card side** when capturing a job for a flagged
  customer ("⚠ Flagged: bad payer (Hold)"). This is where it earns its keep — stops
  work *before* it happens.
- (c) Feed it to the technician field app so a job can't even be booked.

Catch: (b)/(c) require recognising "same customer" across the two sides — i.e. the
**customer-identity / matching** problem below. A blacklist is only as good as the
match between a job-card name and the flagged customer.

**4. How do they get off it?**
Auto-clear on full settlement, **but keep the history** ("previously flagged ×2") — a
repeat offender who always pays late is still a risk. Clearing must not erase the
pattern.

### Governance (SA / POPIA)
Keep it explicitly an **internal reference** with an audit trail of who flagged and
why. Not a credit-bureau listing. Reason codes make it defensible ("refused to pay
despite 6 contacts," not just "bad").

### Possible MVP
- Customer-level `risk: { tier, reason, note, by, at, reviewOn }`
- A manual "Flag risk" action in the customer drawer
- Coloured pill on the list + History, and a "Risk" filter
- Auto-suggested candidates from the signals above
- Defer the cross-workspace job-card warning to phase 2 (gated on customer identity)

---

## 2. Re-import should reconcile, not just append

Today "Upload Excel list" appends new invoices and skips invoice numbers it already
has. It never notices invoices that **disappeared** from the new export (= paid) and
never updates a balance that **shrank** (a partial payment). Outstanding totals drift
from reality unless the admin marks everything manually.

**Idea:** make re-import a true reconcile — close invoices that dropped off, update
changed balances. **Risk to handle:** don't wrongly close an invoice that's just
missing because someone exported a *filtered/partial* report (e.g. require a "full
export" confirmation, or only auto-close within the same aging buckets present).

---

## 3. Customer identity / matching key

Dedupe currently keys on the **normalized customer name**. This is fragile — our own
test file proved it: `Engen One Plus (Quote 2438) Dep R8392,12` vs `Engen One Plus`
would import as **two** customers with split histories/balances; meanwhile two
different "J. Smith"s would merge into one.

**Idea:** key identity on a **stable account/customer code** from the export (the
file had a code in column A) instead of the name. Decide the fallback when a row has
no code. This also unlocks cross-workspace matching (job-card ↔ follow-up customer),
which the risk-status warning (1b) depends on.

---

## 4. Multi-user accountability + proactive reminders

Two quiet assumptions today:
- Every interaction is logged as "Admin" — no record of *who* actually chased.
- The tool is passive — an overdue task only surfaces if someone opens the screen.

**Ideas:**
- Per-user identity on the log (login or a "who's logged in" selector) for trust and
  handover. The `by` field already exists in the data model.
- Active nudges — a daily "5 overdue" summary, desktop/email reminder — instead of
  waiting to be checked.

---

## 5. ~~(Minor) Days-overdue is frozen at import time~~ ✅ Done in v0.3.3

~~The `days` value is captured at import and never ages forward.~~

**Implemented:** invoices now store `invoiceDate` (when a date column is mapped) or
`importedDays + importedAt` (when only a days column is mapped). The `invDays(iv)`
helper in `helpers.js` recalculates live on every render.

---

## 6. Home dashboard  *(branch: dev-future-build)*

**Goal:** A landing screen that shows the state of the whole business at a glance before
diving into any tab.

### What it shows
| Card | Data source |
|---|---|
| Jobs awaiting recapture | `jobs.json` — status `printed` |
| Total outstanding (follow-ups) | `customers.json` — sum of unpaid invoices |
| Overdue follow-ups | `interactions` — followUpIso < today |
| Last backup | `backup-log.json` |
| Recent activity feed | Last 5–10 interactions + last 5 job events |

### Components needed
- `src/admin/DashboardPanel.jsx` — new top-level panel
- Stat cards (reusable, takes label + value + tone)
- Recent activity list (merged interactions + job events, sorted newest first)
- Quick-action buttons: "Go to capture queue", "View overdue", "Run OCR"

### API addition
- `GET /api/dashboard` — server aggregates a single payload:
  `{ pendingCapture, totalOutstanding, overdueCount, recentActivity[], lastBackup }`
  Keeps the frontend thin; one fetch on mount.

### Routing change
- Dashboard becomes the default landing view instead of the OCR tab.
- Minor change to `AdminApp.jsx` tab order / default state.

**Estimated scope:** Medium — 1 new panel, 1 API endpoint, minor routing tweak.

---

## 7. Follow-up message templates  *(branch: dev-future-build)*

**Goal:** Pre-written call scripts and WhatsApp/email templates in the log drawer,
auto-filled with customer name, amount, and invoice numbers. One click copies ready
to paste.

### Default templates
| Name | Tone / when to use |
|---|---|
| First contact | Never been contacted before |
| Payment reminder | General overdue chase |
| Final notice | Invoice > 90 days |
| Broken promise | Missed a payment date they committed to |
| Payment confirmed | Logging a receipt |

### Template variables
`{name}` `{contact}` `{amount}` `{invoices}` `{oldestDays}` `{nextFollowUpDate}`

Example:
> Hi {contact}, it's Karin from Bethlehem Plumbers. I'm following up on your balance
> of {amount} on invoice {invoices}. Could we arrange payment this week?

### Data & API
- Defaults hardcoded in `src/admin/followups/templates.js`
- Custom templates stored in `data/templates.json`
- `GET /api/templates` and `PUT /api/templates`

### UI additions
- In `CustomerDrawer`: "Use template" dropdown appears after selecting contact method
- Selecting a template populates the textarea (still editable before saving)
- Template management section inside the follow-ups Settings modal

**Estimated scope:** Medium — new data file, 2 API routes, UI additions to existing drawer.

---

## 8. Cross-reference — job capture ↔ follow-ups  *(branch: dev-future-build)*

**Goal:** The two workflows are currently isolated. A job captured for "Engen Prime
Wimpy" and a follow-up for "Engen Prime Wimpy" are the same customer — the app should
surface that connection.

### Phase A — Job card shows follow-up badge  *(start here)*
When viewing a captured job, show a warning badge if that customer has an open
follow-up:
> ⚠ Engen Prime Wimpy — R 6 750 outstanding · overdue

Links directly to that customer's follow-up drawer.

Implementation: fuzzy name match `job.customer.name` vs `customers[].name` on the
client (extend the `techMatcher.js` approach). Show badge only at match score ≥ 0.8
and `!customer.settled`.

### Phase B — Follow-up drawer shows job history  *(natural extension of A)*
In the customer drawer, a read-only "Job history" section lists captured jobs matching
this customer — ref, date, invoice number, total.

### Phase C — Auto-create follow-up from captured job  *(phase 2, after real-world testing)*
When a captured job's invoice date + N configurable days passes with no payment logged,
automatically create a follow-up task on startup (alongside the backup run). N is set
in Settings (default: 30 days).

### Name matching strategy
- Normalise: lowercase, strip punctuation, collapse whitespace
- Score: exact → 1.0 | all words present → 0.9 | partial overlap → 0.7
- Only surface at ≥ 0.8 to avoid false positives on short/common names

**Estimated scope:** A+B = medium. C = medium-large (new settings field + startup job).

---

## 9. OCR accuracy — 5-step improvement plan (staying on prebuilt-layout)

**Context:** OCR uses Azure Document Intelligence `prebuilt-layout` (REST, API
`2024-11-30`, hard-coded in `src/services/documentIntelligence.js`). The prebuilt
model itself can't be trained — it only improves when Microsoft ships a new
`api-version`. Everything below improves the parts *we* control: what we feed it,
what we request, and how we interpret the response. Ordered so each step feeds
the next — measurement first.

### Step 1 — Accuracy feedback loop *(do first — makes everything else measurable)*
When a reviewed job is saved, store the original OCR-parsed values alongside the
admin's final values (e.g. `ocrSnapshot` on the job record in `jobs.json`). Add a
per-field accuracy readout ("Invoice number: 94% accepted unchanged, Materials:
61%") in Settings or History.
- Where: staged-review save path (`OcrExtractionPanel.jsx` / `stagedDocs.js`),
  job schema via `storage.js`, one read-only aggregation for the report.
- Why first: cheapest step (the data already flows through the save path; we just
  stop discarding half of it) and it turns Steps 2–4 into measured decisions.

### Step 2 — Scan-quality gate at ingest
Use the `averageWordConfidence` already computed in
`normalizeAnalyzeResult()` to flag weak scans immediately after OCR — a "low scan
quality, consider rescanning" banner below a threshold (start ~0.85, tune with
Step 1 data) plus per-field confidence colouring in the review UI.
- Why: a bad scan currently looks identical to a good one until the admin starts
  finding errors mid-review.

### Step 3 — Consume layout data we already pay for: tables, selection marks, handwriting
Extend `normalizeAnalyzeResult()` to pass through `tables[]`, `selectionMarks`,
and `styles` (currently dropped from every response). In `jobCardParser.js`: read
the money fields (call-out fee, labour, materials, total) from the detected table
when present — positional cells beat key-value guessing for that block — and use
handwritten-span styles to discount confidence on handwriting-heavy fields.
- Why: extraction quality gained from response data already in every API result —
  no extra calls, no cost, no tier change.

### Step 4 — Matcher-miss helper in Settings
The `keyMatchers` in `ocrFieldConfig.js` are the ongoing tuning knob, but adding a
variant means hand-writing regex. Keep the last N runs' *unmatched* keyValuePairs
(keys layout found that mapped to no field), show them in the Settings field-config
editor, and offer one-click "add as matcher for [field]".
- Why: turns tuning from a developer task into a 10-second admin task — which is
  what makes "improve over time" survive handover. Builds on Step 1's per-field
  weakness data.

### Step 5 — Preserve a labelled training set (keeps the custom-model exit cheap)
Add a History export bundling, per job, the stored scan reference plus the final
corrected field values (JSON alongside the existing Excel export). Nearly free once
Step 1's snapshot exists.
- Why: if prebuilt-layout plateaus despite Steps 1–4, this archive *is* the
  training data for a custom Document Intelligence model — data collection goes
  from a months-long project to already-done, without committing to anything now.

**Sizing:** Steps 1, 2, 5 small (a focused session each); Steps 3, 4 medium.
Order matters mainly for 1 → 4/5; Steps 2 and 3 can slot in anytime.

**Non-local levers (outside the tool, noted for completeness):** redesign the
printed job card with clearer labels/boxes (keyValuePairs accuracy is largely a
function of form layout), scan at 300 DPI, and — once volume justifies a paid S0
tier — the `queryFields` / `ocrHighResolution` add-on features.

---

## Build order for dev-future-build

| Phase | Feature | Reason |
|---|---|---|
| 1 | Message templates (7) | Self-contained, highest daily value, no dependencies |
| 2 | Cross-reference A+B (8) | Enables dashboard to show richer data |
| 3 | Home dashboard (6) | Most meaningful once cross-ref data exists |
| 4 | Cross-reference C (8) | Needs real-world testing of A+B first |
