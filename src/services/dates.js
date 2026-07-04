// dates.js — shared date formatting helpers

export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function fmtDate(iso) {
  if (!iso) return '—';
  // Accept both date-only ("2026-06-05") and full ISO timestamps
  // ("2026-06-13T19:18:26.000Z") by taking just the date portion.
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// "4 Jul 2026, 12:38" — local-time timestamp, e.g. for backup/activity rows.
export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}
