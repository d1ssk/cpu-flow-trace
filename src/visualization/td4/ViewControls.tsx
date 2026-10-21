import { useEffect, useState } from 'react';
import { useLocale } from '../../i18n';
import type { View } from '../../circuits/td4/runtime';
import { cpuMessages } from './messages';
interface Props { view: View; disabled?: boolean; detail?: boolean; onChange(view: View): void }
export function ViewControls({ view, disabled, detail, onChange }: Props) {
  const { locale } = useLocale(); const m = cpuMessages(locale);
  const [power, setPower] = useState(view === 'mos-power');
  useEffect(() => setPower(view === 'mos-power'), [view]);
  return <div className="td4-views" role="group" aria-label={m.view}>
    {(['overview', 'module', 'nand', 'mos'] as const).filter(key => !detail || key !== 'overview').map(key =>
      <button key={key} disabled={disabled} data-view={key} aria-pressed={key === 'mos' ? view.startsWith('mos') : view === key}
        onClick={() => onChange(key === 'mos' ? 'mos-power' : key)}>{m[key]}</button>)}
    <label className="td4-power" style={{ visibility: view.startsWith('mos') ? 'visible' : 'hidden' }}><input type="checkbox" checked={power} disabled={disabled || !view.startsWith('mos')}
      onChange={event => { setPower(event.target.checked); onChange(event.target.checked ? 'mos-power' : 'mos-short'); }} />{m.power}</label>
  </div>;
}
