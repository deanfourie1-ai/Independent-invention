import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon';
import { analyzeJobCardImage } from '../services/documentIntelligence';
import { createJob, patchJob, uploadImage } from '../services/storage';
import { loadOcrFieldConfig } from '../services/ocrFieldConfig';
import { matchTechnicians } from '../services/techMatcher';

const ENDPOINT_KEY = 'tidewell.ocr.endpoint';
const API_KEY_KEY = 'tidewell.ocr.key';
const STAGED_DOCS_KEY = 'tidewell.ocr.stagedDocs.v1';
const LOW_CONFIDENCE_THRESHOLD = 0.65;

function readLocal(key) {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read selected file.'));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl) {
  const parts = String(dataUrl || '').split(',');
  if (parts.length < 2) {
    throw new Error('Invalid staged file payload. Please stage the file again.');
  }

  const meta = parts[0];
  const data = parts[1];
  const match = meta.match(/^data:(.*?);base64$/i);
  const mime = match?.[1] || 'application/octet-stream';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function loadStagedDocs() {
  try {
    const raw = localStorage.getItem(STAGED_DOCS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item) => item && typeof item === 'object').map((item) => ({
      id: item.id || makeId(),
      fileName: String(item.fileName || 'Scanned document'),
      mimeType: String(item.mimeType || 'application/octet-stream'),
      size: Number(item.size) || 0,
      dataUrl: String(item.dataUrl || ''),
      status: ['staged', 'processing', 'ready', 'error', 'imported'].includes(item.status)
        ? item.status
        : 'staged',
      error: String(item.error || ''),
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString(),
      result: item.result || null,
      editedValues: item.editedValues && typeof item.editedValues === 'object' ? item.editedValues : {},
      importedJobRef: String(item.importedJobRef || ''),
    }));
  } catch (_) {
    return [];
  }
}

function pct(value) {
  if (!Number.isFinite(value)) return 'n/a';
  return `${Math.round(value * 100)}%`;
}

function bboxText(points) {
  if (!Array.isArray(points) || !points.length) return 'n/a';
  return points.map((p) => `(${Math.round(p.x)}, ${Math.round(p.y)})`).join(' ');
}

function isPdfMime(mime) {
  return String(mime || '').toLowerCase() === 'application/pdf';
}

/* Numeric cost fields where typing an expression like "443+399" should
   evaluate to its result. Date/text fields are deliberately excluded so a
   value like "2026-06-05" is never mistaken for subtraction. */
const CALCULABLE_FIELDS = new Set(['callOutFee', 'labour', 'materialsOther', 'total']);

/* Safely evaluate a simple arithmetic expression (digits, + - * / and
   parentheses only). Returns the original string if it isn't a pure
   expression or doesn't contain an operator. */
function evalArithmetic(raw) {
  const cleaned = String(raw ?? '').replace(/[,\s]/g, '');
  if (!cleaned) return raw;
  if (!/^[\d+\-*/().]+$/.test(cleaned)) return raw;     // contains letters/symbols → leave as typed
  if (!/[+\-*/]/.test(cleaned.slice(1))) return raw;    // no real operator (ignore a leading sign)
  try {
    // Input is sanitised to numbers and operators only, so this is safe.
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${cleaned});`)();
    if (typeof result === 'number' && Number.isFinite(result)) {
      return String(Math.round(result * 100) / 100);
    }
  } catch (_) { /* fall through */ }
  return raw;
}

/* True only for a real calendar date in YYYY-MM-DD form (rejects e.g.
   2026-13-45 or 2026-02-30, which pass a naive regex). */
function isValidIsoDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

function isStorableScan(mime) {
  return String(mime || '').startsWith('image/') || isPdfMime(mime);
}

/* Renders a staged source file: images as <img>, PDFs in an inline viewer.
   PDFs are shown via a Blob URL (more reliable than a data: URL in an iframe). */
function StagedPreview({ doc }) {
  const isPdf = isPdfMime(doc?.mimeType);
  const [pdfUrl, setPdfUrl] = useState('');

  useEffect(() => {
    if (!isPdf || !doc?.dataUrl) {
      setPdfUrl('');
      return undefined;
    }
    let url = '';
    try {
      url = URL.createObjectURL(dataUrlToBlob(doc.dataUrl));
      setPdfUrl(url);
    } catch (_) {
      setPdfUrl('');
    }
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [isPdf, doc?.dataUrl]);

  if (!doc) return null;
  if (isPdf) {
    return pdfUrl ? (
      <iframe
        className="ocr-preview-pdf"
        src={pdfUrl}
        title={`Scan preview ${doc.fileName}`}
      />
    ) : (
      <div className="ocr-preview-fallback">
        <Icon name="file" size={26} />
        <p>Preparing PDF preview…</p>
      </div>
    );
  }
  if (doc.mimeType.startsWith('image/')) {
    return <img src={doc.dataUrl} alt={`Scan preview ${doc.fileName}`} />;
  }
  return (
    <div className="ocr-preview-fallback">
      <Icon name="file" size={26} />
      <p>Preview unavailable for this file type.</p>
    </div>
  );
}

export default function OcrExtractionPanel({ job, onCreated }) {
  const [stagedDocs, setStagedDocs] = useState(loadStagedDocs);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [isReviewFullscreen, setIsReviewFullscreen] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);

  useEffect(() => {
    try {
      localStorage.setItem(STAGED_DOCS_KEY, JSON.stringify(stagedDocs));
    } catch (_) {}
  }, [stagedDocs]);

  const selectedDoc = useMemo(
    () => stagedDocs.find((item) => item.id === selectedDocId) || null,
    [stagedDocs, selectedDocId]
  );

  useEffect(() => {
    if (selectedDoc && stagedDocs.some((item) => item.id === selectedDoc.id)) return;
    const preferred =
      stagedDocs.find((item) => item.status === 'ready') ||
      stagedDocs.find((item) => item.status === 'staged') ||
      null;
    setSelectedDocId(preferred?.id || null);
  }, [selectedDoc, stagedDocs]);

  useEffect(() => {
    if (isReviewFullscreen && (!selectedDoc || !selectedDoc.result)) {
      setIsReviewFullscreen(false);
    }
  }, [isReviewFullscreen, selectedDoc]);

  const result = selectedDoc?.result || null;
  const editedValues = selectedDoc?.editedValues || {};

  const parsedFields = result?.parsed?.fields || null;
  const resolvedFields = useMemo(() => {
    if (!parsedFields) return null;
    return Object.fromEntries(
      Object.entries(parsedFields).map(([key, field]) => [
        key,
        {
          ...field,
          value: Object.prototype.hasOwnProperty.call(editedValues, key)
            ? editedValues[key]
            : field.value,
        },
      ])
    );
  }, [editedValues, parsedFields]);

  const lowConfidence = useMemo(() => {
    if (!resolvedFields) return [];
    return Object.entries(resolvedFields)
      .filter(
        ([, field]) =>
          Number.isFinite(field.confidence) && field.confidence < LOW_CONFIDENCE_THRESHOLD
      )
      .map(([name]) => name);
  }, [resolvedFields]);

  const stagedCount = stagedDocs.filter((item) => item.status === 'staged').length;
  const processingCount = stagedDocs.filter((item) => item.status === 'processing').length;
  const readyCount = stagedDocs.filter((item) => item.status === 'ready').length;

  function updateDoc(docId, patch) {
    setStagedDocs((current) =>
      current.map((item) =>
        item.id === docId
          ? {
              ...item,
              ...patch,
              updatedAt: new Date().toISOString(),
            }
          : item
      )
    );
  }

  function setFieldValue(fieldKey, value) {
    if (!selectedDoc) return;
    updateDoc(selectedDoc.id, {
      editedValues: {
        ...(selectedDoc.editedValues || {}),
        [fieldKey]: value,
      },
    });
  }

  async function stageFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    setError('');
    setSaveMessage('');

    const prepared = [];
    for (const source of files) {
      const dataUrl = await fileToDataUrl(source);
      prepared.push({
        id: makeId(),
        fileName: source.name || 'Scanned document',
        mimeType: source.type || 'application/octet-stream',
        size: source.size || 0,
        dataUrl,
        status: 'staged',
        error: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        result: null,
        editedValues: {},
        importedJobRef: '',
      });
    }

    setStagedDocs((current) => [...prepared, ...current]);
    setSelectedDocId(prepared[0]?.id || null);
    setSaveMessage(`Staged ${prepared.length} document${prepared.length === 1 ? '' : 's'} for OCR.`);
    setFileInputKey((value) => value + 1);
  }

  async function runStagedExtraction() {
    setError('');
    setSaveMessage('');

    const endpoint = readLocal(ENDPOINT_KEY);
    const apiKey   = readLocal(API_KEY_KEY);

    if (!endpoint || !apiKey) {
      setError('Azure OCR endpoint and API key are not configured. Open Settings (gear icon) to add them.');
      return;
    }

    const candidates = stagedDocs.filter(
      (item) => item.status === 'staged' || item.status === 'error'
    );
    if (!candidates.length) {
      setError('No staged files are waiting for OCR. Stage files first.');
      return;
    }

    setBusy(true);

    let successCount = 0;
    let errorCount = 0;

    for (const item of candidates) {
      updateDoc(item.id, {
        status: 'processing',
        error: '',
      });

      try {
        const blob = dataUrlToBlob(item.dataUrl);
        const file = new File([blob], item.fileName, { type: item.mimeType });
        const fieldConfig = loadOcrFieldConfig();
        const data = await analyzeJobCardImage({ endpoint, apiKey, file, fieldConfig });
        const nextEditedValues = Object.fromEntries(
          Object.entries(data?.parsed?.fields || {}).map(([key, field]) => [key, field.value || ''])
        );

        updateDoc(item.id, {
          status: 'ready',
          error: '',
          result: data,
          editedValues: nextEditedValues,
        });
        successCount += 1;
      } catch (err) {
        updateDoc(item.id, {
          status: 'error',
          error: err?.message || 'Failed to extract text from image.',
        });
        errorCount += 1;
      }
    }

    setBusy(false);
    const firstReady = stagedDocs.find((item) => item.status === 'ready');
    if (!selectedDocId && firstReady) {
      setSelectedDocId(firstReady.id);
    }

    setSaveMessage(
      `OCR run complete. Ready: ${successCount}. Failed: ${errorCount}. Review ready files below.`
    );
  }

  function removeStagedDoc(docId) {
    setStagedDocs((current) => current.filter((item) => item.id !== docId));
    if (selectedDocId === docId) {
      setSelectedDocId(null);
      setIsReviewFullscreen(false);
    }
  }

  function openReview(docId) {
    setSelectedDocId(docId);
    setIsReviewFullscreen(true);
  }

  function normalizeDate(value) {
    const trimmed = String(value || '').trim();
    const dmy = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (dmy) {
      const dd = dmy[1].padStart(2, '0');
      const mm = dmy[2].padStart(2, '0');
      const yy = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
      return `${yy}-${mm}-${dd}`;
    }
    const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return trimmed;
    return '';
  }

  function normalizeStatus(value) {
    const v = String(value || '').trim().toLowerCase();
    if (!v) return '';
    if (v.includes('sync failed')) return 'sync_failed';
    if (v.includes('synced')) return 'synced';
    if (v.includes('printed')) return 'printed';
    if (v.includes('finished') || v.includes('closed')) return 'finished';
    if (v.includes('draft') || v.includes('open')) return 'draft';
    return '';
  }

  function deriveCustomerName(resultData) {
    const lines = resultData?.lines || [];
    const upper = lines.map((line) => String(line.content || '').trim());
    const candidate = upper.find((line) => /\b[A-Z]{2,}\b/.test(line) && line.length >= 4 && line.length <= 40 && !/job\s*card|date|assigned|duration|completed/i.test(line));
    return candidate || 'OCR Imported Customer';
  }

  async function createCaptureRecord() {
    if (!selectedDoc || !resolvedFields) {
      setError('Select a ready OCR document first.');
      return;
    }

    const fields = resolvedFields;
    const parsedDate = normalizeDate(fields.date?.value);

    // Block capture unless the job date reads as a real calendar date.
    if (!isValidIsoDate(parsedDate)) {
      const rawDate = String(fields.date?.value || '').trim();
      setError(
        rawDate
          ? `The job date "${rawDate}" could not be read as a valid date. Please correct it (e.g. 08/06/2026) before creating the capture record.`
          : 'A job date is required. Please enter a valid date before creating the capture record.'
      );
      return;
    }

    const parsedStatus = normalizeStatus(fields.status?.value) || 'printed';
    const techId = 't1';
    const rawAssignedTo = String(fields.jobAssignedTo?.value || '').trim();
    let techList = [];
    try {
      const tr = await fetch('/api/technicians');
      if (tr.ok) techList = await tr.json();
    } catch {}
    const assignedTo = matchTechnicians(rawAssignedTo, techList) || rawAssignedTo;
    const customerName = String(fields.customerName?.value || '').trim();
    const customerAddress = String(fields.customerAddress?.value || '').trim();
    const jobDone = String(fields.workDescription?.value || '').trim();
    const materials = String(fields.materialsUsed?.value || '').trim();
    const callOutFee = String(fields.callOutFee?.value || '').trim();
    const labour = String(fields.labour?.value || '').trim();
    const total = String(fields.total?.value || '').trim();

    setSaving(true);
    setError('');
    setSaveMessage('');

    try {
      // Upload scan (image or PDF) — OneDrive if configured, local folder otherwise.
      let imagePath = null;
      let oneDriveItemId = null;
      if (selectedDoc.dataUrl && isStorableScan(selectedDoc.mimeType)) {
        try {
          const base64 = selectedDoc.dataUrl.split(',')[1] || '';
          const uploaded = await uploadImage(selectedDoc.fileName, base64, selectedDoc.mimeType);
          oneDriveItemId = uploaded.oneDriveItemId || null;
          imagePath      = uploaded.filePath       || null;
        } catch (_) {
          // Upload failure is non-fatal — continue without an attached image.
        }
      }

      const created = await createJob({
        status: 'printed',
        tech: techId,
        jobAssignedTo: assignedTo,
        date: parsedDate,
        jobDone,
        materials,
        charges: {
          callOutFee,
          labour,
          total,
        },
        customer: {
          name: customerName || deriveCustomerName(result),
          address: customerAddress || 'Address pending admin capture',
          phone: '—',
        },
        jobType: 'OCR import - admin capture required',
        printedBy: 'OCR import',
        printedAt: new Date().toLocaleString(),
        updated: 'Imported from OCR - awaiting admin recapture',
        imagePath,
        oneDriveItemId,
        scanMimeType: selectedDoc.mimeType || '',
        ocrImport: {
          at: new Date().toISOString(),
          sourceFileName: selectedDoc.fileName || '',
          averageWordConfidence: result.averageWordConfidence,
          extractedFields: fields,
          extractedStatus: parsedStatus,
        },
      });

      setSaveMessage(`Created capture record ${created.ref}. It is now in the recapture checklist queue.`);
      removeStagedDoc(selectedDoc.id);
      setIsReviewFullscreen(false);
      onCreated?.(created);
    } catch (err) {
      setError(err?.message || 'Failed to create capture record from OCR data.');
    } finally {
      setSaving(false);
    }
  }

  async function applyToCurrentJob() {
    if (!job || !selectedDoc || !resolvedFields) {
      setError('No OCR result is available to apply.');
      return;
    }

    const fields = resolvedFields;
    const patch = {
      ocrImport: {
        at: new Date().toISOString(),
        sourceFileName: selectedDoc.fileName || '',
        averageWordConfidence: result.averageWordConfidence,
        extractedFields: fields,
      },
    };

    const parsedDate = normalizeDate(fields.date?.value);
    if (parsedDate) patch.date = parsedDate;

    const description = String(fields.workDescription?.value || '').trim();
    if (description) patch.jobDone = description;

    const materials = String(fields.materialsUsed?.value || '').trim();
    if (materials) patch.materials = materials;

    const parsedStatus = normalizeStatus(fields.status?.value);
    if (parsedStatus) patch.status = parsedStatus;

    const callOutFee = String(fields.callOutFee?.value || '').trim();
    const labour = String(fields.labour?.value || '').trim();
    const total = String(fields.total?.value || '').trim();
    if (callOutFee || labour || total) {
      patch.charges = {
        ...(job.charges || {}),
        ...(callOutFee ? { callOutFee } : {}),
        ...(labour ? { labour } : {}),
        ...(total ? { total } : {}),
      };
    }

    const assignedTo = String(fields.jobAssignedTo?.value || '').trim();
    if (assignedTo) patch.jobAssignedTo = assignedTo;

    const customerName = String(fields.customerName?.value || '').trim();
    const customerAddress = String(fields.customerAddress?.value || '').trim();
    if (customerName || customerAddress) {
      patch.customer = {
        ...(job.customer || {}),
        ...(customerName ? { name: customerName } : {}),
        ...(customerAddress ? { address: customerAddress } : {}),
      };
    }

    if (!patch.date && !patch.jobDone && !patch.materials && !patch.status) {
      setError('No usable fields were detected to apply to this job card.');
      return;
    }

    setSaving(true);
    setError('');
    setSaveMessage('');

    try {
      await patchJob(job.id, patch, 'ocr_import');
      setSaveMessage('OCR data saved to this job card. The layout now reflects extracted fields.');
    } catch (err) {
      setError(err?.message || 'Failed to save OCR data to this job card.');
    } finally {
      setSaving(false);
    }
  }

  // Read field labels from saved config for use in the review tables.
  const fieldConfig = useMemo(() => loadOcrFieldConfig(), []);

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>OCR import (Azure Layout)</h2>
        <span className="ph-sub">API 2024-11-30 · model prebuilt-layout · features keyValuePairs</span>
      </div>

      <div className="ocr-body">
        <label
          className="tw-drop"
          style={{ cursor: 'pointer', display: 'block' }}
          onDrop={async (e) => { e.preventDefault(); try { await stageFiles(e.dataTransfer.files); } catch (err) { setError(err?.message || 'Could not stage files.'); } }}
          onDragOver={(e) => e.preventDefault()}
        >
          <div className="ic">
            <Icon name="file" size={26} />
          </div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Drop job card scan here or click to browse</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>JPG · PNG · PDF</div>
          <input
            key={fileInputKey}
            type="file"
            accept="image/*,application/pdf"
            multiple
            style={{ display: 'none' }}
            onChange={async (e) => {
              try {
                await stageFiles(e.target.files);
              } catch (err) {
                setError(err?.message || 'Could not stage selected files.');
              }
            }}
          />
        </label>

        <div className="ocr-upload-row">
          <button
            className="tw-btn tw-btn--primary"
            disabled={busy || !stagedDocs.length}
            onClick={runStagedExtraction}
          >
            {busy ? (
              <>
                <Icon name="sync" size={16} className="spin" />
                <span>Running OCR...</span>
              </>
            ) : (
              <>
                <Icon name="refresh" size={16} />
                <span>Run OCR for staged files</span>
              </>
            )}
          </button>

        </div>

        <div className="ocr-summary-row">
          <div className="ocr-chip">
            <span>Staged</span>
            <b>{stagedCount}</b>
          </div>
          <div className="ocr-chip">
            <span>Processing</span>
            <b>{processingCount}</b>
          </div>
          <div className="ocr-chip">
            <span>Ready for review</span>
            <b>{readyCount}</b>
          </div>
          <div className="ocr-chip">
            <span>Total queue</span>
            <b>{stagedDocs.length}</b>
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Staged documents</div>
          {!stagedDocs.length ? (
            <div className="tw-empty">
              <Icon name="file" size={30} />
              <p style={{ marginTop: 10, fontWeight: 600 }}>Stage scanned files to build a review queue.</p>
            </div>
          ) : (
            <div className="tw-card" style={{ overflow: 'hidden' }}>
              <table className="tw-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {stagedDocs.map((item) => (
                    <tr
                      key={item.id}
                      className={selectedDocId === item.id ? 'is-selected' : ''}
                      onClick={() => setSelectedDocId(item.id)}
                    >
                      <td>
                        <div style={{ fontWeight: 600 }}>{item.fileName}</div>
                        <div className="tw-muted" style={{ fontSize: 12 }}>{Math.max(1, Math.round(item.size / 1024))} KB</div>
                      </td>
                      <td>
                        {item.status === 'imported' && <span className="st-badge st-imported">Imported</span>}
                        {item.status === 'processing' && <span className="st-badge st-reading">Processing</span>}
                        {item.status === 'error' && <span className="st-badge st-failed">Failed</span>}
                        {item.status === 'ready' && <span className="st-badge st-imported">Ready</span>}
                        {item.status === 'staged' && <span className="st-badge" style={{ background: 'var(--surface-3)', color: 'var(--ink-2)' }}>Staged</span>}
                        {item.importedJobRef && (
                          <div className="tw-muted" style={{ fontSize: 11, marginTop: 2 }}>as {item.importedJobRef}</div>
                        )}
                        {item.error && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 2 }}>{item.error}</div>}
                      </td>
                      <td className="tw-muted" style={{ fontSize: 12 }}>{new Date(item.updatedAt).toLocaleString()}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="ocr-row-actions">
                          <button
                            className="tw-btn tw-btn--sm"
                            type="button"
                            disabled={item.status !== 'ready'}
                            onClick={() => openReview(item.id)}
                          >
                            <Icon name="checkCircle" size={13} />
                            Review
                          </button>
                          <button
                            className="tw-btn tw-btn--sm tw-btn--ghost"
                            type="button"
                            disabled={busy || saving}
                            onClick={() => removeStagedDoc(item.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {error && (
          <div className="ocr-alert danger">
            <Icon name="alertCircle" size={16} />
            <span>{error}</span>
          </div>
        )}

        {saveMessage && (
          <div className="ocr-alert ok">
            <Icon name="checkCircle" size={16} />
            <span>{saveMessage}</span>
          </div>
        )}

        {!error && lowConfidence.length > 0 && (
          <div className="ocr-alert warn">
            <Icon name="alert" size={16} />
            <span>
              Low confidence detected for: {lowConfidence.join(', ')}. Double-check values before
              recapturing into Sage.
            </span>
          </div>
        )}

        {isReviewFullscreen && selectedDoc && result && (
          <div className="ocr-fullscreen-overlay" role="dialog" aria-modal="true" aria-label="Full-page OCR review">
            <div className="ocr-fullscreen-head">
              <div>
                <h3>Review OCR document</h3>
                <span className="ph-sub">{selectedDoc.fileName}</span>
              </div>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setIsReviewFullscreen(false)}
              >
                <Icon name="x" size={14} />
                <span>Close full page</span>
              </button>
            </div>

            <div className="ocr-fullscreen-content">
              <div className="ocr-review-layout">
                <div className="ocr-preview-panel">
                  <div className="ocr-preview-head">
                    <h3>Scanned source</h3>
                    <span className="ph-sub">Use this to validate date and customer fields</span>
                  </div>
                  <div className="ocr-preview-frame">
                    <StagedPreview doc={selectedDoc} />
                  </div>
                </div>

                <div className="ocr-review-fields">
                  <div className="ocr-summary-row">
                    <div className="ocr-chip">
                      <span>Average word confidence</span>
                      <b>{pct(result.averageWordConfidence)}</b>
                    </div>
                    <div className="ocr-chip">
                      <span>Text lines</span>
                      <b>{result.lines.length}</b>
                    </div>
                    <div className="ocr-chip">
                      <span>Words</span>
                      <b>{result.words.length}</b>
                    </div>
                    <div className="ocr-chip">
                      <span>Linked printed card</span>
                      <b>{job?.ref || 'n/a'}</b>
                    </div>
                  </div>

                  <table className="map-table ocr-fields">
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Extracted value</th>
                        <th>Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(resolvedFields).map(([key, field]) => (
                        <tr key={key}>
                          <td className="mf">{fieldConfig[key]?.label || key}</td>
                          <td>
                            {key === 'workDescription' || key === 'materialsUsed' ? (
                              <textarea
                                className="ocr-edit-input ocr-edit-area"
                                value={field.value || ''}
                                onChange={(e) => setFieldValue(key, e.target.value)}
                                placeholder="Enter corrected value"
                              />
                            ) : (
                              <input
                                className="ocr-edit-input"
                                value={field.value || ''}
                                onChange={(e) => setFieldValue(key, e.target.value)}
                                onBlur={(e) => {
                                  if (!CALCULABLE_FIELDS.has(key)) return;
                                  const calc = evalArithmetic(e.target.value);
                                  if (calc !== e.target.value) setFieldValue(key, calc);
                                }}
                                placeholder="Enter corrected value"
                              />
                            )}
                          </td>
                          <td>
                            <span
                              className={
                                'ocr-confidence ' +
                                (Number.isFinite(field.confidence) &&
                                field.confidence < LOW_CONFIDENCE_THRESHOLD
                                  ? 'low'
                                  : 'ok')
                              }
                            >
                              {pct(field.confidence)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="ocr-raw-wrap">
                    <h3>Raw OCR lines (with bounding boxes)</h3>
                    {error && (
                      <div className="ocr-alert danger" style={{ marginBottom: 8 }}>
                        <Icon name="alertCircle" size={16} />
                        <span>{error}</span>
                      </div>
                    )}
                    <div className="ocr-upload-row" style={{ marginBottom: 8 }}>
                      <button className="btn btn-primary" disabled={saving} onClick={createCaptureRecord}>
                        {saving ? (
                          <>
                            <Icon name="sync" size={16} className="spin" />
                            <span>Saving...</span>
                          </>
                        ) : (
                          <>
                            <Icon name="plus" size={16} />
                            <span>Create capture record from OCR</span>
                          </>
                        )}
                      </button>
                      <button className="btn btn-ghost" disabled={saving} onClick={applyToCurrentJob}>
                        <Icon name="checkCircle" size={16} />
                        <span>Apply to selected card</span>
                      </button>
                    </div>
                    <div className="ocr-raw-table">
                      <table className="map-table">
                        <thead>
                          <tr>
                            <th>Page</th>
                            <th>Text</th>
                            <th>Confidence</th>
                            <th>Bounding box</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.lines.map((line) => (
                            <tr key={line.id}>
                              <td>{line.pageNumber || 'n/a'}</td>
                              <td>{line.content || 'n/a'}</td>
                              <td>{pct(line.confidence)}</td>
                              <td className="ocr-bbox">{bboxText(line.boundingPolygon)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
