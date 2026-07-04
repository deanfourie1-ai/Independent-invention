import { useState, useEffect } from 'react';
import Icon from '../components/Icon';

/* Downstream views (history list, detail drawer, OCR matcher) only ever
   render the first 3 assignees, so warn the admin once they exceed that. */
const MAX_ASSIGNEES = 3;

function parseAssignees(value) {
  return String(value ?? '')
    .split(/\s*,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function CopyButton({ copyKey, copied, onCopy, value }) {
  return (
    <button
      type="button"
      className={'cap-copy' + (copied === copyKey ? ' ok' : '')}
      onClick={() => onCopy(copyKey, String(value || ''))}
      title="Copy field value"
      aria-label="Copy field value"
    >
      <Icon name={copied === copyKey ? 'check' : 'copy'} size={13} />
    </button>
  );
}

/* Inline-editable row — used for fields the admin may need to correct
   (e.g. when OCR misread them) before finalising the capture. */
function EditableRow({ label, value, onSave, type = 'text', placeholder, multiline = false, copyKey, copied, onCopy }) {
  const [draft, setDraft] = useState(value ?? '');

  // Re-sync when the underlying job value changes (e.g. switching jobs).
  useEffect(() => { setDraft(value ?? ''); }, [value]);

  function commit() {
    const next = String(draft ?? '').trim();
    if (next !== String(value ?? '').trim()) onSave?.(next);
  }

  return (
    <div className={'cap-row' + (multiline ? ' cap-row--wide' : '')}>
      <div className="k">{label}</div>
      <div className="v">
        {multiline ? (
          <textarea
            className="cap-edit-input cap-edit-area"
            value={draft}
            placeholder={placeholder || '—'}
            rows={3}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
          />
        ) : (
          <input
            className="cap-edit-input"
            type={type}
            value={draft}
            placeholder={placeholder || '—'}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
        )}
      </div>
      <CopyButton copyKey={copyKey} copied={copied} onCopy={onCopy} value={draft} />
    </div>
  );
}

/* Editable assignee row: stores a comma-separated list of names and shows
   the parsed people as chips, warning when more than MAX_ASSIGNEES are added. */
function AssigneeRow({ value, onSave, copyKey, copied, onCopy }) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => { setDraft(value ?? ''); }, [value]);

  function commit() {
    const next = String(draft ?? '').trim();
    if (next !== String(value ?? '').trim()) onSave?.(next);
  }

  const names = parseAssignees(draft);
  const tooMany = names.length > MAX_ASSIGNEES;

  return (
    <div className="cap-row cap-row--wide">
      <div className="k">Assigned to</div>
      <div className="v">
        <input
          className="cap-edit-input"
          type="text"
          value={draft}
          placeholder="Name(s), comma-separated"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        />
        {names.length > 0 && (
          <div className="cap-assignees">
            {names.map((name, i) => (
              <span key={i} className={'cap-chip' + (i >= MAX_ASSIGNEES ? ' over' : '')}>
                <Icon name="user" size={11} />
                {name}
              </span>
            ))}
          </div>
        )}
        {tooMany && (
          <div className="cap-assignee-warn">
            <Icon name="alertCircle" size={13} />
            <span>Only the first {MAX_ASSIGNEES} names appear in history, exports and avatars.</span>
          </div>
        )}
      </div>
      <CopyButton copyKey={copyKey} copied={copied} onCopy={onCopy} value={draft} />
    </div>
  );
}

function Sec({ title, children }) {
  return (
    <div className="cap-sec">
      <div className="cap-sec-head">{title}</div>
      {children}
    </div>
  );
}

const fmtAmt = (n) => 'R ' + Number(n || 0).toLocaleString('en-ZA');
const owedAmt = (c) => typeof c.outstanding === 'number'
  ? c.outstanding
  : (c.invoices || []).reduce((s, i) => s + (i.paid ? 0 : i.amount), 0);

export default function DigitalJobCard({ job, onUpdate, followupMatch }) {
  const [copied, setCopied] = useState(null);
  const jobId = job.ref || job.id;

  /* The scanned source file the OCR was run against — OneDrive item or local upload. */
  const scanSrc = job.oneDriveItemId
    ? `/api/image/${job.oneDriveItemId}`
    : job.imagePath ? `/${job.imagePath}` : null;
  const isPdfScan =
    job.scanMimeType === 'application/pdf' ||
    /\.pdf$/i.test(job.imagePath || '') ||
    /\.pdf$/i.test(job.ocrImport?.sourceFileName || '');

  /* Nested-object patch helpers — the server PATCH does a shallow merge, so
     edits to customer.* / charges.* must carry the whole sub-object. */
  const patchCustomer = (key, v) => onUpdate?.({ customer: { ...(job.customer || {}), [key]: v } });
  const patchCharges  = (key, v) => onUpdate?.({ charges: { ...(job.charges || {}), [key]: v } });

  function copyField(key, text) {
    try { navigator.clipboard?.writeText(String(text || '')); } catch (_) {}
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1300);
  }

  const matchOwed = followupMatch ? owedAmt(followupMatch) : 0;

  return (
    <div className="cap-card">
      {followupMatch && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 14px', margin: '0 0 0 0', background: '#fff8e1', borderBottom: '1px solid #ffe082', fontSize: 13 }}>
          <Icon name="alertCircle" size={15} style={{ color: '#f57c00', flexShrink: 0, marginTop: 1 }} />
          <span>
            <b>{followupMatch.name}</b> has an open follow-up
            {matchOwed > 0 ? ` — ${fmtAmt(matchOwed)} outstanding` : ''}
            {' '}· visible in <em>Customer follow-ups</em>
          </span>
        </div>
      )}
      <div className="cap-card-head">
        <span className="ttl">Digital job card</span>
        <span className="hint">Edit any field, then copy into Sage</span>
        <div style={{ flex: 1 }} />
        {scanSrc && (
          <a
            className="cap-scan-link"
            href={scanSrc}
            target="_blank"
            rel="noreferrer"
            title={`Open the scanned ${isPdfScan ? 'PDF' : 'image'} used for OCR`}
          >
            <Icon name="eye" size={13} />
            {isPdfScan ? 'Open scanned PDF' : 'Open scanned file'}
          </a>
        )}
        <span className="cap-jobid">Job ID: {jobId}</span>
        <span className="cap-lock">
          <Icon name="lock" size={11} />
          Printed
        </span>
      </div>

      <div className="cap-body">
        {/* two-column top section */}
        <div className="cap-2col">
          <Sec title="Job details">
            <AssigneeRow value={job.jobAssignedTo} onSave={(v) => onUpdate?.({ jobAssignedTo: v })} copyKey="jobAssignedTo" copied={copied} onCopy={copyField} />
            <EditableRow label="Date"            value={job.date}           type="date"                onSave={(v) => onUpdate?.({ date: v })}           copyKey="date"           copied={copied} onCopy={copyField} />
          </Sec>

          <Sec title="Client details">
            <EditableRow label="Name"    value={job.customer?.name}          onSave={(v) => patchCustomer('name', v)}          copyKey="customerName"    copied={copied} onCopy={copyField} />
            <EditableRow label="Address" value={job.customer?.address}       multiline onSave={(v) => patchCustomer('address', v)}  copyKey="customerAddress" copied={copied} onCopy={copyField} />
          </Sec>
        </div>

        <Sec title="Description of work done">
          <EditableRow label="Job done" value={job.jobDone} multiline onSave={(v) => onUpdate?.({ jobDone: v })} copyKey="jobDone" copied={copied} onCopy={copyField} />
        </Sec>

        <Sec title="Cost / breakdown">
          <EditableRow label="Call-out fee"   value={job.charges?.callOutFee}   onSave={(v) => patchCharges('callOutFee', v)}   copyKey="callOutFee"   copied={copied} onCopy={copyField} />
          <EditableRow label="Labour"         value={job.charges?.labour}       onSave={(v) => patchCharges('labour', v)}       copyKey="labour"       copied={copied} onCopy={copyField} />
          <EditableRow label="Material cost"  value={job.charges?.materialCost} onSave={(v) => patchCharges('materialCost', v)} copyKey="materialCost" copied={copied} onCopy={copyField} />
          <EditableRow label="Other costs"    value={job.charges?.materialsOther} onSave={(v) => patchCharges('materialsOther', v)} copyKey="otherCosts" copied={copied} onCopy={copyField} />
          <EditableRow label="Total"          value={job.charges?.total}        onSave={(v) => patchCharges('total', v)}        copyKey="total"        copied={copied} onCopy={copyField} />
        </Sec>

        <Sec title="Materials used">
          <EditableRow label="Materials" value={job.materials} multiline onSave={(v) => onUpdate?.({ materials: v })} copyKey="materials" copied={copied} onCopy={copyField} />
        </Sec>
      </div>
    </div>
  );
}
