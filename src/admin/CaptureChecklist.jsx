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
    <div className="panel">
      <div className="panel-head">
        <h2>Capture checklist</h2>
        <span className="ph-sub">Set by administrator</span>
        <div style={{ flex: 1 }} />
        <span className={'badge badge-lg ' + (complete ? 's-synced' : 's-finished')}>
          <Icon name="check" size={15} stroke={3} />
          <span>{doneCount}/{active.length}</span>
        </span>
      </div>

      <div className="checklist-admin">
        {active.map((t) => (
          <div
            key={t.id}
            className={'cl-item' + (done[t.id] ? ' done' : '')}
            onClick={() => onToggle(t.id)}
          >
            <div className="cl-box">
              <Icon name="check" size={15} stroke={3} />
            </div>
            <div className="cl-label">{t.text}</div>
          </div>
        ))}
      </div>

      <div className="invoice-ref-box">
        <div className="invoice-ref-head">
          <h3>Invoice reference</h3>
          <span className="ph-sub">Capture invoice customer and invoice number for this job</span>
        </div>
        <div className="field-group" style={{ marginBottom: 10 }}>
          <span className="field-lbl">Invoice customer</span>
          <input
            className="input"
            placeholder="Defaults to customer name"
            value={invoiceCustomerDraft}
            onChange={(e) => setInvoiceCustomerDraft(e.target.value)}
            disabled={!complete || savingInvoice}
          />
        </div>
        <div className="field-group" style={{ marginBottom: 10 }}>
          <span className="field-lbl">Invoice number</span>
        </div>
        <div className="invoice-ref-row">
          <input
            className="input"
            placeholder="e.g. INV-10427"
            value={invoiceDraft}
            onChange={(e) => setInvoiceDraft(e.target.value)}
            disabled={!complete || savingInvoice}
          />
          <button
            className="btn btn-ghost"
            type="button"
            onClick={saveInvoiceRef}
            disabled={!complete || savingInvoice}
            style={{ minHeight: 44 }}
          >
            <Icon name="save" size={15} />
            <span>{savingInvoice ? 'Saving...' : 'Save invoice'}</span>
          </button>
        </div>
      </div>

      {complete && (
        <div style={{ padding: '0 16px 16px' }}>
          <button className="btn btn-primary btn-block" style={{ minHeight: 46 }} onClick={onNext}>
            {hasNext
              ? <><span>Next order</span><Icon name="arrowRight" size={17} /></>
              : <><Icon name="check" size={17} stroke={3} /><span>Finish up</span></>}
          </button>
        </div>
      )}
    </div>
  );
}
