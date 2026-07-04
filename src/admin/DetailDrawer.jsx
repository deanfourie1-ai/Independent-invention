import Icon from '../components/Icon';
import { fmtDate } from '../services/dates';

function fmtR(n) {
  const num = parseFloat(String(n || '').replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(num)) return n || '—';
  return 'R ' + num.toLocaleString('en-ZA');
}

function parseAmount(v) {
  const n = parseFloat(String(v || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/* Inline SVG icons matching the design handoff */
const BillsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 17 17 7M17 7H9M17 7v8"/>
  </svg>
);
const ScanIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
    <path d="M3 12h18"/>
  </svg>
);

export default function DetailDrawer({ row, onClose }) {
  const open = !!row;
  const j = row || {};

  const TECH_TONES = { t1: 'blue', t2: 'green', t3: 'amber', t4: 'violet', t5: 'green' };
  const DOT_TONES  = ['blue', 'green', 'amber', 'violet'];
  const rawAssigned = j.jobAssignedTo || '';
  const assignedNames = rawAssigned.split(/\s*,\s*/).filter(Boolean).slice(0, 3);

  const customer = j.customer?.name || '—';
  const invoiceCustomer = j.invoiceCustomer || customer;
  const billsDiff = invoiceCustomer && invoiceCustomer !== customer;
  const total = parseAmount(j.charges?.total);
  const hasImage = !!(j.oneDriveItemId || j.imagePath);
  const imageSrc = j.oneDriveItemId
    ? `/api/image/${j.oneDriveItemId}`
    : j.imagePath ? `/${j.imagePath}` : null;
  const isPdfScan =
    j.scanMimeType === 'application/pdf' ||
    /\.pdf$/i.test(j.imagePath || '') ||
    /\.pdf$/i.test(j.ocrImport?.sourceFileName || '');

  return (
    <>
      <div className={`tw-scrim${open ? ' open' : ''}`} onClick={onClose} />
      <aside className={`tw-drawer${open ? ' open' : ''}`}>
        {row && (
          <>
            <div className="tw-drawer-head">
              <div style={{ flex: 1 }}>
                <div className="tw-eyebrow">Job card</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  <span className="tw-ref" style={{ fontSize: 15, fontWeight: 600 }}>{j.ref || j.id}</span>
                  <span className="tw-chip chip-captured">
                    <span className="d" />Captured
                  </span>
                </div>
              </div>
              <button className="tw-btn tw-icbtn" onClick={onClose} aria-label="Close">
                <Icon name="x" size={17} />
              </button>
            </div>

            <div className="tw-drawer-body">
              {/* scan preview / image */}
              <div className="tw-scanview">
                {hasImage
                  ? (isPdfScan
                      ? <iframe src={imageSrc} title="Scanned job card (PDF)" />
                      : <img src={imageSrc} alt="Scanned job card" />)
                  : <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ScanIcon style={{ width: 22, height: 22 }} />
                      Scanned card · front &amp; back
                    </span>
                }
              </div>

              <dl className="tw-dl">
                <dt>Customer</dt>
                <dd>{customer}</dd>

                <dt>Invoice customer</dt>
                <dd>
                  {billsDiff
                    ? <span style={{ color: 'var(--amber)' }}>{invoiceCustomer}</span>
                    : <span className="tw-muted" style={{ fontWeight: 500 }}>Same as customer</span>}
                </dd>

                <dt>Job date</dt>
                <dd>{fmtDate(j.date) || <span className="tw-muted" style={{ fontWeight: 500 }}>Not on card</span>}</dd>

                <dt>Captured</dt>
                <dd>{fmtDate(j.capturedAt) || '—'}</dd>

                <dt>Invoice #</dt>
                <dd><span className="tw-inv" style={{ fontSize: 13.5 }}>{j.invoiceNumber || '—'}</span></dd>

                <dt>Assigned to</dt>
                <dd>
                  {assignedNames.length === 0
                    ? <span className="tw-muted" style={{ fontWeight:500 }}>—</span>
                    : <span style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        {assignedNames.map((name, i) => {
                          const inits = name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
                          const tone  = i === 0 ? (TECH_TONES[j.tech] || DOT_TONES[0]) : DOT_TONES[i];
                          return (
                            <span key={i} className="tw-av">
                              <span className={`dot tone-${tone}`}>{inits}</span>
                              <span style={{ fontWeight: 600 }}>{name}</span>
                            </span>
                          );
                        })}
                      </span>
                  }
                </dd>

                <dt>Call-out</dt>
                <dd className="tw-num">{fmtR(j.charges?.callOutFee)}</dd>

                <dt>Labour</dt>
                <dd className="tw-num">{fmtR(j.charges?.labour)}</dd>

                <dt>Total</dt>
                <dd className="tw-num" style={{ fontWeight: 800 }}>{total > 0 ? fmtR(total) : '—'}</dd>
              </dl>
            </div>

            <div className="tw-drawer-foot">
              {hasImage && (
                <a
                  href={imageSrc}
                  target="_blank"
                  rel="noreferrer"
                  className="tw-btn tw-btn--primary"
                  style={{ flex: 1, justifyContent: 'center', textDecoration: 'none' }}
                >
                  <Icon name="eye" size={16} />
                  View scan
                </a>
              )}
              <button className="tw-btn" style={{ flex: hasImage ? 0 : 1, justifyContent: 'center' }} onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
