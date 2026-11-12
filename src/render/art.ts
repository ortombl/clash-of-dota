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

const STONE = '#cfc9bd', STONE_D = '#8d8799', WOOD = '#b0773f', WOOD_D = '#7a4d27', STEEL = '#dfe4ee', GOLD = '#ffd24a', SKIN = '#f3d2b0', BONE = '#f4efdc';

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
  const t = PAL[team]; const p = new P(c, hero ? 0.13 : flat ? 0.1 : 0.17);
  if (!flat) { // base disc
    p.ell(0, 0.08, 1.0, 0.62, t.dark); p.ell(0, -0.02, 0.86, 0.5, t.main, false);
    if (hero) { c.strokeStyle = GOLD; c.lineWidth = 0.11; c.beginPath(); c.ellipse(0, 0.03, 0.96, 0.58, 0, 0, Math.PI * 2); c.stroke(); }
    c.translate(0, -0.1); c.scale(hero ? 0.78 : 0.8, hero ? 0.78 : 0.8);
  }
  (FIG[art] ?? FIG.creepM)(p, t);
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
export const GROUND_PAD = 90; // table rim around the playfield (world units)

/** Paints the whole diorama board once. */
export function paintGround(): HTMLCanvasElement {
  const M = C.map, G = GROUND_SCALE, pad = GROUND_PAD;
  const cv = makeCanvas((M.w + pad * 2) * G, (M.h + pad * 2) * G); const c = cv.getContext('2d')!;
  c.scale(G, G);
  // wooden table
  c.fillStyle = '#3b2a26'; c.fillRect(0, 0, M.w + pad * 2, M.h + pad * 2);
  const rng = new RNG(77);
  c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 2;
  for (let y = 0; y < M.h + pad * 2; y += 46) { c.beginPath(); c.moveTo(0, y); c.lineTo(M.w + pad * 2, y + rng.range(-6, 6)); c.stroke(); }
  c.translate(pad, pad);
  // board edge
  c.fillStyle = INK; c.beginPath(); c.roundRect(-14, -14, M.w + 28, M.h + 28 + 16, 30); c.fill();
  c.fillStyle = '#5b4636'; c.beginPath(); c.roundRect(-10, -10, M.w + 20, M.h + 20 + 14, 26); c.fill();
  c.save(); c.beginPath(); c.roundRect(0, 0, M.w, M.h, 18); c.clip();
  // low ground meadow
  c.fillStyle = '#79b86a'; c.fillRect(0, 0, M.w, M.h);
  const hgTop = M.riverY - M.highGround, hgBot = M.riverY + M.highGround;
  // high ground plateaus (team tinted)
  const plateau = (y0: number, y1: number, col: string, col2: string) => { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, col); g.addColorStop(1, col2); c.fillStyle = g; c.fillRect(0, y0, M.w, y1 - y0); };
  plateau(0, hgTop, '#d9b48c', '#b9cf86'); plateau(hgBot, M.h, '#a6d39a', '#9cc4d8');
  // speckles
  for (let i = 0; i < 2600; i++) { const x = rng.range(0, M.w), y = rng.range(0, M.h); c.fillStyle = rng.next() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(20,40,20,0.10)'; c.beginPath(); c.ellipse(x, y, rng.range(2, 6), rng.range(1.5, 3.5), 0, 0, 7); c.fill(); }
  // cliffs: the wall you see is the side of the high ground
  const cliff = (y: number, down: boolean) => {
    c.fillStyle = INK; c.fillRect(0, y - (down ? 3 : 19), M.w, 22);
    c.fillStyle = down ? '#7a6a58' : '#5d7f4f'; c.fillRect(0, y - (down ? 0 : 16), M.w, 16);
    c.fillStyle = 'rgba(0,0,0,0.16)'; for (let x = 0; x < M.w; x += 26) c.fillRect(x, y - (down ? 0 : 16), 2, 16);
  };
  cliff(hgTop, true); cliff(hgBot, false);
  // ramps where lanes climb
  for (const lx of M.laneX) for (const y of [hgTop, hgBot]) { c.fillStyle = '#e2cf9c'; c.fillRect(lx - 70, y - 20, 140, 40); }
  // river
  const ry0 = M.riverY - M.riverHalf, ry1 = M.riverY + M.riverHalf;
  c.fillStyle = INK; c.fillRect(0, ry0 - 4, M.w, M.riverHalf * 2 + 8);
  const rg = c.createLinearGradient(0, ry0, 0, ry1); rg.addColorStop(0, '#3f8fc4'); rg.addColorStop(0.5, '#2f73ad'); rg.addColorStop(1, '#3f8fc4');
  c.fillStyle = rg; c.fillRect(0, ry0, M.w, M.riverHalf * 2);
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 3; c.lineCap = 'round';
  for (let i = 0; i < 70; i++) { const x = rng.range(0, M.w), y = rng.range(ry0 + 10, ry1 - 10), l = rng.range(14, 40); c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + l / 2, y - 5, x + l, y); c.stroke(); }
  // lanes
  for (const lx of M.laneX) {
    c.fillStyle = 'rgba(29,22,38,0.35)'; c.fillRect(lx - 64, 0, 128, M.h);
    c.fillStyle = '#ecdba8'; c.fillRect(lx - 60, 0, 120, ry0); c.fillRect(lx - 60, ry1, 120, M.h - ry1);
    c.fillStyle = 'rgba(160,120,60,0.22)'; for (let y = 10; y < M.h; y += 34) { if (y > ry0 - 10 && y < ry1 + 10) continue; c.beginPath(); c.ellipse(lx + rng.range(-40, 40), y, rng.range(5, 12), 4, 0, 0, 7); c.fill(); }
    // bridge
    c.fillStyle = INK; c.fillRect(lx - 72, ry0 - 14, 144, M.riverHalf * 2 + 28);
    c.fillStyle = '#b98248'; c.fillRect(lx - 68, ry0 - 10, 136, M.riverHalf * 2 + 20);
    c.strokeStyle = 'rgba(60,30,10,0.5)'; c.lineWidth = 2; for (let y = ry0 - 10; y < ry1 + 10; y += 16) { c.beginPath(); c.moveTo(lx - 68, y); c.lineTo(lx + 68, y); c.stroke(); }
    c.fillStyle = '#8a5a2c'; c.fillRect(lx - 68, ry0 - 10, 8, M.riverHalf * 2 + 20); c.fillRect(lx + 60, ry0 - 10, 8, M.riverHalf * 2 + 20);
  }
  // base courtyards and paths to the ancient
  const court = (team: number) => {
    const ay = team === 0 ? M.ancient.y : M.h - M.ancient.y, by = team === 0 ? M.barracksY : M.h - M.barracksY, fy = team === 0 ? M.fountain.y : M.h - M.fountain.y;
    const t = PAL[team];
    c.fillStyle = '#ecdba8'; c.beginPath(); c.moveTo(M.laneX[0] - 60, by); c.lineTo(M.laneX[0] + 60, by - (team === 0 ? 40 : -40)); c.lineTo(600, ay - (team === 0 ? 60 : -60)); c.lineTo(M.laneX[1] - 60, by - (team === 0 ? 40 : -40)); c.lineTo(M.laneX[1] + 60, by); c.lineTo(660, ay + (team === 0 ? 30 : -30)); c.lineTo(540, ay + (team === 0 ? 30 : -30)); c.closePath(); c.fill();
    c.fillStyle = INK; c.beginPath(); c.ellipse(600, ay, 150, 104, 0, 0, 7); c.fill();
    c.fillStyle = team === 0 ? '#b9d4ea' : '#f0c8a4'; c.beginPath(); c.ellipse(600, ay, 145, 99, 0, 0, 7); c.fill();
    c.strokeStyle = t.main; c.lineWidth = 6; c.setLineDash([18, 12]); c.beginPath(); c.ellipse(600, ay, 122, 80, 0, 0, 7); c.stroke(); c.setLineDash([]);
    // fountain
    c.fillStyle = INK; c.beginPath(); c.ellipse(600, fy, 78, 46, 0, 0, 7); c.fill();
    c.fillStyle = t.dark; c.beginPath(); c.ellipse(600, fy, 73, 42, 0, 0, 7); c.fill();
    c.fillStyle = t.glow; c.beginPath(); c.ellipse(600, fy, 56, 30, 0, 0, 7); c.fill();
    c.fillStyle = '#ffffff'; c.globalAlpha = 0.6; c.beginPath(); c.ellipse(590, fy - 6, 22, 9, 0, 0, 7); c.fill(); c.globalAlpha = 1;
  };
  court(0); court(1);
  // boss pit
  c.fillStyle = INK; c.beginPath(); c.arc(M.bossPit.x, M.bossPit.y, 96, 0, 7); c.fill();
  c.fillStyle = '#5a5266'; c.beginPath(); c.arc(M.bossPit.x, M.bossPit.y, 91, 0, 7); c.fill();
  c.fillStyle = '#3a3344'; c.beginPath(); c.arc(M.bossPit.x, M.bossPit.y, 70, 0, 7); c.fill();
  c.strokeStyle = '#e04a8a'; c.lineWidth = 4; c.setLineDash([10, 14]); c.beginPath(); c.arc(M.bossPit.x, M.bossPit.y, 80, 0, 7); c.stroke(); c.setLineDash([]);
  // rune stones
  for (const r of M.runeSpots) { c.fillStyle = INK; c.beginPath(); c.arc(r.x, r.y, 36, 0, 7); c.fill(); c.fillStyle = '#b8c4d0'; c.beginPath(); c.arc(r.x, r.y, 32, 0, 7); c.fill(); c.strokeStyle = '#ffd24a'; c.lineWidth = 3; c.beginPath(); c.arc(r.x, r.y, 22, 0, 7); c.stroke(); }
  // camps
  for (const cp of CAMPS) { c.fillStyle = 'rgba(29,22,38,0.5)'; c.beginPath(); c.ellipse(cp.x, cp.y, 78, 60, 0, 0, 7); c.fill(); c.fillStyle = '#b89b6a'; c.beginPath(); c.ellipse(cp.x, cp.y, 74, 56, 0, 0, 7); c.fill(); c.fillStyle = '#3a3344'; c.beginPath(); c.arc(cp.x, cp.y, 8, 0, 7); c.fill(); c.fillStyle = '#ff9a3a'; c.beginPath(); c.arc(cp.x, cp.y, 4.5, 0, 7); c.fill(); }
  // decor: toy trees and rocks away from lanes, camps, river and bases
  const blocked = (x: number, y: number) => {
    if (Math.abs(y - M.riverY) < M.riverHalf + 26) return true;
    for (const lx of M.laneX) if (Math.abs(x - lx) < 96) return true;
    if (Math.abs(Math.abs(y - M.riverY) - M.highGround) < 30) return true;
    for (const cp of CAMPS) if (Math.hypot(x - cp.x, y - cp.y) < 110) return true;
    if (Math.hypot(x - 600, y - 1000) < 150) return true;
    if (x > 360 && x < 840 && (y > M.barracksY - 60 || y < M.h - M.barracksY + 60)) return true;
    return false;
  };
  const decor: { x: number; y: number; k: number; s: number }[] = [];
  for (let i = 0; i < 900 && decor.length < 190; i++) { const x = rng.range(14, M.w - 14), y = rng.range(14, M.h - 14); if (blocked(x, y)) continue; if (decor.some(d => Math.hypot(d.x - x, d.y - y) < 34)) continue; const edge = x < 130 || x > M.w - 130; if (!edge && rng.next() < 0.55) continue; decor.push({ x, y, k: rng.next(), s: rng.range(0.8, 1.3) }); }
  decor.sort((a, b) => a.y - b.y);
  for (const d of decor) {
    c.save(); c.translate(d.x, d.y); c.scale(d.s, d.s);
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.ellipse(3, 6, 16, 7, 0, 0, 7); c.fill();
    c.lineWidth = 2.5; c.strokeStyle = INK;
    if (d.k < 0.7) { c.fillStyle = '#8a5a2c'; c.fillRect(-3, -4, 6, 12); c.strokeRect(-3, -4, 6, 12); const col = d.k < 0.35 ? '#3f9a56' : '#57b05a'; for (const [yy, rr] of [[-8, 15], [-20, 11], [-29, 7]]) { c.fillStyle = col; c.beginPath(); c.moveTo(-rr, yy + 6); c.lineTo(0, yy - 12); c.lineTo(rr, yy + 6); c.closePath(); c.fill(); c.stroke(); } }
    else { c.fillStyle = '#b5b0c0'; c.beginPath(); c.moveTo(-13, 5); c.lineTo(-8, -9); c.lineTo(4, -12); c.lineTo(13, -2); c.lineTo(10, 6); c.closePath(); c.fill(); c.stroke(); c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.moveTo(-6, -7); c.lineTo(3, -10); c.lineTo(0, -3); c.closePath(); c.fill(); }
    c.restore();
  }
  c.restore();
  return cv;
}
