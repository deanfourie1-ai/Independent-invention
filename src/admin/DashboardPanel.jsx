import { useState, useEffect, useCallback } from 'react';
import Icon from '../components/Icon';

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtR(n) { return 'R ' + Number(n || 0).toLocaleString('en-ZA'); }

const DID_LABEL = { call: 'Called', whatsapp: 'WhatsApp', email: 'Emailed', visit: 'Visited', note: 'Note' };

function StatCard({ icon, label, value, note, tone, onClick }) {
  const toneColors = {
    alert:   { bg: '#fff3e0', border: '#ffcc80', icon: '#ef6c00', val: '#bf360c' },
    warning: { bg: '#fffde7', border: '#fff176', icon: '#f9a825', val: '#e65100' },
    ok:      { bg: '#e8f5e9', border: '#a5d6a7', icon: '#2e7d32', val: '#1b5e20' },
    neutral: { bg: 'var(--surface)', border: 'var(--line)', icon: 'var(--ink-2)', val: 'var(--ink-1)' },
  };
  const c = toneColors[tone] || toneColors.neutral;
  return (
    <div
      onClick={onClick}
      style={{
        background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10,
        padding: '16px 18px', cursor: onClick ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', gap: 6,
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={(e) => { if (onClick) e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={16} style={{ color: c.icon }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: c.val, lineHeight: 1 }}>{value ?? '—'}</div>
      {note && <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{note}</div>}
    </div>
  );
}

function ActivityRow({ entry }) {
  const verb = DID_LABEL[entry.did] || entry.did;
  const said = entry.said?.length > 80 ? entry.said.slice(0, 80) + '…' : entry.said;
  return (
    <div style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line)', alignItems: 'flex-start' }}>
      <div style={{ minWidth: 120, fontSize: 12, color: 'var(--ink-2)', paddingTop: 1 }}>
        <div style={{ fontWeight: 600, color: 'var(--ink-1)', fontSize: 13 }}>{entry.customerName}</div>
        <div>{entry.date}</div>
      </div>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 11, fontWeight: 600, background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 4, padding: '1px 6px', marginRight: 6, color: 'var(--ink-2)' }}>{verb}</span>
        <span style={{ fontSize: 13, color: 'var(--ink-1)' }}>{said}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-3, var(--ink-2))', whiteSpace: 'nowrap' }}>{entry.by}</div>
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
  const [refreshed, setRefreshed] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((d) => { setData(d); setRefreshed(new Date().toISOString()); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const [y, m, d] = today.split('-').map(Number);
  const todayDisp = `${d} ${MON[m - 1]} ${y}`;

  return (
    <div className="tw">
      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 22px', background: 'var(--surface)', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <Brand />
        {workspaceSwitch}
        <button className="tw-btn tw-icbtn" onClick={load} title="Refresh" disabled={loading}>
          <Icon name="refresh" size={17} className={loading ? 'spin' : ''} />
        </button>
      </div>

      {/* body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '18px 22px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 18 }}>
          <h1 className="tw-h1" style={{ margin: 0 }}>Dashboard</h1>
          <span className="tw-sub" style={{ margin: 0 }}>{todayDisp}{refreshed ? ` · updated ${fmtDate(refreshed).slice(12)}` : ''}</span>
        </div>

        {!data && loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--ink-2)' }}>
            <Icon name="sync" size={32} className="spin" />
            <p style={{ marginTop: 12 }}>Loading…</p>
          </div>
        ) : data ? (
          <>
            {/* stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              <StatCard
                icon="clipboard" label="In capture queue"
                value={data.pendingCapture}
                note={data.capturedToday > 0 ? `${data.capturedToday} captured today` : 'Jobs awaiting recapture'}
                tone={data.pendingCapture > 5 ? 'warning' : data.pendingCapture > 0 ? 'neutral' : 'ok'}
                onClick={() => onNavigate('recapture')}
              />
              <StatCard
                icon="phone" label="Open follow-ups"
                value={data.openFollowups}
                note={data.totalOutstanding > 0 ? `${fmtR(data.totalOutstanding)} outstanding` : 'All accounts clear'}
                tone={data.openFollowups > 0 ? 'neutral' : 'ok'}
                onClick={() => onNavigate('followups')}
              />
              <StatCard
                icon="alertCircle" label="Overdue follow-ups"
                value={data.overdueCount}
                note="Past their scheduled date"
                tone={data.overdueCount > 0 ? 'alert' : 'ok'}
                onClick={() => onNavigate('followups')}
              />
              <StatCard
                icon="user" label="Need first contact"
                value={data.needsFirst}
                note="No interaction logged yet"
                tone={data.needsFirst > 0 ? 'warning' : 'ok'}
                onClick={() => onNavigate('followups')}
              />
            </div>

            {/* quick actions */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <button className="tw-btn" onClick={() => onNavigate('recapture')}>
                <Icon name="clipboard" size={15} /> Go to capture queue {data.pendingCapture > 0 && `(${data.pendingCapture})`}
              </button>
              <button className="tw-btn" onClick={() => onNavigate('followups')}>
                <Icon name="phone" size={15} /> View follow-ups {data.overdueCount > 0 && `· ${data.overdueCount} overdue`}
              </button>
            </div>

            {/* recent activity */}
            <div className="tw-card" style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Recent follow-up activity</span>
                <button className="tw-btn tw-btn--sm" onClick={() => onNavigate('followups')}>View all</button>
              </div>
              {data.recentActivity.length === 0 ? (
                <div className="sl-noh">No interactions logged yet.</div>
              ) : (
                data.recentActivity.map((entry) => <ActivityRow key={entry.id} entry={entry} />)
              )}
            </div>

            {/* backup status */}
            {data.lastBackup && (
              <div style={{ fontSize: 12, color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name={data.lastBackup.ok ? 'checkCircle' : 'alertCircle'} size={13} style={{ color: data.lastBackup.ok ? '#27ae60' : '#c0392b' }} />
                Last backup {fmtDate(data.lastBackup.at)}
                {data.lastBackup.destination === 'onedrive' ? ' · OneDrive' : ' · Local folder'}
                {!data.lastBackup.ok && data.lastBackup.error && ` · ${data.lastBackup.error}`}
              </div>
            )}
          </>
        ) : (
          <div className="tw-empty">Could not load dashboard data. Check the server connection.</div>
        )}
      </div>
    </div>
  );
}
