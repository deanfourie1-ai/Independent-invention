import { useState, useEffect, useMemo } from 'react';
import Icon from '../components/Icon';
import {
  loadOcrFieldConfig,
  saveOcrFieldConfig,
  resetOcrFieldConfig,
  loadBethlehemOcrFieldConfig,
} from '../services/ocrFieldConfig';
import { buildOcrAccuracyReport } from '../services/ocrAccuracy';

const OCR_ENDPOINT_KEY = 'tidewell.ocr.endpoint';
const OCR_API_KEY_KEY  = 'tidewell.ocr.key';

const DOT_TONES_CYCLE = ['blue', 'green', 'amber', 'violet'];

function techInitials(name) {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

function readLS(key) {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}
function writeLS(key, val) {
  try { localStorage.setItem(key, val || ''); } catch {}
}

function fmtBackupDate(iso) {
  if (!iso) return '';
  const d   = new Date(iso);
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const p   = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtBytes(bytes) {
  if (bytes == null) return null;
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / (1024 ** 2))} MB`;
}

function fmtPct(value) {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

function accuracyTone(value) {
  if (!Number.isFinite(value)) return 'var(--ink-3)';
  if (value >= 0.9) return 'var(--success, #27ae60)';
  if (value >= 0.7) return 'var(--warning, #e67e22)';
  return 'var(--danger, #c0392b)';
}

/* ── shared feedback row ── */
function Alert({ ok, message }) {
  if (!message) return null;
  return (
    <div className={`ocr-alert ${ok ? 'ok' : 'danger'}`}>
      <Icon name={ok ? 'checkCircle' : 'alertCircle'} size={16} />
      <span>{message}</span>
    </div>
  );
}

/* ── section card shell ── */
function SectionCard({ title, subtitle, children }) {
  return (
    <div className="tw-card">
      <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--line)' }}>
        <div style={{ fontWeight:700, fontSize:14 }}>{title}</div>
        {subtitle && <div className="tw-muted" style={{ fontSize:13, marginTop:2 }}>{subtitle}</div>}
      </div>
      <div style={{ padding:18, display:'flex', flexDirection:'column', gap:14 }}>
        {children}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════ */
export default function SettingsPanel({ onBack }) {

  /* ── OneDrive state ── */
  const [odForm, setOdForm] = useState({
    tenantId: '', clientId: '', clientSecret: '', userId: '', folder: 'tidewell-scans',
  });
  const [secretConfigured, setSecretConfigured] = useState(false);
  const [odLoading, setOdLoading]   = useState(true);
  const [odSaving, setOdSaving]     = useState(false);
  const [odTesting, setOdTesting]   = useState(false);
  const [odSaveOk, setOdSaveOk]     = useState(false);
  const [odSaveErr, setOdSaveErr]   = useState('');
  const [odTestResult, setOdTestResult] = useState(null);

  /* ── OCR state ── */
  const [ocrEndpoint, setOcrEndpoint] = useState(() => readLS(OCR_ENDPOINT_KEY));
  const [ocrKey, setOcrKey]           = useState(() => readLS(OCR_API_KEY_KEY));
  const [ocrSaveOk, setOcrSaveOk]     = useState(false);

  /* ── Field mapping state ── */
  const [fieldConfig, setFieldConfig]       = useState(() => loadOcrFieldConfig());
  const [fieldSaveOk, setFieldSaveOk]       = useState(false);

  /* ── Backup status state ── */
  const [backupStatus, setBackupStatus] = useState(null);

  /* ── OCR accuracy state ── */
  const [accuracyJobs, setAccuracyJobs] = useState(null);
  const [accuracyErr, setAccuracyErr]   = useState('');

  /* ── Technicians state ── */
  const [techs, setTechs]             = useState([]);
  const [techsLoading, setTechsLoading] = useState(true);
  const [newTechName, setNewTechName] = useState('');
  const [techSaving, setTechSaving]   = useState(false);
  const [techSaveOk, setTechSaveOk]   = useState(false);
  const [techSaveErr, setTechSaveErr] = useState('');

  /* ── load backup status on mount ── */
  useEffect(() => {
    fetch('/api/backup-status')
      .then(r => r.json())
      .then(setBackupStatus)
      .catch(() => setBackupStatus({ ok: null, at: null }));
  }, []);

  /* ── load OneDrive config on mount ── */
  useEffect(() => {
    fetch('/api/config/onedrive')
      .then(r => r.json())
      .then(data => {
        if (data.configured) {
          setOdForm(f => ({
            ...f,
            tenantId: data.tenantId || '',
            clientId: data.clientId || '',
            userId:   data.userId   || '',
            folder:   data.folder   || 'tidewell-scans',
          }));
          setSecretConfigured(data.secretConfigured);
        }
      })
      .catch(() => {})
      .finally(() => setOdLoading(false));
  }, []);

  /* ── load jobs for the OCR accuracy report on mount ── */
  useEffect(() => {
    fetch('/api/jobs')
      .then(r => { if (!r.ok) throw new Error('Could not load jobs.'); return r.json(); })
      .then(data => setAccuracyJobs(Array.isArray(data) ? data : []))
      .catch(() => setAccuracyErr('Could not load jobs — accuracy report unavailable.'));
  }, []);

  /* ── load technicians on mount ── */
  useEffect(() => {
    fetch('/api/technicians')
      .then(r => r.json())
      .then(data => setTechs(data))
      .catch(() => {})
      .finally(() => setTechsLoading(false));
  }, []);

  /* ── OneDrive helpers ── */
  function odField(key) {
    return e => setOdForm(f => ({ ...f, [key]: e.target.value }));
  }

  async function saveOneDrive() {
    setOdSaving(true);
    setOdSaveOk(false);
    setOdSaveErr('');
    setOdTestResult(null);
    try {
      const body = { ...odForm };
      if (!body.clientSecret) delete body.clientSecret;
      const res = await fetch('/api/config/onedrive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Server error — settings were not saved.');
      setOdSaveOk(true);
      if (odForm.clientSecret) setSecretConfigured(true);
    } catch (err) {
      setOdSaveErr(err.message);
    } finally {
      setOdSaving(false);
    }
  }

  async function testOneDrive() {
    setOdTesting(true);
    setOdTestResult(null);
    setOdSaveOk(false);
    try {
      const res = await fetch('/api/config/onedrive/test');
      setOdTestResult(await res.json());
    } catch {
      setOdTestResult({ ok: false, error: 'Could not reach the test endpoint.' });
    } finally {
      setOdTesting(false);
    }
  }

  /* ── Technician helpers ── */
  function addTech() {
    const name = newTechName.trim();
    if (!name) return;
    const nums = techs.map(t => parseInt(String(t.id || '').replace(/^t/, ''), 10)).filter(n => !isNaN(n));
    const nextId = `t${nums.length > 0 ? Math.max(...nums) + 1 : 1}`;
    setTechs(prev => [...prev, { id: nextId, name }]);
    setNewTechName('');
    setTechSaveOk(false);
    setTechSaveErr('');
  }

  function removeTech(id) {
    setTechs(prev => prev.filter(t => t.id !== id));
    setTechSaveOk(false);
    setTechSaveErr('');
  }

  async function saveTechs() {
    setTechSaving(true);
    setTechSaveOk(false);
    setTechSaveErr('');
    try {
      const res = await fetch('/api/technicians', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(techs),
      });
      if (!res.ok) throw new Error('Server error — technicians were not saved.');
      setTechSaveOk(true);
      setTimeout(() => setTechSaveOk(false), 3000);
    } catch (err) {
      setTechSaveErr(err.message);
    } finally {
      setTechSaving(false);
    }
  }

  /* ── OCR save (localStorage only) ── */
  function saveOcr() {
    writeLS(OCR_ENDPOINT_KEY, ocrEndpoint.trim());
    writeLS(OCR_API_KEY_KEY,  ocrKey.trim());
    setOcrSaveOk(true);
    setTimeout(() => setOcrSaveOk(false), 3000);
  }

  /* ── Field mapping handlers ── */
  function updateFieldMatchers(fieldKey, rawText) {
    const patterns = rawText.split('\n').map(s => s.trim()).filter(Boolean);
    setFieldConfig(prev => ({ ...prev, [fieldKey]: { ...prev[fieldKey], keyMatchers: patterns } }));
    setFieldSaveOk(false);
  }
  function saveFieldMapping() {
    saveOcrFieldConfig(fieldConfig);
    setFieldSaveOk(true);
    setTimeout(() => setFieldSaveOk(false), 3000);
  }
  function resetFieldMapping() {
    setFieldConfig(resetOcrFieldConfig());
    setFieldSaveOk(false);
  }
  function loadBethlehemPreset() {
    setFieldConfig(loadBethlehemOcrFieldConfig());
    setFieldSaveOk(false);
  }

  const accuracyReport = useMemo(
    () => (accuracyJobs ? buildOcrAccuracyReport(accuracyJobs, { technicians: techs }) : null),
    [accuracyJobs, techs]
  );

  const odFullyConfigured =
    odForm.tenantId && odForm.clientId && (odForm.clientSecret || secretConfigured) && odForm.userId;

  return (
    <div className="tw" style={{ display:'flex', flexDirection:'column' }}>

      {/* ── header ── */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 22px', background:'var(--surface)', borderBottom:'1px solid var(--line)', flexShrink:0 }}>
        <button className="tw-btn tw-icbtn" onClick={onBack} aria-label="Back">
          <Icon name="chevL" size={17} />
        </button>
        <div style={{ flex:1 }}>
          <div className="tw-brand-name" style={{ fontSize:16 }}>Settings</div>
          <div className="tw-brand-sub">OCR &amp; OneDrive configuration</div>
        </div>
        {!odLoading && (
          odFullyConfigured
            ? <span className="tw-chip chip-captured"><span className="d" />OneDrive configured</span>
            : <span className="tw-chip chip-queue"><span className="d" />OneDrive not configured</span>
        )}
      </div>

      {/* ── scrollable body ── */}
      <div style={{ flex:1, overflow:'auto' }}>
      <div style={{ padding:'22px', display:'flex', flexDirection:'column', gap:20 }}>

        {/* ── Data backup status ── */}
        <SectionCard
          title="Data backup"
          subtitle="All data files are backed up automatically each time Jobtool starts."
        >
          {backupStatus === null ? (
            <div className="tw-muted" style={{ fontSize: 13 }}>Checking backup status…</div>
          ) : backupStatus.at ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <Icon
                name={backupStatus.ok ? 'checkCircle' : 'alertCircle'}
                size={18}
                style={{ flexShrink: 0, marginTop: 1, color: backupStatus.ok ? 'var(--success, #27ae60)' : 'var(--danger, #c0392b)' }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {backupStatus.ok
                    ? `Last backed up ${fmtBackupDate(backupStatus.at)} · ${backupStatus.destination === 'onedrive' ? 'OneDrive' : 'Local folder'}`
                    : `Last backup failed · ${fmtBackupDate(backupStatus.at)}`}
                </div>
                {backupStatus.ok && backupStatus.files?.length > 0 && (
                  <div className="tw-muted" style={{ fontSize: 12, marginTop: 3 }}>
                    {backupStatus.files.join(', ')} → {backupStatus.folder}
                  </div>
                )}
                {!backupStatus.ok && backupStatus.error && (
                  <div style={{ fontSize: 12, color: 'var(--danger, #c0392b)', marginTop: 3 }}>
                    {backupStatus.error}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="tw-muted" style={{ fontSize: 13 }}>
              No backup recorded yet — will run automatically on the next start.
            </div>
          )}
        </SectionCard>

        {/* ── Azure OCR section ── */}
        <SectionCard
          title="OCR import (Azure Layout)"
          subtitle="Azure Document Intelligence endpoint and key used to extract data from scanned job cards."
        >
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div className="tw-field">
              <label>Endpoint URL</label>
              <input
                type="text"
                placeholder="https://your-resource.cognitiveservices.azure.com"
                value={ocrEndpoint}
                onChange={e => { setOcrEndpoint(e.target.value); setOcrSaveOk(false); }}
              />
            </div>
            <div className="tw-field">
              <label>API key</label>
              <input
                type="password"
                placeholder="Azure Document Intelligence key"
                value={ocrKey}
                onChange={e => { setOcrKey(e.target.value); setOcrSaveOk(false); }}
              />
            </div>
          </div>

          <Alert ok={true} message={ocrSaveOk ? 'OCR settings saved.' : ''} />

          <div style={{ display:'flex', gap:10, paddingTop:4 }}>
            <button
              className="tw-btn tw-btn--primary"
              onClick={saveOcr}
              disabled={!ocrEndpoint.trim() || !ocrKey.trim()}
            >
              Save settings
            </button>
          </div>
        </SectionCard>

        {/* ── OneDrive section ── */}
        <SectionCard
          title="OneDrive storage"
          subtitle="Scanned job card images upload directly to OneDrive. No local copy is kept."
        >
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div className="tw-field">
              <label>Tenant ID</label>
              <input
                type="text"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={odForm.tenantId}
                onChange={odField('tenantId')}
              />
            </div>
            <div className="tw-field">
              <label>Client ID (Application ID)</label>
              <input
                type="text"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={odForm.clientId}
                onChange={odField('clientId')}
              />
            </div>
          </div>

          <div className="tw-field">
            <label>Client Secret</label>
            <input
              type="password"
              style={{ width:'100%' }}
              placeholder={
                secretConfigured
                  ? '●●●●●●●● (already configured — leave blank to keep current secret)'
                  : 'Paste the secret value from Azure portal → Certificates & secrets'
              }
              value={odForm.clientSecret}
              onChange={odField('clientSecret')}
            />
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div className="tw-field">
              <label>OneDrive user / UPN</label>
              <input
                type="text"
                placeholder="karin@tidewell.co.za"
                value={odForm.userId}
                onChange={odField('userId')}
              />
            </div>
            <div className="tw-field">
              <label>Folder name</label>
              <input
                type="text"
                placeholder="tidewell-scans"
                value={odForm.folder}
                onChange={odField('folder')}
              />
            </div>
          </div>

          {odTestResult && (
            <div className={`ocr-alert ${odTestResult.ok ? 'ok' : 'danger'}`}>
              <Icon name={odTestResult.ok ? 'checkCircle' : 'alertCircle'} size={16} />
              <span>
                {odTestResult.ok
                  ? `Connected · ${odTestResult.owner}'s OneDrive${odTestResult.used != null ? ` — ${fmtBytes(odTestResult.used)} used of ${fmtBytes(odTestResult.total)}` : ''}`
                  : `Connection failed: ${odTestResult.error}`}
              </span>
            </div>
          )}

          <Alert ok={true}  message={odSaveOk  ? 'OneDrive settings saved.' : ''} />
          <Alert ok={false} message={odSaveErr} />

          <div style={{ display:'flex', gap:10, paddingTop:4 }}>
            <button
              className="tw-btn"
              onClick={testOneDrive}
              disabled={odTesting || !odFullyConfigured}
            >
              {odTesting
                ? <><Icon name="sync" size={15} className="spin" />Testing...</>
                : <><Icon name="wifi" size={15} />Test connection</>}
            </button>
            <button
              className="tw-btn tw-btn--primary"
              onClick={saveOneDrive}
              disabled={odSaving}
            >
              {odSaving ? 'Saving...' : 'Save settings'}
            </button>
          </div>
        </SectionCard>

        {/* ── Technicians section ── */}
        <SectionCard
          title="Technicians"
          subtitle="Add or remove technicians. Names are used to normalise OCR-extracted values; up to 3 can be assigned per job."
        >
          {techsLoading ? (
            <div className="tw-muted" style={{ fontSize:13 }}>Loading…</div>
          ) : (
            <>
              {techs.length === 0 && (
                <div className="tw-muted" style={{ fontSize:13 }}>No technicians configured. Add one below.</div>
              )}
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {techs.map((tech, i) => (
                  <div key={tech.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 12px', background:'var(--surface-2,var(--surface))', border:'1px solid var(--line)', borderRadius:9 }}>
                    <span className={`dot tone-${DOT_TONES_CYCLE[i % DOT_TONES_CYCLE.length]}`} style={{ width:34, height:34, borderRadius:'50%', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0 }}>
                      {techInitials(tech.name)}
                    </span>
                    <span style={{ flex:1, fontWeight:600, fontSize:14 }}>{tech.name}</span>
                    <button
                      className="tw-btn tw-icbtn"
                      onClick={() => removeTech(tech.id)}
                      aria-label={`Remove ${tech.name}`}
                      style={{ color:'var(--danger,#c0392b)' }}
                    >
                      <Icon name="x" size={15} />
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display:'flex', gap:10, alignItems:'flex-end', paddingTop:4 }}>
                <div className="tw-field" style={{ flex:1 }}>
                  <label>Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Katleho Sithole"
                    value={newTechName}
                    onChange={e => setNewTechName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addTech(); }}
                  />
                </div>
                <button
                  className="tw-btn"
                  onClick={addTech}
                  disabled={!newTechName.trim()}
                  style={{ flexShrink:0 }}
                >
                  <Icon name="plus" size={15} /> Add
                </button>
              </div>

              <Alert ok={true}  message={techSaveOk  ? 'Technicians saved.' : ''} />
              <Alert ok={false} message={techSaveErr} />

              <div style={{ display:'flex', gap:10, paddingTop:4 }}>
                <button
                  className="tw-btn tw-btn--primary"
                  onClick={saveTechs}
                  disabled={techSaving || techs.length === 0}
                >
                  {techSaving ? 'Saving…' : 'Save technicians'}
                </button>
              </div>
            </>
          )}
        </SectionCard>

        {/* ── OCR accuracy section ── */}
        <SectionCard
          title="OCR accuracy"
          subtitle="How often each OCR-extracted field survives review unchanged, compared against the final values on the job cards. Use the weakest fields to guide the field-mapping patterns below."
        >
          {accuracyErr ? (
            <Alert ok={false} message={accuracyErr} />
          ) : accuracyReport === null ? (
            <div className="tw-muted" style={{ fontSize: 13 }}>Loading accuracy data…</div>
          ) : accuracyReport.jobCount === 0 ? (
            <div className="tw-muted" style={{ fontSize: 13 }}>
              No accuracy data yet. From now on, every capture record created from OCR stores the
              raw extracted values, and this report fills in as jobs are imported and reviewed.
            </div>
          ) : (
            <>
              <div className="tw-muted" style={{ fontSize: 13 }}>
                Based on <b>{accuracyReport.jobCount}</b> OCR-imported job
                {accuracyReport.jobCount === 1 ? '' : 's'}
                {accuracyReport.since ? ` since ${fmtBackupDate(accuracyReport.since)}` : ''}.
                Fields empty on both the scan and the job card are excluded.
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="tw-table">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Sampled</th>
                      <th>Accepted unchanged</th>
                      <th>Corrected</th>
                      <th>Missed by OCR</th>
                      <th>Avg OCR confidence</th>
                      <th style={{ minWidth: 140 }}>Accuracy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accuracyReport.rows.map((row) => (
                      <tr key={row.key}>
                        <td style={{ fontWeight: 600 }}>{row.label}</td>
                        <td>{row.sampled}</td>
                        <td>{row.accepted}</td>
                        <td>{row.corrected}</td>
                        <td>{row.missed}</td>
                        <td>{fmtPct(row.avgConfidence)}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--surface-3, #eee)', overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: Number.isFinite(row.accuracy) ? `${Math.round(row.accuracy * 100)}%` : 0,
                                  height: '100%',
                                  borderRadius: 3,
                                  background: accuracyTone(row.accuracy),
                                }}
                              />
                            </div>
                            <span style={{ fontWeight: 700, fontSize: 12, minWidth: 34, textAlign: 'right', color: accuracyTone(row.accuracy) }}>
                              {fmtPct(row.accuracy)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </SectionCard>

        {/* ── Field mapping section ── */}
        <SectionCard
          title="OCR field mapping"
          subtitle="Regex patterns that identify each field from scanned job cards. One pattern per line."
        >
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            {Object.entries(fieldConfig).map(([key, cfg]) => (
              <div key={key}>
                <div style={{ fontSize:11, fontWeight:700, letterSpacing:'.04em', textTransform:'uppercase', color:'var(--ink-3)', marginBottom:5 }}>
                  {cfg.label || key}
                </div>
                <textarea
                  style={{ width:'100%', minHeight:76, resize:'vertical', padding:'8px 10px', border:'1px solid var(--line-strong)', borderRadius:9, fontFamily:'var(--mono,monospace)', fontSize:12, lineHeight:1.5, background:'var(--surface)', color:'var(--ink)' }}
                  value={(cfg.keyMatchers || []).join('\n')}
                  onChange={e => updateFieldMatchers(key, e.target.value)}
                  placeholder="One regex per line"
                />
              </div>
            ))}
          </div>

          <Alert ok={true} message={fieldSaveOk ? 'Field mapping saved.' : ''} />

          <div style={{ display:'flex', gap:10, flexWrap:'wrap', paddingTop:4 }}>
            <button className="tw-btn" onClick={resetFieldMapping}>
              <Icon name="refresh" size={15} /> Reset to defaults
            </button>
            <button className="tw-btn" onClick={loadBethlehemPreset}>
              <Icon name="clipboard" size={15} /> Load Bethlehem preset
            </button>
            <button className="tw-btn tw-btn--primary" onClick={saveFieldMapping}>
              Save mapping
            </button>
          </div>
        </SectionCard>

        {/* ── help callout ── */}
        <div className="callout">
          <div className="co-ic" style={{ marginTop:2 }}>
            <Icon name="alert" size={18} />
          </div>
          <div className="co-t">
            <b>OCR:</b> Find the endpoint and key in the Azure portal under your Document Intelligence resource → Keys and Endpoint.
            {' '}<b>OneDrive:</b> Sign in to <b>entra.microsoft.com</b> → App registrations → open the Tidewell Admin Panel app. Tenant ID and Client ID are on the Overview page; Client Secret is under <em>Certificates &amp; secrets</em>. The UPN is the Microsoft 365 email of the OneDrive owner. Ensure <b>Files.ReadWrite.All</b> application permission has admin consent and the OneDrive owner has signed in to OneDrive at least once.
          </div>
        </div>

      </div>{/* inner max-width content */}
      </div>{/* outer scroll container */}
    </div>
  );
}
