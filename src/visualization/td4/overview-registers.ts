/** English role labels for the whole-CPU block diagram in both locales. */
export const overviewRegisters: Partial<Record<string, { title: string; description: string }>> = {
  A: {
    title: 'REGISTER A · 4 bit',
    description: 'Captures a 4-bit value on the clock when writing is enabled, and holds it until the next update.',
  },
  B: {
    title: 'REGISTER B · 4 bit',
    description: 'Captures a 4-bit value on the clock when writing is enabled, and holds it until the next update.',
  },
  PC: {
    title: 'PROGRAM COUNTER PC · 4 bit',
    description: 'A register that stores the instruction address. It captures the next address on the clock and holds it until the next update.',
  },
  R: {
    title: 'OUTPUT REGISTER · 4 bit',
    description: 'Captures the output value on the clock when writing is enabled, and holds it on OUTPUT until the next update.',
  },
  CF: {
    title: 'CARRY FLAG C',
    description: 'A 1-bit register that captures the ALU carry on the clock and holds it until the next update. JNC uses this flag to decide whether to jump.',
  },
};
