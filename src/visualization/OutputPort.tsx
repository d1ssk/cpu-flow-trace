import type { Signal, Point } from '../simulator/types';
import { signalColor, signalTextColor } from './Wire';
export function OutputPort({ id, position: [x, y], value }: { id: string; position: Point; value: Signal }) {
  return <g className="output-port" data-testid={id}>
    <circle cx={x} cy={y} r="19" className="terminal" stroke={signalColor(value)} fill={value === 1 ? 'var(--high-soft)' : 'var(--paper)'} />
    <text x={x} y={y + 5} textAnchor="middle" className="port-value" fill={signalTextColor(value)}>{value}</text>
    <text x={x + 36} y={y + 4} className="port-name">{id}</text>
  </g>;
}
