/* Background OCR queue — files dropped on the dashboard land here and are
   processed one at a time while the user works elsewhere in the app. Each
   successful scan is auto-created as a capture record (status 'printed');
   doubtful results are flagged needsReview instead of blocking.

   Rate limiting keeps the Azure free (F0) tier happy:
   - 1 analyze POST per second allowed → we space submissions ≥1.5s apart
   - 4 MB max document size → oversized files are rejected up front
   - 429 throttle responses → retried with back-off before giving up

   The queue lives in module state: it keeps running while the user switches
   workspaces, but is abandoned if the browser tab closes (by design). */

import { analyzeJobCardImage } from './documentIntelligence';
import { createJob, uploadImage } from './storage';
import { loadOcrFieldConfig } from './ocrFieldConfig';
import { matchTechnicians } from './techMatcher';

const ENDPOINT_KEY = 'tidewell.ocr.endpoint';
const API_KEY_KEY = 'tidewell.ocr.key';
const CHANGED_EVENT = 'tidewell:ocrqueue:changed';
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MIN_SUBMIT_GAP_MS = 1500;
const THROTTLE_RETRY_MS = [5000, 15000];
const LOW_CONFIDENCE_THRESHOLD = 0.65; // same bar as the OCR tab
const ACCEPTED_MIME = /^(image\/|application\/pdf)/i;

let items = [];
let pumping = false;
let lastSubmitAt = 0;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
    const base = { id: makeId(), fileName: f.name || 'Scanned document', jobRef: '', needsReview: false, error: '' };
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

      const endpoint = readLocal(ENDPOINT_KEY);
      const apiKey = readLocal(API_KEY_KEY);
      if (!endpoint || !apiKey) {
        items = items.map((i) => (i.status === 'queued'
          ? { ...i, status: 'error', error: 'Azure OCR is not configured — open Settings (gear icon in Recapture) first.' }
          : i));
        emit();
        break;
      }

      update(next.id, { status: 'processing' });
      try {
        const result = await analyzeWithBackoff(next, endpoint, apiKey);
        const { ref, needsReview } = await createCaptureFromOcr(next, result);
        // drop the file payload once done — no reason to hold MBs in memory
        update(next.id, { status: 'done', jobRef: ref, needsReview, dataUrl: '' });
      } catch (err) {
        update(next.id, { status: 'error', error: err?.message || 'OCR failed.' });
      }
    }
  } finally {
    pumping = false;
  }
}

async function analyzeWithBackoff(item, endpoint, apiKey) {
  const fieldConfig = loadOcrFieldConfig();
  const file = dataUrlToFile(item.dataUrl, item.fileName, item.mimeType);
  for (let attempt = 0; ; attempt += 1) {
    const gap = lastSubmitAt + MIN_SUBMIT_GAP_MS - Date.now();
    if (gap > 0) await wait(gap);
    lastSubmitAt = Date.now();
    try {
      return await analyzeJobCardImage({ endpoint, apiKey, file, fieldConfig });
    } catch (err) {
      const throttled = /429|too many requests|throttl/i.test(err?.message || '');
      if (throttled && attempt < THROTTLE_RETRY_MS.length) {
        await wait(THROTTLE_RETRY_MS[attempt]);
        continue;
      }
      throw err;
    }
  }
}

function normalizeDate(value) {
  const trimmed = String(value || '').trim();
  const dmy = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    const dd = dmy[1].padStart(2, '0');
    const mm = dmy[2].padStart(2, '0');
    const yy = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${yy}-${mm}-${dd}`;
  }
  if (/^(\d{4})-(\d{2})-(\d{2})$/.test(trimmed)) return trimmed;
  return '';
}

function isValidIsoDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

function deriveCustomerName(result) {
  const lines = result?.lines || [];
  const upper = lines.map((line) => String(line.content || '').trim());
  const candidate = upper.find((line) => /\b[A-Z]{2,}\b/.test(line) && line.length >= 4 && line.length <= 40 && !/job\s*card|date|assigned|duration|completed/i.test(line));
  return candidate || 'OCR Imported Customer';
}

/* Same record shape the OCR tab's "create capture record" builds, but instead
   of blocking on a bad date it creates the job anyway and flags it. */
async function createCaptureFromOcr(item, result) {
  const fields = result?.parsed?.fields || {};
  const val = (key) => String(fields[key]?.value || '').trim();

  const parsedDate = normalizeDate(val('date'));
  const dateOk = isValidIsoDate(parsedDate);
  const confidence = result.averageWordConfidence;
  const lowConfidence = Number.isFinite(confidence) && confidence < LOW_CONFIDENCE_THRESHOLD;
  const reviewReasons = [];
  if (!dateOk) reviewReasons.push('Job date could not be read from the scan');
  if (lowConfidence) reviewReasons.push('Low OCR confidence — check fields against the scan');
  const needsReview = reviewReasons.length > 0;

  let techList = [];
  try {
    const tr = await fetch('/api/technicians');
    if (tr.ok) techList = await tr.json();
  } catch { /* fuzzy match just won't apply */ }
  const rawAssigned = val('jobAssignedTo');
  const assignedTo = matchTechnicians(rawAssigned, techList) || rawAssigned;

  let imagePath = null;
  let oneDriveItemId = null;
  try {
    const base64 = item.dataUrl.split(',')[1] || '';
    const uploaded = await uploadImage(item.fileName, base64, item.mimeType);
    oneDriveItemId = uploaded.oneDriveItemId || null;
    imagePath = uploaded.filePath || null;
  } catch (_) {
    // Upload failure is non-fatal — continue without an attached image.
  }

  const customerName = val('customerName');
  const created = await createJob({
    status: 'printed',
    tech: 't1',
    jobAssignedTo: assignedTo,
    date: dateOk ? parsedDate : '',
    invoiceNumber: val('invoiceNumber'),
    jobDone: val('workDescription'),
    charges: {
      callOutFee: val('callOutFee'),
      labour: val('labour'),
      materialCost: val('materialsUsed'),
      materialsOther: val('materialsOther'),
      total: val('total'),
    },
    customer: {
      name: customerName || deriveCustomerName(result),
      address: val('customerAddress') || 'Address pending admin capture',
      phone: '—',
    },
    jobType: 'OCR import - admin capture required',
    printedBy: 'OCR import',
    printedAt: new Date().toLocaleString(),
    updated: needsReview
      ? 'Imported from OCR — check flagged fields before recapture'
      : 'Imported from OCR - awaiting admin recapture',
    imagePath,
    oneDriveItemId,
    scanMimeType: item.mimeType || '',
    ocrImport: {
      at: new Date().toISOString(),
      sourceFileName: item.fileName || '',
      averageWordConfidence: confidence,
      extractedFields: fields,
      needsReview,
      reviewReasons,
    },
  });

  return { ref: created.ref, needsReview };
}
