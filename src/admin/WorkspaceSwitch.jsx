import Icon from '../components/Icon';

/* Segmented control in the shared top bar that swaps between the two
   workspaces while keeping the same shell/brand — so it feels like one app. */
const ITEMS = [
  { id: 'recapture', label: 'Recapture', icon: 'clipboard' },
  { id: 'followups', label: 'Follow-ups', icon: 'phone' },
];

export default function WorkspaceSwitch({ value, onChange }) {
  return (
    <div className="ws-switch" role="tablist" aria-label="Workspace">
      {ITEMS.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={value === it.id}
          className={'ws-switch-btn' + (value === it.id ? ' is-active' : '')}
          onClick={() => onChange(it.id)}
        >
          <Icon name={it.icon} size={15} />
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}
