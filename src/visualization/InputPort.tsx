import type { Signal, Point } from '../simulator/types';
import { signalColor, signalTextColor } from './Wire';
import { useLocale } from '../i18n';

export function InputPort({ id, position: [x, y], value, onToggle }: {
  id: string; position: Point; value: Signal; onToggle: () => void;
}) {
  const { t } = useLocale();
  return <g className="input-port" role="button" tabIndex={0} aria-label={`${t.toggleInput} ${id}`}
    aria-pressed={value === 1} onClick={onToggle}
    onKeyDown={event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggle(); }
    }}>
    <title>{`${id} · ${value} · ${t.inputHint}`}</title>
    <rect x={x - 41} y={y - 25} width="65" height="50" rx="25" className="port-hit" />
    <text x={x - 39} y={y + 4} className="port-name" textAnchor="end">{id}</text>
    <circle className="terminal" cx={x} cy={y} r="19" stroke={signalColor(value)} fill={value === 1 ? 'var(--high-soft)' : 'var(--paper)'} />
    <text x={x} y={y + 5} textAnchor="middle" className="port-value" fill={signalTextColor(value)}>{value}</text>
  </g>;
}
