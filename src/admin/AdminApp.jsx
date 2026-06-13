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

const activeOf = (tasks) => tasks.filter((t) => t.text.trim());
const countDone = (rec, tasks) => activeOf(tasks).reduce((n, t) => n + (rec?.[t.id] ? 1 : 0), 0);
const isComplete = (rec, tasks) => {
  const a = activeOf(tasks);
  return a.length > 0 && a.every((t) => rec?.[t.id]);
};

const DELETE_REASON_CODES = [
  { code: 'duplicate', label: 'Duplicate card' },
  { code: 'illegible', label: 'Illegible / unusable print' },
  { code: 'cancelled', label: 'Job cancelled' },
  { code: 'test_entry', label: 'Test / training entry' },
  { code: 'wrong_queue', label: 'Wrongly added to capture queue' },
];

const TABS = [
  { id: 'ocr',     icon: 'file',      label: 'OCR' },
  { id: 'capture', icon: 'clipboard', label: 'Capture' },
  { id: 'history', icon: 'clock',     label: 'History' },
];

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

export default function AdminApp() {
  const { ready, jobs } = useAdminJobs();
  const printed = jobs.filter((j) => j.status === 'printed');

  const [tasks, setTasks] = useState(loadTasks);
  const [progress, setProgress] = useState(loadProgress);
  const [view, setView] = useState('work');
  const [tab, setTab] = useState('capture');
  const [selId, setSelId] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [showCaptured, setShowCaptured] = useState(false);
  const [historyRow, setHistoryRow] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteReason, setDeleteReason] = useState(DELETE_REASON_CODES[0].code);
  const [deleteNotes, setDeleteNotes] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(TASKS_KEY, JSON.stringify(tasks)); } catch (_) {}
  }, [tasks]);

  useEffect(() => {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (_) {}
  }, [progress]);

  const outstanding = printed.filter((j) => !isComplete(progress[j.id], tasks));
  const captured = printed.filter((j) => isComplete(progress[j.id], tasks));

  const selValid = selId && printed.some((j) => j.id === selId);
  const job = printed.length === 0
    ? null
    : selValid
    ? printed.find((j) => j.id === selId)
    : (outstanding[0] ?? printed[0]);

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
  const jobComplete = job ? isComplete(progress[job.id], tasks) : false;

  function toggleTask(taskId) {
    if (!job) return;
    const current = progress[job.id] || {};
    const newRec = { ...current, [taskId]: !current[taskId] };
    setProgress((p) => ({ ...p, [job.id]: newRec }));
    if (isComplete(newRec, tasks) && !job.capturedAt) {
      patchJob(job.id, { capturedAt: new Date().toISOString() });
    }
  }

  function goNext() {
    if (!job) return;
    const next = outstanding.find((j) => j.id !== job?.id);
    if (next) { setSelId(next.id); setReviewing(false); }
    else { setReviewing(false); setSelId(null); }
  }

  function selectJob(id, isReview = false) {
    setSelId(id);
    if (isReview) setReviewing(true);
  }

  function handleOcrCreated(createdJob) {
    if (!createdJob?.id) return;
    setSelId(createdJob.id);
    setReviewing(false);
    setShowCaptured(false);
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

  async function exportCompletedJobs() {
    if (!captured.length || exporting) return;
    setExporting(true);
    try {
      const xlsx = await import('xlsx');
      const rows = captured.map((item) => ({
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
      closeDeleteDialog();
    } catch (err) {
      setDeleteError(err?.message || 'Could not delete this job card.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="tw">
      {/* brand topbar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 22px', background:'var(--surface)', borderBottom:'1px solid var(--line)', flexShrink:0 }}>
        <Brand />
        <SettingsMenu
          onEditChecklist={() => setView('config')}
          onExport={exportCompletedJobs}
          onOpenSettings={() => setView('settings')}
          exporting={exporting}
          canExport={captured.length > 0}
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
              {t.id === 'capture' && outstanding.length > 0 && (
                <span className="tw-count tw-count--alert">{outstanding.length}</span>
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
          printed.length === 0 ? (
            <div className="tw-empty">
              <Icon name="inbox" size={40} />
              <p style={{ margin:'12px 0 16px', fontWeight:600 }}>No printed cards waiting for capture.</p>
              <button className="tw-btn tw-btn--primary" onClick={() => setTab('ocr')}>
                <Icon name="file" size={16} /> Open OCR tab
              </button>
            </div>
          ) : outstanding.length === 0 && !reviewing ? (
            <CheerScreen
              captured={captured.length}
              onReview={() => {
                setReviewing(true);
                setShowCaptured(true);
                setSelId(captured[0]?.id ?? null);
              }}
            />
          ) : (
            <div className="cap-wrap">
              <Worklist
                outstanding={outstanding}
                captured={captured}
                tasks={tasks}
                progress={progress}
                selectedId={job?.id}
                onSelect={selectJob}
                showCaptured={showCaptured}
                onToggleCaptured={() => setShowCaptured((s) => !s)}
                onDeleteOutstanding={openDeleteDialog}
              />

              <div>
                {jobComplete && (
                  <div className="cap-success">
                    <div className="sr-ic"><Icon name="checkCircle" size={20} /></div>
                    <div style={{ flex:1 }}>
                      <div className="sr-title">Captured into Sage Online</div>
                      <div className="sr-sub">{job.customer.name} · {job.ref} is fully entered.</div>
                    </div>
                    <button className="tw-btn tw-btn--primary" onClick={goNext}>
                      {outstanding.length > 1
                        ? <><span>Next order</span><Icon name="arrowRight" size={17} /></>
                        : <><Icon name="check" size={17} stroke={3} /><span>Finish up</span></>}
                    </button>
                  </div>
                )}
                {job && <DigitalJobCard job={job} />}
              </div>

              {job && (
                <CaptureChecklist
                  job={job}
                  tasks={tasks}
                  progress={jobRec}
                  onToggle={toggleTask}
                  onSaveInvoice={saveInvoiceNumber}
                  onNext={goNext}
                  hasNext={outstanding.length > 1}
                />
              )}
            </div>
          )
        )}

        {tab === 'history' && (
          <HistoryPanel jobs={jobs} onRowSelect={setHistoryRow} />
        )}
      </div>

      {/* slide-in drawer for history */}
      <DetailDrawer row={historyRow} onClose={() => setHistoryRow(null)} />

      {/* delete modal */}
      {deleteTarget && (
        <div className="admin-modal-scrim" role="presentation" onClick={closeDeleteDialog}>
          <div className="admin-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <h3>Delete from capture queue</h3>
              <button className="ghost-icon" type="button" onClick={closeDeleteDialog} aria-label="Close delete dialog">
                <Icon name="x" size={16} />
              </button>
            </div>
            <p className="admin-modal-sub">
              This removes <span className="mono">{deleteTarget.ref}</span> from admin recapture. Choose a reason code.
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
    </div>
  );
}
