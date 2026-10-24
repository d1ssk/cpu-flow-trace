import englishSpecification from '../../ft16/docs/isa.en.md?raw';
import { createTranslator, localizeData } from '../../ft16/i18n/index.js';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLocale } from '../../i18n';
import japaneseSpecification from '../../ft16/docs/isa.md?raw';
import { assemble } from '../../ft16/isa/assembler.js';
import { disassemble } from '../../ft16/isa/disassembler.js';
import { PROFILES } from '../../ft16/isa/spec.js';
import { FtNavigation } from './Ft16Pages';

// A small, non-HTML renderer for the checked-in specification's vocabulary.
// Source and examples are text nodes, never interpreted as HTML.
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part.replace(/\\\|/g, '|')}</Fragment>);
}
function cells(line: string) { return line.trim().slice(1, -1).split(/(?<!\\)\|/).map(c => c.trim()); }
function Specification({ specification }: { specification: string }) {
  const { locale } = useLocale();
  const t = createTranslator(locale);
  const lines = specification.split('\n');
  const nodes: ReactNode[] = [];
  let sectionNumber: string | undefined;
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim() || line.startsWith('# ')) { i++; continue; }
    if (line.startsWith('```')) {
      const start = i++; const block: string[] = [];
      while (i < lines.length && !lines[i].startsWith('```')) block.push(lines[i++]);
      i++; nodes.push(<pre key={start}><code>{block.join('\n')}</code></pre>); continue;
    }
    if (line.startsWith('## ')) {
      const title = line.slice(3); const num = title.match(/^\d+/)?.[0];
      sectionNumber = num;
      nodes.push(<h2 id={`isa-${num}`} key={i++}>{title}</h2>); continue;
    }
    if (line.startsWith('### ')) { nodes.push(<h3 key={i++}>{line.slice(4)}</h3>); continue; }
    if (line.startsWith('|')) {
      const start = i; const header = cells(lines[i++]); i++;
      const rows: string[][] = []; while (i < lines.length && lines[i].startsWith('|')) rows.push(cells(lines[i++]));
      nodes.push(<div className="ft-table-scroll" key={start} tabIndex={0} role="region" aria-label={header.join(t("・"))}><table className={sectionNumber === '8' ? 'ft-call-convention' : undefined}><thead><tr>{header.map((c, n) => <th key={n} scope="col">{inline(c)}</th>)}</tr></thead><tbody>{rows.map((row, r) => <tr key={r}>{row.map((c, n) => <td key={n}>{inline(c)}</td>)}</tr>)}</tbody></table></div>); continue;
    }
    if (line.startsWith('- ')) {
      const start = i; const items: string[] = []; while (i < lines.length && lines[i].startsWith('- ')) items.push(lines[i++].slice(2));
      nodes.push(<ul key={start}>{items.map((item, n) => <li key={n}>{inline(item)}</li>)}</ul>); continue;
    }
    nodes.push(<p key={i++}>{inline(line)}</p>);
  }
  return <>{nodes}</>;
}
const encodingExamples = [
  {
    asm: 'ADD r3, r1, r2',
    fields: [
      { width: 4, name: 'op', role: '命令の種類', value: 'ALU' },
      { width: 3, name: 'rd', role: '保存先', value: 'r3' },
      { width: 3, name: 'rs1', role: '入力1', value: 'r1' },
      { width: 3, name: 'rs2', role: '入力2', value: 'r2' },
      { width: 3, name: 'funct', role: '演算の指定', value: 'ADD' },
    ],
    meaning: 'ADD r3, r1, r2 は「r1 と r2 の中身を足し、r3 に保存する」という命令です。rd は保存先、rs1・rs2 は読み出す元を指定する欄の名前です。',
    detail: 'op = 0001 で ALU 演算を、funct = 000 で加算を選びます。',
  },
  {
    asm: 'ADDI r1, -1',
    fields: [
      { width: 4, name: 'op', role: '命令の種類', value: 'ADDI' },
      { width: 3, name: 'rd', role: '入力・保存先', value: 'r1' },
      { width: 9, name: 'imm9', role: '加える数', value: '−1' },
    ],
    meaning: 'ADDI r1, -1 は「r1 の中身に −1 を足し、r1 に戻す」という命令です。rd の欄で読み出す元と保存先を兼ねます。',
    detail: 'imm は命令に直接埋め込む数（即値）です。ここでは −1 を9 bit の 111111111 で表し、計算時に16 bit の 0xFFFF へ符号拡張します。',
  },
  {
    asm: 'LD r2, [r1+3]',
    fields: [
      { width: 4, name: 'op', role: '命令の種類', value: 'LD' },
      { width: 3, name: 'rd', role: '保存先', value: 'r2' },
      { width: 3, name: 'rs1', role: '番地の元', value: 'r1' },
      { width: 6, name: 'imm6', role: '番地に足す数', value: '+3' },
    ],
    meaning: 'LD r2, [r1+3] は「r1 の中身に3を足した番地から、1語を読み出して r2 に保存する」という命令です。角括弧はメモリの中身を指します。',
    detail: 'rd に保存先 r2 の番号2、rs1 に番地の元 r1 の番号1、imm6 に番地に足す数3を入れます。r1 = 0x0080、その3語先のメモリに42があれば、r2 に42が入ります。',
  },
  {
    asm: 'JNZ 4',
    fields: [
      { width: 4, name: 'op', role: '命令の種類', value: 'Jcc' },
      { width: 4, name: 'cond', role: '分岐の条件', value: 'Z = 0' },
      { width: 8, name: 'off8', role: '次の命令からの差', value: '+3' },
    ],
    meaning: 'JNZ 4 は「Z フラグが0なら番地4へ飛ぶ」という命令です。レジスタの指定はなく、cond に条件、off8 に行き先までの差を入れます。',
    detail: 'この命令は番地0にあるため、次の命令は番地1。行き先4との差は 4 − 1 = 3 です。命令には行き先の4ではなく、この差を 00000011 として入れます。Z = 1 なら飛ばずに番地1へ進みます。',
  },
];
function EncodingExplorer() {
  const { locale } = useLocale();
  const t = createTranslator(locale);
  const [selected, setSelected] = useState(0);
  const example = localizeData(encodingExamples[selected], locale);
  const word = assemble(example.asm)!.mem[0];
  const bits = word.toString(2).padStart(16, '0');
  let offset = 0;
  return <section className="ft-encoding" aria-labelledby="encoding-heading">
    <h2 id="encoding-heading">{t("命令のビット構成")}</h2>
    <p>{t("r0〜r7 は、CPU 内部で値を保持する8本のレジスタの名前です。命令には中身ではなく番号を3 bit で入れます（r3 なら3＝011）。")}</p>
    <label>{t("命令を選ぶ ")}<select value={selected} onChange={e => setSelected(Number(e.target.value))}>{encodingExamples.map((e, i) => <option key={e.asm} value={i}>{e.asm}</option>)}</select></label>
    <p>{example.meaning}</p>
    <p className="ft-encoding-guide">{t("各欄を左からつなぐと、CPU が読む16 bit の命令になります。")}</p>
    <div className="ft-bit-fields">{example.fields.map(field => {
      const value = bits.slice(offset, offset += field.width);
      return <div key={field.name} style={{ flex: field.width }}>
        <span className="ft-field-role">{field.role}</span><span>{field.name}</span>
        <strong>{field.value}</strong><code>↓ {value}</code><small>{field.width} bit</small>
      </div>;
    })}</div>
    <p className="ft-encoded-word"><span>{t("16進表記")}: <code>0x{word.toString(16).toUpperCase().padStart(4, '0')}</code></span><span>→ {disassemble(word, PROFILES.full, 0)}</span></p>
    <p>{example.detail}</p>
    <small>{t("この表示は上のシミュレーターと共通のアセンブラ・逆アセンブラを使います。")}</small>
  </section>;
}
export function Ft16IsaPage() {
  const { locale } = useLocale();
  const t = createTranslator(locale);
  const specification = locale === 'en' ? englishSpecification : japaneseSpecification;
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const frame = requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView());
    return () => cancelAnimationFrame(frame);
  }, [hash, locale]);
  return <div className="ft-page" lang={locale}><FtNavigation /><article className="ft-article ft-isa">
    <h1>{t("FT16 共通 ISA")}</h1>
    <p>{t("ISA はソフトウェアとハードウェアの間の約束です。どんな状態があり、各命令で何が変わり、例外のときどこへ戻るのかを決めます。実行に何クロックかけるか、キャッシュを使うか、命令を重ねるかは実装の選択です。")}</p><p>{t("このページは段階1〜9から共通で参照できます。未対応の機能はプロファイルごとに異なります。段階0の TD4 は別の ISA なので、末尾に対照用の仕様を載せています。")}</p>
    <nav className="ft-toc" aria-label={t("ISA の目次")}>{specification.split('\n').filter(line => line.startsWith('## ')).map(line => <a key={line} href={`#isa-${line.match(/\d+/)?.[0]}`}>{line.slice(3)}</a>)}</nav>
    <EncodingExplorer />
    <section><h2>{t("数値の表記と符号")}</h2><p>{t("0x は16進、0b は2進です。16 bit の同じビット列 0xFFFF は、符号なしなら65535、2の補数の符号付きなら−1です。加算器は同じビット列を計算し、結果を符号付きで比較するかどうかはフラグと分岐条件で決まります。")}</p><p>{t("例えば 0x7FFF + 1 = 0x8000。桁上がり C は0ですが、32767から−32768へ符号が変わるので V は1です。0xFFFF + 1 = 0 なら C=1、Z=1、V=0。この2つを区別すると、符号付きの JLT と符号なしの JC の使い分けが分かります。")}</p><p><Link to={`/${locale}/ft16/1/?program=mini-alu`}>{t("段階1の ALU と比較の実験へ")}</Link></p></section>
    <Specification specification={specification} />
    <Link className="ft-text-button" to={`/${locale}/ft16/`}>{t("学習ガイドへ")}</Link>
  </article></div>;
}
