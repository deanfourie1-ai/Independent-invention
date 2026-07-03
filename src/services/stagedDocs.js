/* Shared store for staged OCR documents — the list shown on the OCR tab.
   Both the OCR tab (manual staging) and the dashboard background queue write
   here: the dashboard drops finished OCR results in as 'ready' so the admin
   reviews every scan before it becomes a capture record.

   Docs are persisted to localStorage best-effort (large data URLs can exceed
   the quota, in which case they survive in memory for the session only). */

const STORE_KEY = 'tidewell.ocr.stagedDocs.v1';
const CHANGED_EVENT = 'tidewell:stageddocs:changed';

export const STAGED_STATUSES = ['staged', 'processing', 'ready', 'error', 'imported'];

const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

function normalize(item) {
  return {
    id: item.id || makeId(),
    fileName: String(item.fileName || 'Scanned document'),
    mimeType: String(item.mimeType || 'application/octet-stream'),
    size: Number(item.size) || 0,
    dataUrl: String(item.dataUrl || ''),
    status: STAGED_STATUSES.includes(item.status) ? item.status : 'staged',
    error: String(item.error || ''),
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString(),
    result: item.result || null,
    editedValues: item.editedValues && typeof item.editedValues === 'object' ? item.editedValues : {},
    importedJobRef: String(item.importedJobRef || ''),
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item === 'object').map(normalize);
  } catch (_) {
    return [];
  }
}

let docs = load();

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(docs)); } catch (_) {}
}

function emit() {
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
}

export function getStagedDocs() {
  return docs.slice();
}

export function subscribeStagedDocs(listener) {
  window.addEventListener(CHANGED_EVENT, listener);
  return () => window.removeEventListener(CHANGED_EVENT, listener);
}

export function makeStagedDoc(partial) {
  return normalize(partial || {});
}

/* Newest first, matching how the OCR tab has always listed staged files. */
export function addStagedDocs(newDocs) {
  const prepared = (newDocs || []).map(normalize);
  if (!prepared.length) return prepared;
  docs = [...prepared, ...docs];
  persist();
  emit();
  return prepared;
}

export function updateStagedDoc(docId, patch) {
  docs = docs.map((item) =>
    item.id === docId ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item
  );
  persist();
  emit();
}

export function removeStagedDoc(docId) {
  docs = docs.filter((item) => item.id !== docId);
  persist();
  emit();
}
