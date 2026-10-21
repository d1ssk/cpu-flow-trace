import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLocale } from '../../i18n';
import { detailRuntime } from '../../circuits/td4/runtime';
import { useCpu, useCpuSnapshot } from './context';
import { drawCpu } from './cpu-view.js';
import { pick, inspectCpu, type Selection } from './inspection';
import { cpuMessages } from './messages';

export function CpuCanvas() {
  const session = useCpu(); const { locale, t } = useLocale(); const m = cpuMessages(locale);
  const svgRef = useRef<SVGSVGElement>(null), scrollRef = useRef<HTMLDivElement>(null);
  const renderer = useRef<ReturnType<typeof drawCpu> | null>(null);
  const [zoom, setZoom] = useState(1), [width, setWidth] = useState(640);
  const [selected, setSelected] = useState<Selection | null>(null), [error, setError] = useState('');
  useEffect(() => {
    const scroll = scrollRef.current!;
    function resize() {
      const style = getComputedStyle(scroll);
      const availableWidth = scroll.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height = Math.max(280, Math.min(740, innerHeight - scroll.getBoundingClientRect().top - 150));
      // On mobile, use the available width; taller circuits remain locally scrollable.
      const fitWidth = window.matchMedia('(max-width: 900px)').matches
        ? availableWidth : Math.min(availableWidth, height * 1184 / 750);
      setWidth(Math.max(220, fitWidth));
    }
    const observer = new ResizeObserver(resize); observer.observe(scroll); window.addEventListener('resize', resize); resize();
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); };
  }, []);
  useEffect(() => {
    let revision = -1;
    function update() {
      const state = session.getSnapshot();
      if (!session.sim) return;
      try {
        if (revision !== state.revision) {
          svgRef.current!.replaceChildren();
          renderer.current = drawCpu(svgRef.current!, session.sim, state.view, locale);
          if (revision !== -1) setSelected(null);
          revision = state.revision;
        }
        renderer.current?.render();
      } catch (e) { setError(String(e)); }
    }
    update(); const unsubscribe = session.subscribe(update);
    return () => { unsubscribe(); renderer.current = null; };
  }, [session, locale]);
  useEffect(() => { renderer.current?.select(selected); }, [selected, locale]);
  function activate(target: EventTarget) {
    if (!(target instanceof Element)) return;
    const input = target.closest<SVGElement>('[data-input]');
    if (input && !target.closest('[data-detail-root]')) { session.input(input.dataset.input!); return; }
    const next = pick(target);
    setSelected(current => JSON.stringify(current) === JSON.stringify(next) ? null : next);
  }
  return <>
    <div className="td4-scroll" ref={scrollRef} data-testid="circuit-scroll" tabIndex={0} aria-label={locale === 'ja' ? 'TD4回路図。拡大時はスクロールできます' : 'TD4 circuit. Scroll to explore when zoomed in'}>
      <svg ref={svgRef} className="td4-svg circuit-svg" style={{ width: width * zoom }} viewBox="-32 0 1184 750" role="group" aria-label="TD4 CPU"
        onClick={e => activate(e.target)} onKeyDown={e => {
          if (['Enter', ' '].includes(e.key) && (e.target as Element).closest('[role="button"]')) { e.preventDefault(); activate(e.target); }
          if (e.key === 'Escape') setSelected(null);
        }} />
    </div>
    {error && <p role="alert">{error}</p>}
    <div className="td4-canvas-footer">
      <span>{locale === 'ja' ? '4 bit · 左からbit 3 → 0' : '4 bit · Left to right: bit 3 → 0'}</span>
      <div className="zoom-controls">
        <button aria-label={t.zoomOut} disabled={zoom <= 1} onClick={() => setZoom(Math.max(1, zoom - .5))}>−</button>
        <button aria-label={m.fit} onClick={() => { setZoom(1); scrollRef.current?.scrollTo(0, 0); }}>{m.fit}</button>
        <button aria-label={t.zoomIn} disabled={zoom >= 12} onClick={() => setZoom(Math.min(12, zoom + .5))}>＋</button>
        <output aria-label={locale === 'ja' ? '表示倍率' : 'Zoom'}>{Math.round(zoom * 100)}%</output>
      </div>
    </div>
    <CpuInspector selected={selected} />
  </>;
}
function CpuInspector({ selected }: { selected: Selection | null }) {
  const session = useCpu(); const state = useCpuSnapshot(); const { locale } = useLocale(); const m = cpuMessages(locale);
  const [params] = useSearchParams();
  const module = selected?.kind === 'module' ? selected.id : selected?.kind === 'detail' ? selected.module : null;
  const query = new URLSearchParams(params); query.set('view', state.view === 'overview' ? 'module' : state.view);
  return <div className="td4-inspector" data-testid="inspector">
    <p>{selected && session.sim ? inspectCpu(session.sim, selected, locale) : m.hint}</p>
    {module && detailRuntime.specs[module] && <Link to={`/${locale}/modules/${module}/?${query}`}>{m.detail} →</Link>}
  </div>;
}
