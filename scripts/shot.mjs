// Dev helper: load the built game from file:// (same as Electron) and take screenshots.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import path from 'node:path';
const url = 'file://' + path.resolve('dist/index.html');
const [, , query = '', out = 'shots/shot.png', wait = '3000', w = '1280', h = '720', script = ''] = process.argv;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errs = [];
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); else if (/AUTO_|WARN/.test(m.text())) console.log(m.text()); });
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
await p.goto(url + (query ? '?' + query : ''));
await p.waitForTimeout(+wait);
if (script) { const r = await p.evaluate(script); if (r !== undefined) console.log('eval:', JSON.stringify(r)); await p.waitForTimeout(700); }
await p.screenshot({ path: out });
console.log('errors:', errs.length, errs.slice(0, 5));
await b.close();
