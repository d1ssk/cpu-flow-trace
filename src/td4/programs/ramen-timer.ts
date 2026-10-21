import type { Program } from './types';
export const ramenTimer: Program = {
  source: 'https://xyama.sakura.ne.jp/hp/4bitCPU_TD4.html',
  id: 'ramen-timer',
  title: { ja: 'ラーメンタイマー', en: 'Ramen timer' },
  description: {
    ja: "INPUTは使いません。「連続実行」を押すと、Aを0〜15まで繰り返し加算し、桁あふれを使って進行段階を切り替えます。\n\nOUTPUTは残り時間の数値ではなく、進み具合を示す点灯パターンです。左からbit 3〜0で、0111（3灯）→ 0110（2灯）と進み、終盤は0000と0100を交互に出して1灯を点滅させます。\n\n数え終わると1000になり、左端のLEDだけを点灯したまま終了番地を繰り返します。再び動かすには「リセット」を押してから「連続実行」します。この画面では実時間の3分を計測するものではなく、速度設定で所要時間が変わります。",
    en: "INPUT is unused. Choose Run continuously. The program repeatedly increments A through 0–15 and uses overflow to move through its stages.\n\nOUTPUT is a progress pattern, not a numerical countdown. Reading bits 3 through 0 from left to right, it shows 0111 (three LEDs), then 0110 (two LEDs). Near the end it alternates 0000 and 0100 to blink one LED.\n\nWhen counting finishes, OUTPUT stays at 1000 with only the leftmost LED lit, while the CPU loops at the final address. To repeat, choose Reset and then Run continuously. This is not a real three-minute timer: playback speed changes how long it takes.",
  },
  lines: [
    { instruction: 'OUT im', immediate: 7 },
    { instruction: 'ADD A, im', immediate: 1 },
    { instruction: 'JNC im', immediate: 1 },
    { instruction: 'ADD A, im', immediate: 1 },
    { instruction: 'JNC im', immediate: 3 },
    { instruction: 'OUT im', immediate: 6 },
    { instruction: 'ADD A, im', immediate: 1 },
    { instruction: 'JNC im', immediate: 6 },
    { instruction: 'ADD A, im', immediate: 1 },
    { instruction: 'JNC im', immediate: 8 },
    { instruction: 'OUT im', immediate: 0 },
    { instruction: 'OUT im', immediate: 4 },
    { instruction: 'ADD A, im', immediate: 1 },
    { instruction: 'JNC im', immediate: 10 },
    { instruction: 'OUT im', immediate: 8 },
    { instruction: 'JMP im', immediate: 15 },
  ],
  pseudocode: `uint4_t a = 0;
out(0b0111);
do { a = add4(a, 1); } while (!carry);
do { a = add4(a, 1); } while (!carry);
out(0b0110);
do { a = add4(a, 1); } while (!carry);
do { a = add4(a, 1); } while (!carry);
do {
  out(0b0000);
  out(0b0100);
  a = add4(a, 1);
} while (!carry);
out(0b1000);
for (;;) { }`,
};
