import type { Circuit } from '../simulator/circuit';
import { signalLabel } from './Wire';
import { useLocale } from '../i18n';
export function Inspector({ sim, selected }: { sim: Circuit; selected: string | null }) {
  const { t } = useLocale();
  const wire = selected ? sim.wires[selected] : undefined;
  return <div className={`inspector ${selected ? 'has-selection' : ''}`} data-testid="inspector">
    {!selected ? <span>{t.inspectHint}</span> : wire ? <>
      <strong>{wire.id}</strong>
      <span>{t.from} <b>{signalLabel(wire.source)}</b> → {t.arrived} <b>{signalLabel(wire.arrived)}</b></span>
      <span>{t.delay} {(wire.delay / 1000).toFixed(2)} s</span>
    </> : <>
      <strong>{selected} · NAND</strong>
      <code>{signalLabel(sim.values[`${selected}.a`])} ∧ {signalLabel(sim.values[`${selected}.b`])} → ¬ → {signalLabel(sim.values[`${selected}.y`])}</code>
      <span>{t.gateRule}</span>
    </>}
  </div>;
}
