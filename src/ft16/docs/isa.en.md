# FT16 instruction set specification

FT16 (Flow Trace 16) is an educational instruction set designed for a progression from TD4 toward modern CPUs. **Stages 1–9 all use this same instruction set.** Available features (profiles) vary by stage, but instruction meanings and encodings do not change. Stage 0 uses the separate TD4 instruction set (§9).

Design choices:

- **Load/store, fixed 16-bit instructions, three operands**: arithmetic operates on registers (`rd = rs1 op rs2`) or a register and an immediate. Only LD/ST access memory. The design anticipates pipelining.
- **Data and addresses are both 16 bits; addresses count 16-bit words.**
- **Instructions and data share memory** (von Neumann, stored-program architecture). Instructions can be read and written as data. Implementations vary in port count and cache organization, but the architectural memory is shared.
- **RISC-style calls**: JAL/JALR save a return address in a register (the link register), without accessing memory. The stack is a software convention.
- **PC-relative branches**: relative control flow works wherever the instruction sequence is placed. The mini OS uses this to copy programs.

## 1. State held by the CPU

| Name | Width | Meaning |
| --- | --- | --- |
| r0–r7 | 16 bits × 8 | General-purpose registers. **r0 always reads zero** and discards writes. r6 = SP and r7 = LR are conventions (§8) |
| PC | 16 bits | Address of the next instruction to execute |
| Z, C, N, V | 1 bit × 4 | Zero, carry (borrow for subtraction), negative (result bit 15), signed overflow |
| CSR | 16 bits × 6 | Control and status registers (stages 4, 5, 8, 9; §6) |
| TLB | 4 + 4 entries | Instruction and data translation (stages 8, 9; §7) |

Reset state: PC = 0x0000, r1–r7 = 0, flags = 0, interrupts disabled, kernel mode.

**Startup simplification**: no boot ROM is implemented. At reset, the assembled program is already in memory, modeling the state after a boot ROM has loaded it. Execution begins at address 0. Address 0 is the reset entry; address 1 is the trap entry (trap vector). Both normally contain JMP instructions. The mini OS in stages 8 and 9 demonstrates loading user programs into RAM.

## 2. Instruction formats

```text
 15 14 13 12 11 10  9  8  7  6  5  4  3  2  1  0
+-----------+--------+--------+--------+--------+
|     op    |   rd   |  rs1   |  rs2   | funct  |   R   (ALU, CSR)
+-----------+--------+--------------------------+
|     op    |   rd   |           imm9           |   I9  (two-operand immediate: ADDI ANDI ORI XORI CMPI LI LUI)
+-----------+--------+--------+-----------------+
|     op    |   rd   |  rs1   |       imm6      |   I6  (LD ST JALR)
+-----------+-----------+-----------------------+
|     op    |    cond   |          off8         |   B   (conditional branch)
+-----------+-----------------------------------+
|     op    |               off12               |   J   (JAL)
+-----------+--------+--------+-----+-----------+
|     op    |   rd   |  rs1   | kind|     n     |   SH  (immediate shift: kind 2 bits, n 4 bits)
+-----------+--------+--------+-----+-----------+
```

- Immediates and offsets are **sign-extended** (imm9: −256 to 255; imm6: −32 to 31; off8: −128 to 127; off12: −2048 to 2047).
- **LUI** places imm9 in the upper nine bits (`rd = imm9 << 7`). Following it with `ORI rd, lo7` (0–127) supplies the low seven bits, constructing any 16-bit constant. The assembler expands `LA rd, value` into these two instructions.
- Branch and JAL targets are **PC + 1 + offset**, relative to the next instruction.
- The circuit's FIELDS module uses the opcode to select read-port register numbers: two-operand immediate instructions use a = rd; ST uses b = rd (the value to store); otherwise a = rs1 and b = rs2. JAL's destination is fixed at r7.

| op | Instruction | Operation | Profile |
| --- | --- | --- | --- |
| 0 | System (funct) | §4 | Various |
| 1 | ADD SUB AND OR XOR SHL SHR SRA (funct 0–7) | rd = rs1 op rs2 | core |
| 2 | ADDI rd, imm9 | rd = rd + imm | core |
| 3 | ANDI rd, imm9 | rd = rd & imm | core |
| 4 | ORI rd, imm9 | rd = rd \| imm | core |
| 5 | XORI rd, imm9 | rd = rd ^ imm | core |
| 6 | CMPI rd, imm9 | Set flags for rd − imm; discard result | core |
| 7 | LI rd, imm9 | rd = imm | core |
| 8 | LUI rd, imm9 | rd = imm9 << 7 | core |
| 9 | LD rd, [rs1+imm6] | rd = M[rs1 + imm] | mem |
| A | ST rd, [rs1+imm6] | M[rs1 + imm] = rd | mem |
| B | Jcc off8 | If condition holds, PC = PC + 1 + off | core |
| C | JAL off12 | r7 = PC + 1; PC = PC + 1 + off | call |
| D | JALR rd, rs1, imm6 | t = rs1 + imm; rd = PC + 1; PC = t | call |
| E | SHLI SHRI SRAI rd, rs1, n | rd = shifted rs1 (n = 0–15) | core |
| F | CSRR CSRW TLBW (funct 0–2) | §6, §7 | system / full |

### ALU operations and flags

| Operation | Result | C | V |
| --- | --- | --- | --- |
| ADD (ADDI) | a + b | Carry beyond 16 bits | Signed overflow |
| SUB (CMP, CMPI) | a − b | Borrow (1 if unsigned a < b) | Signed overflow |
| AND OR XOR (ANDI ORI XORI) | Bitwise operation | 0 | 0 |
| SHL SHR SRA (SHLI SHRI SRAI) | Shift by b (or n) bits | Last bit shifted out | 0 |

- Z is 1 when the result is zero; N is result bit 15. **All arithmetic and logic instructions update flags.** LI, LUI, LD, ST, branches, JAL, JALR, and CSR instructions do not.
- Register-form shifts use the low four bits of rs2 as the shift count. SRA replicates the sign bit.

### Conditional branches (op = B, cond = bits 11:8)

| cond | Instruction | Condition | Meaning after CMP a, b |
| --- | --- | --- | --- |
| 0 | JMP | Always | |
| 1 | JZ (JEQ) | Z | a = b |
| 2 | JNZ (JNE) | ¬Z | a ≠ b |
| 3 | JC (JB) | C | a < b (unsigned) |
| 4 | JNC (JAE) | ¬C | a ≥ b (unsigned) |
| 5 | JN | N | Negative result |
| 6 | JNN | ¬N | |
| 7 | JV | V | Overflow |
| 8 | JNV | ¬V | |
| 9 | JLT | N ≠ V | a < b (signed) |
| 10 | JGE | N = V | a ≥ b (signed) |
| 11 | JGT | ¬Z ∧ N = V | a > b (signed) |
| 12 | JLE | Z ∨ N ≠ V | a ≤ b (signed) |
| 13 | JA | ¬C ∧ ¬Z | a > b (unsigned) |
| 14 | JBE | C ∨ Z | a ≤ b (unsigned) |

## 3. Profiles (features available by stage)

In FT16, a profile names the combination of instructions and features supported by a stage’s CPU. For example, mem adds memory access with LD/ST and related features to core’s arithmetic and branches. Each row below includes the features of the rows above it.

| Profile | Added features | Stages |
| --- | --- | --- |
| core | ALU operations, immediates, LUI, shifts, conditional branches, HALT | 1 |
| mem | LD / ST, FENCEI | 2 |
| call | JAL / JALR | 3 |
| mmio | Memory-mapped I/O, without interrupts | 6a 6b 7 |
| system | Interrupts, CSRR CSRW, EI DI RETI | 4 5 |
| full | SYSCALL, TLBW, user mode, TLBs, exceptions | 8 9 |

Instructions unavailable in a profile execute as NOP outside `full`; in `full`, illegal instructions raise an exception.

## 4. System instructions (op = 0)

When the CPU accepts an interrupt or exception, it saves the return instruction address in EPC. STATUS holds the current interrupt enable and privilege mode; ESTAT saves the previous STATUS and flags.

| funct | Instruction | Operation | Privileged |
| --- | --- | --- | --- |
| 0 | NOP | No effect (word 0x0000) | |
| 1 | HALT | Halt; if interrupts are enabled, an interrupt resumes execution (wait for interrupt) | ✓ |
| 2 | EI | Enable interrupts | ✓ |
| 3 | DI | Disable interrupts | ✓ |
| 4 | RETI | Return from an interrupt or exception: PC ← EPC; restore STATUS and flags from ESTAT | ✓ |
| 5 | SYSCALL | System-call exception (EPC = next instruction) | |
| 6 | FENCEI | Make previous stores visible to subsequent instruction fetches | |

**Modifying instructions and FENCEI**: instructions share memory with data and can be modified by ST. However, a modified instruction may not be fetched immediately: the instruction cache does not observe stores, and the pipeline may already have fetched younger instructions. FENCEI makes earlier modifications visible to subsequent instruction fetches. In stages 7 and 9, it invalidates the instruction cache; in pipelines, it discards and refetches younger instructions.

## 5. Memory map and I/O

A memory map shows which addresses select RAM or particular device functions. I/O means input and output, such as reading switches or driving LEDs. FT16 assigns addresses to devices so the same LD/ST instructions used for memory can read and write device values (memory-mapped I/O).

RAM holds **16 bits (one word) per address**. Instructions are also 16 bits, so each instruction occupies one address; increasing the address by one selects the next word.

| Address | Meaning |
| --- | --- |
| 0x0000 | Reset entry |
| 0x0001 | Trap entry (trap vector) |
| 0x0000–0x01FF | RAM: 512 × 16-bit words for instructions and data |
| 0x0200–0xFFEF | Unmapped (reads return zero; writes ignored) |
| 0xFFF0 | LEDs (display the low eight bits; reads return the current value) |
| 0xFFF1 | Switches (eight bits) |
| 0xFFF2 | TIMER_PERIOD: set the period and reset the count to zero (zero stops the timer) |
| 0xFFF3 | TIMER_STATUS: bit 0 = pending interrupt request; writing clears the request |

Because r0 is always zero, addresses 0x0000–0x001F and the high-address range containing I/O (0xFFE0–0xFFFF) can be accessed directly with `[r0+n]` (for example, `ST r1, [r0+LED]`, `.equ LED, 0xFFF0`). The timer **counts once every four clocks** and requests an interrupt on reaching its period. It does not count on a clock that writes the period. If acknowledgment and a new request coincide, the new request takes priority.

## 6. Traps (interrupts and exceptions) and CSRs

A trap interrupts normal instruction execution and transfers control to a handler. Interrupts respond to requests from devices; exceptions arise from instruction execution, including faults and system calls. CSRs (control and status registers) are dedicated registers that hold the cause and the state needed to return.

| Number | CSR | Meaning |
| --- | --- | --- |
| 0 | STATUS | bit 0 IE (interrupt enable), bit 1 KERNEL (writable only in full; otherwise always 1) |
| 1 | ESTAT | Pre-trap bit 0 IE, bit 1 KERNEL, bits 2–5 flags Z C N V |
| 2 | EPC | Return address |
| 3 | CAUSE | Trap cause (below) |
| 4 | BADVA | Virtual address causing a TLB miss or protection fault |
| 5 | SCRATCH | OS scratch storage |

`CSRR rd, csr` / `CSRW csr, rs1` (csr = bits 5:3).

| CAUSE | Cause | EPC |
| --- | --- | --- |
| 1 | Timer interrupt | Next instruction not yet executed |
| 2 | System call | Instruction after SYSCALL |
| 3 | Illegal or privileged instruction | Faulting instruction |
| 4 | Instruction TLB miss | Faulting instruction |
| 5 | Data TLB miss | Faulting instruction |
| 6 | Write-protection fault | Faulting instruction |
| 7 | Execute-protection fault (W^X) | Faulting instruction |

On a trap: ESTAT ← {IE, KERNEL, Z, C, N, V}; IE ← 0; enter kernel mode; set EPC, CAUSE (and BADVA where applicable); **PC ← 0x0001**. A faulting instruction leaves no changes in registers, memory, or flags (precise exceptions). Interrupts are accepted between instructions. Priority: interrupt > instruction TLB miss > execute protection > illegal instruction > system call > data TLB miss > write protection.

## 7. Privilege modes and address translation (full)

Privilege modes distinguish kernel mode, where the OS manages the CPU, from user mode, where applications run with restrictions. In user mode, virtual addresses used by a program are translated into physical addresses that select actual memory locations. A TLB (Translation Lookaside Buffer) is a small table holding these mappings and access permissions.

- Kernel mode bypasses translation: virtual address = physical address.
- User mode translates both instruction-fetch and data-access addresses through TLBs. **Pages contain 32 words** (the upper 11 address bits are the page number; the lower five are the page offset).
- Instruction and data TLBs each have four fully associative entries. Hardware does not walk a page table; the kernel fills misses (software-managed TLB, as in MIPS).
- Entries include **W (write) and X (execute)** permissions. ST to a page without W in the data TLB causes a write-protection fault; fetching from a page without X in the instruction TLB causes an execute-protection fault. The OS maps code as executable and not writable, and data as writable and not executable (W^X).
- I/O addresses are translated as data addresses too, so user programs cannot access I/O unless the OS maps its page.

`TLBW rs1, rs2` combines a page-start address with metadata in the low five bits:

```text
rs1: virtual page start  | bit 4: 1 = instruction TLB / 0 = data TLB | bits 1:0 = entry index
rs2: physical page start | bit 2 = X (execute) | bit 1 = W (write) | bit 0 = V (valid)
```

The mini OS uses the same format as rs2 for page-table entries (PTEs).

## 8. Function calling convention

Calling a function transfers execution to another sequence of instructions, then returns to the instruction after the call. Values passed into the function are arguments; the result it sends back is a return value.

The caller and the function share r0–r7, so the function’s work can overwrite values belonging to the caller. A calling convention agrees where arguments and return values go, and who saves values that must survive a call.

This example adds 7 and 5 using a function. LI puts a number in a register; add_values is a name (label) for the address where the function starts. The caller places arguments in r1 and r2, and the function returns its result in r1.

```asm
    LI r1, 7          ; Put 7 in r1 (argument 1)
    LI r2, 5          ; Put 5 in r2 (argument 2)
    JAL add_values    ; Save the return address in r7; jump to the function
    HALT              ; Stop here after the function returns
add_values:           ; Function entry
    ADD r1, r1, r2    ; Add r1 and r2; put the result, 12, in r1
    RET               ; Return to the address in r7 (HALT)
```

Execution proceeds through the two LI instructions → JAL → ADD inside the function → RET → HALT in the caller. JAL runs the function before reaching HALT. When it returns, r1 holds the result, 12.

If the caller still needs the original values of r1–r3, it saves them in memory before the call and restores them afterward. A function must preserve the original values of r4 and r5, so if it uses them, that function saves and restores them. These rules let both sides reuse registers while retaining the values they need.


| Register | Role | Across a call |
| --- | --- | --- |
| r0 | Always zero | — |
| r1–r3 | Arguments (r1, r2, r3), return value (r1), temporary values | May be overwritten; caller saves and restores values it needs |
| r4, r5 | Temporary values | Original values preserved; callee saves and restores if used |
| r6 (SP) | Stack pointer; stack grows toward smaller addresses; SP points to the last word pushed | Preserved |
| r7 (LR) | Return address saved by JAL | Overwritten by JAL; save and restore it when making another call |

- Call: `JAL function` (return address → r7). Indirect call: `CALLR rN` (= `JALR r7, rN, 0`). Return: `RET` (= `JALR r0, r7, 0`).
- There are no dedicated push/pop instructions. Move SP and access memory with instructions such as `ADDI r6, -2` / `ST r7, [r6+1]` / `ST r1, [r6]` (ADDI also changes flags).
- A function that makes no further calls (a leaf function) can leave r7 intact and return with RET.

## 9. Stage 0: the TD4 instruction set

Stage 0 is the same TD4 as the main simulator, using a separate ISA from FT16: 4-bit data; A, B, OUT, and PC registers; carry C; a 16-byte ROM; and 12 instructions. Each one-byte instruction has a four-bit opcode and four-bit immediate. The opcode's upper two bits select the destination (A, B, OUT, PC); its lower two normally select the MUX source (A, B, input, zero). When the destination is PC, MUX always selects zero. ALU only adds the selected value and immediate, recording carry in C on every clock. A jump writes PC; JNC jumps only if C = 0. Instruction meanings match the main TD4 simulator.

| Instruction | Encoding | Instruction | Encoding |
| --- | --- | --- | --- |
| ADD A, im | 0000 im | MOV B, im | 0111 im |
| MOV A, B | 0001 0000 | IN A | 0010 0000 |
| MOV A, im | 0011 im | IN B | 0110 0000 |
| MOV B, A | 0100 0000 | OUT B | 1001 0000 |
| ADD B, im | 0101 im | OUT im | 1011 im |
| JNC im | 1110 im | JMP im | 1111 im |

## 10. Assembler

An assembler converts instructions written with names such as ADD into the bit patterns executed by the CPU. Labels name addresses; the assembler resolves them into addresses or relative branch offsets. The following describes the supported syntax and shorthand.

```text
label:  INSTR operands   ; comment
.org  phys[, virt]       ; place at physical address phys; labels use virt; branches are PC-relative
.word 1, 0x2A, 'c', "text", label
.fill n[, value]
.equ  NAME, value
```

- Values support decimal, `0x`, `0b`, characters such as `'a'`, and addition/subtraction of names (`arr+7`). High 16-bit values such as 0xFF00–0xFFFF are treated as negative in signed immediates and offsets (`LI r1, 0xFFF0` = `LI r1, -16`).
- Registers are `r0`–`r7`, with aliases `sp` (r6) and `lr` (r7). Memory operands include `[r1]`, `[r1+3]`, `[r1-1]`, and `[n]` (= `[r0+n]`). CSRs can use names such as `EPC`.
- Two-operand shorthand: `ADD r1, r2` = `ADD r1, r1, r2`; `SHLI r1, 1` = `SHLI r1, r1, 1`.
- Aliases (pseudoinstructions): `MOV rd, rs` (= `ADD rd, rs, r0`, also changes flags), `CMP a, b` (= `SUB r0, a, b`), `NEG rd, rs`, `NOT rd` (= `XORI rd, -1`), `JR rs[, imm]`, `CALLR rs`, `RET`, `LA rd, value` (two words: LUI + ORI), and branch aliases `JEQ JNE JB JAE JMI JPL`. There is no PUSH / POP (§8).
