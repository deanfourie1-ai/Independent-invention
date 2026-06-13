import express from 'express';
import path    from 'path';
import fs      from 'fs';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { handleRequest } from './server/api.js';

/* Works in ESM (npm run start) and CJS (esbuild+pkg bundle).
   typeof never throws for undeclared identifiers, so this is safe in ESM. */
// eslint-disable-next-line no-undef
const _dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

const DIST_DIR = path.join(_dirname, 'dist');
const PORT     = 3741;

if (!fs.existsSync(DIST_DIR)) {
  console.error('ERROR: dist/ not found. Run "npm run build" before packaging.');
  process.exit(1);
}

const app = express();

/* API + legacy /uploads/ routes */
app.use((req, res, next) => { handleRequest(req, res, next).catch(next); });

/* React SPA static assets */
app.use(express.static(DIST_DIR));

/* SPA fallback — any unmatched route serves index.html */
app.get('*', (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

app.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Tidewell Admin Panel → ${url}`);
  exec(`start ${url}`, (err) => {
    if (err) console.log('Could not auto-open browser — navigate to the URL above manually.');
  });
});
