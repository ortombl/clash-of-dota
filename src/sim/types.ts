export type Team = 0 | 1 | 2; // 2 = neutral
export type Kind = 'hero' | 'creep' | 'troop' | 'building' | 'tower' | 'barracks' | 'ancient' | 'neutral' | 'boss';

export interface UnitDef {
  id: string; name: string; kind: Kind;
  hp: number; dmg: number; atkInt: number; range: number; speed: number; r: number;
  armor?: number; splash?: number; structOnly?: boolean; structMult?: number;
  projSpeed?: number; minRange?: number;
  slowOnHit?: { pct: number; dur: number };
  healAura?: { hps: number; radius: number };
  slowAura?: { pct: number; radius: number };
  spawner?: { unit: string; interval: number };
  gold: number; xp: number;
  art: string;      // silhouette key used by the renderer
  val?: number;     // rough essence value of one unit, used by the bot only
}

export interface Buff {
  end: number; tag?: string;
  as?: number; ms?: number; dmg?: number; armor?: number; lifesteal?: number;
  regenFrac?: number; manaFrac?: number; hps?: number; mps?: number;
}

export interface Effect {
  t: 'damage' | 'heal' | 'stun' | 'slow' | 'shield' | 'buff' | 'zone' | 'blink' | 'summon' | 'line' | 'invis';
  amt?: number; per?: number; radius?: number; dur?: number; pct?: number;
  structMult?: number; structures?: boolean; self?: boolean; toTarget?: boolean;
  buff?: Omit<Buff, 'end'>;
  unit?: string; count?: number; life?: number;
  width?: number; length?: number;
  dps?: number; hps?: number; follow?: boolean;
}

export type AiTag = 'nuke' | 'aoe' | 'heal' | 'buff' | 'escape' | 'summon' | 'stun' | 'shield';

export interface AbilityDef {
  id: string; name: string; desc: string; icon: string; color: string;
  cast: 'point' | 'unit' | 'self';
  range: number; radius?: number; cd: number; mana: number; delay?: number;
  effects: Effect[]; ai: AiTag;
}

export interface HeroDef {
  id: string; name: string; title: string; blurb: string;
  primary: 'str' | 'agi' | 'int';
  str: number; agi: number; int: number; strG: number; agiG: number; intG: number;
  baseDmg: number; atkInt: number; range: number; speed: number; projSpeed?: number;
  abilities: AbilityDef[]; // Q W E R
  art: string; build: string[]; // bot item build order
}

export interface CardDef {
  id: string; name: string; cost: number;
  type: 'troop' | 'champion' | 'spell' | 'building';
  unit?: string; count?: number; life?: number;
  effects?: Effect[]; radius?: number;
  desc: string;
  role: 'tank' | 'dps' | 'swarm' | 'splash' | 'siege' | 'support' | 'dmgSpell' | 'utilSpell' | 'defense';
}

export interface ItemDef {
  id: string; name: string; tier: 0 | 1 | 2 | 3; cost: number; from?: string[];
  stats?: { str?: number; agi?: number; int?: number; dmg?: number; armor?: number; ms?: number; hp?: number; mana?: number; as?: number; lifesteal?: number; spell?: number; hpRegen?: number; manaRegen?: number };
  use?: { heal?: number; mana?: number; dur?: number; recall?: boolean };
  desc: string; icon: string; color: string;
}

export interface CampDef { x: number; y: number; units: string[] }

export type Order =
  | { t: 'move'; x: number; y: number }
  | { t: 'attack'; id: number }
  | { t: 'cast'; slot: number; x: number; y: number; id: number };

export interface HeroState {
  def: HeroDef; level: number; xp: number; mana: number; maxMana: number;
  str: number; agi: number; int: number;
  cds: number[];               // tick at which each ability is ready
  items: ({ id: string; n: number } | null)[];
  order: Order | null; hold: boolean;
  respawnAt: number; buybackReady: number;
  spellPower: number; lifesteal: number; hpRegen: number; manaRegen: number;
  lastHeroHit: number;         // tick this hero last attacked an enemy hero (tower priority)
  recallAt: number; reviveHere: boolean; deathX: number; deathY: number;
}

export interface Unit {
  id: number; def: UnitDef; kind: Kind; team: Team;
  x: number; y: number; r: number; facing: number;
  hp: number; maxHp: number; armor: number; dmg: number; atkInt: number; range: number; speed: number;
  vision: number; cd: number; target: number; lane: number;
  alive: boolean; structure: boolean; invuln: boolean; tier: number;
  lifeEnd: number; spawnCd: number; activeAt: number;
  stunEnd: number; slowEnd: number; slowPct: number; shield: number; shieldEnd: number; invisEnd: number;
  buffs: Buff[]; asMul: number; msMul: number; dmgMul: number; armorAdd: number; lsAdd: number; rHp: number; rMana: number;
  camp: number; homeX: number; homeY: number; returning: boolean; aggroTeam: number; aggroEnd: number;
  vis: [boolean, boolean];
  gold: number; xp: number; isSuper: boolean; awake: boolean;
  flash: number; atkTick: number; spawnTick: number; // render hints
  hero: HeroState | null;
}

export interface Projectile { x: number; y: number; target: number; speed: number; dmg: number; src: number; team: Team; splash: number; miss: boolean; slowPct: number; slowDur: number; structMult: number; big: boolean }
export interface Zone { x: number; y: number; radius: number; end: number; team: Team; src: number; dps: number; hps: number; slowPct: number; follow: number; structMult: number; color: string }
export interface Pending { at: number; start: number; team: Team; src: number; effects: Effect[]; x: number; y: number; target: number; lvl: number; power: number; radius: number; kind: string; fromHero: boolean }
export interface Rune { type: 'bounty' | 'haste' | 'double' | 'regen' | 'invis'; x: number; y: number }

export interface TeamStats {
  lastHits: number; denies: number; goldEarned: number; damageDealt: number; heroKills: number; deaths: number;
  towersKilled: number; cardsPlayed: number; campsCleared: number; bossKills: number; runes: number; essenceSpent: number; essenceWasted: number;
}

export interface TeamState {
  essence: number; essenceAcc: number; gold: number; goldAcc: number; xpAcc: number;
  hand: string[]; queue: string[];
  heroId: number; revive: boolean;
  forward: [boolean, boolean];   // forward deploy opened per lane (enemy T1 dead)
  superLane: [boolean, boolean]; // own creeps are super in lane (enemy barracks dead)
  playLog: { tick: number; card: string }[];
  stats: TeamStats;
}

export type Command =
  | { type: 'move'; team: 0 | 1; x: number; y: number }
  | { type: 'attack'; team: 0 | 1; id: number }
  | { type: 'stop'; team: 0 | 1 }
  | { type: 'cast'; team: 0 | 1; slot: number; x: number; y: number; id: number }
  | { type: 'card'; team: 0 | 1; slot: number; x: number; y: number }
  | { type: 'buy'; team: 0 | 1; item: string }
  | { type: 'sell'; team: 0 | 1; slot: number }
  | { type: 'use'; team: 0 | 1; slot: number }
  | { type: 'buyback'; team: 0 | 1 };

export interface SimEvent { type: string; x?: number; y?: number; team?: number; id?: number; amt?: number; text?: string; a?: any; b?: any; r?: number }

export interface MatchOptions { seed: number; heroes: [string, string]; decks: [string[], string[]] }
