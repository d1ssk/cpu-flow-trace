import type { Program } from './types';
export const counter: Program = {
  id: 'counter',
  title: { ja: 'カウントアップ', en: 'Count up' },
  description: {
    ja: "INPUTは使いません。「連続実行」を押すと、Aを1ずつ増やし、BにコピーしてOUTPUTへ送ります。\n\nOUTPUTの4個のLEDは左から8・4・2・1を表し、点灯している値を足すと出力の数値になります。1、2、3…15と増え、4-bitに収まらなくなると0に戻ります。\n\n終了せず、0〜15のカウントを繰り返します。「リセット」でレジスタと出力が0になり、最初からやり直せます。",
    en: "INPUT is unused. Choose Run continuously to increment A, copy it into B, and send it to OUTPUT.\n\nThe four output LEDs represent 8, 4, 2, and 1 from left to right. Add the lit values to read the number. The output counts 1, 2, 3…15, then wraps to 0 because it has only four bits.\n\nCounting repeats indefinitely. Reset clears the registers and output to 0 and starts the program over.",
  },
  lines: [
    { instruction: 'MOV A, im', immediate: 0 },
    { instruction: 'ADD A, im', immediate: 1 },
    { instruction: 'MOV B, A' },
    { instruction: 'OUT B' },
    { instruction: 'JMP im', immediate: 1 },
  ],
  pseudocode: `uint4_t a = 0;
for (;;) {
  a = add4(a, 1);
  uint4_t b = a;
  out(b);
}`,
};
