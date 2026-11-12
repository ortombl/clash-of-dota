import type { ItemDef } from '../sim/types';

/** Shop: 3 consumables, 6 components (tier 1), 5 mid items (tier 2), 5 finished items (tier 3). `cost` is the full price; owned components are credited. */
export const ITEM_LIST: ItemDef[] = [
  { id: 'salve', name: 'Healing Salve', tier: 0, cost: 60, use: { heal: 320, dur: 8 }, desc: 'Use: restore 320 health over 8s.', icon: 'potion', color: '#5fd068' },
  { id: 'draught', name: 'Mana Draught', tier: 0, cost: 50, use: { mana: 200, dur: 8 }, desc: 'Use: restore 200 mana over 8s.', icon: 'potion', color: '#5aa8ff' },
  { id: 'recall', name: 'Recall Stone', tier: 0, cost: 70, use: { recall: true, dur: 2.5 }, desc: 'Use: return to the fountain after 2.5s.', icon: 'star', color: '#e8d27a' },

  { id: 'ironband', name: 'Iron Band', tier: 1, cost: 180, stats: { str: 6 }, desc: '+6 Strength', icon: 'ring', color: '#e0564a' },
  { id: 'fleetwraps', name: 'Fleet Wraps', tier: 1, cost: 180, stats: { agi: 6 }, desc: '+6 Agility', icon: 'ring', color: '#59c96b' },
  { id: 'sagebead', name: 'Sage Bead', tier: 1, cost: 180, stats: { int: 6 }, desc: '+6 Intelligence', icon: 'ring', color: '#56a4f0' },
  { id: 'whetstone', name: 'Whetstone', tier: 1, cost: 220, stats: { dmg: 10 }, desc: '+10 Damage', icon: 'sword', color: '#c9ccd6' },
  { id: 'hidevest', name: 'Hide Vest', tier: 1, cost: 200, stats: { armor: 3 }, desc: '+3 Armor', icon: 'shield', color: '#b98a5a' },
  { id: 'boots', name: 'Runner Boots', tier: 1, cost: 240, stats: { ms: 30 }, desc: '+30 Move Speed', icon: 'boot', color: '#d9a15a' },

  { id: 'girdle', name: 'Brawler Girdle', tier: 2, cost: 480, from: ['ironband'], stats: { str: 14, hp: 150 }, desc: '+14 Strength, +150 Health', icon: 'ring', color: '#ff7b6b' },
  { id: 'fang', name: 'Hunter Fang', tier: 2, cost: 600, from: ['fleetwraps', 'whetstone'], stats: { agi: 10, dmg: 18 }, desc: '+10 Agility, +18 Damage', icon: 'sword', color: '#7be08c' },
  { id: 'orb', name: 'Scholar Orb', tier: 2, cost: 480, from: ['sagebead'], stats: { int: 14, manaRegen: 2 }, desc: '+14 Intelligence, +2 mana regen', icon: 'orb', color: '#7cc0ff' },
  { id: 'greaves', name: 'Stride Greaves', tier: 2, cost: 590, from: ['boots', 'hidevest'], stats: { ms: 50, armor: 5 }, desc: '+50 Move Speed, +5 Armor', icon: 'boot', color: '#ffc27a' },
  { id: 'leech', name: 'Leech Blade', tier: 2, cost: 570, from: ['whetstone'], stats: { dmg: 15, lifesteal: 0.15 }, desc: '+15 Damage, 15% lifesteal', icon: 'sword', color: '#e05a8a' },

  { id: 'titanheart', name: 'Titan Heart', tier: 3, cost: 1130, from: ['girdle'], stats: { str: 25, hp: 400, hpRegen: 8 }, desc: '+25 Strength, +400 Health, +8 health regen', icon: 'heart', color: '#ff5a4a' },
  { id: 'stormpiercer', name: 'Stormpiercer', tier: 3, cost: 1300, from: ['fang'], stats: { agi: 20, dmg: 40, as: 0.25 }, desc: '+20 Agility, +40 Damage, +25% attack speed', icon: 'bolt', color: '#9af0a8' },
  { id: 'archonstaff', name: 'Archon Staff', tier: 3, cost: 1180, from: ['orb'], stats: { int: 28, spell: 0.25, manaRegen: 3 }, desc: '+28 Intelligence, +25% spell power', icon: 'staff', color: '#9ad0ff' },
  { id: 'bloodreaver', name: 'Bloodreaver', tier: 3, cost: 1270, from: ['leech'], stats: { dmg: 45, lifesteal: 0.25 }, desc: '+45 Damage, 25% lifesteal', icon: 'sword', color: '#ff4a6a' },
  { id: 'bastion', name: 'Bastion Plate', tier: 3, cost: 1000, from: ['hidevest'], stats: { armor: 12, hp: 250 }, desc: '+12 Armor, +250 Health', icon: 'shield', color: '#d6c08a' },
];
export const ITEMS: Record<string, ItemDef> = Object.fromEntries(ITEM_LIST.map(i => [i.id, i]));
