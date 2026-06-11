import Icon from './Icon';
import { statusMeta } from '../data';

export default function StatusBadge({ status, lg }) {
  const m = statusMeta[status] || statusMeta.draft;
  return (
    <span className={'badge ' + m.cls + (lg ? ' badge-lg' : '')}>
      <Icon name={m.icon} size={lg ? 15 : 13} stroke={2.4} />
      {m.label}
    </span>
  );
}
