import { useState } from 'react';
import Icon from '../components/Icon';
import { technicians } from '../data';

const TECH_TONES = { t1: 'blue', t2: 'green', t3: 'amber', t4: 'violet', t5: 'green' };

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

function QueueItem({ job, rec, tasks, selected, onClick, onDelete, showChecklist = true }) {
  const tech = technicians[job.tech] || { initials: '??' };
  const tone = TECH_TONES[job.tech] || 'blue';
  const active = tasks.filter((t) => t.text.trim());
  const total = active.length;
  const done = active.reduce((n, t) => n + (rec?.[t.id] ? 1 : 0), 0);
  const complete = total > 0 && done === total;

  return (
    <div style={{ position: 'relative' }}>
      <div
        className={'cap-qitem' + (selected ? ' is-active' : '')}
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
        aria-selected={selected}
      >
        <span
          className={`dot tone-${tone}`}
          style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}
        >
          {tech.initials}
        </span>
        <div className="meta">
          <div className="nm">{job.customer.name}</div>
          <div className="sub">
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{job.ref}</span> · {job.jobType}
            {job.ocrImport?.needsReview && (
              <span
                title={(job.ocrImport.reviewReasons || []).join('. ') || 'Auto-imported — check the fields against the scan'}
                style={{ fontSize: 10, fontWeight: 700, color: '#b45309', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 4, padding: '0 5px', marginLeft: 6, whiteSpace: 'nowrap' }}
              >
                CHECK OCR
              </span>
            )}
          </div>
        </div>
        {showChecklist && (
          <span className={'cap-prog' + (complete ? ' done' : '')}>
            {complete ? <Icon name="check" size={13} stroke={3} /> : `${done}/${total}`}
          </span>
        )}
      </div>
      {onDelete && (
        <button
          className="wl-row-delete"
          type="button"
          title="Delete from capture queue"
          aria-label={`Delete ${job.ref} from capture queue`}
          onClick={(e) => { e.stopPropagation(); onDelete(job); }}
        >
          <Icon name="trash" size={14} />
        </button>
      )}
    </div>
  );
}

export default function Worklist({ queue, tasks, progress, selectedId, onSelect, onDelete, showChecklist = true }) {
  const [search, setSearch] = useState('');

  const filteredQueue = queue.filter((j) => matchesSearch(j, search));

  return (
    <div className="cap-q">
      {/* search */}
      <div className="cap-qsearch">
        <Icon name="search" size={15} />
        <input
          type="search"
          placeholder="Customer, ref, phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search jobs"
        />
      </div>

      {/* to-capture section */}
      <div>
        <div className="cap-qsec-head">
          <span className="t">To capture</span>
          <span className="n">{filteredQueue.length}</span>
        </div>
        {filteredQueue.length === 0 ? (
          <div style={{ padding: '12px 4px', color: 'var(--ink-3)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            {search
              ? <><Icon name="search" size={16} /> No matches</>
              : <><Icon name="checkCircle" size={16} /> Nothing left to capture</>}
          </div>
        ) : filteredQueue.map((j) => (
          <QueueItem
            key={j.id}
            job={j}
            rec={progress[j.id]}
            tasks={tasks}
            selected={j.id === selectedId}
            onClick={() => onSelect(j.id)}
            onDelete={onDelete}
            showChecklist={showChecklist}
          />
        ))}
      </div>
    </div>
  );
}
