/** Every sound is synthesized in code into a WAV buffer and played through Howler. No audio files. */
import { Howl, Howler } from 'howler';

const SR = 22050;
type Wave = 'sine' | 'square' | 'saw' | 'tri' | 'noise';
interface Layer { wave: Wave; f0: number; f1?: number; dur: number; vol?: number; attack?: number; delay?: number; lp?: number; vib?: number }

function render(layers: Layer[], total?: number): Float32Array {
  const len = Math.ceil((total ?? Math.max(...layers.map(l => (l.delay ?? 0) + l.dur))) * SR);
  const out = new Float32Array(len);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) | 0; return (seed >>> 8) / 8388608 - 1; };
  for (const l of layers) {
    const n = Math.floor(l.dur * SR), off = Math.floor((l.delay ?? 0) * SR), atk = Math.max(1, Math.floor((l.attack ?? 0.005) * SR));
    let ph = 0, lpv = 0; const a = l.lp ? Math.min(1, (2 * Math.PI * l.lp) / SR) : 1;
    for (let i = 0; i < n && off + i < len; i++) {
      const t = i / n; const f = l.f0 * Math.pow((l.f1 ?? l.f0) / l.f0, t) * (l.vib ? 1 + Math.sin(i / SR * 40) * l.vib : 1);
      ph += f / SR; const p = ph % 1;
      let s = l.wave === 'sine' ? Math.sin(p * 6.2832) : l.wave === 'square' ? (p < 0.5 ? 1 : -1) : l.wave === 'saw' ? p * 2 - 1 : l.wave === 'tri' ? Math.abs(p * 4 - 2) - 1 : rnd();
      lpv += (s - lpv) * a; s = lpv;
      const env = Math.min(1, i / atk) * Math.pow(1 - t, 2);
      out[off + i] += s * env * (l.vol ?? 0.5);
    }
  }
  return out;
}

function wavUri(data: Float32Array): string {
  const buf = new ArrayBuffer(44 + data.length * 2); const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + data.length * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 32000, true);
  const bytes = new Uint8Array(buf); let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return 'data:audio/wav;base64,' + btoa(bin);
}

const DEFS: Record<string, Layer[]> = {
  click: [{ wave: 'square', f0: 900, f1: 600, dur: 0.05, vol: 0.25, lp: 3000 }],
  error: [{ wave: 'square', f0: 180, f1: 120, dur: 0.16, vol: 0.3, lp: 1200 }],
  hit: [{ wave: 'noise', f0: 1, dur: 0.07, vol: 0.35, lp: 1800 }, { wave: 'sine', f0: 220, f1: 90, dur: 0.07, vol: 0.4 }],
  heroHit: [{ wave: 'noise', f0: 1, dur: 0.1, vol: 0.45, lp: 2600 }, { wave: 'tri', f0: 320, f1: 110, dur: 0.11, vol: 0.5 }],
  shot: [{ wave: 'noise', f0: 1, dur: 0.05, vol: 0.2, lp: 5000 }, { wave: 'saw', f0: 900, f1: 300, dur: 0.07, vol: 0.14, lp: 3000 }],
  towerShot: [{ wave: 'square', f0: 520, f1: 160, dur: 0.16, vol: 0.22, lp: 2200 }, { wave: 'noise', f0: 1, dur: 0.08, vol: 0.18, lp: 3000 }],
  lasthit: [{ wave: 'sine', f0: 1320, dur: 0.09, vol: 0.4 }, { wave: 'sine', f0: 1980, dur: 0.22, vol: 0.4, delay: 0.07 }],
  deny: [{ wave: 'tri', f0: 520, f1: 260, dur: 0.18, vol: 0.4 }, { wave: 'tri', f0: 390, f1: 200, dur: 0.2, vol: 0.3, delay: 0.08 }],
  deploy: [{ wave: 'sine', f0: 160, f1: 60, dur: 0.22, vol: 0.7 }, { wave: 'noise', f0: 1, dur: 0.18, vol: 0.3, lp: 900 }, { wave: 'tri', f0: 600, f1: 900, dur: 0.1, vol: 0.2 }],
  cardPick: [{ wave: 'tri', f0: 500, f1: 760, dur: 0.07, vol: 0.3 }],
  boom: [{ wave: 'noise', f0: 1, dur: 0.5, vol: 0.7, lp: 700 }, { wave: 'sine', f0: 120, f1: 35, dur: 0.5, vol: 0.8 }],
  zap: [{ wave: 'saw', f0: 1800, f1: 200, dur: 0.16, vol: 0.3, lp: 4000 }, { wave: 'noise', f0: 1, dur: 0.1, vol: 0.25, lp: 6000 }],
  frost: [{ wave: 'sine', f0: 2200, f1: 800, dur: 0.4, vol: 0.25, vib: 0.03 }, { wave: 'noise', f0: 1, dur: 0.3, vol: 0.2, lp: 7000 }],
  heal: [{ wave: 'sine', f0: 520, f1: 780, dur: 0.3, vol: 0.3 }, { wave: 'sine', f0: 780, f1: 1040, dur: 0.35, vol: 0.25, delay: 0.12 }],
  shield: [{ wave: 'tri', f0: 300, f1: 600, dur: 0.25, vol: 0.35 }, { wave: 'sine', f0: 1200, dur: 0.3, vol: 0.15, delay: 0.05 }],
  buff: [{ wave: 'saw', f0: 220, f1: 440, dur: 0.3, vol: 0.25, lp: 1800 }, { wave: 'saw', f0: 330, f1: 660, dur: 0.3, vol: 0.2, lp: 1800, delay: 0.06 }],
  cast: [{ wave: 'tri', f0: 400, f1: 1000, dur: 0.16, vol: 0.3 }, { wave: 'noise', f0: 1, dur: 0.14, vol: 0.14, lp: 5000 }],
  blink: [{ wave: 'sine', f0: 1400, f1: 300, dur: 0.14, vol: 0.3 }, { wave: 'noise', f0: 1, dur: 0.1, vol: 0.2, lp: 8000 }],
  summon: [{ wave: 'tri', f0: 140, f1: 420, dur: 0.35, vol: 0.4 }, { wave: 'noise', f0: 1, dur: 0.3, vol: 0.2, lp: 1500 }],
  levelup: [{ wave: 'tri', f0: 523, dur: 0.14, vol: 0.35 }, { wave: 'tri', f0: 659, dur: 0.14, vol: 0.35, delay: 0.1 }, { wave: 'tri', f0: 784, dur: 0.14, vol: 0.35, delay: 0.2 }, { wave: 'tri', f0: 1046, dur: 0.4, vol: 0.4, delay: 0.3 }],
  death: [{ wave: 'noise', f0: 1, dur: 0.12, vol: 0.2, lp: 1400 }, { wave: 'sine', f0: 300, f1: 80, dur: 0.14, vol: 0.25 }],
  heroDeath: [{ wave: 'saw', f0: 400, f1: 60, dur: 0.8, vol: 0.4, lp: 1500 }, { wave: 'noise', f0: 1, dur: 0.5, vol: 0.3, lp: 900 }],
  kill: [{ wave: 'square', f0: 392, dur: 0.12, vol: 0.25, lp: 2500 }, { wave: 'square', f0: 587, dur: 0.12, vol: 0.25, lp: 2500, delay: 0.1 }, { wave: 'square', f0: 784, dur: 0.4, vol: 0.3, lp: 2500, delay: 0.2 }],
  towerFall: [{ wave: 'noise', f0: 1, dur: 1.1, vol: 0.8, lp: 500 }, { wave: 'sine', f0: 90, f1: 28, dur: 1.0, vol: 0.9 }, { wave: 'noise', f0: 1, dur: 0.3, vol: 0.4, lp: 3000, delay: 0.15 }, { wave: 'noise', f0: 1, dur: 0.3, vol: 0.3, lp: 2500, delay: 0.45 }],
  essenceRate: [{ wave: 'saw', f0: 200, f1: 1600, dur: 0.6, vol: 0.3, lp: 3000 }, { wave: 'sine', f0: 1600, dur: 0.5, vol: 0.4, delay: 0.55 }, { wave: 'sine', f0: 2400, dur: 0.6, vol: 0.3, delay: 0.62 }],
  rune: [{ wave: 'sine', f0: 880, dur: 0.12, vol: 0.3 }, { wave: 'sine', f0: 1320, dur: 0.12, vol: 0.3, delay: 0.08 }, { wave: 'sine', f0: 1760, dur: 0.3, vol: 0.3, delay: 0.16 }],
  runeSpawn: [{ wave: 'sine', f0: 1760, f1: 1320, dur: 0.5, vol: 0.2, vib: 0.02 }],
  boss: [{ wave: 'saw', f0: 110, f1: 50, dur: 1.2, vol: 0.6, lp: 600, vib: 0.08 }, { wave: 'noise', f0: 1, dur: 1.0, vol: 0.3, lp: 400 }],
  buy: [{ wave: 'sine', f0: 1568, dur: 0.08, vol: 0.3 }, { wave: 'sine', f0: 2093, dur: 0.08, vol: 0.3, delay: 0.06 }, { wave: 'noise', f0: 1, dur: 0.06, vol: 0.12, lp: 7000, delay: 0.02 }],
  wave: [{ wave: 'saw', f0: 196, dur: 0.5, vol: 0.2, lp: 900, attack: 0.05 }, { wave: 'saw', f0: 294, dur: 0.6, vol: 0.2, lp: 900, attack: 0.05, delay: 0.25 }],
  sudden: [{ wave: 'saw', f0: 110, dur: 0.5, vol: 0.4, lp: 1200 }, { wave: 'saw', f0: 104, dur: 0.5, vol: 0.4, lp: 1200, delay: 0.5 }, { wave: 'saw', f0: 98, dur: 1.2, vol: 0.5, lp: 1200, delay: 1.0 }],
  win: [{ wave: 'tri', f0: 523, dur: 0.2, vol: 0.4 }, { wave: 'tri', f0: 659, dur: 0.2, vol: 0.4, delay: 0.16 }, { wave: 'tri', f0: 784, dur: 0.2, vol: 0.4, delay: 0.32 }, { wave: 'tri', f0: 1046, dur: 0.9, vol: 0.5, delay: 0.48 }, { wave: 'tri', f0: 784, dur: 0.9, vol: 0.3, delay: 0.48 }],
  lose: [{ wave: 'tri', f0: 392, dur: 0.3, vol: 0.4 }, { wave: 'tri', f0: 330, dur: 0.3, vol: 0.4, delay: 0.25 }, { wave: 'tri', f0: 262, dur: 1.0, vol: 0.45, delay: 0.5 }],
  respawn: [{ wave: 'sine', f0: 300, f1: 900, dur: 0.4, vol: 0.3 }, { wave: 'sine', f0: 900, dur: 0.3, vol: 0.2, delay: 0.35 }],
};

/** A quiet 8-bar loop: bass pulse plus a pentatonic pluck line, generated note by note. */
function musicLoop(): Float32Array {
  const beat = 0.3, bars = 8, layers: Layer[] = [];
  const bass = [110, 110, 146.8, 98, 110, 110, 130.8, 98];
  const mel = [440, 0, 523, 587, 0, 659, 587, 0, 440, 0, 392, 440, 0, 523, 0, 392];
  for (let b = 0; b < bars; b++) {
    for (let i = 0; i < 4; i++) layers.push({ wave: 'tri', f0: bass[b], dur: beat * 0.9, vol: i === 0 ? 0.3 : 0.16, delay: (b * 4 + i) * beat, lp: 700 });
    for (let i = 0; i < 4; i++) { const f = mel[(b * 4 + i * 3 + b) % mel.length]; if (f) layers.push({ wave: 'sine', f0: f, dur: beat * 1.6, vol: 0.1, delay: (b * 4 + i + 0.5) * beat }); }
    layers.push({ wave: 'noise', f0: 1, dur: 0.05, vol: 0.06, delay: (b * 4 + 2) * beat, lp: 6000 });
  }
  return render(layers, bars * 4 * beat);
}

class AudioSys {
  private howls = new Map<string, Howl>(); private last = new Map<string, number>();
  private music: Howl | null = null; ready = false;
  sfxVol = 0.7; musicVol = 0.35; muted = false;
  init() {
    if (this.ready) return; this.ready = true;
    try {
      for (const [k, layers] of Object.entries(DEFS)) this.howls.set(k, new Howl({ src: [wavUri(render(layers))], format: ['wav'] }));
      this.music = new Howl({ src: [wavUri(musicLoop())], format: ['wav'], loop: true, volume: this.musicVol });
    } catch { /* audio is optional */ }
  }
  /** Rate-limited play. `pan` in -1..1, `vol` 0..1. */
  play(name: string, vol = 1, minGap = 0.04, rate = 1) {
    if (this.muted || !this.ready) return;
    const now = performance.now() / 1000; if (now - (this.last.get(name) ?? -9) < minGap) return; this.last.set(name, now);
    const h = this.howls.get(name); if (!h) return;
    try { const id = h.play(); h.volume(vol * this.sfxVol, id); if (rate !== 1) h.rate(rate, id); } catch { /* ignore */ }
  }
  startMusic() { try { if (this.music && !this.music.playing()) this.music.play(); } catch { /* ignore */ } }
  stopMusic() { try { this.music?.stop(); } catch { /* ignore */ } }
  setMuted(m: boolean) { this.muted = m; try { Howler.mute(m); } catch { /* ignore */ } }
  setVolumes(sfx: number, music: number) { this.sfxVol = sfx; this.musicVol = music; try { this.music?.volume(music); } catch { /* ignore */ } }
}
export const audio = new AudioSys();
