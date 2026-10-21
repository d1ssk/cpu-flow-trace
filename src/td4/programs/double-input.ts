import type { Program } from './types';
export const doubleInput: Program = {
  id: 'double-input',
  title: { ja: '入力を2倍', en: 'Double the input' },
  description: {
    ja: 'INPUTで0〜15の値を設定してから「連続実行」を押します。左から8・4・2・1に対応し、Hにした値の合計が入力値です。最初のIN Aで入力を一度だけ読み込みます。\n\nAから1を引けるたびにBへ2を足し、読み込んだ値の2倍を計算します。OUTPUTには計算終了時に結果を表示します。例：3（0011）→6（0110）。4-bitなので16以上は折り返し、9（1001）なら2（0010）になります。\n\n計算後は終了番地を繰り返し、結果を表示したままになります。INPUTを変えるだけでは再計算しません。別の値を試すには「リセット」→INPUTの設定→「連続実行」の順に操作します。',
    en: 'Set INPUT to a value from 0 to 15, then choose Run continuously. The switches represent 8, 4, 2, and 1 from left to right; add the values set to H. The first IN A reads the input once.\n\nEach successful subtraction of 1 from A adds 2 to B, doubling the input. OUTPUT shows the result when calculation finishes: for example, 3 (0011) → 6 (0110). Results wrap modulo 16, so 9 (1001) produces 2 (0010).\n\nThe CPU then loops at the final address and holds the result. Changing INPUT alone does not recalculate it. To try another value, choose Reset, set INPUT again, then choose Run continuously.',
  },
  lines: [
    { instruction: 'IN A' },
    { instruction: 'MOV B, im', immediate: 0 },
    { instruction: 'ADD A, im', immediate: 15 },
    { instruction: 'JNC im', immediate: 6 },
    { instruction: 'ADD B, im', immediate: 2 },
    { instruction: 'JMP im', immediate: 2 },
    { instruction: 'OUT B' },
    { instruction: 'JMP im', immediate: 7 },
  ],
  pseudocode: `uint4_t a = in();
uint4_t b = 0;
for (;;) {
  a = add4(a, 15); // subtract 1
  if (!carry) break;
  b = add4(b, 2);
}
out(b);
for (;;) { }`,
};
