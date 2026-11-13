/**
 * All art is drawn in code with Canvas2D (no image files). The same painters feed
 * PixiJS textures (units, ground) and DOM canvases (cards, portraits, icons).
 * Direction: chunky toy-diorama pieces, thick ink outlines, frost blue versus ember orange.
 */
import { CONFIG as C } from '../data/config';
import { CAMPS } from '../data/camps';
import { RNG } from '../sim/rng';

export const INK = '#1d1626';
export const PAL = [
  { main: '#3d9bff', dark: '#1b4f9e', light: '#c4e4ff', glow: '#7cc4ff', name: 'Frost' },
  { main: '#ff7a2f', dark: '#9c3410', light: '#ffd9b0', glow: '#ffae6b', name: 'Ember' },
  { main: '#9aa864', dark: '#4a5530', light: '#e4e8c0', glow: '#d8e08a', name: 'Wild' },
];
type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): HTMLCanvasElement { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; }

// ------------------------------------------------------------------ primitives (unit space: 1 = token radius)
class P {
  constructor(public c: Ctx, public lw = 0.16) { c.lineJoin = 'round'; c.lineCap = 'round'; }
  private fs(fill: string | null, stroke = true) { const c = this.c; if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = INK; c.lineWidth = this.lw; c.stroke(); } }
  ell(x: number, y: number, rx: number, ry: number, fill: string | null, stroke = true) { this.c.beginPath(); this.c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); this.fs(fill, stroke); return this; }
  circ(x: number, y: number, r: number, fill: string | null, stroke = true) { return this.ell(x, y, r, r, fill, stroke); }
  poly(pts: number[], fill: string | null, stroke = true) { const c = this.c; c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); this.fs(fill, stroke); return this; }
  rr(x: number, y: number, w: number, h: number, r: number, fill: string | null, stroke = true) { const c = this.c; c.beginPath(); c.roundRect(x, y, w, h, r); this.fs(fill, stroke); return this; }
  line(x1: number, y1: number, x2: number, y2: number, w: number, col: string) { const c = this.c; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = INK; c.lineWidth = w + this.lw * 1.6; c.stroke(); c.strokeStyle = col; c.lineWidth = w; c.stroke(); return this; }
  /** pawn body: bell shape from the base up to shoulder height */
  body(w: number, h: number, fill: string, y0 = 0.1) { const c = this.c; c.beginPath(); c.moveTo(-w, y0); c.quadraticCurveTo(-w * 1.05, -h * 0.7, -w * 0.55, -h); c.lineTo(w * 0.55, -h); c.quadraticCurveTo(w * 1.05, -h * 0.7, w, y0); c.quadraticCurveTo(0, y0 + 0.28, -w, y0); c.closePath(); this.fs(fill); return this; }
  eyes(y: number, dx = 0.17, r = 0.07) { this.circ(-dx, y, r, INK, false); this.circ(dx, y, r, INK, false); return this; }
  shine(x: number, y: number, r: number) { this.c.globalAlpha = 0.5; this.ell(x, y, r, r * 0.6, '#ffffff', false); this.c.globalAlpha = 1; return this; }
}

const STONE = '#a39c8f', STONE_D = '#655f6b', WOOD = '#7d5430', WOOD_D = '#4f331c', STEEL = '#b9c0cc', GOLD = '#e8b93a', SKIN = '#d9b08c', BONE = '#d8d2bc';

type Painter = (p: P, t: typeof PAL[0]) => void;
/** Painters draw the figure standing on (0,0). Height ~2 units for troops. */
const FIG: Record<string, Painter> = {
  creepM: (p, t) => { p.body(0.62, 1.05, t.main).circ(0, -1.32, 0.42, t.light).eyes(-1.3).line(0.62, -0.2, 0.9, -1.1, 0.13, STEEL); },
  creepR: (p, t) => { p.body(0.55, 1.0, t.light).circ(0, -1.28, 0.4, t.main).eyes(-1.26).line(-0.75, -0.3, -0.75, -1.3, 0.1, WOOD); p.poly([0, -1.62, -0.42, -1.45, 0.42, -1.45], t.dark); },
  pike: (p, t) => { p.body(0.58, 1.0, t.main).circ(0, -1.28, 0.4, SKIN).eyes(-1.26).line(0.7, 0.1, 0.7, -2.0, 0.09, WOOD); p.poly([0.7, -2.35, 0.55, -1.95, 0.85, -1.95], STEEL); p.poly([-0.42, -1.4, 0, -1.85, 0.42, -1.4], t.dark); },
  sling: (p, t) => { p.body(0.52, 0.95, t.light).circ(0, -1.22, 0.38, SKIN).eyes(-1.2); p.rr(-0.45, -1.62, 0.9, 0.26, 0.1, t.main); p.line(0.6, -0.5, 1.0, -1.15, 0.07, WOOD_D).circ(1.02, -1.2, 0.16, STONE); },
  shield: (p, t) => { p.body(0.75, 1.15, STEEL).circ(0, -1.42, 0.42, STEEL).rr(-0.3, -1.5, 0.6, 0.14, 0.05, INK, false); p.poly([-0.75, -1.05, 0.15, -1.05, 0.15, -0.3, -0.3, 0.12, -0.75, -0.3], t.main).circ(-0.3, -0.55, 0.14, GOLD); },
  rat: (p, t) => { p.ell(0, -0.42, 0.85, 0.55, '#8d8799').circ(0.62, -0.72, 0.36, '#a9a3b5').circ(0.5, -1.05, 0.17, t.main).circ(0.85, -0.98, 0.17, t.main).circ(0.78, -0.72, 0.07, INK, false); p.line(-0.8, -0.4, -1.2, -0.9, 0.07, '#e6a3b0'); },
  hound: (p, t) => { p.ell(0, -0.6, 0.95, 0.55, '#5a3a3a').circ(0.75, -1.0, 0.42, '#6e4646').poly([0.5, -1.3, 0.62, -1.8, 0.85, -1.35], t.main).poly([0.9, -1.3, 1.1, -1.75, 1.15, -1.2], t.main); p.circ(0.9, -1.02, 0.08, GOLD, false).poly([-0.9, -0.8, -1.3, -1.4, -0.6, -1.0], t.main); },
  bomb: (p, t) => { p.body(0.62, 1.0, t.dark).circ(0, -1.28, 0.4, SKIN).eyes(-1.26).rr(-0.44, -1.7, 0.88, 0.3, 0.12, t.main); p.circ(0.75, -0.7, 0.36, '#3a3344').line(0.9, -1.0, 1.05, -1.3, 0.06, WOOD).circ(1.08, -1.36, 0.1, GOLD, false); },
  lancer: (p, t) => { p.ell(0, -0.55, 1.0, 0.6, '#8a5a3c').circ(0.85, -0.75, 0.36, '#9c6a48').poly([1.1, -0.6, 1.4, -0.75, 1.1, -0.85], BONE); p.body(0.42, 0.95, t.main, -0.8).circ(0, -2.0, 0.34, SKIN).eyes(-1.98, 0.14, 0.06); p.line(0.3, -1.3, 1.55, -1.75, 0.1, WOOD).poly([1.5, -1.9, 1.95, -1.9, 1.6, -1.6], STEEL); },
  wisp: (p, t) => { p.c.globalAlpha = 0.35; p.circ(0, -1.05, 0.85, t.glow, false); p.c.globalAlpha = 1; p.poly([0, -1.95, 0.55, -1.1, 0, -0.35, -0.55, -1.1], '#dff4ff').circ(0, -1.12, 0.26, t.main).shine(-0.15, -1.45, 0.14); },
  golem: (p, t) => { p.body(0.95, 1.35, STONE_D).rr(-0.62, -1.95, 1.24, 0.8, 0.22, STONE).rr(-0.35, -1.68, 0.7, 0.2, 0.06, t.glow).circ(-1.05, -0.75, 0.42, STONE).circ(1.05, -0.75, 0.42, STONE).rr(-0.3, -0.85, 0.6, 0.5, 0.1, t.main); },
  duelist: (p, t) => { p.body(0.55, 1.1, t.dark).circ(0, -1.4, 0.4, SKIN).eyes(-1.38).poly([-0.5, -1.55, 0, -2.05, 0.75, -1.6], t.main); p.line(0.6, -0.3, 1.3, -1.5, 0.1, STEEL).line(-0.6, -0.3, -1.25, -1.4, 0.1, STEEL); },
  hexer: (p, t) => { p.body(0.65, 1.1, '#5b3f7d').circ(0, -1.35, 0.4, '#d9c8ee').eyes(-1.32).poly([-0.6, -1.5, 0.05, -2.45, 0.6, -1.5], t.main); p.line(0.85, 0.1, 0.85, -1.7, 0.09, WOOD_D).circ(0.85, -1.9, 0.22, t.glow); },
  ram: (p, t) => { p.rr(-1.0, -1.0, 2.0, 0.85, 0.2, WOOD).rr(-0.8, -1.5, 1.6, 0.55, 0.15, t.main).circ(-0.6, -0.1, 0.3, WOOD_D).circ(0.6, -0.1, 0.3, WOOD_D).rr(0.75, -0.95, 0.75, 0.5, 0.12, STEEL); },
  colossus: (p, t) => { p.body(1.05, 1.5, STONE).rr(-0.55, -2.2, 1.1, 0.8, 0.2, STONE_D).rr(-0.32, -1.95, 0.64, 0.18, 0.05, GOLD).circ(-1.15, -1.0, 0.5, STONE_D).circ(1.15, -1.0, 0.5, STONE_D).poly([-0.4, -0.2, 0, -1.0, 0.4, -0.2], t.main).circ(0, -1.25, 0.18, t.glow); },
  sharp: (p, t) => { p.body(0.5, 1.05, t.dark).circ(0, -1.32, 0.38, SKIN).circ(0.14, -1.3, 0.07, INK, false).poly([-0.55, -1.42, 0.2, -1.8, 0.7, -1.42], t.main); p.line(-0.5, -0.75, 1.5, -1.05, 0.11, '#3a3344').line(1.2, -1.0, 1.75, -1.08, 0.06, STEEL); },
  medic: (p, t) => { p.body(0.6, 1.05, '#f4f4f0').circ(0, -1.3, 0.4, SKIN).eyes(-1.28).rr(-0.42, -1.72, 0.84, 0.28, 0.1, t.main); p.rr(-0.1, -0.85, 0.2, 0.6, 0.03, '#e0564a', false).rr(-0.3, -0.65, 0.6, 0.2, 0.03, '#e0564a', false); },
  sapling: (p, t) => { p.body(0.5, 0.9, '#8a6a3c').circ(0, -1.25, 0.55, '#7bd05a').circ(-0.4, -1.0, 0.3, '#5fae45').circ(0.42, -1.05, 0.3, '#5fae45').eyes(-0.6, 0.15, 0.06).circ(0, -1.65, 0.14, t.main); },
  elder: (p, t) => { p.body(0.9, 1.4, '#7a5a34').circ(0, -1.9, 0.8, '#6fc24f').circ(-0.7, -1.5, 0.45, '#58a53f').circ(0.7, -1.5, 0.45, '#58a53f').eyes(-0.9, 0.22, 0.09).rr(-0.25, -0.6, 0.5, 0.12, 0.04, INK, false).circ(0, -2.4, 0.2, t.main); },
  imp: (p) => { p.body(0.55, 0.9, '#7c9a4a').circ(0, -1.15, 0.42, '#9cbb5c').eyes(-1.12).poly([-0.4, -1.35, -0.7, -1.8, -0.2, -1.5], BONE).poly([0.4, -1.35, 0.7, -1.8, 0.2, -1.5], BONE); },
  brute: (p) => { p.body(0.95, 1.3, '#6a7d4a').circ(0, -1.55, 0.5, '#8aa05a').eyes(-1.52, 0.2, 0.08).poly([-0.25, -1.3, -0.15, -1.05, -0.05, -1.3], BONE).poly([0.25, -1.3, 0.15, -1.05, 0.05, -1.3], BONE).line(0.95, -0.2, 1.35, -1.6, 0.22, WOOD_D); },
  seer: (p) => { p.body(0.55, 1.05, '#4d6a6a').circ(0, -1.3, 0.4, '#a8d0c0').circ(0, -1.3, 0.16, GOLD).circ(0, -1.3, 0.06, INK, false).poly([-0.5, -1.5, 0, -2.1, 0.5, -1.5], '#35504f').line(-0.8, 0.1, -0.8, -1.6, 0.08, BONE); },
  boss: (p) => { p.ell(0, -0.7, 1.05, 0.85, '#5d3b5e').ell(0, -0.45, 0.72, 0.45, '#2a1830').poly([-0.6, -0.6, -0.48, -0.25, -0.36, -0.6], BONE).poly([-0.12, -0.6, 0, -0.2, 0.12, -0.6], BONE).poly([0.36, -0.6, 0.48, -0.25, 0.6, -0.6], BONE); p.circ(-0.42, -1.05, 0.17, GOLD).circ(0.42, -1.05, 0.17, GOLD).circ(-0.42, -1.05, 0.06, INK, false).circ(0.42, -1.05, 0.06, INK, false); p.poly([-0.8, -1.2, -1.25, -1.9, -0.45, -1.45], BONE).poly([0.8, -1.2, 1.25, -1.9, 0.45, -1.45], BONE); },
  // structures (unit = structure radius)
  tower: (p, t) => { p.rr(-0.85, -0.5, 1.7, 0.75, 0.12, STONE_D).rr(-0.62, -2.0, 1.24, 1.7, 0.1, STONE).rr(-0.82, -2.35, 1.64, 0.5, 0.08, STONE); for (let i = -1; i <= 1; i++) p.rr(i * 0.56 - 0.2, -2.62, 0.4, 0.34, 0.04, STONE); p.poly([-0.3, -0.5, -0.3, -1.1, 0, -1.3, 0.3, -1.1, 0.3, -0.5], t.dark).rr(-0.9, -1.75, 1.8, 0.22, 0.05, t.main).circ(0, -3.0, 0.28, t.glow); },
  tower2: (p, t) => { p.rr(-0.95, -0.5, 1.9, 0.75, 0.12, STONE_D).rr(-0.7, -2.2, 1.4, 1.9, 0.1, STONE).rr(-0.9, -2.55, 1.8, 0.5, 0.08, STONE); p.poly([-0.95, -2.55, 0, -3.6, 0.95, -2.55], t.main).poly([-0.3, -0.5, -0.3, -1.1, 0, -1.3, 0.3, -1.1, 0.3, -0.5], t.dark).rr(-0.98, -1.9, 1.96, 0.22, 0.05, t.main).circ(0, -3.75, 0.24, GOLD); },
  barracks: (p, t) => { p.rr(-0.95, -1.05, 1.9, 1.25, 0.1, WOOD).poly([-1.15, -1.0, 0, -2.0, 1.15, -1.0], t.main).poly([-0.28, 0.2, -0.28, -0.55, 0, -0.75, 0.28, -0.55, 0.28, 0.2], INK, false).line(0.75, -1.4, 0.75, -2.5, 0.06, WOOD_D).poly([0.75, -2.5, 1.3, -2.3, 0.75, -2.1], t.light); },
  ancient: (p, t) => { p.ell(0, 0, 1.0, 0.55, STONE_D).ell(0, -0.2, 0.8, 0.42, STONE); p.poly([0, -2.5, 0.62, -1.5, 0.35, -0.3, -0.35, -0.3, -0.62, -1.5], t.main).poly([0, -2.5, 0.62, -1.5, 0, -1.25], t.light).poly([0, -1.25, 0.62, -1.5, 0.35, -0.3], t.dark, true); p.c.globalAlpha = 0.25; p.circ(0, -1.4, 1.15, t.glow, false); p.c.globalAlpha = 1; p.shine(-0.18, -1.85, 0.14); },
  turret: (p, t) => { p.rr(-0.8, -0.6, 1.6, 0.8, 0.14, WOOD).rr(-0.6, -1.3, 1.2, 0.8, 0.12, t.main).line(0, -1.0, 0, -2.0, 0.26, '#3a3344').circ(0, -0.95, 0.26, STEEL); },
  camp: (p, t) => { p.poly([-1.0, 0.15, 0, -1.9, 1.0, 0.15], t.main).poly([-0.3, 0.15, 0, -0.8, 0.3, 0.15], INK, false).line(0, -1.9, 0, -2.5, 0.06, WOOD_D).poly([0, -2.5, 0.5, -2.32, 0, -2.14], t.light).poly([-1.0, 0.15, -0.55, -0.75, -0.35, 0.15], t.dark); },
  wall: (p, t) => { for (let i = -1; i <= 1; i++) { p.rr(i * 0.6 - 0.27, -1.5, 0.54, 1.7, 0.08, WOOD); p.poly([i * 0.6 - 0.27, -1.5, i * 0.6, -1.95, i * 0.6 + 0.27, -1.5], WOOD); } p.rr(-0.95, -0.9, 1.9, 0.25, 0.05, t.main); },
  mortar: (p, t) => { p.ell(0, -0.1, 0.95, 0.5, WOOD_D).rr(-0.55, -1.1, 1.1, 1.0, 0.25, '#3a3344').ell(0, -1.1, 0.55, 0.26, INK, false).rr(-0.75, -0.6, 1.5, 0.22, 0.05, t.main); },
  totem: (p, t) => { p.rr(-0.4, -2.2, 0.8, 2.3, 0.14, '#3f3a4a').rr(-0.62, -1.9, 1.24, 0.5, 0.1, t.main).eyes(-1.65, 0.2, 0.09).rr(-0.5, -1.0, 1.0, 0.4, 0.1, t.dark).ell(0, 0.05, 0.9, 0.3, '#2a2530'); },
  // heroes (unit = hero radius, taller)
  brakka: (p, t) => { p.body(0.95, 1.5, t.dark).rr(-0.75, -1.2, 1.5, 0.3, 0.08, GOLD).circ(0, -1.9, 0.52, SKIN).eyes(-1.92, 0.2, 0.08).poly([-0.5, -1.72, 0, -1.3, 0.5, -1.72], '#b5552a').rr(-0.56, -2.5, 1.12, 0.42, 0.14, STEEL); p.line(1.1, 0.0, 1.1, -2.1, 0.14, WOOD).rr(0.7, -2.7, 0.9, 0.62, 0.1, STEEL); },
  sylphine: (p, t) => { p.body(0.7, 1.45, t.main).circ(0, -1.85, 0.46, SKIN).eyes(-1.85, 0.18, 0.07).poly([-0.65, -1.8, -0.1, -2.75, 0.6, -2.0, 0.2, -2.15], '#3f8f4f'); const c = p.c; c.beginPath(); c.arc(-0.75, -1.1, 1.0, Math.PI * 0.62, Math.PI * 1.38); c.strokeStyle = INK; c.lineWidth = 0.3; c.stroke(); c.strokeStyle = WOOD; c.lineWidth = 0.14; c.stroke(); p.line(-1.3, -1.1, 0.3, -1.1, 0.06, STEEL); },
  morvane: (p, t) => { p.body(0.85, 1.5, '#3a2a4a').poly([-0.3, 0.1, 0, -1.3, 0.3, 0.1], t.main).circ(0, -1.85, 0.45, '#e6d8c4').eyes(-1.83, 0.17, 0.07).poly([-0.7, -2.0, 0.15, -3.1, 0.7, -2.0], '#3a2a4a').rr(-0.72, -2.15, 1.44, 0.22, 0.06, t.main); p.line(1.05, 0.1, 1.05, -2.3, 0.1, WOOD_D).circ(1.05, -2.55, 0.3, '#ff9a3a'); },
  thessa: (p, t) => { p.body(0.8, 1.45, '#e9f6f6').poly([-0.8, 0.1, -0.5, -0.5, 0.5, -0.5, 0.8, 0.1], t.main).circ(0, -1.85, 0.45, SKIN).eyes(-1.83, 0.17, 0.07).poly([-0.55, -1.75, -0.6, -2.3, 0, -2.5, 0.6, -2.3, 0.55, -1.75, 0.3, -2.1, -0.3, -2.1], '#3fb0b0'); p.line(-1.0, 0.1, -1.0, -2.2, 0.09, BONE).circ(-1.0, -2.45, 0.26, '#7ce0e0').shine(-1.08, -2.52, 0.1); },
  kael: (p, t) => { p.body(0.7, 1.4, '#2c2838').poly([-0.7, -1.2, 0.7, -1.2, 0.3, -0.75, -0.3, -0.75], t.main).circ(0, -1.8, 0.45, '#2c2838').rr(-0.3, -1.9, 0.6, 0.18, 0.05, t.glow).poly([-0.5, -1.95, 0, -2.6, 0.5, -1.95], '#2c2838'); p.line(0.75, -0.4, 1.4, -1.5, 0.11, STEEL).line(-0.75, -0.4, -1.4, -1.5, 0.11, STEEL); },
  grum: (p, t) => { p.body(1.0, 1.5, '#7a5a34').circ(0, -1.95, 0.55, '#8f6c40').eyes(-1.95, 0.2, 0.08).poly([-0.3, -1.75, 0, -1.2, 0.3, -1.75], '#d9e8c0').circ(0, -2.55, 0.6, '#6fc24f').circ(-0.55, -2.25, 0.36, '#58a53f').circ(0.55, -2.25, 0.36, '#58a53f').rr(-0.8, -1.0, 1.6, 0.26, 0.08, t.main).circ(0, -0.87, 0.2, GOLD); },
};
export const HERO_ARTS = new Set(['brakka', 'sylphine', 'morvane', 'thessa', 'kael', 'grum']);
const FLAT = new Set(['tower', 'tower2', 'barracks', 'ancient', 'turret', 'camp', 'wall', 'mortar', 'totem']);

export interface TokenInfo { canvas: HTMLCanvasElement; ax: number; ay: number; scale: number }
const tokenCache = new Map<string, TokenInfo>();

/** Token sprite: team-coloured base disc plus figure. `ax/ay` is the anchor (base centre) in 0..1. */
export function unitToken(art: string, team: number, r: number, px = 2, white = false): TokenInfo {
  const key = `${art}|${team}|${r}|${px}|${white}`; const hit = tokenCache.get(key); if (hit) return hit;
  const hero = HERO_ARTS.has(art), flat = FLAT.has(art);
  const S = r * px; const up = art.startsWith('tower') || art === 'ancient' ? 4.1 : hero ? 3.5 : 2.9;
  const w = S * 4.4, h = S * (up + 1.0);
  const cv = makeCanvas(w, h); const c = cv.getContext('2d')!;
  c.translate(w / 2, S * up); c.scale(S, S);
  const t = PAL[team]; const p = new P(c, hero ? 0.075 : flat ? 0.06 : 0.1);
  if (!flat) { // team ring on the ground instead of a toy base
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.beginPath(); c.ellipse(0, 0.06, 1.0, 0.6, 0, 0, 7); c.fill();
    const rg = c.createRadialGradient(0, 0, 0.2, 0, 0, 1); rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(0.75, t.main + '55'); rg.addColorStop(1, t.main + 'ee');
    c.save(); c.scale(1, 0.6); c.fillStyle = rg; c.beginPath(); c.arc(0, 0, 0.95, 0, 7); c.fill(); c.restore();
    c.strokeStyle = t.light; c.lineWidth = 0.05; c.beginPath(); c.ellipse(0, 0, 0.93, 0.56, 0, 0, 7); c.stroke();
    if (hero) { c.strokeStyle = GOLD; c.lineWidth = 0.07; c.beginPath(); c.ellipse(0, 0, 1.02, 0.62, 0, 0, 7); c.stroke(); }
    c.translate(0, -0.1); c.scale(hero ? 0.78 : 0.8, hero ? 0.78 : 0.8);
  }
  // paint the figure on its own layer so it can be lit: key light from the upper left, shadow lower right, cool rim
  const fl = makeCanvas(w, h), fc = fl.getContext('2d')!; fc.setTransform(c.getTransform());
  (FIG[art] ?? FIG.creepM)(new P(fc, p.lw), t);
  fc.globalCompositeOperation = 'source-atop';
  const top = -(up - 0.3);
  const lg = fc.createLinearGradient(-1.2, top, 1.2, 0.3); lg.addColorStop(0, 'rgba(255,244,214,0.42)'); lg.addColorStop(0.4, 'rgba(255,255,255,0)'); lg.addColorStop(0.62, 'rgba(8,6,24,0.18)'); lg.addColorStop(1, 'rgba(6,4,20,0.62)');
  fc.fillStyle = lg; fc.fillRect(-3, top - 2, 6, up + 4);
  const ao = fc.createLinearGradient(0, -0.7, 0, 0.3); ao.addColorStop(0, 'rgba(0,0,0,0)'); ao.addColorStop(1, 'rgba(0,0,0,0.45)'); fc.fillStyle = ao; fc.fillRect(-3, -0.7, 6, 1.2);
  fc.globalCompositeOperation = 'source-over';
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = S * 0.14; c.shadowOffsetX = S * 0.06; c.shadowOffsetY = S * 0.05;
  c.drawImage(fl, 0, 0); c.shadowColor = 'transparent';
  if (white) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); }
  const info = { canvas: cv, ax: 0.5, ay: (S * up) / h, scale: 1 / px };
  tokenCache.set(key, info); return info;
}

/** Square portrait / card art canvas. */
export function portrait(art: string, team: number, size: number, count = 1): HTMLCanvasElement {
  const cv = makeCanvas(size, size); const c = cv.getContext('2d')!;
  const hero = HERO_ARTS.has(art), tall = art.startsWith('tower') || art === 'ancient';
  const n = Math.min(count, 3);
  for (let i = 0; i < n; i++) {
    const r = (size / (hero ? 5.0 : tall ? 5.6 : 4.3)) * (n > 1 ? 0.74 : 1);
    const tk = unitToken(art, team, Math.round(r), 2);
    const dw = tk.canvas.width / 2, dh = tk.canvas.height / 2;
    const ox = n === 1 ? 0 : (i - (n - 1) / 2) * size * 0.27, oy = n === 1 ? 0 : (i % 2 ? -size * 0.08 : size * 0.06);
    c.drawImage(tk.canvas, size / 2 - dw / 2 + ox, size * (hero ? 0.86 : 0.84) - dh * tk.ay + oy, dw, dh);
  }
  return cv;
}

// ------------------------------------------------------------------ icons
const GLYPH: Record<string, (c: Ctx) => void> = {
  bolt: c => { c.beginPath(); c.moveTo(0.15, -0.8); c.lineTo(-0.45, 0.1); c.lineTo(-0.05, 0.1); c.lineTo(-0.2, 0.8); c.lineTo(0.45, -0.15); c.lineTo(0.05, -0.15); c.closePath(); },
  shield: c => { c.beginPath(); c.moveTo(0, -0.75); c.lineTo(0.6, -0.5); c.lineTo(0.55, 0.15); c.quadraticCurveTo(0.4, 0.6, 0, 0.8); c.quadraticCurveTo(-0.4, 0.6, -0.55, 0.15); c.lineTo(-0.6, -0.5); c.closePath(); },
  heart: c => { c.beginPath(); c.moveTo(0, 0.7); c.bezierCurveTo(-1.1, -0.1, -0.6, -0.9, 0, -0.35); c.bezierCurveTo(0.6, -0.9, 1.1, -0.1, 0, 0.7); },
  star: c => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.36 : 0.82; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); },
  flame: c => { c.beginPath(); c.moveTo(0, -0.85); c.bezierCurveTo(0.7, -0.2, 0.75, 0.75, 0, 0.8); c.bezierCurveTo(-0.75, 0.75, -0.55, 0.0, -0.25, -0.2); c.bezierCurveTo(-0.2, 0.1, 0.05, 0.0, 0, -0.85); },
  snow: c => { c.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; c.moveTo(0, 0); c.lineTo(Math.cos(a) * 0.8, Math.sin(a) * 0.8); } c.rect(-0.12, -0.12, 0.24, 0.24); },
  arrow: c => { c.beginPath(); c.moveTo(-0.7, 0.7); c.lineTo(0.35, -0.35); c.lineTo(0.1, -0.6); c.lineTo(0.8, -0.8); c.lineTo(0.6, -0.1); c.lineTo(0.35, -0.35); c.lineTo(-0.5, 0.7); c.closePath(); },
  sword: c => { c.beginPath(); c.moveTo(0.75, -0.8); c.lineTo(0.5, -0.2); c.lineTo(-0.2, 0.5); c.lineTo(0.0, 0.7); c.lineTo(-0.25, 0.75); c.lineTo(-0.5, 0.5); c.lineTo(-0.75, 0.75); c.lineTo(-0.8, 0.55); c.lineTo(-0.55, 0.3); c.lineTo(-0.75, 0.0); c.lineTo(-0.5, 0.2); c.lineTo(0.2, -0.5); c.closePath(); },
  dagger: c => { c.beginPath(); c.moveTo(0, -0.85); c.lineTo(0.22, 0.1); c.lineTo(0.5, 0.15); c.lineTo(0.5, 0.32); c.lineTo(0.12, 0.32); c.lineTo(0.12, 0.8); c.lineTo(-0.12, 0.8); c.lineTo(-0.12, 0.32); c.lineTo(-0.5, 0.32); c.lineTo(-0.5, 0.15); c.lineTo(-0.22, 0.1); c.closePath(); },
  hammer: c => { c.beginPath(); c.rect(-0.7, -0.75, 1.4, 0.6); c.rect(-0.13, -0.15, 0.26, 0.95); },
  skull: c => { c.beginPath(); c.arc(0, -0.15, 0.62, 0, Math.PI * 2); c.rect(-0.32, 0.3, 0.64, 0.42); c.moveTo(-0.1, -0.1); c.arc(-0.25, -0.1, 0.15, 0, Math.PI * 2, true); c.moveTo(0.4, -0.1); c.arc(0.25, -0.1, 0.15, 0, Math.PI * 2, true); },
  leaf: c => { c.beginPath(); c.moveTo(-0.7, 0.7); c.quadraticCurveTo(-0.8, -0.6, 0.75, -0.75); c.quadraticCurveTo(0.7, 0.75, -0.7, 0.7); },
  tree: c => { c.beginPath(); c.moveTo(0, -0.85); c.lineTo(0.65, 0.25); c.lineTo(0.15, 0.25); c.lineTo(0.15, 0.8); c.lineTo(-0.15, 0.8); c.lineTo(-0.15, 0.25); c.lineTo(-0.65, 0.25); c.closePath(); },
  wave: c => { c.beginPath(); c.moveTo(-0.85, 0.2); c.quadraticCurveTo(-0.5, -0.8, 0.1, -0.2); c.quadraticCurveTo(0.45, 0.15, 0.85, -0.35); c.lineTo(0.85, 0.6); c.lineTo(-0.85, 0.6); c.closePath(); },
  rain: c => { c.beginPath(); for (const [x, y] of [[-0.5, -0.5], [0.1, -0.7], [0.55, -0.3], [-0.2, 0.1], [0.4, 0.35], [-0.6, 0.45]]) { c.moveTo(x + 0.12, y - 0.2); c.lineTo(x + 0.2, y - 0.14); c.lineTo(x - 0.05, y + 0.3); c.closePath(); } },
  eye: c => { c.beginPath(); c.moveTo(-0.85, 0); c.quadraticCurveTo(0, -0.75, 0.85, 0); c.quadraticCurveTo(0, 0.75, -0.85, 0); c.moveTo(0.28, 0); c.arc(0, 0, 0.28, 0, Math.PI * 2, true); },
  horn: c => { c.beginPath(); c.moveTo(-0.8, -0.2); c.lineTo(0.5, -0.7); c.lineTo(0.8, 0.5); c.lineTo(-0.8, 0.15); c.closePath(); },
  ringfire: c => { c.beginPath(); c.arc(0, 0, 0.78, 0, Math.PI * 2); c.arc(0, 0, 0.45, 0, Math.PI * 2, true); },
  ring: c => { c.beginPath(); c.arc(0, 0.12, 0.6, 0, Math.PI * 2); c.arc(0, 0.12, 0.38, 0, Math.PI * 2, true); c.moveTo(0, -0.85); c.lineTo(0.28, -0.55); c.lineTo(0, -0.3); c.lineTo(-0.28, -0.55); c.closePath(); },
  orb: c => { c.beginPath(); c.arc(0, 0, 0.7, 0, Math.PI * 2); },
  boot: c => { c.beginPath(); c.moveTo(-0.45, -0.8); c.lineTo(0.1, -0.8); c.lineTo(0.1, 0.05); c.quadraticCurveTo(0.8, 0.1, 0.8, 0.7); c.lineTo(-0.45, 0.7); c.closePath(); },
  potion: c => { c.beginPath(); c.rect(-0.18, -0.85, 0.36, 0.4); c.moveTo(0.18, -0.45); c.quadraticCurveTo(0.75, 0.0, 0.6, 0.55); c.quadraticCurveTo(0, 0.95, -0.6, 0.55); c.quadraticCurveTo(-0.75, 0.0, -0.18, -0.45); c.closePath(); },
  staff: c => { c.beginPath(); c.rect(-0.08, -0.3, 0.16, 1.15); c.moveTo(0.38, -0.55); c.arc(0, -0.55, 0.38, 0, Math.PI * 2); },
  coin: c => { c.beginPath(); c.arc(0, 0, 0.75, 0, Math.PI * 2); },
  drop: c => { c.beginPath(); c.moveTo(0, -0.85); c.quadraticCurveTo(0.8, 0.2, 0, 0.8); c.quadraticCurveTo(-0.8, 0.2, 0, -0.85); },
};
const iconCache = new Map<string, HTMLCanvasElement>();
export function icon(glyph: string, color: string, size = 64): HTMLCanvasElement {
  const key = `${glyph}|${color}|${size}`; const hit = iconCache.get(key); if (hit) return hit;
  const cv = makeCanvas(size, size); const c = cv.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 0, size); g.addColorStop(0, '#3a2f45'); g.addColorStop(1, '#1f1829');
  c.fillStyle = g; c.beginPath(); c.roundRect(0, 0, size, size, size * 0.18); c.fill();
  c.globalAlpha = 0.22; c.fillStyle = color; c.beginPath(); c.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
  c.translate(size / 2, size / 2); c.scale(size * 0.36, size * 0.36);
  (GLYPH[glyph] ?? GLYPH.star)(c);
  c.lineJoin = 'round'; c.lineWidth = 0.2; c.strokeStyle = INK; c.stroke(); c.fillStyle = color; c.fill('evenodd');
  iconCache.set(key, cv); return cv;
}

// ------------------------------------------------------------------ ground
export const GROUND_SCALE = 1.5;
export const GROUND_PAD = 90; // dark surround beyond the playfield (world units)

function hash2(x: number, y: number) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x: number, y: number) { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function fbm(x: number, y: number, oct: number) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += vnoise(x * f, y * f) * a; n += a; a *= 0.5; f *= 2.03; } return s / n; }
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) { const dx = bx - ax, dy = by - ay; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - ax - dx * t, py - ay - dy * t); }

/**
 * Paints the battlefield once: per-pixel noise terrain with baked lighting (lush lower side, scorched upper side,
 * deep river, rock cliffs), then stonework, forests and props drawn with shaded gradients on top.
 */
export function paintGround(): HTMLCanvasElement {
  const M = C.map, G = GROUND_SCALE, pad = GROUND_PAD, LS = 0.75;
  const LW = Math.ceil((M.w + pad * 2) * LS), LH = Math.ceil((M.h + pad * 2) * LS);
  const low = makeCanvas(LW, LH), lc = low.getContext('2d')!; const img = lc.createImageData(LW, LH), px = img.data;
  const hgt = new Float32Array(LW * LH);
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) hgt[y * LW + x] = fbm(x / LS / 22, y / LS / 22, 4);
  const paths: number[][] = [];
  for (const t of [0, 1]) for (const lx of M.laneX) paths.push([lx, t === 0 ? M.barracksY : M.h - M.barracksY, 600, t === 0 ? M.ancient.y : M.h - M.ancient.y]);
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const wx = x / LS - pad, wy = y / LS - pad, i = y * LW + x;
    const n = fbm(wx / 150 + 7, wy / 150 + 3, 4), f = hgt[i];
    let r: number, g: number, b: number;
    const inside = wx >= 0 && wx <= M.w && wy >= 0 && wy <= M.h;
    const dire = sstep(-60, 60, M.riverY - wy + (n - 0.5) * 120);
    // grass / scorched earth
    const gr = 34 + n * 34 + f * 16, gg = 58 + n * 44 + f * 22, gb = 24 + n * 16 + f * 8;
    const dr0 = 54 + n * 30 + f * 18, dg0 = 40 + n * 20 + f * 14, db0 = 40 + n * 16 + f * 12;
    r = gr + (dr0 - gr) * dire; g = gg + (dg0 - gg) * dire; b = gb + (db0 - gb) * dire;
    if (f > 0.58) { const k = (f - 0.58) * 2.2; r += (dire ? 30 : 26) * k; g += (dire ? 22 : 30) * k; b += 4 * k; } // dry tufts
    const dRiv = Math.abs(wy - M.riverY);
    const high = dRiv > M.highGround; if (high) { r *= 1.1; g *= 1.1; b *= 1.08; }
    // lanes and base paths
    let dl = Math.min(Math.abs(wx - M.laneX[0]), Math.abs(wx - M.laneX[1]));
    for (const p of paths) dl = Math.min(dl, segDist(wx, wy, p[0], p[1], p[2], p[3]) + 8);
    const lane = 1 - sstep(44, 74, dl + (f - 0.5) * 46);
    if (lane > 0) { const k = 0.75 + f * 0.5; const lr = (dire > 0.5 ? 104 : 122) * k, lg = (dire > 0.5 ? 82 : 100) * k, lb = (dire > 0.5 ? 70 : 68) * k; r += (lr - r) * lane; g += (lg - g) * lane; b += (lb - b) * lane; }
    // camps: trampled clearings
    for (const cp of CAMPS) { const d = Math.hypot(wx - cp.x, (wy - cp.y) * 1.25); if (d < 90) { const k = (1 - sstep(55, 90, d + (f - 0.5) * 30)) * 0.8; r += (86 * (0.7 + f * 0.5) - r) * k; g += (70 * (0.7 + f * 0.5) - g) * k; b += (52 * (0.7 + f * 0.5) - b) * k; } }
    // cliffs between low and high ground (lanes ramp through)
    const dc = dRiv - M.highGround + (f - 0.5) * 10;
    if (lane < 0.5) {
      if (dc > -18 && dc < 0) { const k = (dc + 18) / 18; const rock = 30 + f * 46 + k * 26; r = rock * 1.02; g = rock * 0.97; b = rock * 1.04; if (dc > -3) { r += 46; g += 44; b += 40; } }
      else if (dc <= -18 && dc > -46) { const k = 0.55 + 0.45 * ((-18 - dc) / 28); r *= k; g *= k; b *= k; } // cast shadow under the cliff
    }
    // river
    const dw = dRiv + (n - 0.5) * 44;
    if (dw < M.riverHalf + 16) {
      if (dw < M.riverHalf) { const depth = 1 - dw / M.riverHalf; const rip = (fbm(wx / 26, wy / 9, 3) - 0.5) * 34; r = 46 - depth * 36 + rip * 0.5; g = 104 - depth * 62 + rip; b = 112 - depth * 44 + rip; if (dw > M.riverHalf - 5) { r += 50; g += 56; b += 52; } }
      else { const k = 1 - (dw - M.riverHalf) / 16; r += (70 - r) * k; g += (62 - g) * k; b += (48 - b) * k; }
    }
    // boss crater
    const dbp = Math.hypot(wx - M.bossPit.x, wy - M.bossPit.y) + (f - 0.5) * 16;
    if (dbp < 104) { const k = 1 - sstep(84, 104, dbp); const rock = 26 + f * 34 + sstep(60, 100, dbp) * 26; r += (rock * 1.08 - r) * k; g += (rock * 0.92 - g) * k; b += (rock * 1.15 - b) * k; }
    // baked light: emboss from the height field, light from the upper left
    const e = (hgt[Math.max(0, i - LW - 1)] - hgt[Math.min(LW * LH - 1, i + LW + 1)]) * 3.4;
    let L = 0.9 + e;
    if (!inside) { const o = Math.max(-wx, wx - M.w, -wy, wy - M.h); const k = Math.max(0, 1 - o / 40); r = 14 + f * 16; g = 14 + f * 14; b = 20 + f * 16; L *= 0.35 + k * 0.5; }
    else { const ed = Math.min(wx, M.w - wx, wy, M.h - wy); L *= 0.62 + 0.38 * sstep(0, 150, ed); }
    px[i * 4] = r * L; px[i * 4 + 1] = g * L; px[i * 4 + 2] = b * L; px[i * 4 + 3] = 255;
  }
  lc.putImageData(img, 0, 0);
  const cv = makeCanvas((M.w + pad * 2) * G, (M.h + pad * 2) * G); const c = cv.getContext('2d')!;
  c.imageSmoothingQuality = 'high'; c.drawImage(low, 0, 0, cv.width, cv.height);
  // fine grain so the upscaled terrain does not look soft
  const grain = makeCanvas(256, 256), gc = grain.getContext('2d')!, gi = gc.createImageData(256, 256);
  for (let k = 0; k < 256 * 256; k++) { const v = 128 + (hash2(k % 256, (k / 256) | 0) - 0.5) * 120; gi.data[k * 4] = gi.data[k * 4 + 1] = gi.data[k * 4 + 2] = v; gi.data[k * 4 + 3] = 255; }
  gc.putImageData(gi, 0, 0); c.globalCompositeOperation = 'overlay'; c.globalAlpha = 0.3; c.fillStyle = c.createPattern(grain, 'repeat')!; c.fillRect(0, 0, cv.width, cv.height); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  c.scale(G, G); c.translate(pad, pad);
  const rng = new RNG(77);
  const glow = (x: number, y: number, rad: number, col: string, a = 1) => { const g2 = c.createRadialGradient(x, y, 0, x, y, rad); g2.addColorStop(0, col); g2.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = a; c.fillStyle = g2; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill(); c.globalAlpha = 1; };
  // grass blades
  for (let k = 0; k < 5200; k++) { const x = rng.range(0, M.w), y = rng.range(0, M.h); if (Math.abs(y - M.riverY) < M.riverHalf + 20) continue; if (Math.min(Math.abs(x - M.laneX[0]), Math.abs(x - M.laneX[1])) < 50) continue; const d = y < M.riverY; c.strokeStyle = d ? `rgba(${120 + rng.int(40)},${90 + rng.int(30)},${60},0.35)` : `rgba(${70 + rng.int(50)},${120 + rng.int(60)},${40},0.4)`; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y); c.lineTo(x + rng.range(-2, 2), y - rng.range(3, 7)); c.stroke(); }
  // pebbles on the lanes
  for (let k = 0; k < 900; k++) { const lx = M.laneX[k % 2] + rng.range(-52, 52), y = rng.range(0, M.h); if (Math.abs(y - M.riverY) < M.riverHalf + 12) continue; const s = rng.range(1.5, 4); c.fillStyle = 'rgba(20,14,10,0.35)'; c.beginPath(); c.ellipse(lx + 1, y + 1, s, s * 0.6, 0, 0, 7); c.fill(); c.fillStyle = `rgba(${150 + rng.int(40)},${135 + rng.int(30)},${110},0.55)`; c.beginPath(); c.ellipse(lx, y, s, s * 0.6, 0, 0, 7); c.fill(); }
  // stone bridges
  const ry0 = M.riverY - M.riverHalf - 22, bh = M.riverHalf * 2 + 44;
  for (const lx of M.laneX) {
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(lx - 66, ry0 + 8, 148, bh);
    const bg = c.createLinearGradient(lx - 70, 0, lx + 70, 0); bg.addColorStop(0, '#4a443f'); bg.addColorStop(0.12, '#857b6c'); bg.addColorStop(0.5, '#9a8f7c'); bg.addColorStop(0.88, '#7a7062'); bg.addColorStop(1, '#3a3531');
    c.fillStyle = bg; c.fillRect(lx - 70, ry0, 140, bh);
    for (let y = ry0; y < ry0 + bh; y += 18) for (let x = lx - 58 + ((y / 18) & 1) * 14; x < lx + 56; x += 28) { c.strokeStyle = 'rgba(20,16,14,0.45)'; c.lineWidth = 1.2; c.strokeRect(x, y, 28, 18); if (rng.next() < 0.3) { c.fillStyle = `rgba(0,0,0,${rng.range(0.05, 0.18)})`; c.fillRect(x, y, 28, 18); } }
    for (const sx of [lx - 70, lx + 58]) { const pg = c.createLinearGradient(sx, 0, sx + 12, 0); pg.addColorStop(0, '#b3a892'); pg.addColorStop(1, '#4d463f'); c.fillStyle = pg; c.fillRect(sx, ry0 - 4, 12, bh + 8); }
  }
  // base courtyards, fountains
  for (const team of [0, 1]) {
    const ay = team === 0 ? M.ancient.y : M.h - M.ancient.y, fy = team === 0 ? M.fountain.y : M.h - M.fountain.y, t = PAL[team];
    c.save(); c.translate(600, ay); c.scale(1, 0.68);
    const sg = c.createRadialGradient(-30, -40, 10, 0, 0, 150); sg.addColorStop(0, team === 0 ? '#8e98a0' : '#8a7068'); sg.addColorStop(1, team === 0 ? '#3d4650' : '#3d2c2a'); c.fillStyle = sg; c.beginPath(); c.arc(0, 0, 150, 0, 7); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 2; for (const rr of [60, 105, 150]) { c.beginPath(); c.arc(0, 0, rr, 0, 7); c.stroke(); } for (let a = 0; a < 16; a++) { c.beginPath(); c.moveTo(Math.cos(a * 0.3927) * 60, Math.sin(a * 0.3927) * 60); c.lineTo(Math.cos(a * 0.3927) * 150, Math.sin(a * 0.3927) * 150); c.stroke(); }
    c.strokeStyle = t.glow; c.lineWidth = 4; c.shadowColor = t.main; c.shadowBlur = 18; c.setLineDash([22, 14]); c.beginPath(); c.arc(0, 0, 124, 0, 7); c.stroke(); c.setLineDash([]); c.shadowBlur = 0; c.restore();
    glow(600, ay, 190, t.main, 0.22);
    c.save(); c.translate(600, fy); c.scale(1, 0.6); const fg = c.createRadialGradient(0, 0, 4, 0, 0, 78); fg.addColorStop(0, '#ffffff'); fg.addColorStop(0.35, t.glow); fg.addColorStop(0.8, t.dark); fg.addColorStop(1, '#1c1a22'); c.fillStyle = fg; c.beginPath(); c.arc(0, 0, 78, 0, 7); c.fill(); c.strokeStyle = '#6d665c'; c.lineWidth = 7; c.stroke(); c.restore();
    glow(600, fy, 170, t.glow, 0.3);
  }
  // boss pit sigil, rune stones, camp fires
  c.strokeStyle = '#ff4a8a'; c.lineWidth = 3; c.shadowColor = '#ff2a7a'; c.shadowBlur = 16; c.setLineDash([9, 13]); c.beginPath(); c.arc(M.bossPit.x, M.bossPit.y, 78, 0, 7); c.stroke(); c.setLineDash([]); c.shadowBlur = 0; glow(M.bossPit.x, M.bossPit.y, 120, '#a01850', 0.35);
  for (const rn of M.runeSpots) { c.save(); c.translate(rn.x, rn.y); c.scale(1, 0.7); const g2 = c.createRadialGradient(-8, -10, 2, 0, 0, 34); g2.addColorStop(0, '#9aa3ad'); g2.addColorStop(1, '#2e3238'); c.fillStyle = g2; c.beginPath(); c.arc(0, 0, 34, 0, 7); c.fill(); c.strokeStyle = '#ffd24a'; c.lineWidth = 2.5; c.shadowColor = '#ffb400'; c.shadowBlur = 12; c.beginPath(); c.arc(0, 0, 22, 0, 7); c.stroke(); c.restore(); glow(rn.x, rn.y, 70, '#ffc840', 0.2); }
  for (const cp of CAMPS) { glow(cp.x, cp.y, 80, '#ff8a2a', 0.3); c.fillStyle = '#1a1210'; c.beginPath(); c.ellipse(cp.x, cp.y, 11, 7, 0, 0, 7); c.fill(); glow(cp.x, cp.y - 3, 10, '#ffe08a', 1); }
  // forests and boulders
  const blocked = (x: number, y: number) => {
    if (Math.abs(y - M.riverY) < M.riverHalf + 34) return true;
    for (const lx of M.laneX) if (Math.abs(x - lx) < 92) return true;
    if (Math.abs(Math.abs(y - M.riverY) - M.highGround) < 34) return true;
    for (const cp of CAMPS) if (Math.hypot(x - cp.x, y - cp.y) < 112) return true;
    if (Math.hypot(x - 600, y - 1000) < 160) return true;
    for (const p of paths) if (segDist(x, y, p[0], p[1], p[2], p[3]) < 80) return true;
    if (x > 400 && x < 800 && (y > M.barracksY || y < M.h - M.barracksY)) return true;
    return false;
  };
  const decor: { x: number; y: number; k: number; s: number }[] = [];
  for (let k = 0; k < 4000 && decor.length < 430; k++) { const x = rng.range(10, M.w - 10), y = rng.range(10, M.h - 10); if (blocked(x, y)) continue; const edge = x < 150 || x > M.w - 150; const dense = fbm(x / 120 + 40, y / 120, 2) > 0.5; if (!edge && !dense) continue; if (decor.some(d => Math.hypot(d.x - x, d.y - y) < (edge ? 24 : 30))) continue; decor.push({ x, y, k: rng.next(), s: rng.range(0.85, 1.45) }); }
  decor.sort((a, b) => a.y - b.y);
  for (const d of decor) { c.fillStyle = 'rgba(0,0,0,0.38)'; c.beginPath(); c.ellipse(d.x + 16 * d.s, d.y + 9 * d.s, 24 * d.s, 10 * d.s, 0.2, 0, 7); c.fill(); }
  for (const d of decor) {
    const dire = d.y < M.riverY; c.save(); c.translate(d.x, d.y); c.scale(d.s, d.s);
    if (d.k < 0.84) {
      const tg = c.createLinearGradient(-4, 0, 4, 0); tg.addColorStop(0, '#5a4028'); tg.addColorStop(1, '#22160e'); c.fillStyle = tg; c.fillRect(-3.5, -14, 7, 18);
      const cols = dire ? (d.k < 0.4 ? ['#8a4a34', '#3a1c18'] : ['#6a6048', '#26221a']) : (d.k < 0.4 ? ['#6fae4a', '#173818'] : ['#4f9a58', '#102c1c']);
      for (const [ox, oy, rr] of [[0, -22, 17], [-11, -16, 12], [11, -17, 12], [-5, -32, 12], [7, -30, 11], [0, -40, 9]]) {
        const g2 = c.createRadialGradient(ox - rr * 0.4, oy - rr * 0.45, rr * 0.1, ox, oy, rr); g2.addColorStop(0, cols[0]); g2.addColorStop(1, cols[1]); c.fillStyle = g2; c.beginPath(); c.arc(ox, oy, rr, 0, 7); c.fill();
      }
      c.fillStyle = dire ? 'rgba(255,190,140,0.12)' : 'rgba(220,255,170,0.14)'; for (let q = 0; q < 9; q++) { c.beginPath(); c.arc(rng.range(-14, 8), rng.range(-42, -14), rng.range(1.5, 3.5), 0, 7); c.fill(); }
    } else {
      const g2 = c.createLinearGradient(-12, -14, 12, 8); g2.addColorStop(0, '#a8a39a'); g2.addColorStop(0.5, '#6a665f'); g2.addColorStop(1, '#25232a'); c.fillStyle = g2; c.beginPath(); c.moveTo(-14, 6); c.lineTo(-10, -9); c.lineTo(2, -14); c.lineTo(13, -5); c.lineTo(12, 7); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(2, -14); c.lineTo(-1, 0); c.lineTo(12, 7); c.stroke();
    }
    c.restore();
  }
  return cv;
}
