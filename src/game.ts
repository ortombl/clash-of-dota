import { CONFIG as C } from './data/config';
import { CARDS, DEFAULT_DECK } from './data/cards';
import { HEROES, HERO_LIST } from './data/heroes';
import { Sim } from './sim/sim';
import { RNG } from './sim/rng';
import type { Command, Unit } from './sim/types';
import { Bot, randomDeck, type Difficulty } from './ai/bot';
import { Renderer, type UiOverlay } from './render/renderer';
import { audio } from './audio/audio';
import { Hud } from './ui/hud';
import { Screens } from './ui/screens';
import { Tutorial } from './ui/tutorial';

export interface Settings { hero: string; deck: string[]; difficulty: Difficulty; sfx: number; music: number; speed: number }
type DistCmd<T> = T extends any ? Omit<T, 'team'> : never;
const STEP = 1 / C.tickRate;
const SAVE_KEY = 'frostember-settings-v1';

export class Game {
  renderer = new Renderer(); hud!: Hud; screens!: Screens; tutorial: Tutorial | null = null;
  sim: Sim | null = null; bot: Bot | null = null; autoBot: Bot | null = null;
  state: 'menu' | 'play' | 'pause' | 'over' = 'menu';
  team: 0 = 0; tutorialMode = false;
  settings: Settings = { hero: 'brakka', deck: DEFAULT_DECK.slice(), difficulty: 'normal', sfx: 0.7, music: 0.35, speed: 1 };
  ui: UiOverlay = { dragCard: null, dragX: 0, dragY: 0, dragValid: false, aimSlot: -1, aimX: 0, aimY: 0, hoverId: 0, marker: null };
  armedCard = -1;
  mouse = { sx: 0, sy: 0, wx: 0, wy: 0 };
  private acc = 0; private last = 0; private keys = new Set<string>(); private endTimer = 0;
  private touches = new Map<number, { x: number; y: number; sx: number; sy: number; moved: boolean }>(); private pinch = 0;
  auto = { enabled: false, speed: 1, matches: 0, target: 0, results: [] as string[], diff: 'normal' as Difficulty };
  fps = 60; maxUnits = 0;

  async boot() {
    this.loadSettings();
    const canvas = document.getElementById('stage') as HTMLCanvasElement;
    try { await Promise.all([document.fonts.load('20px "Lilita One"'), document.fonts.load('600 14px "Fredoka"')]); } catch { /* fallback fonts are fine */ }
    await this.renderer.init(canvas);
    this.hud = new Hud(this); this.screens = new Screens(this);
    this.applyScale(); window.addEventListener('resize', () => { this.applyScale(); this.renderer.resize(); });
    this.bindInput(canvas);
    const q = new URLSearchParams(location.search);
    if (q.get('auto')) { this.auto.enabled = true; this.auto.speed = +(q.get('speed') ?? 8); this.auto.target = +(q.get('matches') ?? 1); this.auto.diff = (q.get('diff') as Difficulty) ?? 'normal'; this.startMatch(false); }
    else if (q.get('play')) { this.startMatch(q.get('play') === 'tutorial'); }
    else this.screens.menu();
    this.last = performance.now();
    requestAnimationFrame(t => this.loop(t));
  }

  private applyScale() {
    const W = window.innerWidth, H = window.innerHeight; const narrow = W / H < 1.2;
    const u = narrow ? Math.max(0.5, Math.min(1.4, W / 640, H / 760)) : Math.max(0.55, Math.min(1.6, W / 1280, H / 720));
    document.documentElement.style.setProperty('--u', u + 'px'); document.body.classList.toggle('narrow', narrow);
    this.renderer.hudBottom = Math.round(150 * u);
  }

  loadSettings() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null'); if (s && typeof s === 'object') { Object.assign(this.settings, s); if (!HEROES[this.settings.hero]) this.settings.hero = 'brakka'; this.settings.deck = (this.settings.deck ?? []).filter((c: string) => CARDS[c]).slice(0, C.deck.size); if (this.settings.deck.length !== C.deck.size) this.settings.deck = DEFAULT_DECK.slice(); } } catch { /* storage unavailable */ } audio.setVolumes(this.settings.sfx, this.settings.music); }
  saveSettings() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.settings)); } catch { /* storage unavailable */ } }

  // ------------------------------------------------------------------ match lifecycle
  startMatch(tutorial: boolean) {
    audio.init(); audio.startMusic();
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0; const r = new RNG(seed);
    this.tutorialMode = tutorial;
    const enemyHero = r.pick(HERO_LIST.filter(h => h.id !== this.settings.hero)).id;
    let hero = this.settings.hero, deck = this.settings.deck.slice();
    if (this.auto.enabled) { hero = r.pick(HERO_LIST).id; deck = randomDeck(r); }
    this.sim = new Sim({ seed, heroes: [hero, enemyHero], decks: [deck, randomDeck(r)] });
    this.bot = new Bot(this.sim, 1, tutorial ? 'easy' : this.auto.enabled ? this.auto.diff : this.settings.difficulty, seed + 17);
    this.bot.passive = tutorial;
    this.autoBot = this.auto.enabled ? new Bot(this.sim, 0, 'normal', seed + 5) : null;
    this.screens.clear(); this.renderer.reset(); this.hud.build(this.sim);
    this.tutorial = tutorial ? new Tutorial(this) : null;
    this.state = 'play'; this.acc = 0; this.armedCard = -1; this.ui.aimSlot = -1; this.ui.dragCard = null; this.ui.marker = null; this.endTimer = 0;
    const me = this.sim.heroes[0]; this.renderer.cam.follow = true; this.renderer.cam.x = me.x; this.renderer.cam.y = me.y; this.renderer.cam.scale = this.renderer.defaultScale();
    (window as any).__game = this;
  }
  restart() { this.startMatch(this.tutorialMode); }
  toMenu() { this.state = 'menu'; this.sim = null; this.tutorial = null; this.hud.root.classList.add('hidden'); this.hud.cancelDrag(); this.renderer.reset(); audio.stopMusic(); this.screens.menu(); }
  togglePause() { if (this.state === 'play') { this.state = 'pause'; this.hud.toggleShop(false); this.screens.pause(); } else if (this.state === 'pause') { this.state = 'play'; this.screens.clear(); this.last = performance.now(); } }
  onTutorialDone() { if (this.bot) this.bot.passive = false; this.hud.toast('The bot is awake. Fight!', 'good'); }
  toggleFullscreen() { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch { /* not allowed */ } }

  // ------------------------------------------------------------------ commands
  cmd(c: DistCmd<Command>) { this.sim?.command({ ...c, team: this.team } as Command); }
  private fail(msg: string) { audio.play('error', 0.5, 0.2); this.hud.toast(msg, 'bad'); }

  armCard(slot: number) {
    this.armedCard = slot; this.ui.aimSlot = -1;
    if (slot >= 0) { audio.play('cardPick', 0.5); this.hud.aimHint.textContent = 'Click the field to deploy · right-click to cancel'; this.hud.aimHint.classList.remove('hidden'); } else { this.ui.dragCard = null; this.hud.aimHint.classList.add('hidden'); }
  }
  tryDeploy(slot: number, x: number, y: number): boolean {
    const s = this.sim; if (!s || this.state !== 'play') return false; const id = s.teams[this.team].hand[slot], c = CARDS[id];
    if (s.teams[this.team].essence < c.cost) { this.fail('Not enough essence'); return false; }
    if (!s.canDeploy(this.team, id, x, y)) { this.fail(c.type === 'spell' ? 'Out of bounds' : 'Deploy on your side of the river'); return false; }
    this.cmd({ type: 'card', slot, x, y }); this.armCard(-1); return true;
  }

  private unitAt(wx: number, wy: number, pred: (u: Unit) => boolean, pad = 14): Unit | null {
    const s = this.sim!; let best: Unit | null = null, bd = Infinity; const p = pad / this.renderer.cam.scale;
    for (const u of s.units) { if (!u.alive || !pred(u)) continue; if (u.team !== this.team && !u.vis[this.team]) continue; const d = Math.hypot(u.x - wx, (u.y - u.r * 0.7) - wy) - u.r * 1.3; if (d < p && d < bd) { bd = d; best = u; } }
    return best;
  }

  heroOrder(wx: number, wy: number, pick = true) {
    const s = this.sim; if (!s || this.state !== 'play') return; const me = s.heroes[this.team];
    if (!me.alive) return;
    const t = pick ? this.unitAt(wx, wy, u => u !== me && s.validHeroTarget(me, u)) : null;
    if (t) { this.cmd({ type: 'attack', id: t.id }); this.ui.marker = { x: t.x, y: t.y, t: 0, attack: true }; }
    else { this.cmd({ type: 'move', x: wx, y: wy }); this.ui.marker = { x: wx, y: wy, t: 0, attack: false }; }
    this.renderer.cam.follow = this.renderer.cam.follow || Math.hypot(me.x - this.renderer.cam.x, me.y - this.renderer.cam.y) < 500;
  }

  private checkCast(slot: number): boolean {
    const s = this.sim!, me = s.heroes[this.team], h = me.hero!, ab = h.def.abilities[slot];
    if (!me.alive) return false;
    if (h.level < C.hero.unlockLevels[slot]) { this.fail(`${ab.name} unlocks at level ${C.hero.unlockLevels[slot]}`); return false; }
    if (s.tick < h.cds[slot]) { this.fail('On cooldown'); return false; }
    if (h.mana < ab.mana) { this.fail('Not enough mana'); return false; }
    return true;
  }
  private castAt(slot: number, wx: number, wy: number): boolean {
    const s = this.sim!, me = s.heroes[this.team], ab = me.hero!.def.abilities[slot];
    if (ab.cast === 'self') { this.cmd({ type: 'cast', slot, x: me.x, y: me.y, id: 0 }); return true; }
    if (ab.cast === 'point') { this.cmd({ type: 'cast', slot, x: wx, y: wy, id: 0 }); return true; }
    const ok = (u: Unit) => u.team !== this.team && !u.structure && !u.invuln;
    let t = this.unitAt(wx, wy, ok, 60);
    if (!t) { let bd = ab.range + 140; for (const u of s.units) if (u.alive && ok(u) && u.vis[this.team] && (u.team !== 2 || Math.hypot(u.x - wx, u.y - wy) < 120)) { const d = Math.hypot(u.x - me.x, u.y - me.y) - (u.hero ? 120 : 0); if (d < bd) { bd = d; t = u; } } }
    if (!t) { this.fail('No target in range'); return false; }
    this.cmd({ type: 'cast', slot, x: t.x, y: t.y, id: t.id }); return true;
  }
  /** Keyboard quick-cast at the cursor. */
  castKey(slot: number) { if (!this.sim || this.state !== 'play' || !this.checkCast(slot)) return; this.armCard(-1); this.castAt(slot, this.mouse.wx, this.mouse.wy); }
  /** On-screen button: self-casts fire immediately, others wait for a target tap. */
  abilityButton(slot: number) {
    if (!this.sim || this.state !== 'play' || !this.checkCast(slot)) return; const ab = this.sim.heroes[this.team].hero!.def.abilities[slot];
    if (ab.cast === 'self') { this.castAt(slot, 0, 0); return; }
    this.armCard(-1); this.ui.aimSlot = this.ui.aimSlot === slot ? -1 : slot;
    const me = this.sim.heroes[this.team]; this.ui.aimX = me.x; this.ui.aimY = me.y - 120;
    this.hud.aimHint.textContent = `${ab.name}: tap a target`; this.hud.aimHint.classList.toggle('hidden', this.ui.aimSlot < 0);
  }
  private cancelModes(): boolean { const had = this.armedCard >= 0 || this.ui.aimSlot >= 0; this.armCard(-1); this.ui.aimSlot = -1; this.hud.aimHint.classList.add('hidden'); return had; }

  private fieldClick(wx: number, wy: number, right: boolean) {
    if (!this.sim || this.state !== 'play') return;
    if (right) { if (!this.cancelModes()) this.heroOrder(wx, wy); return; }
    if (this.armedCard >= 0) { this.tryDeploy(this.armedCard, wx, wy); return; }
    if (this.ui.aimSlot >= 0) { const slot = this.ui.aimSlot; if (this.checkCast(slot) && this.castAt(slot, wx, wy)) { this.ui.aimSlot = -1; this.hud.aimHint.classList.add('hidden'); } return; }
    this.heroOrder(wx, wy);
  }

  // ------------------------------------------------------------------ input
  private bindInput(canvas: HTMLCanvasElement) {
    const r = this.renderer;
    const setMouse = (e: PointerEvent | WheelEvent) => { this.mouse.sx = e.clientX; this.mouse.sy = e.clientY; };
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('contextmenu', e => { if (this.state !== 'menu') e.preventDefault(); });
    window.addEventListener('pointermove', e => {
      setMouse(e);
      const t = this.touches.get(e.pointerId);
      if (t) {
        if (this.touches.size === 2) { const [a, b] = [...this.touches.values()]; t.x = e.clientX; t.y = e.clientY; const d = Math.hypot(a.x - b.x, a.y - b.y); if (this.pinch) r.zoom(d / this.pinch); this.pinch = d; a.moved = b.moved = true; return; }
        const dx = e.clientX - t.x, dy = e.clientY - t.y; if (!t.moved && Math.hypot(e.clientX - t.sx, e.clientY - t.sy) > 12) t.moved = true;
        if (t.moved) { r.cam.follow = false; r.cam.x -= dx / r.cam.scale; r.cam.y -= dy / r.cam.scale; }
        t.x = e.clientX; t.y = e.clientY;
      }
    });
    canvas.addEventListener('pointerdown', e => {
      audio.init(); setMouse(e); if (!this.sim) return;
      if (e.pointerType === 'touch' || e.button === 1) { this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: e.button === 1 }); this.pinch = 0; if (e.button === 1) e.preventDefault(); return; }
      const w = r.screenToWorld(e.clientX, e.clientY); this.fieldClick(w.x, w.y, e.button === 2);
    });
    const up = (e: PointerEvent) => { const t = this.touches.get(e.pointerId); if (!t) return; this.touches.delete(e.pointerId); this.pinch = 0; if (!t.moved && e.pointerType === 'touch' && e.type === 'pointerup') { const w = r.screenToWorld(e.clientX, e.clientY); this.mouse.wx = w.x; this.mouse.wy = w.y; this.fieldClick(w.x, w.y, false); } };
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', e => { e.preventDefault(); r.zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });
    window.addEventListener('keydown', e => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === 'F11') { e.preventDefault(); this.toggleFullscreen(); return; }
      if (!this.sim || e.repeat && !k.startsWith('Arrow')) return;
      if (k === 'Escape' || k === 'p') { if (k === 'Escape' && this.state === 'play' && (this.cancelModes() || this.hud.shopEl)) { this.hud.toggleShop(false); return; } this.togglePause(); return; }
      if (this.state !== 'play') return;
      this.keys.add(k);
      const qi = 'qwer'.indexOf(k); if (qi >= 0 && k.length === 1) { this.castKey(qi); return; }
      const ci = '1234'.indexOf(k); if (ci >= 0 && k.length === 1) { this.armCard(this.armedCard === ci ? -1 : ci); return; }
      const ii = 'zxcv'.indexOf(k); if (ii >= 0 && k.length === 1) { this.cmd({ type: 'use', slot: ii }); return; }
      if (k === 's') this.cmd({ type: 'stop' });
      else if (k === 'b') this.hud.toggleShop();
      else if (k === ' ') { e.preventDefault(); r.cam.follow = true; }
    });
    window.addEventListener('keyup', e => this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
    window.addEventListener('blur', () => { this.keys.clear(); if (this.state === 'play' && !this.auto.enabled && !this.tutorialMode) this.togglePause(); });
  }

  // ------------------------------------------------------------------ loop
  private loop(now: number) {
    requestAnimationFrame(t => this.loop(t));
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    this.fps += (1 / Math.max(dt, 0.001) - this.fps) * 0.05;
    const s = this.sim, r = this.renderer;
    if (!s) { return; }
    let alpha = 1;
    if (this.state === 'play' || this.state === 'over') {
      const speed = this.auto.enabled ? this.auto.speed : this.settings.speed;
      this.acc += dt * speed; let steps = 0; const maxSteps = this.auto.enabled ? Math.ceil(this.auto.speed * 3) : 10;
      if (this.acc >= STEP) r.snapshot(s);
      while (this.acc >= STEP && steps < maxSteps && !s.over) {
        this.acc -= STEP; steps++;
        this.bot?.update(); this.autoBot?.update();
        s.step();
        if (s.events.length) { r.handleEvents(s, s.events); this.hud.onEvents(s, s.events); this.tutorial?.update(s.events); s.events.length = 0; } else this.tutorial?.update(s.events);
      }
      if (this.acc > STEP * maxSteps) this.acc = 0;
      alpha = s.over ? 1 : Math.min(1, this.acc / STEP);
      if (s.units.length > this.maxUnits) this.maxUnits = s.units.length;
      if (s.over && this.state === 'play') { this.state = 'over'; this.endTimer = this.auto.enabled ? 0.2 : 2.2; this.hud.cancelDrag(); this.hud.toggleShop(false); audio.play(s.winner === this.team ? 'win' : 'lose', 0.9); const loser = s.winner === 2 ? null : s.ancients[1 - s.winner as 0 | 1]; if (loser) { r.cam.follow = false; r.cam.x = loser.x; r.cam.y = loser.y; } }
      if (this.state === 'over' && this.endTimer > 0) { this.endTimer -= dt; if (this.endTimer <= 0) this.finish(); }
    }
    // camera keys
    if (this.state === 'play') { const sp = 900 * dt / r.cam.scale * 0.7; let mx = 0, my = 0; if (this.keys.has('ArrowLeft')) mx--; if (this.keys.has('ArrowRight')) mx++; if (this.keys.has('ArrowUp')) my--; if (this.keys.has('ArrowDown')) my++; if (mx || my) { r.cam.follow = false; r.cam.x += mx * sp; r.cam.y += my * sp; } }
    // cursor-dependent overlays
    const w = r.screenToWorld(this.mouse.sx, this.mouse.sy); this.mouse.wx = w.x; this.mouse.wy = w.y;
    const me = s.heroes[this.team];
    if (this.ui.aimSlot >= 0 && this.touches.size === 0) { this.ui.aimX = w.x; this.ui.aimY = w.y; }
    if (this.armedCard >= 0 && !this.hud.dragging) { const id = s.teams[this.team].hand[this.armedCard]; const o = this.hud.overField(this.mouse.sx, this.mouse.sy) ?? w; this.ui.dragCard = id; this.ui.dragX = o.x; this.ui.dragY = o.y; this.ui.dragValid = s.canDeploy(this.team, id, o.x, o.y) && s.teams[this.team].essence >= CARDS[id].cost; }
    const hov = this.state === 'play' ? this.unitAt(w.x, w.y, u => u !== me && (u.team !== this.team || s.validHeroTarget(me, u))) : null; this.ui.hoverId = hov ? hov.id : 0;
    if (this.ui.marker) { this.ui.marker.t += dt * 2.2; if (this.ui.marker.t >= 1) this.ui.marker = null; }
    r.render(s, alpha, this.state === 'pause' ? 0 : dt, this.ui);
    if (this.state !== 'pause') this.hud.update(s);
  }

  private finish() {
    const s = this.sim!; 
    if (this.auto.enabled) {
      this.auto.matches++; this.auto.results.push(`winner=${s.winner} t=${s.time.toFixed(0)}`);
      console.log(`AUTO_MATCH_DONE ${this.auto.matches} winner=${s.winner} time=${s.time.toFixed(0)} maxUnits=${this.maxUnits} fps=${this.fps.toFixed(0)}`);
      if (this.auto.matches < this.auto.target) { this.startMatch(false); return; }
      console.log('AUTO_ALL_DONE');
    }
    this.screens.postMatch(s);
  }
}
