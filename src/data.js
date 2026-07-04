/**
 * Static app data + tiny shared formatters.
 *
 * NOTE: this module was reconstructed on 2026-07-04. The original lived at
 * src/data/ (a directory), which the unanchored `data/` .gitignore pattern
 * silently excluded from git — it was lost when this checkout was created.
 * It now lives as a plain file (src/data.js) so it is always tracked.
 * The `../data` imports in src/admin and src/components resolve to it
 * unchanged.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* '2026-06-05' → '5 Jun 2026'. Parses the ISO string directly (no Date
   object) so timezones can never shift the day. Falsy/invalid input → ''
   so callers can chain a fallback with ||. */
export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d || !MONTHS[m - 1]) return '';
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function initialsOf(name) {
  return name.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

/* Legacy static lookup keyed by tech id. The live editable list is
   data/technicians.json (Settings → Technicians); this map only backs the
   avatar/initials fallback for jobs that carry a bare `tech` id. */
export const technicians = Object.fromEntries(
  [
    ['t1', 'Claas'],
    ['t2', 'Daniel'],
    ['t3', 'Elias'],
    ['t4', 'Mokete'],
    ['t5', 'Michael'],
    ['t6', 'Adolf'],
    ['t7', 'Katleho'],
    ['t8', 'Steyn'],
    ['t9', 'Karin'],
  ].map(([id, name]) => [id, { id, name, initials: initialsOf(name) }])
);

/* Badge meta per job status — cls values match .s-* rules in core.css. */
export const statusMeta = {
  draft: { label: 'Draft', cls: 's-draft', icon: 'edit' },
  printed: { label: 'Printed', cls: 's-printed', icon: 'printer' },
  synced: { label: 'Synced', cls: 's-synced', icon: 'sync' },
  sync_failed: { label: 'Sync failed', cls: 's-failed', icon: 'alertCircle' },
  finished: { label: 'Finished', cls: 's-finished', icon: 'checkCircle' },
};

/* Printed job-card field → Sage Online field, for the copy-to-Sage table. */
export const sageMap = [
  { print: 'Job ref (GUID)', sage: 'Reference', get: (j) => j.ref || j.id || '' },
  { print: 'Customer name', sage: 'Customer', get: (j) => j.customer?.name || '' },
  { print: 'Invoice customer', sage: 'Customer account', get: (j) => j.invoiceCustomer || j.customer?.name || '' },
  { print: 'Job date', sage: 'Invoice date', get: (j) => fmtDate(j.date) },
  { print: 'Invoice number', sage: 'Invoice number', get: (j) => j.invoiceNumber || '' },
  { print: 'Description of work done', sage: 'Line description', get: (j) => j.jobDone || '' },
  { print: 'Call-out fee', sage: 'Call-out line amount', get: (j) => j.charges?.callOutFee || '' },
  { print: 'Labour', sage: 'Labour line amount', get: (j) => j.charges?.labour || '' },
  { print: 'Material cost', sage: 'Materials line amount', get: (j) => j.charges?.materialCost || '' },
  { print: 'Other costs', sage: 'Other line amount', get: (j) => j.charges?.materialsOther || '' },
  { print: 'Total', sage: 'Invoice total', get: (j) => j.charges?.total || '' },
];
