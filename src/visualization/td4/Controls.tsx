import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLocale } from '../../i18n';
import { parseView, type View } from '../../circuits/td4/runtime';
import { useCpu, useCpuSnapshot } from './context';
import { ViewControls } from './ViewControls';
import { cpuMessages } from './messages';
import { hex, disassemble } from '../../td4/format';
import { playbackSpeeds } from './playback';
export function CpuControls() {
  const session = useCpu(), state = useCpuSnapshot();
  const { locale, t } = useLocale(); const m = cpuMessages(locale);
  const [params, setParams] = useSearchParams();
  const requestedView = parseView(params.get('view'));
  useEffect(() => { if (!state.loading && !state.error && state.view !== requestedView) void session.changeView(requestedView); }, [requestedView, state.loading, state.error, state.view, session]);
  function view(value: View) { const next = new URLSearchParams(params); next.set('view', value); setParams(next, { replace: true }); }
  const disabled = state.loading || !!state.error;
  return <>
    <ViewControls view={requestedView} disabled={disabled} onChange={view} />
    <div className="td4-controls">
      <div className="td4-control-group" role="group" aria-label={locale === 'ja' ? 'CPU実行' : 'CPU execution'}>
        <button className="td4-run" onClick={session.run} disabled={disabled} aria-pressed={state.running}>{state.running ? m.stop : m.run}</button>
        <button onClick={session.clock} disabled={disabled || !state.ready}>{t.clock}</button>
        <button onClick={session.reset} disabled={state.loading}>{t.reset}</button>
      </div>
      <div className="td4-control-group" role="group" aria-label={locale === 'ja' ? '信号の観察' : 'Observe signals'}>
        <button onClick={session.pause} disabled={disabled} aria-pressed={!state.playing}>{state.playing ? t.pause : t.play}</button>
        <button onClick={session.next} disabled={disabled || !state.busy}>{t.next}</button>
        <button onClick={session.step} disabled={disabled}>{t.step}</button>
        <label>{t.speed} <select aria-label={t.speed} value={state.speed} onChange={e => session.speed(Number(e.target.value))}>
          {playbackSpeeds.map(speed => <option key={speed} value={speed}>{speed}×</option>)}
        </select></label>
      </div>
    </div>
    <div className="td4-status">
      <span>{state.loading ? m.loading : !state.playing ? t.paused : state.busy ? t.propagating : state.running ? m.running : m.waiting}</span>
      <span data-testid="cycle-count">{state.cycles} {m.completed}</span>
      <output aria-label={t.time}>{(state.time / 1000).toFixed(2)} s</output>
      {state.last && <span>{m.last}: {hex(state.last.address)} · {disassemble(state.last.byte)}</span>}
    </div>
    {state.error && <p role="alert">{state.error} <button onClick={session.retry}>{m.retry}</button></p>}
  </>;
}
