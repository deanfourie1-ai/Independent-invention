import { useState } from 'react';
import Icon from '../components/Icon';

function displayValue(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function CopyRow({ label, value, copyKey, copied, onCopy, multiline = false }) {
  const shown = displayValue(value);
  return (
    <div className={'cap-row' + (multiline ? ' cap-row--wide' : '')}>
      <div className="k">{label}</div>
      <div className={'v' + (shown ? '' : ' empty') + (multiline ? ' multi' : '')}>
        {shown || '—'}
      </div>
      <button
        type="button"
        className={'cap-copy' + (copied === copyKey ? ' ok' : '')}
        onClick={() => onCopy(copyKey, shown || '')}
        title="Copy field value"
        aria-label="Copy field value"
      >
        <Icon name={copied === copyKey ? 'check' : 'copy'} size={13} />
      </button>
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

export default function DigitalJobCard({ job }) {
  const [copied, setCopied] = useState(null);
  const completed = ['finished', 'synced', 'printed'].includes(job.status);
  const jobId = job.ref || job.id;

  const callOutFee = job.charges?.callOutFee;
  const labour = job.charges?.labour;
  const otherCosts = job.charges?.materials;
  const additionalNotes = job.charges?.notes;
  const total = job.charges?.total;

  function copyField(key, text) {
    try { navigator.clipboard?.writeText(String(text || '')); } catch (_) {}
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1300);
  }

  return (
    <div className="cap-card">
      <div className="cap-card-head">
        <span className="ttl">Digital job card</span>
        <span className="hint">Copy directly from each field</span>
        <div style={{ flex: 1 }} />
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
            <CopyRow label="Assigned to"  value={job.jobAssignedTo}  copyKey="jobAssignedTo"  copied={copied} onCopy={copyField} />
            <CopyRow label="Date"         value={job.date}           copyKey="date"            copied={copied} onCopy={copyField} />
            <CopyRow label="Duration"     value={job.duration}       copyKey="duration"        copied={copied} onCopy={copyField} />
            <CopyRow label="Completed"    value={completed ? 'Yes' : 'No'} copyKey="completed" copied={copied} onCopy={copyField} />
            <CopyRow label="Casual labour no" value={job.casualLabourNo} copyKey="casualLabourNo" copied={copied} onCopy={copyField} />
          </Sec>

          <Sec title="Client details">
            <CopyRow label="Name"           value={job.customer?.name}          copyKey="customerName"    copied={copied} onCopy={copyField} />
            <CopyRow label="Address"        value={job.customer?.address}       copyKey="customerAddress" copied={copied} onCopy={copyField} multiline />
            <CopyRow label="Contact"        value={job.customer?.contactPerson} copyKey="contactPerson"   copied={copied} onCopy={copyField} />
            <CopyRow label="Tel"            value={job.customer?.phone}         copyKey="phone"           copied={copied} onCopy={copyField} />
            <CopyRow label="Email"          value={job.customer?.email}         copyKey="email"           copied={copied} onCopy={copyField} />
          </Sec>
        </div>

        <Sec title="Description of work done">
          <CopyRow label="Job done" value={job.jobDone} copyKey="jobDone" copied={copied} onCopy={copyField} multiline />
        </Sec>

        <Sec title="Cost / breakdown">
          <div className="cap-cost">
            <span className="lab">Call-out fee</span>
            <span className="amt">{callOutFee || '—'}</span>
            <span className="lab">Labour</span>
            <span className="amt">{labour || '—'}</span>
            <span className="lab">Other costs</span>
            <span className="amt">{otherCosts || '—'}</span>
            {total && (
              <>
                <span className="lab tot">Total</span>
                <span className="amt tot">{total}</span>
              </>
            )}
          </div>
          {additionalNotes && (
            <CopyRow label="Notes" value={additionalNotes} copyKey="additionalNotes" copied={copied} onCopy={copyField} multiline />
          )}
        </Sec>

        <Sec title="Materials used">
          <CopyRow label="Materials" value={job.materials} copyKey="materials" copied={copied} onCopy={copyField} multiline />
        </Sec>
      </div>
    </div>
  );
}
