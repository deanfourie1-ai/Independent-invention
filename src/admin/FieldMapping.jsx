import { useState } from 'react';
import Icon from '../components/Icon';
import StatusBadge from '../components/StatusBadge';
import { sageMap } from '../data';

export default function FieldMapping({ job, embedded = false }) {
  const [copied, setCopied] = useState(null);

  function copy(key, text) {
    try { navigator.clipboard?.writeText(text); } catch (_) {}
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400);
  }

  const table = (
    <table className={'map-table' + (embedded ? ' map-table-embedded' : '')}>
        <thead>
          <tr>
            <th>Card field</th>
            <th className="arrow" />
            <th>Sage Online field</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {sageMap.map((m, i) => {
            const val = m.get(job);
            const key = 'm' + i;
            return (
              <tr key={i}>
                <td className="mf">{m.print}</td>
                <td className="arrow"><Icon name="arrowRight" size={15} /></td>
                <td className="sage">{m.sage}</td>
                <td>
                  <button className="copy-val" onClick={() => copy(key, val)} title="Copy">
                    <span
                      className="cv-txt"
                      style={m.print.includes('GUID') ? { fontFamily: 'var(--mono)', fontSize: 12 } : {}}
                    >
                      {val || '—'}
                    </span>
                    <Icon name={copied === key ? 'check' : 'copy'} size={14} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
  );

  if (embedded) return table;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Field mapping</h2>
        <span className="ph-sub">Tap a value to copy</span>
        <div style={{ flex: 1 }} />
        <StatusBadge status="printed" />
      </div>
      {table}
    </div>
  );
}
