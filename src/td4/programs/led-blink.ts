import type { Program } from './types';
export const ledBlink: Program = {
  source: 'https://xyama.sakura.ne.jp/hp/4bitCPU_TD4.html',
  id: 'led-blink',
  title: { ja: 'LED ちかちか', en: 'Blinking LEDs' },
  description: {
    ja: "INPUTは使いません。「連続実行」を押すと、ROMに並んだOUT命令が4個のLEDの点灯パターンを順に切り替えます。\n\nOUTPUTは左からbit 3〜0です。1が点灯、0が消灯を表し、0011 → 0110 → 1100 → 1000 → 1000 → 1100 → 0110 → 0011 → 0001と変化します。1000が2回続く部分は同じ点灯状態を保ちます。\n\n最後は先頭番地へ戻り、同じパターンを繰り返します。自動では終了しません。",
    en: "INPUT is unused. Choose Run continuously to let the OUT instructions in ROM change the four LEDs in sequence.\n\nOUTPUT shows bits 3 through 0 from left to right; 1 means lit and 0 means off. The sequence is 0011 → 0110 → 1100 → 1000 → 1000 → 1100 → 0110 → 0011 → 0001. The repeated 1000 holds that pattern for another instruction.\n\nAfter the last pattern, the program jumps back to the start and repeats indefinitely.",
  },
  lines: [
    ...[3, 6, 12, 8, 8, 12, 6, 3, 1].map(immediate => ({ instruction: 'OUT im' as const, immediate })),
    { instruction: 'JMP im', immediate: 0 },
  ],
  pseudocode: `for (;;) {
  out(0b0011);
  out(0b0110);
  out(0b1100);
  out(0b1000);
  out(0b1000);
  out(0b1100);
  out(0b0110);
  out(0b0011);
  out(0b0001);
}`,
};
