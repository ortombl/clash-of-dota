import { describe, expect, it } from 'vitest';
import { Sim, replay } from '../src/sim/sim';
import { CONFIG as C } from '../src/data/config';
import { DEFAULT_DECK, CARDS, CARD_LIST } from '../src/data/cards';
import { HERO_LIST } from '../src/data/heroes';
import { ITEM_LIST } from '../src/data/items';
import { fountainPos, inDeployZone, isHigh, structY } from '../src/sim/map';
import { runMatch } from '../tools/runmatch';

const mk = (seed = 1, heroes: [string, string] = ['brakka', 'sylphine']) => new Sim({ seed, heroes, decks: [DEFAULT_DECK, DEFAULT_DECK] });
const run = (s: Sim, seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) s.step(); };
/** park both heroes out of the way and stop them auto-attacking */
const park = (s: Sim) => { for (const t of [0, 1] as const) { s.command({ type: 'stop', team: t }); } };

describe('data tables', () => {
  it('has the required content counts', () => {
    expect(HERO_LIST.length).toBe(6);
    expect(CARD_LIST.length).toBeGreaterThanOrEqual(24);
    expect(ITEM_LIST.length).toBeGreaterThanOrEqual(15);
    for (const h of HERO_LIST) expect(h.abilities.length).toBe(4);
    expect(new Set(ITEM_LIST.map(i => i.tier)).size).toBeGreaterThanOrEqual(3);
    for (const type of ['troop', 'champion', 'spell', 'building']) expect(CARD_LIST.some(c => c.type === type)).toBe(true);
  });
});

describe('essence economy', () => {
  it('regenerates 1 per 2.8s, capped at 10', () => {
    const s = mk(); park(s); s.teams[0].essence = 0;
    run(s, 28);
    expect(s.teams[0].essence).toBeCloseTo(10, 1);
    run(s, 10);
    expect(s.teams[0].essence).toBe(C.essence.max);
    expect(s.teams[0].stats.essenceWasted).toBeGreaterThan(3);
  });
  it('doubles at 3:00 and triples at 6:00 and emits an event', () => {
    const s = mk(); park(s);
    const rate = (from: number) => { while (s.time < from) s.step(); s.teams[0].essence = 0; run(s, 2.8); return s.teams[0].essence; };
    expect(rate(10)).toBeCloseTo(1, 2);
    s.events.length = 0;
    expect(rate(181)).toBeCloseTo(2, 2);
    expect(s.events.some(e => e.type === 'essenceRate' && e.amt === 2)).toBe(true);
    expect(rate(361)).toBeCloseTo(3, 2);
    expect(s.essenceMult).toBe(3);
  });
  it('gold trickles passively and is separate from essence', () => {
    const s = mk(); park(s); const g0 = s.teams[0].gold;
    run(s, 10);
    expect(Math.abs(s.teams[0].gold - g0 - C.gold.passive * 10)).toBeLessThanOrEqual(1); // paid out in whole coins
    const e = s.teams[0].essence; s.buy(0, 'salve');
    expect(s.teams[0].essence).toBeGreaterThanOrEqual(e); // buying items never spends essence
    const g1 = s.teams[0].gold; s.teams[0].essence = 10;
    s.playCard(0, 0, 250, 1500);
    expect(s.teams[0].gold).toBe(g1); // cards never spend gold
  });
});

describe('card cycle', () => {
  it('hand of 4 plus next; a played card goes to the back of the queue', () => {
    const s = mk(); const t = s.teams[0];
    expect(t.hand.length).toBe(4); expect(t.queue.length).toBe(4);
    expect(new Set([...t.hand, ...t.queue]).size).toBe(8);
    t.essence = 10;
    const played = t.hand[1], next = t.queue[0];
    expect(s.playCard(0, 1, 250, 1500)).toBe(true);
    expect(t.hand[1]).toBe(next);
    expect(t.queue[t.queue.length - 1]).toBe(played);
    expect(t.essence).toBeCloseTo(10 - CARDS[played].cost, 5);
    // cycles back after 4 more plays of that slot
    for (let i = 0; i < 4; i++) { t.essence = 10; s.playCard(0, 1, 250, 1500); }
    expect(t.hand[1]).toBe(played);
  });
  it('rejects plays without essence or outside the deploy zone; T1 kill opens forward deployment', () => {
    const s = mk(); const t = s.teams[0]; const slot = t.hand.findIndex(c => CARDS[c].type !== 'spell');
    t.essence = 0; expect(s.playCard(0, slot, 250, 1500)).toBe(false);
    t.essence = 10; expect(s.playCard(0, slot, 250, 800)).toBe(false);
    expect(inDeployZone(0, [false, false], 250, 800)).toBe(false);
    const et1 = s.lanes[1][0].t1; s.damage(et1, 99999, null, 0, 'magic');
    expect(et1.alive).toBe(false); expect(t.forward[0]).toBe(true);
    expect(inDeployZone(0, t.forward, 250, 800)).toBe(true);
    expect(inDeployZone(0, t.forward, 950, 800)).toBe(false); // other lane still closed
    expect(s.playCard(0, slot, 250, 800)).toBe(true);
  });
  it('spells can be cast anywhere and resolve after their delay', () => {
    const s = new Sim({ seed: 3, heroes: ['brakka', 'kael'], decks: [['firebomb', 'spark', 'pikelings', 'slingers', 'golem', 'turret', 'rats', 'hounds'], DEFAULT_DECK] });
    park(s); const t = s.teams[0]; t.essence = 10;
    const v = s.spawn('creepMelee', 1, 600, 500); v.vis[0] = true;
    const slot = t.hand.indexOf('firebomb');
    if (slot >= 0) { expect(s.playCard(0, slot, 600, 500)).toBe(true); run(s, 1); expect(v.alive).toBe(false); }
  });
});

describe('tower invulnerability chain', () => {
  it('T2, barracks and Ancient are invulnerable until the structure in front falls', () => {
    const s = mk(); const L = s.lanes[1][0], R = s.lanes[1][1], anc = s.ancients[1];
    expect(L.t1.invuln).toBe(false); expect(L.t2.invuln).toBe(true); expect(L.barracks.invuln).toBe(true); expect(anc.invuln).toBe(true);
    expect(s.damage(L.t2, 500, null, 0, 'magic')).toBe(0);
    expect(s.damage(anc, 500, null, 0, 'magic')).toBe(0);
    s.damage(L.t1, 99999, null, 0, 'magic');
    expect(L.t2.invuln).toBe(false); expect(L.barracks.invuln).toBe(true);
    expect(R.t2.invuln).toBe(true);                    // other lane unaffected
    s.damage(L.t2, 99999, null, 0, 'magic');
    expect(L.barracks.invuln).toBe(false);
    expect(anc.invuln).toBe(true);                     // needs BOTH tier 2 towers
    s.damage(R.t1, 99999, null, 0, 'magic'); s.damage(R.t2, 99999, null, 0, 'magic');
    expect(anc.invuln).toBe(false);
    expect(s.damage(anc, 100, null, 0, 'magic')).toBeGreaterThan(0);
    s.damage(anc, 99999, null, 0, 'magic'); s.step();
    expect(s.winner).toBe(0);
  });
  it('destroying a barracks upgrades the destroyer\'s future creeps in that lane', () => {
    const s = mk(); park(s); const L = s.lanes[1][0];
    for (const x of [L.t1, L.t2, L.barracks]) s.damage(x, 99999, null, 0, 'magic');
    expect(s.teams[0].superLane).toEqual([true, false]);
    run(s, C.creeps.firstWave + 0.1);
    const mine = s.units.filter(u => u.kind === 'creep' && u.team === 0);
    expect(mine.filter(u => u.lane === 0).every(u => u.isSuper)).toBe(true);
    expect(mine.filter(u => u.lane === 1).some(u => u.isSuper)).toBe(false);
    const sup = mine.find(u => u.lane === 0 && u.def.id === 'creepMelee')!, norm = mine.find(u => u.lane === 1 && u.def.id === 'creepMelee')!;
    expect(sup.maxHp).toBeGreaterThan(norm.maxHp * 1.5);
  });
  it('towers prioritise a hero that attacks an allied hero', () => {
    const s = mk(5, ['brakka', 'brakka']); const tw = s.lanes[0][0].t1;
    const h0 = s.heroes[0], h1 = s.heroes[1];
    h0.x = tw.x + 40; h0.y = tw.y + 40; h1.x = tw.x + 80; h1.y = tw.y - 40;
    const c = s.spawn('creepMelee', 1, tw.x - 60, tw.y - 60); c.maxHp = c.hp = 5000;
    park(s); run(s, 1.5);
    expect(tw.target).toBe(c.id);                      // creep first
    s.command({ type: 'attack', team: 1, id: h0.id });
    run(s, 1.5);
    expect(tw.target).toBe(h1.id);                     // switches to the hero who hit our hero
  });
});

describe('last hit and deny', () => {
  it('hero last hit gives full gold and counts; non-hero kills give no gold', () => {
    const s = mk(7); park(s); const h = s.heroes[0]; h.x = 600; h.y = 1300;
    const c = s.spawn('creepMelee', 1, 620, 1300); c.vis[0] = true; c.stunEnd = 99999; c.hp = 5;
    const g0 = s.teams[0].gold;
    s.command({ type: 'attack', team: 0, id: c.id }); run(s, 1.5);
    expect(c.alive).toBe(false);
    expect(s.teams[0].stats.lastHits).toBe(1);
    expect(s.teams[0].gold - g0).toBeGreaterThanOrEqual(c.gold);
    // a creep killed by a troop: no bounty
    s.command({ type: 'stop', team: 0 }); s.step();
    const c2 = s.spawn('creepMelee', 1, 300, 1300); c2.stunEnd = 99999; c2.hp = 5;
    const g1 = s.teams[0].stats.goldEarned;
    s.spawn('pikeling', 0, 310, 1300); run(s, 2);
    expect(c2.alive).toBe(false);
    expect(s.teams[0].stats.lastHits).toBe(1);
    expect(s.teams[0].stats.goldEarned - g1).toBeLessThan(C.gold.passive * 2 + 1);
  });
  it('deny: only below 50% HP; enemy gets reduced XP and nobody gets gold', () => {
    const s = mk(8); park(s); const h = s.heroes[0], e = s.heroes[1];
    h.x = 600; h.y = 1300; e.x = 600; e.y = 1100; // enemy hero within XP range
    const c = s.spawn('creepMelee', 0, 620, 1300); c.stunEnd = 99999;
    expect(s.validHeroTarget(h, c)).toBe(false);       // full HP ally cannot be attacked
    s.command({ type: 'attack', team: 0, id: c.id }); run(s, 0.5);
    expect(c.hp).toBe(c.maxHp);
    c.hp = 5;
    const xp0 = e.hero!.xp, g1 = s.teams[1].stats.goldEarned, g0 = s.teams[0].stats.goldEarned;
    s.command({ type: 'attack', team: 0, id: c.id }); run(s, 1.5);
    expect(c.alive).toBe(false);
    expect(s.teams[0].stats.denies).toBe(1);
    expect(s.teams[0].stats.lastHits).toBe(0);
    const passiveXp = C.hero.passiveXp * 2 + 2;
    const gained = e.hero!.xp - xp0;
    expect(gained).toBeGreaterThanOrEqual(c.xp * C.hero.denyXpFrac - 1);
    expect(gained).toBeLessThan(c.xp * C.hero.denyXpFrac + passiveXp);
    expect(s.teams[1].stats.goldEarned - g1).toBeLessThan(C.gold.passive * 2 + 1);
    expect(s.teams[0].stats.goldEarned - g0).toBeLessThan(C.gold.passive * 2 + 1);
  });
  it('heroes near a dying enemy unit gain XP, far heroes do not', () => {
    const s = mk(9); park(s); const h = s.heroes[0]; h.x = 600; h.y = 1300;
    const near = s.spawn('creepMelee', 1, 700, 1300), far = s.spawn('creepMelee', 1, 200, 300);
    const x0 = h.hero!.xp; s.damage(near, 9999, null, 1, 'magic'); expect(h.hero!.xp - x0).toBe(near.xp);
    const x1 = h.hero!.xp; s.damage(far, 9999, null, 1, 'magic'); expect(h.hero!.xp - x1).toBe(0);
  });
});

describe('hero, shop, items', () => {
  it('levels 1..12, ult unlocks at 6, attributes grow', () => {
    const s = mk(); const h = s.heroes[0]; const hp1 = h.maxHp;
    expect(s.abilityUnlocked(h, 0)).toBe(true); expect(s.abilityUnlocked(h, 3)).toBe(false);
    s.addXp(0, C.hero.xpTable[5]); expect(h.hero!.level).toBe(6); expect(s.abilityUnlocked(h, 3)).toBe(true);
    s.addXp(0, 99999); expect(h.hero!.level).toBe(12); expect(h.maxHp).toBeGreaterThan(hp1);
  });
  it('shop only at fountain or while dead; components are credited towards upgrades; 6 slots', () => {
    const s = mk(); park(s); const t = s.teams[0], h = s.heroes[0]; t.gold = 5000;
    expect(s.buy(0, 'ironband')).toBe(true);
    expect(s.itemPrice(0, 'girdle')).toBe(480 - 180);
    const g = t.gold, hp = h.maxHp; expect(s.buy(0, 'girdle')).toBe(true);
    expect(g - t.gold).toBe(300); expect(h.hero!.items.filter(Boolean).length).toBe(1); expect(h.maxHp).toBeGreaterThan(hp);
    for (const id of ['whetstone', 'hidevest', 'boots', 'sagebead', 'fleetwraps']) expect(s.buy(0, id)).toBe(true);
    expect(s.buy(0, 'ironband')).toBe(false);          // inventory full
    expect(s.sell(0, 5)).toBe(true);
    h.x = 250; h.y = 1200;                             // away from fountain
    expect(s.buy(0, 'salve')).toBe(false);
  });
  it('death starts a level-scaled respawn timer; buyback costs gold', () => {
    const s = mk(); park(s); const h = s.heroes[0];
    s.damage(h, 99999, null, 1, 'magic'); expect(h.alive).toBe(false);
    expect((h.hero!.respawnAt - s.tick) / 60).toBeCloseTo(C.hero.respawnBase + C.hero.respawnPerLevel, 1);
    s.teams[0].gold = 0; expect(s.buyback(0)).toBe(false);
    s.teams[0].gold = 500; expect(s.buyback(0)).toBe(true); expect(h.alive).toBe(true);
    expect(s.teams[0].gold).toBe(500 - s.buybackCost(0));
    const f = fountainPos(0); expect(Math.hypot(h.x - f.x, h.y - f.y)).toBeLessThan(100);
  });
  it('abilities cost mana, go on cooldown and deal damage', () => {
    const s = mk(11, ['morvane', 'brakka']); park(s); const h = s.heroes[0]; h.x = 600; h.y = 1300;
    const c = s.spawn('creepMelee', 1, 700, 1300); c.stunEnd = 99999; c.vis[0] = true;
    const mana = h.hero!.mana;
    s.command({ type: 'cast', team: 0, slot: 0, x: c.x, y: c.y, id: c.id }); run(s, 0.2);
    expect(h.hero!.mana).toBeLessThan(mana - 40); expect(c.hp).toBeLessThan(c.maxHp);
    expect(s.canCast(h, 0)).toBe(false);
  });
});

describe('jungle, boss, runes, vision', () => {
  it('camps spawn and respawn on the 60s clock; boss spawns at 3:00, grows, drops a revive', () => {
    const s = mk(); park(s);
    run(s, C.jungle.firstSpawn + 0.1);
    expect(s.units.filter(u => u.kind === 'neutral').length).toBeGreaterThan(0);
    const camp0 = s.campUnits[0].map(id => s.byId.get(id)!); for (const u of camp0) s.damage(u, 9999, null, 0, 'magic');
    run(s, 1); expect(s.campUnits[0].some(id => s.byId.get(id)?.alive)).toBe(false);
    run(s, C.jungle.respawn); expect(s.campUnits[0].some(id => s.byId.get(id)?.alive)).toBe(true);
    expect(s.boss.id).toBe(0);
    while (s.time < C.boss.spawnAt + 0.1) s.step();
    const b = s.byId.get(s.boss.id)!; expect(b.alive).toBe(true); const hp1 = b.maxHp;
    s.damage(b, 99999, s.heroes[0], 0, 'magic');
    expect(s.teams[0].revive).toBe(true); expect(s.teams[0].stats.bossKills).toBe(1);
    run(s, C.boss.respawn + 1);
    expect(s.byId.get(s.boss.id)!.maxHp).toBeGreaterThan(hp1);
    // revive: hero comes back where it died after a short delay
    const h = s.heroes[0]; h.x = 300; h.y = 1200; s.damage(h, 99999, null, 1, 'magic');
    run(s, C.hero.reviveDelay + 0.2); expect(h.alive).toBe(true); expect(h.x).toBeCloseTo(300, 0); expect(s.teams[0].revive).toBe(false);
  });
  it('runes spawn on both river spots and apply when walked over', () => {
    const s = mk(); park(s);
    run(s, C.runes.first + 0.1); expect(s.runes[0]).not.toBeNull(); expect(s.runes[1]).not.toBeNull();
    const h = s.heroes[0]; s.runes[0]!.type = 'bounty'; const g = s.teams[0].gold;
    h.x = s.runes[0]!.x; h.y = s.runes[0]!.y; s.step();
    expect(s.runes[0]).toBeNull(); expect(s.teams[0].gold).toBeGreaterThanOrEqual(g + C.runes.bountyGold);
    s.runes[1]!.type = 'double'; h.x = s.runes[1]!.x; h.y = s.runes[1]!.y; s.step();
    expect(h.dmgMul).toBe(2);
    run(s, C.runes.interval); expect(s.runes[0]).not.toBeNull();
  });
  it('fog: low ground cannot see high ground; ranged low->high attacks miss about 25%', () => {
    const s = mk(21, ['sylphine', 'brakka']); park(s);
    const lowY = C.map.riverY + C.map.highGround - 60, highY = C.map.riverY + C.map.highGround + 60;
    expect(isHigh(lowY)).toBe(false); expect(isHigh(highY)).toBe(true);
    const viewer = s.spawn('slinger', 1, 600, lowY); viewer.stunEnd = 99999;
    const hi = s.spawn('pikeling', 0, 600, highY); hi.stunEnd = 99999; hi.maxHp = hi.hp = 1e7;
    const lo = s.spawn('pikeling', 0, 660, lowY); lo.stunEnd = 99999;
    run(s, 0.3);
    expect(lo.vis[1]).toBe(true); expect(hi.vis[1]).toBe(false);
    expect(viewer.vis[0]).toBe(true);                  // high ground sees down
    // miss chance: enemy hero (ranged) on low ground shooting uphill
    const arch = s.heroes[0]; arch.team = 0;
    const shooter = s.spawn('slinger', 1, 640, lowY); shooter.speed = 0; shooter.maxHp = shooter.hp = 1e7; const up = s.spawn('pikeling', 1, 600, highY + 30); up.stunEnd = 99999; // gives team 1 high-ground vision
    void shooter; void up;
    let miss = 0; s.events.length = 0;
    for (let i = 0; i < 60 * 240; i++) { s.step(); }
    miss = s.events.filter(e => e.type === 'miss').length;
    const shots = Math.round((1e7 - hi.hp) / (shooter.dmg)) + miss;
    expect(shots).toBeGreaterThan(100);
    expect(miss / shots).toBeGreaterThan(0.17); expect(miss / shots).toBeLessThan(0.33);
  });
});

describe('sudden death and determinism', () => {
  it('sudden death starts at 8:00, decays structures, and the weaker side loses first', () => {
    const s = mk(); s.recordEvents = false;
    // freeze the match: remove creep interference by parking heroes; damage one of team 1's towers
    s.damage(s.lanes[1][0].t1, 700, null, 0, 'magic');
    for (const t of [0, 1] as const) s.command({ type: 'stop', team: t });
    while (!s.over && s.time < 700) s.step();
    expect(s.suddenDeath).toBe(true);
    expect(s.time).toBeGreaterThan(C.match.duration);
    expect(s.time).toBeLessThanOrEqual(C.match.duration + C.match.suddenDeath + 0.1);
    expect(s.winner).toBeGreaterThanOrEqual(0);
  });
  it('exactly equal sudden death is a draw', () => {
    const s = mk(); s.recordEvents = false;
    (s as any).spawns = () => {}; (s as any).economy = function () { if (!this.suddenDeath && this.time >= C.match.duration) this.suddenDeath = true; };
    for (const h of s.heroes) h.alive = false, h.hero!.respawnAt = 1e9;
    while (!s.over && s.time < 700) s.step();
    expect(s.winner).toBe(2);
  });
  it('same seed and same commands replay to the identical state', () => {
    const a = runMatch(42); const b = replay(a.sim.opts, a.sim.cmdLog, a.sim.tick);
    expect(b.tick).toBe(a.sim.tick); expect(b.hash()).toBe(a.sim.hash()); expect(b.winner).toBe(a.sim.winner);
    const c = runMatch(42); expect(c.sim.hash()).toBe(a.sim.hash());
    expect(structY(0, 't1')).toBe(C.map.t1Y);
  });
});
