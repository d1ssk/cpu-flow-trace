import { CpuWorkspace } from '../../visualization/td4/Workspace';
import { InstructionList } from './InstructionList';
import { Introduction } from './Introduction';
import { useLocale } from '../../i18n';

export function HomePage() {
  const { locale, t } = useLocale();
  return <div className="home-page">
    <h1 className="sr-only">How a CPU Works</h1>
    <p className="home-lead">{locale === 'ja'
      ? 'CPUはいったいどのような仕組みで動くのでしょうか。4-bit CPUでプログラムを実行し、配線を伝わる信号をトランジスタのレベルまで追ってみましょう。'
      : 'How does a CPU actually work? Run a program on a 4-bit CPU and follow signals along its wires down to the transistor level.'}</p>
    <CpuWorkspace />
    <Introduction />
    <InstructionList />
    <section className="references" aria-labelledby="references-heading">
      <h2 id="references-heading">{t.references}</h2>
      {/* IEEE numbered book references; retain the original Japanese titles and author names. */}
      <ol>
        <li id="reference-1" lang="ja">渡波 郁, <cite><a href="https://book.mynavi.jp/ec/products/detail/id=22065">CPUの創りかた：IC10個のお手軽CPU設計超入門</a></cite>. 東京: 毎日コミュニケーションズ, 2003.</li>
        <li id="reference-2" lang="ja">上原 周, <cite><a href="https://ndlsearch.ndl.go.jp/books/R100000002-I030581135">作ろう!CPU：基礎から理解するコンピューターのしくみ</a></cite>. 東京: マイナビ出版, 2020.</li>
      </ol>
    </section>
  </div>;
}
