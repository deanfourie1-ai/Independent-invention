import { useMemo } from 'react';
import Icon from '../components/Icon';

const COLORS = ['#1559d6', '#0f7d8f', '#1c8a4c', '#6a45cf', '#b5710a'];

export default function CheerScreen({ captured, onReview }) {
  const pieces = useMemo(() =>
    Array.from({ length: 22 }, (_, i) => ({
      left: (i * 4.6 + (i % 3) * 7) % 100,
      delay: (i % 7) * 0.45,
      dur: 3.4 + (i % 5) * 0.5,
      size: 7 + (i % 4) * 3,
      color: COLORS[i % COLORS.length],
      round: i % 2 === 0,
      rot: (i % 6) * 60,
    })), []);

  return (
    <div className="celebrate">
      <div className="confetti" aria-hidden="true">
        {pieces.map((p, i) => (
          <span
            key={i}
            style={{
              left: p.left + '%',
              width: p.size,
              height: p.size,
              background: p.color,
              borderRadius: p.round ? '50%' : 2,
              animationDelay: p.delay + 's',
              animationDuration: p.dur + 's',
              transform: `rotate(${p.rot}deg)`,
            }}
          />
        ))}
      </div>
      <div className="celebrate-inner">
        <div className="cheer-check">
          <Icon name="check" size={52} stroke={2.4} />
        </div>
        <h1 className="cheer-title">All done for today! 🎉</h1>
        <p className="cheer-sub">
          Every printed job card has been captured into <b>Sage Online</b>.
          Nothing&apos;s waiting in the queue — enjoy a brew.
        </p>
        <div className="cheer-stat">
          <Icon name="checkCircle" size={18} />
          <span><b>{captured}</b> order{captured === 1 ? '' : 's'} captured today</span>
        </div>
        {captured > 0 && (
          <button className="btn btn-ghost" style={{ marginTop: 22 }} onClick={onReview}>
            <Icon name="clock" size={18} /> View captured in History
          </button>
        )}
      </div>
    </div>
  );
}
