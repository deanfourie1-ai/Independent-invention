/* Background OCR queue — files dropped on the dashboard land here and are
   processed one at a time while the user works elsewhere in the app. Each
   successful scan is handed to the OCR tab's staged-documents list as
   'ready', where the admin reviews the extracted fields before creating a
   capture record. Nothing enters the capture queue without review.

   Rate limiting keeps the Azure free (F0) tier happy — handled centrally in
   documentIntelligence.analyzeJobCardImageQueued (spaced submissions plus
   automatic waits on "call rate limit ... retry after N seconds" responses),
   so a big batch simply takes longer instead of erroring out.

   The queue lives in module state: it keeps running while the user switches
   workspaces, but is abandoned if the browser tab closes (by design). */

import { analyzeJobCardImageQueued } from './documentIntelligence';
import { loadOcrFieldConfig } from './ocrFieldConfig';
import { addStagedDocs, makeStagedDoc } from './stagedDocs';

/* localStorage keys for the Azure OCR credentials — set in Settings, read here.
   Exported so every consumer shares the one definition. */
export const OCR_ENDPOINT_KEY = 'tidewell.ocr.endpoint';
export const OCR_API_KEY_KEY = 'tidewell.ocr.key';
const CHANGED_EVENT = 'tidewell:ocrqueue:changed';
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ACCEPTED_MIME = /^(image\/|application\/pdf)/i;
/* Finished rows leave the dashboard list on their own once the document is
   safely in the OCR tab — long enough to read the confirmation. */
const DONE_LINGER_MS = 6000;

let items = [];
let pumping = false;

const readLocal = (key) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };
const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

function emit() { window.dispatchEvent(new CustomEvent(CHANGED_EVENT)); }

export function getOcrQueue() { return items.slice(); }

export function subscribeOcrQueue(listener) {
  window.addEventListener(CHANGED_EVENT, listener);
  return () => window.removeEventListener(CHANGED_EVENT, listener);
}

export function clearFinishedOcr() {
  items = items.filter((i) => i.status === 'queued' || i.status === 'processing');
  emit();
}

function update(id, patch) {
  items = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
  emit();
}

function removeItem(id) {
  items = items.filter((i) => i.id !== id);
  emit();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

function dataUrlToFile(dataUrl, fileName, mimeType) {
  const base64 = String(dataUrl || '').split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], fileName, { type: mimeType });
}

export async function enqueueOcrFiles(fileList) {
  const files = Array.from(fileList || []);
  for (const f of files) {
    const base = { id: makeId(), fileName: f.name || 'Scanned document', note: '', error: '' };
    if (!ACCEPTED_MIME.test(f.type || '')) {
      items = [...items, { ...base, status: 'error', error: 'Not a supported file — use JPEG, PNG or PDF.' }];
      continue;
    }
    if (f.size > MAX_FILE_BYTES) {
      items = [...items, { ...base, status: 'error', error: 'Over the 4 MB Azure free-tier size limit — rescan at a lower resolution.' }];
      continue;
    }
    try {
      const dataUrl = await fileToDataUrl(f);
      items = [...items, { ...base, mimeType: f.type || 'application/octet-stream', size: f.size, dataUrl, status: 'queued' }];
    } catch (err) {
      items = [...items, { ...base, status: 'error', error: err?.message || 'Could not read the file.' }];
    }
  }
  emit();
  pump();
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const next = items.find((i) => i.status === 'queued');
      if (!next) break;

      const endpoint = readLocal(OCR_ENDPOINT_KEY);
      const apiKey = readLocal(OCR_API_KEY_KEY);
      if (!endpoint || !apiKey) {
        items = items.map((i) => (i.status === 'queued'
          ? { ...i, status: 'error', error: 'Azure OCR is not configured — open Settings (gear icon in Recapture) first.' }
          : i));
        emit();
        break;
      }

      update(next.id, { status: 'processing', note: '' });
      try {
        const fieldConfig = loadOcrFieldConfig();
        const file = dataUrlToFile(next.dataUrl, next.fileName, next.mimeType);
        const result = await analyzeJobCardImageQueued({
          endpoint,
          apiKey,
          file,
          fieldConfig,
          onWait: (delayMs) => update(next.id, {
            note: `Azure rate limit — retrying in ${Math.ceil(delayMs / 1000)}s, it stays queued…`,
          }),
        });

        // Hand the finished scan to the OCR tab for review (fields prefilled
        // the same way the tab's own "Run OCR" does).
        const editedValues = Object.fromEntries(
          Object.entries(result?.parsed?.fields || {}).map(([key, field]) => [key, field.value || ''])
        );
        addStagedDocs([makeStagedDoc({
          fileName: next.fileName,
          mimeType: next.mimeType,
          size: next.size,
          dataUrl: next.dataUrl,
          status: 'ready',
          result,
          editedValues,
        })]);

        // Drop the file payload once handed over — no reason to hold MBs here.
        update(next.id, { status: 'done', note: '', dataUrl: '' });
        setTimeout(() => removeItem(next.id), DONE_LINGER_MS);
      } catch (err) {
        update(next.id, { status: 'error', note: '', error: err?.message || 'OCR failed.' });
      }
    }
  } finally {
    pumping = false;
  }
}
