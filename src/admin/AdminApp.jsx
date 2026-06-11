import { useState, useEffect } from 'react';
import Icon from '../components/Icon';
import Worklist from './Worklist';
import CaptureChecklist from './CaptureChecklist';
import ChecklistConfig from './ChecklistConfig';
import CheerScreen from './CheerScreen';
import OcrExtractionPanel from './OcrExtractionPanel';
import DigitalJobCard from './DigitalJobCard';
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

export default function AdminApp() {
  const { ready, jobs } = useAdminJobs();
  const printed = jobs.filter((j) => j.status === 'printed');

  const [tasks, setTasks] = useState(loadTasks);
  const [progress, setProgress] = useState(loadProgress);
  const [view, setView] = useState('work'); // 'work' | 'config'
  const [tab, setTab] = useState('capture'); // 'capture' | 'ocr'
  const [selId, setSelId] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [showCaptured, setShowCaptured] = useState(false);
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

  // Resolve selected job
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

  if (!ready) {
    return (
      <div className="desk">
        <div className="desk-body">
          <div className="empty-state">
            <Icon name="sync" size={36} className="spin" />
            <p>Loading recapture queue...</p>
          </div>
        </div>
      </div>
    );
  }

  const jobRec = progress[job?.id] || {};
  const jobComplete = job ? isComplete(progress[job.id], tasks) : false;

  function toggleTask(taskId) {
    if (!job) return;
    setProgress((p) => ({
      ...p,
      [job.id]: { ...(p[job.id] || {}), [taskId]: !(p[job.id]?.[taskId]) },
    }));
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

  const queueClear = outstanding.length === 0;

  return (
    <div className="desk">
      <div className="desk-head">
        <div style={{ flex: 1 }}>
          <h1>Admin recapture</h1>
          <div className="dh-sub">Printed card → Sage Online · same labels both sides</div>
        </div>
        <button className="btn btn-ghost" style={{ minHeight: 42 }} onClick={() => setView('config')}>
          <Icon name="settings" size={18} /> Edit checklist
        </button>
        <button
          className="btn btn-ghost"
          style={{ minHeight: 42 }}
          onClick={exportCompletedJobs}
          disabled={!captured.length || exporting}
          title={captured.length ? 'Export completed jobs to Excel' : 'No completed jobs to export'}
        >
          <Icon name="file" size={16} /> {exporting ? 'Exporting...' : 'Export completed jobs'}
        </button>
        <div className="admin-mode-tabs" role="tablist" aria-label="Admin work mode">
          <button
            className="admin-mode-tab"
            aria-selected={tab === 'capture'}
            onClick={() => setTab('capture')}
          >
            Capture
          </button>
          <button
            className="admin-mode-tab"
            aria-selected={tab === 'ocr'}
            onClick={() => setTab('ocr')}
          >
            OCR
          </button>
        </div>
        <span
          className={'conn-pill' + (queueClear ? ' online' : '')}
          style={{ cursor: 'default' }}
        >
          <Icon name="inbox" size={16} />
          <span>{outstanding.length} to capture</span>
        </span>
      </div>

      <div className="desk-body">
        {tab === 'capture' && (
          <>
            {printed.length === 0 ? (
              <div className="empty-state">
                <Icon name="inbox" size={40} />
                <p>No printed cards waiting for capture.</p>
                <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => setTab('ocr')}>
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
              <div className="work-grid">
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

                <div className="work-main">
                  {job && (
                    <>
                      {jobComplete && (
                        <div className="success-ribbon">
                          <div className="sr-ic"><Icon name="checkCircle" size={20} /></div>
                          <div style={{ flex: 1 }}>
                            <div className="sr-title">Captured into Sage Online</div>
                            <div className="sr-sub">{job.customer.name} · {job.ref} is fully entered.</div>
                          </div>
                          <button className="btn btn-primary" style={{ minHeight: 44 }} onClick={goNext}>
                            {outstanding.length > 1
                              ? <><span>Next order</span><Icon name="arrowRight" size={17} /></>
                              : <><Icon name="check" size={17} stroke={3} /><span>Finish up</span></>}
                          </button>
                        </div>
                      )}

                      <div className="capture-layout">
                        <DigitalJobCard job={job} />

                        <div className="capture-checklist-col">
                          <CaptureChecklist
                            job={job}
                            tasks={tasks}
                            progress={jobRec}
                            onToggle={toggleTask}
                            onSaveInvoice={saveInvoiceNumber}
                            onNext={goNext}
                            hasNext={outstanding.length > 1}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'ocr' && (
          <div className="work-grid">
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

            <div className="work-main">
              <OcrExtractionPanel job={job} onCreated={handleOcrCreated} />
            </div>
          </div>
        )}
      </div>

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
