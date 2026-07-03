import { useState, useEffect, useRef } from 'react';
import Icon from '../components/Icon';
import Worklist from './Worklist';
import CaptureChecklist from './CaptureChecklist';
import ChecklistConfig from './ChecklistConfig';
import SettingsPanel from './SettingsPanel';
import CheerScreen from './CheerScreen';
import OcrExtractionPanel from './OcrExtractionPanel';
import DigitalJobCard from './DigitalJobCard';
import HistoryPanel from './HistoryPanel';
import DetailDrawer from './DetailDrawer';
import useAdminJobs from '../hooks/useAdminJobs';
import { deleteJob as deleteStoredJob, patchJob } from '../services/storage';
import { findCustomerMatch } from '../services/nameMatcher';
import { getStagedDocs, subscribeStagedDocs } from '../services/stagedDocs';
import { ADMIN_TAB_HINT_KEY } from './DashboardPanel';

const DEFAULT_TASKS = [
  'Open new order in Sage Online',
  'Paste job reference into Order > Reference',
  'Set technician as the order resource',
  'Enter customer name and address',
  'Enter job date and time',
  'Copy "Job done" into description',
  'Add materials used to order notes',
  'Save order and mark card captured',
].map((text, i) => ({ id: 'd' + (i + 1), text }));

const TASKS_KEY = 'tidewell.admin.checklist';
const PROGRESS_KEY = 'tidewell.admin.captureV2';

// Temporarily suppress the capture checklist — finishing only needs an invoice
// number. Flip to true to bring the checklist back.
const SHOW_CHECKLIST = false;

function loadTasks() {
  try {
    const stored = JSON.parse(localStorage.getItem(TASKS_KEY));
    if (Array.isArray(stored) && stored.length) return stored;
  } catch (_) {}
  return DEFAULT_TASKS.map((t) => ({ ...t }));
}

function loadProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; } catch (_) { return {}; }
}

/* A card is "finished" once it carries a capturedAt timestamp. That is the
   single source of truth — independent of the current checklist — so editing
   the checklist can never pull a finished card back into the capture queue. */
const isFinished = (job) => Boolean(job.capturedAt);
const isInQueue = (job) => job.status === 'printed' && !isFinished(job);

const DELETE_REASON_CODES = [
  { code: 'duplicate', label: 'Duplicate card' },
  { code: 'illegible', label: 'Illegible / unusable print' },
  { code: 'cancelled', label: 'Job cancelled' },
  { code: 'captured_in_error', label: 'Captured / finished in error' },
  { code: 'test_entry', label: 'Test / training entry' },
  { code: 'wrong_queue', label: 'Wrongly added to capture queue' },
];

const TABS = [
  { id: 'ocr',     icon: 'file',      label: 'OCR' },
  { id: 'capture', icon: 'clipboard', label: 'Pending' },
  { id: 'history', icon: 'clock',     label: 'History' },
];

/* The dashboard's "open the OCR tab" button leaves a one-shot hint so this
   workspace opens on the right tab. Reading must stay side-effect free —
   StrictMode invokes state initializers twice — so the hint is cleared in a
   mount effect instead of here. */
function readTabHint() {
  try {
    const hint = sessionStorage.getItem(ADMIN_TAB_HINT_KEY);
    if (hint && TABS.some((t) => t.id === hint)) return hint;
  } catch (_) {}
  return '';
}

function Brand() {
  return (
    <div className="tw-brand">
      <div className="tw-logo">
        <Icon name="droplet" size={18} />
      </div>
      <div>
        <div className="tw-brand-name">Jobtool</div>
        <div className="tw-brand-sub">Admin recapture</div>
      </div>
    </div>
  );
}

function SettingsMenu({ onEditChecklist, onExport, onOpenSettings, exporting, canExport }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function close(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="tw-menu-wrap" ref={ref}>
      <button className="tw-btn tw-icbtn" onClick={() => setOpen((o) => !o)} aria-label="Settings">
        <Icon name="settings" size={17} />
      </button>
      {open && (
        <div className="tw-menu">
          <button type="button" onClick={() => { onEditChecklist(); setOpen(false); }}>
            <Icon name="edit" size={16} />
            Edit checklist
          </button>
          <div className="sep" />
          <button
            type="button"
            onClick={() => { onExport(); setOpen(false); }}
            disabled={!canExport || exporting}
          >
            <Icon name="file" size={16} />
            {exporting ? 'Exporting...' : 'Export completed jobs'}
          </button>
          <div className="sep" />
          <button type="button" onClick={() => { onOpenSettings(); setOpen(false); }}>
            <Icon name="settings" size={16} />
            Settings
          </button>
        </div>
      )}
    </div>
  );
}

export default function AdminApp({ workspaceSwitch }) {
  const { ready, jobs } = useAdminJobs();

  /* Cards still waiting to be captured (drives the capture screen). */
  const queue = jobs.filter(isInQueue);
  /* Finished cards (live in History). */
  const finished = jobs.filter(isFinished);
  const hasPrintedCards = jobs.some((j) => j.status === 'printed');
  const todayStr = new Date().toISOString().slice(0, 10);
  const capturedToday = finished.filter((j) => (j.capturedAt || '').slice(0, 10) === todayStr).length;

  const [followupCustomers, setFollowupCustomers] = useState([]);
  const [tasks, setTasks] = useState(loadTasks);
  const [progress, setProgress] = useState(loadProgress);
  const [view, setView] = useState('work');
  const [tab, setTab] = useState(() => readTabHint() || 'capture');
  const [ocrDocs, setOcrDocs] = useState(getStagedDocs);
  const ocrReviewCount = ocrDocs.filter((d) => d.status === 'ready').length;
  const [selId, setSelId] = useState(null);
  const [historyRow, setHistoryRow] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteReason, setDeleteReason] = useState(DELETE_REASON_CODES[0].code);
  const [deleteNotes, setDeleteNotes] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [reopenTarget, setReopenTarget] = useState(null);
  const [reopening, setReopening] = useState(false);
  const [exporting, setExporting] = useState(false);

  /* Consume the one-shot tab hint once this workspace has mounted on it. */
  useEffect(() => {
    try { sessionStorage.removeItem(ADMIN_TAB_HINT_KEY); } catch (_) {}
  }, []);

  /* Background OCR (dashboard) drops finished scans into the shared staged-
     docs store — keep the OCR tab badge live while working in here. */
  useEffect(() => subscribeStagedDocs(() => setOcrDocs(getStagedDocs())), []);

  useEffect(() => {
    fetch('/api/customers')
      .then((r) => r.json())
      .then((list) => { if (Array.isArray(list)) setFollowupCustomers(list.filter((c) => !c.settled)); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    try { localStorage.setItem(TASKS_KEY, JSON.stringify(tasks)); } catch (_) {}
  }, [tasks]);

  useEffect(() => {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (_) {}
  }, [progress]);

  const selValid = selId && queue.some((j) => j.id === selId);
  const job = queue.length === 0 ? null : selValid ? queue.find((j) => j.id === selId) : queue[0];

  if (view === 'config') {
    return (
      <ChecklistConfig
        tasks={tasks}
        setTasks={setTasks}
        defaults={DEFAULT_TASKS}
        onBack={() => setView('work')}
      />
    );
  }

  if (view === 'settings') {
    return <SettingsPanel onBack={() => setView('work')} />;
  }

  if (!ready) {
    return (
      <div className="tw" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--ink-2)' }}>
          <Icon name="sync" size={36} className="spin" />
          <p style={{ marginTop: 12, fontWeight: 600 }}>Loading recapture queue...</p>
        </div>
      </div>
    );
  }

  const jobRec = progress[job?.id] || {};

  function toggleTask(taskId) {
    if (!job) return;
    const current = progress[job.id] || {};
    setProgress((p) => ({ ...p, [job.id]: { ...current, [taskId]: !current[taskId] } }));
  }

  function selectJob(id) {
    setSelId(id);
  }

  function handleOcrCreated(createdJob) {
    if (!createdJob?.id) return;
    setSelId(createdJob.id);
  }

  async function saveInvoiceNumber(jobId, invoiceNumber, invoiceCustomer) {
    await patchJob(
      jobId,
      {
        invoiceNumber: String(invoiceNumber || '').trim(),
        invoiceCustomer: String(invoiceCustomer || '').trim(),
      },
      'invoice_ref'
    );
  }

  /* Explicit finish: marks the card captured (permanent) and advances. The
     checklist component validates the invoice number before calling this. */
  async function finishJob(jobId) {
    await patchJob(jobId, { capturedAt: new Date().toISOString() });
    setSelId(null);
  }

  async function exportCompletedJobs() {
    if (!finished.length || exporting) return;
    setExporting(true);
    try {
      const xlsx = await import('xlsx');
      const rows = finished.map((item) => ({
        ID: item.ref || item.id,
        Date: item.date || '',
        Name: item.customer?.name || '',
        'Invoice customer': item.invoiceCustomer || item.customer?.name || '',
        'Invoice number': item.invoiceNumber || '',
      }));
      const workbook = xlsx.utils.book_new();
      const worksheet = xlsx.utils.json_to_sheet(rows, {
        header: ['ID', 'Date', 'Name', 'Invoice customer', 'Invoice number'],
      });
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Completed Jobs');
      const stamp = new Date().toISOString().slice(0, 10);
      xlsx.writeFileXLSX(workbook, `captured-jobs-${stamp}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  function openDeleteDialog(targetJob) {
    if (!targetJob) return;
    setDeleteTarget(targetJob);
    setDeleteReason(DELETE_REASON_CODES[0].code);
    setDeleteNotes('');
    setDeleteError('');
  }

  function closeDeleteDialog() {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteReason(DELETE_REASON_CODES[0].code);
    setDeleteNotes('');
    setDeleteError('');
  }

  async function confirmDeleteJob() {
    if (!deleteTarget) return;
    if (!deleteReason) {
      setDeleteError('Select a reason code before deleting this card.');
      return;
    }
    setDeleting(true);
    setDeleteError('');
    try {
      await deleteStoredJob(deleteTarget.id, {
        reasonCode: deleteReason,
        reasonNotes: deleteNotes,
        deletedBy: 'admin',
      });
      setProgress((current) => {
        const next = { ...current };
        delete next[deleteTarget.id];
        return next;
      });
      if (selId === deleteTarget.id) setSelId(null);
      if (historyRow?.id === deleteTarget.id) setHistoryRow(null);
      closeDeleteDialog();
    } catch (err) {
      setDeleteError(err?.message || 'Could not delete this job card.');
    } finally {
      setDeleting(false);
    }
  }

  /* Reopen a finished card — clears capturedAt so it returns to the capture
     queue (with its checklist ticks intact) for correction. */
  async function confirmReopen() {
    if (!reopenTarget) return;
    setReopening(true);
    try {
      await patchJob(reopenTarget.id, { capturedAt: null });
      if (historyRow?.id === reopenTarget.id) setHistoryRow(null);
      setSelId(reopenTarget.id);
      setReopenTarget(null);
      setTab('capture');
    } finally {
      setReopening(false);
    }
  }

  return (
    <div className="tw">
      {/* brand topbar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, padding:'12px 22px', background:'var(--surface)', borderBottom:'1px solid var(--line)', flexShrink:0 }}>
        <Brand />
        {workspaceSwitch}
        <SettingsMenu
          onEditChecklist={() => setView('config')}
          onExport={exportCompletedJobs}
          onOpenSettings={() => setView('settings')}
          exporting={exporting}
          canExport={finished.length > 0}
        />
      </div>

      {/* page heading + tabs */}
      <div style={{ padding:'16px 22px 0', flexShrink:0 }}>
        <h1 className="tw-h1">Admin recapture</h1>
        <div className="tw-sub">Printed card → Sage Online · same labels both sides</div>
        <div className="tw-tabs" style={{ borderBottom:'1px solid var(--line)', paddingBottom:0, gap:6, marginTop:14 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={'tw-tab' + (tab === t.id ? ' is-active' : '')}
              style={{ borderRadius:'9px 9px 0 0', marginBottom:-1 }}
              onClick={() => setTab(t.id)}
            >
              <Icon name={t.icon} size={16} />
              {t.label}
              {t.id === 'capture' && queue.length > 0 && (
                <span className="tw-count tw-count--alert">{queue.length}</span>
              )}
              {t.id === 'ocr' && ocrReviewCount > 0 && (
                <span className="tw-count">{ocrReviewCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* scrollable body */}
      <div style={{ flex:1, overflow:'auto', padding:'18px 22px 22px' }}>
        {tab === 'ocr' && (
          <OcrExtractionPanel job={job} onCreated={handleOcrCreated} />
        )}

        {tab === 'capture' && (
          queue.length === 0 ? (
            hasPrintedCards ? (
              <CheerScreen captured={capturedToday} onReview={() => setTab('history')} />
            ) : (
              <div className="tw-empty">
                <Icon name="inbox" size={40} />
                <p style={{ margin:'12px 0 16px', fontWeight:600 }}>No printed cards waiting for capture.</p>
                <button className="tw-btn tw-btn--primary" onClick={() => setTab('ocr')}>
                  <Icon name="file" size={16} /> Open OCR tab
                </button>
              </div>
            )
          ) : (
            <div className="cap-wrap">
              <Worklist
                queue={queue}
                tasks={tasks}
                progress={progress}
                selectedId={job?.id}
                onSelect={selectJob}
                onDelete={openDeleteDialog}
                showChecklist={SHOW_CHECKLIST}
              />

              <div>
                {job && (
                  <DigitalJobCard
                    job={job}
                    onUpdate={(patch) => patchJob(job.id, patch).catch(() => {})}
                    followupMatch={findCustomerMatch(job.customer?.name, followupCustomers)}
                  />
                )}
              </div>

              {job && (
                <CaptureChecklist
                  job={job}
                  tasks={tasks}
                  progress={jobRec}
                  onToggle={toggleTask}
                  onSaveInvoice={saveInvoiceNumber}
                  onFinish={finishJob}
                  showChecklist={SHOW_CHECKLIST}
                />
              )}
            </div>
          )
        )}

        {tab === 'history' && (
          <HistoryPanel
            jobs={jobs}
            onRowSelect={setHistoryRow}
            onReopen={setReopenTarget}
            onDelete={openDeleteDialog}
          />
        )}
      </div>

      {/* slide-in drawer for history */}
      <DetailDrawer row={historyRow} onClose={() => setHistoryRow(null)} />

      {/* delete modal */}
      {deleteTarget && (
        <div className="admin-modal-scrim" role="presentation" onClick={closeDeleteDialog}>
          <div className="admin-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <h3>Delete job card</h3>
              <button className="ghost-icon" type="button" onClick={closeDeleteDialog} aria-label="Close delete dialog">
                <Icon name="x" size={16} />
              </button>
            </div>
            <p className="admin-modal-sub">
              This permanently removes <span className="mono">{deleteTarget.ref}</span>. Choose a reason code.
            </p>
            <label className="field-group" style={{ marginBottom: 12 }}>
              <span className="field-lbl">Reason code</span>
              <select className="select" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)}>
                {DELETE_REASON_CODES.map((reason) => (
                  <option key={reason.code} value={reason.code}>{reason.label}</option>
                ))}
              </select>
            </label>
            <label className="field-group" style={{ marginBottom: 10 }}>
              <span className="field-lbl">Notes (optional)</span>
              <textarea
                className="input"
                placeholder="Add context for the office team"
                value={deleteNotes}
                onChange={(e) => setDeleteNotes(e.target.value)}
              />
            </label>
            {deleteError && (
              <div className="ocr-alert danger" style={{ marginBottom: 10 }}>
                <Icon name="alertCircle" size={16} />
                <span>{deleteError}</span>
              </div>
            )}
            <div className="admin-modal-actions">
              <button className="btn btn-ghost" type="button" onClick={closeDeleteDialog} disabled={deleting}>
                Cancel
              </button>
              <button className="btn btn-danger" type="button" onClick={confirmDeleteJob} disabled={deleting}>
                <Icon name="trash" size={16} />
                <span>{deleting ? 'Deleting...' : 'Delete card'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* reopen modal */}
      {reopenTarget && (
        <div className="admin-modal-scrim" role="presentation" onClick={() => !reopening && setReopenTarget(null)}>
          <div className="admin-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <h3>Reopen for capture</h3>
              <button className="ghost-icon" type="button" onClick={() => !reopening && setReopenTarget(null)} aria-label="Close reopen dialog">
                <Icon name="x" size={16} />
              </button>
            </div>
            <p className="admin-modal-sub">
              This moves <span className="mono">{reopenTarget.ref}</span> out of History and back into the
              capture queue so you can correct it. Its checklist ticks are kept.
            </p>
            <div className="admin-modal-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setReopenTarget(null)} disabled={reopening}>
                Cancel
              </button>
              <button className="btn btn-primary" type="button" onClick={confirmReopen} disabled={reopening}>
                <Icon name="sync" size={16} />
                <span>{reopening ? 'Reopening...' : 'Reopen card'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
