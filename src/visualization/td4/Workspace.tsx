import { useState } from 'react';
import { useLocale } from '../../i18n';
import { ProgramPanel } from '../../pages/home/ProgramPanel';
import { CpuProvider, useCpuSnapshot } from './context';
import { CpuControls } from './Controls';
import { CpuCanvas } from './Canvas';
import { cpuMessages } from './messages';
import { binary } from '../../td4/format';
import { TransistorLegend } from './TransistorLegend';
import { TransistorPlayground } from './TransistorPlayground';
import './td4.css';
export function CpuWorkspace() { return <CpuProvider><Workspace /></CpuProvider>; }
function Workspace() {
  const { locale } = useLocale(); const m = cpuMessages(locale);
  const [open, setOpen] = useState(true);
  return <section className="td4-workspace" aria-label="TD4">
    <div className="td4-workspace-heading"><strong>TD4 · 4-bit CPU</strong>
      <TransistorLegend />
      <button aria-expanded={open} aria-controls="home-program" onClick={() => setOpen(!open)}>{open ? m.hideProgram : m.showProgram}</button></div>
    <div className={`td4-grid ${open ? '' : 'program-collapsed'}`}>
      <div id="home-program" className="td4-program" hidden={!open}><ProgramPanel /></div>
      <div className="td4-circuit"><CpuControls />
        <CpuCanvas aside={<TransistorPlayground />}><StateReadout /></CpuCanvas>
      </div>
    </div>
    <div className="td4-notes"><p>{m.rule}</p><p>{m.switchNote}</p><p>{m.model}</p></div>
  </section>;
}
function StateReadout() {
  const state = useCpuSnapshot();
  return <div className="td4-registers" aria-label="CPU state">
    <span>INPUT <output data-testid="input-word">{binary(state.input, 4)}</output></span>
    {Object.entries(state.registers).map(([key, value]) => <span key={key}>{key === 'carry' ? 'C' : key.toUpperCase()} <output>{binary(value, key === 'carry' ? 1 : 4)}</output></span>)}
    <span>OUTPUT <output data-testid="output-word">{binary(state.output, 4)}</output></span>
  </div>;
}
