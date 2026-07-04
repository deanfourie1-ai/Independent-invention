/* Pure helpers for the Customer follow-ups screen — dates, money, follow-up
   status. Ported from the design prototype's simple-data.js. A movable "today"
   (set at the top of each render) drives the day roll-forward mechanism. */

import { MONTHS as MON } from '../../services/dates';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TODAY_ISO = new Date().toISOString().slice(0, 10);
let CURRENT = TODAY_ISO; // movable "today"

const isoToDisp = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return `${d} ${MON[m - 1]} ${y}`; };
const isoToDow  = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-').map(Number); return DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };
const addDaysIso = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() + n); return dt.toISOString().slice(0, 10); };
const daysBetween = (a, b) => { const pa = a.split('-').map(Number), pb = b.split('-').map(Number); return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000); };
const fuStatus = (iso) => (!iso ? 'none' : iso < CURRENT ? 'overdue' : iso === CURRENT ? 'today' : 'upcoming');
const fuRelative = (iso) => {
  if (!iso) return '';
  const n = daysBetween(CURRENT, iso);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return '1 day ago';
  if (n < 0) return `${-n} days ago`;
  return `in ${n} days`;
};

// Round to cents — kills float noise when summing decimal amounts.
const round2 = (n) => Math.round(n * 100) / 100;
// Whole-rand amounts stay compact (R 23 800); cent amounts always show both
// decimals (R 1 234,56) so imported values round-trip visibly.
const fmtAmount = (n) => {
  const v = round2(Number(n || 0));
  return v.toLocaleString('en-ZA', Number.isInteger(v) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const fmtR = (n) => 'R ' + fmtAmount(n);
// owed = manual override if set, else the sum of invoices not yet marked paid
const owed = (c) => round2(typeof c.outstanding === 'number' ? c.outstanding : (c.invoices || []).reduce((s, i) => s + (i.paid ? 0 : i.amount), 0));
// Live days: prefers stored invoice date; falls back to importedDays + elapsed since importedAt; else stored snapshot.
const invDays = (iv) => {
  if (iv.invoiceDate) return Math.max(0, daysBetween(iv.invoiceDate, CURRENT));
  if (typeof iv.importedDays === 'number' && iv.importedAt) return Math.max(0, iv.importedDays + daysBetween(iv.importedAt, CURRENT));
  return iv.days || 0;
};
const oldestDays = (c) => (c.invoices || []).reduce((m, i) => (i.paid ? m : Math.max(m, invDays(i))), 0);
const openInvoices = (c) => (c.invoices || []).filter((i) => !i.paid);
const sumUnpaid = (c, paidMap) => round2((c.invoices || []).reduce((s, i) => s + ((paidMap && paidMap[i.no]) || i.paid ? 0 : i.amount), 0));

export const S = {
  TODAY_ISO,
  get today() { return CURRENT; },
  setToday(iso) { CURRENT = iso; },
  isoToDisp, isoToDow, addDaysIso, daysBetween, fuStatus, fuRelative,
  fmtR, fmtAmount, owed, invDays, oldestDays, openInvoices, sumUnpaid,
};
