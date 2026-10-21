import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLocale } from '../../i18n';
import { parseView, type View } from '../../circuits/td4/runtime';
import { useCpu, useCpuSnapshot } from './context';
import { ViewControls } from './ViewControls';
import { cpuMessages } from './messages';
import { hex, disassemble } from '../../td4/format';
import { playbackSpeeds } from './playback';
import { PlaybackIcon } from './PlaybackIcon';
export function CpuControls() {
  const session = useCpu(), state = useCpuSnapshot();
  const { locale, t } = useLocale(); const m = cpuMessages(locale);
  const [params, setParams] = useSearchParams();
  const requestedView = parseView(params.get('view'));
  useEffect(() => { if (!state.loading && !state.error && state.view !== requestedView) void session.changeView(requestedView); }, [requestedView, state.loading, state.error, state.view, session]);
  function view(value: View) { const next = new URLSearchParams(params); next.set('view', value); setParams(next, { replace: true }); }
  const disabled = state.loading || !!state.error;
  const playing = state.mode !== 'paused';
  return <>
    <ViewControls view={requestedView} disabled={disabled} onChange={view} />
    <div className="td4-controls td4-playback">
      <div className="td4-control-group" role="group" aria-label={locale === 'ja' ? 'CPU実行' : 'CPU execution'}>
        <button className="td4-run" onClick={session.togglePlayback} disabled={disabled}><PlaybackIcon kind={playing ? 'pause' : 'play'} />{playing ? t.pause : t.play}</button>
        <button onClick={session.clock} disabled={disabled || playing} title={m.instructionHint}><PlaybackIcon kind="instruction" />{m.instructionStep}</button>
        <button onClick={session.reset} disabled={state.loading}><PlaybackIcon kind="reset" />{t.reset}</button>
      </div>
      <div className="td4-control-group">
        <label>{t.speed} <select aria-label={t.speed} value={state.speed} onChange={e => session.speed(Number(e.target.value))}>
          {playbackSpeeds.map(speed => <option key={speed} value={speed}>{speed}×</option>)}
        </select></label>
      </div>
    </div>
    <p className="td4-playback-hint">{m.playbackHint}</p>
    <details className="td4-signal-controls">
      <summary>{m.signalControls}</summary>
      <div className="td4-controls">
        <button onClick={session.next} disabled={disabled || playing}>{m.signalStep}</button>
        <button onClick={session.step} disabled={disabled || playing}>{t.step}</button>
      </div>
      <p>{m.signalHint}</p>
    </details>
    <div className="td4-status">
      <span>{state.loading ? m.loading : state.mode === 'paused' ? t.paused : state.mode === 'instruction' ? m.instructionPlaying : m.running}</span>
      <span data-testid="cycle-count">{state.cycles} {m.completed}</span>
      <output aria-label={t.time}>{(state.time / 1000).toFixed(2)} s</output>
      {state.last && <span>{m.last}: {hex(state.last.address)} · {disassemble(state.last.byte)}</span>}
    </div>
    {state.mode === 'paused' && state.busy && state.cycles === 0 && !session.sim?.clockActive && <p className="td4-playback-hint">{m.pendingInput}</p>}
    {state.error && <p role="alert">{state.error} <button onClick={session.retry}>{m.retry}</button></p>}
  </>;
}
