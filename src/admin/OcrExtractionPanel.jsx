import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon';
import { analyzeJobCardImage } from '../services/documentIntelligence';
import { createJob, patchJob, uploadImage } from '../services/storage';
import { technicians } from '../data';
import {
  loadBethlehemOcrFieldConfig,
  loadOcrFieldConfig,
  resetOcrFieldConfig,
  saveOcrFieldConfig,
} from '../services/ocrFieldConfig';

const ENDPOINT_KEY = 'tidewell.ocr.endpoint';
const API_KEY_KEY = 'tidewell.ocr.key';
const STAGED_DOCS_KEY = 'tidewell.ocr.stagedDocs.v1';
const LOW_CONFIDENCE_THRESHOLD = 0.65;

function readLocal(key, fallback = '') {
  try {
    return localStorage.getItem(key) || fallback;
  } catch (_) {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, value || '');
  } catch (_) {}
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

export default function OcrExtractionPanel({ job, onCreated }) {
  const [endpoint, setEndpoint] = useState(() =>
    readLocal(ENDPOINT_KEY, import.meta.env.VITE_AZURE_DOCINTEL_ENDPOINT || '')
  );
  const [apiKey, setApiKey] = useState(() =>
    readLocal(API_KEY_KEY, import.meta.env.VITE_AZURE_DOCINTEL_API_KEY || '')
  );
  const [stagedDocs, setStagedDocs] = useState(loadStagedDocs);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [isReviewFullscreen, setIsReviewFullscreen] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [showMappingConfig, setShowMappingConfig] = useState(false);
  const [fieldConfig, setFieldConfig] = useState(() => loadOcrFieldConfig());

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

    if (!endpoint.trim() || !apiKey.trim()) {
      setError('Enter Azure Document Intelligence endpoint and API key.');
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
    writeLocal(ENDPOINT_KEY, endpoint.trim());
    writeLocal(API_KEY_KEY, apiKey.trim());

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

  function findTechIdByName(name) {
    const target = String(name || '').trim().toLowerCase();
    if (!target) return '';

    const entries = Object.values(technicians);
    const exact = entries.find((tech) => tech.name.toLowerCase() === target);
    if (exact) return exact.id;

    const loose = entries.find((tech) => {
      const n = tech.name.toLowerCase();
      return target.includes(n) || n.includes(target);
    });
    return loose?.id || '';
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
    const parsedStatus = normalizeStatus(fields.status?.value) || 'printed';
    const techId = 't1';
    const assignedTo = String(fields.jobAssignedTo?.value || '').trim();
    const customerName = String(fields.customerName?.value || '').trim();
    const customerAddress = String(fields.customerAddress?.value || '').trim();
    const jobDone = String(fields.workDescription?.value || '').trim();
    const materials = String(fields.materialsUsed?.value || '').trim();
    const callOutFee = String(fields.callOutFee?.value || '').trim();
    const labour = String(fields.labour?.value || '').trim();
    const materialsOther = String(fields.materialsOther?.value || '').trim();
    const additionalNotes = String(fields.additionalNotes?.value || '').trim();

    setSaving(true);
    setError('');
    setSaveMessage('');

    try {
      // Save image to uploads/ folder before creating the job record.
      let imagePath = null;
      if (selectedDoc.dataUrl && selectedDoc.mimeType?.startsWith('image/')) {
        try {
          const base64 = selectedDoc.dataUrl.split(',')[1] || '';
          const uploaded = await uploadImage(selectedDoc.fileName, base64, selectedDoc.mimeType);
          imagePath = uploaded.filePath || null;
        } catch (_) {
          // Image upload failure is non-fatal; continue without it.
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
          materials: materialsOther,
          notes: additionalNotes,
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
        ocrImport: {
          at: new Date().toISOString(),
          sourceFileName: selectedDoc.fileName || '',
          averageWordConfidence: result.averageWordConfidence,
          extractedFields: fields,
          extractedStatus: parsedStatus,
        },
      });

      setSaveMessage(`Created capture record ${created.ref}. It is now in the recapture checklist queue.`);
      updateDoc(selectedDoc.id, {
        status: 'imported',
        importedJobRef: created.ref || created.id,
      });
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
    const materialsOther = String(fields.materialsOther?.value || '').trim();
    const additionalNotes = String(fields.additionalNotes?.value || '').trim();
    if (callOutFee || labour || materialsOther || additionalNotes) {
      patch.charges = {
        ...(job.charges || {}),
        ...(callOutFee ? { callOutFee } : {}),
        ...(labour ? { labour } : {}),
        ...(materialsOther ? { materials: materialsOther } : {}),
        ...(additionalNotes ? { notes: additionalNotes } : {}),
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

  function updateFieldMatchers(fieldKey, text) {
    const patterns = text
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);

    setFieldConfig((current) => ({
      ...current,
      [fieldKey]: {
        ...(current[fieldKey] || {}),
        keyMatchers: patterns,
      },
    }));
  }

  function handleSaveMappingConfig() {
    const saved = saveOcrFieldConfig(fieldConfig);
    setFieldConfig(saved);
    setSaveMessage('Field mapping configuration saved. Next OCR run will use this mapping.');
  }

  function handleResetMappingConfig() {
    const defaults = resetOcrFieldConfig();
    setFieldConfig(defaults);
    setSaveMessage('Field mapping configuration reset to defaults.');
  }

  function handleLoadBethlehemPreset() {
    const preset = loadBethlehemOcrFieldConfig();
    setFieldConfig(preset);
    setSaveMessage('Bethlehem Plumbers preset loaded for key-value mapping.');
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>OCR import (Azure Layout)</h2>
        <span className="ph-sub">API 2024-11-30 · model prebuilt-layout · features keyValuePairs</span>
      </div>

      <div className="ocr-body">
        <div className="ocr-grid">
          <label className="field-group ocr-field">
            <span className="field-lbl">Endpoint URL</span>
            <input
              className="input"
              placeholder="https://your-resource.cognitiveservices.azure.com"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
            />
          </label>

          <label className="field-group ocr-field">
            <span className="field-lbl">API key</span>
            <input
              className="input"
              type="password"
              placeholder="Azure Document Intelligence key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </label>
        </div>

        <div className="ocr-upload-row">
          <label className="btn btn-ghost" style={{ minHeight: 42, cursor: 'pointer' }}>
            <Icon name="file" size={16} />
            <span>Stage scanned files</span>
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

          <button
            className="btn btn-primary"
            disabled={busy || !stagedDocs.length || !endpoint.trim() || !apiKey.trim()}
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

          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setShowMappingConfig((value) => !value)}
          >
            <Icon name="settings" size={16} />
            <span>{showMappingConfig ? 'Hide mapping config' : 'Field mapping config'}</span>
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

        <div className="ocr-stage-wrap">
          <h3>Staged documents</h3>
          {!stagedDocs.length ? (
            <div className="empty-state" style={{ padding: '28px 18px' }}>
              <Icon name="file" size={30} />
              <p>Stage scanned files to build a review queue.</p>
            </div>
          ) : (
            <div className="ocr-stage-table">
              <table className="map-table">
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
                    <tr key={item.id}>
                      <td>
                        <div className="ocr-file-name">{item.fileName}</div>
                        <div className="ocr-file-meta">{Math.max(1, Math.round(item.size / 1024))} KB</div>
                      </td>
                      <td>
                        <span className={`ocr-doc-state ${item.status}`}>
                          {item.status === 'ready' ? 'Ready' : item.status}
                        </span>
                        {item.importedJobRef && (
                          <div className="ocr-file-meta">Imported as {item.importedJobRef}</div>
                        )}
                        {item.error && <div className="ocr-file-meta ocr-file-error">{item.error}</div>}
                      </td>
                      <td>{new Date(item.updatedAt).toLocaleString()}</td>
                      <td>
                        <div className="ocr-row-actions">
                          <button
                            className="btn btn-ghost"
                            type="button"
                            disabled={item.status !== 'ready'}
                            onClick={() => openReview(item.id)}
                          >
                            <Icon name="checkCircle" size={14} />
                            <span>Review full page</span>
                          </button>
                          <button
                            className="btn btn-ghost"
                            type="button"
                            disabled={busy || saving}
                            onClick={() => removeStagedDoc(item.id)}
                          >
                            <span>Remove</span>
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

        {showMappingConfig && (
          <div className="ocr-config panel" style={{ marginBottom: 0 }}>
            <div className="panel-head" style={{ padding: '12px 14px' }}>
              <h2 style={{ fontSize: 14 }}>Key-value pair mapping</h2>
              <span className="ph-sub">One regex pattern per line</span>
              <div style={{ flex: 1 }} />
              <button className="btn btn-ghost" type="button" onClick={handleResetMappingConfig}>
                <Icon name="refresh" size={14} />
                <span>Reset</span>
              </button>
              <button className="btn btn-ghost" type="button" onClick={handleLoadBethlehemPreset}>
                <Icon name="clipboard" size={14} />
                <span>Load Bethlehem preset</span>
              </button>
              <button className="btn btn-primary" type="button" onClick={handleSaveMappingConfig}>
                <Icon name="save" size={14} />
                <span>Save mapping</span>
              </button>
            </div>
            <div className="ocr-body" style={{ paddingTop: 10 }}>
              {Object.entries(fieldConfig).map(([fieldKey, cfg]) => (
                <label key={fieldKey} className="field-group ocr-field" style={{ marginBottom: 8 }}>
                  <span className="field-lbl">{cfg.label || fieldKey}</span>
                  <textarea
                    className="ocr-edit-input ocr-edit-area"
                    value={(cfg.keyMatchers || []).join('\n')}
                    onChange={(e) => updateFieldMatchers(fieldKey, e.target.value)}
                    placeholder="Add one regex key matcher per line"
                  />
                </label>
              ))}
            </div>
          </div>
        )}

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

        {!isReviewFullscreen && selectedDoc && result && (
          <>
            <div className="ocr-alert ok">
              <Icon name="checkCircle" size={16} />
              <span>
                Reviewing {selectedDoc.fileName}. Validate values, then create the job card record.
              </span>
            </div>

            <div className="ocr-review-layout">
              <div className="ocr-preview-panel">
                <div className="ocr-preview-head">
                  <h3>Scanned source</h3>
                  <span className="ph-sub">Use this to validate date and customer fields</span>
                </div>
                <div className="ocr-preview-frame">
                  {selectedDoc.mimeType.startsWith('image/') ? (
                    <img src={selectedDoc.dataUrl} alt={`Scan preview ${selectedDoc.fileName}`} />
                  ) : (
                    <div className="ocr-preview-fallback">
                      <Icon name="file" size={26} />
                      <p>Preview unavailable for this file type in the mockup.</p>
                    </div>
                  )}
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
          </>
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
                    {selectedDoc.mimeType.startsWith('image/') ? (
                      <img src={selectedDoc.dataUrl} alt={`Scan preview ${selectedDoc.fileName}`} />
                    ) : (
                      <div className="ocr-preview-fallback">
                        <Icon name="file" size={26} />
                        <p>Preview unavailable for this file type in the mockup.</p>
                      </div>
                    )}
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
