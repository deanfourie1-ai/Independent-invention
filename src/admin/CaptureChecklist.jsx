import { useEffect, useState } from 'react';
import Icon from '../components/Icon';

export default function CaptureChecklist({
  job,
  tasks,
  progress,
  onToggle,
  onNext,
  hasNext,
  onSaveInvoice,
}) {
  const active = tasks.filter((t) => t.text.trim());
  const done = progress || {};
  const doneCount = active.reduce((n, t) => n + (done[t.id] ? 1 : 0), 0);
  const complete = active.length > 0 && doneCount === active.length;

  const [invoiceDraft, setInvoiceDraft] = useState(job?.invoiceNumber || '');
  const [invoiceCustomerDraft, setInvoiceCustomerDraft] = useState(
    job?.invoiceCustomer || job?.customer?.name || ''
  );
  const [savingInvoice, setSavingInvoice] = useState(false);

  useEffect(() => {
    setInvoiceDraft(job?.invoiceNumber || '');
    setInvoiceCustomerDraft(job?.invoiceCustomer || job?.customer?.name || '');
  }, [job?.id, job?.invoiceNumber, job?.invoiceCustomer, job?.customer?.name]);

  async function saveInvoiceRef() {
    if (!onSaveInvoice || !job?.id) return;
    setSavingInvoice(true);
    try {
      await onSaveInvoice(job.id, invoiceDraft, invoiceCustomerDraft);
    } finally {
      setSavingInvoice(false);
    }
  }

  return (
    <div className="cap-check">
      <div className="cap-check-head">
        <div>
          <div className="ttl">Capture checklist</div>
          <div className="by">Set by administrator</div>
        </div>
        <span className={'cap-cbadge' + (complete ? ' done' : '')}>
          <Icon name="check" size={12} stroke={3} />
          {doneCount}/{active.length}
        </span>
      </div>

      <div className="cap-check-body">
        {/* checklist items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {active.map((t) => (
            <div
              key={t.id}
              className="cap-citem"
              onClick={() => onToggle(t.id)}
              role="checkbox"
              aria-checked={!!done[t.id]}
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(t.id); }}
            >
              <div className={'cap-cbox' + (done[t.id] ? ' on' : '')}>
                <Icon name="check" size={12} stroke={3} />
              </div>
              <span
                className="lbl"
                style={done[t.id] ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : {}}
              >
                {t.text}
              </span>
            </div>
          ))}
        </div>

        {/* invoice reference */}
        <div className="cap-invref">
          <div className="h">Invoice reference</div>
          <div className="d">Capture invoice customer and invoice number for this job</div>

          <label style={{ display: 'block', marginBottom: 10 }}>
            <span className="cap-lbl">Invoice customer</span>
            <input
              className="cap-input"
              placeholder="Defaults to customer name"
              value={invoiceCustomerDraft}
              onChange={(e) => setInvoiceCustomerDraft(e.target.value)}
              disabled={savingInvoice}
            />
          </label>

          <label style={{ display: 'block', marginBottom: 10 }}>
            <span className="cap-lbl">Invoice number</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 9 }}>
              <input
                className="cap-input"
                placeholder="e.g. INV-10427"
                value={invoiceDraft}
                onChange={(e) => setInvoiceDraft(e.target.value)}
                disabled={savingInvoice}
              />
              <button
                className="tw-btn cap-savebtn"
                type="button"
                onClick={saveInvoiceRef}
                disabled={savingInvoice}
              >
                <Icon name="save" size={14} />
                {savingInvoice ? 'Saving...' : 'Save'}
              </button>
            </div>
          </label>
        </div>

        {/* finish button */}
        <button
          className="tw-btn tw-btn--primary cap-finish"
          onClick={onNext}
          disabled={!complete}
          title={complete ? undefined : 'Tick all checklist items first'}
        >
          {hasNext
            ? <><span>Next order</span><Icon name="arrowRight" size={17} /></>
            : <><Icon name="check" size={17} stroke={3} /><span>Finish up</span></>}
        </button>
      </div>
    </div>
  );
}
