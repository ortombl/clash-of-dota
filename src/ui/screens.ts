import { CONFIG as C } from '../data/config';
import { CARD_LIST, CARDS } from '../data/cards';
import { HERO_LIST, HEROES } from '../data/heroes';
import type { Sim } from '../sim/sim';
import { icon, portrait } from '../render/art';
import { audio } from '../audio/audio';
import type { Game } from '../game';
import { cardEl, cardTip, el, fmtTime, tip } from './widgets';

export class Screens {
  root = document.getElementById('screens')!;
  constructor(private game: Game) {}
  clear() { this.root.innerHTML = ''; }
  get open() { return this.root.childElementCount > 0; }
  private click(b: HTMLElement, fn: () => void) { b.addEventListener('click', () => { audio.init(); audio.play('click', 0.6); fn(); }); return b; }

  menu() {
    this.clear(); const g = this.game;
    const s = el('div', 'screen menu');
    const t = el('div', 'title');
    t.innerHTML = `<h1><span class="f">FROST</span><span class="e">EMBER</span><small>DUEL</small></h1><p>Cards deploy. A hero fights. Eight minutes.</p>`;
    const col = el('div', 'col');
    col.append(
      this.click(el('button', 'btn', 'PLAY'), () => this.deck()),
      this.click(el('button', 'btn blue', 'TUTORIAL (60s)'), () => g.startMatch(true)),
      this.click(el('button', 'btn plain', 'HOW TO PLAY'), () => this.help()),
    );
    t.append(col, el('div', 'foot', 'F11 fullscreen · Esc pause · works offline'));
    const l = portrait(g.settings.hero, 0, 480); l.className = 'menu-hero l'; const r = portrait('morvane' === g.settings.hero ? 'kael' : 'morvane', 1, 480); r.className = 'menu-hero r';
    s.append(l, r, t); this.root.append(s);
  }

  help() {
    const s = el('div', 'screen dim'); const m = el('div', 'panel modal'); m.style.maxWidth = 'calc(var(--u)*640)';
    m.innerHTML = `<h2>How to play</h2>
      <p class="sub">You are the commander and the champion at once.</p>
      <div style="font-size:calc(var(--u)*13.5);line-height:1.45">
      <p><b>Win</b> by destroying the enemy Ancient. Towers fall in order: outer, inner, barracks. The Ancient is invulnerable until both inner towers are down. At 8:00 sudden death burns every structure; the side with the weaker base loses.</p>
      <p><b>Essence</b> (pink bar) fills by itself and pays for <b>cards</b>. Drag a card onto your half. It speeds up at 3:00 and again at 6:00.</p>
      <p><b>Gold</b> pays for <b>hero items</b> at your fountain. You earn it by landing the killing blow on enemy units (their health bar turns gold when your next hit kills), by hero kills, towers, jungle camps and the river boss.</p>
      <p><b>Deny</b>: finish off your own creep under half health (purple bar) and the enemy gets little experience and no gold.</p>
      <p><b>River</b>: runes appear every 2 minutes. Old Maw wakes at 3:00 and drops a Phoenix Ember (a free revive).</p>
      <p><b>High ground</b>: units below cannot see up, and ranged attacks uphill miss 25% of the time.</p></div>
      <div class="keys">${KEYS_HTML}</div>`;
    const b = this.click(el('button', 'btn', 'Got it'), () => s.remove()); b.style.cssText = 'display:block;margin:14px auto 0'; m.append(b); s.append(m); this.root.append(s);
  }

  deck() {
    this.clear(); const g = this.game, st = g.settings;
    const s = el('div', 'screen menu'); const p = el('div', 'panel deck');
    const left = el('div'), right = el('div');
    left.append(el('h2', '', 'Choose your hero'));
    const hs = el('div', 'heroes'), info = el('div', 'hinfo');
    const showHero = () => {
      const h = HEROES[st.hero]; info.innerHTML = `<h3>${h.name} <small style="font-family:var(--body);font-size:.6em;font-weight:600">${h.title}</small></h3>
        <div class="attr"><b style="background:#d6453a">STR ${h.str}</b><b style="background:#3fa856">AGI ${h.agi}</b><b style="background:#3a7fe0">INT ${h.int}</b> ${h.range > 100 ? 'Ranged' : 'Melee'}</div>${h.blurb}`;
      h.abilities.forEach((a, i) => { const row = el('div', 'ab'); row.append(icon(a.icon, a.color, 64), el('div', '', `<b>${'QWER'[i]} · ${a.name}</b>${i === 3 ? ' (level 6)' : ''}<br>${a.desc}`)); info.append(row); });
      hs.querySelectorAll('.hpick').forEach(e => e.classList.toggle('sel', (e as HTMLElement).dataset.h === st.hero));
    };
    for (const h of HERO_LIST) { const d = el('div', 'hpick'); d.dataset.h = h.id; d.append(portrait(h.art, 0, 160), document.createTextNode(h.name)); this.click(d, () => { st.hero = h.id; showHero(); g.saveSettings(); }); hs.append(d); }
    left.append(hs, info);
    const title = el('h2'); const pool = el('div', 'pool');
    const refresh = () => {
      const avg = st.deck.reduce((a, c) => a + CARDS[c].cost, 0) / Math.max(1, st.deck.length);
      title.innerHTML = `Build your deck <small>${st.deck.length}/${C.deck.size} cards · average cost ${avg.toFixed(1)}</small>`;
      pool.querySelectorAll('.card').forEach(e => e.classList.toggle('sel', st.deck.includes((e as HTMLElement).dataset.card!)));
      start.disabled = st.deck.length !== C.deck.size; start.textContent = st.deck.length === C.deck.size ? 'START MATCH' : `PICK ${C.deck.size - st.deck.length} MORE`;
    };
    for (const c of CARD_LIST) { const d = cardEl(c.id); tip(d, () => cardTip(c.id)); this.click(d, () => { const i = st.deck.indexOf(c.id); if (i >= 0) st.deck.splice(i, 1); else if (st.deck.length < C.deck.size) st.deck.push(c.id); else { audio.play('error', 0.5); return; } refresh(); g.saveSettings(); }); pool.append(d); }
    const bar = el('div', 'deckbar');
    const seg = el('div', 'seg');
    for (const d of ['easy', 'normal', 'hard'] as const) { const b = el('button', st.difficulty === d ? 'on' : '', d[0].toUpperCase() + d.slice(1)); this.click(b, () => { st.difficulty = d; seg.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); g.saveSettings(); }); seg.append(b); }
    tip(seg, () => '<h4>Bot difficulty</h4>Easy and Normal play fair: same essence, same gold, same fog of war. Hard reacts faster, last-hits precisely and sees through the fog.');
    const start = el('button', 'btn ember', 'START MATCH') as HTMLButtonElement; this.click(start, () => { if (st.deck.length === C.deck.size) g.startMatch(false); });
    const back = this.click(el('button', 'btn plain small', 'Back'), () => this.menu());
    const clearB = this.click(el('button', 'btn plain small', 'Clear'), () => { st.deck = []; refresh(); });
    bar.append(back, clearB, el('span', '', '<b>Bot:</b>'), seg, start); start.style.marginLeft = 'auto';
    right.append(title, pool, bar); p.append(left, right); s.append(p); this.root.append(s);
    showHero(); refresh();
  }

  pause() {
    this.clear(); const g = this.game;
    const s = el('div', 'screen dim'); const m = el('div', 'panel modal'); m.style.minWidth = 'calc(var(--u)*380)';
    m.append(el('h2', '', 'Paused'));
    const col = el('div', 'col');
    col.append(this.click(el('button', 'btn', 'Resume'), () => g.togglePause()));
    const sp = el('div', 'row'); sp.append(el('span', '', 'Game speed')); const seg = el('div', 'seg');
    for (const v of [0.5, 1, 1.5, 2]) { const b = el('button', g.settings.speed === v ? 'on' : '', v + 'x'); this.click(b, () => { g.settings.speed = v; seg.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); g.saveSettings(); }); seg.append(b); }
    sp.append(seg);
    const slider = (label: string, val: number, set: (v: number) => void) => { const r = el('div', 'row'); const i = el('input') as HTMLInputElement; i.type = 'range'; i.min = '0'; i.max = '100'; i.value = String(Math.round(val * 100)); i.style.pointerEvents = 'auto'; i.oninput = () => { set(+i.value / 100); g.saveSettings(); }; r.append(el('span', '', label), i); return r; };
    col.append(sp, slider('Sound effects', g.settings.sfx, v => { g.settings.sfx = v; audio.setVolumes(v, g.settings.music); }), slider('Music', g.settings.music, v => { g.settings.music = v; audio.setVolumes(g.settings.sfx, v); }));
    const r2 = el('div', 'row'); r2.append(this.click(el('button', 'btn plain small', 'Fullscreen (F11)'), () => g.toggleFullscreen()), this.click(el('button', 'btn blue small', 'Restart match'), () => g.restart()), this.click(el('button', 'btn ember small', 'Quit to menu'), () => g.toMenu()));
    col.append(r2); m.append(col, el('div', 'keys', KEYS_HTML)); s.append(m); this.root.append(s);
  }

  postMatch(sim: Sim) {
    this.clear(); const g = this.game, pt = g.team, w = sim.winner;
    const s = el('div', 'screen dim'); const m = el('div', 'panel modal'); m.style.minWidth = 'calc(var(--u)*460)';
    const res = w === 2 ? 'DRAW' : w === pt ? 'VICTORY' : 'DEFEAT';
    m.append(el('h2', 'result ' + (w === 2 ? 'draw' : w === pt ? '' : 'lose'), res));
    m.append(el('p', 'sub', `${sim.suddenDeath ? 'Decided in sudden death' : 'Ancient destroyed'} at ${fmtTime(sim.time)} · ${g.tutorialMode ? 'tutorial' : g.settings.difficulty + ' bot'}`));
    const a = sim.teams[pt].stats, b = sim.teams[1 - pt].stats, ha = sim.heroes[pt].hero!, hb = sim.heroes[1 - pt].hero!;
    const rows: [string, number | string, number | string][] = [
      ['Hero level', ha.level, hb.level], ['Last hits', a.lastHits, b.lastHits], ['Denies', a.denies, b.denies], ['Gold earned', Math.round(a.goldEarned), Math.round(b.goldEarned)],
      ['Hero damage dealt', Math.round(a.damageDealt), Math.round(b.damageDealt)], ['Hero kills', a.heroKills, b.heroKills], ['Deaths', a.deaths, b.deaths],
      ['Structures destroyed', a.towersKilled, b.towersKilled], ['Cards played', a.cardsPlayed, b.cardsPlayed], ['Camps cleared', a.campsCleared, b.campsCleared], ['Boss kills', a.bossKills, b.bossKills], ['Runes taken', a.runes, b.runes],
    ];
    const tb = el('table', 'stats'); tb.innerHTML = `<tr><th>You (${ha.def.name})</th><th></th><th>Bot (${hb.def.name})</th></tr>` + rows.map(r => `<tr><td>${r[1]}</td><td>${r[0]}</td><td>${r[2]}</td></tr>`).join('');
    const row = el('div', 'row'); row.style.justifyContent = 'center';
    row.append(this.click(el('button', 'btn', 'Rematch'), () => g.startMatch(false)), this.click(el('button', 'btn blue', 'Change deck'), () => { g.toMenu(); this.deck(); }), this.click(el('button', 'btn plain', 'Menu'), () => g.toMenu()));
    m.append(tb, row); s.append(m); this.root.append(s);
  }
}

const KEYS_HTML = `<b>Right-click</b> / <b>tap</b> move, attack<br><b>Q W E R</b> abilities at cursor<br><b>S</b> stop (hold for last hits)<br><b>Drag card</b> or <b>1-4</b> then click<br><b>B</b> shop (at fountain)<br><b>Z X C V</b> use items<br><b>Space</b> centre on hero<br><b>Arrows</b> / minimap: move camera<br><b>Wheel</b> zoom<br><b>Esc</b> pause · <b>F11</b> fullscreen`;
