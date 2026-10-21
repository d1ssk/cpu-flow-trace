import type { Program } from './types';
export const kitchenTimer: Program = {
  id: 'kitchen-timer',
  title: { ja: 'キッチンタイマー', en: 'Kitchen timer' },
  description: {
    ja: "INPUTの4ビットで開始値（0〜15）を設定してから「再生」を押します。入力は最初に一度だけBへ読み込みます。待ち時間は16 − INPUTの段階数で決まり、0なら16段階で最長、15なら1段階で最短です。開始後にINPUTを変えても、進行中の計測には反映されません。\n\nOUTPUTは残り時間ではなく、開始値から15まで増えるカウンターを2進数で表示します（左からbit 3〜0）。例えばINPUTが12（1100）なら、1100 → 1101 → 1110 → 1111の4段階です。各段階ではAを13から14、15、0へ加算し、その桁あふれを待ってBを1増やします。1段階は10命令分です。\n\nBが15から0へ桁あふれすると計測終了です。その後はOUTPUTが0000と1111を繰り返し、全LEDが点滅します。再び計測するには「リセット」、INPUTの設定、「再生」の順に操作します。この画面では一定周期の実時計を使わず、配線の伝播完了を待って次の命令へ進むため、秒や分を正確に計るタイマーではありません。速度設定や表示構成でも所要時間が変わります。",
    en: "Set a starting value (0–15) with the four INPUT bits, then choose Play. The input is read into B only once, at the start. The wait lasts 16 − INPUT stages: 0 gives the longest wait of 16 stages, and 15 gives the shortest wait of one stage. Changing INPUT after the initial read does not affect the current timer.\n\nOUTPUT shows an increasing binary counter from the starting value through 15, not the time remaining (bits 3–0 from left to right). For example, INPUT 12 (1100) gives four stages: 1100 → 1101 → 1110 → 1111. In each stage, A starts at 13 and advances through 14, 15, and 0. Its overflow triggers an increment of B. Each stage takes 10 instructions.\n\nWhen B overflows from 15 to 0, the wait ends. OUTPUT then alternates between 0000 and 1111, blinking all LEDs. To repeat, choose Reset, set INPUT, and choose Play. This simulation waits for wire propagation to finish before the next instruction instead of using a fixed clock period, so it does not measure exact seconds or minutes. Playback speed and circuit view also affect the duration.",
  },
  lines: [
    { instruction: 'IN B' },
    { instruction: 'OUT B' },
    { instruction: 'MOV A, im', immediate: 13 },
    { instruction: 'ADD A, im', immediate: 1 },
    { instruction: 'JNC im', immediate: 3 },
    { instruction: 'ADD B, im', immediate: 1 },
    { instruction: 'JNC im', immediate: 1 },
    { instruction: 'OUT im', immediate: 0 },
    { instruction: 'OUT im', immediate: 15 },
    { instruction: 'JMP im', immediate: 7 },
  ],
  pseudocode: `uint4_t b = input();
do {
  out(b);
  uint4_t a = 13;
  do { a = add4(a, 1); } while (!carry);
  b = add4(b, 1);
} while (!carry);
for (;;) {
  out(0b0000);
  out(0b1111);
}`,
};
