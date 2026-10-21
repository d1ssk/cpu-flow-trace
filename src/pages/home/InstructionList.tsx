import { useLocale } from '../../i18n';
import { instructions } from '../../td4/instructions';
export function InstructionList() {
  const { locale, t } = useLocale();
  return <details className="instruction-reference">
    <summary>{t.instructions}</summary>
    <p>{t.instructionsNote}</p>
    <div className="instruction-grid">
      {instructions.map(item => <div className="instruction-entry" key={item.opcode}>
        <code className="opcode">{item.opcode.toString(2).padStart(4, '0')}</code>
        <code>{item.mnemonic}</code><span>{item[locale]}</span>
      </div>)}
    </div>
    <p className="carry-note">{t.carryNote}</p>
  </details>;
}
