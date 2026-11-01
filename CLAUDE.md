# CLAUDE.md — GRIDFIRE

Guidance for working in this repository. Read this before changing gameplay,
sprites, levels, UI, or deployment.

## Project profile

- **What it is:** GRIDFIRE, a browser-playable 2D retro top-down arena shooter.
- **Stack:** vanilla JavaScript, Canvas 2D, HTML, CSS. No dependencies, no
  bundler, no build step, no package.json.
- **Script style:** classic `<script>` tags loaded in order — never ES modules.
  `js/sprites.js`, `js/audio.js`, `js/levels.js` each expose a namespace on
  `window` (`Sprites`, `Sfx`, `Levels`); `js/game.js` drives everything and
  exposes `window.Game` test hooks.
- **Resolution:** 960×540 logical pixels, CSS-letterboxed to the viewport with
  `image-rendering: pixelated`; `imageSmoothingEnabled = false` everywhere.
- **Hosting:** GitHub Pages (legacy build from `main` root, no build step).
  - Live: https://suaidishak.github.io/top-down-shooter/
  - Repo: https://github.com/suaidishak/top-down-shooter
- **Persistence:** `localStorage` key `top-down-shooter:v1`
  (`{ highScore, bestLevel, muted }`).
- **CI:** `.github/workflows/test.yml` runs `node test/logic.test.js` on every
  push to `main` and on pull requests.

## Commands

```bash
# Run the headless logic tests (no install needed)
node test/logic.test.js

# Play locally (opening index.html directly also works)
python -m http.server 8000

# Syntax-check a script
node --check js/game.js

# Push workflow: test, commit, push
git status
git add <files>
git commit -m "Imperative subject"   # body + Co-Authored-By line
git push origin main
```

There is no test runner, linter, or formatter configured. Use Node's built-in
`node --check` and the test harness.

## File map

| File | Responsibility |
| --- | --- |
| `index.html` | Canvas (`#game`), HUD, boss bar, overlay screens, script order |
| `styles.css` | Letterbox stage, retro theme, HUD, menus, focus states, reduced-motion rules |
| `js/sprites.js` | Pixel-matrix definitions, palettes, baking, 8-way rotation cache, flash overlays, `Sprites.draw` |
| `js/audio.js` | Lazy WebAudio synth (`tone`, `noise`), SFX recipes, mute state |
| `js/levels.js` | Level/wave data, enemy definitions, pure helpers (collision, spawn, phases, validation) |
| `js/game.js` | State machine, fixed-step loop, player/enemies/bullets/pickups/particles, input, rendering, HUD, screens |
| `test/logic.test.js` | `node:vm` harness with DOM/canvas/localStorage stubs; loads real game scripts |
| `.github/workflows/test.yml` | CI: runs the logic tests on pushes and PRs |
| `README.md` | Player-facing overview, controls, local run instructions |

`js/levels.js` must remain DOM-free — the test harness and future tooling rely
on loading it standalone.

## Architecture essentials

### State machine

`state.screen` is one of:

`menu → playing ⇄ paused → levelComplete → playing … → gameOver | victory`

- Only `playing` advances the simulation.
- `setScreen(name)` toggles overlay `hidden` attributes, shows/hides the HUD,
  sets the cursor, and moves keyboard focus to the screen's primary button.
- Pause is triggered by `Esc`/`P`, the HUD pause button, window blur, tab hide,
  and clears held keys/mouse-down.

### Loop and timing

- `requestAnimationFrame` → `tick(dt)` with a fixed 1/60 s accumulator, max 5
  simulation steps per frame, frame delta clamped to 100 ms.
- `step(dt)` is the simulation unit; tests call it directly.
- Constants live at the top of `js/game.js` (speeds, cooldowns, lifetimes,
  screen-shake decay, particle cap).

### Rendering

- Background is pre-rendered once into `arenaCache` (gradient, grid, border).
- Entities are plain objects in arrays; collision is circle-vs-circle via
  `Levels.circleHit`.
- Sprites are drawn with `Sprites.draw(ctx, name, x, y, angle, options)` and
  are pre-rotated into 8 cached frames; never rotate pixel art per frame.
- Screen shake is a render-time translate, disabled when
  `prefers-reduced-motion: reduce` matches.
- Mouse coordinates must be converted through `canvas.getBoundingClientRect()`
  into logical space (already handled by `updatePointer`).

## Gameplay profiles

### Player

| Stat | Value |
| --- | --- |
| Health | 100 (refilled every level) |
| Movement speed | 240 px/s (arrows or WASD) |
| Radius | 14 |
| Fire cooldown | 0.18 s (0.09 s with rapid fire) |
| Bullet | speed 720 px/s, damage 1, life 1.4 s |
| Aim | mouse; fire while left button held |
| Invulnerability after a hit | 0.7 s |

Spread shot fires 3 bullets at −0.21 / 0 / +0.21 rad. Power-ups last 8 s.

### Enemies (`js/levels.js → ENEMY_TYPES`)

| Type | HP | Speed | Radius | Contact dmg | Score | Behaviour |
| --- | --- | --- | --- | --- | --- | --- |
| `grunt` | 2 | 58 | 15 | 8 | 100 | Seeks the player |
| `rusher` | 1 | 150 | 13 | 12 | 150 | Seeks, flashes during a 0.45 s windup, then dashes at 3× speed |
| `shooter` | 2 | 70 | 15 | 0 | 200 | Keeps 210–300 px, strafes, fires every ~1.5 s (bullet 320 px/s, 6 dmg) |
| `tank` | 8 | 38 | 22 | 20 | 400 | Slow seek, high HP |
| `boss` | 150 | 55 | 34 | 25 | 5000 | Three phases (see below) |

Boss phases (`Levels.bossPhase`): phase 1 above 2/3 HP → 10-bullet radial burst;
phase 2 above 1/3 HP → 3-way spread plus occasional dash; phase 3 → spiral fire
and summons grunts (capped at 8 live adds). Contact damage has a 0.9 s cooldown.

Spawn points are chosen on an arena edge, at least 200 px from the player
(260 px for the boss), with a 0.55 s telegraph (1.2 s for the boss).

### Pickups

12% drop chance on non-boss death: 50% health, 25% rapid fire, 25% spread shot.
Health restores 25 HP (capped at max). Timed power-ups last 8 s. Pickups expire
after 12 s and are collected on contact.

### Levels (`js/levels.js → LEVELS`)

| # | Name | Waves | Focus |
| --- | --- | --- | --- |
| 1 | OUTPOST | 3 | Grunts |
| 2 | RUSH HOUR | 4 | Grunts + rushers |
| 3 | CROSSFIRE | 5 | Shooters join |
| 4 | HEAVY METAL | 5 | Tanks join |
| 5 | GAUNTLET | 6 | Mixed escalation |
| 6 | OVERLORD | 2 + boss | Boss fight |

Wave schema: `{ types: { grunt: 4, … }, interval, hpScale, speedScale }`.
A wave clears only when its spawn queue is empty **and** every enemy is dead;
then there is a 1.2 s break. Clearing the last wave of a normal level schedules
`levelComplete` after 0.8 s; on a level with `boss: true` it schedules the boss
after 1.4 s. Killing the boss wins immediately.

Level-clear bonus: `500 × level number`. High score and best level are recorded
on level clear, game over, and victory.

### Palettes / variants

Enemies use the `base` palette for levels 1–3 and palette-swapped variants from
level 4 onward: grunt `toxic`, rusher `pink`, shooter `sour`, tank `steel`
(`Levels.variantFor`). Bosses always use `base`.

## Adding or changing things

- **New enemy:** add a stat entry in `ENEMY_TYPES`, a sprite in `sprites.js`,
  AI dispatch in `updateEnemies`, and (if needed) a variant palette. Update
  `validate()` expectations and tests.
- **New level:** append to `LEVELS` following the wave schema. The last level
  must keep `boss: true`, and the boss must never appear in `wave.types` —
  `Levels.validate()` enforces both.
- **New sprite:** call `Sprites.define(name, rows, palettes)`. Every row must be
  the same width; every non-`.` character must have a colour in `base` and in
  each variant palette. Add a test-visible name if the game draws it.
- **New pickup:** add a type, sprite, drop-roll branch, and `applyPickup` case.
- **New screen:** add markup in `index.html`, register it in the `screens` map
  in `game.js`, and route it from `setScreen`.
- **Tuning:** prefer changing data in `levels.js` or the constants at the top of
  `game.js`; avoid scattering magic numbers.

## Testing rules

- Tests stub the DOM, canvas 2D context, `localStorage`, `matchMedia`,
  `performance`, and `requestAnimationFrame`; game scripts are loaded via
  `node:vm` in this order: sprites → levels → audio → game.
- The harness relies on `window.Game` exposing state, input, and step/flow
  helpers. Keep those hooks working, and keep `boot()` safe under stubs.
- `sprites.js` and `levels.js` must not touch the DOM.
- Add assertions for new pure helpers in `levels.js`, and for new flow rules
  through `Game.state` / `Game.step`.
- Run the suite before every commit; CI runs it on push.

## Code conventions

- `'use strict';` at the top of every JS file.
- IIFE namespaces for browser modules; function declarations for hoisted
  helpers; `const`/`let` only.
- Keep pure logic in `levels.js`; DOM and rendering stay in `game.js` and
  `sprites.js`.
- Quote style: single quotes in JS; 2-space indentation.
- CSS follows the existing BEM-ish naming (`hud__group`, `boss-bar__fill`,
  `btn--primary`) and must keep `[hidden] { display: none; }` behavior for
  overlay screens and HUD.
- DOM IDs are coupled to `js/game.js`; rename them in both places or not at all.
- Keep the game playable offline from `file://` (no fetch, no modules).

## Deployment

Pages rebuilds automatically on every push to `main` (GitHub Actions "pages
build and deployment"). There is no build artifact — `main` root is the site.
After pushing:

```bash
curl -s -o /dev/null -w '%{http_code}\n' --fail --retry 30 --retry-delay 5 \
  --retry-all-errors https://suaidishak.github.io/top-down-shooter/
```

Expect `200`. Assets live at `styles.css`, `js/*.js`.

## Git workflow

- Commit in small, logical units; subject in imperative mood; body explains
  what and why.
- End Claude-authored commits with:
  `Co-Authored-By: Claude Code <noreply@anthropic.com>`
- Run the tests first, commit locally, then `git push origin main`.
- Confirm `git status` is clean and the CI run succeeds after pushing.
