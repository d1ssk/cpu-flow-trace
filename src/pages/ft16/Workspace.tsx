import { useLocale } from '../../i18n';
import { createTranslator, translateMarkup } from '../../ft16/i18n/index.js';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { mountFt16 } from '../../ft16/view/app.js';
import template from '../../ft16/view/workspace.html?raw';
import '../../ft16/view/style.css';

export interface WorkspaceHandle { loadExperiment(id: string): void; focusModule(id: string): void }
export const Workspace = forwardRef<WorkspaceHandle, { stageId: string; onProgramChange: (id: string) => void }>(function Workspace({ stageId, onProgramChange }, ref) {
  const { locale } = useLocale();
  const t = createTranslator(locale);
  const root = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof mountFt16> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = root.current!;
    // The legacy SVG renderer owns only this subtree; React owns navigation and articles.
    element.innerHTML = template;
    translateMarkup(element, locale);
    setError('');
    try { controller.current = mountFt16(element, { stageId, onProgramChange, locale }); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    return () => { controller.current?.dispose(); controller.current = null; element.replaceChildren(); };
  }, [stageId, onProgramChange, locale]);
  useImperativeHandle(ref, () => ({
    loadExperiment(id) { controller.current?.loadExperiment(id); },
    focusModule(id) { controller.current?.focusModule(id); },
  }), []);
  return <section id="ft-visualization" aria-label={t("可視化と操作")}><div ref={root} />{error && <p role="alert">{t("回路を読み込めませんでした: ")}{error}</p>}</section>;
});
