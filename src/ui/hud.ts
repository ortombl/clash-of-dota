import { CONFIG as C } from '../data/config';
import { CARDS } from '../data/cards';
import { ITEMS, ITEM_LIST } from '../data/items';
import { CAMPS } from '../data/camps';
import type { Sim } from '../sim/sim';
import type { SimEvent } from '../sim/types';
import { icon, portrait, PAL, makeCanvas } from '../render/art';
import { audio } from '../audio/audio';
import type { Game } from '../game';
import { cardEl, cardTip, el, fmtTime, hideTip, tip } from './widgets';

const M = C.map;
const KEYS = ['Q', 'W', 'E', 'R'], ITEM_KEYS = ['Z', 'X', 'C', 'V', '', ''];

export class Hud {
  root = document.getElementById('hud')!;
  private timer!: HTMLElement; private objective!: HTMLElement; private scores!: HTMLElement[]; private pips: HTMLElement[][] = [[], []]; private ancs!: HTMLElement[];
  private toasts!: HTMLElement; private essence!: HTMLElement; private essFill!: HTMLElement; private essNum!: HTMLElement; private essMult!: HTMLElement;
  private handEl!: HTMLElement; private nextEl!: HTMLElement; private cardEls: HTMLDivElement[] = []; private handIds: string[] = []; private nextId = '';
  private hp!: HTMLElement; private mp!: HTMLElement; private xp!: HTMLElement; private hpT!: HTMLElement; private mpT!: HTMLElement; private lvl!: HTMLElement;
  private abils: { root: HTMLElement; cd: HTMLElement; ready: boolean }[] = []; private itemsEl!: HTMLElement; private itemSig = '';
  private gold!: HTMLElement; private goldShown = -1; private revive!: HTMLElement; private buffs!: HTMLElement; private buffSig = '';
  private death!: HTMLElement; private deathT!: HTMLElement; private bbBtn!: HTMLButtonElement; private vignette!: HTMLElement; aimHint!: HTMLElement;
  private mini!: HTMLCanvasElement; private miniBg!: HTMLCanvasElement; private frame = 0;
  shopEl: HTMLElement | null = null; private ghost: HTMLElement | null = null;
  private drag: { slot: number; id: number; sx: number; sy: number; moved: boolean } | null = null;

  constructor(private game: Game) {
    window.addEventListener('pointermove', e => this.onDragMove(e));
    window.addEventListener('pointerup', e => this.onDragEnd(e));
    window.addEventListener('pointercancel', () => this.cancelDrag());
  }

  build(sim: Sim) {
    const g = this.game, r = this.root; r.innerHTML = ''; r.classList.remove('hidden'); this.shopEl = null;
    this.handIds = []; this.nextId = ''; this.itemSig = ''; this.goldShown = -1; this.buffSig = ''; this.pips = [[], []]; this.abils = []; this.cardEls = [];
    // top
    const top = el('div'); top.id = 'top'; const bar = el('div', 'panel bar');
    const mkPips = (t: number) => { const p = el('div', `pips ${t ? 'e' : 'f'}`); for (let i = 0; i < 6; i++) { const d = el('div', 'pip' + (i % 3 === 2 ? ' b' : '')); this.pips[t].push(d); p.append(d); } return p; };
    this.timer = el('div', '', '0:00'); this.timer.id = 'timer';
    this.scores = [el('div', 'score f', '0'), el('div', 'score e', '0')]; this.ancs = [el('div', 'anc'), el('div', 'anc e')];
    bar.append(mkPips(0), this.ancs[0], this.scores[0], this.timer, this.scores[1], this.ancs[1], mkPips(1));
    tip(bar, () => `<h4>Objectives</h4>Squares are towers (outer, inner), circles are barracks, the diamond is the Ancient. Numbers are hero kills. Destroy the enemy Ancient to win. At 8:00 sudden death burns every structure.`);
    this.objective = el('div'); this.objective.id = 'objective'; top.append(bar, this.objective);
    const sys = el('div'); sys.id = 'sysbtns';
    const bPause = el('button', 'btn', 'II'), bSnd = el('button', 'btn', audio.muted ? 'x' : '♪'), bFs = el('button', 'btn', '⛶');
    bPause.onclick = () => g.togglePause(); bSnd.onclick = () => { audio.setMuted(!audio.muted); bSnd.textContent = audio.muted ? 'x' : '♪'; }; bFs.onclick = () => g.toggleFullscreen();
    tip(bPause, () => '<h4>Pause (Esc)</h4>Restart, game speed, sound.'); tip(bSnd, () => '<h4>Mute</h4>'); tip(bFs, () => '<h4>Fullscreen (F11)</h4>');
    sys.append(bPause, bSnd, bFs);
    this.toasts = el('div'); this.toasts.id = 'toasts';
    this.vignette = el('div'); this.vignette.id = 'vignette';
    this.aimHint = el('div', 'hidden'); this.aimHint.id = 'aimhint';
    // hero panel
    const me = sim.heroes[g.team], h = me.hero!;
    const hpn = el('div', 'panel'); hpn.id = 'heropanel';
    const por = el('div'); por.id = 'portrait'; por.append(portrait(h.def.art, g.team, 128)); this.lvl = el('div', '', '1'); this.lvl.id = 'lvl'; por.append(this.lvl);
    tip(por, () => `<h4>${h.def.name} ${h.def.title}</h4>Level ${h.level}<div class="meta">STR ${Math.round(h.str)} · AGI ${Math.round(h.agi)} · INT ${Math.round(h.int)}<br>Damage ${Math.round(me.dmg)} · Armor ${me.armor.toFixed(1)} · Speed ${Math.round(me.speed)}</div>`);
    const bars = el('div', 'bars');
    const mkBar = (cls: string) => { const b = el('div', 'bar2 ' + cls); const i = el('i'); const s = el('span'); b.append(i, s); return [b, i, s] as const; };
    const [hb, hi, hs] = mkBar('hp'), [mb, mi, ms] = mkBar('mp'), [xb, xi] = mkBar('xp');
    this.hp = hi; this.hpT = hs; this.mp = mi; this.mpT = ms; this.xp = xi;
    bars.append(el('div', 'hname', `${h.def.name}<small>${h.def.title}</small>`), hb, mb, xb);
    const arow = el('div'); arow.id = 'abilrow';
    h.def.abilities.forEach((ab, i) => {
      const a = el('div', 'abil' + (i === 3 ? ' ult' : '')); a.append(icon(ab.icon, ab.color, 96), el('div', 'key', KEYS[i]), el('div', 'mana', String(ab.mana)));
      const cd = el('div', 'cd'); a.append(cd);
      a.addEventListener('pointerdown', ev => { ev.preventDefault(); ev.stopPropagation(); g.abilityButton(i); });
      tip(a, () => `<h4>${ab.name} [${KEYS[i]}]</h4>${ab.desc}<div class="meta">${ab.mana} mana · ${ab.cd}s cooldown${h.level < C.hero.unlockLevels[i] ? ` · unlocks at level ${C.hero.unlockLevels[i]}` : ''}</div>`);
      this.abils.push({ root: a, cd, ready: true }); arow.append(a);
    });
    this.itemsEl = el('div'); this.itemsEl.id = 'items'; arow.append(this.itemsEl);
    const grow = el('div'); grow.id = 'goldrow';
    this.gold = el('div', '', '0'); this.gold.id = 'gold'; tip(this.gold, () => '<h4>Gold</h4>Earned by last hits, kills, towers, camps and the boss. Spend it on hero items at your fountain. Gold never buys cards.');
    this.revive = el('div', 'hidden', 'EMBER'); this.revive.id = 'revive'; tip(this.revive, () => '<h4>Phoenix Ember</h4>Dropped by Old Maw. Your next death revives you on the spot after 3 seconds.');
    const shopB = el('button', 'btn small', 'SHOP [B]'); shopB.id = 'shopbtn'; shopB.onclick = () => this.toggleShop();
    grow.append(this.gold, this.revive, shopB);
    this.buffs = el('div'); this.buffs.id = 'buffs';
    hpn.append(por, bars, arow, grow, this.buffs);
    // hand
    const hw = el('div'); hw.id = 'handwrap';
    this.essence = el('div'); this.essence.id = 'essence'; this.essFill = el('i'); const ticks = el('div', 'ticks', '<u></u>'.repeat(10));
    this.essNum = el('div', 'num', '5'); this.essMult = el('div', 'mult', '');
    this.essence.append(this.essFill, ticks, this.essNum, this.essMult);
    tip(this.essence, () => `<h4>Essence</h4>Pays for cards. Fills by itself: 1 per ${C.essence.regenInterval}s, twice as fast from 3:00, three times from 6:00. Essence never buys items.`);
    const hand = el('div'); hand.id = 'hand'; this.nextEl = el('div'); this.nextEl.id = 'next'; this.handEl = el('div'); this.handEl.style.cssText = 'display:flex;gap:calc(var(--u)*7)';
    hand.append(this.nextEl, this.handEl); hw.append(this.essence, hand);
    // minimap
    const mm = el('div', 'panel'); mm.id = 'minimap'; this.mini = makeCanvas(264, 440); mm.append(this.mini); this.paintMiniBg();
    const mmEvt = (ev: PointerEvent) => { const r2 = this.mini.getBoundingClientRect(); return { x: (ev.clientX - r2.left) / r2.width * M.w, y: (ev.clientY - r2.top) / r2.height * M.h }; };
    mm.addEventListener('pointerdown', ev => { ev.preventDefault(); const p = mmEvt(ev); if (ev.button === 2) g.heroOrder(p.x, p.y, false); else { g.renderer.cam.follow = false; g.renderer.cam.x = p.x; g.renderer.cam.y = p.y; mm.setPointerCapture(ev.pointerId); } });
    mm.addEventListener('pointermove', ev => { if (ev.buttons & 1 && mm.hasPointerCapture(ev.pointerId)) { const p = mmEvt(ev); g.renderer.cam.x = p.x; g.renderer.cam.y = p.y; } });
    mm.addEventListener('contextmenu', ev => ev.preventDefault());
    // death
    this.death = el('div', 'hidden'); this.death.id = 'death'; this.deathT = el('p'); this.bbBtn = el('button', 'btn small', 'Buyback');
    this.bbBtn.onclick = () => g.cmd({ type: 'buyback' }); this.death.append(el('h3', '', 'You have fallen'), this.deathT, this.bbBtn);
    r.append(this.vignette, top, sys, this.toasts, hpn, hw, mm, this.death, this.aimHint);
    this.update(sim, true);
  }

  toast(text: string, cls = '') { const t = el('div', 'toast ' + cls, text); this.toasts.append(t); while (this.toasts.children.length > 3) this.toasts.firstChild!.remove(); setTimeout(() => t.remove(), 2600); }

  onEvents(sim: Sim, events: SimEvent[]) {
    const pt = this.game.team;
    for (const e of events) {
      switch (e.type) {
        case 'essenceRate': this.toast(`ESSENCE x${e.amt}!`, 'ess'); this.essence.classList.remove('rate'); void this.essence.offsetWidth; this.essence.classList.add('rate'); break;
        case 'suddenDeath': this.toast('SUDDEN DEATH', 'bad'); this.toast('All structures are burning', 'bad'); this.vignette.classList.add('on'); this.timer.classList.add('sd'); break;
        case 'bossSpawn': this.toast('Old Maw stirs in the river', 'bad'); break;
        case 'bossDown': this.toast(e.team === pt ? 'Old Maw slain: Phoenix Ember claimed' : 'The enemy slew Old Maw', e.team === pt ? 'good' : 'bad'); break;
        case 'runeSpawn': this.toast('Runes have appeared on the river', ''); break;
        case 'structureDown': if (e.text === 'tower' && e.amt === 1 && e.team !== pt) this.toast('Forward deploy zone opened', 'good'); if (e.text === 'barracks') this.toast(e.team !== pt ? 'Your creeps in that lane are now SUPER' : 'Enemy creeps in that lane are now SUPER', e.team !== pt ? 'good' : 'bad'); break;
        case 'gold': if (e.team === pt) { this.gold.classList.remove('bump'); void this.gold.offsetWidth; this.gold.classList.add('bump'); } break;
        case 'buy': if (e.team === pt && this.shopEl) this.renderShop(sim); break;
      }
    }
  }

  // ------------------------------------------------------------------ per-frame update
  update(sim: Sim, force = false) {
    const g = this.game, pt = g.team, ts = sim.teams[pt], me = sim.heroes[pt], h = me.hero!, T = sim.tick; this.frame++;
    // essence
    this.essFill.style.width = (ts.essence / C.essence.max * 100) + '%'; const en = String(Math.floor(ts.essence + 1e-6)); if (this.essNum.textContent !== en) this.essNum.textContent = en;
    this.essence.classList.toggle('full', ts.essence >= C.essence.max);
    const mult = sim.essenceMult > 1 ? `x${sim.essenceMult}` : ''; if (this.essMult.textContent !== mult) this.essMult.textContent = mult;
    // hand
    for (let i = 0; i < 4; i++) {
      if (this.handIds[i] !== ts.hand[i]) {
        const c = cardEl(ts.hand[i], String(i + 1)); c.classList.add('newcard'); tip(c, () => cardTip(ts.hand[i]));
        c.addEventListener('pointerdown', ev => this.onCardDown(ev, i));
        if (this.cardEls[i]) this.cardEls[i].replaceWith(c); else this.handEl.append(c);
        this.cardEls[i] = c; this.handIds[i] = ts.hand[i];
      }
      const cost = CARDS[ts.hand[i]].cost, poor = ts.essence < cost, ce = this.cardEls[i];
      ce.classList.toggle('poor', poor); (ce.children[1] as HTMLElement).style.height = poor ? (1 - ts.essence / cost) * 100 + '%' : '0';
      ce.classList.toggle('armed', g.armedCard === i);
    }
    if (this.nextId !== ts.queue[0]) { this.nextId = ts.queue[0]; this.nextEl.innerHTML = 'NEXT'; const c = cardEl(this.nextId); tip(c, () => cardTip(this.nextId)); this.nextEl.append(c); }
    // hero bars
    this.hp.style.width = (me.alive ? me.hp / me.maxHp * 100 : 0) + '%'; this.mp.style.width = (h.mana / h.maxMana * 100) + '%';
    if (this.frame % 4 === 0 || force) {
      this.hpT.textContent = `${Math.ceil(me.alive ? me.hp : 0)} / ${me.maxHp}`; this.mpT.textContent = `${Math.floor(h.mana)} / ${h.maxMana}`;
      const xt = C.hero.xpTable, L = h.level; this.xp.style.width = (L >= C.hero.maxLevel ? 100 : (h.xp - xt[L - 1]) / (xt[L] - xt[L - 1]) * 100) + '%';
      if (this.lvl.textContent !== String(L)) this.lvl.textContent = String(L);
      const gshow = Math.floor(ts.gold); if (gshow !== this.goldShown) { this.goldShown = gshow; this.gold.textContent = String(gshow); }
      this.revive.classList.toggle('hidden', !ts.revive);
    }
    // abilities
    h.def.abilities.forEach((ab, i) => {
      const a = this.abils[i], locked = h.level < C.hero.unlockLevels[i], left = (h.cds[i] - T) / 60, ready = !locked && left <= 0;
      a.root.classList.toggle('locked', locked); a.root.classList.toggle('nomana', !locked && h.mana < ab.mana); a.root.classList.toggle('aim', g.ui.aimSlot === i);
      if (left > 0) { a.cd.style.height = Math.min(100, left / ab.cd * 100) + '%'; const s = left >= 10 ? String(Math.ceil(left)) : left.toFixed(1); if (a.cd.textContent !== s) a.cd.textContent = s; } else if (a.cd.style.height !== '0px') { a.cd.style.height = '0px'; a.cd.textContent = ''; }
      if (ready && !a.ready) { a.root.classList.remove('ready'); void a.root.offsetWidth; a.root.classList.add('ready'); }
      a.ready = ready;
    });
    // items
    const sig = h.items.map(i => i ? i.id + i.n : '-').join(',');
    if (sig !== this.itemSig) {
      this.itemSig = sig; this.itemsEl.innerHTML = '';
      h.items.forEach((it, i) => {
        const s = el('div', 'slot');
        if (it) { const d = ITEMS[it.id]; s.append(icon(d.icon, d.color, 64)); if (it.n > 1) s.append(el('b', '', String(it.n))); if (d.use) { s.classList.add('use'); if (ITEM_KEYS[i]) s.append(el('em', '', ITEM_KEYS[i])); s.addEventListener('pointerdown', ev => { ev.stopPropagation(); if (ev.button === 0) g.cmd({ type: 'use', slot: i }); }); } tip(s, () => `<h4>${d.name}</h4>${d.desc}${d.use ? '<div class="meta">Click to use</div>' : ''}`); }
        this.itemsEl.append(s);
      });
      if (this.shopEl) this.renderShop(sim);
    }
    // buffs
    const bs = me.buffs.filter(b => b.tag && b.tag.startsWith('rune')).map(b => b.tag!.slice(4)).join(',') + (me.invisEnd > T ? ',Invisible' : '');
    if (bs !== this.buffSig) { this.buffSig = bs; this.buffs.innerHTML = bs.split(',').filter(Boolean).map(b => `<div class="buff">${b === 'Double' ? 'Double Damage' : b}</div>`).join(''); }
    // top
    if (this.frame % 10 === 0 || force) {
      const time = sim.time, D = C.match.duration;
      this.timer.textContent = sim.suddenDeath ? fmtTime(D + C.match.suddenDeath - time) : fmtTime(time);
      this.scores[0].textContent = String(sim.teams[pt].stats.heroKills); this.scores[1].textContent = String(sim.teams[1 - pt].stats.heroKills);
      for (const side of [0, 1]) { const t = side === 0 ? pt : 1 - pt; sim.lanes[t].forEach((l, li) => [l.t1, l.t2, l.barracks].forEach((s, si) => { const p = this.pips[side][li * 3 + si]; p.classList.toggle('dead', !s.alive); p.classList.toggle('hurt', s.alive && s.hp < s.maxHp * 0.5); })); const a = sim.ancients[t]; this.ancs[side].style.opacity = a.alive ? String(0.35 + 0.65 * a.hp / a.maxHp) : '0.15'; }
      const parts: string[] = [];
      const E = C.essence; if (time < E.doubleAt) parts.push(`<span class="ess">Essence x2 in <b>${fmtTime(E.doubleAt - time)}</b></span>`); else if (time < E.tripleAt) parts.push(`<span class="ess">Essence x3 in <b>${fmtTime(E.tripleAt - time)}</b></span>`); else if (time < D) parts.push(`<span class="ess">Sudden death in <b>${fmtTime(D - time)}</b></span>`);
      if (sim.boss.id) parts.push(`<span class="boss">Old Maw <b>ALIVE</b></span>`); else parts.push(`<span class="boss">Boss in <b>${fmtTime(sim.boss.nextSpawn - time)}</b></span>`);
      const R = C.runes; if (sim.runes[0] || sim.runes[1]) parts.push(`<span>Rune <b>UP</b></span>`); else { const nx = time < R.first ? R.first : R.first + Math.ceil((time - R.first) / R.interval) * R.interval; parts.push(`<span>Rune in <b>${fmtTime(nx - time)}</b></span>`); }
      const CR = C.creeps; parts.push(`<span>Wave <b>${Math.ceil(CR.waveInterval - ((time - CR.firstWave) % CR.waveInterval + CR.waveInterval) % CR.waveInterval)}s</b></span>`);
      this.objective.innerHTML = parts.join('');
    }
    // death overlay
    if (!me.alive && !sim.over) { this.death.classList.remove('hidden'); const left = Math.max(0, (h.respawnAt - T) / 60); this.deathT.textContent = `Respawn in ${left.toFixed(1)}s. You can shop while dead.`; const cost = sim.buybackCost(pt), cdl = (h.buybackReady - T) / 60; this.bbBtn.textContent = cdl > 0 ? `Buyback ready in ${Math.ceil(cdl)}s` : `Buyback (${cost} gold)`; this.bbBtn.disabled = cdl > 0 || ts.gold < cost; }
    else this.death.classList.add('hidden');
    if (this.frame % 2 === 0) this.drawMini(sim);
    if (this.shopEl && this.frame % 20 === 0) this.renderShop(sim);
  }

  // ------------------------------------------------------------------ minimap
  private paintMiniBg() {
    const cv = this.miniBg = makeCanvas(264, 440), c = cv.getContext('2d')!, s = 264 / M.w;
    c.fillStyle = '#79b86a'; c.fillRect(0, 0, 264, 440);
    c.fillStyle = '#c9b88e'; c.fillRect(0, 0, 264, (M.riverY - M.highGround) * s); c.fillStyle = '#9cc4d8'; c.fillRect(0, (M.riverY + M.highGround) * s, 264, 440);
    c.fillStyle = '#ecdba8'; for (const lx of M.laneX) c.fillRect((lx - 50) * s, 0, 100 * s, 440);
    c.fillStyle = '#2f73ad'; c.fillRect(0, (M.riverY - M.riverHalf) * s, 264, M.riverHalf * 2 * s);
    c.fillStyle = '#b98248'; for (const lx of M.laneX) c.fillRect((lx - 60) * s, (M.riverY - M.riverHalf - 6) * s, 120 * s, (M.riverHalf * 2 + 12) * s);
    c.fillStyle = '#3a3344'; c.beginPath(); c.arc(M.bossPit.x * s, M.bossPit.y * s, 16, 0, 7); c.fill();
    c.fillStyle = '#8a6a3c'; for (const cp of CAMPS) { c.beginPath(); c.arc(cp.x * s, cp.y * s, 9, 0, 7); c.fill(); }
  }
  private drawMini(sim: Sim) {
    const c = this.mini.getContext('2d')!, s = 264 / M.w, pt = this.game.team, r = this.game.renderer;
    c.drawImage(this.miniBg, 0, 0);
    for (const u of sim.units) {
      if (!u.alive || (u.team !== pt && !u.vis[pt])) continue;
      const col = u.team === 2 ? '#e4e8c0' : PAL[u.team].main, x = u.x * s, y = u.y * s;
      c.fillStyle = col; c.strokeStyle = '#1d1626'; c.lineWidth = 2;
      if (u.hero) continue;
      if (u.structure && u.kind !== 'building') { const k = u.kind === 'ancient' ? 13 : u.kind === 'barracks' ? 8 : 10; c.fillRect(x - k / 2, y - k / 2, k, k); c.strokeRect(x - k / 2, y - k / 2, k, k); }
      else { c.beginPath(); c.arc(x, y, u.kind === 'boss' ? 8 : u.maxHp > 800 ? 4.5 : 3, 0, 7); c.fill(); }
    }
    for (const rn of sim.runes) if (rn) { c.fillStyle = '#ffd24a'; c.beginPath(); c.moveTo(rn.x * s, rn.y * s - 8); c.lineTo(rn.x * s + 6, rn.y * s); c.lineTo(rn.x * s, rn.y * s + 8); c.lineTo(rn.x * s - 6, rn.y * s); c.fill(); c.stroke(); }
    for (const hu of sim.heroes) { if (!hu.alive || (hu.team !== pt && !hu.vis[pt])) continue; c.fillStyle = PAL[hu.team].light; c.strokeStyle = '#1d1626'; c.lineWidth = 3; c.beginPath(); c.arc(hu.x * s, hu.y * s, 8, 0, 7); c.fill(); c.stroke(); c.fillStyle = PAL[hu.team].dark; c.beginPath(); c.arc(hu.x * s, hu.y * s, 3.5, 0, 7); c.fill(); }
    // camera frame
    const vw = r.W / r.cam.scale, vh = (r.H - r.hudBottom) / r.cam.scale;
    c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.strokeRect((r.cam.x - vw / 2) * s, (r.cam.y - vh / 2) * s, vw * s, vh * s);
  }
  miniWorld(cx: number, cy: number): { x: number; y: number } | null { const r = this.mini.getBoundingClientRect(); if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return null; return { x: (cx - r.left) / r.width * M.w, y: (cy - r.top) / r.height * M.h }; }

  // ------------------------------------------------------------------ card drag
  private onCardDown(ev: PointerEvent, slot: number) {
    if (ev.button !== 0) return; ev.preventDefault(); ev.stopPropagation(); hideTip();
    this.drag = { slot, id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, moved: false };
  }
  private onDragMove(ev: PointerEvent) {
    const d = this.drag, g = this.game; if (!d || ev.pointerId !== d.id || !g.sim) return;
    if (!d.moved && Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) > 8) {
      d.moved = true; g.armedCard = -1; g.ui.aimSlot = -1; audio.play('cardPick', 0.5);
      this.ghost = this.cardEls[d.slot].cloneNode(true) as HTMLElement; this.ghost.id = 'ghost'; this.ghost.classList.remove('newcard', 'armed', 'poor');
      const cv = this.ghost.querySelector('canvas'); const src = this.cardEls[d.slot].querySelector('canvas'); if (cv && src) (cv as HTMLCanvasElement).getContext('2d')!.drawImage(src as HTMLCanvasElement, 0, 0);
      document.body.append(this.ghost); this.cardEls[d.slot].classList.add('dragging');
    }
    if (!d.moved) return;
    const over = this.overField(ev.clientX, ev.clientY);
    this.ghost!.style.left = ev.clientX + 'px'; this.ghost!.style.top = ev.clientY + 'px'; this.ghost!.classList.toggle('over', !!over);
    const id = g.sim.teams[g.team].hand[d.slot];
    if (over) { g.ui.dragCard = id; g.ui.dragX = over.x; g.ui.dragY = over.y; g.ui.dragValid = g.sim.canDeploy(g.team, id, over.x, over.y) && g.sim.teams[g.team].essence >= CARDS[id].cost; }
    else g.ui.dragCard = null;
  }
  /** World position under a screen point if it is over the battlefield (or the minimap), else null. */
  overField(cx: number, cy: number): { x: number; y: number } | null {
    const mm = this.miniWorld(cx, cy); if (mm) return mm;
    const hr = this.handEl.getBoundingClientRect(); if (cy > hr.top - 4 && cx > hr.left - 70 && cx < hr.right + 10) return null;
    return this.game.renderer.screenToWorld(cx, cy);
  }
  private onDragEnd(ev: PointerEvent) {
    const d = this.drag, g = this.game; if (!d || ev.pointerId !== d.id) return;
    if (!d.moved) { g.armCard(g.armedCard === d.slot ? -1 : d.slot); this.drag = null; return; }
    const over = this.overField(ev.clientX, ev.clientY);
    if (over) g.tryDeploy(d.slot, over.x, over.y);
    this.cancelDrag();
  }
  cancelDrag() { if (this.ghost) { this.ghost.remove(); this.ghost = null; } if (this.drag) this.cardEls[this.drag.slot]?.classList.remove('dragging'); this.drag = null; this.game.ui.dragCard = null; }
  get dragging() { return !!this.drag?.moved; }

  // ------------------------------------------------------------------ shop
  toggleShop(force?: boolean) {
    const open = force ?? !this.shopEl;
    if (!open) { this.shopEl?.remove(); this.shopEl = null; return; }
    if (this.shopEl || !this.game.sim) return;
    const wrap = el('div', 'screen dim'); wrap.style.background = 'rgba(24,16,30,.35)'; wrap.addEventListener('pointerdown', e => { if (e.target === wrap) this.toggleShop(false); });
    const m = el('div', 'panel modal shop'); wrap.append(m); this.shopEl = wrap; this.root.append(wrap); this.renderShop(this.game.sim); audio.play('click', 0.5);
  }
  private renderShop(sim: Sim) {
    if (!this.shopEl) return; const m = this.shopEl.firstElementChild as HTMLElement, g = this.game, pt = g.team, ts = sim.teams[pt], can = sim.canShop(pt), inv = sim.heroes[pt].hero!.items;
    const scroll = m.scrollTop; m.innerHTML = '';
    const head = el('h2', '', `Shop <span style="font-size:.6em;color:#9a6a00">${Math.floor(ts.gold)} gold</span>`);
    const note = el('div', 'note' + (can ? ' ok' : ''), can ? 'You are at the fountain. Click an item to buy. Components are credited towards upgrades.' : 'Out of range: walk your hero back to the fountain (or shop while dead) to buy.');
    m.append(head, note);
    const tiers = ['Consumables', 'Components', 'Crafted (built from components)', 'Relics (built from crafted items)'];
    for (let t = 0; t < 4; t++) {
      m.append(el('div', 'tier', tiers[t])); const grid = el('div', 'grid');
      for (const it of ITEM_LIST.filter(i => i.tier === t)) {
        const price = sim.itemPrice(pt, it.id), afford = ts.gold >= price, room = inv.some(s => !s) || !!it.from?.some(c => inv.some(s => s && s.id === c)) || (!!it.use && inv.some(s => s && s.id === it.id && s.n < 5));
        const d = el('div', 'item' + (afford && can && room ? ' can' : ' no'));
        d.append(icon(it.icon, it.color, 64), el('div', '', `<b>${it.name}</b><span class="pr">${price < it.cost ? `<s>${it.cost}</s>` : ''}${price}g</span>`));
        tip(d, () => `<h4>${it.name}</h4>${it.desc}${it.from ? `<div class="meta">Built from: ${it.from.map(c => ITEMS[c].name).join(' + ')}</div>` : ''}`);
        d.addEventListener('pointerdown', ev => { ev.stopPropagation(); if (afford && can && room) g.cmd({ type: 'buy', item: it.id }); else { audio.play('error', 0.5); this.toast(!can ? 'Return to the fountain to shop' : !afford ? 'Not enough gold' : 'Inventory full', 'bad'); } });
        grid.append(d);
      }
      m.append(grid);
    }
    m.append(el('div', 'tier', 'Your items (click to sell for half price)')); const grid = el('div', 'grid');
    inv.forEach((s, i) => { if (!s) return; const it = ITEMS[s.id]; const d = el('div', 'item'); d.append(icon(it.icon, it.color, 64), el('div', '', `<b>${it.name}${s.n > 1 ? ' x' + s.n : ''}</b><span class="pr">sell ${Math.floor(it.cost * C.gold.sellFrac)}g</span>`)); d.addEventListener('pointerdown', ev => { ev.stopPropagation(); if (can) { g.cmd({ type: 'sell', slot: i }); setTimeout(() => this.game.sim && this.renderShop(this.game.sim), 60); } }); grid.append(d); });
    const close = el('button', 'btn small plain', 'Close [B]'); close.style.cssText = 'display:block;margin:10px auto 0'; close.onclick = () => this.toggleShop(false);
    m.append(grid, close); m.scrollTop = scroll;
  }
}
