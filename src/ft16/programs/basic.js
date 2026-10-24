/* Sample programs for profiles core … system. `needs` lists the profile
 * features a program uses; a stage can run every program whose needs it
 * implements. Conventions: results in r1, r6 = SP, r7 = link register. */

const IO_EQU = `.equ LED,    0xFFF0
.equ SW,     0xFFF1
.equ PERIOD, 0xFFF2
.equ TSTAT,  0xFFF3
`;

export const basicPrograms = [
  {
    id: 'mul', title: 'かけ算 (シフトと加算)', needs: [],
    description: '250 × 201 を、乗数を右シフトして押し出されたビット (C) を調べ、被乗数を左シフトしながら足していく方法で計算します。16 bit の結果は r1 = 50250 (0xC44A)。',
    source: `; r1 = 250 * 201 by shift and add
    LI   r1, 250        ; multiplicand
    LI   r2, 201        ; multiplier
    LI   r3, 0          ; product
loop:
    CMPI r2, 0
    JZ   done
    SHRI r2, 1          ; C = the bit shifted out
    JNC  skip
    ADD  r3, r1         ; r3 = r3 + r1
skip:
    SHLI r1, 1
    JMP  loop
done:
    MOV  r1, r3         ; r1 = 50250 (0xC44A)
    HALT
`,
  },
  {
    id: 'fib', title: 'フィボナッチ数', needs: [],
    description: '16 bit に収まる最大のフィボナッチ数を求めます。3オペランドの ADD の桁上がり (C) で終了を判定します。結果は r1 = 46368 (0xB520)。',
    source: `; Fibonacci: r1, r2 hold consecutive numbers
    LI   r1, 0
    LI   r2, 1
loop:
    ADD  r3, r1, r2     ; r3 = r1 + r2, C = 1 on 16-bit overflow
    JC   done
    MOV  r1, r2
    MOV  r2, r3
    JMP  loop
done:
    MOV  r1, r2         ; r1 = 46368 (0xB520)
    HALT
`,
  },
  {
    id: 'gcd', title: '最大公約数 (LUI で定数)', needs: [],
    description: '1071 と 462 の最大公約数を、大きい方から小さい方を引き続けて求めます。即値に収まらない定数は LA (LUI + ORI の2命令) で作ります。結果は r1 = 21。',
    source: `    LA   r1, 1071       ; LUI r1, 8 + ORI r1, 47
    LA   r2, 462
loop:
    CMP  r1, r2
    JZ   done
    JC   less           ; r1 < r2 (unsigned)
    SUB  r1, r1, r2
    JMP  loop
less:
    SUB  r2, r2, r1
    JMP  loop
done:
    HALT                ; r1 = r2 = 21
`,
  },
  {
    id: 'overflow', title: '符号付きのあふれ (V フラグ)', needs: [],
    description: '1 + 2 + 3 + … を、符号付きの和が 32767 を超えて V (オーバーフロー) が 1 になるまで続けます。r2 = 256、r1 = 0x8080 (符号付きでは負の数) で止まり、N と V が 1 になります。',
    source: `; add 1, 2, 3, ... until the signed sum overflows
    LI   r1, 0          ; sum
    LI   r2, 0          ; n
loop:
    ADDI r2, 1
    ADD  r1, r2         ; V = 1 when the sum passes 32767
    JNV  loop
    HALT                ; r2 = 256, r1 = 0x8080, N = V = 1
`,
  },
  {
    id: 'sum', title: '配列の合計 (同じメモリ)', needs: ['mem'],
    description: 'プログラムのすぐ後ろに置いた8語の表を LD で順に読み、合計を表の直後へ ST します。命令とデータが同じメモリにあることが分かります。合計は 39200 (0x9920)。',
    source: `    LI   r1, table      ; pointer
    LI   r2, 8          ; count
    LI   r3, 0
loop:
    LD   r4, [r1]
    ADD  r3, r4
    ADDI r1, 1
    ADDI r2, -1
    JNZ  loop
    ST   r3, [r1]       ; store the sum after the table
    HALT

table:                  ; data right after the code, in the same memory
    .word 300, 1400, 1500, 9200, 6500, 3500, 8900, 7900
    .word 0             ; the sum goes here
`,
  },
  {
    id: 'sort', title: 'バブルソート (符号付き)', needs: ['mem'],
    description: '負の数を含む8語を、隣同士を符号付きで比べ (JGE) 入れ替える操作を繰り返して昇順に並べます。',
    source: `outer:
    LI   r3, 0          ; swapped?
    LI   r1, arr
inner:
    LD   r4, [r1]
    LD   r5, [r1+1]
    CMP  r5, r4
    JGE  noswap         ; signed: already in order
    ST   r5, [r1]
    ST   r4, [r1+1]
    LI   r3, 1
noswap:
    ADDI r1, 1
    CMPI r1, arr+7
    JNZ  inner
    CMPI r3, 0
    JNZ  outer
    HALT

arr: .word 5, -3, 800, -1, 9, 2, -700, 4
`,
  },
  {
    id: 'hazards', title: 'ハザードの見本', needs: ['mem'],
    description: 'パイプライン向け: 直前の結果を使う命令 (データハザード)、ロード直後の使用 (ロードユース)、毎回成立する分岐 (制御ハザード)、メモリの取り合い (構造ハザード) を含みます。ハザード処理やメモリのポート数を変えて、クロック数と CPI を比べてください。結果は r1 = 300 (0x012C)。',
    source: `    LI   r3, buf
    LI   r2, 4          ; loop count
    LI   r1, 0
loop:
    LI   r4, 5
    ADD  r4, r4, r4     ; uses r4 right after LI: forwarded
    ADD  r1, r1, r4     ; uses r4 again: forwarded
    ST   r1, [r3]
    LD   r5, [r3]       ; load ...
    ADD  r1, r1, r5     ; ... used at once: one stall even with forwarding
    ADDI r2, -1
    JNZ  loop           ; taken three times: a misprediction without a predictor
    HALT                ; r1 = 300 (2 * (r1 + 10), four times)
buf: .word 0
`,
  },
  {
    id: 'locality', title: 'キャッシュと局所性', needs: ['mem'],
    description: 'キャッシュ向け: 8語の配列を2回合計します。1回目は行 (2語) ごとにミスしますが、2回目は同じ行を再び使うのでヒットします (時間的局所性)。続けて8語おきに読むと、同じ行番号を取り合って毎回ミスします (競合ミス)。',
    source: `    LI   r2, 2          ; two passes
pass:
    LI   r1, arr
    LI   r3, 0
sum:
    LD   r4, [r1]
    ADD  r3, r4
    ADDI r1, 1
    CMPI r1, arr+8
    JNZ  sum
    ADDI r2, -1
    JNZ  pass
    ST   r3, [r1]       ; arr+8 = sum (36)
    LI   r1, arr        ; stride 8: arr, arr+8, arr+16 share a line index
    LD   r4, [r1]
    LD   r4, [r1+8]
    LD   r4, [r1+16]
    LD   r4, [r1]
    LD   r4, [r1+8]
    HALT

.org 0x80
arr: .word 1, 2, 3, 4, 5, 6, 7, 8
     .word 0
.org 0x90
     .word 0x10
`,
  },
  {
    id: 'selfmod', title: '命令の書き換えと FENCEI', needs: ['mem'],
    description: '命令もデータなので ST で書き換えられます。1回目は ADDI r1, 1 を実行し、その命令を ADDI r1, 100 で上書きしてからもう一度実行します。命令キャッシュ (段階7) はストアを見ていないので、FENCEI で無効にしないと古い命令を実行してしまいます。結果は r1 = 101。',
    source: `    LI   r1, 0
    LI   r4, 2          ; run the patched spot twice
again:
patch:
    ADDI r1, 1          ; replaced by ADDI r1, 100 after the first pass
    LI   r5, patch
    LI   r6, newins
    LD   r3, [r6]       ; an instruction word, read as data ...
    ST   r3, [r5]       ; ... and written over the old instruction
    FENCEI              ; later fetches must see the store
    ADDI r4, -1
    JNZ  again
    HALT                ; r1 = 1 + 100 = 101

newins:
    ADDI r1, 100        ; never executed here: only copied
`,
  },
  {
    id: 'fact', title: '階乗 (再帰呼び出し)', needs: ['mem', 'call'],
    description: 'fact(8) を再帰で計算します。JAL は戻り番地をリンクレジスタ r7 に入れるだけなので、さらに呼び出す関数は r7 と引数を自分でスタック (SP = r6) に保存します。結果は r1 = 40320 (0x9D80)。',
    source: `    LA   r6, 0x200      ; SP: the stack grows down from the top of RAM
    LI   r1, 8
    JAL  fact
    HALT                ; r1 = 40320 (0x9D80)

; fact(r1) -> r1
fact:
    CMPI r1, 1
    JLE  base           ; n <= 1 (signed)
    ADDI r6, -2         ; save n and the return address
    ST   r7, [r6+1]
    ST   r1, [r6]
    ADDI r1, -1
    JAL  fact           ; r1 = fact(n - 1)
    LD   r2, [r6]       ; r2 = n
    JAL  mul            ; r1 = r1 * r2
    LD   r7, [r6+1]
    ADDI r6, 2
    RET                 ; JALR r0, r7, 0
base:
    LI   r1, 1
    RET

; mul: r1 = r1 * r2 (a leaf function: r7 stays in place)
mul:
    LI   r3, 0
mloop:
    CMPI r2, 0
    JZ   mdone
    SHRI r2, 1
    JNC  mskip
    ADD  r3, r1
mskip:
    SHLI r1, 1
    JMP  mloop
mdone:
    MOV  r1, r3
    RET
`,
  },
  {
    id: 'funcptr', title: '関数の表 (間接呼び出し)', needs: ['mem', 'call'],
    description: 'メモリの表に並べた関数の番地を LD で読み、CALLR (= JALR r7, rN) で順に呼び出します。行き先がレジスタで決まる間接呼び出しです。結果は r1 = ((10 + 5) × 2) − 3 = 27。',
    source: `    LI   r4, table      ; pointer into the table
    LI   r5, 3          ; number of functions
    LI   r1, 10
next:
    LD   r2, [r4]       ; function address
    CALLR r2            ; JALR r7, r2: indirect call
    ADDI r4, 1
    ADDI r5, -1
    JNZ  next
    HALT                ; r1 = 27

add5:
    ADDI r1, 5
    RET
double:
    ADD  r1, r1, r1
    RET
sub3:
    ADDI r1, -3
    RET

table: .word add5, double, sub3
`,
  },
  {
    id: 'double', title: 'スイッチ × 2 を LED へ', needs: ['mem', 'mmio'],
    description: 'スイッチ (0xFFF1) を読み、左シフトで2倍して LED (0xFFF0) へ書き続けます。I/O もメモリと同じ LD/ST で扱えます。r0 は常に 0 なので [r0-16] のように番地を直接書けます。',
    switches: 0x15,
    source: `${IO_EQU}loop:
    LD   r1, [r0+SW]    ; switches
    SHLI r1, 1
    ST   r1, [r0+LED]   ; LEDs
    JMP  loop
`,
  },
  {
    id: 'scanner', title: 'LEDの往復 (ポーリング)', needs: ['mem', 'call', 'mmio'],
    description: '点灯位置を左右へ動かします。待ち時間は、タイマの割り込み要求フラグ (0xFFF3) を読んで待つポーリングで作ります。',
    source: `${IO_EQU}    LI   r1, 6
    ST   r1, [r0+PERIOD] ; timer period = 6 ticks (24 cycles)
    LI   r1, 1
left:
    ST   r1, [r0+LED]
    JAL  wait
    SHLI r1, 1
    CMPI r1, 0x80
    JNZ  left
right:
    ST   r1, [r0+LED]
    JAL  wait
    SHRI r1, 1
    CMPI r1, 1
    JNZ  right
    JMP  left

wait:                   ; poll the timer flag, then acknowledge it
    LD   r2, [r0+TSTAT]
    CMPI r2, 0
    JZ   wait
    ST   r2, [r0+TSTAT]
    RET
`,
  },
  {
    id: 'timer-irq', title: 'タイマ割り込みで点滅', needs: ['mem', 'mmio', 'irq'],
    description: 'タイマ割り込みのたびに LED を反転し、回数を数えます。番地 0 はリセット、番地 1 はトラップの入口です。本体は HALT で割り込みを待ち、6回目以降に終了します。',
    source: `${IO_EQU}    JMP  main           ; 0x0000: reset
    JMP  handler        ; 0x0001: trap vector
ticks: .word 0          ; 0x0002
save:  .word 0          ; 0x0003

handler:
    ST   r1, [r0+save]
    ST   r1, [r0+TSTAT] ; acknowledge the timer
    LD   r1, [r0+LED]
    XORI r1, 0xFF       ; toggle the LEDs
    ST   r1, [r0+LED]
    LD   r1, [r0+ticks]
    ADDI r1, 1
    ST   r1, [r0+ticks]
    LD   r1, [r0+save]
    RETI                ; restores the flags and IE

main:
    LI   r1, 0x0F
    ST   r1, [r0+LED]   ; LEDs = 0x0F
    LI   r1, 60
    ST   r1, [r0+PERIOD] ; timer period = 60 ticks (240 cycles)
    EI
idle:
    HALT                ; wait for an interrupt
    LD   r1, [r0+ticks]
    CMPI r1, 6
    JC   idle           ; until six interrupts
    DI
    HALT
`,
  },
];
