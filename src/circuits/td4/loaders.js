// Node loads native JSON modules; Vite serves them as JavaScript in the browser.
const jsonOptions = typeof window === 'undefined' ? {with: {type: 'json'}} : undefined;

// Explicit imports let Vite split each precomputed circuit into a lazy chunk.
export default {
  'ALU-module': () => import('./generated/ALU-module.json', jsonOptions),
  'ALU-nand': () => import('./generated/ALU-nand.json', jsonOptions),
  'ALU-mos': () => import('./generated/ALU-mos.json', jsonOptions),
  'CF-module': () => import('./generated/CF-module.json', jsonOptions),
  'CF-nand': () => import('./generated/CF-nand.json', jsonOptions),
  'CF-mos': () => import('./generated/CF-mos.json', jsonOptions),
  'A-module': () => import('./generated/A-module.json', jsonOptions),
  'A-nand': () => import('./generated/A-nand.json', jsonOptions),
  'A-mos': () => import('./generated/A-mos.json', jsonOptions),
  'B-module': () => import('./generated/B-module.json', jsonOptions),
  'B-nand': () => import('./generated/B-nand.json', jsonOptions),
  'B-mos': () => import('./generated/B-mos.json', jsonOptions),
  'PC-module': () => import('./generated/PC-module.json', jsonOptions),
  'PC-nand': () => import('./generated/PC-nand.json', jsonOptions),
  'PC-mos': () => import('./generated/PC-mos.json', jsonOptions),
  'R-module': () => import('./generated/R-module.json', jsonOptions),
  'R-nand': () => import('./generated/R-nand.json', jsonOptions),
  'R-mos': () => import('./generated/R-mos.json', jsonOptions),
  'MUX-module': () => import('./generated/MUX-module.json', jsonOptions),
  'MUX-nand': () => import('./generated/MUX-nand.json', jsonOptions),
  'MUX-mos': () => import('./generated/MUX-mos.json', jsonOptions),
  'DEC-module': () => import('./generated/DEC-module.json', jsonOptions),
  'DEC-nand': () => import('./generated/DEC-nand.json', jsonOptions),
  'DEC-mos': () => import('./generated/DEC-mos.json', jsonOptions),
  'NEXT-module': () => import('./generated/NEXT-module.json', jsonOptions),
  'NEXT-nand': () => import('./generated/NEXT-nand.json', jsonOptions),
  'NEXT-mos': () => import('./generated/NEXT-mos.json', jsonOptions),
};
