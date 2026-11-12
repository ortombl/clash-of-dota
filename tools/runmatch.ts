import { Sim } from '../src/sim/sim';
import { Bot, randomDeck, type Difficulty } from '../src/ai/bot';
import { RNG } from '../src/sim/rng';
import { HERO_LIST } from '../src/data/heroes';
import { CONFIG } from '../src/data/config';

export interface MatchResult { lvl6: number[]; lvl12: number[]; sim: Sim; winner: number; time: number; heroes: [string, string]; decks: [string[], string[]] }
export function runMatch(seed: number, heroes?: [string, string], decks?: [string[], string[]], diff: [Difficulty, Difficulty] = ['normal', 'normal']): MatchResult {
  const r = new RNG(seed * 7919 + 13);
  const hs = heroes ?? [r.pick(HERO_LIST).id, r.pick(HERO_LIST).id] as [string, string];
  const ds = decks ?? [randomDeck(r), randomDeck(r)] as [string[], string[]];
  const sim = new Sim({ seed, heroes: hs, decks: ds });
  sim.recordEvents = false;
  const bots = [new Bot(sim, 0, diff[0], seed + 1), new Bot(sim, 1, diff[1], seed + 2)];
  const max = (CONFIG.match.duration + CONFIG.match.suddenDeath + 5) * 60;
  const lvl6 = [0, 0], lvl12 = [0, 0];
  while (!sim.over && sim.tick < max) {
    bots[0].update(); bots[1].update(); sim.step();
    if (sim.tick % 60 === 0) for (const t of [0, 1]) { const L = sim.heroes[t].hero!.level; if (!lvl6[t] && L >= 6) lvl6[t] = sim.time; if (!lvl12[t] && L >= 12) lvl12[t] = sim.time; }
  }
  return { lvl6, lvl12, sim, winner: sim.winner, time: sim.time, heroes: hs, decks: ds };
}
if (process.argv[1]?.endsWith('runmatch.ts')) {
  const t0 = Date.now();
  for (let i = 1; i <= 4; i++) {
    const m = runMatch(i);
    const s = m.sim;
    console.log(`seed ${i} ${m.heroes.join(' vs ')} winner=${m.winner} t=${m.time.toFixed(0)}s units=${s.units.length}`);
    for (const t of [0, 1] as const) {
      const st = s.teams[t].stats; const h = s.heroes[t].hero!;
      const L = s.lanes[t].map(l => `${l.t1.alive ? Math.round(l.t1.hp) : 'x'}/${l.t2.alive ? Math.round(l.t2.hp) : 'x'}/${l.barracks.alive ? Math.round(l.barracks.hp) : 'x'}`).join(' | ');
      console.log(`  T${t} lvl${h.level} lh=${st.lastHits} dn=${st.denies} gold=${Math.round(st.goldEarned)} dmg=${Math.round(st.damageDealt)} k=${st.heroKills} cards=${st.cardsPlayed} camps=${st.campsCleared} boss=${st.bossKills} runes=${st.runes} waste=${st.essenceWasted.toFixed(1)} items=${h.items.filter(Boolean).map(i => i!.id).join(',')} towers ${L} anc=${Math.round(s.ancients[t].hp)}`);
    }
  }
  console.log('ms/match', (Date.now() - t0) / 4);
}
