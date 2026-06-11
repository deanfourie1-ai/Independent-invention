const JOBS_CHANGED_EVENT = 'tidewell:jobs:changed';

const nowIso = () => new Date().toISOString();

function makeGuid() {
  const h = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${h()}${h()}-${h()}-${h()}-${h()}-${h()}${h()}${h()}`;
}

function refOf(guid) {
  return `JC-${guid.slice(0, 4).toUpperCase()}-${guid.slice(5, 7).toUpperCase()}`;
}

function emitJobsChanged() {
  window.dispatchEvent(new CustomEvent(JOBS_CHANGED_EVENT));
}

export function subscribeJobsChanged(listener) {
  window.addEventListener(JOBS_CHANGED_EVENT, listener);
  return () => window.removeEventListener(JOBS_CHANGED_EVENT, listener);
}

export async function initializeSeedJobs() {
  // No-op: data lives in data/jobs.json, managed by the local API server.
}

export async function getAllJobs() {
  const res = await fetch('/api/jobs');
  if (!res.ok) throw new Error('Failed to load jobs from local store.');
  return res.json();
}

export async function patchJob(jobId, patch) {
  const res = await fetch(`/api/jobs/${jobId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('Failed to update job.');
  const updated = await res.json();
  emitJobsChanged();
  return updated;
}

export async function createJob(patch) {
  const id = patch.id || makeGuid();
  const job = {
    id,
    ref: patch.ref || refOf(id),
    status: patch.status || 'printed',
    jobType: patch.jobType || 'OCR import job card',
    jobAssignedTo: patch.jobAssignedTo || '',
    customer: {
      name: patch.customer?.name || 'OCR Imported Customer',
      address: patch.customer?.address || 'Address pending manual capture',
      phone: patch.customer?.phone || '—',
    },
    tech: patch.tech || 't1',
    jobDone: patch.jobDone || '',
    materials: patch.materials || '',
    invoiceNumber: patch.invoiceNumber || '',
    invoiceCustomer: patch.invoiceCustomer || patch.customer?.name || 'OCR Imported Customer',
    charges: patch.charges || null,
    date: patch.date || '',
    time: patch.time || '',
    photos: patch.photos || 0,
    printedBy: patch.printedBy || 'OCR import',
    printedAt: patch.printedAt || new Date().toLocaleString(),
    updated: patch.updated || 'Imported from OCR for admin recapture',
    priority: Boolean(patch.priority),
    ocrImport: patch.ocrImport || null,
    imagePath: patch.imagePath || null,
    updatedAt: nowIso(),
  };

  const res = await fetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(job),
  });
  if (!res.ok) throw new Error('Failed to create job.');
  const created = await res.json();
  emitJobsChanged();
  return created;
}

export async function deleteJob(jobId, metadata = {}) {
  const reasonCode = String(metadata.reasonCode || '').trim();
  if (!reasonCode) throw new Error('A reason code is required to delete this job card.');

  const res = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete job.');
  const removed = await res.json();
  emitJobsChanged();
  return removed;
}

export async function uploadImage(fileName, base64, mimeType) {
  const res = await fetch('/api/upload-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, base64, mimeType }),
  });
  if (!res.ok) throw new Error('Failed to save image to uploads folder.');
  return res.json();
}
