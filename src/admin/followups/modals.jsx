/* New-task and customer-settings modals for the follow-ups screen. */
import { useState, useEffect } from 'react';
import { FI } from './icons';
import { S } from './helpers';

/* ── new-task modal ── */
export function TaskModal({ open, customers, onClose, onSave }) {
  const [custId, setCustId] = useState('');
  const [nm, setNm] = useState(''); const [phone, setPhone] = useState(''); const [amt, setAmt] = useState('');
  const [note, setNote] = useState('');
  const [fuDate, setFuDate] = useState(S.addDaysIso(S.TODAY_ISO, 3));
  const [fuTime, setFuTime] = useState('09:00');

  useEffect(() => {
    if (open) { setCustId(''); setNm(''); setPhone(''); setAmt(''); setNote(''); setFuDate(S.addDaysIso(S.TODAY_ISO, 3)); setFuTime('09:00'); }
  }, [open]);
  if (!open) return null;

  const isNew = custId === '__new__';
  const sorted = [...customers].sort((a, b) => a.name.localeCompare(b.name));
  const valid = !!(isNew ? nm.trim() : custId) && !!fuDate;
  const QUICK = [{ label: 'Tomorrow', n: 1 }, { label: 'In 3 days', n: 3 }, { label: 'In 1 week', n: 7 }, { label: 'In 2 weeks', n: 14 }];

  const submit = () => {
    if (!valid) return;
    onSave({
      customerId: isNew ? null : custId,
      newCustomer: isNew ? { name: nm.trim(), phone: phone.trim(), amount: amt ? Number(String(amt).replace(/[^\d.]/g, '')) || 0 : 0 } : null,
      note: note.trim(), followUpIso: fuDate, followUpTime: fuTime,
    });
  };

  return (
    <div className="sl-modal-scrim" onClick={onClose}>
      <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <div><div className="tw-eyebrow">Action list</div><div className="ttl">New follow-up task</div></div>
          <button className="tw-btn tw-icbtn" onClick={onClose}><FI.x /></button>
        </div>
        <div className="body">
          <div className="sl-q">Who is this for?</div>
          <div className="sl-selectwrap">
            <select value={custId} onChange={(e) => setCustId(e.target.value)}>
              <option value="" disabled>Choose a customer…</option>
              {sorted.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="__new__">＋ Someone not in the list…</option>
            </select>
            <FI.chevD />
          </div>
          {isNew && (
            <div className="sl-newfields">
              <input placeholder="Customer / person name" value={nm} onChange={(e) => setNm(e.target.value)} autoFocus />
              <div className="row2">
                <input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <input placeholder="Amount owed (optional)" value={amt} onChange={(e) => setAmt(e.target.value)} />
              </div>
            </div>
          )}

          <div className="sl-q">What needs doing? <span className="opt">optional</span></div>
          <textarea className="sl-ta" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Call about the overdue balance and confirm a payment date." />

          <div className="sl-q">Follow up on</div>
          <div className="sl-fu">
            <div className="quick">
              {QUICK.map((qk) => { const iso = S.addDaysIso(S.TODAY_ISO, qk.n); return <button key={qk.n} className={'chip' + (fuDate === iso ? ' on' : '')} onClick={() => setFuDate(iso)}>{qk.label}</button>; })}
            </div>
            <div className="row">
              <label className="fld"><span className="k">Date</span>
                <input type="date" value={fuDate} min={S.TODAY_ISO} onChange={(e) => setFuDate(e.target.value)} /></label>
              <label className="fld fld--time"><span className="k">Time</span>
                <input type="time" value={fuTime} onChange={(e) => setFuTime(e.target.value)} /></label>
            </div>
            {fuDate && <div className="preview"><FI.clock /><span><b>{S.isoToDow(fuDate)} {S.isoToDisp(fuDate)}</b> at {fuTime} · {S.fuRelative(fuDate)}</span></div>}
          </div>
        </div>
        <div className="foot">
          <button className="tw-btn tw-btn--primary" disabled={!valid} style={{ flex: 1, justifyContent: 'center', height: 42 }} onClick={submit}><FI.plus />Create task</button>
          <button className="tw-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>);
}

/* ── settings (customers + templates) ── */
export function SettingsModal({ open, customers, templates, onClose, onSaveCustomer, onAddCustomer, onSaveTemplates }) {
  const [settTab, setSettTab] = useState('customers');
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({ contact: '', phone: '', email: '', address: '' });
  const [adding, setAdding] = useState(false);
  const [newC, setNewC] = useState({ name: '', contact: '', phone: '', email: '', address: '' });

  const [editTplId, setEditTplId] = useState(null);
  const [tplDraft, setTplDraft] = useState({ name: '', body: '' });
  const [addingTpl, setAddingTpl] = useState(false);
  const [newTpl, setNewTpl] = useState({ name: '', body: '' });

  useEffect(() => {
    if (open) {
      setSettTab('customers');
      setEditId(null); setAdding(false); setNewC({ name: '', contact: '', phone: '', email: '', address: '' });
      setEditTplId(null); setAddingTpl(false); setNewTpl({ name: '', body: '' });
    }
  }, [open]);
  if (!open) return null;

  const sorted = [...customers].sort((a, b) => a.name.localeCompare(b.name));
  const startEdit = (c) => { setEditId(c.id); setDraft({ contact: c.contact || '', phone: c.phone || '', email: c.email || '', address: c.address || '' }); setAdding(false); };
  const commitEdit = () => { onSaveCustomer(editId, draft); setEditId(null); };
  const commitAdd = () => { if (!newC.name.trim()) return; onAddCustomer({ ...newC, name: newC.name.trim() }); setAdding(false); setNewC({ name: '', contact: '', phone: '', email: '', address: '' }); };

  const startEditTpl = (t) => { setEditTplId(t.id); setTplDraft({ name: t.name, body: t.body }); setAddingTpl(false); };
  const commitEditTpl = () => {
    if (!tplDraft.name.trim() || !tplDraft.body.trim()) return;
    onSaveTemplates(templates.map((t) => (t.id === editTplId ? { ...t, name: tplDraft.name.trim(), body: tplDraft.body.trim() } : t)));
    setEditTplId(null);
  };
  const commitAddTpl = () => {
    if (!newTpl.name.trim() || !newTpl.body.trim()) return;
    onSaveTemplates([...templates, { id: 'tpl-' + Date.now().toString(36), name: newTpl.name.trim(), body: newTpl.body.trim() }]);
    setAddingTpl(false);
    setNewTpl({ name: '', body: '' });
  };
  const removeTpl = (t) => {
    if (!window.confirm(`Delete the "${t.name}" template?`)) return;
    onSaveTemplates(templates.filter((x) => x.id !== t.id));
  };

  return (
    <div className="sl-modal-scrim" onClick={onClose}>
      <div className="sl-modal sl-settings" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <div>
            <div className="tw-eyebrow">Settings</div>
            <div className="ttl">{settTab === 'customers' ? 'Customers' : 'Follow-up templates'}</div>
            <div className="sl-contact">
              {settTab === 'customers'
                ? 'Contact details fill in as you import invoices — add or edit phone, email and address here.'
                : 'These quick templates appear when logging a call, WhatsApp or email on a customer’s follow-up card. Use {contact}, {amount}, {invoices}, {oldestDays} and {today} as placeholders — they’re filled in automatically.'}
            </div>
          </div>
          <button className="tw-btn tw-icbtn" onClick={onClose}><FI.x /></button>
        </div>

        <div className="sl-setttabs">
          <button className={'tw-tab' + (settTab === 'customers' ? ' is-active' : '')} onClick={() => setSettTab('customers')}>Customers</button>
          <button className={'tw-tab' + (settTab === 'templates' ? ' is-active' : '')} onClick={() => setSettTab('templates')}>Templates</button>
        </div>

        {settTab === 'customers' ? <>
        <div className="sl-settbar">
          <span className="cnt">{customers.length} customer{customers.length === 1 ? '' : 's'}</span>
          {!adding &&
            <button className="tw-btn tw-btn--primary tw-btn--sm" onClick={() => { setAdding(true); setEditId(null); }}><FI.plus />Add customer</button>}
        </div>

        <div className="body">
          {adding &&
            <div className="sl-custcard adding">
              <div className="ca-head">
                <input className="nm-in" placeholder="Customer / company name" value={newC.name} autoFocus onChange={(e) => setNewC({ ...newC, name: e.target.value })} />
              </div>
              <div className="ca-fields">
                <label className="f wide"><span className="k"><FI.user />Contact person</span>
                  <input placeholder="e.g. Thabo Mokoena" value={newC.contact} onChange={(e) => setNewC({ ...newC, contact: e.target.value })} /></label>
                <label className="f"><span className="k"><FI.phone />Telephone</span>
                  <input placeholder="e.g. 021 555 0100" value={newC.phone} onChange={(e) => setNewC({ ...newC, phone: e.target.value })} /></label>
                <label className="f"><span className="k"><FI.mail />Email</span>
                  <input placeholder="e.g. accounts@company.co.za" value={newC.email} onChange={(e) => setNewC({ ...newC, email: e.target.value })} /></label>
                <label className="f wide"><span className="k"><FI.pin />Address</span>
                  <input placeholder="e.g. 12 Main Rd, Claremont, Cape Town" value={newC.address} onChange={(e) => setNewC({ ...newC, address: e.target.value })} /></label>
              </div>
              <div className="ca-foot">
                <button className="tw-btn tw-btn--primary tw-btn--sm" disabled={!newC.name.trim()} onClick={commitAdd}><FI.check />Add customer</button>
                <button className="tw-btn tw-btn--sm" onClick={() => setAdding(false)}>Cancel</button>
              </div>
            </div>}

          {sorted.map((c) => {
            const editing = editId === c.id;
            const has = c.contact || c.phone || c.email || c.address;
            return (
              <div className={'sl-custcard' + (editing ? ' editing' : '')} key={c.id}>
                <div className="ca-head">
                  <div className="nm">{c.name}</div>
                  <div className="sub">{S.owed(c) > 0 ? S.fmtR(S.owed(c)) + ' · ' : ''}{(c.invoices || []).length} invoice{(c.invoices || []).length === 1 ? '' : 's'}</div>
                  {!editing && <button className="tw-btn tw-btn--sm" onClick={() => startEdit(c)}>{has ? 'Edit' : 'Add details'}</button>}
                </div>
                {editing
                  ? <>
                      <div className="ca-fields">
                        <label className="f wide"><span className="k"><FI.user />Contact person</span>
                          <input placeholder="e.g. Thabo Mokoena" value={draft.contact} onChange={(e) => setDraft({ ...draft, contact: e.target.value })} /></label>
                        <label className="f"><span className="k"><FI.phone />Telephone</span>
                          <input placeholder="e.g. 021 555 0100" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></label>
                        <label className="f"><span className="k"><FI.mail />Email</span>
                          <input placeholder="e.g. accounts@company.co.za" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label>
                        <label className="f wide"><span className="k"><FI.pin />Address</span>
                          <input placeholder="e.g. 12 Main Rd, Claremont, Cape Town" value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></label>
                      </div>
                      <div className="ca-foot">
                        <button className="tw-btn tw-btn--primary tw-btn--sm" onClick={commitEdit}><FI.check />Save</button>
                        <button className="tw-btn tw-btn--sm" onClick={() => setEditId(null)}>Cancel</button>
                      </div>
                    </>
                  : <div className="ca-view">
                      {c.contact && c.contact !== '—' && <span className="ci"><FI.user />{c.contact}</span>}
                      {c.phone && <span className="ci"><FI.phone />{c.phone}</span>}
                      {c.email && <span className="ci"><FI.mail />{c.email}</span>}
                      {c.address && <span className="ci addr"><FI.pin />{c.address}</span>}
                      {!has && <span className="ci none">No contact details yet</span>}
                    </div>}
              </div>);
          })}
        </div>
        </> : <>

        <div className="sl-settbar">
          <span className="cnt">{templates.length} template{templates.length === 1 ? '' : 's'}</span>
          {!addingTpl &&
            <button className="tw-btn tw-btn--primary tw-btn--sm" onClick={() => { setAddingTpl(true); setEditTplId(null); }}><FI.plus />Add template</button>}
        </div>

        <div className="body">
          {addingTpl &&
            <div className="sl-custcard adding">
              <div className="ca-head">
                <input className="nm-in" placeholder="Template name, e.g. Second reminder" value={newTpl.name} autoFocus onChange={(e) => setNewTpl({ ...newTpl, name: e.target.value })} />
              </div>
              <div className="ca-fields">
                <label className="f wide"><span className="k">Message</span>
                  <textarea className="sl-ta tpl-ta" placeholder="Hi {contact} — ..." value={newTpl.body} onChange={(e) => setNewTpl({ ...newTpl, body: e.target.value })} /></label>
              </div>
              <div className="ca-foot">
                <button className="tw-btn tw-btn--primary tw-btn--sm" disabled={!newTpl.name.trim() || !newTpl.body.trim()} onClick={commitAddTpl}><FI.check />Add template</button>
                <button className="tw-btn tw-btn--sm" onClick={() => setAddingTpl(false)}>Cancel</button>
              </div>
            </div>}

          {templates.map((t) => {
            const editing = editTplId === t.id;
            return (
              <div className={'sl-custcard' + (editing ? ' editing' : '')} key={t.id}>
                <div className="ca-head">
                  {editing
                    ? <input className="nm-in" value={tplDraft.name} onChange={(e) => setTplDraft({ ...tplDraft, name: e.target.value })} />
                    : <div className="nm">{t.name}</div>}
                  {!editing && <button className="tw-btn tw-btn--sm" onClick={() => startEditTpl(t)}>Edit</button>}
                </div>
                {editing
                  ? <>
                      <div className="ca-fields">
                        <label className="f wide"><span className="k">Message</span>
                          <textarea className="sl-ta tpl-ta" value={tplDraft.body} onChange={(e) => setTplDraft({ ...tplDraft, body: e.target.value })} /></label>
                      </div>
                      <div className="ca-foot">
                        <button className="tw-btn tw-btn--primary tw-btn--sm" onClick={commitEditTpl}><FI.check />Save</button>
                        <button className="tw-btn tw-btn--sm" onClick={() => setEditTplId(null)}>Cancel</button>
                        <button className="tw-btn tw-btn--sm tpl-del" onClick={() => removeTpl(t)}>Delete</button>
                      </div>
                    </>
                  : <div className="ca-view tpl-preview">{t.body}</div>}
              </div>);
          })}
        </div>
        </>}

        <div className="foot">
          <button className="tw-btn tw-btn--primary" style={{ flex: 1, justifyContent: 'center', height: 42 }} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>);
}
