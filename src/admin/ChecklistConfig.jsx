import { useState } from 'react';
import Icon from '../components/Icon';

export default function ChecklistConfig({ tasks, setTasks, defaults, onBack }) {
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  const active = tasks.filter((t) => t.text.trim());
  const newId = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  const update = (id, text) => setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, text } : t)));
  const remove = (id) => setTasks((ts) => ts.length > 1 ? ts.filter((t) => t.id !== id) : ts);
  const add = () => setTasks((ts) => [...ts, { id: newId(), text: '' }]);
  const reset = () => setTasks(defaults.map((t) => ({ ...t })));

  function move(from, to) {
    if (from === to || from == null || to == null) return;
    setTasks((ts) => {
      const next = [...ts];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  return (
    <div className="desk">
      <div className="desk-head">
        <button className="ghost-icon" onClick={onBack} title="Back to capture">
          <Icon name="chevL" size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <h1>Capture checklist settings</h1>
          <div className="dh-sub">Define the steps for entering an order into Sage Online</div>
        </div>
        <span className="badge s-finished badge-lg">
          <Icon name="list" size={15} />
          <span>{active.length} task{active.length === 1 ? '' : 's'}</span>
        </span>
      </div>

      <div className="desk-body">
        <div className="callout">
          <div className="co-ic"><Icon name="settings" size={20} /></div>
          <div className="co-t">
            An order counts as <b>captured</b> only when <b>every</b> task below is ticked.
            Add, rename, reorder or remove steps anytime — changes apply to <b>all orders</b>,
            including ones already in progress.
          </div>
        </div>

        <div className="cfg-grid">
          <div className="cfg-main">
            <div className="panel">
              <div className="panel-head">
                <h2>Capture tasks</h2>
                <span className="ph-sub">Drag to reorder</span>
                <div style={{ flex: 1 }} />
                <button className="btn btn-quiet" style={{ minHeight: 38 }} onClick={reset}>
                  <Icon name="rotate" size={16} /> Reset to default
                </button>
              </div>

              <div className="cfg-rows">
                {tasks.map((t, i) => (
                  <div
                    key={t.id}
                    className={
                      'cfg-row' +
                      (dragIdx === i ? ' dragging' : '') +
                      (overIdx === i && dragIdx !== i ? ' over' : '')
                    }
                    draggable
                    onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragOver={(e) => { e.preventDefault(); setOverIdx(i); }}
                    onDrop={(e) => { e.preventDefault(); move(dragIdx, i); setDragIdx(null); setOverIdx(null); }}
                    onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                  >
                    <span className="cfg-grip" title="Drag to reorder">
                      <Icon name="grip" size={18} stroke={2.6} />
                    </span>
                    <span className="cfg-num">{i + 1}</span>
                    <input
                      className="cfg-input"
                      value={t.text}
                      placeholder="Describe the task…"
                      onChange={(e) => update(t.id, e.target.value)}
                    />
                    <button
                      className="cfg-del"
                      onClick={() => remove(t.id)}
                      disabled={tasks.length <= 1}
                      title={tasks.length <= 1 ? 'Keep at least one task' : 'Delete task'}
                    >
                      <Icon name="trash" size={17} />
                    </button>
                  </div>
                ))}
              </div>

              <button className="btn btn-ghost cfg-add" onClick={add}>
                <Icon name="plus" size={18} /> Add task
              </button>
            </div>

            <p style={{ fontSize: 12.5, color: 'var(--text-faint)', fontWeight: 500, lineHeight: 1.5, padding: '0 2px' }}>
              Empty rows are ignored. Your checklist is saved in this browser.
            </p>
          </div>

          <div className="cfg-side">
            <div className="label" style={{ marginBottom: 10 }}>Preview — how your team sees it</div>
            <div className="panel">
              <div className="panel-head">
                <h2 style={{ fontSize: 15 }}>Capture checklist</h2>
                <div style={{ flex: 1 }} />
                <span className="badge s-finished">
                  <Icon name="check" size={14} stroke={3} /> <span>0/{active.length}</span>
                </span>
              </div>
              <div className="checklist-admin">
                {active.length === 0 ? (
                  <div className="wl-empty" style={{ padding: 18 }}>
                    <Icon name="alertCircle" size={18} /> Add at least one task
                  </div>
                ) : active.map((t) => (
                  <div key={t.id} className="cl-item" style={{ cursor: 'default' }}>
                    <div className="cl-box"><Icon name="check" size={15} stroke={3} /></div>
                    <div className="cl-label" style={{ whiteSpace: 'normal' }}>{t.text}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="cheer-stat" style={{ marginTop: 14, display: 'flex', width: '100%', justifyContent: 'center' }}>
              <Icon name="checkCircle" size={16} />
              <span>Order is captured when all <b>{active.length}</b> are ticked</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
