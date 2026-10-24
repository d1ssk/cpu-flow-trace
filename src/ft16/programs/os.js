/* A tiny operating system for the `full` profile: two user processes with
 * their own virtual address spaces, timer preemption, system calls, a
 * software-refilled TLB, and W^X page protection.
 *
 * Physical memory (one memory for code and data, 32-word pages):
 *   0x000 reset, 0x001 trap vector, 0x002–0x01F kernel variables ([r0+n])
 *   0x020– kernel code, kernel stack below 0x100
 *   0x100 PCBs, 0x120 page tables, 0x140 / 0x160 program images
 *   0x180 A code, 0x1A0 A data+stack, 0x1C0 B code, 0x1E0 B data+stack
 * At boot the kernel copies each image into its code page, then runs it in
 * user mode at virtual address 0. Code pages are executable but read-only;
 * data pages are writable but not executable. */

const kernel = `; ===== kernel (kernel mode: physical addresses) =====
.equ LED,    0xFFF0
.equ PERIOD, 0xFFF2
.equ TSTAT,  0xFFF3
.equ S1,     2          ; r1..r7 of the interrupted process at 2..8
.equ CUR,    9          ; current process (0 = A, 1 = B)
.equ ALIVE,  10         ; bit0 A, bit1 B
.equ RR,     11         ; next TLB entry to replace
.equ KILLS,  12         ; processes killed by protection faults
.equ KSTACK, 0x100
.equ PCBA,   0x100      ; 16 words per process: r1..r7 epc estat
.equ PTA,    0x120      ; page tables: 16 entries per process
.equ IMGA,   0x140      ; program images (copied at boot)
.equ IMGB,   0x160
.equ CODEA,  0x180
.equ CODEB,  0x1C0
.equ SLICE,  40         ; timer ticks per time slice

.org 0x000
    JMP  boot           ; reset
    JMP  trap           ; trap vector
    .word 0, 0, 0, 0, 0, 0, 0   ; S1..S7
    .word 0             ; CUR
    .word 3             ; ALIVE
    .word 0, 0          ; RR, KILLS

.org 0x020
trap:                   ; every trap enters here
    ST   r1, [r0+S1]
    ST   r2, [r0+S1+1]
    ST   r3, [r0+S1+2]
    ST   r4, [r0+S1+3]
    ST   r5, [r0+S1+4]
    ST   r6, [r0+S1+5]
    ST   r7, [r0+S1+6]
    LA   r6, KSTACK
    CSRR r1, CAUSE
    CMPI r1, 1
    JZ   on_timer
    CMPI r1, 2
    JZ   on_syscall
    CMPI r1, 4
    JZ   on_tlb
    CMPI r1, 5
    JZ   on_tlb
    JMP  kill           ; illegal instruction, write or execute fault

boot:
    LA   r6, KSTACK
    LA   r1, IMGA       ; load both programs into their code pages
    LA   r2, CODEA
    JAL  copy
    LA   r1, IMGB
    LA   r2, CODEB
    JAL  copy
    FENCEI              ; later fetches must see the copied code
    JMP  resume         ; start process CUR (= A)

on_timer:               ; preemption: switch to the other process
    JAL  save_ctx
    JAL  next_proc
resume:                 ; run process CUR from its PCB
    JAL  load_ctx
    JAL  flush_tlb
    LI   r1, SLICE
    ST   r1, [r0+PERIOD] ; restart the time slice
    ST   r1, [r0+TSTAT]  ; clear a pending timer request
restore:
    LD   r1, [r0+S1]
    LD   r2, [r0+S1+1]
    LD   r3, [r0+S1+2]
    LD   r4, [r0+S1+3]
    LD   r5, [r0+S1+4]
    LD   r6, [r0+S1+5]
    LD   r7, [r0+S1+6]
    RETI                ; back to user mode

on_syscall:             ; r1 = service (0 exit, 1 show r2), r2 = argument
    LD   r1, [r0+S1]
    CMPI r1, 0
    JZ   on_exit
    LD   r2, [r0+S1+1]
    LD   r3, [r0+CUR]
    LD   r1, [r0+LED]
    CMPI r3, 0
    JZ   show_a
    SHLI r2, 4          ; B owns the upper four LEDs
    ANDI r1, 0x0F
    JMP  show
show_a:
    ANDI r2, 0x0F       ; A owns the lower four LEDs
    ANDI r1, 0xF0
show:
    OR   r1, r2
    ST   r1, [r0+LED]
    JMP  restore

on_tlb:                 ; TLB miss: look up the page table and retry
    CSRR r2, BADVA
    SHRI r2, 5          ; r2 = virtual page number
    CMPI r2, 16
    JAE  kill           ; outside the process's 16 pages
    LD   r3, [r0+CUR]
    SHLI r3, 4
    LA   r4, PTA
    ADD  r4, r3
    ADD  r4, r2
    LD   r5, [r4]       ; page table entry: page | X W V
    MOV  r3, r5
    ANDI r3, 1
    JZ   kill           ; unmapped page: segmentation fault
    SHLI r4, r2, 5      ; virtual page | I-TLB bit | entry
    LD   r3, [r0+RR]
    OR   r4, r3
    ADDI r3, 1
    ANDI r3, 3
    ST   r3, [r0+RR]
    CSRR r3, CAUSE
    CMPI r3, 4
    JNZ  rf_d
    ORI  r4, 0x10       ; instruction TLB
rf_d:
    TLBW r4, r5         ; the permissions travel with the entry
    JMP  restore        ; EPC still points at the faulting instruction

kill:
    LD   r1, [r0+KILLS]
    ADDI r1, 1
    ST   r1, [r0+KILLS]
on_exit:                ; the current process ends
    LD   r1, [r0+CUR]
    LI   r3, 1
    SHL  r3, r3, r1     ; this process's bit
    NOT  r3
    LD   r2, [r0+ALIVE]
    AND  r2, r3
    ST   r2, [r0+ALIVE]
    JZ   shutdown
    JAL  next_proc
    JMP  resume
shutdown:
    ST   r0, [r0+PERIOD] ; stop the timer
    HALT

copy:                   ; 32 words from [r1] to [r2]
    LI   r3, 32
cp_loop:
    LD   r4, [r1]
    ST   r4, [r2]
    ADDI r1, 1
    ADDI r2, 1
    ADDI r3, -1
    JNZ  cp_loop
    RET

save_ctx:               ; S1..S7, EPC, ESTAT -> PCB[CUR]
    LD   r3, [r0+CUR]
    SHLI r3, 4
    LA   r4, PCBA
    ADD  r3, r4
    LI   r1, S1
    LI   r2, 7
sc_loop:
    LD   r4, [r1]
    ST   r4, [r3]
    ADDI r1, 1
    ADDI r3, 1
    ADDI r2, -1
    JNZ  sc_loop
    CSRR r4, EPC
    ST   r4, [r3]
    CSRR r4, ESTAT
    ST   r4, [r3+1]
    RET

load_ctx:               ; PCB[CUR] -> S1..S7, EPC, ESTAT
    LD   r3, [r0+CUR]
    SHLI r3, 4
    LA   r4, PCBA
    ADD  r3, r4
    LI   r1, S1
    LI   r2, 7
lc_loop:
    LD   r4, [r3]
    ST   r4, [r1]
    ADDI r1, 1
    ADDI r3, 1
    ADDI r2, -1
    JNZ  lc_loop
    LD   r4, [r3]
    CSRW EPC, r4
    LD   r4, [r3+1]
    CSRW ESTAT, r4
    RET

next_proc:              ; CUR <- the other process, if it is alive
    LD   r1, [r0+CUR]
    XORI r1, 1
    LI   r2, 1
    SHL  r2, r2, r1
    LD   r3, [r0+ALIVE]
    AND  r3, r2
    JZ   np_keep
    ST   r1, [r0+CUR]
np_keep:
    RET

flush_tlb:              ; invalidate all eight TLB entries
    LI   r1, 0          ; bit 4 = instruction TLB, bits 1:0 = entry
ft_loop:
    TLBW r1, r0         ; valid = 0
    ADDI r1, 1
    CMPI r1, 4
    JNZ  ft_next
    LI   r1, 0x10
ft_next:
    CMPI r1, 0x14
    JNZ  ft_loop
    RET

; ----- kernel data -----
.org 0x100              ; PCB A: sp = 0x40, epc = 0, ESTAT = user mode + IE
    .word 0, 0, 0, 0, 0, 0x40, 0, 0, 0x01
.org 0x110              ; PCB B
    .word 0, 0, 0, 0, 0, 0x40, 0, 0, 0x01
; page table entries: physical page | X (4) | W (2) | V (1)
.org 0x120
    .word 0x185         ; A: virtual page 0 -> 0x180 code (X, read only)
    .word 0x1A3         ;    virtual page 1 -> 0x1A0 data (W, no X)
.org 0x130
    .word 0x1C5         ; B: virtual page 0 -> 0x1C0 code
    .word 0x1E3         ;    virtual page 1 -> 0x1E0 data
`;

const processA = `
; ===== process A image (runs at virtual 0x0000 in user mode) =====
.org 0x140, 0x0000
    LI   r2, 0
countA:
    ADDI r2, 1
    LI   r1, 1          ; syscall 1: show r2 on the LEDs
    SYSCALL
    CMPI r2, 15
    JNZ  countA
    LI   r3, 0x20
    ST   r2, [r3]       ; own data page: virtual 0x20 (physical 0x1A0)
    LI   r1, 0          ; syscall 0: exit
    SYSCALL
`;

const processB = `
; ===== process B image =====
.org 0x160, 0x0000
    LI   r1, 5
    JAL  fact           ; the stack page is refilled on first use
    LI   r3, 0x20
    ST   r1, [r3]       ; virtual 0x20 (physical 0x1E0) = 120
    SHRI r2, r1, 4
    LI   r1, 1
    SYSCALL             ; show 120 >> 4 = 7 on the upper LEDs
    LI   r4, 5          ; machine code of SYSCALL ...
    ST   r4, [r3+1]     ; ... written into the data page
    JR   r3, 1          ; data pages are not executable: killed
fact:                   ; r1 = r1! (recursive)
    CMPI r1, 1
    JLE  base
    ADDI r6, -2
    ST   r7, [r6+1]
    ST   r1, [r6]
    ADDI r1, -1
    JAL  fact
    LD   r2, [r6]       ; r2 = n
    MOV  r3, r1
    LI   r1, 0
madd:                   ; r1 = fact(n - 1) * n by repeated addition
    ADD  r1, r3
    ADDI r2, -1
    JNZ  madd
    LD   r7, [r6+1]
    ADDI r6, 2
    RET
base:
    LI   r1, 1
    RET
`;

export const osPrograms = [
  {
    id: 'os', title: 'ミニOS: 2プロセスと保護', needs: ['mem', 'call', 'mmio', 'irq', 'priv'],
    description: 'カーネルは起動時に2つのプログラムをメモリ上の別のページへコピーしてから、タイマで切り替えて実行します。各プロセスは自分の仮想番地0から動き、TLBミスはカーネルがページ表から補充します。Aは数を数えて LED下位に表示、Bは再帰で 5! を計算して上位に表示した後、データページに書いた命令を実行しようとして実行保護違反 (W^X) で強制終了されます。',
    source: kernel + processA + processB,
  },
  {
    id: 'syscall', title: 'システムコールと特権命令', needs: ['mem', 'call', 'mmio', 'irq', 'priv'],
    description: 'ユーザーモードのプログラムがシステムコールで LED を点け、その後に特権命令 (DI) を実行して不正命令例外になります。',
    source: `.equ LED, 0xFFF0
    JMP  boot
    JMP  trap           ; trap vector
cause: .word 0          ; 0x0002
trap:                   ; kernel trap handler
    CSRR r3, CAUSE
    CMPI r3, 2
    JNZ  fault
    ST   r1, [r0+LED]   ; syscall: LEDs = r1
    RETI
fault:                  ; any other cause: record it and stop
    LI   r2, 0xFF
    ST   r2, [r0+LED]
    ST   r3, [r0+cause]
    HALT
boot:
    LI   r1, 0x45       ; physical page 0x040, X | V (read only)
    LI   r2, 0x10       ; instruction TLB, entry 0, virtual page 0
    TLBW r2, r1
    CSRW EPC, r0        ; enter user mode at virtual 0x0000
    CSRW ESTAT, r0      ; IE = 0, user mode
    RETI
.org 0x40, 0x0000
user:
    LI   r1, 0x5A
    SYSCALL             ; LEDs = 0x5A
    DI                  ; privileged: illegal instruction trap
    JMP  user
`,
  },
];
