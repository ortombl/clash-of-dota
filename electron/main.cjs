// Electron main process for Frostember Duel. Loads the bundled web build from disk; no network access is needed.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
function loadState() {
  try { const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8')); if (s && s.width >= 960 && s.height >= 540) return s; } catch { /* first run */ }
  return { width: 1280, height: 720 };
}
function saveState(win) {
  try { if (win.isFullScreen() || win.isMinimized()) return; const b = win.getNormalBounds(); fs.writeFileSync(stateFile(), JSON.stringify({ width: b.width, height: b.height, maximized: win.isMaximized() })); } catch { /* not fatal */ }
}

function createWindow() {
  const st = loadState();
  const win = new BrowserWindow({
    width: st.width, height: st.height, minWidth: 960, minHeight: 540, useContentSize: true,
    title: 'Frostember Duel', backgroundColor: '#241a1c', autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  Menu.setApplicationMenu(null);           // no default menu bar
  win.removeMenu();
  if (st.maximized) win.maximize();
  const index = path.join(__dirname, '..', 'dist', 'index.html');
  win.loadFile(index, process.env.FROSTEMBER_QUERY ? { search: process.env.FROSTEMBER_QUERY } : undefined);
  win.once('ready-to-show', () => win.show());
  win.on('page-title-updated', e => e.preventDefault());
  win.on('close', () => saveState(win));

  // Block every navigation away from the bundled game and every new window.
  const wc = win.webContents;
  const isLocal = url => url.startsWith('file://');
  wc.on('will-navigate', (e, url) => { if (!isLocal(url)) e.preventDefault(); });
  wc.on('will-redirect', (e, url) => { if (!isLocal(url)) e.preventDefault(); });
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  void shell;

  // F11 toggles fullscreen; Alt+Enter too. Handled here so it works even when the page is busy.
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.key === 'Enter' && input.alt)) { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  if (process.env.FROSTEMBER_SMOKE) { // automated smoke test: report what loaded, then quit
    const errors = [];
    wc.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message); });
    wc.on('did-fail-load', (_e, code, desc) => errors.push(`did-fail-load ${code} ${desc}`));
    setTimeout(async () => {
      let info = {};
      try { info = await wc.executeJavaScript(`({ title: document.title, hasGame: !!window.__game, time: window.__game && window.__game.sim ? window.__game.sim.time : -1, canvas: !!document.querySelector('#stage'), menu: !!document.querySelector('.title') })`); } catch (err) { errors.push(String(err)); }
      const b = win.getContentBounds();
      console.log('SMOKE ' + JSON.stringify({ ...info, width: b.width, height: b.height, minSize: win.getMinimumSize(), menuBar: win.isMenuBarVisible(), errors }));
      app.quit();
    }, +process.env.FROSTEMBER_SMOKE || 8000);
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
