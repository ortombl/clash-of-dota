import { CONFIG as C } from '../data/config';
import { UNITS } from '../data/units';
import { CARDS } from '../data/cards';
import { HEROES } from '../data/heroes';
import { ITEMS } from '../data/items';
import { CAMPS } from '../data/camps';
import { RNG } from './rng';
import { SpatialHash } from './spatial';
import { ancientPos, dist, fountainPos, inDeployZone, isHigh, laneOf, mirrorY, structY } from './map';
import type { AbilityDef, Buff, Command, Effect, MatchOptions, Pending, Projectile, Rune, SimEvent, Team, TeamState, Unit, UnitDef, Zone } from './types';

const M = C.map;
const TR = C.tickRate;
const sec = (s: number) => Math.round(s * TR);

interface Ctx { team: Team; src: Unit | null; x: number; y: number; target: Unit | null; lvl: number; power: number; fromHero: boolean }

/**
 * Deterministic match simulation. No DOM / Pixi / Electron dependency: runs headless in Node.
 * Advance with step() at a fixed 60Hz. All player and bot input enters through command().
 */
export class Sim {
  tick = 0;
  rng: RNG;
  units: Unit[] = [];
  byId = new Map<number, Unit>();
  private nextId = 1;
  teams: [TeamState, TeamState];
  heroes: [Unit, Unit];
  ancients!: [Unit, Unit];
  lanes!: { t1: Unit; t2: Unit; barracks: Unit }[][]; // [team][lane]
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  pending: Pending[] = [];
  runes: (Rune | null)[] = [null, null];
  campUnits: number[][] = CAMPS.map(() => []);
  boss = { level: 0, id: 0, nextSpawn: C.boss.spawnAt };
  events: SimEvent[] = [];
  recordEvents = true;
  winner: -1 | 0 | 1 | 2 = -1; // 2 = draw
  suddenDeath = false;
  essenceMult = 1;
  cmdQueue: Command[] = [];
  cmdLog: { tick: number; cmd: Command }[] = [];
  grid = new SpatialHash(M.w, M.h, 100);
  private q: Unit[] = [];
  private q2: Unit[] = [];
  private anyDead = false;
  waveCount = 0;

  constructor(public opts: MatchOptions) {
    this.rng = new RNG(opts.seed);
    this.teams = [this.makeTeam(0), this.makeTeam(1)];
    this.buildStructures();
    this.heroes = [this.makeHero(0), this.makeHero(1)];
    this.updateInvuln();
    this.rebuildGrid();
    this.updateVision();
  }

  get time() { return this.tick / TR; }
  get over() { return this.winner !== -1; }

  // ------------------------------------------------------------------ setup
  private makeTeam(t: 0 | 1): TeamState {
    const deck = this.rng.shuffle(this.opts.decks[t].slice(0, C.deck.size));
    return {
      essence: C.essence.start, essenceAcc: 0, gold: C.gold.start, goldAcc: 0, xpAcc: 0,
      hand: deck.slice(0, C.deck.hand), queue: deck.slice(C.deck.hand),
      heroId: 0, revive: false, forward: [false, false], superLane: [false, false], playLog: [],
      stats: { lastHits: 0, denies: 0, goldEarned: 0, damageDealt: 0, heroKills: 0, deaths: 0, towersKilled: 0, cardsPlayed: 0, campsCleared: 0, bossKills: 0, runes: 0, essenceSpent: 0, essenceWasted: 0 },
    };
  }

  private buildStructures() {
    this.lanes = [[], []];
    const anc: Unit[] = [];
    for (const t of [0, 1] as const) {
      for (let l = 0; l < 2; l++) {
        const x = M.laneX[l];
        const t1 = this.spawn('t1', t, x, structY(t, 't1'), l); t1.tier = 1;
        const t2 = this.spawn('t2', t, x, structY(t, 't2'), l); t2.tier = 2;
        const b = this.spawn('barracks', t, x, structY(t, 'barracks'), l);
        this.lanes[t].push({ t1, t2, barracks: b });
      }
      const a = ancientPos(t);
      anc.push(this.spawn('ancient', t, a.x, a.y, -1));
    }
    this.ancients = [anc[0], anc[1]];
  }

  private makeHero(t: 0 | 1): Unit {
    const def = HEROES[this.opts.heroes[t]];
    const f = fountainPos(t);
    const ud: UnitDef = { id: def.id, name: def.name, kind: 'hero', hp: 1, dmg: def.baseDmg, atkInt: def.atkInt, range: def.range, speed: def.speed, r: 17, projSpeed: def.projSpeed, gold: 0, xp: 0, art: def.art };
    const u = this.spawnDef(ud, t, f.x, f.y - (t === 0 ? 60 : -60), -1);
    u.vision = C.vision.hero;
    u.hero = {
      def, level: 1, xp: 0, mana: 0, maxMana: 0, str: 0, agi: 0, int: 0, cds: [0, 0, 0, 0],
      items: [null, null, null, null, null, null], order: null, hold: false, respawnAt: 0, buybackReady: 0,
      spellPower: 1, lifesteal: 0, hpRegen: 0, manaRegen: 0, lastHeroHit: -9999, recallAt: 0, reviveHere: false, deathX: 0, deathY: 0,
    };
    u.maxHp = 0;
    this.recalcHero(u);
    u.hp = u.maxHp; u.hero.mana = u.hero.maxMana;
    this.teams[t].heroId = u.id;
    return u;
  }

  spawn(defId: string, team: Team, x: number, y: number, lane = -1): Unit { return this.spawnDef(UNITS[defId], team, x, y, lane); }

  private spawnDef(d: UnitDef, team: Team, x: number, y: number, lane: number): Unit {
    const structure = d.kind === 'tower' || d.kind === 'barracks' || d.kind === 'ancient' || d.kind === 'building';
    const u: Unit = {
      id: this.nextId++, def: d, kind: d.kind, team, x, y, r: d.r, facing: team === 0 ? -Math.PI / 2 : Math.PI / 2,
      hp: d.hp, maxHp: d.hp, armor: d.armor ?? 0, dmg: d.dmg, atkInt: d.atkInt, range: d.range, speed: d.speed,
      vision: structure ? C.vision.tower : C.vision.unit, cd: 0, target: 0, lane: lane < 0 ? laneOf(x) : lane,
      alive: true, structure, invuln: false, tier: 0, lifeEnd: 0, spawnCd: d.spawner ? sec(d.spawner.interval) : 0, activeAt: 0,
      stunEnd: 0, slowEnd: 0, slowPct: 0, shield: 0, shieldEnd: 0, invisEnd: 0,
      buffs: [], asMul: 1, msMul: 1, dmgMul: 1, armorAdd: 0, lsAdd: 0, rHp: 0, rMana: 0,
      camp: -1, homeX: x, homeY: y, returning: false, aggroTeam: -1, aggroEnd: 0,
      vis: [team === 0 || structure, team === 1 || structure],
      gold: d.gold, xp: d.xp, isSuper: false, awake: d.kind !== 'ancient',
      flash: -99, atkTick: -99, spawnTick: this.tick, hero: null,
    };
    this.units.push(u); this.byId.set(u.id, u);
    return u;
  }

  ev(e: SimEvent) { if (this.recordEvents) this.events.push(e); }

  // ------------------------------------------------------------------ hero stats
  recalcHero(u: Unit) {
    const h = u.hero!, d = h.def, L = h.level - 1, H = C.hero;
    let str = d.str + d.strG * L, agi = d.agi + d.agiG * L, int = d.int + d.intG * L;
    let dmg = d.baseDmg, armor = 0, ms = 0, hp = 0, mana = 0, as = 0, ls = 0, sp = 0, hpR = 0, mR = 0;
    for (const it of h.items) {
      if (!it) continue; const s = ITEMS[it.id].stats; if (!s) continue;
      str += s.str ?? 0; agi += s.agi ?? 0; int += s.int ?? 0; dmg += s.dmg ?? 0; armor += s.armor ?? 0; ms += s.ms ?? 0;
      hp += s.hp ?? 0; mana += s.mana ?? 0; as += s.as ?? 0; ls += s.lifesteal ?? 0; sp += s.spell ?? 0; hpR += s.hpRegen ?? 0; mR += s.manaRegen ?? 0;
    }
    h.str = str; h.agi = agi; h.int = int;
    const oldMax = u.maxHp, oldMana = h.maxMana;
    u.maxHp = Math.round(H.hpBase + str * H.hpPerStr + hp);
    h.maxMana = Math.round(H.manaBase + int * H.manaPerInt + mana);
    if (u.alive && oldMax > 0) { u.hp = Math.max(1, Math.min(u.maxHp, u.hp + (u.maxHp - oldMax))); h.mana = Math.max(0, Math.min(h.maxMana, h.mana + (h.maxMana - oldMana))); }
    u.dmg = dmg + (d.primary === 'str' ? str : d.primary === 'agi' ? agi : int);
    u.armor = agi * H.armorPerAgi + armor + (d.range < H.meleeRange ? H.meleeArmor : 0);
    u.atkInt = d.atkInt / (1 + agi * H.asPerAgi + as);
    u.speed = d.speed + ms;
    h.spellPower = 1 + int * H.spellPerInt + sp; h.lifesteal = ls;
    h.hpRegen = H.hpRegenBase + str * H.hpRegenPerStr + hpR; h.manaRegen = H.manaRegenBase + int * H.manaRegenPerInt + mR;
  }

  addXp(team: 0 | 1, amt: number) {
    const u = this.heroes[team], h = u.hero!;
    if (h.level >= C.hero.maxLevel) return;
    h.xp += amt;
    while (h.level < C.hero.maxLevel && h.xp >= C.hero.xpTable[h.level]) {
      h.level++; this.recalcHero(u);
      this.ev({ type: 'levelup', team, x: u.x, y: u.y, amt: h.level });
    }
  }

  addGold(team: 0 | 1, amt: number, x?: number, y?: number, show = true) {
    const t = this.teams[team]; t.gold += amt; t.stats.goldEarned += amt;
    if (show && x !== undefined) this.ev({ type: 'gold', team, x, y, amt });
  }

  abilityUnlocked(u: Unit, slot: number) { return u.hero!.level >= C.hero.unlockLevels[slot]; }

  // ------------------------------------------------------------------ buffs
  addBuff(u: Unit, b: Omit<Buff, 'end'>, dur: number) {
    if (b.tag) u.buffs = u.buffs.filter(x => x.tag !== b.tag);
    u.buffs.push({ ...b, end: this.tick + sec(dur) });
    this.refreshMods(u);
  }
  private refreshMods(u: Unit) {
    let as = 0, ms = 0, dmg = 0, ar = 0, ls = 0, rh = 0, rm = 0;
    const T = this.tick;
    if (u.buffs.length) {
      u.buffs = u.buffs.filter(b => b.end > T);
      for (const b of u.buffs) {
        as += b.as ?? 0; ms += b.ms ?? 0; dmg += b.dmg ?? 0; ar += b.armor ?? 0; ls += b.lifesteal ?? 0;
        rh += (b.hps ?? 0) + (b.regenFrac ?? 0) * u.maxHp; rm += (b.mps ?? 0) + (b.manaFrac ?? 0) * (u.hero ? u.hero.maxMana : 0);
      }
    }
    u.asMul = 1 + as; u.msMul = 1 + ms; u.dmgMul = 1 + dmg; u.armorAdd = ar; u.lsAdd = ls; u.rHp = rh; u.rMana = rm;
  }

  // ------------------------------------------------------------------ commands
  /** Queue a command; it executes at the start of the next step. All commands are logged for replays. */
  command(cmd: Command) { this.cmdQueue.push(cmd); }

  private exec(cmd: Command) {
    const u = this.heroes[cmd.team], h = u.hero!;
    switch (cmd.type) {
      case 'move':
        if (!u.alive) return;
        h.order = { t: 'move', x: Math.max(20, Math.min(M.w - 20, cmd.x)), y: Math.max(20, Math.min(M.h - 20, cmd.y)) };
        h.hold = false; u.target = 0; h.recallAt = 0; break;
      case 'attack': {
        if (!u.alive) return; const t = this.byId.get(cmd.id);
        if (!t || !this.validHeroTarget(u, t)) return;
        h.order = { t: 'attack', id: cmd.id }; h.hold = false; h.recallAt = 0; break;
      }
      case 'stop': h.order = null; h.hold = true; u.target = 0; break;
      case 'cast': {
        if (!u.alive || cmd.slot < 0 || cmd.slot > 3) return;
        const ab = h.def.abilities[cmd.slot];
        if (!this.canCast(u, cmd.slot)) return;
        if (ab.cast === 'unit') { const t = this.byId.get(cmd.id); if (!t || !t.alive || t.team === u.team || t.structure || t.invuln || !t.vis[u.team as 0 | 1]) return; }
        h.order = { t: 'cast', slot: cmd.slot, x: cmd.x, y: cmd.y, id: cmd.id }; h.hold = false; h.recallAt = 0; break;
      }
      case 'card': this.playCard(cmd.team, cmd.slot, cmd.x, cmd.y); break;
      case 'buy': this.buy(cmd.team, cmd.item); break;
      case 'sell': this.sell(cmd.team, cmd.slot); break;
      case 'use': this.useItem(cmd.team, cmd.slot); break;
      case 'buyback': this.buyback(cmd.team); break;
    }
  }

  canCast(u: Unit, slot: number) {
    const h = u.hero!; const ab = h.def.abilities[slot];
    return u.alive && this.abilityUnlocked(u, slot) && this.tick >= h.cds[slot] && h.mana >= ab.mana && u.stunEnd <= this.tick;
  }

  // ------------------------------------------------------------------ cards
  canDeploy(team: 0 | 1, cardId: string, x: number, y: number): boolean {
    const c = CARDS[cardId]; if (!c) return false;
    if (x < 0 || x > M.w || y < 0 || y > M.h) return false;
    if (c.type === 'spell') return true;
    if (!inDeployZone(team, this.teams[team].forward, x, y)) return false;
    if (c.type === 'building') {
      for (const s of this.grid.query(x, y, 90, this.q)) if (s.alive && s.structure && dist(x, y, s.x, s.y) < s.r + 28) return false;
    }
    return true;
  }

  playCard(team: 0 | 1, slot: number, x: number, y: number): boolean {
    const t = this.teams[team]; const id = t.hand[slot]; const c = CARDS[id];
    if (!c || this.over || t.essence < c.cost || !this.canDeploy(team, id, x, y)) return false;
    t.essence -= c.cost; t.stats.essenceSpent += c.cost; t.stats.cardsPlayed++;
    t.queue.push(id); t.hand[slot] = t.queue.shift()!;
    t.playLog.push({ tick: this.tick, card: id });
    this.ev({ type: 'card', team, x, y, text: id, r: c.radius ?? 0 });
    if (c.type === 'spell') {
      this.pending.push({ at: this.tick + sec(C.deck.spellDelay), start: this.tick, team, src: 0, effects: c.effects!, x, y, target: 0, lvl: 1, power: 1, radius: c.radius ?? 100, kind: id, fromHero: false });
    } else {
      const d = UNITS[c.unit!]; const n = c.count ?? 1;
      for (let i = 0; i < n; i++) {
        let ox = 0, oy = 0;
        if (c.type === 'building' && n > 1) { ox = (i - (n - 1) / 2) * (d.r * 2 + 6); }
        else if (n > 1) { const a = (i / n) * Math.PI * 2 + 0.6; const rr = d.r * (n > 3 ? 2.1 : 1.5); ox = Math.cos(a) * rr; oy = Math.sin(a) * rr; }
        const u = this.spawn(d.id, team, Math.max(15, Math.min(M.w - 15, x + ox)), Math.max(15, Math.min(M.h - 15, y + oy)), laneOf(x));
        u.activeAt = this.tick + sec(C.deck.deployTime);
        if (c.life) u.lifeEnd = this.tick + sec(c.life + C.deck.deployTime);
      }
    }
    return true;
  }

  // ------------------------------------------------------------------ shop
  canShop(team: 0 | 1) { const u = this.heroes[team]; const f = fountainPos(team); return !u.alive || dist(u.x, u.y, f.x, f.y) <= C.hero.fountainRadius; }

  /** Price after crediting owned components (one of each). */
  itemPrice(team: 0 | 1, itemId: string): number {
    const it = ITEMS[itemId]; if (!it) return Infinity;
    let price = it.cost; const inv = this.heroes[team].hero!.items;
    if (it.from) { const used = new Set<number>(); for (const c of it.from) { const i = inv.findIndex((s, k) => s && s.id === c && !used.has(k)); if (i >= 0) { used.add(i); price -= ITEMS[c].cost; } } }
    return price;
  }

  buy(team: 0 | 1, itemId: string): boolean {
    const it = ITEMS[itemId]; const t = this.teams[team]; const u = this.heroes[team]; const inv = u.hero!.items;
    if (!it || !this.canShop(team)) return false;
    const price = this.itemPrice(team, itemId);
    if (t.gold < price) return false;
    const next = inv.slice();
    if (it.from) for (const c of it.from) { const i = next.findIndex(s => s && s.id === c); if (i >= 0) next[i] = null; }
    let slot = -1;
    if (it.use) slot = next.findIndex(s => s && s.id === itemId && s.n < 5);
    if (slot >= 0) next[slot] = { id: itemId, n: next[slot]!.n + 1 };
    else { slot = next.findIndex(s => !s); if (slot < 0) return false; next[slot] = { id: itemId, n: 1 }; }
    u.hero!.items = next; t.gold -= price;
    this.recalcHero(u);
    this.ev({ type: 'buy', team, text: itemId });
    return true;
  }

  sell(team: 0 | 1, slot: number): boolean {
    const u = this.heroes[team]; const s = u.hero!.items[slot];
    if (!s || !this.canShop(team)) return false;
    this.teams[team].gold += Math.floor(ITEMS[s.id].cost * C.gold.sellFrac);
    u.hero!.items[slot] = s.n > 1 ? { id: s.id, n: s.n - 1 } : null;
    this.recalcHero(u); return true;
  }

  useItem(team: 0 | 1, slot: number): boolean {
    const u = this.heroes[team]; const h = u.hero!; const s = h.items[slot];
    if (!s || !u.alive) return false; const use = ITEMS[s.id].use; if (!use) return false;
    if (use.heal) this.addBuff(u, { hps: use.heal / use.dur!, tag: 'salve' }, use.dur!);
    if (use.mana) this.addBuff(u, { mps: use.mana / use.dur!, tag: 'draught' }, use.dur!);
    if (use.recall) { h.recallAt = this.tick + sec(use.dur!); h.order = null; h.hold = true; u.target = 0; }
    h.items[slot] = s.n > 1 ? { id: s.id, n: s.n - 1 } : null;
    this.ev({ type: 'use', team, x: u.x, y: u.y, text: s.id });
    return true;
  }

  buybackCost(team: 0 | 1) { return C.hero.buybackBase + C.hero.buybackPerLevel * this.heroes[team].hero!.level; }
  buyback(team: 0 | 1): boolean {
    const u = this.heroes[team], h = u.hero!, t = this.teams[team];
    const cost = this.buybackCost(team);
    if (u.alive || this.over || t.gold < cost || this.tick < h.buybackReady) return false;
    t.gold -= cost; h.buybackReady = this.tick + sec(C.hero.buybackCooldown); h.reviveHere = false;
    this.respawn(u);
    this.ev({ type: 'buyback', team, x: u.x, y: u.y });
    return true;
  }

  private respawn(u: Unit) {
    const h = u.hero!; const f = fountainPos(u.team);
    if (h.reviveHere) { u.x = h.deathX; u.y = h.deathY; h.reviveHere = false; }
    else { u.x = f.x; u.y = f.y - (u.team === 0 ? 60 : -60); }
    u.alive = true; u.hp = u.maxHp; h.mana = h.maxMana; h.order = null; h.hold = false; u.target = 0;
    u.stunEnd = 0; u.slowEnd = 0; u.buffs = []; this.refreshMods(u); u.spawnTick = this.tick;
    this.ev({ type: 'respawn', team: u.team, x: u.x, y: u.y });
  }

  // ------------------------------------------------------------------ main step
  step() {
    if (this.over) return;
    if (!this.recordEvents) this.events.length = 0;
    const T = ++this.tick;
    if (this.cmdQueue.length) {
      const q = this.cmdQueue; this.cmdQueue = [];
      for (const c of q) { this.cmdLog.push({ tick: T, cmd: c }); this.exec(c); }
    }
    this.economy();
    this.spawns();
    this.rebuildGrid();
    if (T % C.vision.interval === 0) this.updateVision();
    if (this.suddenDeath) this.decay();
    const us = this.units;
    for (let i = 0, n = us.length; i < n; i++) { const u = us[i]; if (u.alive) this.updateUnit(u); }
    this.updateProjectiles();
    if (this.pending.length) this.updatePending();
    if (T % 30 === 0) this.halfSecond();
    this.separate();
    this.updateHeroesMeta();
    if (this.anyDead) {
      this.anyDead = false;
      this.units = this.units.filter(u => { if (u.alive || u.hero) return true; this.byId.delete(u.id); return false; });
    }
    this.checkEnd();
  }

  private rebuildGrid() { this.grid.clear(); for (const u of this.units) if (u.alive) this.grid.insert(u); }

  private economy() {
    const T = this.tick, time = T / TR, E = C.essence;
    const mult = time >= E.tripleAt ? 3 : time >= E.doubleAt ? 2 : 1;
    if (mult !== this.essenceMult) { this.essenceMult = mult; this.ev({ type: 'essenceRate', amt: mult }); }
    for (const t of [0, 1] as const) {
      const ts = this.teams[t];
      const gain = mult / (E.regenInterval * TR);
      if (ts.essence < E.max) ts.essence = Math.min(E.max, ts.essence + gain); else ts.stats.essenceWasted += gain;
      ts.goldAcc += C.gold.passive / TR;
      if (ts.goldAcc >= 1) { const g = Math.floor(ts.goldAcc); ts.goldAcc -= g; ts.gold += g; ts.stats.goldEarned += g; }
      ts.xpAcc += C.hero.passiveXp / TR;
      if (ts.xpAcc >= 1) { ts.xpAcc -= 1; this.addXp(t, 1); }
    }
    if (!this.suddenDeath && time >= C.match.duration) { this.suddenDeath = true; this.ev({ type: 'suddenDeath' }); }
  }

  private spawns() {
    const T = this.tick, CR = C.creeps;
    // lane creeps
    const w = T - sec(CR.firstWave);
    if (w >= 0 && w % sec(CR.waveInterval) === 0) {
      this.waveCount++;
      const grow = 1 + CR.growthPerMin * (T / TR / 60);
      for (const t of [0, 1] as const) for (let l = 0; l < 2; l++) {
        const sup = this.teams[t].superLane[l];
        const by = structY(t, 'barracks'); const dir = t === 0 ? -1 : 1;
        for (let i = 0; i < CR.melee + CR.ranged; i++) {
          const melee = i < CR.melee;
          const u = this.spawn(melee ? 'creepMelee' : 'creepRanged', t, M.laneX[l] + (melee ? (i - 1) * 30 : 0), by + dir * (melee ? 60 : 20), l);
          const hm = grow * (sup ? CR.superHp : 1), dm = grow * (sup ? CR.superDmg : 1);
          u.maxHp = u.hp = Math.round(u.maxHp * hm); u.dmg = u.dmg * dm; u.isSuper = sup;
        }
      }
      this.ev({ type: 'wave' });
    }
    // jungle camps
    const j = T - sec(C.jungle.firstSpawn);
    if (j >= 0 && j % sec(C.jungle.respawn) === 0) {
      CAMPS.forEach((c, ci) => {
        if (this.campUnits[ci].some(id => this.byId.get(id)?.alive)) return;
        this.campUnits[ci] = c.units.map((d, i) => {
          const a = (i / c.units.length) * Math.PI * 2;
          const u = this.spawn(d, 2, c.x + Math.cos(a) * 26, c.y + Math.sin(a) * 26);
          u.camp = ci; u.homeX = u.x; u.homeY = u.y; return u.id;
        });
      });
    }
    // boss
    if (!this.boss.id && T >= sec(this.boss.nextSpawn)) {
      const u = this.spawn('boss', 2, M.bossPit.x, M.bossPit.y);
      const g = 1 + C.boss.growth * this.boss.level;
      u.maxHp = u.hp = Math.round(u.maxHp * g); u.dmg *= g;
      this.boss.id = u.id;
      this.ev({ type: 'bossSpawn', x: u.x, y: u.y, amt: this.boss.level + 1 });
    }
    // runes
    const r = T - sec(C.runes.first);
    if (r >= 0 && r % sec(C.runes.interval) === 0) {
      const types = ['bounty', 'haste', 'double', 'regen', 'invis'] as const;
      for (let i = 0; i < 2; i++) this.runes[i] = { type: types[this.rng.int(types.length)], x: M.runeSpots[i].x, y: M.runeSpots[i].y };
      this.ev({ type: 'runeSpawn' });
    }
  }

  private updateVision() {
    const T = this.tick, q = this.q;
    for (const u of this.units) {
      if (!u.alive) continue;
      for (const e of [0, 1] as const) {
        if (u.team === e) { u.vis[e] = true; continue; }
        const invis = u.invisEnd > T;
        if (u.structure && !invis) { u.vis[e] = true; continue; }
        const high = isHigh(u.y);
        let seen = false;
        this.grid.query(u.x, u.y, C.vision.hero, q);
        for (let i = 0; i < q.length; i++) {
          const v = q[i];
          if (v.team !== e || !v.alive) continue;
          const d = dist(u.x, u.y, v.x, v.y);
          if (invis) { if (v.structure && v.kind !== 'building' && d <= C.invisRevealRange) { seen = true; break; } continue; }
          if (d <= v.vision && (!high || isHigh(v.y))) { seen = true; break; }
        }
        u.vis[e] = seen;
      }
    }
  }

  private decay() {
    const s = this.tick / TR - C.match.duration;
    const rate = (C.match.sdBaseRate + C.match.sdRamp * s) / TR;
    for (const t of [0, 1] as const) {
      let frac = 0;
      for (const l of this.lanes[t]) frac += (l.t1.alive ? l.t1.hp / l.t1.maxHp : 0) + (l.t2.alive ? l.t2.hp / l.t2.maxHp : 0) + (l.barracks.alive ? l.barracks.hp / l.barracks.maxHp : 0);
      const missing = 1 - frac / 6;
      for (const l of this.lanes[t]) for (const s2 of [l.t1, l.t2, l.barracks]) if (s2.alive) this.damage(s2, s2.maxHp * rate, null, -1, 'decay');
      const a = this.ancients[t];
      if (a.alive) this.damage(a, a.maxHp * rate * (1 + C.match.sdAncientPenalty * missing), null, -1, 'decay');
    }
  }

  // ------------------------------------------------------------------ targeting
  isVisibleTo(t: Unit, team: number) { return team > 1 || t.vis[team as 0 | 1]; }

  private validTarget(u: Unit, t: Unit): boolean {
    return t.alive && !t.invuln && t.team !== u.team && (u.team === 2 || t.structure || t.vis[u.team as 0 | 1]);
  }
  validHeroTarget(u: Unit, t: Unit): boolean {
    if (!t.alive || t === u) return false;
    if (t.team === u.team) return t.kind === 'creep' && t.hp < t.maxHp * C.hero.denyHpFrac;
    return !t.invuln && t.vis[u.team as 0 | 1];
  }

  private acquire(u: Unit, R: number): Unit | null {
    const q = this.grid.query(u.x, u.y, R + 60, this.q);
    let best: Unit | null = null, bd = Infinity;
    const so = !!u.def.structOnly, T = this.tick;
    for (let i = 0; i < q.length; i++) {
      const v = q[i];
      if (v.team === u.team || !v.alive || v.invuln) continue;
      if (so && !v.structure) continue;
      if (u.team !== 2) {
        if (!v.structure && !v.vis[u.team as 0 | 1]) continue;
        if (v.team === 2 && !(v.aggroTeam === u.team && v.aggroEnd > T)) continue;
      } else if (v.structure) continue;
      const d = dist(u.x, u.y, v.x, v.y) - v.r;
      if (d > R) continue;
      if (u.def.minRange && d < u.def.minRange) continue;
      if (d < bd || (d === bd && best && v.id < best.id)) { bd = d; best = v; }
    }
    return best;
  }

  private acquireTower(u: Unit): Unit | null {
    const R = u.range + u.r, T = this.tick;
    const q = this.grid.query(u.x, u.y, R + 60, this.q);
    let p1: Unit | null = null, p2: Unit | null = null, p3: Unit | null = null, p4: Unit | null = null;
    let d1 = Infinity, d2 = Infinity, d3 = Infinity, d4 = Infinity;
    const win = sec(C.tower.heroAggroWindow);
    for (let i = 0; i < q.length; i++) {
      const v = q[i];
      if (v.team === u.team || v.team === 2 || !v.alive || v.invuln) continue;
      if (v.invisEnd > T && !v.vis[u.team as 0 | 1]) continue;
      const d = dist(u.x, u.y, v.x, v.y) - v.r;
      if (d > R) continue;
      if (v.hero && T - v.hero.lastHeroHit <= win) { if (d < d1) { d1 = d; p1 = v; } }
      else if (v.target === u.id) { if (d < d2) { d2 = d; p2 = v; } }
      else if (!v.hero) { if (d < d3) { d3 = d; p3 = v; } }
      else if (d < d4) { d4 = d; p4 = v; }
    }
    return p1 ?? p2 ?? p3 ?? p4;
  }

  // ------------------------------------------------------------------ unit update
  private moveToward(u: Unit, x: number, y: number, stopDist = 2): boolean {
    const dx = x - u.x, dy = y - u.y; const d = Math.hypot(dx, dy);
    if (d <= stopDist) return true;
    let sp = u.speed * u.msMul; if (u.slowEnd > this.tick) sp *= 1 - u.slowPct;
    const stepLen = Math.min(d, sp / TR);
    u.x += (dx / d) * stepLen; u.y += (dy / d) * stepLen; u.facing = Math.atan2(dy, dx);
    return d - stepLen <= stopDist;
  }

  private updateUnit(u: Unit) {
    const T = this.tick;
    if (u.lifeEnd && T >= u.lifeEnd) { this.kill(u, null, -1); return; }
    if (T < u.activeAt || u.stunEnd > T) return;
    if (u.cd > 0) u.cd -= u.asMul;
    if (u.hero) { this.updateHero(u); return; }
    if (u.def.spawner) {
      if (--u.spawnCd <= 0) {
        u.spawnCd = sec(u.def.spawner.interval);
        const s = this.spawn(u.def.spawner.unit, u.team, u.x, u.y + (u.team === 0 ? -1 : 1) * (u.r + 14), u.lane);
        s.gold = 2; s.xp = 4;
      }
    }
    if (u.dmg <= 0 && u.speed <= 0) return;
    if (!u.awake) return;
    let t = u.target ? this.byId.get(u.target) : undefined;
    if (t && !this.validTarget(u, t)) { t = undefined; u.target = 0; }
    const isTower = u.kind === 'tower' || u.kind === 'ancient';
    if (isTower) {
      if ((T + u.id) % 6 === 0 || !t) {
        const n = this.acquireTower(u);
        // keep the current target unless it left range or a hero-aggro priority target appeared
        if (!t || dist(u.x, u.y, t.x, t.y) - t.r > u.range + u.r) t = n ?? undefined;
        else if (n && n.hero && n !== t && T - n.hero.lastHeroHit <= sec(C.tower.heroAggroWindow)) t = n;
        u.target = t ? t.id : 0;
      }
    } else if (u.team === 2) {
      if (u.returning) {
        u.target = 0; u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.02);
        if (this.moveToward(u, u.homeX, u.homeY, 4)) u.returning = false;
        return;
      }
      const leash = u.kind === 'boss' ? C.boss.leash : C.jungle.leash;
      if (dist(u.x, u.y, u.homeX, u.homeY) > leash) { u.returning = true; return; }
      if (!t && (T + u.id) % 10 === 0) { const n = this.acquire(u, C.jungle.aggro); if (n) { t = n; u.target = n.id; } }
    } else if (!t && (T + u.id) % 8 === 0 || (!t && u.target === 0 && u.spawnTick === T - 1)) {
      const R = u.structure ? u.range + u.r : u.def.structOnly ? 420 : Math.max(u.range + 90, C.creeps.aggro);
      const n = this.acquire(u, R); if (n) { t = n; u.target = n.id; }
    }
    if (t) {
      const d = dist(u.x, u.y, t.x, t.y) - t.r - u.r;
      if (d <= u.range && !(u.def.minRange && d < u.def.minRange - u.r)) { if (u.cd <= 0) this.attack(u, t); }
      else if (u.speed > 0) {
        if (!u.structure && u.team !== 2 && d > Math.max(u.range, C.creeps.aggro) * 1.6) u.target = 0;
        else this.moveToward(u, t.x, t.y);
      } else u.target = 0;
    } else if (u.speed > 0) {
      if (u.team === 2) { if (dist(u.x, u.y, u.homeX, u.homeY) > 8) this.moveToward(u, u.homeX, u.homeY, 4); }
      else this.advance(u);
    }
  }

  private advance(u: Unit) {
    const dir = u.team === 0 ? -1 : 1; const enemy = 1 - u.team;
    const by = structY(enemy, 'barracks');
    const passed = u.team === 0 ? u.y <= by + 20 : u.y >= by - 20;
    if (passed) { const a = ancientPos(enemy); this.moveToward(u, a.x, a.y, 70); return; }
    const lx = M.laneX[u.lane] + ((u.id * 37) % 5 - 2) * 13;
    const off = Math.abs(u.x - lx);
    this.moveToward(u, lx, u.y + dir * (off > 60 ? Math.max(40, off * 0.6) : 160));
  }

  private updateHero(u: Unit) {
    const h = u.hero!, o = h.order, T = this.tick;
    if (h.recallAt) {
      if (T >= h.recallAt) { const f = fountainPos(u.team); u.x = f.x; u.y = f.y - (u.team === 0 ? 50 : -50); h.recallAt = 0; h.hold = false; this.ev({ type: 'recall', team: u.team, x: u.x, y: u.y }); }
      return;
    }
    if (o && o.t === 'cast') {
      const ab = h.def.abilities[o.slot];
      if (!this.canCast(u, o.slot)) { h.order = null; return; }
      if (ab.cast === 'self') { this.doCast(u, o.slot, u.x, u.y, null); h.order = null; return; }
      if (ab.cast === 'unit') {
        const t = this.byId.get(o.id);
        if (!t || !t.alive || t.invuln || !t.vis[u.team as 0 | 1]) { h.order = null; return; }
        if (dist(u.x, u.y, t.x, t.y) - t.r <= ab.range) { this.doCast(u, o.slot, t.x, t.y, t); h.order = { t: 'attack', id: t.id }; }
        else this.moveToward(u, t.x, t.y);
        return;
      }
      let x = o.x, y = o.y; const d = dist(u.x, u.y, x, y);
      if (d > ab.range) {
        if (ab.effects[0].t === 'blink' || ab.effects[0].t === 'line') { x = u.x + (x - u.x) / d * ab.range; y = u.y + (y - u.y) / d * ab.range; }
        else { this.moveToward(u, x, y); return; }
      }
      this.doCast(u, o.slot, x, y, null); h.order = null; return;
    }
    let t: Unit | undefined;
    if (o && o.t === 'attack') {
      t = this.byId.get(o.id);
      if (!t || !this.validHeroTarget(u, t)) { h.order = null; u.target = 0; return; }
      u.target = t.id;
    } else if (o && o.t === 'move') {
      if (this.moveToward(u, o.x, o.y)) h.order = null;
      return;
    } else {
      if (h.hold) return;
      t = u.target ? this.byId.get(u.target) : undefined;
      const R = u.range + u.r + C.hero.autoAcquire;
      if (t && (!this.validTarget(u, t) || dist(u.x, u.y, t.x, t.y) - t.r > R + 80)) { t = undefined; u.target = 0; }
      if (!t && T % 6 === 0) { const n = this.acquire(u, R); if (n) { t = n; u.target = n.id; } }
      if (!t) return;
    }
    const d = dist(u.x, u.y, t.x, t.y) - t.r - u.r;
    if (d <= u.range) { if (u.cd <= 0) this.attack(u, t); u.facing = Math.atan2(t.y - u.y, t.x - u.x); }
    else this.moveToward(u, t.x, t.y);
  }

  private doCast(u: Unit, slot: number, x: number, y: number, target: Unit | null) {
    const h = u.hero!, ab: AbilityDef = h.def.abilities[slot], T = this.tick;
    h.mana -= ab.mana; h.cds[slot] = T + sec(ab.cd);
    if (!ab.effects.some(e => e.t === 'invis')) u.invisEnd = 0;
    if (x !== u.x || y !== u.y) u.facing = Math.atan2(y - u.y, x - u.x);
    u.atkTick = T;
    const p: Pending = { at: T + sec(ab.delay ?? 0), start: T, team: u.team, src: u.id, effects: ab.effects, x, y, target: target ? target.id : 0, lvl: h.level, power: h.spellPower, radius: ab.radius ?? 0, kind: ab.id, fromHero: true };
    this.ev({ type: 'cast', team: u.team, x, y, id: u.id, text: ab.id, r: ab.radius ?? 0, amt: ab.delay ?? 0 });
    if (ab.delay) this.pending.push(p); else this.resolve(p);
  }

  private updatePending() {
    const T = this.tick; let any = false;
    for (const p of this.pending) if (T >= p.at) { this.resolve(p); any = true; }
    if (any) this.pending = this.pending.filter(p => T < p.at);
  }

  private resolve(p: Pending) {
    const src = p.src ? this.byId.get(p.src) ?? null : null;
    if (p.fromHero && (!src || !src.alive)) return;
    let x = p.x, y = p.y;
    // self-centred delayed abilities follow the caster
    if (p.fromHero && src && src.hero!.def.abilities.find(a => a.id === p.kind)?.cast === 'self') { x = src.x; y = src.y; }
    this.applyEffects({ team: p.team, src, x, y, target: p.target ? this.byId.get(p.target) ?? null : null, lvl: p.lvl, power: p.power, fromHero: p.fromHero }, p.effects);
    this.ev({ type: 'impact', team: p.team, x, y, r: p.radius, text: p.kind });
  }

  private enemiesIn(team: Team, x: number, y: number, r: number, out: Unit[]): Unit[] {
    const q = this.grid.query(x, y, r + 60, this.q2); out.length = 0;
    for (let i = 0; i < q.length; i++) { const v = q[i]; if (v.alive && v.team !== team && !v.invuln && dist(x, y, v.x, v.y) <= r + v.r) out.push(v); }
    return out;
  }
  private alliesIn(team: Team, x: number, y: number, r: number, out: Unit[]): Unit[] {
    const q = this.grid.query(x, y, r + 60, this.q2); out.length = 0;
    for (let i = 0; i < q.length; i++) { const v = q[i]; if (v.alive && v.team === team && dist(x, y, v.x, v.y) <= r + v.r) out.push(v); }
    return out;
  }

  private applyEffects(c: Ctx, effects: Effect[]) {
    const T = this.tick; const tmp: Unit[] = [];
    for (const e of effects) {
      const amt = ((e.amt ?? 0) + (e.per ?? 0) * (c.lvl - 1)) * c.power;
      const sm = e.structMult ?? C.hero.spellStructureMult;
      switch (e.t) {
        case 'damage': {
          if (e.radius) for (const v of this.enemiesIn(c.team, c.x, c.y, e.radius, tmp)) this.damage(v, amt * (v.structure ? sm : 1), c.src, c.team, 'magic');
          else if (c.target && c.target.alive) this.damage(c.target, amt * (c.target.structure ? sm : 1), c.src, c.team, 'magic');
          break;
        }
        case 'line': {
          if (!c.src) break;
          const sx = c.src.x, sy = c.src.y; let dx = c.x - sx, dy = c.y - sy; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
          const L = e.length!, hw = e.width! / 2;
          for (const v of this.enemiesIn(c.team, sx + dx * L / 2, sy + dy * L / 2, L / 2 + 20, tmp)) {
            const px = v.x - sx, py = v.y - sy; const along = px * dx + py * dy; if (along < -v.r || along > L + v.r) continue;
            if (Math.abs(px * dy - py * dx) <= hw + v.r) this.damage(v, amt * (v.structure ? sm : 1), c.src, c.team, 'magic');
          }
          break;
        }
        case 'heal': {
          if (e.radius) { for (const v of this.alliesIn(c.team, c.x, c.y, e.radius, tmp)) if (!v.structure) this.heal(v, amt); }
          else if (c.src) this.heal(c.src, amt);
          break;
        }
        case 'stun': case 'slow': {
          const list = e.radius ? this.enemiesIn(c.team, c.x, c.y, e.radius, tmp) : c.target && c.target.alive ? [c.target] : [];
          for (const v of list) {
            if (v.structure) continue;
            const dur = sec(e.dur! * (v.kind === 'boss' ? 0.5 : 1));
            if (e.t === 'stun') v.stunEnd = Math.max(v.stunEnd, T + dur);
            else { if (v.slowEnd <= T || e.pct! >= v.slowPct) v.slowPct = e.pct!; v.slowEnd = Math.max(v.slowEnd, T + dur); }
          }
          break;
        }
        case 'shield': {
          const list = e.radius && !e.self ? this.alliesIn(c.team, c.x, c.y, e.radius, tmp) : c.src ? [c.src] : [];
          for (const v of list) {
            if (v.structure && (!e.structures || v.invuln)) continue;
            v.shield = Math.max(v.shieldEnd > T ? v.shield : 0, amt); v.shieldEnd = T + sec(e.dur!);
          }
          break;
        }
        case 'buff': {
          const list = e.radius && !e.self ? this.alliesIn(c.team, c.x, c.y, e.radius, tmp) : c.src ? [c.src] : [];
          for (const v of list) if (!v.structure) this.addBuff(v, e.buff!, e.dur!);
          break;
        }
        case 'zone': {
          const scale = (v?: number) => v ? (v + (e.per ?? 0) * (c.lvl - 1)) * c.power : 0;
          this.zones.push({ x: c.x, y: c.y, radius: e.radius!, end: T + sec(e.dur!), team: c.team, src: c.src ? c.src.id : 0, dps: scale(e.dps), hps: scale(e.hps), slowPct: e.pct ?? 0, follow: e.follow && c.src ? c.src.id : 0, structMult: sm, color: e.hps ? 'heal' : 'dmg' });
          break;
        }
        case 'blink': {
          if (!c.src) break;
          if (e.toTarget && c.target) { const d = dist(c.src.x, c.src.y, c.target.x, c.target.y) || 1; const k = Math.max(0, d - c.target.r - c.src.r - 4) / d; c.src.x += (c.target.x - c.src.x) * k; c.src.y += (c.target.y - c.src.y) * k; }
          else { c.src.x = Math.max(20, Math.min(M.w - 20, c.x)); c.src.y = Math.max(20, Math.min(M.h - 20, c.y)); }
          this.ev({ type: 'blink', x: c.src.x, y: c.src.y, team: c.team });
          break;
        }
        case 'summon': {
          if (!c.src) break;
          const k = 1 + 0.07 * (c.lvl - 1);
          for (let i = 0; i < (e.count ?? 1); i++) {
            const a = c.src.facing + (i - ((e.count ?? 1) - 1) / 2) * 0.9;
            const u = this.spawn(e.unit!, c.team, c.src.x + Math.cos(a) * 44, c.src.y + Math.sin(a) * 44, laneOf(c.src.x));
            u.maxHp = u.hp = Math.round(u.maxHp * k); u.dmg *= k; u.lifeEnd = T + sec(e.life!);
          }
          break;
        }
        case 'invis': if (c.src) c.src.invisEnd = T + sec(e.dur!); break;
      }
    }
  }

  // ------------------------------------------------------------------ combat
  private attack(u: Unit, t: Unit) {
    const T = this.tick, d = u.def;
    u.cd += u.atkInt * TR; if (u.cd < 0) u.cd = 0;
    u.atkTick = T; u.invisEnd = 0; u.target = t.id;
    if (!u.structure) u.facing = Math.atan2(t.y - u.y, t.x - u.x);
    if (u.hero && t.hero && t.team !== u.team) u.hero.lastHeroHit = T;
    const dmg = u.dmg * u.dmgMul;
    const structMult = u.hero ? C.hero.structureDmgMult : d.structMult ?? 1;
    const ranged = !!d.projSpeed;
    const miss = ranged && !isHigh(u.y) && isHigh(t.y) && !t.structure && this.rng.next() < C.highGroundMiss;
    if (ranged) {
      this.projectiles.push({ x: u.x, y: u.y, target: t.id, speed: d.projSpeed! / TR, dmg, src: u.id, team: u.team, splash: d.splash ?? 0, miss, slowPct: d.slowOnHit?.pct ?? 0, slowDur: d.slowOnHit?.dur ?? 0, structMult, big: u.structure || !!d.splash });
    } else this.hit(u.id, u.team, t, dmg, d.splash ?? 0, 0, 0, structMult);
  }

  private hit(srcId: number, team: Team, t: Unit, dmg: number, splash: number, slowPct: number, slowDur: number, structMult: number) {
    const src = this.byId.get(srcId) ?? null;
    const done = this.damage(t, dmg * (t.structure ? structMult : 1), src, team, 'phys');
    if (src && src.alive && done > 0 && !t.structure) { const ls = (src.hero ? src.hero.lifesteal : 0) + src.lsAdd; if (ls > 0) this.heal(src, done * ls, false); }
    if (slowPct && t.alive && !t.structure) { if (t.slowEnd <= this.tick || slowPct >= t.slowPct) t.slowPct = slowPct; t.slowEnd = Math.max(t.slowEnd, this.tick + sec(slowDur)); }
    if (splash) { const tmp: Unit[] = []; for (const v of this.enemiesIn(team, t.x, t.y, splash, tmp)) if (v !== t && (team !== 2 ? v.team !== 2 || v.aggroTeam === team : true)) this.damage(v, dmg * (v.structure ? structMult : 1), src, team, 'phys'); }
  }

  /** Apply damage. type: phys (armor applies), magic, decay (sudden death; ignores invulnerability and shields). Returns damage dealt. */
  damage(v: Unit, amt: number, src: Unit | null, team: number, type: 'phys' | 'magic' | 'decay'): number {
    if (!v.alive || amt <= 0) return 0;
    const T = this.tick;
    if (type !== 'decay') {
      if (v.invuln) return 0;
      if (type === 'phys') amt /= 1 + C.armorK * Math.max(0, v.armor + v.armorAdd);
      if (v.shield > 0) { if (T < v.shieldEnd) { const a = Math.min(v.shield, amt); v.shield -= a; amt -= a; if (amt <= 0) { v.flash = T; return 0; } } else v.shield = 0; }
      v.flash = T;
      if (v.kind === 'ancient') v.awake = true;
      if (src) {
        if (src.hero && src.team !== v.team) { this.teams[src.team as 0 | 1].stats.damageDealt += Math.min(amt, v.hp); if (v.hero) src.hero.lastHeroHit = T; }
        if (v.team === 2 && src.team !== 2) { if (!v.returning && (!v.target || v.kind !== 'boss')) v.target = src.id; v.aggroTeam = src.team; v.aggroEnd = T + sec(6); this.aggroCamp(v, src); }
        if (v.hero && src.team !== v.team && v.buffs.length) { const n = v.buffs.length; v.buffs = v.buffs.filter(b => b.tag !== 'runeRegen'); if (v.buffs.length !== n) this.refreshMods(v); }
        if ((src.hero || v.hero) && this.recordEvents) this.events.push({ type: 'dmg', x: v.x, y: v.y, amt, id: v.id, a: src.id, team: src.team });
      }
    }
    v.hp -= amt;
    if (v.hp <= 0) this.kill(v, src, team);
    return amt;
  }

  private aggroCamp(v: Unit, src: Unit) {
    if (v.camp < 0) return;
    for (const id of this.campUnits[v.camp]) { const o = this.byId.get(id); if (o && o.alive && !o.target && !o.returning) { o.target = src.id; o.aggroTeam = src.team; o.aggroEnd = v.aggroEnd; } }
  }

  heal(v: Unit, amt: number, show = true) {
    if (!v.alive || amt <= 0) return;
    const before = v.hp; v.hp = Math.min(v.maxHp, v.hp + amt);
    if (show && v.hero && v.hp - before >= 5) this.ev({ type: 'heal', x: v.x, y: v.y, amt: v.hp - before, id: v.id });
  }

  private kill(v: Unit, src: Unit | null, killerTeam: number) {
    v.alive = false; v.hp = 0; this.anyDead = true;
    const reward = killerTeam >= 0;
    this.ev({ type: 'death', x: v.x, y: v.y, team: v.team, id: v.id, text: v.kind, a: v.def.art, r: v.r, b: killerTeam });
    const G = C.gold;
    if (v.hero) {
      const h = v.hero, ts = this.teams[v.team as 0 | 1], e = (1 - v.team) as 0 | 1;
      ts.stats.deaths++;
      h.order = null; h.recallAt = 0; v.target = 0; v.buffs = []; this.refreshMods(v); v.invisEnd = 0;
      h.deathX = v.x; h.deathY = v.y;
      if (ts.revive) { ts.revive = false; h.reviveHere = true; h.respawnAt = this.tick + sec(C.hero.reviveDelay); this.ev({ type: 'reviveUsed', team: v.team, x: v.x, y: v.y }); }
      else h.respawnAt = this.tick + sec(C.hero.respawnBase + C.hero.respawnPerLevel * h.level);
      if (killerTeam === e) {
        this.addGold(e, G.heroKill + G.heroKillPerLevel * h.level, v.x, v.y);
        this.teams[e].stats.heroKills++;
        if (this.heroes[e].alive) this.addXp(e, 80 + 20 * h.level);
      }
      return;
    }
    if (v.kind === 'tower' || v.kind === 'barracks') {
      const e = (1 - v.team) as 0 | 1;
      if (v.kind === 'tower' && v.tier === 1) this.teams[e].forward[v.lane] = true;
      if (v.kind === 'barracks') this.teams[e].superLane[v.lane] = true;
      if (v.kind === 'tower' && v.tier === 2) this.ancients[v.team as 0 | 1].awake = true;
      if (reward) {
        this.addGold(e, v.kind === 'barracks' ? G.barracks : v.tier === 1 ? G.tower1 : G.tower2, v.x, v.y);
        this.teams[e].stats.towersKilled++;
        this.addXp(e, v.xp);
      }
      this.updateInvuln();
      this.ev({ type: 'structureDown', x: v.x, y: v.y, team: v.team, text: v.kind, amt: v.tier, a: v.lane });
      return;
    }
    if (v.kind === 'ancient') { this.ev({ type: 'structureDown', x: v.x, y: v.y, team: v.team, text: 'ancient' }); return; }
    if (!reward) return;
    const denied = !!src && !!src.hero && src.team === v.team;
    for (const e of [0, 1] as const) {
      if (v.team === e) continue;
      if (v.team === 2 && killerTeam !== e) continue;
      const hu = this.heroes[e];
      if (hu.alive && dist(hu.x, hu.y, v.x, v.y) <= C.hero.xpRange) this.addXp(e, v.xp * (denied ? C.hero.denyXpFrac : 1));
    }
    if (denied) { this.teams[src!.team as 0 | 1].stats.denies++; this.ev({ type: 'deny', x: v.x, y: v.y, team: src!.team }); }
    else if (src && src.hero && src.team !== 2) {
      const st = this.teams[src.team as 0 | 1].stats; st.lastHits++;
      if (v.gold > 0) this.addGold(src.team as 0 | 1, v.gold, v.x, v.y);
      this.ev({ type: 'lasthit', x: v.x, y: v.y, team: src.team });
    }
    if (v.kind === 'boss') {
      this.boss.id = 0; this.boss.level++; this.boss.nextSpawn = this.time + C.boss.respawn;
      if (killerTeam === 0 || killerTeam === 1) {
        this.addGold(killerTeam, C.boss.gold, v.x, v.y); this.addXp(killerTeam, C.boss.xp);
        this.teams[killerTeam].revive = true; this.teams[killerTeam].stats.bossKills++;
        this.ev({ type: 'bossDown', team: killerTeam, x: v.x, y: v.y });
      }
    } else if (v.camp >= 0 && (killerTeam === 0 || killerTeam === 1)) {
      if (!this.campUnits[v.camp].some(id => this.byId.get(id)?.alive)) this.teams[killerTeam].stats.campsCleared++;
    }
  }

  updateInvuln() {
    for (const t of [0, 1] as const) {
      let anyT2 = false;
      for (const l of this.lanes[t]) {
        l.t1.invuln = false; l.t2.invuln = l.t1.alive; l.barracks.invuln = l.t2.alive;
        if (l.t2.alive) anyT2 = true;
      }
      this.ancients[t].invuln = anyT2;
    }
  }

  private updateProjectiles() {
    const ps = this.projectiles; let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]; const t = this.byId.get(p.target);
      if (!t || !t.alive) continue;
      const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy);
      if (d <= p.speed + t.r * 0.5) {
        if (p.miss) this.ev({ type: 'miss', x: t.x, y: t.y });
        else this.hit(p.src, p.team, t, p.dmg, p.splash, p.slowPct, p.slowDur, p.structMult);
        continue;
      }
      p.x += (dx / d) * p.speed; p.y += (dy / d) * p.speed; ps[w++] = p;
    }
    ps.length = w;
  }

  /** Twice-per-second work: zones, auras, fountain, expiring buffs. */
  private halfSecond() {
    const T = this.tick, tmp: Unit[] = [];
    if (this.zones.length) {
      for (const z of this.zones) {
        if (z.follow) { const f = this.byId.get(z.follow); if (f && f.alive) { z.x = f.x; z.y = f.y; } else { z.end = 0; continue; } }
        const src = z.src ? this.byId.get(z.src) ?? null : null;
        if (z.dps || z.slowPct) for (const v of this.enemiesIn(z.team, z.x, z.y, z.radius, tmp)) {
          if (z.slowPct && !v.structure) { v.slowPct = Math.max(v.slowEnd > T ? v.slowPct : 0, z.slowPct); v.slowEnd = Math.max(v.slowEnd, T + 40); }
          if (z.dps) this.damage(v, z.dps * 0.5 * (v.structure ? z.structMult : 1), src, z.team, 'magic');
        }
        if (z.hps) for (const v of this.alliesIn(z.team, z.x, z.y, z.radius, tmp)) if (!v.structure) this.heal(v, z.hps * 0.5, false);
      }
      this.zones = this.zones.filter(z => z.end > T);
    }
    for (const u of this.units) {
      if (!u.alive) continue;
      if (u.buffs.length && u.buffs.some(b => b.end <= T)) this.refreshMods(u);
      if (T < u.activeAt) continue;
      const d = u.def;
      if (d.healAura) for (const v of this.alliesIn(u.team, u.x, u.y, d.healAura.radius, tmp)) if (!v.structure && v !== u) this.heal(v, d.healAura.hps * 0.5, false);
      if (d.slowAura) for (const v of this.enemiesIn(u.team, u.x, u.y, d.slowAura.radius, tmp)) if (!v.structure && v.team !== 2) { v.slowPct = Math.max(v.slowEnd > T ? v.slowPct : 0, d.slowAura.pct); v.slowEnd = Math.max(v.slowEnd, T + 40); }
    }
    // fountains burn intruders
    for (const t of [0, 1] as const) {
      const f = fountainPos(t);
      for (const v of this.enemiesIn(t, f.x, f.y, C.hero.fountainZapRadius, tmp)) if (v.team !== 2) { this.damage(v, C.hero.fountainDps * 0.5, null, t, 'magic'); this.ev({ type: 'zap', x: v.x, y: v.y, a: f.x, b: f.y }); }
    }
  }

  private separate() {
    const us = this.units, q = this.q;
    for (let i = 0; i < us.length; i++) {
      const u = us[i];
      if (!u.alive || u.structure) continue;
      this.grid.query(u.x, u.y, u.r + 60, q);
      for (let k = 0; k < q.length; k++) {
        const v = q[k];
        if (v === u || !v.alive) continue;
        if (!v.structure && v.id < u.id) continue;
        const dx = u.x - v.x, dy = u.y - v.y; const min = u.r + v.r; const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        let d = Math.sqrt(d2), nx: number, ny: number;
        if (d < 0.01) { const a = ((u.id * 7 + v.id * 13) % 16) / 16 * Math.PI * 2; nx = Math.cos(a); ny = Math.sin(a); d = 0; } else { nx = dx / d; ny = dy / d; }
        const ov = min - d;
        if (v.structure) { u.x += nx * ov; u.y += ny * ov; }
        else {
          const wu = v.r * v.r, wv = u.r * u.r, s = (ov * 0.6) / (wu + wv);
          u.x += nx * s * wu; u.y += ny * s * wu; v.x -= nx * s * wv; v.y -= ny * s * wv;
        }
      }
      if (u.x < 14) u.x = 14; else if (u.x > M.w - 14) u.x = M.w - 14;
      if (u.y < 14) u.y = 14; else if (u.y > M.h - 14) u.y = M.h - 14;
    }
  }

  private updateHeroesMeta() {
    const T = this.tick, R = C.runes;
    for (const t of [0, 1] as const) {
      const u = this.heroes[t], h = u.hero!;
      if (!u.alive) { if (T >= h.respawnAt) this.respawn(u); continue; }
      const f = fountainPos(t);
      let hr = h.hpRegen + u.rHp, mr = h.manaRegen + u.rMana;
      if (dist(u.x, u.y, f.x, f.y) <= C.hero.fountainRadius) { hr += u.maxHp * C.hero.fountainHeal; mr += h.maxMana * C.hero.fountainHeal; }
      if (u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + hr / TR);
      if (h.mana < h.maxMana) h.mana = Math.min(h.maxMana, h.mana + mr / TR);
      for (let i = 0; i < 2; i++) {
        const r = this.runes[i];
        if (!r || dist(u.x, u.y, r.x, r.y) > R.pickRadius + u.r) continue;
        this.runes[i] = null; this.teams[t].stats.runes++;
        if (r.type === 'bounty') { this.addGold(t, R.bountyGold, r.x, r.y); this.addXp(t, R.bountyXp); }
        else if (r.type === 'haste') this.addBuff(u, { ms: R.hasteMs, tag: 'runeHaste' }, R.hasteDur);
        else if (r.type === 'double') this.addBuff(u, { dmg: 1, tag: 'runeDouble' }, R.ddDur);
        else if (r.type === 'regen') this.addBuff(u, { regenFrac: R.regenFrac, manaFrac: R.regenFrac, tag: 'runeRegen' }, R.regenDur);
        else u.invisEnd = T + sec(R.invisDur);
        this.ev({ type: 'rune', team: t, x: r.x, y: r.y, text: r.type });
      }
    }
  }

  private checkEnd() {
    const a0 = this.ancients[0], a1 = this.ancients[1];
    if (!a0.alive || !a1.alive) this.winner = !a0.alive && !a1.alive ? 2 : a0.alive ? 0 : 1;
    else if (this.time >= C.match.duration + C.match.suddenDeath) {
      const f0 = a0.hp / a0.maxHp, f1 = a1.hp / a1.maxHp;
      this.winner = f0 === f1 ? 2 : f0 > f1 ? 0 : 1;
    }
    if (this.over) this.ev({ type: 'end', amt: this.winner });
  }

  /** Cheap deterministic digest of the full match state (replay verification). */
  hash(): number {
    let h = this.tick | 0;
    const mix = (v: number) => { h = (Math.imul(h ^ (Math.round(v * 100) | 0), 0x9e3779b1) + 0x7f4a7c15) | 0; };
    for (const u of this.units) { mix(u.id); mix(u.x); mix(u.y); mix(u.hp); }
    for (const t of this.teams) { mix(t.gold); mix(t.essence); }
    return h >>> 0;
  }
}

/** Re-run a match from its options and a command log. Returns the finished (or advanced) sim. */
export function replay(opts: MatchOptions, log: { tick: number; cmd: Command }[], untilTick: number): Sim {
  const s = new Sim(opts); s.recordEvents = false; let i = 0;
  while (s.tick < untilTick && !s.over) {
    while (i < log.length && log[i].tick === s.tick + 1) s.command(log[i++].cmd);
    s.step();
  }
  return s;
}
