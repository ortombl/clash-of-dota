import type { UnitDef } from '../sim/types';

const U = (d: UnitDef) => d;
/** All non-hero unit stats. `val` is an essence-value hint for the bot. */
export const UNITS: Record<string, UnitDef> = Object.fromEntries([
  // --- structures ---
  U({ id: 't1', name: 'Outer Spire', kind: 'tower', hp: 1500, dmg: 62, atkInt: 0.9, range: 310, speed: 0, r: 34, armor: 6, projSpeed: 620, gold: 0, xp: 120, art: 'tower' }),
  U({ id: 't2', name: 'Inner Spire', kind: 'tower', hp: 1900, dmg: 78, atkInt: 0.9, range: 320, speed: 0, r: 36, armor: 8, projSpeed: 620, gold: 0, xp: 160, art: 'tower2' }),
  U({ id: 'barracks', name: 'Barracks', kind: 'barracks', hp: 1300, dmg: 0, atkInt: 1, range: 0, speed: 0, r: 38, armor: 6, gold: 0, xp: 120, art: 'barracks' }),
  U({ id: 'ancient', name: 'Ancient', kind: 'ancient', hp: 3200, dmg: 95, atkInt: 0.85, range: 340, speed: 0, r: 56, armor: 8, projSpeed: 640, gold: 0, xp: 0, art: 'ancient' }),
  // --- lane creeps ---
  U({ id: 'creepMelee', name: 'Footling', kind: 'creep', hp: 300, dmg: 15, atkInt: 1.0, range: 22, speed: 96, r: 13, armor: 1, gold: 22, xp: 30, art: 'creepM', val: 0.6 }),
  U({ id: 'creepRanged', name: 'Dartling', kind: 'creep', hp: 180, dmg: 22, atkInt: 1.15, range: 250, speed: 96, r: 12, projSpeed: 520, gold: 28, xp: 36, art: 'creepR', val: 0.6 }),
  // --- card troops ---
  U({ id: 'pikeling', name: 'Pikeling', kind: 'troop', hp: 150, dmg: 17, atkInt: 0.9, range: 26, speed: 112, r: 11, gold: 6, xp: 10, art: 'pike', val: 0.67 }),
  U({ id: 'slinger', name: 'Slinger', kind: 'troop', hp: 105, dmg: 19, atkInt: 1.0, range: 250, speed: 100, r: 11, projSpeed: 540, gold: 8, xp: 12, art: 'sling', val: 1 }),
  U({ id: 'shieldbearer', name: 'Shieldbearer', kind: 'troop', hp: 540, dmg: 22, atkInt: 1.2, range: 24, speed: 88, r: 15, armor: 4, gold: 12, xp: 20, art: 'shield', val: 1.5 }),
  U({ id: 'rat', name: 'Gutter Rat', kind: 'troop', hp: 62, dmg: 10, atkInt: 0.7, range: 18, speed: 138, r: 8, gold: 4, xp: 6, art: 'rat', val: 0.5 }),
  U({ id: 'hound', name: 'Cinderhound', kind: 'troop', hp: 250, dmg: 30, atkInt: 0.8, range: 22, speed: 165, r: 13, gold: 12, xp: 18, art: 'hound', val: 1.5 }),
  U({ id: 'bombardier', name: 'Bombardier', kind: 'troop', hp: 175, dmg: 34, atkInt: 1.5, range: 265, speed: 92, r: 13, splash: 72, projSpeed: 420, gold: 16, xp: 22, art: 'bomb', val: 2 }),
  U({ id: 'lancer', name: 'Boar Lancer', kind: 'troop', hp: 390, dmg: 44, atkInt: 1.2, range: 30, speed: 152, r: 16, structMult: 1.4, gold: 16, xp: 24, art: 'lancer', val: 2 }),
  U({ id: 'wisp', name: 'Rime Wisp', kind: 'troop', hp: 115, dmg: 15, atkInt: 1.1, range: 240, speed: 104, r: 10, projSpeed: 480, slowOnHit: { pct: 0.3, dur: 1.5 }, gold: 10, xp: 14, art: 'wisp', val: 1.33 }),
  // --- champions ---
  U({ id: 'golem', name: 'Ironclad Golem', kind: 'troop', hp: 1550, dmg: 72, atkInt: 1.6, range: 30, speed: 70, r: 24, armor: 3, structOnly: true, gold: 40, xp: 60, art: 'golem', val: 5 }),
  U({ id: 'duelist', name: 'Duelist', kind: 'troop', hp: 640, dmg: 74, atkInt: 0.8, range: 26, speed: 122, r: 15, armor: 2, gold: 32, xp: 48, art: 'duelist', val: 4 }),
  U({ id: 'hexer', name: 'Hexer', kind: 'troop', hp: 340, dmg: 40, atkInt: 1.4, range: 280, speed: 94, r: 14, splash: 82, projSpeed: 440, gold: 32, xp: 48, art: 'hexer', val: 4 }),
  U({ id: 'ram', name: 'Siege Ram', kind: 'troop', hp: 720, dmg: 112, atkInt: 1.4, range: 28, speed: 142, r: 19, structOnly: true, gold: 32, xp: 48, art: 'ram', val: 4 }),
  U({ id: 'colossus', name: 'Stone Colossus', kind: 'troop', hp: 2350, dmg: 96, atkInt: 1.7, range: 34, speed: 66, r: 28, armor: 4, splash: 62, gold: 50, xp: 80, art: 'colossus', val: 6 }),
  U({ id: 'sharpshooter', name: 'Sharpshooter', kind: 'troop', hp: 290, dmg: 72, atkInt: 1.5, range: 390, speed: 92, r: 13, projSpeed: 800, gold: 32, xp: 48, art: 'sharp', val: 4 }),
  U({ id: 'medic', name: 'Field Medic', kind: 'troop', hp: 320, dmg: 9, atkInt: 1.2, range: 200, speed: 100, r: 13, projSpeed: 480, healAura: { hps: 20, radius: 190 }, gold: 24, xp: 36, art: 'medic', val: 3 }),
  // --- card buildings ---
  U({ id: 'turret', name: 'Bolt Turret', kind: 'building', hp: 720, dmg: 40, atkInt: 0.8, range: 300, speed: 0, r: 22, armor: 2, projSpeed: 640, gold: 30, xp: 40, art: 'turret', val: 4 }),
  U({ id: 'warcamp', name: 'War Camp', kind: 'building', hp: 620, dmg: 0, atkInt: 1, range: 0, speed: 0, r: 26, armor: 2, spawner: { unit: 'pikeling', interval: 4.5 }, gold: 36, xp: 50, art: 'camp', val: 5 }),
  U({ id: 'wall', name: 'Palisade', kind: 'building', hp: 600, dmg: 0, atkInt: 1, range: 0, speed: 0, r: 20, armor: 4, gold: 6, xp: 8, art: 'wall', val: 0.67 }),
  U({ id: 'mortar', name: 'Mortar Nest', kind: 'building', hp: 560, dmg: 62, atkInt: 3.0, range: 520, minRange: 150, speed: 0, r: 22, splash: 92, projSpeed: 300, gold: 30, xp: 40, art: 'mortar', val: 4 }),
  U({ id: 'totem', name: 'Tar Totem', kind: 'building', hp: 520, dmg: 0, atkInt: 1, range: 0, speed: 0, r: 18, armor: 2, slowAura: { pct: 0.35, radius: 220 }, gold: 22, xp: 30, art: 'totem', val: 3 }),
  // --- hero summons ---
  U({ id: 'sapling', name: 'Sapling', kind: 'troop', hp: 260, dmg: 20, atkInt: 1.0, range: 24, speed: 118, r: 12, gold: 8, xp: 10, art: 'sapling', val: 0.8 }),
  U({ id: 'elder', name: 'Grove Elder', kind: 'troop', hp: 1100, dmg: 60, atkInt: 1.3, range: 30, speed: 100, r: 22, armor: 3, splash: 50, gold: 30, xp: 40, art: 'elder', val: 4 }),
  // --- neutrals ---
  U({ id: 'nImp', name: 'Moss Imp', kind: 'neutral', hp: 260, dmg: 16, atkInt: 1.0, range: 24, speed: 120, r: 12, gold: 18, xp: 28, art: 'imp' }),
  U({ id: 'nBrute', name: 'Bog Brute', kind: 'neutral', hp: 620, dmg: 34, atkInt: 1.3, range: 28, speed: 115, r: 18, armor: 2, gold: 44, xp: 60, art: 'brute' }),
  U({ id: 'nSeer', name: 'Marsh Seer', kind: 'neutral', hp: 320, dmg: 24, atkInt: 1.3, range: 230, speed: 110, r: 13, projSpeed: 460, gold: 30, xp: 42, art: 'seer' }),
  U({ id: 'boss', name: 'Old Maw', kind: 'boss', hp: 2600, dmg: 85, atkInt: 1.3, range: 60, speed: 110, r: 40, armor: 6, splash: 90, gold: 0, xp: 0, art: 'boss' }),
].map(u => [u.id, u]));
