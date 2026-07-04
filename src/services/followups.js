/* Data layer for the Customer follow-ups workspace.
   Mirrors services/storage.js: thin fetch wrappers over the local API
   (server/api.js) plus a change event the hook subscribes to. */

const CHANGED_EVENT = 'tidewell:followups:changed';

function emitChanged() {
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
}

export function subscribeFollowupsChanged(listener) {
  window.addEventListener(CHANGED_EVENT, listener);
  return () => window.removeEventListener(CHANGED_EVENT, listener);
}

async function jsonFetch(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`Request failed: ${url}`);
  return res.json();
}

/* ── customers ── */
export function getCustomers() {
  return jsonFetch('/api/customers');
}

export async function replaceCustomers(list) {
  const result = await jsonFetch('/api/customers', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(list),
  });
  emitChanged();
  return result;
}

export async function addCustomer(customer) {
  const result = await jsonFetch('/api/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(customer),
  });
  emitChanged();
  return result;
}

export async function patchCustomer(id, patch) {
  const result = await jsonFetch(`/api/customers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  emitChanged();
  return result;
}

export async function deleteCustomer(id) {
  const result = await jsonFetch(`/api/customers/${id}`, { method: 'DELETE' });
  emitChanged();
  return result;
}

/* ── interactions ── */
export function getInteractions() {
  return jsonFetch('/api/interactions');
}

export async function addInteraction(entry) {
  const result = await jsonFetch('/api/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  emitChanged();
  return result;
}

/* ── import reconciliation ── */
/* Applies a reconciled import in one request; the server snapshots the
   previous state first so undoImport can restore it. */
export async function applyImport(customers, interactions) {
  const result = await jsonFetch('/api/followups/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customers, interactions }),
  });
  emitChanged();
  return result;
}

export async function undoImport() {
  const result = await jsonFetch('/api/followups/undo-import', { method: 'POST' });
  emitChanged();
  return result;
}

export function getImportUndoStatus() {
  return jsonFetch('/api/followups/import-undo-status');
}
