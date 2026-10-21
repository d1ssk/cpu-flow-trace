import { Link } from 'react-router-dom';
import { useLocale } from '../../i18n';

function State({ input = false }: { input?: boolean }) {
  return <span className="math-inline"><i>{input ? 'I' : 'S'}</i><sub>t</sub></span>;
}

function Equation() {
  return <span className="state-equation" role="math" aria-label="S sub t plus 1 equals F of S sub t, I sub t">
    <i>S</i><sub>t+1</sub> = <i>F</i>(<State />, <State input />)
  </span>;
}

export function Introduction() {
  const { locale } = useLocale();
  return <section className="home-introduction" aria-label={locale === 'ja' ? 'はじめに' : 'Introduction'}>
    {locale === 'ja' ? <>
      <p>現代のコンピュータは、まるで魔法のように複雑な処理をこなします。しかし、電子部品を組み合わせただけの機械が、いったいどのようにプログラムを実行し、計算を行っているのでしょうか。</p>
      <p>CPUは、その本質において、<strong>状態遷移機械（state-transition machine）</strong>として理解できます。クロックが刻まれるたびに、CPUの内部状態は <Equation /> という規則に従って更新されます。</p>
      <p>ここで、<State /> はCPUの現在の状態、<State input /> は実行する命令や外部からの入力を表します。そして、この状態遷移を定める抽象的な関数 <i className="math-inline">F</i> を実現しているのが、トランジスタと配線からなる具体的な回路です。個々の信号の変化が組み合わさることで、CPU全体の状態遷移が生まれます。</p>
      <p>上の回路は、<strong>TD4 <a href="#reference-1">[1]</a></strong> という、極めて単純ながら実際にプログラムを実行できる4ビットCPUです。命令はわずか<strong>12種類</strong>で、プログラムも最大16命令しか格納できません。それでも、簡単なプログラムを実行できます。</p>
      <p>ここでは、TD4がプログラムを実行する様子をクロックごとに観察できます。さらに、その内部を詳しく見ていけば、個々の配線を伝わる信号の変化を、トランジスタのレベルまで追跡できます。</p>
      <p>CPUがどのように動いているのか、より深く理解したい場合は、<Link to="/ja/learn/">回路の解説記事</Link>もご覧ください（準備中）。単純な論理ゲートから始めて、回路を一つずつ組み合わせながら、最終的にCPU全体の動作へとたどり着くことができます。</p>
    </> : <>
      <p>Modern computers can seem almost magical in their ability to perform complex tasks. But how does a machine made of electronic components actually execute programs and perform computations?</p>
      <p>At its core, a CPU can be understood as a <strong>state-transition machine</strong>. With each clock tick, its internal state is updated according to the rule <Equation />.</p>
      <p>Here, <State /> represents the current state of the CPU, and <State input /> represents the instruction being executed and any external inputs. The abstract function <i className="math-inline">F</i> that determines this state transition is realized by physical circuits made of transistors and wires. Changes in individual signals combine to produce the state transitions of the CPU as a whole.</p>
      <p>The circuit above is <strong>TD4 <a href="#reference-1">[1]</a></strong>, an extremely simple yet fully functional 4-bit CPU. It supports just <strong>12 types of instructions</strong> and can store a program of at most 16 instructions. Even so, it can execute simple programs.</p>
      <p>Here, you can watch TD4 execute a program, one clock cycle at a time. By looking closer, you can trace signal changes along individual wires, all the way down to the transistor level.</p>
      <p>For a deeper understanding of how a CPU works, explore the <Link to="/en/learn/">circuit guides</Link> (coming soon). Starting with simple logic gates, you can follow how circuits are built up step by step, eventually arriving at the complete CPU.</p>
    </>}
  </section>;
}
