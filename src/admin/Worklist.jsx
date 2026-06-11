import { useState } from 'react';
import Icon from '../components/Icon';
import { technicians } from '../data';

function matchesSearch(job, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    (job.customer?.name || '').toLowerCase().includes(q) ||
    (job.invoiceCustomer || '').toLowerCase().includes(q) ||
    (job.customer?.address || '').toLowerCase().includes(q) ||
    (job.customer?.phone || '').toLowerCase().includes(q) ||
    (job.invoiceNumber || '').toLowerCase().includes(q) ||
    (job.ref || '').toLowerCase().includes(q)
  );
}

function progressLabel(done, total) {
  if (total === 0) return null;
  if (done === total) return 'done';
  if (done > 0) return 'part';
  return null;
}

function WorklistRow({ job, rec, tasks, selected, onClick, onDelete }) {
  const tech = technicians[job.tech] || { color: '#888', initials: '??' };
  const active = tasks.filter((t) => t.text.trim());
  const total = active.length;
  const done = active.reduce((n, t) => n + (rec?.[t.id] ? 1 : 0), 0);
  const complete = total > 0 && done === total;
  const cls = progressLabel(done, total);

  return (
    <div className="wl-row-wrap">
      <button
        className={'wl-row' + (selected ? ' sel' : '')}
        onClick={onClick}
        aria-selected={selected}
      >
        <div className="wl-tech" style={{ background: tech.color }}>{tech.initials}</div>
        <div className="wl-main">
          <div className="wl-cust">{job.customer.name}</div>
          <div className="wl-sub">
            <span className="mono">{job.ref}</span> · {job.jobType}
          </div>
        </div>
        <div className={'wl-prog' + (cls ? ' ' + cls : '')}>
          {complete
            ? <Icon name="check" size={14} stroke={3} />
            : `${done}/${total}`}
        </div>
      </button>
      {onDelete && (
        <button
          className="wl-row-delete"
          type="button"
          title="Delete from capture queue"
          aria-label={`Delete ${job.ref} from capture queue`}
          onClick={() => onDelete(job)}
        >
          <Icon name="trash" size={14} />
        </button>
      )}
    </div>
  );
}

export default function Worklist({ outstanding, captured, tasks, progress, selectedId, onSelect, showCaptured, onToggleCaptured, onDeleteOutstanding }) {
  const [search, setSearch] = useState('');

  const filteredOutstanding = outstanding.filter((j) => matchesSearch(j, search));
  const filteredCaptured = captured.filter((j) => matchesSearch(j, search));

  return (
    <div className="worklist">
      <div className="wl-search-wrap">
        <Icon name="search" size={15} />
        <input
          className="wl-search"
          type="search"
          placeholder="Search customer, address, phone, invoice..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search jobs"
        />
        {search && (
          <button
            className="ghost-icon"
            type="button"
            aria-label="Clear search"
            onClick={() => setSearch('')}
          >
            <Icon name="x" size={14} />
          </button>
        )}
      </div>

      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="panel-head" style={{ padding: '14px 16px' }}>
          <h2 style={{ fontSize: 14.5 }}>To capture</h2>
          <div style={{ flex: 1 }} />
          <span className="badge s-finished">{filteredOutstanding.length}</span>
        </div>
        <div className="wl-list">
          {filteredOutstanding.length === 0 ? (
            <div className="wl-empty">
              {search
                ? <><Icon name="search" size={18} /> No matches</>
                : <><Icon name="checkCircle" size={22} /> Nothing left to capture</>}
            </div>
          ) : filteredOutstanding.map((j) => (
            <WorklistRow
              key={j.id}
              job={j}
              rec={progress[j.id]}
              tasks={tasks}
              selected={j.id === selectedId}
              onClick={() => onSelect(j.id)}
              onDelete={onDeleteOutstanding}
            />
          ))}
        </div>
      </div>

      {captured.length > 0 && (
        <div className="panel">
          <button className="captured-toggle" onClick={onToggleCaptured}>
            <Icon name="check" size={15} stroke={3} />
            <span style={{ flex: 1, textAlign: 'left' }}>Captured today</span>
            <span className="badge s-synced">{filteredCaptured.length}</span>
            <Icon
              name="chevDown"
              size={16}
              style={{ transform: showCaptured ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
            />
          </button>
          {showCaptured && (
            <div className="wl-list">
              {filteredCaptured.map((j) => (
                <WorklistRow
                  key={j.id}
                  job={j}
                  rec={progress[j.id]}
                  tasks={tasks}
                  selected={j.id === selectedId}
                  onClick={() => onSelect(j.id, true)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
