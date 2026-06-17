import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/* Works in ESM (npm run dev / npm run start) and CJS (esbuild+pkg bundle). */
// eslint-disable-next-line no-undef
const _dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

/* ── Runtime paths ──────────────────────────────────────────
   When running as a pkg .exe, data files must live next to the
   executable (readable/writable at runtime).  In dev they live
   in the project root, one level above this file.               */
const isPkg      = typeof process.pkg !== 'undefined';
const DATA_DIR   = isPkg
  ? path.join(path.dirname(process.execPath), 'data')
  : path.join(_dirname, '..', 'data');
const UPLOADS_DIR = isPkg
  ? path.join(path.dirname(process.execPath), 'uploads')
  : path.join(_dirname, '..', 'uploads');
const DATA_FILE   = path.join(DATA_DIR, 'jobs.json');
const CONFIG_FILE = path.join(DATA_DIR, 'onedrive-config.json');
const TECHS_FILE  = path.join(DATA_DIR, 'technicians.json');
const CUSTOMERS_FILE    = path.join(DATA_DIR, 'customers.json');
const INTERACTIONS_FILE = path.join(DATA_DIR, 'interactions.json');

const DEFAULT_TECHNICIANS = [
  { id: 't1', name: 'Claas' },
  { id: 't2', name: 'Daniel' },
  { id: 't3', name: 'Elias' },
  { id: 't4', name: 'Mokete' },
  { id: 't5', name: 'Michael' },
  { id: 't6', name: 'Adolf' },
  { id: 't7', name: 'Katleho' },
  { id: 't8', name: 'Steyn' },
];

/* ── Jobs store ─────────────────────────────────────────── */
function readJobs() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); } catch { return []; }
}
function writeJobs(jobs) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(jobs, null, 2), 'utf-8');
}

/* ── OneDrive config store ──────────────────────────────── */
function readOneDriveConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); } catch { return null; }
}
function writeOneDriveConfig(config) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}
function isOneDriveReady(cfg) {
  return !!(cfg?.tenantId && cfg?.clientId && cfg?.clientSecret && cfg?.userId);
}

/* ── Technicians store ──────────────────────────────────── */
function readTechnicians() {
  try { return JSON.parse(fs.readFileSync(TECHS_FILE, 'utf-8')); }
  catch { return DEFAULT_TECHNICIANS; }
}
function writeTechnicians(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(TECHS_FILE, JSON.stringify(list, null, 2), 'utf-8');
}

/* ── Customer follow-ups store (customers + interactions) ──
   Seeded on first run so the screen isn't empty; once the file
   exists (even as []), the seed is no longer applied.            */
const DEFAULT_CUSTOMERS = [
  { id: 'C-1042', name: 'Pretoria Glassworks', contact: 'Thabo Mokoena', phone: '012 804 9920', email: 'accounts@pretoriaglass.co.za',
    invoices: [ { no: 'INV-0741', amount: 23800, days: 118 }, { no: 'INV-0802', amount: 4200, days: 22 } ] },
  { id: 'C-1067', name: 'Harbour Holdings', contact: 'René Adams', phone: '021 419 6700', email: 'finance@harbourholdings.co.za',
    invoices: [ { no: 'INV-0765', amount: 16700, days: 74 }, { no: 'INV-0788', amount: 5400, days: 40 } ] },
  { id: 'C-1019', name: 'Coastal Rentals (Pty) Ltd', contact: 'M. Venter', phone: '021 788 2245', email: 'ar@coastalrentals.co.za',
    invoices: [ { no: 'INV-0771', amount: 8600, days: 41 } ] },
  { id: 'C-1088', name: 'R. Abrahams', contact: 'Riaan Abrahams', phone: '083 421 0098', email: 'rabrahams@gmail.com',
    invoices: [ { no: 'INV-0754', amount: 5400, days: 96 } ] },
  { id: 'C-1055', name: 'Greenfield Estate', contact: 'Body Corporate', phone: '021 905 7781', email: 'manager@greenfieldestate.co.za',
    invoices: [ { no: 'INV-0758', amount: 6750, days: 38 } ] },
  { id: 'C-1073', name: 'T. Naidoo', contact: 'Trevor Naidoo', phone: '072 660 1184', email: null,
    invoices: [ { no: 'INV-0761', amount: 3100, days: 58 } ] },
  { id: 'C-1061', name: 'Dlamini Residence', contact: 'N. Dlamini', phone: '078 220 3345', email: 'n.dlamini@outlook.com',
    invoices: [ { no: 'INV-0768', amount: 920, days: 47 } ] },
  { id: 'C-1003', name: 'François Balbi', contact: 'François Balbi', phone: '082 555 1102', email: 'francois@balbi.co.za',
    invoices: [ { no: 'INV-0789', amount: 1240, days: 33 } ] },
];

const DEFAULT_INTERACTIONS = [
  { id: 'L-3007', customerId: 'C-1067', date: '5 Jun 2026', time: '15:40', by: 'Sam Whitfield', did: 'visit', invoice: 'INV-0765',
    said: "Dropped invoice copies at Dock House reception. René to confirm what's already been paid.", followUpIso: '2026-06-11', followUpTime: '11:30' },
  { id: 'L-3006', customerId: 'C-1019', date: '5 Jun 2026', time: '14:02', by: 'Naledi Khoza', did: 'email', invoice: 'INV-0771',
    said: 'Emailed statement + 30-day reminder to ar@coastalrentals.co.za. No reply yet.', followUpIso: '2026-06-13', followUpTime: '09:00' },
  { id: 'L-3005', customerId: 'C-1042', date: '2 Jun 2026', time: '10:24', by: 'Sam Whitfield', did: 'call', invoice: 'INV-0741',
    said: 'Spoke to Thabo — promised EFT for the full R 23 800 on INV-0741 by 15 Jun. Re-check after the 15th.', followUpIso: '2026-06-16', followUpTime: '10:00' },
  { id: 'L-3004', customerId: 'C-1067', date: '26 May 2026', time: '09:10', by: 'Sam Whitfield', did: 'call', invoice: 'INV-0788',
    said: 'Called René about the newer INV-0788 too — will bundle both onto the next payment run.', followUpIso: null, followUpTime: null },
  { id: 'L-3003', customerId: 'C-1042', date: '20 May 2026', time: '11:48', by: 'Naledi Khoza', did: 'email', invoice: null,
    said: 'Emailed a combined statement covering both INV-0741 and the new INV-0802.', followUpIso: null, followUpTime: null },
  { id: 'L-3002', customerId: 'C-1042', date: '8 May 2026', time: '16:05', by: 'Naledi Khoza', did: 'note', invoice: 'INV-0802',
    said: 'INV-0802 raised and added to the account — flagged to chase with the older balance.', followUpIso: null, followUpTime: null },
];

function readJsonFile(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return fallback; }
}
function writeJsonFile(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}
const readCustomers    = () => readJsonFile(CUSTOMERS_FILE, DEFAULT_CUSTOMERS);
const readInteractions = () => readJsonFile(INTERACTIONS_FILE, DEFAULT_INTERACTIONS);

/* ── Graph API token cache ──────────────────────────────── */
let _tok = { token: null, expiresAt: 0 };

async function getGraphToken(cfg) {
  if (_tok.token && Date.now() < _tok.expiresAt - 60_000) return _tok.token;
  const res = await fetch(
    `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     cfg.clientId,
        client_secret: cfg.clientSecret,
        scope:         'https://graph.microsoft.com/.default',
      }).toString(),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token request failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  _tok = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return _tok.token;
}

function invalidateTokenCache() { _tok = { token: null, expiresAt: 0 }; }

/* ── OneDrive upload ────────────────────────────────────── */
async function uploadToOneDrive(cfg, buffer, fileName, mimeType) {
  const token    = await getGraphToken(cfg);
  const folder   = (cfg.folder || 'tidewell-scans').replace(/^\/|\/$/g, '');
  const safeName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const userRef  = encodeURIComponent(cfg.userId);
  const url = `https://graph.microsoft.com/v1.0/users/${userRef}/drive/root:/${folder}/${safeName}:/content`;

  const res = await fetch(url, {
    method:  'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType || 'application/octet-stream' },
    body:    buffer,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OneDrive upload failed (${res.status}): ${err}`);
  }
  const item = await res.json();
  return { oneDriveItemId: item.id };
}

/* ── HTTP helpers ───────────────────────────────────────── */
function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { const text = Buffer.concat(chunks).toString('utf-8'); resolve(text ? JSON.parse(text) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

/* ── Main request handler ───────────────────────────────── */
export async function handleRequest(req, res, next) {
  const url    = (req.url || '').split('?')[0];
  const method = req.method || '';

  /* backward-compat: local uploads served at /uploads/:filename */
  if (url.startsWith('/uploads/') && method === 'GET') {
    const fileName = url.slice('/uploads/'.length).split('/')[0];
    if (fileName) {
      const filePath = path.join(UPLOADS_DIR, fileName);
      if (fs.existsSync(filePath)) {
        const ext  = path.extname(fileName).toLowerCase();
        const mime = { '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.pdf':'application/pdf' }[ext] || 'application/octet-stream';
        const data = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': mime, 'Content-Length': data.length });
        res.end(data);
        return;
      }
    }
    return next();
  }

  if (!url.startsWith('/api/')) return next();

  const segment  = url.slice(5);
  const parts    = segment.split('/');
  const resource = parts[0];
  const id       = parts[1] || null;

  try {
    /* ── jobs ─────────────────────────────────────────── */
    if (resource === 'jobs') {
      if (method === 'GET' && !id)  return send(res, 200, readJobs());

      if (method === 'POST' && !id) {
        const body = await collectBody(req);
        const jobs = readJobs();
        jobs.unshift(body);
        writeJobs(jobs);
        return send(res, 201, body);
      }

      if (method === 'PATCH' && id) {
        const body = await collectBody(req);
        const jobs = readJobs();
        const idx  = jobs.findIndex(j => j.id === id);
        if (idx === -1) return send(res, 404, { error: 'Not found' });
        jobs[idx] = { ...jobs[idx], ...body, updatedAt: new Date().toISOString() };
        writeJobs(jobs);
        return send(res, 200, jobs[idx]);
      }

      if (method === 'DELETE' && id) {
        const jobs = readJobs();
        const idx  = jobs.findIndex(j => j.id === id);
        if (idx === -1) return send(res, 404, { error: 'Not found' });
        const [removed] = jobs.splice(idx, 1);
        writeJobs(jobs);
        return send(res, 200, removed);
      }
    }

    /* ── image proxy (OneDrive) ───────────────────────── */
    if (resource === 'image' && id && method === 'GET') {
      const cfg = readOneDriveConfig();
      if (!isOneDriveReady(cfg)) return send(res, 404, { error: 'OneDrive not configured' });
      const token    = await getGraphToken(cfg);
      const userRef  = encodeURIComponent(cfg.userId);
      const graphRes = await fetch(
        `https://graph.microsoft.com/v1.0/users/${userRef}/drive/items/${id}/content`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!graphRes.ok) return send(res, graphRes.status, { error: 'Image not found in OneDrive' });
      const contentType = graphRes.headers.get('content-type') || 'image/jpeg';
      const imgBuf      = Buffer.from(await graphRes.arrayBuffer());
      res.writeHead(200, { 'Content-Type': contentType, 'Content-Length': imgBuf.length, 'Cache-Control': 'private, max-age=3600' });
      res.end(imgBuf);
      return;
    }

    /* ── upload image ─────────────────────────────────── */
    if (resource === 'upload-image' && method === 'POST') {
      const body = await collectBody(req);
      const { fileName, base64, mimeType } = body;
      if (!base64 || !fileName) return send(res, 400, { error: 'fileName and base64 required' });

      const buffer = Buffer.from(base64, 'base64');
      const cfg    = readOneDriveConfig();

      if (isOneDriveReady(cfg)) {
        const result = await uploadToOneDrive(cfg, buffer, fileName, mimeType);
        return send(res, 200, result);
      }

      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      const safeName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const filePath = path.join(UPLOADS_DIR, safeName);
      fs.writeFileSync(filePath, buffer);
      return send(res, 200, { filePath: `uploads/${safeName}` });
    }

    /* ── OneDrive config ──────────────────────────────── */
    if (resource === 'config' && id === 'onedrive') {
      if (method === 'GET' && parts[2] === 'test') {
        const cfg = readOneDriveConfig();
        if (!isOneDriveReady(cfg)) {
          return send(res, 200, { ok: false, error: 'OneDrive credentials are not fully configured.' });
        }
        try {
          const token    = await getGraphToken(cfg);
          const userRef  = encodeURIComponent(cfg.userId);
          const driveRes = await fetch(
            `https://graph.microsoft.com/v1.0/users/${userRef}/drive`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (!driveRes.ok) {
            const err = await driveRes.json().catch(() => ({}));
            throw new Error(err?.error?.message || `Status ${driveRes.status}`);
          }
          const drive = await driveRes.json();
          return send(res, 200, {
            ok:        true,
            driveName: drive.name || 'OneDrive',
            owner:     drive.owner?.user?.displayName || cfg.userId,
            used:      drive.quota?.used  ?? null,
            total:     drive.quota?.total ?? null,
          });
        } catch (err) {
          return send(res, 200, { ok: false, error: err.message });
        }
      }

      if (method === 'GET') {
        const cfg = readOneDriveConfig();
        if (!cfg) return send(res, 200, { configured: false });
        return send(res, 200, {
          configured:       true,
          tenantId:         cfg.tenantId  || '',
          clientId:         cfg.clientId  || '',
          secretConfigured: !!(cfg.clientSecret),
          userId:           cfg.userId    || '',
          folder:           cfg.folder    || 'tidewell-scans',
        });
      }

      if (method === 'POST') {
        const body     = await collectBody(req);
        const existing = readOneDriveConfig() || {};
        writeOneDriveConfig({
          tenantId:     (body.tenantId     || '').trim(),
          clientId:     (body.clientId     || '').trim(),
          clientSecret: body.clientSecret  ? body.clientSecret.trim() : (existing.clientSecret || ''),
          userId:       (body.userId       || '').trim(),
          folder:       (body.folder       || 'tidewell-scans').trim(),
        });
        invalidateTokenCache();
        return send(res, 200, { ok: true });
      }
    }

    /* ── technicians ──────────────────────────────────── */
    if (resource === 'technicians') {
      if (method === 'GET' && !id) return send(res, 200, readTechnicians());

      if (method === 'POST' && !id) {
        const list = await collectBody(req);
        if (!Array.isArray(list)) return send(res, 400, { error: 'Expected array' });
        writeTechnicians(list);
        return send(res, 200, list);
      }
    }

    /* ── customers (follow-ups) ───────────────────────── */
    if (resource === 'customers') {
      if (method === 'GET' && !id) return send(res, 200, readCustomers());

      if (method === 'PUT' && !id) {
        const list = await collectBody(req);
        if (!Array.isArray(list)) return send(res, 400, { error: 'Expected array' });
        writeJsonFile(CUSTOMERS_FILE, list);
        return send(res, 200, list);
      }

      if (method === 'POST' && !id) {
        const body = await collectBody(req);
        const list = readCustomers();
        list.push(body);
        writeJsonFile(CUSTOMERS_FILE, list);
        return send(res, 201, body);
      }

      if (method === 'PATCH' && id) {
        const body = await collectBody(req);
        const list = readCustomers();
        const idx  = list.findIndex((c) => c.id === id);
        if (idx === -1) return send(res, 404, { error: 'Not found' });
        list[idx] = { ...list[idx], ...body };
        writeJsonFile(CUSTOMERS_FILE, list);
        return send(res, 200, list[idx]);
      }

      if (method === 'DELETE' && id) {
        const list = readCustomers();
        const idx  = list.findIndex((c) => c.id === id);
        if (idx === -1) return send(res, 404, { error: 'Not found' });
        const [removed] = list.splice(idx, 1);
        writeJsonFile(CUSTOMERS_FILE, list);
        return send(res, 200, removed);
      }
    }

    /* ── interactions (follow-ups log) ────────────────── */
    if (resource === 'interactions') {
      if (method === 'GET' && !id) return send(res, 200, readInteractions());

      if (method === 'POST' && !id) {
        const body = await collectBody(req);
        const list = readInteractions();
        list.unshift(body); // newest first
        writeJsonFile(INTERACTIONS_FILE, list);
        return send(res, 201, body);
      }
    }

    send(res, 404, { error: 'Unknown API route' });
  } catch (err) {
    send(res, 500, { error: err.message || 'Internal server error' });
  }
}
