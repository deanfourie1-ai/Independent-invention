/* Shared interaction primitives for the Customer follow-ups screen:
   the did/method metadata, the interactions table and the follow-up chip. */
import { FI } from './icons';
import { S } from './helpers';

export const METHODS = [
  { id: 'call', label: 'Called', icon: FI.phone },
  { id: 'whatsapp', label: 'WhatsApp', icon: FI.whatsapp },
  { id: 'email', label: 'Emailed', icon: FI.mail },
  { id: 'visit', label: 'Visited', icon: FI.pin },
  { id: 'note', label: 'Note', icon: FI.note },
];
const LABELS = { call: 'Called', whatsapp: 'WhatsApp', email: 'Emailed', visit: 'Visited', note: 'Note', task: 'To-do', import: 'Import' };
export const didLabel = (m) => LABELS[m] || m;
export const didIcon = (m) => m === 'call' ? <FI.phone /> : m === 'whatsapp' ? <FI.whatsapp /> : m === 'email' ? <FI.mail /> : m === 'visit' ? <FI.pin /> : m === 'task' ? <FI.flag /> : m === 'import' ? <FI.excel /> : <FI.note />;
/* An entry may record several methods at once (dids: ['call','whatsapp',…]);
   older entries only carry the single `did`. */
export const didsOf = (a) => (Array.isArray(a.dids) && a.dids.length ? a.dids : [a.did]);
export const didsLabel = (a) => didsOf(a).map(didLabel).join(', ');

/* ── shared interactions table ── */
export function InteractionsTable({ entries, emptyText }) {
  if (!entries || entries.length === 0) return <div className="sl-noh">{emptyText || 'No interactions logged yet.'}</div>;
  return (
    <table className="sl-itable">
      <colgroup><col className="c-type" /><col className="c-when" /><col /><col className="c-fu" /></colgroup>
      <thead><tr><th>Type</th><th>Created at</th><th>Notes</th><th>Follow up</th></tr></thead>
      <tbody>
        {entries.map((a) => (
          <tr key={a.id}>
            <td className={'ty' + (didsOf(a).length > 1 ? ' multi' : '')}>
              {didsOf(a).map((d) => <span key={d} className={'tymark v-' + d}>{didIcon(d)}</span>)}
              <span className="tylab">{didsLabel(a)}{a.invoice && <span className="invref">{a.invoice}</span>}</span>
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

export function FuChip({ iso, time, small }) {
  if (!iso) return <span className={'fu none' + (small ? ' sm' : '')}><FI.clock />No follow-up planned</span>;
  const st = S.fuStatus(iso);
  return (
    <span className={'fu st-' + st + (small ? ' sm' : '')}>
      <FI.clock />Follow up {S.isoToDisp(iso)}{time ? ', ' + time : ''} · {S.fuRelative(iso)}
    </span>);
}
