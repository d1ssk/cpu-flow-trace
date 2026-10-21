import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useLocale } from '../../i18n';
import { NotFoundPage } from '../NotFoundPage';
import { detailRuntime, parseView, type DetailView, type Part, type View } from '../../circuits/td4/runtime';
import { ViewControls } from '../../visualization/td4/ViewControls';
import { TransistorLegend } from '../../visualization/td4/TransistorLegend';
import { cpuMessages } from '../../visualization/td4/messages';
import { drawDetail } from '../../visualization/td4/module-view.js';
import { inspectPart, pick, type Selection } from '../../visualization/td4/inspection';
import { binary } from '../../td4/format';
import { defaultPlaybackSpeed, playbackSpeeds, playbackTimeScale } from '../../visualization/td4/playback';
import '../../visualization/td4/td4.css';
export function ModulePage() {
  const { moduleId } = useParams();
  if (!moduleId || !detailRuntime.specs[moduleId]) return <NotFoundPage />;
  return <ModuleExperiment id={moduleId} />;
}
function ModuleExperiment({ id }: { id: string }) {
  const { locale, t } = useLocale(); const m = cpuMessages(locale);
  const [params, setParams] = useSearchParams();
  const view = parseView(params.get('view'), true) as DetailView;
  const sim = useRef<Part | null>(null), previous = useRef<{ id: string; view: DetailView } | null>(null);
  const svg = useRef<SVGSVGElement>(null), scroll = useRef<HTMLDivElement>(null);
  const renderer = useRef<ReturnType<typeof drawDetail> | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [revision, setRevision] = useState(0), [, refresh] = useState(0), [retry, setRetry] = useState(0);
  const [playing, setPlaying] = useState(true), [speed, setSpeed] = useState(defaultPlaybackSpeed), [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<Selection | null>(null);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    void detailRuntime.load(id, view).then(() => {
      if (!active) return;
      const sameModule = previous.current?.id === id;
      if (!(sameModule && previous.current?.view.startsWith('mos') && view.startsWith('mos') && sim.current)) {
        const old = sameModule ? sim.current : null;
        if (old) detailRuntime.settle(old);
        const words = old && Object.fromEntries(old.definition.groups.map(g => [g.id, old.word(g.id)]));
        const next = detailRuntime.create(id, view);
        if (words) detailRuntime.restore(next, words);
        sim.current = next;
        if (old) setPlaying(false);
      }
      if (!sameModule) { setZoom(1); setPlaying(true); scroll.current?.scrollTo(0, 0); }
      previous.current = { id, view }; setSelected(null); setRevision(v => v + 1); setLoading(false);
    }).catch(e => { if (active) { setError(String(e)); setLoading(false); } });
    return () => { active = false; };
  }, [id, view, retry]);
  useEffect(() => {
    if (!sim.current || !svg.current || loading || previous.current?.id !== id || previous.current?.view !== view) return;
    try { renderer.current = drawDetail(svg.current, sim.current, id, view, locale); }
    catch (e) { setError(String(e)); }
    return () => { renderer.current = null; };
  }, [revision, locale, id, view, loading]);
  useEffect(() => {
    let frame = 0, last: number | undefined;
    const visibility = () => { last = undefined; };
    const tick = (now: number) => {
      const delta = last === undefined ? 0 : Math.min(100, now - last); last = document.hidden ? undefined : now;
      if (!loading && !error && playing && !document.hidden && sim.current?.busy) {
        try { sim.current.advance(delta * speed * playbackTimeScale); renderer.current?.render(); refresh(v => v + 1); }
        catch (e) { setError(String(e)); setPlaying(false); }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick); document.addEventListener('visibilitychange', visibility);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', visibility); };
  }, [playing, speed, loading, error]);
  useEffect(() => {
    svg.current?.querySelectorAll('.inspected').forEach(el => el.classList.remove('inspected'));
    if (selected?.kind === 'detail') {
      svg.current?.querySelectorAll<SVGElement>('[data-detail-wire],[data-mos],[data-gate],[data-part-module],[data-output]').forEach(el => {
        if (el.dataset[selected.attribute] === selected.id) el.classList.add('inspected');
      });
    }
  }, [selected]);
  function act(fn: (s: Part) => void) {
    if (!sim.current || loading || error) return;
    try { fn(sim.current); renderer.current?.render(); refresh(v => v + 1); }
    catch (e) { setError(String(e)); }
  }
  function activate(target: EventTarget) {
    if (!(target instanceof Element)) return;
    const input = target.closest<SVGElement>('[data-input]');
    if (input) act(s => s.setInput(input.dataset.input!, 1 - Number(s.nodes[input.dataset.input!].output)));
    else setSelected(pick(target));
  }
  function changeView(value: View) { const next = new URLSearchParams(params); next.set('view', value); setParams(next, { replace: true }); }
  const part = sim.current, backQuery = new URLSearchParams(params); backQuery.delete('module');
  return <article className="td4-detail-page td4-workspace">
    <Link className="back-link" to={`/${locale}/?${backQuery}`}>← {m.back}</Link>
    <nav className="td4-module-nav" aria-label={m.details}>{Object.keys(detailRuntime.specs).map(key =>
      <Link key={key} to={`/${locale}/modules/${key}/?${params}`} aria-current={id === key ? 'page' : undefined}>{key === 'CF' ? 'C' : key === 'R' ? 'OUT' : key}</Link>)}</nav>
    <div className="td4-module-heading"><h1>{detailRuntime.specs[id].title}</h1><TransistorLegend /></div><p>{m.independent}</p>
    <ViewControls detail view={view} onChange={changeView} disabled={loading} />
    <div className="td4-controls">
      <button onClick={() => setPlaying(!playing)} disabled={loading || !!error}>{playing ? t.pause : t.play}</button>
      <button onClick={() => { setPlaying(false); act(s => s.next()); }} disabled={loading || !!error || !part?.busy}>{t.next}</button>
      <button onClick={() => { setPlaying(false); act(s => s.advance(10)); }} disabled={loading || !!error}>+0.01 s</button>
      <button onClick={() => { act(s => s.reset()); setPlaying(true); setSelected(null); }} disabled={loading || !!error}>{t.reset}</button>
      <label>{t.speed} <select aria-label={t.speed} value={speed} onChange={e => setSpeed(Number(e.target.value))}>{playbackSpeeds.map(v => <option key={v} value={v}>{v}×</option>)}</select></label>
      <output aria-label={t.time}>{((part?.time ?? 0) / 1000).toFixed(3)} s</output>
    </div>
    {loading && <p role="status">{m.loading}</p>}
    {error && <p role="alert">{error} <button onClick={() => setRetry(v => v + 1)}>{m.retry}</button></p>}
    <div className="td4-detail-inputs" role="group" aria-label={m.inputs}>{part?.definition.groups.filter(g => g.kind === 'INPUT').map(g =>
      <label key={g.id}>{g.label} <input aria-label={g.id} type="number" min={0} max={2 ** g.width - 1} step={1}
        value={part.word(g.id)} disabled={loading || !!error} onChange={e => {
          if (e.target.value !== '' && e.target.validity.valid) { const value = Number(e.target.value); act(s => s.setWord(g.id, value)); }
        }} /></label>)}</div>
    <div className="td4-scroll" ref={scroll} tabIndex={0} data-testid="circuit-scroll" aria-label={m.details}>
      <svg ref={svg} className="td4-svg circuit-svg" role="group" aria-label={`${id} ${m.details}`} style={{ width: (part?.definition.width ?? 500) * zoom }}
        onClick={e => activate(e.target)} onKeyDown={e => {
          if (['Enter', ' '].includes(e.key) && (e.target as Element).closest('[role="button"]')) { e.preventDefault(); activate(e.target); }
          if (e.key === 'Escape') setSelected(null);
        }} />
    </div>
    <div className="td4-canvas-footer"><output aria-label={m.outputs}>{part?.definition.groups.filter(g => g.kind === 'OUTPUT').map(g => `${g.id} ${binary(part.word(g.id), g.width)}`).join(' · ')} · {part?.busy ? t.propagating : m.stable}</output>
      <div className="zoom-controls"><button aria-label={t.zoomOut} disabled={zoom <= 1} onClick={() => setZoom(v => v - .5)}>−</button>
        <button aria-label={m.fit} onClick={() => { setZoom(1); scroll.current?.scrollTo(0, 0); }}>{Math.round(zoom * 100)}%</button>
        <button aria-label={t.zoomIn} disabled={zoom >= 8} onClick={() => setZoom(v => v + .5)}>＋</button></div></div>
    <div className="td4-inspector" data-testid="inspector">{part && selected?.kind === 'detail' ? inspectPart(part, selected.attribute, selected.id, locale) : m.detailHint}</div>
    <div className="td4-notes"><p>{m.rule}</p><p>{m.detailSwitchNote}</p><p>{m.model}</p></div>
  </article>;
}
