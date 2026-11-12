/** Simulation cost with 200+ live units fighting (headless). Usage: npx tsx tools/perf.ts */
import { Sim } from '../src/sim/sim';
import { DEFAULT_DECK } from '../src/data/cards';
const s = new Sim({ seed: 9, heroes: ['brakka', 'morvane'], decks: [DEFAULT_DECK, DEFAULT_DECK] }); s.recordEvents = false;
const kinds = ['pikeling', 'slinger', 'shieldbearer', 'bombardier', 'rat', 'hound'];
let peak = 0, ticks = 0; const t0 = performance.now();
for (let i = 0; i < 60 * 30; i++) {
  const live = s.units.filter(u => u.alive).length;
  if (live < 230) for (let k = 0; k < 6; k++) { const t = (k % 2) as 0 | 1; s.spawn(kinds[(i + k) % kinds.length], t, 150 + ((i * 53 + k * 211) % 900), t === 0 ? 1080 + (k * 37) % 200 : 920 - (k * 37) % 200); }
  s.step(); ticks++; peak = Math.max(peak, live);
}
const ms = (performance.now() - t0) / ticks;
console.log(`peak live units ${peak}, ${ms.toFixed(3)} ms per 60Hz tick (${(ms / 16.67 * 100).toFixed(1)}% of a frame budget)`);
