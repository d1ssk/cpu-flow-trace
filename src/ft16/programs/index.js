import { basicPrograms } from './basic.js';
import { osPrograms } from './os.js';
import { td4Programs } from '../td4/programs.js';

export const allPrograms = [...td4Programs, ...basicPrograms, ...osPrograms];
