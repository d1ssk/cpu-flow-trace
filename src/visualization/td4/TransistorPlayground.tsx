import { useEffect, useState } from 'react';
import { useLocale } from '../../i18n';
import { TransistorExperiment, type TransistorInput } from '../../simulator/transistor';
import { Wire, signalColor, signalLabel } from '../Wire';

export function TransistorPlayground() {
  const { locale } = useLocale();
  const ja = locale === 'ja';
  const [sim] = useState(() => new TransistorExperiment());
  const [, redraw] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(0.5);
  const [selected, setSelected] = useState<string | null>(null);
  const busy = sim.busy;
  const update = () => redraw(revision => revision + 1);

  useEffect(() => {
    if (!playing || !busy) return;
    // RAF timestamps describe the start of a frame, which can precede this
    // effect's performance.now(). Use the same clock for both samples.
    let frame: number, previous: number | null = null;
    const tick = (now: number) => {
      sim.advance(previous === null ? 0 : Math.max(0, Math.min(now - previous, 100)) * speed);
      previous = now;
      redraw(revision => revision + 1);
      if (sim.busy) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [sim, playing, busy, speed]);

  function selector(input: TransistorInput, y: number) {
    const value = sim.inputs[input];
    const name = input === 'gate' ? (ja ? 'ゲート' : 'Gate') : (ja ? 'ソース' : 'Source');
    return <g className="transistor-selector" role="switch" tabIndex={0} aria-checked={value === 1}
      aria-label={`${name} H/L`} onClick={() => { sim.setInput(input, value === 1 ? 0 : 1); update(); }}
      onKeyDown={event => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault(); sim.setInput(input, value === 1 ? 0 : 1); update();
        }
      }}>
      <title>{ja ? 'クリックで H / L を切り替え' : 'Click to switch H / L'}</title>
      <rect className="selector-hit" x="20" y={y - 18} width="58" height="36" rx="3" />
      {[1, 0].map(bit => <g key={bit}>
        <text x="24" y={y + (bit ? -8 : 16)}>{bit ? 'H' : 'L'}</text>
        <path d={`M36 ${y + (bit ? -12 : 12)}H49`} stroke={signalColor(bit as 0 | 1)} />
        <circle cx="49" cy={y + (bit ? -12 : 12)} r="2" fill={signalColor(bit as 0 | 1)} />
      </g>)}
      <path d={`M72 ${y}L51 ${y + (value ? -12 : 12)}`} stroke={signalColor(value)} />
      <circle cx="72" cy={y} r="2" fill={signalColor(value)} />
    </g>;
  }

  const gate = sim.wires.gate.arrived, source = sim.wires.source.arrived, output = sim.wires.drain.arrived;
  return <aside className="transistor-playground" aria-label={ja ? 'トランジスタ実験' : 'Transistor playground'}>
    <svg className="transistor-diagram" viewBox="0 0 220 88" role="group" aria-label={ja ? '単独MOSトランジスタ回路' : 'Single MOS transistor circuit'}>
      <title>{ja ? 'S：ソース、G：ゲート。クリックで H / L を切り替え。Z は未接続。' : 'S: source, G: gate. Click to switch H / L. Z = undriven.'}</title>
      <text x="4" y="24">S</text>
      <text x="4" y="66">G</text>
      {Object.values(sim.wires).map(wire => <Wire key={wire.id} wire={wire} time={sim.time}
        selected={selected === wire.id} onSelect={() => setSelected(selected === wire.id ? null : wire.id)} />)}
      {selector('source', 20)}{selector('gate', 62)}
      <path className="transistor-gate" d="M128 36V60" stroke={signalColor(gate)} />
      {sim.type === 'p' && <circle cx="125" cy="48" r="3" className="transistor-bubble" stroke={signalColor(gate)} />}
      <path className="transistor-channel" d="M140 36V60" stroke={signalColor(sim.drain)}
        strokeDasharray={sim.conducting ? undefined : '4 4'} />
      <text x="150" y="26">S {signalLabel(source)}</text>
      <text x="86" y="44">G {signalLabel(gate)}</text>
      <text x="168" y="70">D</text>
      <text x="156" y="50" data-testid="transistor-channel">{sim.conducting ? 'ON' : 'OFF'}</text>
      <rect x="188" y="66" width="28" height="20" rx="3" fill="var(--paper)" stroke={signalColor(output)} />
      <text x="202" y="80" textAnchor="middle" data-testid="transistor-output">{signalLabel(output)}</text>
    </svg>
    <div className="transistor-playback">
      <div className="transistor-types" role="group" aria-label={ja ? 'トランジスタの種類' : 'Transistor type'}>
        {(['n', 'p'] as const).map(type => <button key={type} aria-pressed={sim.type === type}
          title={`G=${type === 'n' ? 'H' : 'L'} → ON`} onClick={() => { sim.setType(type); update(); }}>{type}MOS</button>)}
      </div>
      <div className="transistor-transport">
        <button aria-label={ja ? `トランジスタの信号を${playing ? '一時停止' : '再開'}` : (playing ? 'Pause signals' : 'Resume signals')}
          onClick={() => setPlaying(!playing)}>{playing ? 'Ⅱ' : '▶'}</button>
        <button aria-label={ja ? 'トランジスタの信号を0.1秒進める' : 'Advance transistor signals by 0.1 s'}
          disabled={playing || !busy} onClick={() => { sim.advance(100); update(); }}>+0.1 s</button>
      </div>
      <select aria-label={ja ? 'トランジスタの信号速度' : 'Transistor signal speed'} value={speed} onChange={event => setSpeed(Number(event.target.value))}>
        <option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1">1×</option>
      </select>
    </div>
    <p className="sr-only" aria-live="polite">{selected
      ? `${selected === 'gate' ? 'G' : selected === 'source' ? 'S' : 'D'}: ${signalLabel(sim.wires[selected].source)} → ${signalLabel(sim.wires[selected].arrived)}${ja ? '（線の始点 → 終点）' : ' (wire start → end)'}`
      : sim.conducting
        ? (ja ? 'ON：ソースの H / L がドレインへ伝わります。' : 'ON: the source signal travels to the drain.')
        : (ja ? 'OFF：ソースとドレインを遮断。Z は未接続です。' : 'OFF: source and drain are disconnected. Z = undriven.')}</p>
  </aside>;
}
