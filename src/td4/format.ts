  export const hex=(n: number)=>n.toString(16).toUpperCase().padStart(2,'0');
  export const binary=(n: number,width: number)=>n.toString(2).padStart(width,'0');
  export function disassemble(byte: number) {
    const im=byte&15;
    const names: Record<number,string>={0:`ADD A,${im}`,1:'MOV A,B',2:'IN A',3:`MOV A,${im}`,4:'MOV B,A',5:`ADD B,${im}`,6:'IN B',7:`MOV B,${im}`,9:'OUT B',11:`OUT ${im}`,14:`JNC ${im}`,15:`JMP ${im}`};
    const opcode=byte>>4;
    // The hardware still adds the immediate field for MOV/IN/OUT B.
    return (names[opcode]??`OP ${hex(byte)}`)+([1,2,4,6,9].includes(opcode)&&im?` (+${im})`:'');
  }
