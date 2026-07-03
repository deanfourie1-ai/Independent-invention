import { useMemo, useState } from 'react';
import Icon from '../components/Icon';
import { technicians, fmtDate } from '../data';

const TECH_TONES = { t1: 'blue', t2: 'green', t3: 'amber', t4: 'violet', t5: 'green' };

function parseAmount(v) {
  const n = parseFloat(String(v || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function fmtR(n) {
  if (!n && n !== 0) return '—';
  const num = parseFloat(String(n).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(num) || num === 0) return '—';
  return 'R ' + num.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function StatusChip({ job }) {
  if (job.capturedAt) {
    return <span className="tw-chip chip-captured"><span className="d" />Captured</span>;
  }
  return <span className="tw-chip chip-queue"><span className="d" />To capture</span>;
}

const DOT_TONES = ['blue', 'green', 'amber', 'violet'];

function Avatar({ job }) {
  const raw = job.jobAssignedTo || technicians[job.tech]?.name || '';
  if (!raw) return <span className="tw-muted">—</span>;
  const names = raw.split(/\s*,\s*/).filter(Boolean).slice(0, 3);
  return (
    <span className="tw-av">
      {names.map((name, i) => {
        const inits = name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const tone = i === 0 ? (TECH_TONES[job.tech] || DOT_TONES[0]) : DOT_TONES[i];
        return <span key={i} className={`dot tone-${tone}`} title={name}>{inits}</span>;
      })}
      <span>{names.join(', ')}</span>
    </span>
  );
}

function matchesSearch(job, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    (job.customer?.name || '').toLowerCase().includes(q) ||
    (job.invoiceCustomer || '').toLowerCase().includes(q) ||
    (job.customer?.address || '').toLowerCase().includes(q) ||
    (job.customer?.phone || '').toLowerCase().includes(q) ||
    (job.invoiceNumber || '').toLowerCase().includes(q) ||
    (job.ref || '').toLowerCase().includes(q) ||
    (job.jobAssignedTo || '').toLowerCase().includes(q)
  );
}

export default function HistoryPanel({ jobs, onRowSelect, onReopen, onDelete }) {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [jobDate, setJobDate] = useState('');
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [sortDir, setSortDir] = useState('desc');

  const filtered = useMemo(() => {
    return jobs
      .filter((job) => {
        if (!job.capturedAt) return false;
        const day = job.capturedAt.slice(0, 10);
        if (fromDate && day < fromDate) return false;
        if (toDate && day > toDate) return false;
        if (jobDate && (job.date || '').slice(0, 10) !== jobDate) return false;
        if (!matchesSearch(job, search)) return false;
        return true;
      })
      // Sort by invoice number (numeric-aware, direction toggled via the
      // Invoice # header; default descending). Rows with no invoice number
      // always sort to the bottom.
      .sort((a, b) => {
        const an = String(a.invoiceNumber || '').trim();
        const bn = String(b.invoiceNumber || '').trim();
        if (!an !== !bn) return an ? -1 : 1;
        const cmp = an.localeCompare(bn, undefined, { numeric: true, sensitivity: 'base' });
        return sortDir === 'desc' ? -cmp : cmp;
      });
  }, [jobs, fromDate, toDate, jobDate, search, sortDir]);

  const hasFilters = fromDate || toDate || jobDate || search;
  const hasAnyHistory = jobs.some((j) => j.capturedAt);

  function handleRowClick(job) {
    setSelectedId(job.id);
    onRowSelect?.(job);
  }

  async function exportHistory() {
    if (!filtered.length || exporting) return;
    setExporting(true);
    try {
      const xlsx = await import('xlsx');
      const rows = filtered.map((job) => ({
        'Job ref': job.ref || job.id,
        'Captured date': fmtDate(job.capturedAt),
        'Job date': fmtDate(job.date),
        'Customer': job.customer?.name || '',
        'Invoice customer': job.invoiceCustomer || job.customer?.name || '',
        'Invoice number': job.invoiceNumber || '',
        'Address': job.customer?.address || '',
        'Phone': job.customer?.phone || '',
        'Job type': job.jobType || '',
        'Assigned to': technicians[job.tech]?.name || job.jobAssignedTo || '',
        'Call-out fee': job.charges?.callOutFee || '',
        'Labour': job.charges?.labour || '',
        'Material & other costs': job.charges?.materialsOther || '',
        'Materials used': job.materials || '',
      }));
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(rows);
      xlsx.utils.book_append_sheet(wb, ws, 'History');
      const stamp = new Date().toISOString().slice(0, 10);
      const label = fromDate || toDate ? `${fromDate || 'start'}_to_${toDate || 'today'}` : stamp;
      xlsx.writeFileXLSX(wb, `tidewell-history-${label}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div className="tw-field">
          <label>Captured from</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </div>
        <div className="tw-field">
          <label>Captured to</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        <div className="tw-field">
          <label>Job date</label>
          <input type="date" value={jobDate} onChange={(e) => setJobDate(e.target.value)} />
        </div>

        <div className="tw-search" style={{ flex: '1 1 200px' }}>
          <Icon name="search" size={15} />
          <input
            type="search"
            placeholder="Customer, address, invoice number, ref..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {hasFilters && (
          <button
            className="tw-btn"
            type="button"
            onClick={() => { setFromDate(''); setToDate(''); setJobDate(''); setSearch(''); }}
          >
            <Icon name="x" size={14} /> Clear filters
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
          <span className="tw-records">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
          <button
            className="tw-btn tw-btn--primary"
            disabled={!filtered.length || exporting}
            onClick={exportHistory}
          >
            <Icon name="file" size={15} />
            {exporting ? 'Exporting...' : 'Export to Excel'}
          </button>
        </div>
      </div>

      {/* table */}
      {filtered.length === 0 ? (
        <div className="tw-empty">
          <Icon name="inbox" size={38} />
          <p style={{ marginTop: 12, fontWeight: 600 }}>
            {hasAnyHistory
              ? 'No records match the current filters.'
              : 'No captured jobs yet. Tick all checklist items on a job to record it here.'}
          </p>
        </div>
      ) : (
        <div className="tw-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="tw-table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Captured</th>
                  <th>Job date</th>
                  <th>Customer</th>
                  <th
                    role="button"
                    tabIndex={0}
                    title={`Sorted ${sortDir === 'desc' ? 'descending' : 'ascending'} — click to reverse`}
                    aria-sort={sortDir === 'desc' ? 'descending' : 'ascending'}
                    style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                    onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
                      }
                    }}
                  >
                    Invoice # {sortDir === 'desc' ? '▼' : '▲'}
                  </th>
                  <th>Assigned to</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Scan</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((job) => {
                  const total = parseAmount(job.charges?.total);
                  const customer = job.customer?.name || '—';
                  const invoiceCustomer = job.invoiceCustomer || '';
                  const billsDiff = invoiceCustomer && invoiceCustomer !== customer;

                  return (
                    <tr
                      key={job.id}
                      className={selectedId === job.id ? 'is-selected' : ''}
                      onClick={() => handleRowClick(job)}
                    >
                      <td><span className="tw-ref">{job.ref}</span></td>
                      <td>{fmtDate(job.capturedAt)}</td>
                      <td>{fmtDate(job.date)}</td>
                      <td>
                        <div className="tw-cust">{customer}</div>
                        {billsDiff && (
                          <div className="tw-billsto">
                            <Icon name="arrowRight" size={11} />
                            {invoiceCustomer}
                          </div>
                        )}
                      </td>
                      <td><span className="tw-inv">{job.invoiceNumber || '—'}</span></td>
                      <td><Avatar job={job} /></td>
                      <td><span className="tw-total">{total > 0 ? fmtR(total) : '—'}</span></td>
                      <td><StatusChip job={job} /></td>
                      <td>
                        {(job.oneDriveItemId || job.imagePath) ? (
                          <a
                            href={job.oneDriveItemId ? `/api/image/${job.oneDriveItemId}` : `/${job.imagePath}`}
                            target="_blank"
                            rel="noreferrer"
                            className="tw-link"
                            title="Open scanned image"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Icon name="eye" size={14} />
                            View
                          </a>
                        ) : <span className="tw-muted">—</span>}
                      </td>
                      <td>
                        <div className="hist-actions">
                          <button
                            type="button"
                            className="hist-act"
                            title="Reopen for capture"
                            onClick={(e) => { e.stopPropagation(); onReopen?.(job); }}
                          >
                            <Icon name="sync" size={13} />
                            Reopen
                          </button>
                          <button
                            type="button"
                            className="hist-act danger"
                            title="Delete record"
                            aria-label={`Delete ${job.ref}`}
                            onClick={(e) => { e.stopPropagation(); onDelete?.(job); }}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
