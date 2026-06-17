# Project memory — Jobtool (Tidewell Admin Panel)

## What this repo is
This repo is the **office admin panel**, branded **"Jobtool"** (package `tidewell-admin-panel`).
It is the *admin recapture* side of the wider Tidewell Plumbing job-card workflow — **not** the
technician field app. The office admin uses it to:
1. **OCR** a scanned paper job card (JPEG or PDF),
2. **review & fix** the extracted fields against the scan,
3. **recapture** the job into **Sage Online** manually via a guided checklist, and
4. browse **history** and **export to Excel**.

Conflict policy (latest edit wins) and the "admin manually recaptures into Sage Online" rule from
the wider product still hold — this app is the tool that makes that manual recapture faster.

## How it ships (confirmed)
- Ships as a **single Windows `.exe`** (`release/jobtoolAdmin-v<version>.exe`) via `@yao-pkg/pkg`.
  The end user needs **no** Node.js / npm / dev tools.
- The `.exe` bundles the React SPA + an Express server + the Node runtime. On launch it serves on
  `http://localhost:3741` (`127.0.0.1`) and auto-opens the browser.
- Versioned by the `"version"` field in `package.json` — bump before packaging. See `DEPLOYMENT.md`
  for delivery and `USER_GUIDE.md` for the end-user walkthrough.

## Architecture
- **Frontend:** React 18 + Vite SPA. Entry `index.html` → `src/main.jsx` → `src/App.jsx` →
  `src/admin/AdminApp.jsx`. Three tabs — **OCR**, **Capture**, **History** — plus a **Settings** panel.
- **Backend API:** all request handling lives in `server/api.js` (`handleRequest`). It is shared by:
  - dev: Vite middleware in `vite.config.js`,
  - prod: `server.js` (ESM entry), bundled to `server.cjs` (esbuild → CJS) and packed into the `.exe`.
  Code is written to run in both ESM and CJS (`typeof __dirname` / `typeof process.pkg` guards).
- **Data store:** plain JSON files in a `data/` folder. When packaged it sits **next to the `.exe`**;
  in dev it's the project-root `data/`. Files: `jobs.json`, `technicians.json`, `onedrive-config.json`.
  Job CRUD is `GET/POST /api/jobs`, `PATCH/DELETE /api/jobs/:id`.
- **Frontend job sync:** `src/services/storage.js` (fetch wrappers + a `tidewell:jobs:changed` event)
  feeding the `useAdminJobs` hook. Jobs in the capture queue have `status: 'printed'`.
- **Checklist state:** capture checklist tasks and per-job tick progress are kept in **browser
  localStorage** (`tidewell.admin.checklist`, `tidewell.admin.captureV2`), not on the server.

## OCR
- Uses **Azure Document Intelligence** (`prebuilt-layout`, API `2024-11-30`) — `src/services/documentIntelligence.js`.
- Endpoint + key are entered in Settings and stored in **browser localStorage**
  (`tidewell.ocr.endpoint`, `tidewell.ocr.key`).
- Parsing/field extraction: `jobCardParser.js`; field layout config: `ocrFieldConfig.js`;
  technician-name fuzzy matching against the saved list: `techMatcher.js` (up to 3 techs per job).

## Image (scan) storage
- Preferred: **OneDrive** via Microsoft Graph (client-credentials flow) when configured in Settings.
  `POST /api/upload-image`, image proxy `GET /api/image/:id`, config at `/api/config/onedrive`
  (+ `/api/config/onedrive/test`). Token cached in `server/api.js`.
- Fallback when OneDrive isn't configured: local `uploads/` folder, served at `/uploads/:filename`.

## Build / run
- `npm run dev` — Vite dev server (API via middleware).
- `npm run build` — Vite build → `dist/`.
- `npm run package` — build → esbuild bundle `server.cjs` → pkg → `release/jobtoolAdmin-v<version>.exe`
  (see `scripts/package-exe.js`).

## Key paths
- `server/api.js` — the entire HTTP API (jobs, OCR config, OneDrive, technicians, uploads).
- `src/admin/` — UI: `AdminApp` (shell/tabs), `OcrExtractionPanel`, `CaptureChecklist`,
  `DigitalJobCard`, `Worklist`, `HistoryPanel`, `DetailDrawer`, `SettingsPanel`, `ChecklistConfig`.
- `src/services/` — `storage`, `documentIntelligence`, `jobCardParser`, `ocrFieldConfig`, `techMatcher`.
- `data/` — runtime JSON store (jobs, technicians, OneDrive config).
