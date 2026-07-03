# Code Cleanup Plan

Audit date: 3 July 2026 (post v0.4.1 build, branch `dev-future-build`).

**TLDR:** the codebase is functionally in decent shape — the server API is clean and the
services are focused — but it carries a visible layer of leftovers from the original design
prototype. Roughly **40% of `screens.css` is dead**, there is a **dead component chain**, and
**`src/data/index.js` is mostly fake demo data that live components still import** (including
one latent wrong-technician-name bug). Estimated total: **~10% of the JS/JSX by volume and
~40% of `screens.css` needs to change.**

---

## Findings

### 1. Dead files (delete outright — zero risk)

- `src/admin/FieldMapping.jsx` — imported by nothing.
- `src/components/StatusBadge.jsx` — only imported by FieldMapping, so it dies with it.
- `DASHBOARD_REBUILD_PROMPT.md` — one-off prompt doc from the dashboard rebuild; archive or delete.

### 2. `src/data/index.js` — the biggest smell, and a latent bug

About 130 of its 158 lines are prototype mock data:

- Hardcoded `jobs` array of 19 fake Bristol plumbing jobs — imported by nobody.
- `sageMap` / `statusMeta` — only used by the dead files in item 1.
- Unused exports: `isOpen`, `isFinishedFamily`, `company`, `manager`, `today`.
- **Mock `technicians` map with fake names and PINs — still imported by live components** as a
  fallback (`technicians[job.tech]?.name`):
  - `src/admin/DetailDrawer.jsx:34`
  - `src/admin/Worklist.jsx:21`
  - `src/admin/HistoryPanel.jsx:29` (and line 110, Excel export)

**Latent bug:** the server's real default technician list (`server/api.js`,
`DEFAULT_TECHNICIANS`) uses the *same ids* for *different people* — mock `t1` = "Sam Whitfield",
server `t1` = "Claas". If the fallback ever fires, the UI and the Excel export show a wrong
technician name.

**Fix:** keep `fmtDate` (move it to a small shared date util), delete everything else, and drop
or rewire the `technicians[job.tech]` fallback in the three components above.

### 3. Dead CSS — the largest volume

`src/styles/screens.css` (1,527 lines, 402 classes) still contains the technician field app,
manager planning board, and A4 print-card styles from the wider product prototype, plus
superseded versions of the worklist / history / job-card styles. Verified: current components
use `cap-*` (Worklist, DigitalJobCard) and `tw-*` / `hist-*` (HistoryPanel) classes instead.

- **~163 of 402 classes (~600–700 lines) are deletable**, including the blocks:
  `login*`, `joblist` / `jobcard` / `jc-*`, `filter-tab*`, job-detail (`dt-row`, `sync-chip`,
  `fail-banner`, `locked-strip`), finish-modal / sheet, `kpi*`, `jtable` / `t-*` row classes,
  `recon*` / `tech-row*` / `tr-*`, `mgr-*` planning board, the whole A4 print section
  (`a4*`, `print-stage`, `print-side`, `print-wrap`), old worklist `wl-*` (except `wl-empty`,
  `wl-row-delete` — still used), old `history-*`, old `dj-*`, `admin-mode-tab*`, `tapp*`,
  `ocr-grid` / `ocr-stage-*` / `ocr-doc-state` / `ocr-file-*`, `cap-success` / `capture-layout` /
  `capture-digital` / `capture-checklist-col`.
- `src/styles/core.css`: 13 more dead classes (`role-tabs`, `theme-toggle`, `conn-pill`,
  `brand-mark`, `btn-lg`, `btn-block`, `kbd`, `offline` / `online`, `spacer`, `stage-*`).
- `dashboard.css` and `followups.css` are **fine** — classes flagged by static scan
  (`s-queued`, `tone-*`, `v-*`, `st-*`, `t-*`) are built dynamically
  (`s-${status}`, `tone-${tone}`, …) and are in use. Do not delete.

> Caveat: the unused list came from a static scan; dynamic class construction means each
> deletion should be double-checked, and every tab visually checked afterwards.

### 4. Duplicated logic (consolidate — small effort)

- Month-name array (`MON`) defined 4× client-side (`DashboardPanel.jsx:7`,
  `SettingsPanel.jsx:29`, `followups/helpers.js:5`, `data/index.js` `fmtDate`) plus once
  server-side (`dispDate` in `server/api.js`).
- `refOf` defined in both `src/services/storage.js:10` and `src/data/index.js`.
- OCR localStorage key strings (`tidewell.ocr.endpoint`, `tidewell.ocr.key`) hardcoded in
  3 files: `SettingsPanel.jsx`, `OcrExtractionPanel.jsx`, `ocrQueue.js` — export from one module.
- `server/api.js`: the jobs / onedrive / technicians read-write pairs predate the generic
  `readJsonFile` / `writeJsonFile` helpers and can collapse into them; the upload filename
  sanitising and the Graph PUT URL construction are each written twice. Cosmetic only.
- The follow-ups screen has its own icon set (`followups/icons.jsx`, `FI`, 63 uses) overlapping
  the shared `components/Icon.jsx` — both are loaded on the same screen.
- `nameMatcher.js` vs `techMatcher.js`: **not** duplicates — genuinely different algorithms
  (customer word-overlap vs technician initials/typo matching). Leave as is.

### 5. Monolith files (understandability — optional)

- `src/admin/followups/FollowupsApp.jsx` — 66 KB, 13 components in one file
  (InteractionsTable, FuChip, ImportBand, ActionRow, ActionList, HistoryGroups,
  InteractionsPopup, PrintDoc, CustomerDrawer, TaskModal, DayBar, SettingsModal,
  ImportMapModal + the app itself). Splitting into ~6 files is the single best readability win.
- `OcrExtractionPanel.jsx` (35 KB) and `SettingsPanel.jsx` (23 KB) are large but coherent;
  lower priority.

---

## Action plan

| Phase | Work | Risk | Effort | Status |
|---|---|---|---|---|
| 1. Dead-file deletes | Items 1 + 2: delete FieldMapping, StatusBadge, prompt doc; gut `data/index.js`; fix tech-name fallback | Low | ~1 short session | Not started |
| 2. Dead CSS purge | ~700 lines from `screens.css` + `core.css`, verified class-by-class | Low–medium (visual check of all tabs after) | ~1 session | Not started |
| 3. Consolidation | Shared date util, OCR key constants, server read/write collapse, icon overlap | Low | ~1 short session | Not started |
| 4. Split FollowupsApp | Break into component files, no behaviour change | Medium (pure refactor, big diff) | 1–2 sessions | Not started |

**Verification for every phase:** `npm run build` passes, then click through all four tabs
(Dashboard, OCR, Capture, History) plus Settings and the Follow-ups workspace before committing.
Phases 1–3 get the codebase to "clean and understandable"; phase 4 is the optional deep-clean.
