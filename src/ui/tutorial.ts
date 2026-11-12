import type { Game } from '../game';
import type { SimEvent } from '../sim/types';
import { CONFIG as C } from '../data/config';
import { el } from './widgets';

interface Step { title: string; text: string; hl?: string; enter?: (g: Game) => void; done: (g: Game, ev: SimEvent[], st: any) => boolean }

/** Interactive tutorial, about a minute. The enemy bot stands down until it is finished, then the match continues on Easy. */
export class Tutorial {
  private box = el('div', 'panel'); private i = -1; private st: any = {}; finished = false; private doneAt = 0;
  private steps: Step[] = [
    { title: '1 · Move your hero', text: 'Right-click the ground (or tap it) to walk. Your hero is the piece with the white ring.',
      enter: g => { const h = g.sim!.heroes[g.team]; this.st.x = h.x; this.st.y = h.y; },
      done: g => { const h = g.sim!.heroes[g.team]; return Math.hypot(h.x - this.st.x, h.y - this.st.y) > 120; } },
    { title: '2 · Last hit for gold', text: 'Gold only comes from the killing blow. Right-click the enemy creep: its bar is gold because your next hit kills it.',
      enter: g => { const s = g.sim!, h = s.heroes[g.team]; h.hero!.order = null; h.hero!.hold = true; h.target = 0; /* no auto-attack: the player must land the hit */ for (let k = 0; k < 2; k++) { const c = s.spawn('creepMelee', 1, 440 + k * 320, 1925); /* beside the fountain: out of reach of towers and lane creeps */ c.hp = 20 + k * 10; c.stunEnd = s.tick + 60 * 600; c.vis[0] = true; } },
      done: g => g.sim!.teams[g.team].stats.lastHits >= 1 },
    { title: '3 · Cast an ability', text: 'Press Q (or tap the Q button, then a target) to use your first ability. More unlock as you level; R is your ultimate at level 6.', hl: '.abil',
      done: (_g, ev) => ev.some(e => e.type === 'cast' && e.team === 0) },
    { title: '4 · Deploy a card', text: 'The pink bar is Essence. It fills over time and pays for cards. Drag a card from your hand onto your half of the field.', hl: '#hand',
      enter: g => { g.sim!.teams[g.team].essence = C.essence.max; },
      done: g => g.sim!.teams[g.team].stats.cardsPlayed >= 1 },
    { title: '5 · Spend gold on items', text: 'Gold buys hero items, never cards. Here is some gold: press B and buy anything. (Normally you must stand on your fountain or be dead to shop.)', hl: '#shopbtn',
      enter: g => { const s = g.sim!, h = s.heroes[g.team]; s.teams[g.team].gold += 300; const f = C.map.fountain; h.x = f.x; h.y = f.y - 70; h.hero!.order = null; g.renderer.cam.follow = true; },
      done: (_g, ev) => ev.some(e => e.type === 'buy' && e.team === 0) },
    { title: 'Ready', text: 'Destroy the enemy Ancient to win. Towers fall in order, runes and a boss wait on the river, and at 8:00 sudden death begins. The bot wakes up now. Good luck!',
      enter: () => { this.doneAt = performance.now() + 6000; },
      done: () => performance.now() > this.doneAt },
  ];

  constructor(private game: Game) {
    this.box.id = 'tutorial'; game.hud.root.append(this.box); this.next();
  }
  private next() {
    document.querySelectorAll('.hl').forEach(e => e.classList.remove('hl'));
    this.i++;
    if (this.i >= this.steps.length) { this.finished = true; this.box.remove(); this.game.onTutorialDone(); return; }
    const s = this.steps[this.i]; s.enter?.(this.game);
    this.box.innerHTML = `<div class="dots">${this.steps.map((_, k) => `<i class="${k < this.i ? 'done' : k === this.i ? 'on' : ''}"></i>`).join('')}</div><h3>${s.title}</h3><p>${s.text}</p>`;
    const skip = el('button', 'btn small plain', this.i === this.steps.length - 1 ? 'Start' : 'Skip tutorial'); skip.onclick = () => { this.i = this.steps.length - 1; this.next(); };
    this.box.append(skip); this.box.classList.remove('pop'); void this.box.offsetWidth; this.box.classList.add('pop');
    if (s.hl) document.querySelectorAll(s.hl).forEach(e => e.classList.add('hl'));
  }
  update(events: SimEvent[]) { if (this.finished) return; if (this.steps[this.i].done(this.game, events, this.st)) this.next(); }
}
