/* Excel import UI: the import band and the column-mapping modal.
   The importer reads the sheet as raw rows (array-of-arrays) so it works
   even with no header row, then the user maps which column is which. */
import { useState, useMemo } from 'react';
import { FI } from './icons';
import { S } from './helpers';
import { parseMoney, isoFromDateCell } from './reconcile';

/* ── import band ── */
export function ImportBand({ meta, count, total, invoiceCount, onReimport, onUndo }) {
  return (
    <div className="sl-import">
      <span className="xl"><FI.excel /></span>
      <div className="meta">
        <div className="ttl">{meta.file}</div>
        <div className="sub">{meta.date ? `Imported ${meta.date}${meta.time ? ', ' + meta.time : ''} · ` : ''}<b>{count} follow-up task{count === 1 ? '' : 's'}</b>{invoiceCount ? ` from ${invoiceCount} invoices` : ''} · {S.fmtR(total)} outstanding</div>
      </div>
      {onUndo && (
        <button className="tw-btn" onClick={onUndo} title="Restore customers and notes to how they were before the last import">
          <FI.x />Undo last import
        </button>
      )}
      <button className="tw-btn" onClick={onReimport}><FI.upload />Upload Excel list</button>
    </div>);
}

/* ── column-mapping helpers ── */
export const MAP_KEY = 'tidewell.followups.colmap';
const MAP_FIELDS = [
  { key: 'customer', label: 'Customer name', req: true },
  { key: 'amount', label: 'Amount outstanding', req: true },
  { key: 'invoice', label: 'Invoice number', req: true },
  { key: 'date', label: 'Invoice date', req: false },
  { key: 'days', label: 'Days overdue', req: false },
];

function colLetter(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
function daysFromCell(v) { const iso = isoFromDateCell(v); return iso ? Math.max(0, S.daysBetween(iso, S.today)) : 0; }

export function deriveColumns(aoa, hasHeader) {
  const colCount = aoa.reduce((m, r) => Math.max(m, r.length), 0);
  const dataRows = hasHeader ? aoa.slice(1) : aoa;
  const header = hasHeader ? (aoa[0] || []) : null;
  const columns = [];
  for (let i = 0; i < colCount; i++) {
    const label = hasHeader && header[i] != null && String(header[i]).trim()
      ? String(header[i]).trim() : 'Column ' + colLetter(i);
    const sampleRow = dataRows.find((r) => r[i] !== '' && r[i] != null);
    columns.push({ index: i, label, sample: sampleRow ? String(sampleRow[i] instanceof Date ? sampleRow[i].toLocaleDateString() : sampleRow[i]) : '' });
  }
  return { columns, dataRows };
}

function guessHeader(aoa) {
  const row0 = aoa[0] || [];
  const re = /customer|client|account|name|debtor|amount|outstanding|balance|invoice|date|days|age|total/i;
  return row0.filter((c) => typeof c === 'string' && re.test(c)).length >= 2;
}

function guessByContent(columns, dataRows) {
  const isNumish = (v) => v !== '' && v != null && !(v instanceof Date) && (typeof v === 'number' || /^[R\s]*-?[\d.,]+$/.test(String(v).trim()));
  const stats = columns.map((c) => {
    const vals = dataRows.map((r) => r[c.index]).filter((v) => v !== '' && v != null);
    return {
      index: c.index,
      numFrac: vals.length ? vals.filter(isNumish).length / vals.length : 0,
      hasDec: vals.some((v) => /[.,]\d{2}\b/.test(String(v))),
      isDate: vals.some((v) => v instanceof Date),
      count: vals.length,
    };
  });
  const text = stats.filter((s) => s.count && s.numFrac < 0.4 && !s.isDate);
  const nums = stats.filter((s) => s.numFrac > 0.6 && !s.isDate);
  const dateCol = stats.find((s) => s.isDate);
  return {
    customer: (text[0] || columns[0] || {}).index ?? null,
    amount: ((nums.find((s) => s.hasDec) || nums[0]) || {}).index ?? null,
    invoice: null,
    date: dateCol ? dateCol.index : null,
    days: null,
  };
}

function initialMap(columns, dataRows, savedMap, hasHeader) {
  if (savedMap && savedMap.colCount === columns.length) {
    return { customer: savedMap.customer ?? null, amount: savedMap.amount ?? null, invoice: savedMap.invoice ?? null, date: savedMap.date ?? null, days: savedMap.days ?? null };
  }
  if (hasHeader) {
    const find = (re) => { const c = columns.find((c) => re.test(c.label)); return c ? c.index : null; };
    const m = { customer: find(/customer|client|account|name|debtor/i), amount: find(/amount|outstanding|balance|total|due|value/i), invoice: find(/invoice|inv\b|doc|reference|ref\b/i), date: find(/date/i), days: find(/days|age/i) };
    if (m.customer != null && m.amount != null) return m;
    return { ...guessByContent(columns, dataRows), ...Object.fromEntries(Object.entries(m).filter(([, v]) => v != null)) };
  }
  return guessByContent(columns, dataRows);
}

export function ImportMapModal({ draft, savedMap, onCancel, onConfirm }) {
  const [hasHeader, setHasHeader] = useState(() => guessHeader(draft.aoa));
  const { columns, dataRows } = useMemo(() => deriveColumns(draft.aoa, hasHeader), [draft.aoa, hasHeader]);
  const [map, setMap] = useState(() => initialMap(columns, dataRows, savedMap, hasHeader));

  const setField = (k, v) => setMap((m) => ({ ...m, [k]: v === '' ? null : Number(v) }));
  const valid = map.customer != null && map.amount != null && map.invoice != null;
  const trunc = (s) => { s = String(s ?? ''); return s.length > 24 ? s.slice(0, 23) + '…' : s; };
  const cellDays = (r) => map.days != null ? Math.max(0, Math.round(Number(String(r[map.days]).replace(/[^\d.-]/g, '')) || 0)) : map.date != null ? daysFromCell(r[map.date]) : 0;
  const preview = dataRows.slice(0, 5).map((r) => ({
    customer: map.customer != null ? String(r[map.customer] ?? '') : '',
    invoice: map.invoice != null ? (String(r[map.invoice] ?? '').trim() || '—') : '—',
    amount: map.amount != null ? parseMoney(r[map.amount]) : 0,
    days: cellDays(r),
  }));

  return (
    <div className="sl-modal-scrim" onClick={onCancel}>
      <div className="sl-modal sl-mapmodal" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <div>
            <div className="tw-eyebrow">Import from Excel</div>
            <div className="ttl">Map your columns</div>
            <div className="sl-contact">{draft.fileName} · {draft.sheetName} · {dataRows.length} row{dataRows.length === 1 ? '' : 's'}</div>
          </div>
          <button className="tw-btn tw-icbtn" onClick={onCancel}><FI.x /></button>
        </div>
        <div className="body">
          <label className="sl-headtoggle">
            <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
            First row contains column headings
          </label>
          <div className="sl-map-grid">
            {MAP_FIELDS.map((f) => (
              <div className="sl-map-field" key={f.key}>
                <span className="k">{f.label}{f.req && <span className="req">*</span>}</span>
                <select className="sl-msel" value={map[f.key] == null ? '' : map[f.key]} onChange={(e) => setField(f.key, e.target.value)}>
                  <option value="">— none —</option>
                  {columns.map((c) => <option key={c.index} value={c.index}>{c.label}{c.sample ? ` · e.g. ${trunc(c.sample)}` : ''}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="sl-q" style={{ marginBottom: 8 }}>Preview</div>
          <div className="sl-map-preview">
            <table>
              <thead><tr><th>Customer</th><th>Invoice</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>Days</th></tr></thead>
              <tbody>
                {preview.map((p, i) => (
                  <tr key={i}>
                    <td>{p.customer || <span className="muted">—</span>}</td>
                    <td className="mono">{p.invoice}</td>
                    <td style={{ textAlign: 'right' }}>{p.amount ? S.fmtR(p.amount) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{p.days || 0}d</td>
                  </tr>))}
              </tbody>
            </table>
          </div>
          {!valid && <div className="sl-map-hint">Pick the <b>Customer name</b>, <b>Amount</b> and <b>Invoice number</b> columns to continue — invoice numbers are how payments are detected between imports.</div>}
        </div>
        <div className="foot">
          <button className="tw-btn tw-btn--primary" disabled={!valid} style={{ flex: 1, justifyContent: 'center', height: 42 }} onClick={() => onConfirm({ map, hasHeader })}>
            <FI.upload />Import {dataRows.length} row{dataRows.length === 1 ? '' : 's'}
          </button>
          <button className="tw-btn" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>);
}
