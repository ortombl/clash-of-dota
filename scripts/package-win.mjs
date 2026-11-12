// Builds release/FrostemberDuel-win32-x64.zip: a folder with "Frostember Duel.exe" and its runtime files.
// Works on Linux/macOS/Windows without Wine (no icon or resource editing is done on the exe).
import { packager } from '@electron/packager';
import { ZipArchive } from 'archiver';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (!fs.existsSync('dist/index.html')) { console.error('dist/ is missing: run "npm run build" first.'); process.exit(1); }

// stage a minimal app (no node_modules: the game is fully bundled into dist/)
const stage = path.join(root, 'build', 'app');
fs.rmSync(path.join(root, 'build'), { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
fs.cpSync('dist', path.join(stage, 'dist'), { recursive: true });
fs.cpSync('electron', path.join(stage, 'electron'), { recursive: true });
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ name: pkg.name, productName: pkg.productName, version: pkg.version, description: pkg.description, author: pkg.author, license: pkg.license, main: 'electron/main.cjs' }, null, 2));

const electronVersion = JSON.parse(fs.readFileSync('node_modules/electron/package.json', 'utf8')).version;
const out = path.join(root, 'release');
fs.rmSync(path.join(out, 'Frostember Duel-win32-x64'), { recursive: true, force: true });
console.log(`Packaging with Electron ${electronVersion} for win32-x64 ...`);
let dirs;
try {
  dirs = await packager({ dir: stage, out, name: pkg.productName, platform: 'win32', arch: 'x64', electronVersion, overwrite: true, asar: true, prune: false, quiet: false });
} catch (err) {
  console.error('\nPackaging failed. If the Electron Windows download was blocked, see README.md ("Building on Windows").\n', err);
  process.exit(1);
}
const dir = dirs[0];
fs.writeFileSync(path.join(dir, 'HOW TO PLAY.txt'), `Frostember Duel ${pkg.version}\r\n\r\nDouble-click "Frostember Duel.exe" to play. Keep the exe in this folder with its other files.\r\nWindows may show a SmartScreen notice because the exe is not code-signed: choose "More info" then "Run anyway".\r\n\r\nRight-click: move / attack    Q W E R: abilities    Drag cards onto your half\r\nB: shop (at your fountain)    S: stop    Space: centre camera    Esc: pause    F11: fullscreen\r\n`);
const zipPath = path.join(out, 'FrostemberDuel-win32-x64.zip');
fs.rmSync(zipPath, { force: true });
await new Promise((resolve, reject) => {
  const output = fs.createWriteStream(zipPath); const zip = new ZipArchive({ zlib: { level: 9 } });
  output.on('close', resolve); zip.on('error', reject); zip.pipe(output);
  zip.directory(dir, 'Frostember Duel'); zip.finalize();
});
console.log(`\nDone: ${path.relative(root, zipPath)} (${(fs.statSync(zipPath).size / 1048576).toFixed(1)} MB)`);
