# Frostember Duel

A 1v1 real-time game where you are the commander and the champion at once: you deploy cards with Essence, and you fight with a hero who levels up, last-hits for gold and buys items. Matches last 8 minutes plus up to 2 minutes of sudden death. Single player against a bot. Works fully offline.

All names, characters, art and audio are original. Art is drawn in code, sound is synthesized in code; there are no image or audio files.

## Play it

**Windows:** extract `FrostemberDuel-win32-x64.zip`, open the `Frostember Duel` folder and double-click `Frostember Duel.exe`. Keep the exe next to its other files. The exe is not code-signed, so Windows SmartScreen may show a notice: choose "More info", then "Run anyway".

**From source (any OS):**

```bash
npm install
```

```bash
npm start
```

`npm start` builds the web bundle and opens it in Electron. `npm run dev` runs it in a browser with hot reload instead.

## Controls

| Input | Action |
|---|---|
| Right-click or tap (left-click also works) | Move the hero; on an enemy: attack; on your own creep under 50% health: deny |
| Q W E R | Cast abilities at the cursor (R unlocks at level 6). Or click the ability button, then a target |
| S | Stop and hold position (no auto-attack; useful for timing last hits) |
| Drag a card onto the field, or 1-4 then click | Deploy a card. You can also drop a card on the minimap |
| B | Shop (works at your fountain or while dead) |
| Z X C V, or click the item | Use a consumable |
| Space | Centre the camera on the hero |
| Arrow keys, minimap click, middle-drag | Move the camera. Mouse wheel zooms |
| Esc or P | Pause menu: restart, game speed, volume, fullscreen, quit |
| F11 | Fullscreen |

Touch: tap to move or attack, drag to pan, pinch to zoom, drag cards, tap ability buttons then a target.

## Rules in short

- Destroy the enemy Ancient. In each lane the outer tower, inner tower and barracks fall in that order; each is invulnerable until the one in front falls. The Ancient is invulnerable until both inner towers are down.
- Essence (max 10) refills at 1 per 2.8s, twice as fast from 3:00 and three times from 6:00. It only pays for cards.
- Gold comes from a small trickle, hero last hits, hero kills, structures, jungle camps, the boss and bounty runes. It only pays for hero items.
- Creep waves leave every barracks every 30s. Killing an enemy barracks makes your creeps in that lane "super".
- Jungle camps respawn on a 60s clock. The boss Old Maw wakes at 3:00, gets stronger after each kill and drops a Phoenix Ember (your next death revives you on the spot). Runes appear on the river at 1:00 and every 2 minutes after.
- Fog of war: low ground cannot see high ground, and ranged attacks uphill miss 25% of the time.
- At 8:00 sudden death burns every structure at an escalating rate. See "Changes from the spec".

## Project layout

```
src/data/      CONFIG (all balance numbers) and plain data tables: heroes, cards, units, items, camps
src/sim/       deterministic 60Hz simulation, seeded RNG, spatial hash. No DOM, PixiJS or Electron imports
src/ai/        bot opponent (Easy, Normal, Hard)
src/render/    PixiJS renderer and the procedural art painters
src/audio/     synthesized sound effects and music, played through Howler
src/ui/        HUD, menus, deck builder, shop, tutorial, styles
src/game.ts    fixed-timestep loop, input, match lifecycle
electron/      Electron main process
tools/         headless balance simulation, single-match runner, performance probe
tests/         unit tests for the simulation core
scripts/       Windows packaging and the browser end-to-end verification
```

Adding a card is one row in `src/data/cards.ts` (plus a row in `src/data/units.ts` if it deploys a new unit, and optionally a painter in `src/render/art.ts`).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Browser dev server |
| `npm run build` | Type-check and build the web bundle into `dist/` (relative paths, loads from `file://`) |
| `npm test` | Unit tests of the simulation |
| `npm run balance -- 120 normal --md BALANCE.md` | 240 headless bot-vs-bot matches with swapped sides, writes the report |
| `npm run verify` | Drives the built game in headless Chromium with real input and runs 10 full matches; needs Playwright with Chromium available |
| `npm run package:win` | Builds `release/FrostemberDuel-win32-x64.zip` (folder with the exe). Works on Linux, macOS and Windows, no Wine needed |
| `npm run dist` | Single-file portable exe via electron-builder. Run this one on a Windows machine |

## Building on Windows

1. Install Node.js 20 or newer from nodejs.org.
2. Open a terminal in the project folder.
3. Install dependencies (this also downloads Electron):
   ```bash
   npm install
   ```
4. Folder build, the primary method. Produces `release\FrostemberDuel-win32-x64.zip` and the unzipped folder `release\Frostember Duel-win32-x64\` containing `Frostember Duel.exe`:
   ```bash
   npm run package:win
   ```
5. Optional single-file portable exe. Produces `release\builder\FrostemberDuel-portable.exe`:
   ```bash
   npm run dist
   ```

If step 3 or 4 cannot download Electron (corporate proxy), set `ELECTRON_MIRROR` to a reachable mirror or download `electron-v<version>-win32-x64.zip` manually and point `electron_config_cache` at the folder containing it, then rerun.

## Changes from the spec, and why

- **Sudden death tie-break.** The spec says all towers take escalating damage and the lowest-health structure falls first. Applied literally, two untouched Ancients would always die on the same tick and tower advantage would not matter. Implemented: every structure burns at the same escalating percentage per second, and each Ancient burns faster in proportion to how much of its own six lane structures is missing. The side with the weaker base loses; an exactly equal state is a draw.
- **The river is walkable everywhere**, not only at the bridges. Lane units use the bridges because they follow lanes; the hero can cross anywhere. This avoids pathfinding around water and keeps the boss pit and rune spots easy to reach.
- **Abilities level automatically** with the hero (Q, W, E unlock at levels 1, 2, 3 and R at 6) instead of spending skill points. One fewer decision in a short match.
- **The Ancient starts attacking** when first damaged or as soon as either inner tower on its side falls.
- **Only hero last hits pay gold for unit kills.** Kills by towers, creeps or card troops pay nothing. Structure, boss and hero-kill bounties go to the team regardless of who landed the blow.
- **First rune at 1:00**, then every 2 minutes.
- **Hard bot cheats on vision only** (it ignores fog of war) and reacts faster. No difficulty gets extra essence or gold. Easy and Normal respect fog.
- **Melee heroes get +3 armor.** Added during balancing because melee heroes were losing far more often.
- **Not built (out of scope by the spec):** online play, accounts, monetization, third lane, couriers, wards, illusions, campaign.

## Known issues

- Balance is not finished. Tuning was stopped early on request; see `BALANCE.md`. Sides are even, but hero win rates under bot play are still spread out (see the report for the exact outliers), and a few cards sit outside 45-55%.
- Most bot-vs-bot matches go to sudden death rather than ending by an Ancient kill before 8:00.
- No pathfinding: units walk in straight lines and slide around structures.
- Touch input is implemented but was only exercised with mouse events in automated checks.
- The Windows exe has no custom icon (setting one from Linux would need extra tooling) and is unsigned.
- "Remember window size" is implemented in the Electron main process but was not exercised by an automated check.

## Verification status

See the final hand-over notes for what was run. In short: unit tests pass, the web build was driven in headless Chromium, the Electron wrapper and the exact packaged app archive were launched with Linux Electron, and the Windows exe was inspected but **not launched** (no Windows machine or Wine in the build environment).
