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

    send(res, 404, { error: 'Unknown API route' });
  } catch (err) {
    send(res, 500, { error: err.message || 'Internal server error' });
  }
}
