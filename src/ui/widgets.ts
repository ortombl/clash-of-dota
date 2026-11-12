import { CARDS } from '../data/cards';
import { UNITS } from '../data/units';
import { icon, portrait } from '../render/art';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }

const SPELL_ICON: Record<string, [string, string]> = { firebomb: ['flame', '#ff7a2f'], spark: ['bolt', '#ffe04a'], frostsnap: ['snow', '#8fd4ff'], mendingrain: ['rain', '#5fd068'], bulwark: ['shield', '#7cc0ff'], rallyhorn: ['horn', '#ffb347'] };

export function cardArt(id: string, size = 128): HTMLCanvasElement {
  const c = CARDS[id];
  if (c.type === 'spell') { const [g, col] = SPELL_ICON[id] ?? ['star', '#fff']; const cv = document.createElement('canvas'); cv.width = cv.height = size; const x = cv.getContext('2d')!; const ic = icon(g, col, 96); x.drawImage(ic, size * 0.14, size * 0.14, size * 0.72, size * 0.72); return cv; }
  return portrait(UNITS[c.unit!].art, 0, size, c.count ?? 1);
}

export function cardEl(id: string, key = ''): HTMLDivElement {
  const c = CARDS[id]; const d = el('div', `card ${c.type}`);
  d.dataset.card = id;
  d.append(cardArt(id), el('div', 'wait'), el('div', 'cost', String(c.cost)), el('div', 'nm', c.name), el('div', 'ty', c.type === 'troop' ? `squad x${c.count}` : c.type));
  if (key) d.append(el('div', 'key', key));
  return d;
}

export function cardTip(id: string): string {
  const c = CARDS[id]; let meta = `${c.cost} essence`;
  if (c.unit) { const u = UNITS[c.unit]; meta += ` · ${Math.round(u.hp)} hp` + (u.dmg ? ` · ${Math.round(u.dmg / u.atkInt)} dps` : '') + (u.range > 60 ? ' · ranged' : ''); }
  return `<h4>${c.name}</h4>${c.desc}<div class="meta">${meta}</div>`;
}

let tipEl: HTMLDivElement | null = null;
export function hideTip() { if (tipEl) tipEl.classList.add('hidden'); }
/** Hover tooltip. `html` is evaluated lazily so it can show live numbers. */
export function tip(target: HTMLElement, html: () => string) {
  target.addEventListener('pointerenter', ev => {
    if (ev.pointerType === 'touch') return;
    if (!tipEl) { tipEl = el('div'); tipEl.id = 'tip'; document.body.append(tipEl); }
    tipEl.innerHTML = html(); tipEl.classList.remove('hidden');
    const r = target.getBoundingClientRect(), t = tipEl.getBoundingClientRect();
    let x = r.left + r.width / 2 - t.width / 2, y = r.top - t.height - 10;
    if (y < 6) y = r.bottom + 10; x = Math.max(6, Math.min(window.innerWidth - t.width - 6, x));
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  });
  target.addEventListener('pointerleave', hideTip); target.addEventListener('pointerdown', hideTip);
}
export const fmtTime = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
