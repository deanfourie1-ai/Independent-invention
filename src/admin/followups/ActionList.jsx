/* To-do side of the follow-ups screen: bucketed action list + day bar. */
import { FI } from './icons';
import { S } from './helpers';
import { FuChip, didsLabel } from './interactions';

/* ── action list ── */
const BUCKETS = [
  { id: 'overdue', label: 'Overdue', tone: 'overdue' },
  { id: 'today', label: 'Due today', tone: 'today' },
  { id: 'upcoming', label: 'Upcoming', tone: 'upcoming' },
  { id: 'first', label: 'Needs first contact', tone: 'first' },
];
export const bucketOf = (r) => {
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
          ? <span className="fu paidchip"><FI.checkc />Fully paid{c.settledAt ? ' · ' + S.isoToDisp(c.settledAt) : ''}</span>
          : planned
            ? <FuChip iso={planned} time={plannedTime} />
            : neverContacted
              ? <span className="fu firstcontact"><FI.phone />Needs first contact</span>
              : <FuChip iso={null} />}
        {last
          ? <span className="lastln">Last: {didsLabel(last).toLowerCase()} {last.date}</span>
          : plannedIsTask
            ? <span className="lastln"><FI.flag style={{ width: 11, height: 11, verticalAlign: -1, marginRight: 3 }} />Task you added</span>
            : null}
      </div>
      <button className="tw-btn tw-btn--sm sl-openbtn" onClick={(e) => { e.stopPropagation(); onOpen(c.id); }}>
        {resolved ? 'View' : 'Log'}<FI.chevR />
      </button>
    </div>);
}

export function ActionList({ rows, onOpen }) {
  const open = rows.filter((r) => !r.resolved);
  if (!open.length) {
    return (
      <div className="tw-card"><div className="sl-allclear">
        <div className="big"><FI.checkc /></div>
        <h3>All caught up</h3>
        <p>Every customer who owes has a follow-up logged. Nice work.</p>
      </div></div>);
  }
  const groups = BUCKETS.map((b) => ({ ...b, items: open.filter((r) => bucketOf(r) === b.id) })).filter((g) => g.items.length);
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

/* ── day bar ── */
export function DayBar({ workDate, onSet, counts }) {
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
