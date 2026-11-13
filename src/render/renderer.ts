import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { CONFIG as C } from '../data/config';
import { CARDS } from '../data/cards';
import { UNITS } from '../data/units';
import type { Sim } from '../sim/sim';
import type { SimEvent, Unit } from '../sim/types';
import { isHigh, mirrorY } from '../sim/map';
import { GROUND_PAD, GROUND_SCALE, HERO_ARTS, PAL, makeCanvas, paintGround, unitToken } from './art';
import { audio } from '../audio/audio';

const M = C.map;
const hex = (s: string) => parseInt(s.slice(1), 16);
const TEAM_HEX = PAL.map(p => hex(p.main)), TEAM_LIGHT = PAL.map(p => hex(p.light)), TEAM_DARK = PAL.map(p => hex(p.dark));
const INKH = 0x1d1626, GOLDH = 0xffd24a;
const RUNE_COL: Record<string, number> = { bounty: 0xffd24a, haste: 0xff5a4a, double: 0x5aa8ff, regen: 0x5fd068, invis: 0xb08aff };
const RUNE_NAME: Record<string, string> = { bounty: 'BOUNTY', haste: 'HASTE', double: 'DOUBLE DMG', regen: 'REGEN', invis: 'INVIS' };

interface View { c: Container; spr: Sprite; flash: Sprite; px: number; py: number; h: number; lvl?: Text; lastX: number; lastY: number; bob: number }
interface Particle { x: number; y: number; vx: number; vy: number; z: number; vz: number; life: number; max: number; size: number; color: number; sq: boolean }
interface Ring { x: number; y: number; r0: number; r1: number; life: number; max: number; color: number; w: number; fill: boolean }
interface Float { t: Text; x: number; y: number; vy: number; life: number; max: number }
interface Dying { c: Container; t: number; dur: number; struct: boolean; x: number; y: number; r: number; team: number }
interface Bolt { x1: number; y1: number; x2: number; y2: number; life: number; color: number }

export interface UiOverlay {
  dragCard: string | null; dragX: number; dragY: number; dragValid: boolean;
  aimSlot: number; aimX: number; aimY: number;
  hoverId: number; marker: { x: number; y: number; t: number; attack: boolean } | null;
}

export class Renderer {
  app = new Application();
  world = new Container();
  private glow = new Graphics(); private vig!: Sprite; private decal = new Graphics(); private rubble = new Graphics(); private unitLayer = new Container(); private over = new Graphics();
  private texts = new Container(); private fogSprite!: Sprite; private fogCv = makeCanvas(150, 250); private fogTex!: Texture;
  private views = new Map<number, View>(); private dying: Dying[] = [];
  private parts: Particle[] = []; private rings: Ring[] = []; private floats: Float[] = []; private bolts: Bolt[] = [];
  private textPool: Text[] = []; private runeText: Text[] = [];
  private texCache = new Map<string, Texture>();
  private sources: { x: number; y: number; r: number; high: boolean }[] = [];
  cam = { x: M.w / 2, y: M.h - 500, scale: 0.72, shake: 0, follow: true };
  hudBottom = 150; private frame = 0; private clock = 0; private vignette = 0;
  playerTeam: 0 | 1 = 0;
  W = 1280; H = 720;

  async init(canvas: HTMLCanvasElement) {
    await this.app.init({ canvas, background: 0x06070b, antialias: true, autoDensity: true, resolution: Math.min(2, window.devicePixelRatio || 1), autoStart: false, width: window.innerWidth, height: window.innerHeight, preference: 'webgl' });
    const g = new Sprite(Texture.from(paintGround())); g.scale.set(1 / GROUND_SCALE); g.position.set(-GROUND_PAD, -GROUND_PAD);
    this.unitLayer.sortableChildren = true;
    this.fogTex = Texture.from(this.fogCv); this.fogSprite = new Sprite(this.fogTex); this.fogSprite.scale.set(M.w / 150, M.h / 250);
    this.glow.blendMode = 'add';
    this.world.addChild(g, this.rubble, this.decal, this.unitLayer, this.glow, this.fogSprite, this.over, this.texts);
    // screen-space vignette for depth
    const vc = makeCanvas(256, 256), vx = vc.getContext('2d')!; const vg = vx.createRadialGradient(128, 128, 70, 128, 128, 182); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(2,3,10,0.78)'); vx.fillStyle = vg; vx.fillRect(0, 0, 256, 256);
    this.vig = new Sprite(Texture.from(vc));
    this.app.stage.addChild(this.world, this.vig);
    for (let i = 0; i < 2; i++) { const t = this.mkText(13); this.runeText.push(t); this.texts.addChild(t); t.visible = false; }
    this.resize();
  }

  private mkText(size: number): Text { const t = new Text({ text: '', style: { fontFamily: 'Lilita One, Trebuchet MS, sans-serif', fontSize: size * 2, fill: 0xffffff, stroke: { color: INKH, width: 6 } } }); t.anchor.set(0.5); t.scale.set(0.5); return t; }

  reset() {
    for (const v of this.views.values()) v.c.destroy({ children: true }); this.views.clear();
    for (const d of this.dying) d.c.destroy({ children: true }); this.dying = [];
    for (const f of this.floats) { f.t.visible = false; this.textPool.push(f.t); } this.floats = [];
    this.parts = []; this.rings = []; this.bolts = []; this.rubble.clear(); this.vignette = 0; this.cam.shake = 0;
  }

  resize() {
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.app.renderer.resize(this.W, this.H); if (this.vig) { this.vig.width = this.W; this.vig.height = this.H; }
    this.cam.scale = this.defaultScale();
  }
  defaultScale() { return Math.max(0.38, Math.min(this.W / (M.w + 40), this.H / 1000)); }
  zoom(f: number) { const d = this.defaultScale(); this.cam.scale = Math.max(Math.min(d, this.H / (M.h + 160)), Math.min(d * 2, this.cam.scale * f)); }

  screenToWorld(sx: number, sy: number) { return { x: (sx - this.world.x) / this.cam.scale, y: (sy - this.world.y) / this.cam.scale }; }
  worldToScreen(x: number, y: number) { return { x: x * this.cam.scale + this.world.x, y: y * this.cam.scale + this.world.y }; }

  /** Is a world point inside the player's current vision? (gates effects and sounds in the fog) */
  visibleAt(x: number, y: number) {
    const high = isHigh(y);
    for (const s of this.sources) { if (high && !s.high) continue; const dx = s.x - x, dy = s.y - y; if (dx * dx + dy * dy <= s.r * s.r) return true; }
    return false;
  }

  private tex(art: string, team: number, r: number, white: boolean): { t: Texture; ax: number; ay: number } {
    const key = `${art}|${team}|${r}|${white}`; const tk = unitToken(art, team, r, 2, white);
    let t = this.texCache.get(key); if (!t) { t = Texture.from(tk.canvas); this.texCache.set(key, t); }
    return { t, ax: tk.ax, ay: tk.ay };
  }

  private makeView(u: Unit): View {
    const c = new Container(); const a = this.tex(u.def.art, u.team, u.r, false), w = this.tex(u.def.art, u.team, u.r, true);
    const spr = new Sprite(a.t); spr.anchor.set(a.ax, a.ay); spr.scale.set(0.5);
    const flash = new Sprite(w.t); flash.anchor.set(w.ax, w.ay); flash.scale.set(0.5); flash.alpha = 0;
    c.addChild(spr, flash);
    const v: View = { c, spr, flash, px: u.x, py: u.y, h: a.t.height * 0.5 * a.ay, lastX: u.x, lastY: u.y, bob: 0 };
    if (u.hero) { v.lvl = this.mkText(11); this.texts.addChild(v.lvl); }
    this.unitLayer.addChild(c); this.views.set(u.id, v); return v;
  }

  /** Call before each sim step batch so positions can be interpolated. */
  snapshot(sim: Sim) { for (const u of sim.units) { const v = this.views.get(u.id); if (v) { v.px = u.x; v.py = u.y; } } }

  // ------------------------------------------------------------------ fx helpers
  burst(x: number, y: number, n: number, color: number, speed = 90, size = 4, life = 0.5, sq = false) {
    for (let i = 0; i < n && this.parts.length < 900; i++) { const a = Math.random() * 6.283, s = speed * (0.4 + Math.random() * 0.8); this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, z: 4 + Math.random() * 10, vz: 60 + Math.random() * 120, life, max: life, size: size * (0.6 + Math.random() * 0.8), color, sq }); }
  }
  ring(x: number, y: number, r0: number, r1: number, color: number, life = 0.4, w = 4, fill = false) { this.rings.push({ x, y, r0, r1, life, max: life, color, w, fill }); }
  float(x: number, y: number, text: string, color: number, size = 14, life = 0.9) {
    if (this.floats.length > 44) return;
    const t = this.textPool.pop() ?? this.mkText(16); if (!t.parent) this.texts.addChild(t);
    t.text = text; t.style.fill = color; t.scale.set(size / 32); t.visible = true; t.alpha = 1;
    this.floats.push({ t, x: x + (Math.random() - 0.5) * 16, y, vy: -46, life, max: life });
  }
  shake(a: number) { this.cam.shake = Math.min(18, Math.max(this.cam.shake, a)); }

  handleEvents(sim: Sim, events: SimEvent[]) {
    const pt = this.playerTeam, me = sim.heroes[pt];
    for (const e of events) {
      const x = e.x ?? 0, y = e.y ?? 0; const vis = e.x === undefined || this.visibleAt(x, y);
      switch (e.type) {
        case 'dmg': {
          if (!vis) break; const amt = e.amt ?? 0;
          if (e.id === me.id) { if (amt >= 4) this.float(x, y - 40, `-${Math.round(amt)}`, 0xff5a5a, 13 + Math.min(8, amt / 40)); audio.play('heroHit', 0.5, 0.12); if (amt > 120) this.shake(6); }
          else if (e.a === me.id) { if (amt >= 4) this.float(x, y - 30, `${Math.round(amt)}`, 0xfff2c0, 12 + Math.min(10, amt / 35)); audio.play('hit', 0.45, 0.07); if (amt > 180) this.shake(5); }
          break;
        }
        case 'heal': if (vis && (e.amt ?? 0) >= 8) this.float(x, y - 36, `+${Math.round(e.amt!)}`, 0x7dff9a, 13); break;
        case 'miss': if (vis) this.float(x, y - 30, 'miss', 0xcfd3dd, 11, 0.6); break;
        case 'gold': if (e.team === pt) { this.float(x, y - 46, `+${Math.round(e.amt!)}g`, GOLDH, 15 + Math.min(8, e.amt! / 40), 1.1); this.burst(x, y - 10, 6, GOLDH, 70, 3.5, 0.6); } break;
        case 'lasthit': if (e.team === pt) audio.play('lasthit', 0.7, 0.05); break;
        case 'deny': if (vis) { this.float(x, y - 40, e.team === pt ? 'DENIED!' : 'denied', e.team === pt ? 0xc59aff : 0xff8a8a, 14); if (e.team === pt) audio.play('deny', 0.7); } break;
        case 'death': {
          const v = this.views.get(e.id!); if (!v) break; this.views.delete(e.id!); if (v.lvl) v.lvl.visible = false;
          const kind = e.text!, struct = kind === 'tower' || kind === 'barracks' || kind === 'ancient' || kind === 'building';
          if (kind === 'hero') { v.c.visible = false; this.views.set(e.id!, v); if (v.lvl) v.lvl.visible = false; }
          else this.dying.push({ c: v.c, t: 0, dur: struct ? (kind === 'building' ? 0.5 : 1.1) : 0.28, struct, x, y, r: e.r ?? 12, team: e.team! });
          if (!vis && !struct) break;
          const col = TEAM_HEX[e.team!];
          if (kind === 'hero') { this.burst(x, y, 40, col, 190, 6, 0.9); this.burst(x, y, 16, 0xffffff, 120, 4, 0.6); this.ring(x, y, 10, 150, col, 0.6, 8); this.shake(12); audio.play(e.team === pt ? 'heroDeath' : 'kill', 0.9); this.float(x, y - 60, e.team === pt ? 'YOU FELL' : 'HERO SLAIN', e.team === pt ? 0xff5a5a : GOLDH, 22, 1.6); }
          else if (!struct) { this.burst(x, y, kind === 'boss' ? 50 : 7, kind === 'boss' ? 0xc56ae0 : col, kind === 'boss' ? 220 : 80, kind === 'boss' ? 7 : 3.5, 0.45); audio.play('death', 0.25, 0.08); if (kind === 'boss') { this.shake(14); this.ring(x, y, 20, 240, 0xe04a8a, 0.8, 10); } }
          break;
        }
        case 'structureDown': {
          const big = e.text !== 'building'; audio.play('towerFall', e.text === 'ancient' ? 1 : 0.8); this.shake(e.text === 'ancient' ? 18 : 12);
          this.ring(x, y, 20, e.text === 'ancient' ? 320 : 170, 0xffffff, 0.7, 9); this.burst(x, y, 34, 0xcfc9bd, 200, 7, 1.0, true); this.burst(x, y, 20, TEAM_HEX[e.team!], 160, 5, 0.8);
          if (big) this.float(x, y - 90, e.text === 'ancient' ? 'ANCIENT DESTROYED' : e.text === 'barracks' ? 'BARRACKS DOWN' : 'TOWER DOWN', e.team === pt ? 0xff7a6a : GOLDH, 20, 1.8);
          break;
        }
        case 'card': {
          const c = CARDS[e.text!]; if (e.team !== pt && !vis && c.type !== 'spell') break;
          if (c.type === 'spell') { audio.play('cast', 0.6); } else { audio.play('deploy', e.team === pt ? 0.8 : 0.45); this.ring(x, y, 60, 14, TEAM_LIGHT[e.team!], 0.45, 5); }
          break;
        }
        case 'cast': if (vis) { audio.play(e.amt ? 'cast' : 'cast', 0.5, 0.05); this.burst(x, y, 6, TEAM_LIGHT[e.team!], 60, 3, 0.4); } break;
        case 'impact': {
          if (!vis) break; const r = e.r ?? 0; const k = e.text ?? '';
          const col = /frost|undertow|bubble|bulwark|hobble/.test(k) ? 0x8fd4ff : /mend|heal|tide|bark|rain/.test(k) ? 0x7dff9a : /rally|warcry|fangs|ironhide|veil|tumble/.test(k) ? 0xffe08a : 0xff8a3a;
          if (r > 0) { this.ring(x, y, r * 0.2, r, col, 0.45, 7, true); this.burst(x, y, Math.min(40, 8 + r / 6), col, r * 1.6, 5, 0.5); }
          const snd = col === 0x8fd4ff ? (k === 'bulwark' || k === 'bubble' ? 'shield' : 'frost') : col === 0x7dff9a ? 'heal' : col === 0xffe08a ? 'buff' : /summon|sapling|elder/.test(k) ? 'summon' : r >= 130 ? 'boom' : 'zap';
          audio.play(snd, r >= 200 ? 0.9 : 0.6, 0.05);
          if (r >= 200 || k === 'firebomb') this.shake(r >= 200 ? 10 : 7);
          break;
        }
        case 'blink': if (vis) { this.ring(x, y, 40, 6, 0xd0b8ff, 0.3, 4); this.burst(x, y, 10, 0xd0b8ff, 100, 3, 0.35); audio.play('blink', 0.5); } break;
        case 'levelup': if (e.team === pt) { this.ring(x, y, 10, 90, GOLDH, 0.7, 6); this.burst(x, y, 18, GOLDH, 110, 4, 0.8); this.float(x, y - 60, `LEVEL ${e.amt}`, GOLDH, 18, 1.4); audio.play('levelup', 0.7); } break;
        case 'rune': if (vis) { this.ring(x, y, 10, 80, RUNE_COL[e.text!], 0.5, 6); this.burst(x, y, 16, RUNE_COL[e.text!], 120, 4, 0.6); if (e.team === pt) { this.float(x, y - 50, RUNE_NAME[e.text!], RUNE_COL[e.text!], 18, 1.4); audio.play('rune', 0.8); } } break;
        case 'runeSpawn': audio.play('runeSpawn', 0.5); break;
        case 'zap': if (vis) { this.bolts.push({ x1: e.a, y1: e.b, x2: x, y2: y, life: 0.2, color: 0xffffff }); audio.play('zap', 0.3, 0.2); } break;
        case 'respawn': if (e.team === pt || vis) { this.ring(x, y, 80, 10, TEAM_LIGHT[e.team!], 0.5, 6); this.burst(x, y, 14, TEAM_LIGHT[e.team!], 90, 4, 0.6); if (e.team === pt) audio.play('respawn', 0.7); } break;
        case 'reviveUsed': if (vis) this.float(x, y - 70, 'PHOENIX EMBER', 0xff9a3a, 18, 1.6); break;
        case 'bossSpawn': audio.play('boss', 0.8); this.ring(x, y, 20, 200, 0xe04a8a, 0.9, 8); break;
        case 'bossDown': audio.play('boss', 0.7, 0, 1.4); break;
        case 'essenceRate': audio.play('essenceRate', 0.9); break;
        case 'suddenDeath': audio.play('sudden', 0.9); this.vignette = 1; break;
        case 'wave': audio.play('wave', 0.25); break;
        case 'buy': if (e.team === pt) audio.play('buy', 0.7); break;
        case 'use': if (e.team === pt) audio.play('heal', 0.5); break;
        case 'recall': if (vis) { this.ring(x, y, 90, 10, 0xe8d27a, 0.5, 6); audio.play('blink', 0.6); } break;
      }
    }
  }

  // ------------------------------------------------------------------ frame
  render(sim: Sim, alpha: number, dt: number, ui: UiOverlay) {
    this.frame++; this.clock += dt;
    const pt = this.playerTeam, T = sim.tick, cam = this.cam, me = sim.heroes[pt];
    // camera
    if (cam.follow) { const tx = me.x, ty = me.alive ? me.y : me.hero!.deathY || me.y; cam.x += (tx - cam.x) * Math.min(1, dt * 6); cam.y += (ty - cam.y) * Math.min(1, dt * 6); }
    const viewH = (this.H - this.hudBottom) / cam.scale, viewW = this.W / cam.scale;
    const padY = 70;
    cam.y = viewH >= M.h + padY * 2 ? M.h / 2 : Math.max(viewH / 2 - padY, Math.min(M.h - viewH / 2 + padY, cam.y));
    cam.x = viewW >= M.w + 80 ? M.w / 2 : Math.max(viewW / 2 - 40, Math.min(M.w - viewW / 2 + 40, cam.x));
    cam.shake *= Math.pow(0.0015, dt);
    const sx = (Math.random() - 0.5) * cam.shake, sy = (Math.random() - 0.5) * cam.shake;
    this.world.scale.set(cam.scale);
    this.world.position.set(Math.round(this.W / 2 - cam.x * cam.scale + sx), Math.round((this.H - this.hudBottom) / 2 - cam.y * cam.scale + sy));

    const d = this.decal, o = this.over, gl = this.glow; d.clear(); o.clear(); gl.clear();
    // moving glints on the river
    for (let i = 0; i < 46; i++) { const ph = this.clock * 0.35 + i * 1.7, gx = ((i * 197.3 + this.clock * (14 + (i % 5) * 5)) % (M.w + 80)) - 40, gy = M.riverY + Math.sin(i * 12.9) * (M.riverHalf - 14) + Math.sin(ph) * 4; gl.ellipse(gx, gy, 14 + (i % 4) * 6, 1.6).fill({ color: 0x9fe8ff, alpha: 0.10 + 0.08 * Math.sin(ph * 2 + i) }); }
    this.sources.length = 0;
    const myHit = me.dmg * me.dmgMul;
    const seen = new Set<number>();

    // deploy zone / targeting overlays (under units)
    if (ui.dragCard) this.drawDeploy(sim, ui);
    if (ui.aimSlot >= 0 && me.alive) {
      const ab = me.hero!.def.abilities[ui.aimSlot];
      if (ab.range > 0) d.circle(me.x, me.y, ab.range).stroke({ width: 3, color: 0xffffff, alpha: 0.35 });
      if (ab.radius) d.circle(ab.cast === 'self' ? me.x : ui.aimX, ab.cast === 'self' ? me.y : ui.aimY, ab.radius).fill({ color: hex(ab.color), alpha: 0.18 }).stroke({ width: 3, color: hex(ab.color), alpha: 0.8 });
      else if (ab.cast !== 'self') d.circle(ui.aimX, ui.aimY, 16).stroke({ width: 3, color: hex(ab.color), alpha: 0.9 });
    }
    if (ui.marker) { const m = ui.marker, k = 1 - m.t; if (k > 0) d.circle(m.x, m.y, 8 + k * 16).stroke({ width: 3, color: m.attack ? 0xff5a4a : 0x7dff9a, alpha: k }); }

    // zones
    for (const z of sim.zones) {
      if (z.team !== pt && !this.zoneVisible(z.x, z.y)) continue;
      const col = z.hps ? 0x5fd068 : z.team === pt ? 0x6ab8ff : 0xff6a3a; const pulse = 0.12 + Math.sin(this.clock * 8) * 0.04;
      d.circle(z.x, z.y, z.radius).fill({ color: col, alpha: pulse }).stroke({ width: 3, color: col, alpha: 0.6 }); gl.circle(z.x, z.y, z.radius * 0.8).fill({ color: col, alpha: 0.10 });
      if (this.frame % 3 === 0 && this.parts.length < 700) { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * z.radius; this.parts.push({ x: z.x + Math.cos(a) * r, y: z.y + Math.sin(a) * r, vx: 0, vy: 0, z: z.hps ? 0 : 70, vz: z.hps ? 50 : -160, life: 0.45, max: 0.45, size: 3.5, color: col, sq: !z.hps }); }
    }
    // telegraphs
    for (const p of sim.pending) {
      const k = (T - p.start) / Math.max(1, p.at - p.start); const col = p.team === pt ? 0x6ab8ff : 0xff5a3a;
      const src = p.src ? sim.byId.get(p.src) : null;
      if (p.effects[0].t === 'line' && src) {
        const e = p.effects[0], dx = p.x - src.x, dy = p.y - src.y, L = Math.hypot(dx, dy) || 1, nx = dx / L, ny = dy / L, hw = e.width! / 2, len = e.length!;
        d.poly([src.x - ny * hw, src.y + nx * hw, src.x + nx * len - ny * hw, src.y + ny * len + nx * hw, src.x + nx * len + ny * hw, src.y + ny * len - nx * hw, src.x + ny * hw, src.y - nx * hw]).fill({ color: col, alpha: 0.25 + k * 0.3 });
      } else if (p.radius > 0) {
        let x = p.x, y = p.y; if (p.fromHero && src && Math.hypot(p.x - src.x, p.y - src.y) < 60) { x = src.x; y = src.y; }
        d.circle(x, y, p.radius).fill({ color: col, alpha: 0.12 }).stroke({ width: 3, color: col, alpha: 0.9 });
        d.circle(x, y, p.radius * k).fill({ color: col, alpha: 0.25 });
        if (!p.fromHero) { const fy = y - (1 - k) * 420; o.circle(x, fy, 13).fill({ color: 0x1d1626 }); o.circle(x, fy, 10).fill({ color: col }); o.circle(x - 3, fy - 3, 3).fill({ color: 0xffffff, alpha: 0.7 }); }
      }
    }

    // units
    for (const u of sim.units) {
      if (!u.alive) { const v = this.views.get(u.id); if (v) { v.c.visible = false; if (v.lvl) v.lvl.visible = false; } continue; }
      seen.add(u.id);
      if (u.team === pt) this.sources.push({ x: u.x, y: u.y, r: u.vision, high: isHigh(u.y) });
      const visible = u.team === pt || u.vis[pt];
      let v = this.views.get(u.id);
      if (!visible) { if (v) { v.c.visible = false; if (v.lvl) v.lvl.visible = false; v.px = u.x; v.py = u.y; } continue; }
      if (!v) v = this.makeView(u);
      v.c.visible = true;
      const x = v.px + (u.x - v.px) * alpha, y = v.py + (u.y - v.py) * alpha;
      // deploy drop-in
      let oy = 0, sxs = 1, sys = 1, al = 1;
      if (T < u.activeAt) {
        const p = 1 - (u.activeAt - T) / (C.deck.deployTime * 60); const fall = Math.max(0, 1 - p * 2.2);
        oy = -fall * fall * 260; al = Math.min(1, p * 5);
        if (fall === 0) { const b = Math.max(0, 1 - (p - 0.455) * 5); sxs = 1 + b * 0.25; sys = 1 - b * 0.3; }
        d.circle(u.x, u.y, u.r + 7).stroke({ width: 3, color: TEAM_LIGHT[u.team], alpha: 0.35 });
        d.moveTo(u.x, u.y - u.r - 7).arc(u.x, u.y, u.r + 7, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2).stroke({ width: 4, color: TEAM_LIGHT[u.team], alpha: 0.95 });
      }
      // motion
      const moved = Math.abs(u.x - v.lastX) + Math.abs(u.y - v.lastY) > 0.05; v.lastX = u.x; v.lastY = u.y;
      if (moved && !u.structure) { v.bob += dt * 13; oy -= Math.abs(Math.sin(v.bob + u.id)) * (u.hero ? 3.5 : 2.5); }
      const ak = Math.max(0, 1 - (T - u.atkTick) / 9);
      let ox = 0;
      if (ak > 0 && !u.structure) { const s = (u.def.projSpeed ? -3 : 7) * Math.sin(ak * Math.PI); ox = Math.cos(u.facing) * s; oy += Math.sin(u.facing) * s; sys *= 1 + ak * 0.08; }
      if (u.structure && ak > 0) sys *= 1 - ak * 0.05;
      v.c.position.set(x + ox, y + oy); v.c.zIndex = y;
      v.c.scale.set(sxs, sys);
      const invis = u.invisEnd > T;
      v.c.alpha = al * (invis ? 0.45 : 1);
      v.spr.tint = u.stunEnd > T && T >= u.activeAt ? 0xb8b8d8 : u.slowEnd > T ? 0x9cc8ff : 0xffffff;
      v.flash.alpha = Math.max(0, 1 - (T - u.flash) / 7) * 0.85;
      // ground shadow + rings
      { const sk = u.structure ? 1.9 : 1.25; d.ellipse(x + u.r * 0.7 * sk, y + u.r * 0.32 * sk, u.r * 1.25 * sk, u.r * 0.5 * sk).fill({ color: 0x000000, alpha: 0.26 }); d.ellipse(x + 2, y + 3, u.r * 1.05, u.r * 0.55).fill({ color: 0x000000, alpha: 0.34 }); }
      if (u.hero || u.kind === 'tower' || u.kind === 'ancient' || u.kind === 'boss') { const lc = u.team === 2 ? 0xff3a8a : TEAM_HEX[u.team], fl = 1 + Math.sin(this.clock * 5 + u.id) * 0.08, R0 = (u.kind === 'ancient' ? 150 : u.hero ? 70 : 100) * fl; gl.ellipse(x, y, R0, R0 * 0.62).fill({ color: lc, alpha: 0.05 }); gl.ellipse(x, y, R0 * 0.6, R0 * 0.37).fill({ color: lc, alpha: 0.06 }); if (!u.hero) { gl.circle(x, y - v.h * 0.86, 22 * fl).fill({ color: lc, alpha: 0.16 }); gl.circle(x, y - v.h * 0.86, 9).fill({ color: 0xffffff, alpha: 0.35 }); } }
      if (ak > 0.3 && !u.def.projSpeed && !u.structure) gl.circle(x + Math.cos(u.facing) * (u.r + 8), y - v.h * 0.35 + Math.sin(u.facing) * (u.r + 8), 9 * ak).fill({ color: 0xfff0c0, alpha: 0.5 * ak });
      if (u === me) d.ellipse(x, y, u.r + 9, (u.r + 9) * 0.62).stroke({ width: 3, color: 0xffffff, alpha: 0.85 });
      if (u.id === ui.hoverId && u !== me) d.ellipse(x, y, u.r + 7, (u.r + 7) * 0.62).stroke({ width: 3, color: u.team === pt ? 0x7dff9a : 0xff5a4a, alpha: 0.9 });
      if (u.dmgMul > 1.05) d.ellipse(x, y, u.r + 5, (u.r + 5) * 0.62).stroke({ width: 3, color: 0xff9a3a, alpha: 0.5 + Math.sin(this.clock * 10) * 0.25 });
      if (u.shield > 0 && u.shieldEnd > T) o.ellipse(x, y - v.h * 0.4, u.r * 1.5, v.h * 0.62).fill({ color: 0x9adfff, alpha: 0.2 }).stroke({ width: 2.5, color: 0xc8f0ff, alpha: 0.85 });
      if (u.invuln && u.structure) o.ellipse(x, y - v.h * 0.42, u.r * 1.25, v.h * 0.6).stroke({ width: 2.5, color: GOLDH, alpha: 0.35 + Math.sin(this.clock * 2 + u.id) * 0.1 });
      if (u.stunEnd > T && T >= u.activeAt) for (let i = 0; i < 3; i++) { const a = this.clock * 6 + i * 2.094; o.star(x + Math.cos(a) * u.r * 0.8, y - v.h - 4 + Math.sin(a) * 4, 4, 4.5, 2).fill({ color: GOLDH }); }
      if (u.kind === 'ancient' && this.frame % 6 === 0 && this.parts.length < 700) this.parts.push({ x: x + (Math.random() - 0.5) * 40, y, vx: 0, vy: 0, z: 30 + Math.random() * 60, vz: 40, life: 0.8, max: 0.8, size: 3, color: TEAM_LIGHT[u.team], sq: false });
      if (u.hero && u.hero.recallAt) { const k = 1 - (u.hero.recallAt - T) / 150; d.circle(x, y, 40).stroke({ width: 4, color: 0xe8d27a, alpha: 0.4 }); d.moveTo(x, y - 40).arc(x, y, 40, -Math.PI / 2, -Math.PI / 2 + k * 6.283).stroke({ width: 5, color: 0xffe9a0 }); }
      // health bar
      if (T >= u.activeAt || u.hp < u.maxHp) {
        const hero = !!u.hero, big = hero || (u.structure && u.kind !== 'building') || u.kind === 'boss';
        const bw = big ? Math.max(46, u.r * 2.2) : Math.max(20, u.r * 2.1), bh = big ? 7 : 4.5; const bx = x - bw / 2, by = y - v.h - (hero ? 16 : 9) + oy * 0.0;
        const f = Math.max(0, u.hp / u.maxHp);
        let col = u.team === 2 ? 0xd8e08a : TEAM_HEX[u.team];
        if (u.team !== pt && u.team !== 2 && u.kind !== 'hero' && !u.structure && u.hp <= myHit / (1 + C.armorK * u.armor) && me.alive) col = GOLDH; // last-hit ready
        if (u.team === pt && u.kind === 'creep' && f < C.hero.denyHpFrac) col = 0xc59aff;      // deniable
        o.roundRect(bx - 1.5, by - 1.5, bw + 3, bh + 3, 2.5).fill({ color: INKH, alpha: 0.9 });
        o.rect(bx, by, bw * f, bh).fill({ color: col });
        o.rect(bx, by, bw * f, bh * 0.4).fill({ color: 0xffffff, alpha: 0.25 });
        if (u.shield > 0 && u.shieldEnd > T) o.rect(bx, by - 3, bw * Math.min(1, u.shield / u.maxHp), 2).fill({ color: 0xc8f0ff });
        if (hero) {
          const h = u.hero!; o.roundRect(bx - 1.5, by + bh + 0.5, bw + 3, 5, 2).fill({ color: INKH, alpha: 0.9 }); o.rect(bx, by + bh + 1.5, bw * (h.mana / h.maxMana), 3).fill({ color: 0x5aa8ff });
          o.circle(bx - 9, by + 4, 9).fill({ color: INKH }).stroke({ width: 2, color: TEAM_HEX[u.team] });
          const lt = v.lvl!; lt.visible = true; lt.position.set(bx - 9, by + 3.5); const s = String(h.level); if (lt.text !== s) lt.text = s;
        }
      }
    }
    for (const [id, v] of this.views) if (!seen.has(id)) { v.c.destroy({ children: true }); if (v.lvl) v.lvl.destroy(); this.views.delete(id); }

    // dying animations
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const dy = this.dying[i]; dy.t += dt; const k = dy.t / dy.dur;
      if (k >= 1) {
        dy.c.destroy({ children: true }); this.dying.splice(i, 1);
        if (dy.struct) { const g = this.rubble; for (let j = 0; j < 7; j++) { const a = j * 0.9 + dy.x, rr = dy.r * (0.3 + ((j * 37) % 10) / 14); g.circle(dy.x + Math.cos(a) * rr, dy.y + Math.sin(a) * rr * 0.6, 5 + (j * 13) % 7).fill({ color: j % 2 ? 0x4d4852 : 0x6f6a72 }).stroke({ width: 2, color: INKH }); } g.ellipse(dy.x, dy.y, dy.r * 0.5, dy.r * 0.25).fill({ color: TEAM_DARK[dy.team], alpha: 0.8 }); this.ring(dy.x, dy.y, dy.r * 0.5, dy.r * 3, 0xd8d0c0, 0.6, 10, true); }
        continue;
      }
      if (dy.struct) { dy.c.scale.set(1 + k * 0.08, 1 - k * 0.85); dy.c.x = dy.x + Math.sin(dy.t * 70) * 3 * (1 - k); dy.c.rotation = Math.sin(dy.t * 9) * 0.05 * k; if (this.frame % 2 === 0) this.burst(dy.x + (Math.random() - 0.5) * dy.r * 2, dy.y, 2, 0xcfc9bd, 110, 6, 0.7, true); }
      else { dy.c.scale.set(1 + k * 0.5, 1 - k * 0.6); dy.c.alpha = 1 - k; }
    }

    // projectiles
    for (const p of sim.projectiles) {
      if (p.team !== pt && !this.visibleAt(p.x, p.y)) continue;
      const col = p.team === 2 ? 0xd8e08a : TEAM_LIGHT[p.team]; const r = p.big ? 6.5 : 4;
      gl.circle(p.x, p.y - 16, r * 3.4).fill({ color: TEAM_HEX[p.team], alpha: 0.22 }); gl.circle(p.x, p.y - 16, r * 1.8).fill({ color: col, alpha: 0.5 }); o.circle(p.x, p.y - 16, r * 0.7).fill({ color: 0xffffff });
      d.ellipse(p.x, p.y, r, r * 0.5).fill({ color: 0, alpha: 0.2 });
    }
    // runes
    for (let i = 0; i < 2; i++) {
      const r = sim.runes[i], t = this.runeText[i];
      if (!r) { t.visible = false; continue; }
      const col = RUNE_COL[r.type], bob = Math.sin(this.clock * 3 + i) * 5, y = r.y - 26 + bob;
      d.circle(r.x, r.y, 26 + Math.sin(this.clock * 4) * 3).fill({ color: col, alpha: 0.25 }); gl.circle(r.x, y, 46).fill({ color: col, alpha: 0.14 }); gl.circle(r.x, y, 24).fill({ color: col, alpha: 0.25 });
      o.poly([r.x, y - 20, r.x + 15, y, r.x, y + 20, r.x - 15, y]).fill({ color: col }).stroke({ width: 3, color: INKH });
      o.poly([r.x, y - 12, r.x + 6, y - 2, r.x - 6, y - 2]).fill({ color: 0xffffff, alpha: 0.6 });
      t.visible = true; t.text = RUNE_NAME[r.type]; t.style.fill = col; t.position.set(r.x, r.y - 62 + bob);
    }
    // bolts, rings, particles
    for (let i = this.bolts.length - 1; i >= 0; i--) { const b = this.bolts[i]; b.life -= dt; if (b.life <= 0) { this.bolts.splice(i, 1); continue; } const mx = (b.x1 + b.x2) / 2 + (Math.random() - 0.5) * 40, my = (b.y1 + b.y2) / 2 + (Math.random() - 0.5) * 40; o.moveTo(b.x1, b.y1 - 30).lineTo(mx, my - 20).lineTo(b.x2, b.y2 - 10).stroke({ width: 4, color: b.color, alpha: b.life * 5 }); }
    for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.life -= dt; if (r.life <= 0) { this.rings.splice(i, 1); continue; } const k = 1 - r.life / r.max, e = 1 - (1 - k) * (1 - k), rad = r.r0 + (r.r1 - r.r0) * e; if (r.fill) d.circle(r.x, r.y, rad).fill({ color: r.color, alpha: (1 - k) * 0.3 }); d.circle(r.x, r.y, rad).stroke({ width: r.w * (1 - k) + 1, color: r.color, alpha: 1 - k }); gl.circle(r.x, r.y, rad).stroke({ width: r.w * 2.2 * (1 - k) + 2, color: r.color, alpha: (1 - k) * 0.45 }); }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.life -= dt; if (p.life <= 0) { this.parts[i] = this.parts[this.parts.length - 1]; this.parts.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= 420 * dt; if (p.z < 0) { p.z = 0; p.vz *= -0.4; p.vx *= 0.6; p.vy *= 0.6; }
      const k = p.life / p.max, s = p.size * (0.4 + k * 0.6);
      if (p.sq) o.rect(p.x - s, p.y - p.z - s, s * 2, s * 2).fill({ color: p.color, alpha: Math.min(1, k * 2) }); else { o.circle(p.x, p.y - p.z, s * 0.6).fill({ color: p.color, alpha: Math.min(1, k * 2) }); gl.circle(p.x, p.y - p.z, s * 2.2).fill({ color: p.color, alpha: Math.min(1, k * 2) * 0.3 }); }
    }
    for (let i = this.floats.length - 1; i >= 0; i--) { const f = this.floats[i]; f.life -= dt; if (f.life <= 0) { f.t.visible = false; this.textPool.push(f.t); this.floats.splice(i, 1); continue; } f.y += f.vy * dt; f.vy *= 1 - dt * 1.5; f.t.position.set(f.x, f.y); f.t.alpha = Math.min(1, f.life / f.max * 3); }

    if (this.frame % 3 === 0) this.drawFog(sim);
    this.app.renderer.render(this.app.stage);
  }

  private zoneVisible(x: number, y: number) { return this.visibleAt(x, y); }

  private drawDeploy(sim: Sim, ui: UiOverlay) {
    const d = this.decal, pt = this.playerTeam, c = CARDS[ui.dragCard!]; if (!c) return;
    const col = TEAM_HEX[pt];
    if (c.type !== 'spell') {
      const y0 = mirrorY(pt, M.riverY + M.riverHalf), y1 = mirrorY(pt, M.h);
      d.rect(0, Math.min(y0, y1), M.w, Math.abs(y1 - y0)).fill({ color: col, alpha: 0.13 }).stroke({ width: 4, color: col, alpha: 0.7 });
      const fwd = sim.teams[pt].forward;
      for (let l = 0; l < 2; l++) if (fwd[l]) { const fy = mirrorY(pt, M.deployForwardY); d.rect(M.laneX[l] - M.deployLaneHalfWidth, Math.min(fy, y0), M.deployLaneHalfWidth * 2, Math.abs(y0 - fy)).fill({ color: col, alpha: 0.13 }).stroke({ width: 4, color: col, alpha: 0.7 }); }
    }
    const ok = ui.dragValid, gc = ok ? 0xffffff : 0xff4a4a;
    if (c.type === 'spell') d.circle(ui.dragX, ui.dragY, c.radius ?? 100).fill({ color: ok ? col : 0xff4a4a, alpha: 0.22 }).stroke({ width: 4, color: gc, alpha: 0.9 });
    else { const u = UNITS[c.unit!]; const n = c.count ?? 1; for (let i = 0; i < n; i++) { let ox = 0, oy = 0; if (c.type === 'building' && n > 1) ox = (i - (n - 1) / 2) * (u.r * 2 + 6); else if (n > 1) { const a = (i / n) * Math.PI * 2 + 0.6, rr = u.r * (n > 3 ? 2.1 : 1.5); ox = Math.cos(a) * rr; oy = Math.sin(a) * rr; } d.circle(ui.dragX + ox, ui.dragY + oy, u.r).fill({ color: ok ? col : 0xff4a4a, alpha: 0.55 }).stroke({ width: 3, color: gc }); } if (u.range > 60) d.circle(ui.dragX, ui.dragY, u.range + u.r).stroke({ width: 2, color: gc, alpha: 0.4 }); }
  }

  private drawFog(sim: Sim) {
    const cv = this.fogCv, c = cv.getContext('2d')!, s = 150 / M.w;
    c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, cv.width, cv.height);
    c.fillStyle = 'rgba(3,5,14,0.74)'; c.fillRect(0, 0, cv.width, cv.height);
    c.globalCompositeOperation = 'destination-out';
    const hole = (x: number, y: number, r: number) => { const g = c.createRadialGradient(x * s, y * s, r * s * 0.72, x * s, y * s, r * s); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.beginPath(); c.arc(x * s, y * s, r * s, 0, 6.3); c.fill(); };
    for (const src of this.sources) if (src.high) hole(src.x, src.y, src.r);
    // low-ground viewers cannot see up onto high ground
    c.save(); c.beginPath(); c.rect(0, (M.riverY - M.highGround) * s, cv.width, M.highGround * 2 * s); c.clip();
    for (const src of this.sources) if (!src.high) hole(src.x, src.y, src.r);
    c.restore();
    void sim;
    this.fogTex.source.update();
    if (this.vignette > 0) this.vignette = 1;
  }
}
export { HERO_ARTS };
