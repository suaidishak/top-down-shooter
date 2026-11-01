# GRIDFIRE

A retro top-down arena shooter you can play in the browser. No build step, no
dependencies, no image or audio assets — the pixel sprites and sound effects are
generated in code.

**Play it live:** https://suaidishak.github.io/top-down-shooter/

## Controls

| Action | Input |
| --- | --- |
| Move | Arrow keys or `W` `A` `S` `D` |
| Aim | Mouse |
| Shoot | Hold left mouse button (auto-fires) |
| Pause / resume | `Esc` or `P` |
| Mute | `M` |

## What's in the game

- **Six sectors of wave-based levels** with a clear level-complete screen and a
  multi-phase boss (the Overlord) at the end.
- **Four enemy types** with distinct AI: grunts seek, rushers telegraph a dash,
  shooters keep their distance and fire, tanks soak damage.
- **Procedural pixel art** — every sprite is a character matrix baked to an
  offscreen canvas once per palette and pre-rotated into eight directions, so
  aiming stays crisp instead of blurring.
- **Juice** — muzzle flashes, hit flashes, particle bursts, spawn telegraphs,
  screen shake (disabled under `prefers-reduced-motion`) and procedural WebAudio
  sound effects with a persisted mute toggle.
- **Pickups** — health (+25), rapid fire (8 s) and spread shot (8 s), dropping
  from defeated enemies.
- **Persistence** — high score, best level and mute preference are stored in
  `localStorage` under `top-down-shooter:v1`.

## Run locally

The game uses classic scripts, so it also works by opening `index.html`
directly. For the most faithful run (and to test `localStorage`), serve the
folder:

```bash
cd top-down-shooter
python -m http.server 8000
# then open http://localhost:8000
```

## Tests

Logic tests run headlessly in Node with a small DOM/canvas stub. They load the
real game scripts through `node:vm` and cover level data, wave progression,
collision math, spawn rules, boss phases, damage, scoring, pause, persistence and
sprite validation.

```bash
node test/logic.test.js
```

## Project structure

```
index.html          # canvas, HUD and overlay screens
styles.css          # letterboxed stage, HUD, menus, responsive tweaks
js/
  sprites.js        # pixel matrices, palettes, baked rotation frames
  audio.js          # WebAudio synth sound effects
  levels.js         # level/wave data + pure helpers
  game.js           # state machine, fixed-step loop, entities, input, rendering
test/
  logic.test.js     # headless Node test harness
```

## Tech notes

- Logical resolution is 960×540; CSS letterboxes the canvas and
  `image-rendering: pixelated` keeps pixels sharp at any window size.
- The simulation runs at a fixed 1/60 s timestep from a `requestAnimationFrame`
  loop, and only advances while playing.
- The game auto-pauses when the window loses focus or the tab is hidden.
