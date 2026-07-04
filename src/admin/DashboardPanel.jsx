import { useState, useEffect, useCallback, useRef } from 'react';
import Icon from '../components/Icon';
import { enqueueOcrFiles, getOcrQueue, subscribeOcrQueue, clearFinishedOcr } from '../services/ocrQueue';
import { getOcrUsage, subscribeOcrUsage, FREE_TIER_PAGES, WARN_AT_PAGES } from '../services/ocrUsage';
import { subscribeJobsChanged } from '../services/storage';

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtTime(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtR(n) { return 'R ' + Number(n || 0).toLocaleString('en-ZA'); }

const DID_LABEL = {
  call: 'Called', whatsapp: 'WhatsApp', email: 'Emailed', visit: 'Visited', note: 'Note',
  captured: 'Captured', scanned: 'Scanned',
};

function StatCard({ icon, label, value, note, tone, onClick }) {
  return (
    <button type="button" className={`db-stat t-${tone || 'brand'}`} onClick={onClick}>
      <div className="top">
        <span className="bubble"><Icon name={icon} size={15} /></span>
        <span className="lbl">{label}</span>
      </div>
      <div className="val">{value ?? '—'}</div>
      {note && <div className="note">{note}</div>}
    </button>
  );
}

function ActivityRow({ entry }) {
  const dids = entry.dids?.length ? entry.dids : [entry.did];
  return (
    <div className="db-arow">
      <div className="who">
        <div className="nm">{entry.customerName}</div>
        <div className="d">{entry.date}</div>
      </div>
      <div className="what">
        {dids.map((d) => <span key={d} className={'verb v-' + d}>{DID_LABEL[d] || d}</span>)}
        <span className="said">{entry.said?.length > 110 ? entry.said.slice(0, 110) + '…' : entry.said}</span>
      </div>
      <div className="by">{entry.by}</div>
    </div>
  );
}

const QSTATUS = {
  queued:     { icon: 'clock',       spin: false },
  processing: { icon: 'sync',        spin: true },
  done:       { icon: 'checkCircle', spin: false },
  error:      { icon: 'alertCircle', spin: false },
};

function QueueItemRow({ item }) {
  const st = QSTATUS[item.status] || QSTATUS.queued;
  const note = item.status === 'queued' ? 'Waiting…'
    : item.status === 'processing' ? 'Reading the scan…'
    : item.status === 'done'
      ? `Added to capture queue as ${item.jobRef}${item.needsReview ? ' — flagged: check fields' : ''}`
      : item.error;
  const msgClass = item.status === 'error' ? ' err' : item.status === 'done' && item.needsReview ? ' warn' : '';
  return (
    <div className="db-qrow">
      <span className={`st s-${item.status}`}><Icon name={st.icon} size={15} className={st.spin ? 'spin' : ''} /></span>
      <span className="fn">{item.fileName}</span>
      <span className={'msg' + msgClass}>{note}</span>
    </div>
  );
}

/* Drop zone + live progress for background OCR. Files queue up and keep
   processing while the user moves to other workspaces. */
function OcrScanCard() {
  const [queue, setQueue] = useState(getOcrQueue);
  const [usage, setUsage] = useState(getOcrUsage);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const offQueue = subscribeOcrQueue(() => setQueue(getOcrQueue()));
    const offUsage = subscribeOcrUsage(() => setUsage(getOcrUsage()));
    return () => { offQueue(); offUsage(); };
  }, []);

  const finished = queue.filter((i) => i.status === 'done' || i.status === 'error');
  const active = queue.length - finished.length;
  const nearLimit = usage.pages >= WARN_AT_PAGES;
  const usedPct = Math.min(100, Math.round((usage.pages / FREE_TIER_PAGES) * 100));

  return (
    <div className="db-card">
      <div className="db-cardhead">
        <span className="t">Scan job cards</span>
        <span className={'aside' + (nearLimit ? ' warn' : '')}>
          {nearLimit && <Icon name="alertCircle" size={13} />}
          {usage.pages} / {FREE_TIER_PAGES} free pages this month
          <span className={'db-meter' + (nearLimit ? ' warn' : '')}><i style={{ width: `${usedPct}%` }} /></span>
        </span>
      </div>
      <div
        className={'db-drop' + (dragOver ? ' over' : '')}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); enqueueOcrFiles(e.dataTransfer.files); }}
        role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
      >
        <span className="ic"><Icon name="inbox" size={18} /></span>
        <span><b>Drop scanned job cards here</b> or click to choose files</span>
        <span className="hint">JPEG, PNG or PDF · max 4 MB each · they process in the background while you work</span>
      </div>
      <input
        ref={inputRef} type="file" multiple accept="image/*,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => { enqueueOcrFiles(e.target.files); e.target.value = ''; }}
      />
      {queue.length > 0 && (
        <div className="db-qlist">
          {queue.map((item) => <QueueItemRow key={item.id} item={item} />)}
          <div className="db-qfoot">
            <span>{active > 0 ? `${active} still processing — you can carry on working` : 'All done'}</span>
            {finished.length > 0 && (
              <button className="tw-btn tw-btn--sm" onClick={clearFinishedOcr}>Clear finished</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Brand() {
  return (
    <div className="tw-brand">
      <div className="tw-logo"><Icon name="droplet" size={18} /></div>
      <div>
        <div className="tw-brand-name">Jobtool</div>
        <div className="tw-brand-sub">Admin panel</div>
      </div>
    </div>
  );
}

export default function DashboardPanel({ workspaceSwitch, onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [refreshed, setRefreshed] = useState(null);

  /* silent=true refreshes in the background without flashing the loading state */
  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    fetch('/api/dashboard')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { setData(d); setStale(false); setRefreshed(new Date()); })
      .catch(() => setStale(true))
      .finally(() => { if (!silent) setLoading(false); });
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => load(true), 60_000);
    const onFocus = () => load(true);
    window.addEventListener('focus', onFocus);
    // background OCR creates jobs — refresh the numbers as they land
    const offJobs = subscribeJobsChanged(() => load(true));
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); offJobs(); };
  }, [load]);

  const today = new Date();
  const todayDisp = `${today.getDate()} ${MON[today.getMonth()]} ${today.getFullYear()}`;

  return (
    <div className="tw">
      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 22px', background: 'var(--surface)', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <Brand />
        {workspaceSwitch}
        <button className="tw-btn tw-icbtn" onClick={() => load()} title="Refresh" disabled={loading}>
          <Icon name="refresh" size={17} className={loading ? 'spin' : ''} />
        </button>
      </div>

      {/* body */}
      <div className="db-scroll">
        <div className="db-wrap">
          <div className="db-head">
            <h1 className="tw-h1">Dashboard</h1>
            <span className="tw-sub" style={{ margin: 0 }}>{todayDisp}{refreshed ? ` · updated ${fmtTime(refreshed)}` : ''}</span>
            {stale && data && (
              <span style={{ fontSize: 12, color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                <Icon name="alertCircle" size={13} /> Couldn't refresh — showing last loaded data
              </span>
            )}
          </div>

          {!data && loading ? (
            <div className="tw-empty">
              <Icon name="sync" size={32} className="spin" />
              <p style={{ marginTop: 12 }}>Loading…</p>
            </div>
          ) : data ? (
            <>
              {/* stat cards */}
              <div className="db-grid">
                <StatCard
                  icon="clipboard" label="In capture queue"
                  value={data.pendingCapture}
                  note={data.capturedToday > 0 ? `${data.capturedToday} captured today` : 'Jobs awaiting recapture'}
                  tone={data.pendingCapture > 5 ? 'amber' : data.pendingCapture > 0 ? 'brand' : 'green'}
                  onClick={() => onNavigate('recapture')}
                />
                <StatCard
                  icon="phone" label="Open follow-ups"
                  value={data.openFollowups}
                  note={data.totalOutstanding > 0 ? `${fmtR(data.totalOutstanding)} outstanding` : 'All accounts clear'}
                  tone={data.openFollowups > 0 ? 'brand' : 'green'}
                  onClick={() => onNavigate('followups')}
                />
                <StatCard
                  icon="alertCircle" label="Overdue follow-ups"
                  value={data.overdueCount}
                  note="Past their scheduled date"
                  tone={data.overdueCount > 0 ? 'danger' : 'green'}
                  onClick={() => onNavigate('followups')}
                />
                <StatCard
                  icon="user" label="Need first contact"
                  value={data.needsFirst}
                  note="No interaction logged yet"
                  tone={data.needsFirst > 0 ? 'amber' : 'green'}
                  onClick={() => onNavigate('followups')}
                />
              </div>

              {/* wide screens: scan + actions left, activity right */}
              <div className="db-cols">
                <div className="db-col">
                  <OcrScanCard />
                  <div className="db-actions">
                    <button className="tw-btn" onClick={() => onNavigate('recapture')}>
                      <Icon name="clipboard" size={15} /> Go to capture queue {data.pendingCapture > 0 && `(${data.pendingCapture})`}
                    </button>
                    <button className="tw-btn" onClick={() => onNavigate('followups')}>
                      <Icon name="phone" size={15} /> View follow-ups {data.overdueCount > 0 && `· ${data.overdueCount} overdue`}
                    </button>
                  </div>
                </div>

                <div className="db-col">
                  <div className="db-card">
                    <div className="db-cardhead">
                      <span className="t">Recent activity</span>
                      <button className="tw-btn tw-btn--sm" onClick={() => onNavigate('followups')}>View all</button>
                    </div>
                    {data.recentActivity.length === 0 ? (
                      <div className="sl-noh">No activity yet.</div>
                    ) : (
                      data.recentActivity.map((entry) => <ActivityRow key={entry.id} entry={entry} />)
                    )}
                  </div>
                </div>
              </div>

              {/* backup status */}
              {data.lastBackup && (
                <div className="db-foot">
                  <Icon name={data.lastBackup.ok ? 'checkCircle' : 'alertCircle'} size={13} className={data.lastBackup.ok ? 'ok' : 'bad'} />
                  Last backup {fmtDate(data.lastBackup.at)}
                  {data.lastBackup.destination === 'onedrive' ? ' · OneDrive' : ' · Local folder'}
                  {!data.lastBackup.ok && data.lastBackup.error && ` · ${data.lastBackup.error}`}
                </div>
              )}
            </>
          ) : (
            <>
              <OcrScanCard />
              <div className="tw-empty">Could not load dashboard data. Check the server connection.</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
