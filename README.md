# Shardkeep

A small top-down action RPG for the browser, built with **Phaser 3 + TypeScript + Vite**.
Lead a party of up to three heroes through a puzzle dungeon, chain your skills together,
and take down the Ashen Warden. Built step by step as a learning project.

## Features

- **Real-time combat:** 8-direction movement, 3-hit combos, weapon skills, dodge rolls with i-frames,
  hit-stop, knockback and damage numbers.
- **Party of 1 to 3 heroes:** switch between them at any time; the others are run by companion AI.
  Six heroes (melee, ranged, healer), three of them recruitable in town.
- **Chain skills:** stun or knock down an enemy, then chain hero after hero for bonus damage.
- **Elements:** Fire > Earth > Water > Fire.
- **Dungeon with puzzles:** push blocks, crystal order, a hidden key, secret walls, 3 hidden stars, a checkpoint.
- **Boss fight** with telegraphed attacks, armor to break, and a second phase.
- **Progression:** XP and levels (HP, skill cooldown, mana cost), mana for skills, potions, weapon upgrades.
- **Town hub** with a shop, party setup, typewriter NPC dialogue, stage select and a results screen.
- **Pause menu, sound effects** (generated with Web Audio) and **auto-save** to localStorage.

## How to run

You need [Node.js](https://nodejs.org/) (version 18 or newer).

```powershell
npm install
npm run dev
```

Open http://localhost:5173 in your browser.
Add `?debug` to the URL (http://localhost:5173/?debug) to see physics bodies.

## How to build

```powershell
npm run build
```

This type-checks the code and writes a static site to `dist/`. Preview it with `npm run preview`,
or upload the `dist/` folder to any static host (GitHub Pages, Netlify, itch.io...).

## Tech stack

- [Phaser 3](https://phaser.io/) (3.90): game engine, Arcade physics
- [TypeScript](https://www.typescriptlang.org/) (5.8): strict mode
- [Vite](https://vitejs.dev/) (6): dev server and bundler
- Web Audio API for the sound effects, localStorage for saves

## Credits

- Design and development: **Ahmad Fadhil bin Rosli**
- **No external assets are used.** All graphics are placeholder shapes drawn in code
  (`src/scenes/BootScene.ts`) and all sounds are synthesized in code (`src/systems/Sfx.ts`).
- Game engine: Phaser 3 by Phaser Studio (MIT License).

## License

[MIT](LICENSE) © 2026 Ahmad Fadhil bin Rosli

## Controls

| Input | Action |
|---|---|
| WASD / Arrow keys | Move (8 directions) |
| Mouse | Aim (attacks and skills go toward the crosshair) |
| Left click | Attack. Click repeatedly or **hold** for the 3-hit combo |
| Right click (or Space) | Dodge roll, invincible while rolling |
| E | Weapon skill (depends on the hero) |
| **F** | **Chain skill** (when the pink prompt appears) |
| Q | Switch to the next hero |
| 1 / 2 / 3 | Switch to a specific hero |
| Z / X | Drink a Health Potion (50% HP) / Mana Potion (full mana) on the hero you control |
| R | Reset the current room (use it if a push block gets stuck) |
| Esc | Pause menu: Resume / Restart stage / Return to town / Sound |
| M | Sound on/off (anywhere, saved) |

**In town:** WASD to walk, **E** (or Enter) to talk / continue dialogue, **Tab** for party setup, **Esc** to close a window.
In menus: W/S and A/D move, E/Enter selects, or just use the mouse.

## Game flow

```
Title (Continue / New Game) -> Emberwick (town) -> Stage Select -> Stage -> Results -> Emberwick
```

- **Tilda** (shop): three tabs (Potions, Weapons, Heroes). Every row has its own button
  (Buy / Upgrade / Recruit), and every purchase asks **Yes / No** first.
- **Gatekeeper Orin**: Stage Select. Each card shows the recommended level and how hard it is
  *for your party right now* (EASY / FAIR / TOUGH / DEADLY).
- **Elder Bram** (or Tab): **party setup**. Pick 1 to 3 heroes from your roster and choose the leader.
  Bringing only one or two heroes is a self-made hard mode.
- **Pip**: tips.

## Levels, mana and difficulty

Every enemy gives XP to **every hero in your party** (clearing a stage adds a bonus).
A level up mid-fight shows "LEVEL UP!" and the new max HP is added right away.

| A level gives | Example (Rook, Lv.1 -> Lv.10) |
|---|---|
| More max HP | 120 -> 246 |
| Shorter skill cooldown (-3% per level) | 5.0 s -> 3.6 s |
| Cheaper skill mana (-2.5% to -3% per level) | 30 -> 23 |

- **Mana:** each hero has a blue bar under the HP bar. Skills (E) cost mana. It refills slowly
  on its own and faster when your normal hits land. The E icon turns grey-blue when you can't afford it.
- **ATK does not grow with levels.** Buy weapon upgrades from Tilda (+12% ATK each, up to +5).
- **Choose your challenge:** want to crush the boss? Replay stages to level up and buy upgrades.
  Want a hard fight? Go in at a low level, without upgrades, or with a smaller party.
- **What is saved** (localStorage, automatically): XP the moment you earn it (even if you lose),
  coins *only when you clear a stage*, potions, weapon upgrades, recruited heroes, party, sound setting,
  best time and stars per stage. Quitting or restarting from the pause menu loses that run's coins.
  "New Game" on the Title screen erases the save (it asks twice).
  To peek at it: open the browser console and run `JSON.parse(localStorage.getItem('shardkeep-save'))`.

## Heroes

Skills come from the role (melee spins and knocks DOWN, ranged fires a piercing shot that STUNS,
healers heal nearby allies); each hero has its own stats, element and chain skill.

| Hero | Role | Element | How to get | Skill (E) | Chain skill (F) |
|---|---|---|---|---|---|
| Rook | Melee | Fire | Starter | Flame Spin | **Inferno Dive**: on STUN, causes DOWN |
| Wren | Ranged | Water | Starter | Tide Piercer | **Riptide Pin**: on DOWN, causes STUN |
| Moss | Healer | Earth | Starter | Grove Bloom | **Rootquake**: on any status, finisher + party heal 15% |
| Brask | Melee | Earth | Shop, 150 c | Quake Spin | **Boulder Crush**: on STUN, causes DOWN. Tanky: 165 HP, DEF 9, slow |
| Cinder | Ranged | Fire | Shop, 200 c | Blaze Lance | **Flare Volley**: on DOWN, causes STUN. Glass cannon: ATK 15, 78 HP |
| Nerri | Healer | Water | Shop, 250 c | Tidal Grace | **Undertow**: on any status, finisher + party heal 20% |

## The HUD

- **Top-left:** one small row per hero: HP (green), mana (blue), XP to next level (thin line). Gold outline = the hero you control.
- **Bottom-left:** attack, skill (the number is the **seconds left on the cooldown**; grey-blue = not enough mana), dodge, potions.
- **Top-right:** coins, stars, key, time, element wheel.
- Any HUD block **fades out when your hero or an enemy is behind it**, so it never hides the fight.
  The controls reminder at the bottom disappears after a few seconds.

## Elements

**Fire > Earth > Water > Fire.** Hitting with advantage deals x1.3 (orange numbers);
with disadvantage x0.75 (grey numbers). Enemy HP bars show a colored element dot.

## Enemies

| Symbol | Enemy | Element | Behavior |
|---|---|---|---|
| `c` | Bramble Slime | Earth | Chases you, flashes red, then lunges. Hits interrupt it. |
| `w` | Ember Wisp | Fire | Keeps its distance, shows an aim line, fires 3 fireballs. |
| `t` | Tide Shell | Water | Slow and armored: normal hits don't stop it. Its slam shows a **red zone**: step out! Heavy hits and skills wear down its armor until it **BREAKS** (stunned). |

## Chain skills

1. A skill **stuns** or **knocks down** an enemy (Wren's E stuns, Rook's E knocks down, breaking a Tide Shell stuns).
2. A pink prompt appears: press **F**. The matching hero dashes in for a big hit, even if it's an AI companion.
3. That hit can leave a *new* status, so the next hero can chain too. Each step adds +25% damage.
   Example: Tide Piercer (STUN) → F Rook (DOWN) → F Wren (STUN) → F Moss (finisher + heal) = CHAIN x3.

Each hero's chain has an 8 s cooldown.

## The stage: Ember Hollow

```
                 [5 Ember Throne]    BOSS: Ashen Warden (portal appears when it falls)
                        |
                 [4 Crystal Hall]    crystal puzzle + checkpoint
                        |  key door
[1 Entrance] --- [2 Switch Chamber] --- [3 Bramble Garden]
 defeat enemies   push-block puzzle       find the hidden key
```

- **Doors** open when the room's lock is solved: defeat all enemies, put blocks on every switch, or hit the crystals in order.
- **Push blocks**: walk into a block and keep pushing; it slides one tile. Stuck? Press **R**.
- **Crystals**: the runes on the floor show the order. Hitting the wrong one resets them all. Arrows work too!
- **Key**: hidden in a bush in the garden. It opens the locked door in the Switch Chamber.
- **3 hidden stars**: look for cracked walls and suspicious bushes.
- **Checkpoint**: touch the statue to heal. If the party falls, you respawn there with everything you collected.
- Everything you do is remembered while you move between rooms (`src/systems/StageRun.ts`).

## The boss: Ashen Warden

A fire golem (2600 HP) in the Ember Throne. The door seals behind you until it falls.

| Pattern | Warning | What to do |
|---|---|---|
| **Molten Charge** | A red lane on the floor | Step out of the lane. If it rams a **pillar** it CRASHES and is stunned: chain it! (Outer walls just stop it.) |
| **Eruption** | Red circles under every hero | Move out before the inner circle fills up |
| **Flame Ring** (phase 2) | The boss swells and glows | Dodge-roll through the gaps between fireballs |

- **Armor** (yellow bar under its HP): normal hits never interrupt it, and skills can't stun it directly ("RESIST").
  Wear the armor down (heavy hits count more) to **BREAK** it and open a chain.
- **Phase 2** at 50% HP (the white tick on the bar): faster, more eruption zones, a double ring, and 2 Ember Wisps join in.
- Wiping during the fight sends you back to the Crystal Hall checkpoint (the boss heals; the intro is skipped).
- Tuning: patterns in `src/entities/enemies/Boss.ts` (`PATTERN`), stats in `src/data/enemies.ts` (`id: 'boss'`).

## Where things live

| Folder | What's inside |
|---|---|
| `src/data/` | Game content as plain data: heroes (+ chain skills), enemies, skills/combos per role, stages, `progression.ts` (levels, mana, shop prices), `hub.ts` (town map + NPCs) |
| `src/scenes/` | Phaser scenes: Boot (makes placeholder art) → Preload → Title → Hub → StageSelect → Stage (+ UI overlay) → Results, plus Pause on top of a stage |
| `src/ui/` | `Panel` (base window + `Button`), `ShopPanel`, `PartyPanel` (party setup), `ConfirmDialog` (Yes/No), `DialogueBox` (typewriter) |
| `src/entities/` | `Entity` base, `Hero`, `Enemy` base, `Projectile`, `enemies/` (Chaser, Shooter, Tank, Boss + factory) |
| `src/entities/Props.ts` | Doors, push blocks, switches, crystals, bushes, pickups, checkpoint, portal |
| `src/systems/` | `StateMachine`, `Controls`, `PartyManager`, `CompanionAI`, `CombatSystem` (damage + elements), `ChainSystem`, `RoomBuilder`, `RoomController` (puzzles), `StageRun` (progress inside one stage), `SaveData` (the save file), `Sfx` (sound effects made with Web Audio), `Effects` |

## Editing / adding rooms

Rooms live in `src/data/stages.ts` as ASCII layouts. The full legend is at the top of that file:

| Char | Meaning | Char | Meaning |
|---|---|---|---|
| `#` `o` | wall / pillar | `P` | party start |
| `D` | door (opens when the room's `lock` is solved) | `L` | locked door (needs the key) |
| `B` `_` | push block / switch | `1`-`4` `h` | crystals / order hint |
| `x` | cracked wall (secret) | `%` `&` `@` | bush / bush with key / bush with star |
| `$` `*` | coin / star | `C` `G` | checkpoint / goal portal |
| `c` `w` `t` | enemies | | |

To connect rooms, leave a gap in the outer wall and list it in `exits` (e.g. `exits: { east: 'garden' }`).
The target room needs a gap on the opposite side. All rows must be the same length.

## Adding an enemy

- **Same behavior, new stats/look:** add an entry in `src/data/enemies.ts` with a new `id` and `symbol`.
- **New behavior:** write a class in `src/entities/enemies/` that extends `Enemy` and overrides its hooks
  (`chaseUpdate`, `onWindupStart/Update/End`, `onAttackStart/Update`), then add one line in `createEnemy.ts`.

## Adding a stage

Add a new entry to `STAGES` in `src/data/stages.ts` (with `description` and `recommendedLevel`).
It appears on Stage Select automatically. (Remove one name from `COMING_SOON` in `StageSelectScene.ts`.)

## Adding a hero

Add an entry to `HEROES` in `src/data/heroes.ts`: role, element, colors, stats, `growth` (what a level gives),
`weapon`, `skillName`, `blurb`, `price` (0 = starter, otherwise sold in the shop) and a chain skill.
That's all: its placeholder sprite is generated from the colors, it shows up in the shop and the party setup,
and old saves pick it up automatically. (The grid in party setup fits 6 heroes; make the panel bigger for more.)

## Sound effects

All sounds are generated in `src/systems/Sfx.ts` (beeps and noise bursts, no audio files).
Call `Sfx.play('coin')` anywhere. To use a real recording later, load it in `PreloadScene`
and play it with `this.sound.play(key)` instead.

## NPC dialogue

NPC lines live in `src/data/hub.ts`. Talking opens a dialogue box at the bottom with a typewriter
effect (E skips the typing, E again continues). Change `TYPE_SPEED` in `src/ui/DialogueBox.ts`.

## Tuning

- Combos, skills, statuses, chain bonus: `src/data/skills.ts`
- Hero stats, level growth + chain skills: `src/data/heroes.ts`
- XP curve, max level, mana regen, potion and weapon prices, stage-clear XP: `src/data/progression.ts`
- Hero recruit prices: `price` in `src/data/heroes.ts`
- Enemy stats and timing (e.g. `windup` = how long the warning lasts): `src/data/enemies.ts`
- Element multipliers + damage formula: `src/systems/CombatSystem.ts`
- Companion behaviour: top of `src/systems/CompanionAI.ts`
