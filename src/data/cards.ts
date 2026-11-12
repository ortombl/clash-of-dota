import type { CardDef } from '../sim/types';

/** Card pool (26). Adding a card = adding a row here (and a unit row in units.ts if it deploys a new unit). */
export const CARD_LIST: CardDef[] = [
  // troop squads
  { id: 'pikelings', name: 'Pikelings', cost: 2, type: 'troop', unit: 'pikeling', count: 3, role: 'swarm', desc: 'Three cheap spear grunts. Good bait, good filler.' },
  { id: 'slingers', name: 'Slingers', cost: 3, type: 'troop', unit: 'slinger', count: 3, role: 'dps', desc: 'Three fragile ranged skirmishers.' },
  { id: 'shieldbearers', name: 'Shieldbearers', cost: 3, type: 'troop', unit: 'shieldbearer', count: 2, role: 'tank', desc: 'Two armored front-liners that soak tower shots.' },
  { id: 'rats', name: 'Rat Swarm', cost: 3, type: 'troop', unit: 'rat', count: 6, role: 'swarm', desc: 'Six fast biters. Shreds single targets, melts to splash.' },
  { id: 'hounds', name: 'Cinderhounds', cost: 3, type: 'troop', unit: 'hound', count: 2, role: 'dps', desc: 'Two fast hounds that run down ranged units.' },
  { id: 'bombardiers', name: 'Bombardiers', cost: 4, type: 'troop', unit: 'bombardier', count: 2, role: 'splash', desc: 'Two lobbers with splash damage. Answers swarms.' },
  { id: 'lancers', name: 'Boar Lancers', cost: 4, type: 'troop', unit: 'lancer', count: 2, role: 'siege', desc: 'Two fast riders with bonus damage to structures.' },
  { id: 'wisps', name: 'Rime Wisps', cost: 4, type: 'troop', unit: 'wisp', count: 3, role: 'support', desc: 'Three ranged wisps whose shots slow.' },
  // champions
  { id: 'golem', name: 'Ironclad Golem', cost: 5, type: 'champion', unit: 'golem', count: 1, role: 'tank', desc: 'Huge tank. Ignores units and walks at structures.' },
  { id: 'duelist', name: 'Duelist', cost: 4, type: 'champion', unit: 'duelist', count: 1, role: 'dps', desc: 'Single-target blender. Kills tanks and champions.' },
  { id: 'hexer', name: 'Hexer', cost: 4, type: 'champion', unit: 'hexer', count: 1, role: 'splash', desc: 'Ranged caster with wide splash.' },
  { id: 'ram', name: 'Siege Ram', cost: 4, type: 'champion', unit: 'ram', count: 1, role: 'siege', desc: 'Fast ram that only hits structures, and hits hard.' },
  { id: 'colossus', name: 'Stone Colossus', cost: 6, type: 'champion', unit: 'colossus', count: 1, role: 'tank', desc: 'Slow walking fortress with a sweeping splash attack.' },
  { id: 'sharpshooter', name: 'Sharpshooter', cost: 4, type: 'champion', unit: 'sharpshooter', count: 1, role: 'dps', desc: 'Very long range, heavy single shots.' },
  { id: 'medic', name: 'Field Medic', cost: 3, type: 'champion', unit: 'medic', count: 1, role: 'support', desc: 'Heals nearby allies continuously.' },
  // spells
  { id: 'firebomb', name: 'Fire Bomb', cost: 4, type: 'spell', radius: 135, role: 'dmgSpell', desc: 'Heavy area damage. Weak against structures.',
    effects: [{ t: 'damage', amt: 270, radius: 135, structMult: 0.35 }] },
  { id: 'spark', name: 'Spark', cost: 2, type: 'spell', radius: 95, role: 'dmgSpell', desc: 'Small zap that briefly stuns.',
    effects: [{ t: 'damage', amt: 95, radius: 95, structMult: 0.35 }, { t: 'stun', dur: 0.5, radius: 95 }] },
  { id: 'frostsnap', name: 'Frost Snap', cost: 3, type: 'spell', radius: 175, role: 'utilSpell', desc: 'Chills an area: light damage and a strong 4s slow.',
    effects: [{ t: 'damage', amt: 50, radius: 175, structMult: 0 }, { t: 'slow', pct: 0.5, dur: 4, radius: 175 }] },
  { id: 'mendingrain', name: 'Mending Rain', cost: 3, type: 'spell', radius: 165, role: 'utilSpell', desc: 'Heals allies in an area for 5 seconds.',
    effects: [{ t: 'zone', dur: 5, radius: 165, hps: 48 }] },
  { id: 'bulwark', name: 'Bulwark', cost: 3, type: 'spell', radius: 175, role: 'utilSpell', desc: 'Lane shield: allies and structures in the area gain a 6s barrier.',
    effects: [{ t: 'shield', amt: 360, dur: 6, radius: 175, structures: true }] },
  { id: 'rallyhorn', name: 'Rally Horn', cost: 2, type: 'spell', radius: 185, role: 'utilSpell', desc: 'Allies in the area attack and move faster for 6s.',
    effects: [{ t: 'buff', radius: 185, dur: 6, buff: { as: 0.35, ms: 0.25, tag: 'rally' } }] },
  // buildings
  { id: 'turret', name: 'Bolt Turret', cost: 4, type: 'building', unit: 'turret', count: 1, life: 35, role: 'defense', desc: 'Defensive turret. Lasts 35s.' },
  { id: 'warcamp', name: 'War Camp', cost: 5, type: 'building', unit: 'warcamp', count: 1, life: 36, role: 'defense', desc: 'Spawns a Pikeling every 4.5s for 36s.' },
  { id: 'palisade', name: 'Palisade', cost: 2, type: 'building', unit: 'wall', count: 3, life: 30, role: 'defense', desc: 'Three wall segments that block and distract.' },
  { id: 'mortar', name: 'Mortar Nest', cost: 4, type: 'building', unit: 'mortar', count: 1, life: 30, role: 'defense', desc: 'Long-range splash artillery with a blind spot up close.' },
  { id: 'totem', name: 'Tar Totem', cost: 3, type: 'building', unit: 'totem', count: 1, life: 30, role: 'defense', desc: 'Slows every enemy near it.' },
];
export const CARDS: Record<string, CardDef> = Object.fromEntries(CARD_LIST.map(c => [c.id, c]));
export const DEFAULT_DECK = ['pikelings', 'slingers', 'shieldbearers', 'bombardiers', 'golem', 'firebomb', 'spark', 'turret'];
