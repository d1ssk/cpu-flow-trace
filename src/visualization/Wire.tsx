import type { Point, Signal, WireState } from '../simulator/types';
import { useLocale } from '../i18n';

export const signalColor = (value: Signal) => value === 1 ? 'var(--high)' : value === 0 ? 'var(--low)' : 'var(--unknown)';
export const signalTextColor = (value: Signal) => value === 1 ? '#944b3f' : value === 0 ? 'var(--ink)' : '#75612d';
export const signalLabel = (value: Signal) => value === 1 ? 'H' : value === 0 ? 'L' : value;
export const pathOf = (points: readonly Point[]) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
function pointAt(points: readonly Point[], distance: number): Point {
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i - 1];
    const [endX, endY] = points[i];
    const length = Math.hypot(endX - x, endY - y);
    if (distance <= length) return [x + (endX - x) * distance / length, y + (endY - y) * distance / length];
    distance -= length;
  }
  return points[points.length - 1];
}
export function Wire({ wire, time, selected, onSelect }: {
  wire: WireState; time: number; selected: boolean; onSelect: () => void;
}) {
  const { t } = useLocale();
  const d = pathOf(wire.points);
  return <g className={`signal-wire ${selected ? 'selected' : ''}`} role="button" tabIndex={0}
    aria-label={`${t.inspectWire} ${wire.id}`} aria-pressed={selected}
    onClick={onSelect} onKeyDown={event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(); }
    }}>
    <path d={d} className="wire-clearance" />
    <path d={d} className="wire-line" stroke={signalColor(wire.initial)} />
    {wire.transitions.map((change, i) => {
      const distance = Math.min(wire.length, Math.max(0, (time - change.time) / wire.delay * wire.length));
      if (!distance) return null;
      const point = pointAt(wire.points, distance);
      return <g key={`${change.time}-${i}`} className="wave" data-testid="wire-transition">
        <path d={d} className="wire-line" stroke={signalColor(change.value)} strokeDasharray={`${distance} ${wire.length + 1}`} />
        {distance < wire.length && <circle cx={point[0]} cy={point[1]} r="4" fill={signalColor(change.value)} stroke="var(--paper)" strokeWidth="2" />}
      </g>;
    })}
    <path d={d} className="wire-hit" />
  </g>;
}
