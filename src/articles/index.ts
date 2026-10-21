export const articleGroups = [
  { id: 'logic', title: { ja: '信号と論理', en: 'Signals and logic' } },
  { id: 'memory', title: { ja: '記憶', en: 'Memory' } },
  { id: 'control', title: { ja: '演算と制御', en: 'Arithmetic and control' } },
  { id: 'cpu', title: { ja: 'CPU全体', en: 'The complete CPU' } },
] as const;

type LocalizedText = { ja: string; en: string };
export interface Article {
  id: string;
  group: typeof articleGroups[number]['id'];
  title: LocalizedText;
  description: LocalizedText;
  status: 'planned';
}

// Keep the existing /learn/nand/ and /learn/dff/ addresses for their respective topics.
export const articles = [
  {
    id: 'signals', group: 'logic', status: 'planned',
    title: { ja: '信号と配線', en: 'Signals and wires' },
    description: {
      ja: 'H/L、入力と出力、回路図の読み方。信号の変化が配線を伝わって届く様子を観察し、このサイトでの伝播時間の意味を理解します。',
      en: 'Read H/L states, inputs, outputs, and circuit diagrams. Follow a change along a wire and understand what propagation time means in this site’s model.',
    },
  },
  {
    id: 'transistors', group: 'logic', status: 'planned',
    title: { ja: 'トランジスタをスイッチとして使う', en: 'Using transistors as switches' },
    description: {
      ja: '理想化したMOSスイッチからNOT回路を作ります。入力に応じて、どの経路がつながるかを確かめます。',
      en: 'Build a NOT circuit from idealized MOS switches. Change the input and see which paths conduct.',
    },
  },
  {
    id: 'nand', group: 'logic', status: 'planned',
    title: { ja: '論理ゲートを組み合わせる', en: 'Combining logic gates' },
    description: {
      ja: 'NANDの構成とNOT・AND・OR・XORを扱います。真理値表と信号を対応させ、接続したゲートに変化が伝わる様子を追います。',
      en: 'Explore NAND, NOT, AND, OR, and XOR. Connect truth tables to signals and follow changes through connected gates.',
    },
  },
  {
    id: 'latches', group: 'memory', status: 'planned',
    title: { ja: 'フィードバックで記憶する：ラッチ', en: 'Remembering through feedback: latches' },
    description: {
      ja: 'NANDによるSRラッチからDラッチへ。入力を戻しても状態が残る理由と、取り込み・保持の違いを理解します。',
      en: 'Start with a NAND-based SR latch, then explore a D latch. Discover why a state persists and how accepting input differs from holding it.',
    },
  },
  {
    id: 'dff', group: 'memory', status: 'planned',
    title: { ja: 'クロックの瞬間を記憶する：Dフリップフロップ', en: 'Capturing a clock edge: D flip-flops' },
    description: {
      ja: 'ラッチとの違い、クロックエッジ、データの保持。Dとクロックを別々に操作して、いつQが変わるかを確かめます。',
      en: 'Understand clock edges and how flip-flops differ from latches. Change D and the clock independently to see when Q updates.',
    },
  },
  {
    id: 'registers', group: 'memory', status: 'planned',
    title: { ja: '4ビットを記憶する：レジスタ', en: 'Storing four bits: registers' },
    description: {
      ja: 'DFFを並べて4ビットの値を保持します。読み込み許可とリセットを扱い、A・B・出力レジスタにつなげます。',
      en: 'Combine D flip-flops to hold four bits. Explore load enable and reset, leading to the A, B, and output registers.',
    },
  },
  {
    id: 'adders', group: 'control', status: 'planned',
    title: { ja: 'ビットを足す：加算器とキャリー', en: 'Adding bits: adders and carry' },
    description: {
      ja: '半加算器から全加算器、4ビット加算器へ。桁上がりが順に伝わる様子と、4ビットからあふれる値を観察します。',
      en: 'Build from half adders to full adders and a four-bit adder. Watch carry propagate and see what happens when a sum exceeds four bits.',
    },
  },
  {
    id: 'multiplexers', group: 'control', status: 'planned',
    title: { ja: '信号の行き先を選ぶ：マルチプレクサ', en: 'Selecting a signal: multiplexers' },
    description: {
      ja: '複数の値から1つを選ぶ回路を作ります。選択信号を変え、どの入力が出力へ届くかを確かめます。',
      en: 'Build a circuit that selects one of several values. Change the selection signals and trace which input reaches the output.',
    },
  },
  {
    id: 'program-counter', group: 'control', status: 'planned',
    title: { ja: '次の命令を指す：プログラムカウンタ', en: 'Pointing to the next instruction: the program counter' },
    description: {
      ja: 'カウントアップと指定番地の読み込み。普段は次へ進み、ジャンプ時には別の番地へ移る仕組みを作ります。',
      en: 'Explore incrementing and loading an address. Build the mechanism that advances to the next instruction or jumps to another location.',
    },
  },
  {
    id: 'rom', group: 'control', status: 'planned',
    title: { ja: '命令をビット列で保存する：ROM', en: 'Storing instructions as bits: ROM' },
    description: {
      ja: 'アドレスを入力すると命令が出る仕組みを理解します。TD4の命令形式と、アセンブリ・機械語・ROMの関係を扱います。',
      en: 'See how an address selects an instruction. Explore the TD4 instruction format and the relationship between assembly, machine code, and ROM.',
    },
  },
  {
    id: 'decoder', group: 'control', status: 'planned',
    title: { ja: '命令を制御信号に変える：デコーダ', en: 'Turning instructions into control signals: the decoder' },
    description: {
      ja: '命令のビットから、入力の選択やレジスタへの書き込みを決めます。キャリーによる条件分岐もここで説明します。',
      en: 'Use instruction bits to select inputs and control register writes. Explore conditional jumps based on carry.',
    },
  },
  {
    id: 'td4', group: 'cpu', status: 'planned',
    title: { ja: 'つないでCPUにする：TD4の1クロック', en: 'Connecting a CPU: one TD4 clock cycle' },
    description: {
      ja: 'PC・ROM・デコーダ・演算回路・レジスタを接続します。クロック間の信号伝播と、エッジでの状態更新を対応させます。',
      en: 'Connect the PC, ROM, decoder, arithmetic circuits, and registers. Relate signal propagation between clock edges to state updates at an edge.',
    },
  },
  {
    id: 'programs', group: 'cpu', status: 'planned',
    title: { ja: 'プログラムを回路で追いかける', en: 'Tracing programs through the circuit' },
    description: {
      ja: '短いプログラムからLED点滅、ループ、条件分岐へ。コードの1行が回路のどの変化になるかを追います。',
      en: 'Progress from short programs to blinking LEDs, loops, and conditional jumps. Trace each line of code to the changes it causes in the circuit.',
    },
  },
] as const satisfies readonly Article[];

export function articleNumber(article: Article) {
  return String(articles.findIndex(item => item.id === article.id) + 1).padStart(2, '0');
}
