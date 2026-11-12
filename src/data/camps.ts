import type { CampDef } from '../sim/types';
import { CONFIG } from './config';
const H = CONFIG.map.h;
/** Neutral camps. Two per side of the river, mirrored. */
export const CAMPS: CampDef[] = [
  { x: 470, y: 1245, units: ['nImp', 'nImp', 'nImp'] },
  { x: 735, y: 1215, units: ['nBrute', 'nSeer'] },
  { x: 470, y: H - 1245, units: ['nImp', 'nImp', 'nImp'] },
  { x: 735, y: H - 1215, units: ['nBrute', 'nSeer'] },
];
