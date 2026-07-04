/* Customer drawer: combined interaction history + log-a-follow-up form. */
import { useState, useEffect } from 'react';
import { FI } from './icons';
import { S } from './helpers';
import { fillTemplate } from './templates';
import { nameMatchScore } from '../../services/nameMatcher';
import { METHODS, InteractionsTable } from './interactions';

export default function CustomerDrawer({ customer, history, onClose, onSave, onDelete, templates }) {
  const [dids, setDids] = useState(['call']);
  const [said, setSaid] = useState('');
  const [fuOn, setFuOn] = useState(true);
  const [fuDate, setFuDate] = useState(S.addDaysIso(S.TODAY_ISO, 7));
  const [fuTime, setFuTime] = useState('09:00');
  const [osStr, setOsStr] = useState('');
  const [invPaid, setInvPaid] = useState({});
  const [confirmDel, setConfirmDel] = useState(false);
  const [jobHistory, setJobHistory] = useState([]);
  const c = customer || {};

  useEffect(() => {
    if (customer) {
      setDids(['call']); setSaid(''); setFuOn(true);
      setFuDate(S.addDaysIso(S.TODAY_ISO, 7)); setFuTime('09:00');
      const paid = {};
      (customer.invoices || []).forEach((iv) => { if (iv.paid) paid[iv.no] = true; });
      setInvPaid(paid);
      setOsStr(String(S.owed(customer)));
      setConfirmDel(false);
      // Feature 2B: load job history for this customer
      fetch('/api/jobs')
        .then((r) => r.json())
        .then((jobs) => {
          const matches = jobs.filter(
            (j) => j.capturedAt && nameMatchScore(j.customer?.name, customer.name) >= 0.8
          ).slice(0, 6);
          setJobHistory(matches);
        })
        .catch(() => {});
    } else {
      setJobHistory([]);
    }
  }, [customer]);

  const parseMoney = (s) => Math.max(0, Math.round((Number(String(s).replace(/[^\d.]/g, '')) || 0) * 100) / 100);
  const toggleInv = (no) => {
    setInvPaid((prev) => {
      const next = { ...prev, [no]: !prev[no] };
      setOsStr(String(S.sumUnpaid(c, next)));
      return next;
    });
  };
  const recalcOutstanding = () => setOsStr(String(S.sumUnpaid(c, invPaid)));
  const outstandingNum = parseMoney(osStr);

  /* toggle a method on/off, keep at least one selected, keep METHODS order */
  const toggleDid = (mid) => setDids((prev) => {
    if (prev.includes(mid)) return prev.length > 1 ? prev.filter((x) => x !== mid) : prev;
    return METHODS.map((m) => m.id).filter((id) => id === mid || prev.includes(id));
  });

  const QUICK = [{ label: 'In 3 days', n: 3 }, { label: 'In 1 week', n: 7 }, { label: 'In 2 weeks', n: 14 }];
  const save = () => onSave({
    dids, said: said.trim(),
    followUpIso: fuOn ? fuDate : null, followUpTime: fuOn ? fuTime : null,
    outstanding: outstandingNum, invoicePaid: invPaid,
  });
  const plannedEntry = history.find((h) => h.followUpIso) || null;
  const planned = plannedEntry ? plannedEntry.followUpIso : null;
  const plannedTime = plannedEntry ? plannedEntry.followUpTime : null;

  if (!customer) return null;

  return (
    <div className="sl-modal-scrim" onClick={onClose}>
      <div className="sl-modal sl-logmodal" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <div>
            <div className="tw-eyebrow">Log follow-up</div>
            <div className="ttl">{c.name}</div>
            <div className="sl-contact">{[c.contact, c.phone, c.email].filter((x) => x && x !== '—').join(' · ') || 'Manual follow-up — not in the import'}</div>
          </div>
          <div className="sl-headacts">
            <button className="tw-btn tw-icbtn sl-trash" title="Delete this follow-up task" aria-label="Delete this follow-up task" onClick={() => setConfirmDel(true)}><FI.trash /></button>
            <button className="tw-btn tw-icbtn" onClick={onClose}><FI.x /></button>
          </div>
        </div>

        {confirmDel && (
          <div className="sl-delbar">
            <span><b>Delete this follow-up task?</b> Its interaction log will be removed too — this can’t be undone.</span>
            <div className="acts">
              <button className="tw-btn tw-btn--sm" onClick={() => setConfirmDel(false)}>Cancel</button>
              <button className="tw-btn tw-btn--sm sl-delconfirm" onClick={() => onDelete?.(c.id)}><FI.trash />Delete task</button>
            </div>
          </div>
        )}

        <div className="sl-logbody">
          <div className="logmain">
            <div className="sl-q">Outstanding & invoices affected</div>
            <div className="sl-osedit">
              <div className="amtrow">
                <label className="amtfield">
                  <span className="k">Amount still outstanding</span>
                  <div className="money"><span className="cur">R</span>
                    <input inputMode="numeric" value={osStr} onChange={(e) => setOsStr(e.target.value)} /></div>
                </label>
                {(c.invoices || []).length > 0 &&
                  <button className="tw-btn tw-btn--sm recalc" onClick={recalcOutstanding} title="Set to the sum of unticked invoices">Sum unpaid</button>}
              </div>
              {(c.invoices || []).length > 0 ? (
                <div className="invlist">
                  {c.invoices.map((iv) => {
                    const paid = !!invPaid[iv.no];
                    return (
                      <label className={'invrow' + (paid ? ' paid' : '')} key={iv.no}>
                        <input type="checkbox" checked={paid} onChange={() => toggleInv(iv.no)} />
                        <span className="no">{iv.no}</span>
                        <span className="amt">{S.fmtR(iv.amount)}</span>
                        <span className={'days ' + (S.invDays(iv) >= 90 ? 't90' : S.invDays(iv) >= 60 ? 't60' : S.invDays(iv) >= 30 ? 't30' : 't0')}>{S.invDays(iv)}d</span>
                        <span className="state">{paid ? 'Paid' : 'Affected'}</span>
                      </label>);
                  })}
                  <div className="hint">Tick an invoice once it’s paid — the total updates. Or type the exact amount for a partial payment.</div>
                </div>
              ) : (
                <div className="sl-noinv"><FI.flag />No invoice on file — added as a manual follow-up.</div>
              )}
            </div>

            <div className="sl-q">What was done? <span className="opt">tick everything that happened</span></div>
            <div className="sl-methods">
              {METHODS.map((m) => (
                <button key={m.id} className={'sl-method' + (dids.includes(m.id) ? ' on' : '')} onClick={() => toggleDid(m.id)} aria-pressed={dids.includes(m.id)}>
                  <span className="mi"><m.icon /></span><span className="ml">{m.label}</span>
                </button>))}
            </div>

            {(templates || []).length > 0 && (
              <>
                <div className="sl-q">Quick template <span className="opt">optional — fills the note below</span></div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {(templates || []).map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      className="tw-btn tw-btn--sm"
                      onClick={() => setSaid(fillTemplate(tpl.body, c, S.owed(c), S.openInvoices(c), S.oldestDays(c)))}
                    >
                      {tpl.name}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="sl-q">What was said / agreed?</div>
            <textarea className="sl-ta" value={said} onChange={(e) => setSaid(e.target.value)}
              placeholder={c.contact ? `e.g. Spoke to ${c.contact} — promised payment by Friday. Re-check next week.` : 'e.g. Spoke to them — promised payment by Friday. Re-check next week.'} />

            <div className="sl-q">When is the next follow-up?</div>
            <div className={'sl-fu' + (fuOn ? '' : ' off')}>
              <div className="quick">
                {QUICK.map((qk) => {
                  const iso = S.addDaysIso(S.TODAY_ISO, qk.n);
                  return <button key={qk.n} className={'chip' + (fuOn && fuDate === iso ? ' on' : '')} onClick={() => { setFuOn(true); setFuDate(iso); }}>{qk.label}</button>;
                })}
              </div>
              <div className="row">
                <label className="fld"><span className="k">Date</span>
                  <input type="date" value={fuDate} min={S.TODAY_ISO} onChange={(e) => { setFuOn(true); setFuDate(e.target.value); }} /></label>
                <label className="fld fld--time"><span className="k">Time</span>
                  <input type="time" value={fuTime} onChange={(e) => { setFuOn(true); setFuTime(e.target.value); }} /></label>
              </div>
              {fuOn && fuDate &&
                <div className="preview"><FI.clock /><span><b>{S.isoToDow(fuDate)} {S.isoToDisp(fuDate)}</b> at {fuTime} · {S.fuRelative(fuDate)}</span></div>}
            </div>
            <label className="sl-none">
              <input type="checkbox" checked={!fuOn} onChange={(e) => setFuOn(!e.target.checked)} />
              Paid / settled — no follow-up needed, remove from the list
            </label>
          </div>

          <div className="loghist">
            <div className={'sl-todo ' + (planned ? S.fuStatus(planned) : 'none')}>
              <FI.clock />
              <div>
                <div className="k">Next planned follow-up</div>
                <div className="v">{planned ? `${S.isoToDow(planned)} ${S.isoToDisp(planned)}${plannedTime ? ', ' + plannedTime : ''} · ${S.fuRelative(planned)}` : 'None planned — log a follow-up to schedule one'}</div>
              </div>
            </div>
            <div className="sl-histtitle">Interaction history</div>
            <InteractionsTable entries={history} emptyText="No interactions yet — log the first one on the left." />

            {jobHistory.length > 0 && (
              <>
                <div className="sl-histtitle" style={{ marginTop: 14 }}>Captured job cards</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                  {jobHistory.map((j) => (
                    <div key={j.id} style={{ display: 'flex', gap: 10, fontSize: 12, padding: '6px 10px', background: 'var(--bg)', borderRadius: 6, alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: 'var(--ink-1)', minWidth: 60 }}>{j.ref || j.id}</span>
                      <span style={{ color: 'var(--ink-2)', flex: 1 }}>{j.date || '—'}</span>
                      <span style={{ color: 'var(--ink-2)', fontFamily: 'monospace' }}>{j.invoiceNumber || 'No invoice'}</span>
                      {j.charges?.total && <span style={{ color: 'var(--ink-1)' }}>R {Number(String(j.charges.total).replace(/[^\d.]/g, '')).toLocaleString('en-ZA')}</span>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="foot">
          <button className="tw-btn tw-btn--primary" style={{ flex: 1, justifyContent: 'center', height: 42 }} onClick={save}>
            <FI.check />Save interaction
          </button>
          <button className="tw-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>);
}
