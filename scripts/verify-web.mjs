// End-to-end check of the built web bundle (the same files Electron loads), driven with real input events.
// Usage: node scripts/verify-web.mjs [matches=10] [speed=24]
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const MATCHES = +(process.argv[2] ?? 10), SPEED = +(process.argv[3] ?? 24);
const url = 'file://' + path.resolve('dist/index.html');
fs.mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
const errors = []; const results = []; let failed = 0;
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`); if (!ok) failed++; console.log(results[results.length - 1]); };
const newPage = async (w = 1280, h = 720) => {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  return p;
};
const G = (p, fn, arg) => p.evaluate(fn, arg);

// ---------- 1. menu -> deck builder -> match ----------
let p = await newPage();
await p.goto(url); await p.waitForSelector('.title .btn');
await p.screenshot({ path: 'shots/01-menu.png' });
await p.click('text=HOW TO PLAY'); await p.waitForTimeout(300); await p.screenshot({ path: 'shots/02-help.png' }); await p.click('text=Got it');
await p.click('text=PLAY'); await p.waitForSelector('.deck');
await p.click('.hpick[data-h="sylphine"]'); await p.waitForTimeout(200);
await p.screenshot({ path: 'shots/03-deck.png' });
check('deck builder shows 6 heroes and 24+ cards', await p.locator('.hpick').count() === 6 && await p.locator('.pool .card').count() >= 24);
await p.click('.seg >> text=Easy');
await p.click('text=START MATCH'); await p.waitForSelector('#heropanel');
check('match starts from the menu', await G(p, () => !!window.__game.sim && window.__game.state === 'play'));
const world = async (x, y) => G(p, ([x, y]) => window.__game.renderer.worldToScreen(x, y), [x, y]);
// move with right click
const h0 = await G(p, () => { const h = window.__game.sim.heroes[0]; return { x: h.x, y: h.y }; });
let s = await world(h0.x + 150, h0.y - 250); await p.mouse.click(s.x, s.y, { button: 'right' }); await p.waitForTimeout(1800);
const h1 = await G(p, () => { const h = window.__game.sim.heroes[0]; return { x: h.x, y: h.y }; });
check('right-click moves the hero', Math.hypot(h1.x - h0.x, h1.y - h0.y) > 100, `moved ${Math.round(Math.hypot(h1.x - h0.x, h1.y - h0.y))}`);
// drag a card onto the field
await G(p, () => { window.__game.sim.teams[0].essence = 10; });
const cardBox = await p.locator('#hand .card').nth(1).boundingBox();
const before = await G(p, () => window.__game.sim.teams[0].stats.cardsPlayed);
s = await world(250, 1500);
await G(p, () => { const g = window.__game; g.renderer.cam.follow = false; g.renderer.cam.x = 420; g.renderer.cam.y = 1500; }); await p.waitForTimeout(300); s = await world(250, 1500);
await p.mouse.move(cardBox.x + 30, cardBox.y + 40); await p.mouse.down(); await p.mouse.move(s.x + 40, s.y + 60, { steps: 6 }); await p.mouse.move(s.x, s.y, { steps: 6 });
await p.screenshot({ path: 'shots/04-card-drag.png' });
await p.mouse.up(); await p.waitForTimeout(600);
await p.screenshot({ path: 'shots/05-card-deployed.png' });
check('dragging a card deploys it and spends essence', await G(p, () => window.__game.sim.teams[0].stats.cardsPlayed) === before + 1 && await G(p, () => window.__game.sim.teams[0].essence) < 10);
// last hit: plant a weak enemy creep next to the hero and attack it with a right click
await G(p, () => { const g = window.__game, s = g.sim, h = s.heroes[0]; g.renderer.cam.follow = true; h.x = 600; h.y = 1500; h.hero.order = null; s.command({ type: 'stop', team: 0 }); const c = s.spawn('creepMelee', 1, h.x + 60, h.y - 40); c.hp = 12; c.stunEnd = s.tick + 6000; window.__c = c.id; });
await p.waitForTimeout(500);
const cpos = await G(p, () => { const c = window.__game.sim.byId.get(window.__c); return { x: c.x, y: c.y - 8 }; });
s = await world(cpos.x, cpos.y); const g0 = await G(p, () => window.__game.sim.teams[0].gold);
await p.mouse.click(s.x, s.y, { button: 'right' }); await p.waitForTimeout(2200);
const lh = await G(p, () => ({ lh: window.__game.sim.teams[0].stats.lastHits, gold: window.__game.sim.teams[0].gold }));
check('last hit: killing blow by the hero pays gold', lh.lh >= 1 && lh.gold >= g0 + 22, `lastHits=${lh.lh} gold ${Math.floor(g0)} -> ${Math.floor(lh.gold)}`);
// deny: an allied creep under 50% HP, finished by the hero
await G(p, () => { const s = window.__game.sim, h = s.heroes[0]; s.command({ type: 'stop', team: 0 }); h.x = 600; h.y = 1500; const c = s.spawn('creepMelee', 0, h.x - 60, h.y - 40); c.hp = 12; c.stunEnd = s.tick + 6000; window.__c = c.id; });
await p.waitForTimeout(400);
const dpos = await G(p, () => { const c = window.__game.sim.byId.get(window.__c); return { x: c.x, y: c.y - 8 }; });
s = await world(dpos.x, dpos.y); await p.mouse.click(s.x, s.y, { button: 'right' }); await p.waitForTimeout(2200);
check('deny: finishing an allied creep under 50% counts as a deny', await G(p, () => window.__game.sim.teams[0].stats.denies) >= 1);
// ability via keyboard
await G(p, () => { const s = window.__game.sim, h = s.heroes[0]; h.x = 600; h.y = 1500; s.command({ type: 'stop', team: 0 }); const c = s.spawn('creepMelee', 1, h.x + 40, h.y - 150); c.maxHp = c.hp = 4000; c.stunEnd = s.tick + 6000; window.__c = c.id; });
await p.waitForTimeout(400);
const apos = await G(p, () => { const c = window.__game.sim.byId.get(window.__c); return { x: c.x, y: c.y }; }); s = await world(apos.x, apos.y);
await p.mouse.move(s.x, s.y); const m0 = await G(p, () => window.__game.sim.heroes[0].hero.mana); await p.keyboard.press('q'); await p.waitForTimeout(900);
check('Q casts an ability (mana spent, cooldown started)', await G(p, () => window.__game.sim.heroes[0].hero.mana) < m0 - 20 && await G(p, () => window.__game.sim.heroes[0].hero.cds[0] > window.__game.sim.tick));
await p.screenshot({ path: 'shots/06-combat.png' });
// shop: teleport to the fountain, open with B, buy with a click
await G(p, () => { const s = window.__game.sim, h = s.heroes[0]; s.byId.get(window.__c).hp = 1; h.x = 600; h.y = 1880; s.command({ type: 'stop', team: 0 }); s.teams[0].gold = 700; });
await p.waitForTimeout(300); await p.keyboard.press('b'); await p.waitForSelector('.shop');
await p.locator('.item', { hasText: 'Iron Band' }).first().dispatchEvent('pointerdown'); await p.waitForTimeout(300);
await p.locator('.item', { hasText: 'Brawler Girdle' }).first().dispatchEvent('pointerdown'); await p.waitForTimeout(400);
await p.screenshot({ path: 'shots/07-shop.png' });
const inv = await G(p, () => ({ items: window.__game.sim.heroes[0].hero.items.filter(Boolean).map(i => i.id), gold: Math.floor(window.__game.sim.teams[0].gold) }));
check('shop: component then upgrade, components credited', inv.items.length === 1 && inv.items[0] === 'girdle' && inv.gold >= 700 - 480 && inv.gold <= 700 - 480 + 12, JSON.stringify(inv));
await p.keyboard.press('b');
// pause, speed, resume
await p.keyboard.press('Escape'); await p.waitForSelector('.modal'); const t0 = await G(p, () => window.__game.sim.tick); await p.waitForTimeout(500);
await p.screenshot({ path: 'shots/08-pause.png' });
check('pause freezes the simulation', await G(p, () => window.__game.sim.tick) === t0);
await p.click('.seg >> text=2x'); await p.click('text=Resume'); await p.waitForTimeout(400);
check('resume and game speed option', await G(p, () => window.__game.sim.tick) > t0 && await G(p, () => window.__game.settings.speed) === 2);
// essence rate change, boss, runes, sudden death: fast-forward the live match and watch the HUD
await G(p, () => { const g = window.__game; g.auto.enabled = true; g.auto.speed = 30; g.auto.target = 99; g.sim.heroes[0].hero.order = null; });
await p.waitForFunction(() => window.__game.sim.time > 181, null, { timeout: 120000 }); await p.waitForTimeout(250);
await p.screenshot({ path: 'shots/09-essence-x2.png' });
check('essence rate doubles at 3:00 with a visible indicator', await G(p, () => window.__game.sim.essenceMult === 2 && document.querySelector('#essence .mult').textContent === 'x2'));
check('boss spawns at 3:00', await G(p, () => window.__game.sim.boss.id > 0 || window.__game.sim.boss.level > 0));
check('runes have spawned', await G(p, () => window.__game.sim.runes.some(Boolean) || window.__game.sim.teams.some(t => t.stats.runes > 0)));
await G(p, () => { const g = window.__game, b = g.sim.byId.get(g.sim.boss.id); if (b) { g.renderer.cam.follow = false; g.renderer.cam.x = b.x; g.renderer.cam.y = b.y; } g.auto.speed = 1; }); await p.waitForTimeout(700);
await p.screenshot({ path: 'shots/10-boss.png' });
await G(p, () => { window.__game.auto.speed = 30; });
await p.waitForFunction(() => window.__game.sim.time > 361 || window.__game.sim.over, null, { timeout: 180000 });
check('essence rate triples at 6:00', await G(p, () => window.__game.sim.over || window.__game.sim.essenceMult === 3));
// force a clean sudden death on this match: heal everything, park heroes, jump the clock
await G(p, () => { const g = window.__game, s = g.sim; if (s.over) return; g.bot.passive = true; g.autoBot = null; g.auto.speed = 1; });
await p.waitForFunction(() => window.__game.sim.over || window.__game.sim.time > 362, null, { timeout: 60000 });
await G(p, () => { const g = window.__game; g.auto.speed = 40; });
await p.waitForFunction(() => window.__game.sim.suddenDeath || window.__game.sim.over, null, { timeout: 240000 });
await G(p, () => { window.__game.auto.speed = 2; }); await p.waitForTimeout(1500);
await p.screenshot({ path: 'shots/11-sudden-death.png' });
const sd = await G(p, () => ({ sd: window.__game.sim.suddenDeath, over: window.__game.sim.over, t: window.__game.sim.time }));
check('sudden death begins at 8:00 (or the match ended earlier)', sd.sd || sd.over, JSON.stringify(sd));
await G(p, () => { const g = window.__game; g.auto.speed = 40; g.auto.target = 1; g.auto.matches = 0; });
await p.waitForFunction(() => window.__game.state === 'over' && document.querySelector('.stats'), null, { timeout: 240000 });
await p.waitForTimeout(400); await p.screenshot({ path: 'shots/12-postmatch.png' });
const end = await G(p, () => ({ w: window.__game.sim.winner, t: Math.round(window.__game.sim.time), rows: document.querySelectorAll('.stats tr').length }));
check('full match played to a result with a post-match stats screen', end.w >= 0 && end.rows >= 10, JSON.stringify(end));
check('match length within 8:00 + 2:00 sudden death', end.t <= 601, `ended at ${end.t}s`);
await p.close();

// ---------- 2. tutorial ----------
p = await newPage();
await p.goto(url + '?play=tutorial'); await p.waitForSelector('#tutorial'); await p.waitForTimeout(500);
await p.screenshot({ path: 'shots/13-tutorial.png' });
const tw = async (x, y) => G(p, ([x, y]) => window.__game.renderer.worldToScreen(x, y), [x, y]);
let hp = await G(p, () => { const h = window.__game.sim.heroes[0]; return { x: h.x, y: h.y }; });
s = await tw(hp.x - 200, hp.y - 60); await p.mouse.click(s.x, s.y, { button: 'right' });
await p.waitForFunction(() => document.querySelector('#tutorial h3').textContent.startsWith('2'), null, { timeout: 15000 });
const cr = await G(p, () => { const s = window.__game.sim; const c = s.units.find(u => u.team === 1 && u.kind === 'creep' && u.hp < 50); return { x: c.x, y: c.y - 8 }; });
s = await tw(cr.x, cr.y); await p.mouse.click(s.x, s.y, { button: 'right' });
await p.waitForFunction(() => document.querySelector('#tutorial h3').textContent.startsWith('3'), null, { timeout: 15000 });
await p.screenshot({ path: 'shots/14-tutorial-step3.png' });
await p.keyboard.press('q');
await p.waitForFunction(() => document.querySelector('#tutorial h3').textContent.startsWith('4'), null, { timeout: 15000 });
const cb = await p.locator('#hand .card').nth(0).boundingBox(); hp = await G(p, () => { const h = window.__game.sim.heroes[0]; return { x: h.x, y: h.y }; }); s = await tw(hp.x, hp.y - 60);
await p.mouse.move(cb.x + 30, cb.y + 40); await p.mouse.down(); await p.mouse.move(s.x, s.y, { steps: 8 }); await p.mouse.up();
await p.waitForFunction(() => document.querySelector('#tutorial h3').textContent.startsWith('5'), null, { timeout: 15000 });
await p.keyboard.press('b'); await p.waitForSelector('.shop'); await p.locator('.item', { hasText: 'Healing Salve' }).first().dispatchEvent('pointerdown');
await p.waitForFunction(() => document.querySelector('#tutorial h3').textContent.startsWith('Ready'), null, { timeout: 15000 });
check('interactive tutorial: all 5 steps complete with real input', true);
await p.close();

// ---------- 3. small and portrait windows ----------
for (const [w, h, name] of [[960, 540, '15-small-960x540'], [480, 860, '16-portrait-480x860'], [1920, 1080, '17-large-1920x1080']]) {
  p = await newPage(w, h); await p.goto(url + '?auto=1&speed=6&matches=1'); await p.waitForFunction(() => window.__game?.sim?.time > 40, null, { timeout: 90000 });
  await p.screenshot({ path: `shots/${name}.png` });
  const fit = await G(p, () => ['#heropanel', '#handwrap', '#minimap', '#top'].every(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; }));
  check(`HUD fits inside a ${w}x${h} window`, fit); await p.close();
}

// ---------- 4. consecutive full matches, zero console errors ----------
p = await newPage();
const wall0 = Date.now();
await p.goto(url + `?auto=1&speed=${SPEED}&matches=${MATCHES}`);
await p.waitForFunction(n => window.__game && window.__game.auto.matches >= n, MATCHES, { timeout: 30 * 60 * 1000, polling: 1000 });
const auto = await G(p, () => ({ results: window.__game.auto.results, maxUnits: window.__game.maxUnits }));
check(`${MATCHES} consecutive bot-vs-bot matches finished in the browser`, auto.results.length >= MATCHES, `${Math.round((Date.now() - wall0) / 1000)}s wall, peak ${auto.maxUnits} units; ` + auto.results.join(' | '));
await p.close();
check('zero console errors across the whole run', errors.length === 0, errors.slice(0, 3).join(' || '));
await browser.close();
fs.writeFileSync('shots/verify-report.txt', results.join('\n') + '\n');
console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
