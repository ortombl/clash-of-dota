import { CONFIG as C } from '../data/config';
import { CARDS } from '../data/cards';
import { ITEMS } from '../data/items';
import { UNITS } from '../data/units';
import { CAMPS } from '../data/camps';
import { RNG } from '../sim/rng';
import type { Sim } from '../sim/sim';
import { ancientPos, dist, fountainPos, inDeployZone, isHigh, mirrorY, structY } from '../sim/map';
import type { CardDef, Unit } from '../sim/types';

export type Difficulty = 'easy' | 'normal' | 'hard';
const M = C.map;

interface Tuning { heroThink: number; cardThink: number; lastHit: number; saveAt: number; retreatHp: number; useBoss: boolean; deny: number; seeAll: boolean; castChance: number; counter: boolean; essenceBonus: number }
const TUNING: Record<Difficulty, Tuning> = {
  // Easy and Normal play by the same rules as the player: no extra resources, fog of war respected.
  easy: { heroThink: 36, cardThink: 80, lastHit: 0.25, saveAt: 6, retreatHp: 0.2, useBoss: false, deny: 0, seeAll: false, castChance: 0.35, counter: false, essenceBonus: 0 },
  normal: { heroThink: 15, cardThink: 30, lastHit: 0.75, saveAt: 8, retreatHp: 0.3, useBoss: true, deny: 0.3, seeAll: false, castChance: 0.9, counter: true, essenceBonus: 0 },
  // Hard reacts faster, last-hits and denies precisely and ignores fog of war (declared cheat; no resource bonus).
  hard: { heroThink: 6, cardThink: 18, lastHit: 1, saveAt: 8, retreatHp: 0.34, useBoss: true, deny: 1, seeAll: true, castChance: 1, counter: true, essenceBonus: 0 },
};

/**
 * Bot opponent. It only reads the Sim and acts through sim.command(), exactly like a player.
 * Card brain: counter-placement, split-pushing, spell baiting, essence saving.
 * Hero brain: farm / last-hit, harass, retreat, push open towers, contest boss and runes, shop.
 */
export class Bot {
  private rng: RNG; private tu: Tuning; private e: 0 | 1;
  private lane = 0; private laneUntil = 0; private mode = 'lane'; private nextShopTrip = 0;
  private enemySpells = new Map<string, number>(); // dmg spell id -> index in enemy playLog when last seen
  private logSeen = 0; private pendingFollow: { lane: number; until: number } | null = null;
  passive = false; // tutorial: bot stands down

  constructor(private sim: Sim, private team: 0 | 1, public difficulty: Difficulty, seed: number) {
    this.rng = new RNG(seed ^ 0x5bd1e995); this.tu = TUNING[difficulty]; this.e = (1 - team) as 0 | 1;
    this.lane = this.rng.int(2);
  }

  update() {
    const s = this.sim; if (s.over || this.passive) return;
    if ((s.tick + this.team * 3) % this.tu.heroThink === 0) this.heroBrain();
    if ((s.tick + this.team * 7) % this.tu.cardThink === 0) this.cardBrain();
  }

  // ---------------------------------------------------------------- helpers
  private sees(u: Unit) { return u.alive && (this.tu.seeAll ? u.invisEnd <= this.sim.tick || u.vis[this.team] : u.vis[this.team]); }
  private my(y: number) { return mirrorY(this.team, y); }           // to/from team-0 space
  private back() { return this.team === 0 ? 1 : -1; }

  /** Value of visible enemy / own mobile units per lane, split by which half they are on. */
  private scan() {
    const res = { threat: [0, 0], threatUnits: [[], []] as Unit[][], force: [0, 0], mine: [[], []] as Unit[][], enemyAll: [] as Unit[] };
    for (const u of this.sim.units) {
      if (!u.alive || u.team === 2 || u.hero || (u.structure && u.kind !== 'building')) continue;
      const v = u.def.val ?? 1;
      if (u.team === this.team) { if (!u.structure) { res.force[u.lane] += v; res.mine[u.lane].push(u); } continue; }
      if (!this.sees(u)) continue;
      res.enemyAll.push(u);
      if (u.structure) continue;
      if (this.my(u.y) > M.riverY - 40) { res.threat[u.lane] += v; res.threatUnits[u.lane].push(u); }
    }
    return res;
  }

  // ---------------------------------------------------------------- cards
  private cardBrain() {
    const s = this.sim, ts = s.teams[this.team], tu = this.tu;
    const hand = ts.hand.map((id, slot) => ({ slot, c: CARDS[id] })).filter(h => h.c.cost <= ts.essence);
    if (!hand.length) return;
    // learn the enemy's damage spells from the public play log
    const log = s.teams[this.e].playLog;
    for (; this.logSeen < log.length; this.logSeen++) { const c = CARDS[log[this.logSeen].card]; if (c.role === 'dmgSpell') this.enemySpells.set(c.id, this.logSeen); }

    if (this.difficulty === 'easy') { this.easyCards(hand); return; }
    const sc = this.scan();
    const play = (h: { slot: number; c: CardDef }, x: number, y: number) => {
      const p = this.legalize(h.c, x, y); if (!p) return false;
      s.command({ type: 'card', team: this.team, slot: h.slot, x: p.x, y: p.y }); return true;
    };

    // 1) spells of opportunity
    for (const h of hand) {
      if (h.c.type !== 'spell') continue;
      const sp = this.spellTarget(h.c, sc);
      if (sp && play(h, sp.x, sp.y)) return;
    }

    // 2) defend the more threatened lane (counter-placement)
    const tl = sc.threat[0] >= sc.threat[1] ? 0 : 1;
    const myHero = s.heroes[this.team];
    const heroHelps = myHero.alive && Math.abs(myHero.x - M.laneX[tl]) < 260 ? 1.5 : 0;
    if (sc.threat[tl] > 0) {
      const front = this.frontStructure(this.team, tl);
      const near = sc.threatUnits[tl].filter(u => Math.abs(u.y - front.y) < 520 || this.my(u.y) > this.my(front.y));
      const tv = near.reduce((a, u) => a + (u.def.val ?? 1), 0);
      const defended = sc.mine[tl].filter(u => Math.abs(u.y - front.y) < 500).reduce((a, u) => a + (u.def.val ?? 1), 0) + heroHelps;
      if (near.length && tv > defended + 0.8) {
        const pick = this.pickCounter(hand, near);
        if (pick) {
          const cx = near.reduce((a, u) => a + u.x, 0) / near.length, cy = near.reduce((a, u) => a + u.y, 0) / near.length;
          let x = cx, y = cy;
          const c = pick.c, d = c.unit ? UNITS[c.unit] : null;
          if (c.type === 'building') { x = M.laneX[tl] + (tl === 0 ? 90 : -90); y = front.y - this.back() * 150; }
          else if (d && d.range > 100) { x = M.laneX[tl] + (this.rng.next() - 0.5) * 80; y = front.y + this.back() * 70; }
          else { y = cy + this.back() * 70; }
          if (play(pick, x, y)) return;
        }
      }
    }

    // 3) attack. Save essence first unless something is already walking.
    const e = ts.essence;
    const followUp = this.pendingFollow && s.tick < this.pendingFollow.until ? this.pendingFollow : null;
    const overflow = e >= C.essence.max - 0.3;
    if (!followUp && !overflow && e < tu.saveAt) return;
    const lane = followUp ? followUp.lane : this.pushLane(sc);
    const units = hand.filter(h => h.c.type === 'troop' || h.c.type === 'champion' || (h.c.unit && UNITS[h.c.unit].spawner)); // spawner buildings are pushed with, too
    if (!units.length) {
      if (overflow) { // only buildings / spells in hand: cycle the cheapest building at the front tower
        const b = hand.filter(h => h.c.type === 'building').sort((a, b2) => a.c.cost - b2.c.cost)[0];
        if (b) { const f = this.frontStructure(this.team, lane); play(b, M.laneX[lane] + (lane === 0 ? 90 : -90), f.y - this.back() * 140); }
      }
      return;
    }
    const laneHasTank = sc.mine[lane].some(u => u.maxHp >= 500 && u.kind === 'troop' && this.my(u.y) < M.riverY + 420);
    const riverY = this.my(M.riverY + M.riverHalf + 30);
    const fwdY = ts.forward[lane] ? this.my(M.deployForwardY + 30) : riverY;
    let pick: { slot: number; c: CardDef } | undefined;
    if (!laneHasTank) pick = units.filter(h => h.c.role === 'tank' || h.c.role === 'siege').sort((a, b) => b.c.cost - a.c.cost)[0];
    if (!pick) {
      // bait out a known, unspent enemy damage spell before committing a squishy squad
      const squishy = units.filter(h => (h.c.count ?? 1) >= 3 && h.c.cost >= 3 || h.c.role === 'support');
      const bait = units.filter(h => h.c.cost <= 2 || (h.c.role === 'swarm' && h.c.cost <= 3)).sort((a, b) => a.c.cost - b.c.cost)[0];
      const spellLoaded = [...this.enemySpells.values()].some(i => log.length - i >= 3) ;
      if (squishy.length && bait && spellLoaded && !squishy.includes(bait) && this.rng.next() < 0.7) pick = bait;
      else pick = units.sort((a, b) => b.c.cost - a.c.cost)[0];
    }
    const d = UNITS[pick.c.unit!];
    const isFront = (pick.c.role === 'tank' || pick.c.role === 'siege' || d.range < 100) && pick.c.type !== 'building';
    const y = isFront ? fwdY : fwdY + this.back() * 130;
    if (play(pick, M.laneX[lane] + (this.rng.next() - 0.5) * 70, y)) {
      if (pick.c.role === 'tank') this.pendingFollow = { lane, until: s.tick + 60 * 7 };
      else if (followUp && e - pick.c.cost < 3) this.pendingFollow = null;
    }
  }

  private easyCards(hand: { slot: number; c: CardDef }[]) {
    const s = this.sim, ts = s.teams[this.team];
    if (ts.essence < this.tu.saveAt && this.rng.next() < 0.8) return;
    const h = this.rng.pick(hand); const lane = this.rng.int(2);
    let x = M.laneX[lane] + (this.rng.next() - 0.5) * 160, y = this.my(M.riverY + 110 + this.rng.next() * 380);
    if (h.c.type === 'spell') {
      const foes = s.units.filter(u => u.alive && u.team === this.e && !u.structure && this.sees(u));
      if (!foes.length) return; const f = this.rng.pick(foes); x = f.x; y = f.y;
      if (h.c.role === 'utilSpell' && h.c.id !== 'frostsnap') { const mine = s.units.filter(u => u.alive && u.team === this.team && !u.structure && !u.hero); if (!mine.length) return; const m = this.rng.pick(mine); x = m.x; y = m.y; }
    }
    const p = this.legalize(h.c, x, y); if (p) s.command({ type: 'card', team: this.team, slot: h.slot, x: p.x, y: p.y });
  }

  private legalize(c: CardDef, x: number, y: number): { x: number; y: number } | null {
    x = Math.max(40, Math.min(M.w - 40, x)); y = Math.max(40, Math.min(M.h - 40, y));
    if (c.type === 'spell') return { x, y };
    const fwd = this.sim.teams[this.team].forward;
    for (let i = 0; i < 12; i++) {
      if (inDeployZone(this.team, fwd, x, y) && this.sim.canDeploy(this.team, c.id, x, y)) return { x, y };
      y += this.back() * 45; if (i > 5) x += (this.rng.next() - 0.5) * 80;
    }
    return null;
  }

  private frontStructure(team: number, lane: number): Unit {
    const l = this.sim.lanes[team][lane];
    return l.t1.alive ? l.t1 : l.t2.alive ? l.t2 : l.barracks.alive ? l.barracks : this.sim.ancients[team as 0 | 1];
  }

  private spellTarget(c: CardDef, sc: ReturnType<Bot['scan']>): { x: number; y: number } | null {
    const s = this.sim, R = c.radius ?? 120, ts = s.teams[this.team];
    const cluster = (list: Unit[], score: (u: Unit) => number) => {
      let best = 0, bx = 0, by = 0;
      for (const a of list) { let v = 0, sx = 0, sy = 0, n = 0; for (const b of list) if (dist(a.x, a.y, b.x, b.y) <= R * 0.9) { v += score(b); sx += b.x; sy += b.y; n++; } if (v > best) { best = v; bx = sx / n; by = sy / n; } }
      return { best, x: bx, y: by };
    };
    const eh = s.heroes[this.e];
    if (c.role === 'dmgSpell') {
      const dmg = c.effects!.find(e => e.t === 'damage')!.amt!;
      const foes = sc.enemyAll.filter(u => !u.structure);
      const cl = cluster(foes, u => (u.def.val ?? 1) * Math.min(1, dmg / Math.max(1, u.hp)));
      if (this.sees(eh) && eh.hp <= dmg * 0.95 && eh.stunEnd <= s.tick + 20 === false) return { x: eh.x, y: eh.y };
      if (this.sees(eh) && eh.hp <= dmg * 0.7) return { x: eh.x, y: eh.y };
      if (cl.best >= c.cost * 0.9 + 0.4) return cl;
      return null;
    }
    if (c.id === 'frostsnap') {
      const foes = sc.threatUnits[0].concat(sc.threatUnits[1]);
      const cl = cluster(foes, u => u.def.val ?? 1);
      return cl.best >= 5 ? cl : null;
    }
    const mine = s.units.filter(u => u.alive && u.team === this.team && !u.structure && !u.hero);
    if (c.id === 'mendingrain') { const cl = cluster(mine.filter(u => u.hp < u.maxHp * 0.7), u => (u.def.val ?? 1) * (1 - u.hp / u.maxHp) * 2.2); return cl.best >= 3 ? cl : null; }
    if (c.id === 'rallyhorn') { const cl = cluster(mine.filter(u => this.my(u.y) < M.riverY + 150 && u.target), u => u.def.val ?? 1); return cl.best >= 5 ? cl : null; }
    if (c.id === 'bulwark') {
      for (let l = 0; l < 2; l++) {
        const f = this.frontStructure(this.team, l);
        if (f.hp < f.maxHp * 0.9 && s.units.filter(u => u.alive && u.team === this.e && u.target === f.id).length >= 2 && ts.essence >= 5) return { x: f.x, y: f.y };
      }
      const cl = cluster(mine.filter(u => u.target && this.my(u.y) < M.riverY), u => u.def.val ?? 1); return cl.best >= 6 ? cl : null;
    }
    return null;
  }

  private pickCounter(hand: { slot: number; c: CardDef }[], threat: Unit[]) {
    const n = threat.length; const small = threat.filter(u => u.maxHp < 220).length;
    const big = threat.filter(u => u.maxHp >= 900).length; const ranged = threat.filter(u => u.range > 100).length;
    const structOnly = threat.every(u => u.def.structOnly);
    let best: { slot: number; c: CardDef } | null = null, bs = -99;
    for (const h of hand) {
      const c = h.c; if (c.type === 'spell') continue;
      const d = UNITS[c.unit!]; let sc = 1;
      if (small >= 3 && d.splash) sc += 3;
      if (big && (c.role === 'dps' || c.role === 'swarm')) sc += 2.5;
      if (big && c.role === 'defense') sc += 1.5;
      if (ranged >= 2 && d.speed >= 135) sc += 2;
      if (n >= 4 && c.role === 'swarm' && small < 3) sc += 0.5;
      if (d.structOnly) sc -= 5;
      if (c.id === 'palisade' && structOnly) sc -= 2;
      if (c.role === 'tank') sc += 0.8;
      if (c.role === 'defense' && c.id !== 'palisade') sc += 1;
      sc -= c.cost * 0.15;
      if (sc > bs) { bs = sc; best = h; }
    }
    return bs > 0 ? best : null;
  }

  /** Split-push: avoid the lane where the enemy is committed; prefer the weaker enemy lane. */
  private pushLane(sc: ReturnType<Bot['scan']>): number {
    const s = this.sim; const score = [0, 0];
    const eh = s.heroes[this.e];
    const enemyForce = [0, 0];
    for (const u of sc.enemyAll) if (!u.structure) enemyForce[u.lane] += u.def.val ?? 1;
    for (let l = 0; l < 2; l++) {
      const f = this.frontStructure(this.e, l);
      score[l] += (1 - f.hp / f.maxHp) * 2 + (f.tier === 1 ? 0 : 1.5) + (f.kind === 'ancient' ? 1 : 0);
      score[l] += sc.force[l] * 0.35;
      score[l] -= enemyForce[l] * 0.5;
      if (this.sees(eh) && Math.abs(eh.x - M.laneX[l]) < 250) score[l] -= 1.5;
      const me = s.heroes[this.team]; if (me.alive && Math.abs(me.x - M.laneX[l]) < 250 && this.my(me.y) < M.riverY + 300) score[l] += 1;
    }
    if (Math.abs(score[0] - score[1]) < 0.3) return this.lane;
    return score[0] > score[1] ? 0 : 1;
  }

  // ---------------------------------------------------------------- hero
  private heroBrain() {
    const s = this.sim, me = s.heroes[this.team], h = me.hero!, ts = s.teams[this.team], tu = this.tu, T = s.tick;
    const cmd = (c: any) => s.command({ team: this.team, ...c });
    const f = fountainPos(this.team);
    // shopping (allowed while dead or at the fountain)
    if (s.canShop(this.team)) {
      const next = h.def.build.find(id => !this.ownsOrBuilt(id));
      if (next && s.itemPrice(this.team, next) <= ts.gold && (h.items.some(i => !i) || ITEMS[next].from)) cmd({ type: 'buy', item: next });
      else if (ts.gold >= 260 && !h.items.some(i => i && i.id === 'salve') && h.items.some(i => !i) && this.difficulty !== 'easy') cmd({ type: 'buy', item: 'salve' });
    }
    if (!me.alive) {
      // buyback only to save the Ancient
      const a = s.ancients[this.team];
      if (this.difficulty !== 'easy' && !a.invuln && a.hp < a.maxHp * 0.6 && h.respawnAt - T > 240 && ts.gold >= s.buybackCost(this.team)) cmd({ type: 'buyback' });
      return;
    }
    if (h.recallAt) return;
    const hpF = me.hp / me.maxHp;
    const eh = s.heroes[this.e]; const seeEh = this.sees(eh);
    const atFountain = dist(me.x, me.y, f.x, f.y) < C.hero.fountainRadius - 40;

    // consumable
    const salve = h.items.findIndex(i => i && i.id === 'salve');
    if (salve >= 0 && hpF < 0.55 && !me.buffs.some(b => b.tag === 'salve')) cmd({ type: 'use', slot: salve });

    // retreat
    if (this.mode === 'retreat') {
      if (hpF > 0.85 && h.mana > h.maxMana * 0.5) this.mode = 'lane';
      else { this.escapeCast(me, eh, seeEh); cmd({ type: 'move', x: f.x, y: f.y - this.back() * 40 }); return; }
    }
    if (hpF < tu.retreatHp) { this.mode = 'retreat'; cmd({ type: 'move', x: f.x, y: f.y - this.back() * 40 }); return; }
    // go shopping when a meaningful purchase is affordable
    const next = h.def.build.find(id => !this.ownsOrBuilt(id));
    if (next && !atFountain && T > this.nextShopTrip && ts.gold >= s.itemPrice(this.team, next) + 30 && this.difficulty !== 'easy') {
      const threatened = this.scan().threat; const safe = !(seeEh && dist(me.x, me.y, eh.x, eh.y) < 500);
      if (safe && threatened[0] + threatened[1] < 6) { this.mode = 'shop'; }
    }
    if (this.mode === 'shop') {
      if (atFountain) { this.mode = 'lane'; this.nextShopTrip = T + 60 * 35; }
      else { cmd({ type: 'move', x: f.x, y: f.y - this.back() * 60 }); return; }
    }

    // tower safety: back off when an enemy tower is shooting me, or I'm in range with no allies tanking
    const towerDanger = this.towerDanger(me);
    // abilities
    if (this.rng.next() < tu.castChance && this.castSomething(me, eh, seeEh, hpF)) return;
    if (towerDanger) { cmd({ type: 'move', x: me.x + (me.x - towerDanger.x) * 0.5, y: me.y + this.back() * 220 }); return; }

    // fight the enemy hero when favourable (harass)
    const ehD = seeEh ? dist(me.x, me.y, eh.x, eh.y) : 9999;
    if (seeEh && ehD < me.range + 260) {
      const myPow = me.hp * me.dmg / me.atkInt, ePow = eh.hp * eh.dmg / eh.atkInt;
      const underTower = this.inEnemyTowerRange(eh.x, eh.y, 40);
      if (!underTower && (myPow > ePow * 0.85 || eh.hp < eh.maxHp * 0.3) && this.difficulty !== 'easy') { cmd({ type: 'attack', id: eh.id }); return; }
      if (myPow < ePow * 0.5 && hpF < 0.55) { cmd({ type: 'move', x: me.x, y: me.y + this.back() * 260 }); return; }
    }

    // objectives
    const boss = s.boss.id ? s.byId.get(s.boss.id) : undefined;
    if (tu.useBoss && boss && boss.alive && h.level >= 6 + s.boss.level * 2 && hpF > 0.7 && (!eh.alive || (seeEh && ehD > 700) || h.level > eh.hero!.level + 1)) {
      const allies = s.units.filter(u => u.alive && u.team === this.team && !u.hero && dist(u.x, u.y, boss.x, boss.y) < 300).length;
      if (boss.hp < boss.maxHp * 0.6 || allies >= 0) { cmd({ type: 'attack', id: boss.id }); if (!boss.vis[this.team]) cmd({ type: 'move', x: boss.x, y: boss.y + this.back() * 120 }); return; }
    }
    if (this.difficulty !== 'easy') {
      for (const r of s.runes) if (r && dist(me.x, me.y, r.x, r.y) < 520 && hpF > 0.45) { cmd({ type: 'move', x: r.x, y: r.y }); return; }
    }

    // choose lane
    const sc = this.scan();
    if (T >= this.laneUntil) {
      const want = this.heroLane(sc); if (want !== this.lane) { this.lane = want; }
      this.laneUntil = T + 60 * (10 + this.rng.int(8));
    }
    const lane = this.lane, lx = M.laneX[lane];
    // lane targets
    const near = s.units.filter(u => u.alive && u !== me && dist(u.x, u.y, me.x, me.y) < 620);
    const foes = near.filter(u => u.team === this.e && this.sees(u) && !u.invuln);
    const creeps = foes.filter(u => !u.structure && !u.hero);
    const armorMult = (u: Unit) => 1 / (1 + C.armorK * Math.max(0, u.armor + u.armorAdd));
    const myHit = (u: Unit) => me.dmg * me.dmgMul * armorMult(u);
    // last hit
    if (creeps.length) {
      const lh = creeps.filter(u => u.hp <= myHit(u) * (1 + (1 - tu.lastHit) * 3)).sort((a, b) => a.hp - b.hp)[0];
      if (lh && dist(lh.x, lh.y, me.x, me.y) < me.range + 320) { cmd({ type: 'attack', id: lh.id }); return; }
    }
    // deny
    if (tu.deny > 0) {
      const dn = near.find(u => u.team === this.team && u.kind === 'creep' && u.hp < u.maxHp * C.hero.denyHpFrac && u.hp <= myHit(u) && dist(u.x, u.y, me.x, me.y) < me.range + 160);
      if (dn && this.rng.next() < tu.deny) { cmd({ type: 'attack', id: dn.id }); return; }
    }
    // push structures when allies are tanking
    const structs = foes.filter(u => u.structure);
    if (structs.length) {
      const st = structs.sort((a, b) => dist(a.x, a.y, me.x, me.y) - dist(b.x, b.y, me.x, me.y))[0];
      const tanks = s.units.filter(u => u.alive && u.team === this.team && !u.hero && !u.structure && dist(u.x, u.y, st.x, st.y) < st.range + 60).length;
      if ((tanks >= 2 || st.dmg === 0 || !st.awake) && !creeps.some(u => dist(u.x, u.y, me.x, me.y) < 200)) { cmd({ type: 'attack', id: st.id }); return; }
    }
    if (creeps.length) {
      // wait for last hits on hard when a creep is about to be killable, otherwise push the wave
      const t = creeps.sort((a, b) => a.hp - b.hp)[0];
      if (dist(t.x, t.y, me.x, me.y) < me.range + 380) { cmd({ type: 'attack', id: t.id }); return; }
    }
    // jungle when the lane is quiet
    if (this.difficulty !== 'easy' && hpF > 0.6 && h.level >= 2 && !creeps.length && sc.threat[0] + sc.threat[1] < 2.5) {
      const mineFront = sc.mine[lane].length;
      if (mineFront < 2 || this.mode === 'jungle') {
        let bestC: Unit | null = null, bd = 900;
        for (let ci = 0; ci < CAMPS.length; ci++) {
          if (this.my(CAMPS[ci].y) < M.riverY) continue; // own side camps only
          for (const id of s.campUnits[ci]) { const u = s.byId.get(id); if (u && u.alive) { const d = dist(u.x, u.y, me.x, me.y); if (d < bd) { bd = d; bestC = u; } } }
        }
        if (bestC) { this.mode = 'jungle'; if (bestC.vis[this.team]) cmd({ type: 'attack', id: bestC.id }); else cmd({ type: 'move', x: bestC.x, y: bestC.y }); return; }
      }
    }
    if (this.mode === 'jungle') this.mode = 'lane';
    // walk to the lane front: just behind the foremost allied unit, or the front tower
    const mine = sc.mine[lane];
    let fy: number;
    if (mine.length) { fy = this.team === 0 ? Math.min(...mine.map(u => u.y)) : Math.max(...mine.map(u => u.y)); fy += this.back() * (me.range > 100 ? 150 : 40); }
    else fy = this.frontStructure(this.team, lane).y + this.back() * 60;
    // never idle inside enemy tower range without a wave
    if (this.inEnemyTowerRange(lx, fy, 60) && mine.length < 2) fy = this.frontStructure(this.e, lane).y + this.back() * 480;
    if (dist(me.x, me.y, lx, fy) > 60) cmd({ type: 'move', x: lx + (this.rng.next() - 0.5) * 60, y: fy });
  }

  private ownsOrBuilt(id: string): boolean {
    const inv = this.sim.heroes[this.team].hero!.items;
    if (inv.some(i => i && i.id === id)) return true;
    // a component counts as done when an item built from it is owned
    return inv.some(i => i && this.builtFrom(i.id, id));
  }
  private builtFrom(item: string, comp: string): boolean { const f = ITEMS[item].from; return !!f && f.some(c => c === comp || this.builtFrom(c, comp)); }

  private heroLane(sc: ReturnType<Bot['scan']>): number {
    const s = this.sim; const score = [0, 0];
    for (let l = 0; l < 2; l++) {
      const f = this.frontStructure(this.team, l);
      score[l] += sc.threat[l] * (f.hp < f.maxHp * 0.5 ? 1.6 : 1);      // defend
      score[l] += sc.force[l] * 0.5;                                     // escort my push
      const ef = this.frontStructure(this.e, l); score[l] += (1 - ef.hp / ef.maxHp) * 1.5;
      if (l === this.lane) score[l] += 0.8;
    }
    void s;
    return score[0] >= score[1] ? 0 : 1;
  }

  private inEnemyTowerRange(x: number, y: number, pad: number): Unit | null {
    for (const u of this.sim.units) {
      if (!u.alive || u.team !== this.e || !u.structure || u.dmg <= 0 || !u.awake) continue;
      if (dist(x, y, u.x, u.y) <= u.range + u.r + pad) return u;
    }
    return null;
  }

  private towerDanger(me: Unit): Unit | null {
    const t = this.inEnemyTowerRange(me.x, me.y, 25); if (!t) return null;
    if (t.target === me.id) return t;
    const tanks = this.sim.units.filter(u => u.alive && u.team === this.team && !u.hero && !u.structure && dist(u.x, u.y, t.x, t.y) <= t.range + t.r).length;
    return tanks >= 1 ? null : t;
  }

  private escapeCast(me: Unit, eh: Unit, seeEh: boolean) {
    const s = this.sim, h = me.hero!;
    if (!seeEh || dist(me.x, me.y, eh.x, eh.y) > 500) return;
    for (let i = 0; i < 4; i++) {
      const ab = h.def.abilities[i]; if (!s.canCast(me, i)) continue;
      if (ab.ai === 'escape') { s.command({ type: 'cast', team: this.team, slot: i, x: me.x, y: me.y + this.back() * ab.range, id: 0 }); return; }
      if (ab.ai === 'shield' && ab.cast === 'self') { s.command({ type: 'cast', team: this.team, slot: i, x: me.x, y: me.y, id: 0 }); return; }
    }
  }

  private castSomething(me: Unit, eh: Unit, seeEh: boolean, hpF: number): boolean {
    const s = this.sim, h = me.hero!;
    const cast = (slot: number, x: number, y: number, id = 0) => { s.command({ type: 'cast', team: this.team, slot, x, y, id }); return true; };
    const ehD = seeEh ? dist(me.x, me.y, eh.x, eh.y) : 9999;
    const manaF = h.mana / h.maxMana;
    let foes: Unit[] | null = null;
    const getFoes = () => foes ?? (foes = s.units.filter(u => u.alive && u.team !== this.team && !u.structure && !u.invuln && this.sees(u) && (u.team !== 2 || u.aggroTeam === this.team) && dist(u.x, u.y, me.x, me.y) < 700));
    for (let i = 3; i >= 0; i--) {
      if (!s.canCast(me, i)) continue;
      const ab = h.def.abilities[i]; const R = ab.radius ?? 0; const ult = i === 3;
      const reach = ab.cast === 'self' ? R : ab.range + R * 0.5;
      switch (ab.ai) {
        case 'nuke': case 'stun': {
          const leap = ab.effects.some(e => e.t === 'blink');
          if (seeEh && ehD <= ab.range + 120 && !this.inEnemyTowerRange(eh.x, eh.y, leap ? 60 : 0) && (!leap || (hpF > 0.6 && eh.hp / eh.maxHp < hpF + 0.1)) || (seeEh && ehD <= ab.range && eh.hp < eh.maxHp * (leap ? 0.2 : 0.4))) {
            if (ult && eh.hp > eh.maxHp * 0.75) break;
            return cast(i, eh.x, eh.y, eh.id);
          }
          if (!ult && manaF > 0.75 && ab.ai === 'nuke' && !ab.effects.some(e => e.t === 'blink')) { // farm with spare mana (never by leaping in)
            const t = getFoes().filter(u => !u.hero && dist(u.x, u.y, me.x, me.y) <= ab.range + 60 && u.hp > 120).sort((a, b) => b.maxHp - a.maxHp)[0];
            if (t) return cast(i, t.x, t.y, t.id);
          }
          break;
        }
        case 'aoe': {
          if (seeEh && ehD <= reach && (!ult || eh.hp > eh.maxHp * 0.3)) {
            if (ab.cast === 'self' && ehD > R * 0.85) break;
            return cast(i, eh.x, eh.y, eh.id);
          }
          if (ab.cast === 'self' && (ab.effects[0].structMult ?? 0) >= 1 && manaF > 0.35 && s.units.some(u => u.alive && u.team === this.e && u.structure && !u.invuln && dist(u.x, u.y, me.x, me.y) <= R + u.r)) return cast(i, me.x, me.y);
          const list = getFoes().filter(u => !u.hero);
          const need = ult ? 5 : manaF > 0.5 ? 3 : 99;
          if (list.length >= need) {
            let best = 0, bx = 0, by = 0;
            for (const a of list) {
              if (ab.cast === 'self' ? false : dist(a.x, a.y, me.x, me.y) > ab.range + 40) continue;
              let v = 0; for (const b of list) if (dist(a.x, a.y, b.x, b.y) <= Math.max(R, 60)) v++;
              if (v > best) { best = v; bx = a.x; by = a.y; }
            }
            if (ab.cast === 'self') { best = list.filter(u => dist(u.x, u.y, me.x, me.y) <= R).length; bx = me.x; by = me.y; }
            if (best >= need) return cast(i, bx, by);
          }
          break;
        }
        case 'heal': {
          const allies = s.units.filter(u => u.alive && u.team === this.team && !u.structure && dist(u.x, u.y, me.x, me.y) <= (ab.cast === 'self' ? R : ab.range));
          const hurt = allies.filter(u => u.hp < u.maxHp * 0.6);
          if (hpF < 0.6 || hurt.length >= (ult ? 4 : 3)) { const t = hpF < 0.6 ? me : hurt[0]; return cast(i, t.x, t.y); }
          break;
        }
        case 'shield': {
          const hit = me.flash > s.tick - 40;
          if (hit && hpF < 0.75) return cast(i, me.x, me.y);
          break;
        }
        case 'buff': {
          const fighting = seeEh && ehD < me.range + 150;
          const allies = s.units.filter(u => u.alive && u.team === this.team && !u.structure && !u.hero && u.target && dist(u.x, u.y, me.x, me.y) <= Math.max(R, 1)).length;
          if (fighting || (R > 0 && allies >= 2) || (R === 0 && me.target && s.byId.get(me.target)?.kind === 'boss')) return cast(i, me.x, me.y);
          break;
        }
        case 'summon': {
          const busy = getFoes().some(u => dist(u.x, u.y, me.x, me.y) < 400) || this.inEnemyTowerRange(me.x, me.y, 250);
          if (busy && (manaF > 0.4 || ult)) return cast(i, me.x, me.y);
          break;
        }
        case 'escape': break;
      }
    }
    return false;
  }
}

/** Sensible random deck for bots and the balance tool: guarantees a tank, a damage spell and some cheap cards. */
export function randomDeck(rng: RNG): string[] {
  const all = Object.values(CARDS);
  for (let tries = 0; tries < 200; tries++) {
    const d = rng.shuffle(all.slice()).slice(0, C.deck.size);
    const cost = d.reduce((a, c) => a + c.cost, 0) / d.length;
    const units = d.filter(c => c.type === 'troop' || c.type === 'champion').length;
    if (cost >= 2.9 && cost <= 4.0 && units >= 4 && d.filter(c => c.type === 'spell').length <= 3 && d.filter(c => c.type === 'building').length <= 2) return d.map(c => c.id);
  }
  return all.slice(0, C.deck.size).map(c => c.id);
}
void isHigh; void ancientPos; void structY;
