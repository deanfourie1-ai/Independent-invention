import { useState, useMemo, useRef, useEffect } from 'react';
import Icon from '../../components/Icon';
import { FI } from './icons';
import { S } from './helpers';
import useFollowups from '../../hooks/useFollowups';
import {
  addInteraction, patchCustomer, addCustomer, deleteCustomer, replaceCustomers,
} from '../../services/followups';
import { fillTemplate, DEFAULT_TEMPLATES } from './templates';
import { nameMatchScore } from '../../services/nameMatcher';

const LOGGED_BY = 'Admin';
const IMPORT_KEY = 'tidewell.followups.import';
const DEFAULT_IMPORT = { file: 'Outstanding invoices list', sheet: 'Aged debtors', date: '', time: '' };
const nowTime = () => new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });

const METHODS = [
  { id: 'call', label: 'Called', icon: FI.phone },
  { id: 'whatsapp', label: 'WhatsApp', icon: FI.whatsapp },
  { id: 'email', label: 'Emailed', icon: FI.mail },
  { id: 'visit', label: 'Visited', icon: FI.pin },
  { id: 'note', label: 'Note', icon: FI.note },
];
const LABELS = { call: 'Called', whatsapp: 'WhatsApp', email: 'Emailed', visit: 'Visited', note: 'Note', task: 'To-do' };
const didLabel = (m) => LABELS[m] || m;
const didIcon = (m) => m === 'call' ? <FI.phone /> : m === 'whatsapp' ? <FI.whatsapp /> : m === 'email' ? <FI.mail /> : m === 'visit' ? <FI.pin /> : m === 'task' ? <FI.flag /> : <FI.note />;

/* ── shared interactions table ── */
function InteractionsTable({ entries, emptyText }) {
  if (!entries || entries.length === 0) return <div className="sl-noh">{emptyText || 'No interactions logged yet.'}</div>;
  return (
    <table className="sl-itable">
      <colgroup><col className="c-type" /><col className="c-when" /><col /><col className="c-fu" /></colgroup>
      <thead><tr><th>Type</th><th>Created at</th><th>Notes</th><th>Follow up</th></tr></thead>
      <tbody>
        {entries.map((a) => (
          <tr key={a.id}>
            <td className="ty">
              <span className={'tymark v-' + a.did}>{didIcon(a.did)}</span>
              <span className="tylab">{didLabel(a.did)}{a.invoice && <span className="invref">{a.invoice}</span>}</span>
            </td>
            <td className="ca">{a.date}<span className="t">{a.time}</span></td>
            <td className="no"><span className="said">{a.said}</span><span className="by">{a.by}</span></td>
            <td className="fu-col">{a.followUpIso
              ? (() => { const st = S.fuStatus(a.followUpIso); return (
                  <span className={'fucell st-' + st}>
                    <span className="d">{S.isoToDisp(a.followUpIso)}{a.followUpTime ? ', ' + a.followUpTime : ''}</span>
                    <span className="r">{S.fuRelative(a.followUpIso)}</span>
                  </span>); })()
              : <span className="dash">—</span>}</td>
          </tr>))}
      </tbody>
    </table>);
}

function FuChip({ iso, time, small }) {
  if (!iso) return <span className={'fu none' + (small ? ' sm' : '')}><FI.clock />No follow-up planned</span>;
  const st = S.fuStatus(iso);
  return (
    <span className={'fu st-' + st + (small ? ' sm' : '')}>
      <FI.clock />Follow up {S.isoToDisp(iso)}{time ? ', ' + time : ''} · {S.fuRelative(iso)}
    </span>);
}

/* ── import band ── */
function ImportBand({ meta, count, total, invoiceCount, onReimport }) {
  return (
    <div className="sl-import">
      <span className="xl"><FI.excel /></span>
      <div className="meta">
        <div className="ttl">{meta.file}</div>
        <div className="sub">{meta.date ? `Imported ${meta.date}${meta.time ? ', ' + meta.time : ''} · ` : ''}<b>{count} follow-up task{count === 1 ? '' : 's'}</b>{invoiceCount ? ` from ${invoiceCount} invoices` : ''} · {S.fmtR(total)} outstanding</div>
      </div>
      <button className="tw-btn" onClick={onReimport}><FI.upload />Upload Excel list</button>
    </div>);
}

/* ── action list ── */
const BUCKETS = [
  { id: 'overdue', label: 'Overdue', tone: 'overdue' },
  { id: 'today', label: 'Due today', tone: 'today' },
  { id: 'upcoming', label: 'Upcoming', tone: 'upcoming' },
  { id: 'first', label: 'Needs first contact', tone: 'first' },
  { id: 'resolved', label: 'Fully paid', tone: 'resolved' },
];
const bucketOf = (r) => {
  if (r.resolved) return 'resolved';
  if (!r.planned) return 'first';
  const st = S.fuStatus(r.planned);
  return st === 'overdue' ? 'overdue' : st === 'today' ? 'today' : 'upcoming';
};

function ActionRow({ r, onOpen }) {
  const { c, planned, plannedTime, last, neverContacted, plannedIsTask, resolved } = r;
  return (
    <div className="sl-item" onClick={() => onOpen(c.id)}>
      <div className="who">
        <div className="nm">{c.name}</div>
        <div className="meta2">
          {c.contact && c.contact !== '—'
            ? <><FI.user style={{ width: 12, height: 12, verticalAlign: -2, marginRight: 4 }} />{c.contact}</>
            : 'Added manually'}
        </div>
        {(c.phone || c.email) &&
          <div className="sl-contactline">
            {c.phone && <span className="ci"><FI.phone />{c.phone}</span>}
            {c.email && <span className="ci"><FI.mail />{c.email}</span>}
          </div>}
      </div>
      <div className="amt">
        <div className="v">{S.owed(c) > 0 ? S.fmtR(S.owed(c)) : '—'}</div>
        <div className="inv">{(() => { const open = S.openInvoices(c).length; return open ? `${open} invoice${open > 1 ? 's' : ''} · oldest ${S.oldestDays(c)}d` : 'No open invoices'; })()}</div>
      </div>
      <div className="next">
        {resolved
          ? <span className="fu paidchip"><FI.checkc />Fully paid</span>
          : planned
            ? <FuChip iso={planned} time={plannedTime} />
            : neverContacted
              ? <span className="fu firstcontact"><FI.phone />Needs first contact</span>
              : <FuChip iso={null} />}
        {last
          ? <span className="lastln">Last: {didLabel(last.did).toLowerCase()} {last.date}</span>
          : plannedIsTask
            ? <span className="lastln"><FI.flag style={{ width: 11, height: 11, verticalAlign: -1, marginRight: 3 }} />Task you added</span>
            : null}
      </div>
      <button className="tw-btn tw-btn--sm sl-openbtn" onClick={(e) => { e.stopPropagation(); onOpen(c.id); }}>
        {resolved ? 'View' : 'Log'}<FI.chevR />
      </button>
    </div>);
}

function ActionList({ rows, onOpen }) {
  if (!rows.length) {
    return (
      <div className="tw-card"><div className="sl-allclear">
        <div className="big"><FI.checkc /></div>
        <h3>All caught up</h3>
        <p>Every customer who owes has a follow-up logged. Nice work.</p>
      </div></div>);
  }
  const groups = BUCKETS.map((b) => ({ ...b, items: rows.filter((r) => bucketOf(r) === b.id) })).filter((g) => g.items.length);
  return (
    <div className="sl-groups">
      {groups.map((g) => (
        <div className="tw-card sl-group" key={g.id}>
          <div className={'sl-ghead tone-' + g.tone}><span className="dot" />{g.label}<span className="n">{g.items.length}</span></div>
          <div className="sl-list">
            {g.items.map((r) => <ActionRow key={r.c.id} r={r} onOpen={onOpen} />)}
          </div>
        </div>))}
    </div>);
}

/* ── history grouped by customer ── */
function HistoryGroups({ groups, query, onOpen }) {
  if (!groups.length) {
    return <div className="tw-card"><div className="tw-empty">{query ? 'No interactions match this search.' : 'No interactions logged yet.'}</div></div>;
  }
  const q = (query || '').trim().toLowerCase();
  const hl = (text) => {
    if (!q || !text) return text || null;
    const i = text.toLowerCase().indexOf(q);
    if (i < 0) return text;
    return <>{text.slice(0, i)}<mark className="sl-hl">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
  };
  return (
    <div className="tw-card" style={{ overflow: 'hidden' }}>
      <div className="sl-clist">
        {groups.map((g) => {
          const last = g.entries[0];
          return (
            <div className="sl-crow" key={g.id} onClick={() => onOpen(g.id)}>
              <div className="who">
                <div className="nmrow">
                  <div className="nm">{hl(g.name)}</div>
                  {g.settled && <span className="sl-paidflag"><FI.checkc />Fully paid</span>}
                </div>
                <div className="cnt">{g.entries.length} interaction{g.entries.length > 1 ? 's' : ''}</div>
              </div>
              <div className="prev">
                <span className={'verb v-' + last.did}>{didLabel(last.did)}</span>
                <span className="said">{hl(last.said)}</span>
              </div>
              <div className="aside">
                <div className="logged">Last {last.date}</div>
                <span className="tw-btn tw-btn--sm">View<FI.chevR /></span>
              </div>
            </div>);
        })}
      </div>
    </div>);
}

/* ── read-only interactions popup ── */
function InteractionsPopup({ customer, entries, onClose, onPrint, onExport, onLog }) {
  if (!customer) return null;
  const c = customer;
  return (
    <div className="sl-modal-scrim" onClick={onClose}>
      <div className="sl-modal sl-popup" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <div>
            <div className="tw-eyebrow">Interactions</div>
            <div className="ttl">{c.name}</div>
            <div className="sl-contact">{[c.contact, c.phone, c.email].filter((x) => x && x !== '—').join(' · ') || 'Manual follow-up — not in the import'}</div>
          </div>
          <button className="tw-btn tw-icbtn" onClick={onClose}><FI.x /></button>
        </div>
        <div className="sl-poptools">
          <span className="cnt">{entries.length} interaction{entries.length === 1 ? '' : 's'}{S.owed(c) > 0 ? ` · owes ${S.fmtR(S.owed(c))}` : ''}</span>
          <div className="acts">
            <button className="tw-btn tw-btn--sm" onClick={() => onExport(c, entries)}><FI.excel />Export CSV</button>
            <button className="tw-btn tw-btn--sm" onClick={() => onPrint(c)}><FI.printer />Print</button>
          </div>
        </div>
        <div className="body">
          <InteractionsTable entries={entries} emptyText={`No interactions logged with ${c.name} yet.`} />
        </div>
        <div className="foot">
          <button className="tw-btn tw-btn--primary" style={{ flex: 1, justifyContent: 'center', height: 42 }} onClick={() => onLog(c.id)}><FI.phone />Log a follow-up</button>
          <button className="tw-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>);
}

function PrintDoc({ customer, entries }) {
  if (!customer) return null;
  const c = customer;
  return (
    <div className="sl-printdoc">
      <div className="ph">
        <div className="brand">Jobtool · Customer follow-ups</div>
        <h1>Interactions — {c.name}</h1>
        <div className="meta">
          {[c.contact, c.phone, c.email].filter((x) => x && x !== '—').join(' · ') || 'Manual follow-up — not in the import'}
          {S.owed(c) > 0 ? ` · Owes ${S.fmtR(S.owed(c))}` : ''}
        </div>
        <div className="gen">Printed {S.isoToDisp(S.TODAY_ISO)} · {entries.length} interaction{entries.length === 1 ? '' : 's'}</div>
      </div>
      <table className="pt">
        <thead><tr><th>Date</th><th>Type</th><th>Invoice</th><th>What was said / agreed</th><th>Next follow-up</th><th>By</th></tr></thead>
        <tbody>
          {entries.map((a) => (
            <tr key={a.id}>
              <td className="nw">{a.date}<br />{a.time}</td>
              <td className="nw">{didLabel(a.did)}</td>
              <td className="nw">{a.invoice || '—'}</td>
              <td>{a.said}</td>
              <td className="nw">{a.followUpIso ? S.isoToDisp(a.followUpIso) + (a.followUpTime ? ' ' + a.followUpTime : '') : '—'}</td>
              <td className="nw">{a.by}</td>
            </tr>))}
        </tbody>
      </table>
    </div>);
}

/* ── customer drawer: combined history + log ── */
function CustomerDrawer({ customer, history, onClose, onSave, onDelete, templates }) {
  const [did, setDid] = useState('call');
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
      setDid('call'); setSaid(''); setFuOn(true);
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

  const parseMoney = (s) => Math.max(0, Math.round(Number(String(s).replace(/[^\d.]/g, '')) || 0));
  const toggleInv = (no) => {
    setInvPaid((prev) => {
      const next = { ...prev, [no]: !prev[no] };
      setOsStr(String(S.sumUnpaid(c, next)));
      return next;
    });
  };
  const recalcOutstanding = () => setOsStr(String(S.sumUnpaid(c, invPaid)));
  const outstandingNum = parseMoney(osStr);

  const QUICK = [{ label: 'In 3 days', n: 3 }, { label: 'In 1 week', n: 7 }, { label: 'In 2 weeks', n: 14 }];
  const save = () => onSave({
    did, said: said.trim(),
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

            <div className="sl-q">What was done?</div>
            <div className="sl-methods">
              {METHODS.map((m) => (
                <button key={m.id} className={'sl-method' + (did === m.id ? ' on' : '')} onClick={() => setDid(m.id)}>
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

/* ── new-task modal ── */
function TaskModal({ open, customers, onClose, onSave }) {
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

/* ── day bar ── */
function DayBar({ workDate, onSet, counts }) {
  const isToday = workDate === S.TODAY_ISO;
  const rel = workDate === S.TODAY_ISO ? 'Today'
    : workDate === S.addDaysIso(S.TODAY_ISO, 1) ? 'Tomorrow'
    : workDate === S.addDaysIso(S.TODAY_ISO, -1) ? 'Yesterday' : null;
  return (
    <div className="sl-daybar">
      <div className="lead">
        <div className="lab">To-do list for</div>
        <div className="date">{S.isoToDow(workDate)} {S.isoToDisp(workDate)}{rel ? <span className="rel">{rel}</span> : null}</div>
      </div>
      <div className="sl-daycounts">
        {counts.overdue > 0 && <span className="dc overdue">{counts.overdue} overdue</span>}
        <span className="dc today">{counts.today} due</span>
        {counts.upcoming > 0 && <span className="dc upcoming">{counts.upcoming} upcoming</span>}
      </div>
      <div className="sl-daynav">
        <button className="tw-btn tw-btn--sm" title="Previous day" onClick={() => onSet(S.addDaysIso(workDate, -1))}><FI.chevR style={{ transform: 'rotate(180deg)' }} /></button>
        <button className={'tw-btn tw-btn--sm' + (isToday ? ' is-on' : '')} onClick={() => onSet(S.TODAY_ISO)}>Today</button>
        <button className="tw-btn tw-btn--sm" title="Next day" onClick={() => onSet(S.addDaysIso(workDate, 1))}><FI.chevR /></button>
      </div>
    </div>);
}

/* ── settings (customers) ── */
function SettingsModal({ open, customers, onClose, onSaveCustomer, onAddCustomer }) {
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState({ contact: '', phone: '', email: '', address: '' });
  const [adding, setAdding] = useState(false);
  const [newC, setNewC] = useState({ name: '', contact: '', phone: '', email: '', address: '' });

  useEffect(() => { if (open) { setEditId(null); setAdding(false); setNewC({ name: '', contact: '', phone: '', email: '', address: '' }); } }, [open]);
  if (!open) return null;

  const sorted = [...customers].sort((a, b) => a.name.localeCompare(b.name));
  const startEdit = (c) => { setEditId(c.id); setDraft({ contact: c.contact || '', phone: c.phone || '', email: c.email || '', address: c.address || '' }); setAdding(false); };
  const commitEdit = () => { onSaveCustomer(editId, draft); setEditId(null); };
  const commitAdd = () => { if (!newC.name.trim()) return; onAddCustomer({ ...newC, name: newC.name.trim() }); setAdding(false); setNewC({ name: '', contact: '', phone: '', email: '', address: '' }); };

  return (
    <div className="sl-modal-scrim" onClick={onClose}>
      <div className="sl-modal sl-settings" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <div>
            <div className="tw-eyebrow">Settings</div>
            <div className="ttl">Customers</div>
            <div className="sl-contact">Contact details fill in as you import invoices — add or edit phone, email and address here.</div>
          </div>
          <button className="tw-btn tw-icbtn" onClick={onClose}><FI.x /></button>
        </div>

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

        <div className="foot">
          <button className="tw-btn tw-btn--primary" style={{ flex: 1, justifyContent: 'center', height: 42 }} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>);
}

function Brand() {
  return (
    <div className="tw-brand">
      <div className="tw-logo"><Icon name="droplet" size={18} /></div>
      <div>
        <div className="tw-brand-name">Jobtool</div>
        <div className="tw-brand-sub">Admin panel</div>
      </div>
    </div>);
}

/* ── Excel import: column-mapping helpers ──────────────────────────
   The importer reads the sheet as raw rows (array-of-arrays) so it works
   even with no header row, then the user maps which column is which. */
const MAP_KEY = 'tidewell.followups.colmap';
const MAP_FIELDS = [
  { key: 'customer', label: 'Customer name', req: true },
  { key: 'amount', label: 'Amount outstanding', req: true },
  { key: 'invoice', label: 'Invoice number', req: false },
  { key: 'date', label: 'Invoice date', req: false },
  { key: 'days', label: 'Days overdue', req: false },
];

function colLetter(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
function parseMoney(v) { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? Math.round(n) : 0; }
function isoFromDateCell(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 0) { const d = new Date(Math.round((v - 25569) * 86400000)); return isNaN(d) ? null : d.toISOString().slice(0, 10); }
  const t = Date.parse(String(v)); return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}
function daysFromCell(v) { const iso = isoFromDateCell(v); return iso ? Math.max(0, S.daysBetween(iso, S.today)) : 0; }

function deriveColumns(aoa, hasHeader) {
  const colCount = aoa.reduce((m, r) => Math.max(m, r.length), 0);
  const dataRows = hasHeader ? aoa.slice(1) : aoa;
  const header = hasHeader ? (aoa[0] || []) : null;
  const columns = [];
  for (let i = 0; i < colCount; i++) {
    const label = hasHeader && header[i] != null && String(header[i]).trim()
      ? String(header[i]).trim() : 'Column ' + colLetter(i);
    const sampleRow = dataRows.find((r) => r[i] !== '' && r[i] != null);
    columns.push({ index: i, label, sample: sampleRow ? String(sampleRow[i] instanceof Date ? sampleRow[i].toLocaleDateString() : sampleRow[i]) : '' });
  }
  return { columns, dataRows };
}

function guessHeader(aoa) {
  const row0 = aoa[0] || [];
  const re = /customer|client|account|name|debtor|amount|outstanding|balance|invoice|date|days|age|total/i;
  return row0.filter((c) => typeof c === 'string' && re.test(c)).length >= 2;
}

function guessByContent(columns, dataRows) {
  const isNumish = (v) => v !== '' && v != null && !(v instanceof Date) && (typeof v === 'number' || /^[R\s]*-?[\d.,]+$/.test(String(v).trim()));
  const stats = columns.map((c) => {
    const vals = dataRows.map((r) => r[c.index]).filter((v) => v !== '' && v != null);
    return {
      index: c.index,
      numFrac: vals.length ? vals.filter(isNumish).length / vals.length : 0,
      hasDec: vals.some((v) => /[.,]\d{2}\b/.test(String(v))),
      isDate: vals.some((v) => v instanceof Date),
      count: vals.length,
    };
  });
  const text = stats.filter((s) => s.count && s.numFrac < 0.4 && !s.isDate);
  const nums = stats.filter((s) => s.numFrac > 0.6 && !s.isDate);
  const dateCol = stats.find((s) => s.isDate);
  return {
    customer: (text[0] || columns[0] || {}).index ?? null,
    amount: ((nums.find((s) => s.hasDec) || nums[0]) || {}).index ?? null,
    invoice: null,
    date: dateCol ? dateCol.index : null,
    days: null,
  };
}

function initialMap(columns, dataRows, savedMap, hasHeader) {
  if (savedMap && savedMap.colCount === columns.length) {
    return { customer: savedMap.customer ?? null, amount: savedMap.amount ?? null, invoice: savedMap.invoice ?? null, date: savedMap.date ?? null, days: savedMap.days ?? null };
  }
  if (hasHeader) {
    const find = (re) => { const c = columns.find((c) => re.test(c.label)); return c ? c.index : null; };
    const m = { customer: find(/customer|client|account|name|debtor/i), amount: find(/amount|outstanding|balance|total|due|value/i), invoice: find(/invoice|inv\b|doc|reference|ref\b/i), date: find(/date/i), days: find(/days|age/i) };
    if (m.customer != null && m.amount != null) return m;
    return { ...guessByContent(columns, dataRows), ...Object.fromEntries(Object.entries(m).filter(([, v]) => v != null)) };
  }
  return guessByContent(columns, dataRows);
}

function ImportMapModal({ draft, savedMap, onCancel, onConfirm }) {
  const [hasHeader, setHasHeader] = useState(() => guessHeader(draft.aoa));
  const { columns, dataRows } = useMemo(() => deriveColumns(draft.aoa, hasHeader), [draft.aoa, hasHeader]);
  const [map, setMap] = useState(() => initialMap(columns, dataRows, savedMap, hasHeader));

  const setField = (k, v) => setMap((m) => ({ ...m, [k]: v === '' ? null : Number(v) }));
  const valid = map.customer != null && map.amount != null;
  const trunc = (s) => { s = String(s ?? ''); return s.length > 24 ? s.slice(0, 23) + '…' : s; };
  const cellDays = (r) => map.days != null ? Math.max(0, Math.round(Number(String(r[map.days]).replace(/[^\d.-]/g, '')) || 0)) : map.date != null ? daysFromCell(r[map.date]) : 0;
  const preview = dataRows.slice(0, 5).map((r) => ({
    customer: map.customer != null ? String(r[map.customer] ?? '') : '',
    invoice: map.invoice != null ? (String(r[map.invoice] ?? '').trim() || '—') : '—',
    amount: map.amount != null ? parseMoney(r[map.amount]) : 0,
    days: cellDays(r),
  }));

  return (
    <div className="sl-modal-scrim" onClick={onCancel}>
      <div className="sl-modal sl-mapmodal" onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <div>
            <div className="tw-eyebrow">Import from Excel</div>
            <div className="ttl">Map your columns</div>
            <div className="sl-contact">{draft.fileName} · {draft.sheetName} · {dataRows.length} row{dataRows.length === 1 ? '' : 's'}</div>
          </div>
          <button className="tw-btn tw-icbtn" onClick={onCancel}><FI.x /></button>
        </div>
        <div className="body">
          <label className="sl-headtoggle">
            <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
            First row contains column headings
          </label>
          <div className="sl-map-grid">
            {MAP_FIELDS.map((f) => (
              <div className="sl-map-field" key={f.key}>
                <span className="k">{f.label}{f.req && <span className="req">*</span>}</span>
                <select className="sl-msel" value={map[f.key] == null ? '' : map[f.key]} onChange={(e) => setField(f.key, e.target.value)}>
                  <option value="">— none —</option>
                  {columns.map((c) => <option key={c.index} value={c.index}>{c.label}{c.sample ? ` · e.g. ${trunc(c.sample)}` : ''}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="sl-q" style={{ marginBottom: 8 }}>Preview</div>
          <div className="sl-map-preview">
            <table>
              <thead><tr><th>Customer</th><th>Invoice</th><th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>Days</th></tr></thead>
              <tbody>
                {preview.map((p, i) => (
                  <tr key={i}>
                    <td>{p.customer || <span className="muted">—</span>}</td>
                    <td className="mono">{p.invoice}</td>
                    <td style={{ textAlign: 'right' }}>{p.amount ? S.fmtR(p.amount) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{p.days || 0}d</td>
                  </tr>))}
              </tbody>
            </table>
          </div>
          {!valid && <div className="sl-map-hint">Pick at least the <b>Customer name</b> and <b>Amount</b> columns to continue.</div>}
        </div>
        <div className="foot">
          <button className="tw-btn tw-btn--primary" disabled={!valid} style={{ flex: 1, justifyContent: 'center', height: 42 }} onClick={() => onConfirm({ map, hasHeader })}>
            <FI.upload />Import {dataRows.length} row{dataRows.length === 1 ? '' : 's'}
          </button>
          <button className="tw-btn" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>);
}

export default function FollowupsApp({ workspaceSwitch }) {
  const { ready, customers, interactions } = useFollowups();

  const [tab, setTab] = useState('todo');
  const [drawerId, setDrawerId] = useState(null);
  const [popupId, setPopupId] = useState(null);
  const [printCust, setPrintCust] = useState(null);
  const [histQuery, setHistQuery] = useState('');
  const [showTask, setShowTask] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [workDate, setWorkDate] = useState(S.TODAY_ISO);
  const [toast, setToast] = useState(null);
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [importMeta, setImportMeta] = useState(() => {
    try { return JSON.parse(localStorage.getItem(IMPORT_KEY)) || DEFAULT_IMPORT; } catch { return DEFAULT_IMPORT; }
  });
  const [importDraft, setImportDraft] = useState(null);
  const [savedMap, setSavedMap] = useState(() => {
    try { return JSON.parse(localStorage.getItem(MAP_KEY)) || null; } catch { return null; }
  });
  const toastTimer = useRef(null);
  const fileRef = useRef(null);

  // Movable "today" — set before any memo reads S.fuStatus.
  S.setToday(workDate);

  useEffect(() => { try { localStorage.setItem(IMPORT_KEY, JSON.stringify(importMeta)); } catch (_) {} }, [importMeta]);

  useEffect(() => {
    fetch('/api/templates')
      .then((r) => r.json())
      .then((saved) => { if (Array.isArray(saved) && saved.length) setTemplates(saved); })
      .catch(() => {});
  }, []);

  const custById = useMemo(() => Object.fromEntries(customers.map((c) => [c.id, c])), [customers]);
  const nameById = (id) => (custById[id] || {}).name || id;

  const histByCust = useMemo(() => {
    const m = {};
    for (const a of interactions) (m[a.customerId] = m[a.customerId] || []).push(a);
    return m;
  }, [interactions]);

  const rows = useMemo(() => {
    const list = customers
      .filter((c) => S.owed(c) > 0 || (histByCust[c.id] || []).length > 0)
      .map((c) => {
        const h = histByCust[c.id] || [];
        const real = h.filter((x) => x.did !== 'task');
        const last = real[0] || null;
        const plannedEntry = h.find((x) => x.followUpIso) || null;
        const planned = plannedEntry ? plannedEntry.followUpIso : null;
        const plannedTime = plannedEntry ? plannedEntry.followUpTime : null;
        const plannedIsTask = !!plannedEntry && plannedEntry.did === 'task';
        const neverContacted = real.length === 0;
        const resolved = !!c.settled;
        const sortKey = (resolved ? '9999-99-99' : (planned || workDate));
        return { c, planned, plannedTime, last, neverContacted, plannedIsTask, resolved, sortKey };
      });
    return list.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : S.oldestDays(b.c) - S.oldestDays(a.c)));
  }, [customers, histByCust, workDate]);

  const histGroups = useMemo(() => {
    const m = new Map();
    for (const a of interactions) {
      if (a.did === 'task') continue;
      if (!m.has(a.customerId)) m.set(a.customerId, { id: a.customerId, name: nameById(a.customerId), settled: !!custById[a.customerId]?.settled, entries: [] });
      m.get(a.customerId).entries.push(a);
    }
    return [...m.values()];
  }, [interactions, custById]);
  const filteredGroups = useMemo(() => {
    const s = histQuery.trim().toLowerCase();
    if (!s) return histGroups;
    return histGroups.filter((g) => (g.name + ' ' + g.entries.map((e) => e.said + ' ' + (e.invoice || '')).join(' ')).toLowerCase().includes(s));
  }, [histGroups, histQuery]);
  const totalOwed = customers.filter((c) => !c.settled).reduce((s, c) => s + S.owed(c), 0);
  const owingCount = customers.filter((c) => !c.settled && S.owed(c) > 0).length;
  const openInvCount = customers.filter((c) => !c.settled).reduce((s, c) => s + S.openInvoices(c).length, 0);
  const openTaskCount = rows.filter((r) => !r.resolved).length;

  const flash = (msg) => { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 3000); };

  const saveLog = async ({ did, said, followUpIso, followUpTime, outstanding, invoicePaid }) => {
    const c = custById[drawerId];
    if (!c) return;
    const affected = (c.invoices || []).filter((iv) => !(invoicePaid && invoicePaid[iv.no])).map((iv) => iv.no);
    const entry = {
      id: 'L-' + Date.now(), customerId: c.id, date: S.isoToDisp(S.TODAY_ISO), time: nowTime(),
      by: LOGGED_BY, did, invoice: affected.length === 1 ? affected[0] : null, said,
      followUpIso: followUpIso || null, followUpTime: followUpTime || null,
    };
    const clearedOut = typeof outstanding === 'number' && outstanding <= 0;
    const settled = clearedOut || !followUpIso;
    const newInvoices = (c.invoices || []).map((iv) => ({ ...iv, paid: !!(invoicePaid && invoicePaid[iv.no]) }));
    setDrawerId(null);
    await addInteraction(entry);
    await patchCustomer(c.id, {
      invoices: newInvoices,
      outstanding: typeof outstanding === 'number' ? outstanding : c.outstanding,
      settled,
    });
    flash(clearedOut
      ? c.name + ' — fully paid, removed from the list'
      : followUpIso
        ? didLabel(did) + ' ' + c.name + ' — next follow-up ' + S.isoToDisp(followUpIso)
        : c.name + ' marked settled — removed from the list');
  };

  const deleteTask = async (id) => {
    const target = custById[id];
    setDrawerId(null);
    await deleteCustomer(id);
    flash(`${target?.name || 'Follow-up'} deleted`);
  };

  const saveCustomerDetails = async (id, { contact, phone, email, address }) => {
    await patchCustomer(id, { contact: (contact || '').trim(), phone: phone.trim(), email: email.trim() || null, address: address.trim() || null });
    flash('Contact details saved');
  };
  const addCustomerFromSettings = async ({ name, contact, phone, email, address }) => {
    await addCustomer({
      id: 'C-S' + Date.now(), name, contact: (contact || '').trim(), phone: phone.trim(), email: email.trim() || null,
      address: address.trim() || null, invoices: [],
    });
    flash(name + ' added to customers');
  };

  const saveTask = async ({ customerId, newCustomer, note, followUpIso, followUpTime }) => {
    let cid = customerId;
    let cname;
    if (newCustomer) {
      cid = 'C-M' + Date.now();
      cname = newCustomer.name;
      await addCustomer({
        id: cid, name: newCustomer.name, contact: '', phone: newCustomer.phone || '', email: null,
        invoices: newCustomer.amount ? [{ no: 'Manual', amount: newCustomer.amount, days: 0 }] : [],
      });
    } else {
      cname = (custById[cid] || {}).name || 'customer';
      if (custById[cid]?.settled) await patchCustomer(cid, { settled: false });
    }
    await addInteraction({
      id: 'L-' + Date.now(), customerId: cid, date: S.isoToDisp(S.TODAY_ISO), time: nowTime(),
      by: LOGGED_BY, did: 'task', invoice: null, said: note || 'Follow-up task',
      followUpIso: followUpIso || null, followUpTime: followUpTime || null,
    });
    setShowTask(false);
    setTab('todo');
    flash('Task added for ' + cname + ' — follow up ' + S.isoToDisp(followUpIso));
  };

  const exportCsv = (cust, entries) => {
    const header = ['Date', 'Time', 'Type', 'Invoice', 'What was said / agreed', 'Next follow-up', 'Logged by'];
    const esc = (s) => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
    const lines = entries.map((a) => [a.date, a.time, didLabel(a.did), a.invoice || '', a.said,
      a.followUpIso ? S.isoToDisp(a.followUpIso) + (a.followUpTime ? ' ' + a.followUpTime : '') : '', a.by]);
    const csv = [header, ...lines].map((r) => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Interactions - ${cust.name}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    flash(`Exported ${entries.length} interaction${entries.length === 1 ? '' : 's'} for ${cust.name} to CSV`);
  };

  const exportOpenActionsReport = async () => {
    const openRows = rows.filter((r) => !r.resolved);
    if (!openRows.length) { flash('No open actions to export.'); return; }

    const xlsx = await import('xlsx');
    const today = S.isoToDisp(S.TODAY_ISO);

    const aoa = [];
    const customerRowSet = new Set();
    let rowIdx = 0;

    aoa.push(['Open follow-up actions report', '', '', '', '', '']); rowIdx++;
    aoa.push(['Generated:', today, `${openRows.length} open task${openRows.length === 1 ? '' : 's'}`, '', S.fmtR(totalOwed) + ' total outstanding', '']); rowIdx++;
    aoa.push([]); rowIdx++;

    for (const { c, planned, plannedTime } of openRows) {
      const entries = (histByCust[c.id] || []).filter((e) => e.did !== 'task');
      const amtOwed = S.owed(c);
      const contact = [c.contact, c.phone, c.email].filter((x) => x && x !== '—').join(' · ') || '—';
      const nextFu = planned
        ? (S.isoToDisp(planned) + (plannedTime ? ', ' + plannedTime : ''))
        : 'Not planned';
      const openInvs = S.openInvoices(c);

      // Customer header row — bold, col A = name, cols B–G = summary
      customerRowSet.add(rowIdx);
      aoa.push([
        c.name,
        contact,
        amtOwed > 0 ? S.fmtR(amtOwed) + ' outstanding' : 'No outstanding amount',
        'Next follow-up: ' + nextFu,
        openInvs.length + ' open invoice' + (openInvs.length !== 1 ? 's' : ''),
        openInvs.length ? 'Oldest: ' + S.oldestDays(c) + 'd' : '',
        '',
      ]); rowIdx++;

      if (!entries.length) {
        // col A = customer name, col B = message
        aoa.push([c.name, '(No interactions logged yet)', '', '', '', '', '']); rowIdx++;
      } else {
        // Sub-header: col A = customer name, cols B–G = column labels
        aoa.push([c.name, 'Type', 'Date & time', 'Invoice', 'What was said / agreed', 'Next follow-up', 'Logged by']); rowIdx++;
        for (const e of entries) {
          const fuDisp = e.followUpIso
            ? S.isoToDisp(e.followUpIso) + (e.followUpTime ? ', ' + e.followUpTime : '')
            : '—';
          // col A = customer name repeated for every log row → filterable in Excel
          aoa.push([
            c.name,
            didLabel(e.did),
            e.date + (e.time ? ' ' + e.time : ''),
            e.invoice || '—',
            e.said,
            fuDisp,
            e.by,
          ]); rowIdx++;
        }
      }

      aoa.push([]); rowIdx++; // blank separator
    }

    const ws = xlsx.utils.aoa_to_sheet(aoa);

    // Bold the customer header rows
    const wsRange = xlsx.utils.decode_range(ws['!ref'] || 'A1');
    for (const r of customerRowSet) {
      for (let col = wsRange.s.c; col <= wsRange.e.c; col++) {
        const addr = xlsx.utils.encode_cell({ r, c: col });
        if (ws[addr]) ws[addr].s = { font: { bold: true } };
      }
    }

    ws['!cols'] = [
      { wch: 28 },  // A: Customer name (repeated)
      { wch: 30 },  // B: Contact / type
      { wch: 22 },  // C: Amount / date & time
      { wch: 18 },  // D: Next fu summary / invoice
      { wch: 50 },  // E: Notes / next fu header
      { wch: 22 },  // F: Invoice count / next fu
      { wch: 16 },  // G: Oldest / logged by
    ];

    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Open Actions');
    xlsx.writeFile(wb, `Open follow-up actions - ${today}.xlsx`);
    flash(`Exported ${openRows.length} customer${openRows.length === 1 ? '' : 's'} to Excel`);
  };

  const printInteractions = (cust) => {
    setPrintCust(cust);
    setTimeout(() => { window.print(); }, 60);
  };

  // Step 1 of import: read the sheet as raw rows and open the column mapper.
  const handleImportFile = async (file) => {
    if (!file) return;
    try {
      const xlsx = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = xlsx.read(buf, { type: 'array', cellDates: true });
      const sheetName = wb.SheetNames.find((n) => /debtor|aged|outstand|invoice|invorder/i.test(n)) || wb.SheetNames[0];
      const aoa = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' })
        .filter((r) => Array.isArray(r) && r.some((c) => c !== '' && c != null));
      if (!aoa.length) { flash('That sheet looks empty.'); return; }
      setImportDraft({ fileName: file.name, sheetName, aoa });
    } catch (err) {
      flash('Could not read that file: ' + (err?.message || 'unknown error'));
    }
  };

  // Step 2 of import: apply the chosen column mapping, dedupe by invoice number
  // against existing customers (matched by name), and persist.
  const commitImport = async ({ map, hasHeader }) => {
    if (!importDraft) return;
    const { dataRows, columns } = deriveColumns(importDraft.aoa, hasHeader);
    const norm = (s) => String(s || '').trim().toLowerCase();
    const byName = new Map(customers.map((c) => [norm(c.name), { ...c, invoices: [...(c.invoices || [])] }]));
    let addedInvoices = 0, addedCustomers = 0, skipped = 0, addedValue = 0, autoInv = 0, autoId = 0;
    dataRows.forEach((r) => {
      const name = String(r[map.customer] ?? '').trim();
      const amount = parseMoney(r[map.amount]);
      if (!name || !amount) return;
      let days = 0;
      const invDate = map.date != null ? isoFromDateCell(r[map.date]) : null;
      if (map.days != null) days = Math.max(0, Math.round(Number(String(r[map.days]).replace(/[^\d.-]/g, '')) || 0));
      else if (invDate) days = Math.max(0, S.daysBetween(invDate, S.TODAY_ISO));
      // Store enough info for live-recalculation of days as time passes
      const invExtra = invDate
        ? { invoiceDate: invDate }
        : { importedDays: days, importedAt: S.TODAY_ISO };
      const no = (map.invoice != null ? String(r[map.invoice] ?? '').trim() : '') || ('IMP-' + (++autoInv));
      const key = norm(name);
      const existing = byName.get(key);
      if (existing) {
        if ((existing.invoices || []).some((i) => i.no === no)) { skipped++; return; }
        existing.invoices.push({ no, amount, days, ...invExtra });
        if (typeof existing.outstanding === 'number') existing.outstanding += amount;
        existing.settled = false;
        addedInvoices++; addedValue += amount;
      } else {
        byName.set(key, { id: 'C-IMP' + Date.now() + '-' + (++autoId), name, contact: '', phone: '', email: null, invoices: [{ no, amount, days, ...invExtra }] });
        addedCustomers++; addedInvoices++; addedValue += amount;
      }
    });
    if (!addedInvoices) { flash('No rows imported — check the Customer and Amount columns.'); return; }
    await replaceCustomers([...byName.values()]);
    const nextMap = { ...map, hasHeader, colCount: columns.length };
    try { localStorage.setItem(MAP_KEY, JSON.stringify(nextMap)); } catch (_) {}
    setSavedMap(nextMap);
    setImportMeta({ file: importDraft.fileName, sheet: importDraft.sheetName, date: S.isoToDisp(S.TODAY_ISO), time: nowTime() });
    setImportDraft(null);
    const parts = [];
    if (addedCustomers) parts.push(`${addedCustomers} new customer${addedCustomers > 1 ? 's' : ''}`);
    if (addedInvoices) parts.push(`${addedInvoices} invoice${addedInvoices > 1 ? 's' : ''} (+${S.fmtR(addedValue)})`);
    if (skipped) parts.push(`${skipped} already on file (skipped)`);
    flash('Imported · ' + parts.join(' · '));
  };

  const drawerCust = drawerId ? custById[drawerId] : null;
  const popupCust = popupId ? custById[popupId] : null;
  const popupEntries = popupId ? (histByCust[popupId] || []).filter((a) => a.did !== 'task') : [];
  const printEntries = printCust ? (histByCust[printCust.id] || []).filter((a) => a.did !== 'task') : [];

  if (!ready) {
    return (
      <div className="tw" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--ink-2)' }}>
          <Icon name="sync" size={36} className="spin" />
          <p style={{ marginTop: 12, fontWeight: 600 }}>Loading follow-ups…</p>
        </div>
      </div>);
  }

  return (
    <>
      <div className="tw">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 22px', background: 'var(--surface)', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
          <Brand />
          {workspaceSwitch}
          <button className="tw-btn tw-icbtn" title="Customer settings" onClick={() => setShowSettings(true)}><FI.gear /></button>
        </div>

        <div style={{ padding: '16px 22px 0', flexShrink: 0 }}>
          <h1 className="tw-h1">Customer follow-ups</h1>
          <div className="tw-sub">Chase outstanding payments · one task per customer</div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '14px 22px 22px' }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; handleImportFile(f); }} />
          <ImportBand meta={importMeta} count={owingCount} total={totalOwed} invoiceCount={openInvCount} onReimport={() => fileRef.current?.click()} />

          <div className="sl-tabrow">
            <div className="tw-tabs" style={{ gap: 6 }}>
              <button className={'tw-tab' + (tab === 'todo' ? ' is-active' : '')} onClick={() => setTab('todo')} style={{ borderRadius: '9px 9px 0 0', marginBottom: -1 }}>
                <FI.list />To follow up
                <span className={'tw-count' + (openTaskCount ? ' tw-count--alert' : '')}>{openTaskCount}</span>
              </button>
              <button className={'tw-tab' + (tab === 'history' ? ' is-active' : '')} onClick={() => setTab('history')} style={{ borderRadius: '9px 9px 0 0', marginBottom: -1 }}>
                <FI.history />History
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="tw-btn" onClick={exportOpenActionsReport}><FI.excel />Export report</button>
              <button className="tw-btn tw-btn--primary sl-newtask" onClick={() => setShowTask(true)}><FI.plus />New task</button>
            </div>
          </div>

          {tab === 'todo'
            ? <>
                <DayBar workDate={workDate} onSet={setWorkDate}
                  counts={{
                    overdue: rows.filter((r) => bucketOf(r) === 'overdue').length,
                    today: rows.filter((r) => bucketOf(r) === 'today' || bucketOf(r) === 'first').length,
                    upcoming: rows.filter((r) => bucketOf(r) === 'upcoming').length,
                  }} />
                <ActionList rows={rows} onOpen={setDrawerId} />
              </>
            : <>
                <div className="sl-histbar">
                  <div className="tw-search" style={{ maxWidth: 400 }}>
                    <FI.search />
                    <input placeholder="Search history — customer, note, invoice…" value={histQuery} onChange={(e) => setHistQuery(e.target.value)} />
                    {histQuery && <button className="sl-clear" title="Clear" onClick={() => setHistQuery('')}><FI.x /></button>}
                  </div>
                </div>
                <HistoryGroups groups={filteredGroups} query={histQuery} onOpen={setPopupId} />
              </>}
        </div>

        <CustomerDrawer customer={drawerCust} history={drawerId ? (histByCust[drawerId] || []) : []} onClose={() => setDrawerId(null)} onSave={saveLog} onDelete={deleteTask} templates={templates} />
        <TaskModal open={showTask} customers={customers} onClose={() => setShowTask(false)} onSave={saveTask} />
        <SettingsModal open={showSettings} customers={customers} onClose={() => setShowSettings(false)}
          onSaveCustomer={saveCustomerDetails} onAddCustomer={addCustomerFromSettings} />
        <InteractionsPopup customer={popupCust} entries={popupEntries} onClose={() => setPopupId(null)}
          onPrint={printInteractions} onExport={exportCsv} onLog={(id) => { setPopupId(null); setDrawerId(id); }} />
        {importDraft && <ImportMapModal draft={importDraft} savedMap={savedMap} onCancel={() => setImportDraft(null)} onConfirm={commitImport} />}
        <div className={'sl-toast' + (toast ? ' show' : '')}><FI.check />{toast}</div>
      </div>
      <PrintDoc customer={printCust} entries={printEntries} />
    </>);
}
