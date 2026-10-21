import type { ProgramLine } from '../instructions';
export interface Program {
  id: string;
  title: { ja: string; en: string };
  description: { ja: string; en: string };
  lines: readonly ProgramLine[];
  pseudocode: string;
  source?: string;
}
