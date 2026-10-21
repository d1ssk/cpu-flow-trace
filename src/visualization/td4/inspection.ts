import type { Cpu, Part } from '../../circuits/td4/runtime';
import type { Locale } from '../../i18n';
import layout from '../../circuits/td4/layout.js';
import { binary } from '../../td4/format';
import { overviewRegisters } from './overview-registers';
export type Selection = { kind: 'module' | 'wire'; id: string } | { kind: 'detail'; module: string; attribute: string; id: string };
export function pick(target: Element): Selection | null {
  const root = target.closest<SVGElement>('[data-detail-root]');
  if (root) {
    const el = target.closest<SVGElement>('[data-detail-wire],[data-gate],[data-part-module],[data-mos],[data-output]');
    if (el) {
      const attribute = ['detailWire', 'gate', 'partModule', 'mos', 'output'].find(key => el.dataset[key])!;
      return { kind: 'detail', module: root.dataset.detailRoot!, attribute, id: el.dataset[attribute]! };
    }
  }
  const module = target.closest<SVGElement>('[data-module]');
  if (module) return { kind: 'module', id: module.dataset.module! };
  const wire = target.closest<SVGElement>('[data-wire]');
  return wire ? { kind: 'wire', id: wire.dataset.wire! } : null;
}
export function inspectPart(part: Part, attribute: string, id: string, locale: Locale) {
  if (attribute === 'detailWire') {
    const w = part.wires[id];
    return `${w.from ?? w.net} → ${w.to ?? ''} · ${locale === 'ja' ? '送信' : 'Source'} ${w.source} → ${locale === 'ja' ? '到着' : 'Arrived'} ${w.arrived} · ${locale === 'ja' ? '遅延' : 'Travel time'} ${(w.delay / 1000).toFixed(3)} s`;
  }
  if (attribute === 'mos') {
    const [cell, device] = id.split(':'); const c = part.cells?.[cell]; const mos = c?.devices.find(m => m.id === device);
    return mos && c ? `${id} · ${mos.type}MOS · ${mos.on ? locale === 'ja' ? '導通' : 'Conducting' : locale === 'ja' ? '遮断' : 'Off'} · ${mos.a}=${c.nets[mos.a]} / ${mos.b}=${c.nets[mos.b]}` : id;
  }
  const values = part.definition.nodes.filter(n => n.id === id || n.gate === id || n.stage === id).map(n => `${n.id.split('.').at(-1)}=${part.nodes[n.id].output}`).join(' · ');
  return `${id} · ${values}${attribute === 'gate' ? ' · Y = ¬(A ∧ B)' : ''}`;
}
export function inspectCpu(sim: Cpu, selected: Selection, locale: Locale): string {
  if (selected.kind === 'detail') {
    const part = sim.parts?.[selected.module];
    return part ? `${selected.module} · ${inspectPart(part, selected.attribute, selected.id, locale)}` : '';
  }
  if (selected.kind === 'wire') {
    const w = Object.values(sim.wires).find(w => w.layoutId === selected.id)!;
    const level = (v: unknown) => v === 1 ? 'H' : v === 0 ? 'L' : String(v);
    return `${w.from} → ${w.to} · ${locale === 'ja' ? '送信' : 'Source'} ${level(w.source)} → ${locale === 'ja' ? '到着' : 'Arrived'} ${level(w.arrived)} · ${locale === 'ja' ? '遅延' : 'Travel time'} ${(w.delay / 1000).toFixed(3)} s`;
  }
  const ports = Object.values(layout.definition.ports) as { id: string; module: string; width: number }[];
  const register = !sim.parts ? overviewRegisters[selected.id] : undefined;
  return `${register ? `${register.title} — ${register.description}` : selected.id} · ${ports.filter(p => p.module === selected.id && p.id !== 'CLK').map(p => `${p.id.split('.')[1]}=${binary(sim.value(p.id), p.width)}`).join(' · ')}`;
}
