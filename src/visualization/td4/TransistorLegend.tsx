import { useLocale } from '../../i18n';

export function TransistorLegend() {
  const { locale } = useLocale();
  const title = locale === 'ja' ? 'トランジスタ' : 'Transistors';
  return <aside className="td4-transistor-legend" aria-label={title}>
    <span>{title}</span>
    {(['p', 'n'] as const).map(type => <span className="td4-transistor-key" key={type}>
      <svg viewBox="0 0 36 44" width="29" height="36" aria-hidden="true">
        <path d="M26 4v36M18 12v20" />
        <path d={type === 'p' ? 'M4 22h6' : 'M4 22h14'} />
        {type === 'p' && <circle cx="13" cy="22" r="3" />}
      </svg>
      <span><strong>{type}MOS</strong><small>{locale === 'ja' ? `G=${type === 'p' ? 0 : 1}でON` : `ON at G=${type === 'p' ? 0 : 1}`}</small></span>
    </span>)}
  </aside>;
}
