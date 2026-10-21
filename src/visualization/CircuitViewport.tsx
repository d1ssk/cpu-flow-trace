import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { demoCircuit, inputPositions, outputPositions, viewport, junctions } from '../circuits/demo';
import { Circuit } from '../simulator/circuit';
import { useLocale } from '../i18n';
import { Wire, signalColor } from './Wire';
import { InputPort } from './InputPort';
import { OutputPort } from './OutputPort';
import { PlaybackControls } from './PlaybackControls';
import { Inspector } from './Inspector';

export function CircuitViewport() {
  const { t } = useLocale();
  const [sim, setSim] = useState(() => new Circuit(demoCircuit));
  const [, redraw] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drawingWidth, setDrawingWidth] = useState(560);
  useLayoutEffect(() => {
    const element = scrollRef.current!;
    const resize = () => {
      const height = Math.max(360, window.innerHeight - element.getBoundingClientRect().top - 100);
      setDrawingWidth(Math.max(480, Math.min(viewport.width, element.clientWidth, height * viewport.width / viewport.height)));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    window.addEventListener('resize', resize);
    resize();
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); };
  }, []);
  const update = () => redraw(count => count + 1);
  useEffect(() => {
    let frame: number;
    let previous: number | undefined;
    function animate(now: number) {
      if (previous !== undefined && playing && sim.busy && !document.hidden) {
        sim.advance(Math.min(now - previous, 100) * speed);
        redraw(count => count + 1);
      }
      previous = document.hidden ? undefined : now;
      frame = requestAnimationFrame(animate);
    }
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, sim]);
  const word = (ids: readonly string[]) => [...ids].reverse().map(id => sim.values[id]).join('');
  return <section className="circuit-workspace" aria-label={t.circuitTitle}>
    <PlaybackControls playing={playing} busy={sim.busy} speed={speed} time={sim.time}
      onPlay={() => setPlaying(!playing)}
      onStep={() => { setPlaying(false); sim.advance(100); update(); }}
      onNext={() => { setPlaying(false); sim.next(); update(); }}
      onReset={() => { setSim(new Circuit(demoCircuit)); setSelected(null); setPlaying(true); }}
      onSpeed={setSpeed} />
    <div className="canvas">
      <div className="circuit-scroll" ref={scrollRef} data-testid="circuit-scroll">
        <svg className="circuit-svg" viewBox={`0 0 ${viewport.width} ${viewport.height}`}
          style={{ width: `${drawingWidth * zoom}px` }} role="group" aria-labelledby="circuit-title circuit-description">
          <title id="circuit-title">{t.circuitLabel}</title>
          <desc id="circuit-description">{t.circuitDescription}</desc>
          <text x="260" y="30" textAnchor="end" className="io-heading">{t.input}</text>
          <text x="350" y="30" textAnchor="middle" className="io-word" data-testid="input-word">{word(demoCircuit.inputs)}</text>
          <text x="260" y="752" textAnchor="end" className="io-heading">{t.output}</text>
          <text x="350" y="752" textAnchor="middle" className="io-word" data-testid="output-word">{word(demoCircuit.outputs)}</text>
          {Object.values(sim.wires).map(wire => <Wire key={wire.id} wire={wire} time={sim.time} selected={selected === wire.id} onSelect={() => setSelected(wire.id)} />)}
          {junctions.map(junction => <circle key={`${junction.x}-${junction.y}`} cx={junction.x} cy={junction.y} r="3"
            fill={signalColor(sim.valueAt(junction.wire, junction.distance / sim.wires[junction.wire].length))} pointerEvents="none" />)}
          {demoCircuit.gates.map(gate => <g key={gate.id} className={`nand-gate ${selected === gate.id ? 'selected' : ''}`}
            role="button" tabIndex={0} aria-label={`${t.inspectGate} ${gate.id}`} aria-pressed={selected === gate.id}
            onClick={() => setSelected(gate.id)} onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(gate.id); }
            }}>
            <path className="gate-body" d={`M${gate.x - 29} ${gate.y - 35}H${gate.x + 29}V${gate.y}A29 29 0 0 1 ${gate.x - 29} ${gate.y}Z`} />
            <circle className="gate-body" cx={gate.x} cy={gate.y + 36} r="7" />
          </g>)}
          {inputPositions.map((position, i) => <InputPort key={i} id={`I${i}`} position={position} value={sim.values[`I${i}`]}
            onToggle={() => { sim.setInput(`I${i}`, sim.values[`I${i}`] === 1 ? 0 : 1); update(); }} />)}
          {outputPositions.map((position, i) => <OutputPort key={i} id={`O${i}`} position={position} value={sim.values[`O${i}`]} />)}
          <text x="320" y="55" textAnchor="middle" className="io-hint">{t.inputHint}</text>
          <text x="320" y="788" textAnchor="middle" className="future-note">{t.future}</text>
        </svg>
      </div>
      <div className="canvas-bottomline"><span>{t.bitOrder}</span>
        <div className="zoom-controls">
          <button aria-label={t.zoomOut} disabled={zoom <= 0.75} onClick={() => setZoom(zoom - 0.25)}>−</button>
          <button aria-label={t.fit} onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
          <button aria-label={t.zoomIn} disabled={zoom >= 2} onClick={() => setZoom(zoom + 0.25)}>+</button>
        </div>
      </div>
    </div>
    <Inspector sim={sim} selected={selected} />
  </section>;
}
