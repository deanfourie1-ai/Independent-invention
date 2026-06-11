import { useState } from 'react';
import Icon from '../components/Icon';
import StatusBadge from '../components/StatusBadge';

function displayValue(value) {
  const text = String(value ?? '').trim();
  return text || '—';
}

function CopyCell({ value, copyKey, copied, onCopy }) {
  return (
    <button
      type="button"
      className="dj-copy"
      onClick={() => onCopy(copyKey, value)}
      title="Copy field value"
      aria-label="Copy field value"
    >
      <Icon name={copied === copyKey ? 'check' : 'copy'} size={14} />
    </button>
  );
}

function Row({ label, value, copyKey, copied, onCopy, multiline = false }) {
  const shown = displayValue(value);
  return (
    <div className={'dj-row' + (multiline ? ' multiline' : '')}>
      <div className="dj-k">{label}</div>
      <div className={'dj-v' + (multiline ? ' para' : '')}>{shown}</div>
      <CopyCell value={shown} copyKey={copyKey} copied={copied} onCopy={onCopy} />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="dj-section">
      <div className="dj-sec-label">{title}</div>
      <div className="dj-block">{children}</div>
    </section>
  );
}

export default function DigitalJobCard({ job }) {
  const [copied, setCopied] = useState(null);
  const completed = ['finished', 'synced', 'printed'].includes(job.status);

  const callOutFee = job.charges?.callOutFee;
  const labour = job.charges?.labour;
  const otherCosts = job.charges?.materials;
  const additionalNotes = job.charges?.notes;
  const total = job.charges?.total;
  const jobId = job.ref || job.id;

  function copyField(key, text) {
    try { navigator.clipboard?.writeText(String(text || '')); } catch (_) {}
    setCopied(key);
    setTimeout(() => setCopied((current) => (current === key ? null : current)), 1300);
  }

  return (
    <div className="panel capture-digital">
      <div className="panel-head">
        <h2>Digital job card</h2>
        <span className="ph-sub">Copy directly from each field</span>
        <div style={{ flex: 1 }} />
        <span className="dj-job-id">Job ID: {displayValue(jobId)}</span>
        <StatusBadge status="printed" />
      </div>

      <div className="dj-body">
        <section className="dj-section dj-section-split">
          <div className="dj-split-grid">
            <div>
              <div className="dj-sec-label">Job details</div>
              <div className="dj-block">
                <Row label="Job assigned to" value={job.jobAssignedTo} copyKey="jobAssignedTo" copied={copied} onCopy={copyField} />
                <Row label="Date" value={job.date} copyKey="date" copied={copied} onCopy={copyField} />
                <Row label="Job duration" value={job.duration} copyKey="duration" copied={copied} onCopy={copyField} />
                <Row label="Job completed" value={completed ? 'Yes' : 'No'} copyKey="completed" copied={copied} onCopy={copyField} />
                <Row label="Casual labour no" value={job.casualLabourNo} copyKey="casualLabourNo" copied={copied} onCopy={copyField} />
              </div>
            </div>

            <div>
              <div className="dj-sec-label">Client details</div>
              <div className="dj-block">
                <Row label="Name" value={job.customer?.name} copyKey="customerName" copied={copied} onCopy={copyField} />
                <Row label="Address" value={job.customer?.address} copyKey="customerAddress" copied={copied} onCopy={copyField} multiline />
                <Row label="Contact person" value={job.customer?.contactPerson} copyKey="contactPerson" copied={copied} onCopy={copyField} />
                <Row label="Tel number" value={job.customer?.phone} copyKey="phone" copied={copied} onCopy={copyField} />
                <Row label="Email address" value={job.customer?.email} copyKey="email" copied={copied} onCopy={copyField} />
              </div>
            </div>
          </div>
        </section>

        <Section title="Description of work done">
          <Row label="Job done" value={job.jobDone} copyKey="jobDone" copied={copied} onCopy={copyField} multiline />
        </Section>

        <Section title="Cost / breakdown">
          <Row label="Call-out fee" value={callOutFee} copyKey="callOutFee" copied={copied} onCopy={copyField} />
          <Row label="Labour" value={labour} copyKey="labour" copied={copied} onCopy={copyField} />
          <Row label="Other costs" value={otherCosts} copyKey="otherCosts" copied={copied} onCopy={copyField} />
          <Row label="Additional notes" value={additionalNotes} copyKey="additionalNotes" copied={copied} onCopy={copyField} multiline />
          <Row label="Total" value={total} copyKey="total" copied={copied} onCopy={copyField} />
        </Section>

        <Section title="Materials used">
          <Row label="Materials" value={job.materials} copyKey="materials" copied={copied} onCopy={copyField} multiline />
        </Section>
      </div>
    </div>
  );
}
