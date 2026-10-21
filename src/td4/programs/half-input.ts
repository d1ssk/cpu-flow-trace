import type { Program } from './types';
export const halfInput: Program = {
  id: 'half-input',
  title: { ja: '入力を半分', en: 'Halve the input' },
  description: {
    ja: 'INPUTで0〜15の値を設定してから「連続実行」を押します。左から8・4・2・1に対応し、Hにした値の合計が入力値です。最初のIN Aで入力を一度だけ読み込みます。\n\nAから2を引けるたびにBへ1を足し、2で割った整数の商を求めます。OUTPUTには計算終了時に結果を表示します。例：6（0110）→3（0011）。小数部分は切り捨てるので、7（0111）でも3になります。\n\n計算後は終了番地を繰り返し、結果を表示したままになります。INPUTを変えるだけでは再計算しません。別の値を試すには「リセット」→INPUTの設定→「連続実行」の順に操作します。',
    en: 'Set INPUT to a value from 0 to 15, then choose Run continuously. The switches represent 8, 4, 2, and 1 from left to right; add the values set to H. The first IN A reads the input once.\n\nEach successful subtraction of 2 from A adds 1 to B, computing integer division by 2. OUTPUT shows the result when calculation finishes: for example, 6 (0110) → 3 (0011). Fractions are discarded, so 7 (0111) also produces 3.\n\nThe CPU then loops at the final address and holds the result. Changing INPUT alone does not recalculate it. To try another value, choose Reset, set INPUT again, then choose Run continuously.',
  },
  lines: [
    { instruction: 'IN A' },
    { instruction: 'MOV B, im', immediate: 0 },
    { instruction: 'ADD A, im', immediate: 14 },
    { instruction: 'JNC im', immediate: 6 },
    { instruction: 'ADD B, im', immediate: 1 },
    { instruction: 'JMP im', immediate: 2 },
    { instruction: 'OUT B' },
    { instruction: 'JMP im', immediate: 7 },
  ],
  pseudocode: `uint4_t a = in();
uint4_t b = 0;
for (;;) {
  a = add4(a, 14); // subtract 2
  if (!carry) break;
  b = add4(b, 1);
}
out(b);
for (;;) { }`,
};
