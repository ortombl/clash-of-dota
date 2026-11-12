/**
 * Single balance CONFIG. Every tunable number of the rules lives here (per-unit,
 * per-card, per-hero and per-item stats live in their data tables next to this file).
 * Positions are given for team 0 (bottom side); team 1 is mirrored on the Y axis.
 */
export const CONFIG = {
  tickRate: 60,
  map: {
    w: 1200, h: 2000,
    laneX: [250, 950],
    riverY: 1000, riverHalf: 70,
    highGround: 330,            // |y - riverY| beyond this is base high ground
    fountain: { x: 600, y: 1945 },
    ancient: { x: 600, y: 1790 },
    barracksY: 1650, t2Y: 1440, t1Y: 1190,
    bossPit: { x: 600, y: 1000 },
    runeSpots: [{ x: 410, y: 1000 }, { x: 790, y: 1000 }],
    deployLaneHalfWidth: 230,   // width of the forward deploy column opened by a T1 kill
    deployForwardY: 690,        // forward deploy limit (team 0 coordinates) once a lane's T1 is down
  },
  match: {
    duration: 480,              // 8:00 regular time
    suddenDeath: 120,           // +2:00
    sdBaseRate: 0.002,          // structure max-HP fraction lost per second at start of sudden death
    sdRamp: 0.00012,            // added per second of sudden death
    sdAncientPenalty: 1.0,      // ancient decay multiplier bonus per fully-missing lane-structure share
  },
  essence: { max: 10, start: 5, regenInterval: 2.8, doubleAt: 180, tripleAt: 360 },
  deck: { size: 8, hand: 4, deployTime: 1.0, spellDelay: 0.7 },
  creeps: {
    waveInterval: 30, firstWave: 5, melee: 3, ranged: 1,
    growthPerMin: 0.06,         // hp/dmg growth per minute
    superHp: 1.9, superDmg: 1.6,
    aggro: 270,
  },
  hero: {
    maxLevel: 12,
    xpTable: [0, 100, 220, 360, 520, 700, 900, 1120, 1360, 1620, 1900, 2200],
    passiveXp: 1.6,             // per second
    xpRange: 520,
    denyXpFrac: 0.4,
    denyHpFrac: 0.5,
    respawnBase: 4, respawnPerLevel: 1.5,
    buybackBase: 100, buybackPerLevel: 25, buybackCooldown: 120,
    hpBase: 250, hpPerStr: 19, manaBase: 80, manaPerInt: 13,
    hpRegenBase: 1.2, hpRegenPerStr: 0.06, manaRegenBase: 1.0, manaRegenPerInt: 0.05,
    armorPerAgi: 0.16, asPerAgi: 0.012, spellPerInt: 0.007,
    structureDmgMult: 0.6,      // hero attacks vs structures
    spellStructureMult: 0.3,    // spells / abilities vs structures (unless the effect overrides)
    ultLevel: 6, unlockLevels: [1, 2, 3, 6],
    reviveDelay: 3,
    autoAcquire: 130,           // idle auto-attack search beyond attack range
    fountainRadius: 250, fountainZapRadius: 140, fountainHeal: 0.1, fountainDps: 260,
  },
  gold: {
    start: 150, passive: 2.0,
    heroKill: 140, heroKillPerLevel: 14,
    tower1: 160, tower2: 220, barracks: 160,
    sellFrac: 0.5,
  },
  armorK: 0.06,                 // damage multiplier = 1 / (1 + armorK * armor)
  vision: { unit: 420, hero: 580, tower: 540, interval: 6 },
  highGroundMiss: 0.25,
  tower: { heroAggroWindow: 2.0 },
  jungle: { respawn: 60, firstSpawn: 20, leash: 360, aggro: 150 },
  boss: { spawnAt: 180, respawn: 100, growth: 0.4, gold: 260, xp: 320, leash: 300 },
  runes: { first: 60, interval: 120, pickRadius: 48, bountyGold: 120, bountyXp: 60, hasteDur: 25, hasteMs: 0.45, ddDur: 25, regenDur: 18, regenFrac: 0.06, invisDur: 25 },
  invisRevealRange: 170,        // invisible units are revealed this close to enemy towers
};
export type Config = typeof CONFIG;
