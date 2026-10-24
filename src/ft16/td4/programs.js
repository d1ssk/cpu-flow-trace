/* The six TD4 sample programs of the main site (src/td4/programs/),
 * copied as assembly text for stage 0. `switches` is the initial INPUT value. */

export const td4Programs = [
  {
    id: 'counter', isa: 'td4', title: 'カウントアップ', switches: 0,
    description: 'INPUTは使いません。Aを1ずつ増やし、BにコピーしてOUTPUTへ送ります。OUTPUTの4個のLEDは左から8・4・2・1を表します。1、2、3…15と増え、4 bitに収まらなくなると0に戻ります。',
    source: `MOV A, 0
ADD A, 1
MOV B, A
OUT B
JMP 1
`,
  },
  {
    id: 'led-blink', isa: 'td4', title: 'LED ちかちか', switches: 0,
    description: 'ROMに並んだOUT命令が4個のLEDの点灯パターンを順に切り替えます。0011 → 0110 → 1100 → 1000 → 1000 → 1100 → 0110 → 0011 → 0001 と変化し、先頭へ戻ります。',
    source: `OUT 3
OUT 6
OUT 12
OUT 8
OUT 8
OUT 12
OUT 6
OUT 3
OUT 1
JMP 0
`,
  },
  {
    id: 'input-output', isa: 'td4', title: '入力 → 出力', switches: 5,
    description: 'IN B で入力 (INPUTの4個のスイッチ) をBに読み込み、OUT B で同じ値をOUTPUTに表示します。実行中にINPUTを変えると、次の IN B で新しい値が取り込まれます。',
    source: `IN B
OUT B
JMP 0
`,
  },
  {
    id: 'double-input', isa: 'td4', title: '入力を2倍', switches: 3,
    description: '最初の IN A で入力を一度だけ読み込み、Aから1を引けるたびにBへ2を足して2倍を計算します。例: 3 (0011) → 6 (0110)。計算後は終了番地を繰り返します。',
    source: `IN A
MOV B, 0
ADD A, 15
JNC 6
ADD B, 2
JMP 2
OUT B
JMP 7
`,
  },
  {
    id: 'half-input', isa: 'td4', title: '入力を半分', switches: 7,
    description: 'Aから2を引けるたびにBへ1を足し、2で割った整数の商を求めます。例: 7 (0111) → 3 (0011)。計算後は終了番地を繰り返します。',
    source: `IN A
MOV B, 0
ADD A, 14
JNC 6
ADD B, 1
JMP 2
OUT B
JMP 7
`,
  },
  {
    id: 'kitchen-timer', isa: 'td4', title: 'キッチンタイマー', switches: 12,
    description: '入力 (開始値) を最初に一度だけBへ読み込み、Bが15から0へ桁あふれするまで数えます。各段階ではAを13から14、15、0へ加算し、その桁あふれ (C) を待ってBを1増やします。終わるとOUTPUTの全LEDが点滅します。',
    source: `IN B
OUT B
MOV A, 13
ADD A, 1
JNC 3
ADD B, 1
JNC 1
OUT 0
OUT 15
JMP 7
`,
  },
];
