import type { Locale } from '../../i18n';
/** All strings here come from static circuit definitions, never user code. */
export function localizeSvg(svg: SVGSVGElement, locale: Locale) {
  if (locale === 'ja') return;
  const labels = (text: string) => text.replaceAll('D / Q 選択', 'D / Q select')
    .replaceAll('ALU結果', 'ALU result').replaceAll('次PC', 'Next PC')
    .replaceAll('CLK 等長化', 'CLK matching').replaceAll('CLK 配線長調整', 'CLK matching');
  for (const el of svg.querySelectorAll('[aria-label]')) {
    const label = el.getAttribute('aria-label')!
      .replace(/入力 bit (\d+) の L \/ H を切り替える/, 'Toggle input I$1')
      .replace(/の詳細回路/g, ' internal circuit').replace(/の接続を確認/g, ' connections')
      .replace(/の端子値を観察/g, ' terminals').replace(/を切り替える/g, ' toggle')
      .replace(/を観察/g, ' inspect').replace(/配線/g, 'Wire');
    el.setAttribute('aria-label', labels(label));
  }
  for (const el of svg.querySelectorAll('text, title')) {
    if (el.textContent) el.textContent = labels(el.textContent);
  }
}
