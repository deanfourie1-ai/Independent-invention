/* History side of the follow-ups screen: grouped history list, the read-only
   interactions popup and the print-only document. */
import { FI } from './icons';
import { S } from './helpers';
import { InteractionsTable, didsLabel } from './interactions';

/* ── history grouped by customer ── */
export function HistoryGroups({ groups, query, onOpen }) {
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
                  {g.settled && <span className="sl-paidflag"><FI.checkc />Fully paid{g.settledAt ? ' · ' + S.isoToDisp(g.settledAt) : ''}</span>}
                </div>
                <div className="cnt">{g.entries.length} interaction{g.entries.length > 1 ? 's' : ''}</div>
              </div>
              <div className="prev">
                <span className={'verb v-' + last.did}>{didsLabel(last)}</span>
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
export function InteractionsPopup({ customer, entries, onClose, onPrint, onExport, onLog }) {
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

export function PrintDoc({ customer, entries }) {
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
              <td className="nw">{didsLabel(a)}</td>
              <td className="nw">{a.invoice || '—'}</td>
              <td>{a.said}</td>
              <td className="nw">{a.followUpIso ? S.isoToDisp(a.followUpIso) + (a.followUpTime ? ' ' + a.followUpTime : '') : '—'}</td>
              <td className="nw">{a.by}</td>
            </tr>))}
        </tbody>
      </table>
    </div>);
}
