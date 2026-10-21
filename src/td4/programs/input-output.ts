import type { Program } from './types';
export const inputOutput: Program = {
  id: 'input-output',
  title: { ja: '入力 → 出力', en: 'Input → output' },
  description: {
    ja: "INPUTの4個のスイッチで0〜15の値を設定します。左から8・4・2・1に対応し、Hにした値の合計が入力値です。\n\n「再生」を押すと、IN B命令で入力をBに読み込み、OUT B命令で同じ値をOUTPUTの4個のLEDに表示します。信号が配線を通り、命令が実行されるため、入力を変えても出力は瞬時には変わりません。\n\n読み込みと出力を繰り返します。実行中にINPUTを変更すると、次のIN Bで新しい値が取り込まれます。",
    en: "Set a value from 0 to 15 with the four INPUT switches. From left to right they represent 8, 4, 2, and 1; add the values set to H.\n\nChoose Play. IN B reads the input into B, then OUT B displays the same value on the four output LEDs. Changes take time to travel through wires and instructions, so OUTPUT does not change instantly.\n\nThe program repeats indefinitely. Changing INPUT during execution takes effect when the next IN B reads it.",
  },
  lines: [{ instruction: 'IN B' }, { instruction: 'OUT B' }, { instruction: 'JMP im', immediate: 0 }],
  pseudocode: `for (;;) {
  uint4_t b = in();
  out(b);
}`,
};
