import 'pixi.js/unsafe-eval'; // lets PixiJS run under the strict no-eval Content-Security-Policy
import '@fontsource/lilita-one/400.css';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import './ui/styles.css';
import { Game } from './game';

const game = new Game();
game.boot().catch(err => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:0;margin:0;padding:24px;background:#241a1c;color:#ffd24a;font:14px monospace;white-space:pre-wrap">Frostember Duel failed to start.\n${String(err && err.stack || err)}</pre>`);
});
