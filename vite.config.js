import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'jobs.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

function readJobs() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeJobs(jobs) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(jobs, null, 2), 'utf-8');
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function localApiPlugin() {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0];
        const method = req.method || '';

        if (!url.startsWith('/api/')) return next();

        const segment = url.slice(5);
        const parts = segment.split('/');
        const resource = parts[0];
        const id = parts[1] || null;

        try {
          if (resource === 'jobs') {
            if (method === 'GET' && !id) {
              return send(res, 200, readJobs());
            }

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
              const idx = jobs.findIndex((j) => j.id === id);
              if (idx === -1) return send(res, 404, { error: 'Not found' });
              jobs[idx] = { ...jobs[idx], ...body, updatedAt: new Date().toISOString() };
              writeJobs(jobs);
              return send(res, 200, jobs[idx]);
            }

            if (method === 'DELETE' && id) {
              const jobs = readJobs();
              const idx = jobs.findIndex((j) => j.id === id);
              if (idx === -1) return send(res, 404, { error: 'Not found' });
              const [removed] = jobs.splice(idx, 1);
              writeJobs(jobs);
              return send(res, 200, removed);
            }
          }

          if (resource === 'upload-image' && method === 'POST') {
            const body = await collectBody(req);
            const { fileName, base64, mimeType } = body;
            if (!base64 || !fileName) return send(res, 400, { error: 'fileName and base64 required' });

            fs.mkdirSync(UPLOADS_DIR, { recursive: true });
            const safeName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            const filePath = path.join(UPLOADS_DIR, safeName);
            fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
            return send(res, 200, { filePath: `uploads/${safeName}` });
          }

          send(res, 404, { error: 'Unknown API route' });
        } catch (err) {
          send(res, 500, { error: err.message || 'Internal server error' });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localApiPlugin()],
});
