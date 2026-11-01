'use strict';

/*
 * Headless logic tests for GRIDFIRE.
 *
 * Loads the real game scripts in a Node `vm` context with a tiny DOM/canvas
 * stub, then exercises the simulation through the `window.Game` hooks.
 *
 * Run: node test/logic.test.js
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const STEP = 1 / 60;

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}`);
  }
}

function close(actual, expected, epsilon = 1e-6) {
  return Math.abs(actual - expected) <= epsilon;
}

/* ------------------------------------------------------------------ */
/* DOM / canvas stubs                                                  */
/* ------------------------------------------------------------------ */

function makeContext() {
  const gradient = { addColorStop() {} };
  const target = {
    canvas: null,
    imageSmoothingEnabled: false,
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
    measureText: () => ({ width: 0 }),
  };

  return new Proxy(target, {
    get(object, property) {
      if (property in object) return object[property];
      return () => {};
    },
    set(object, property, value) {
      object[property] = value;
      return true;
    },
  });
}

function makeElement(tag = 'div') {
  const element = {
    tagName: String(tag).toUpperCase(),
    id: '',
    hidden: false,
    textContent: '',
    innerHTML: '',
    className: '',
    style: {},
    classList: {
      add() {},
      remove() {},
      toggle() {},
      contains() {
        return false;
      },
    },
    setAttribute() {},
    getAttribute() {
      return null;
    },
    removeAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    focus() {},
    blur() {},
    appendChild() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 960, height: 540 };
    },
    getContext() {
      return makeContext();
    },
  };

  if (element.tagName === 'CANVAS') {
    element.width = 0;
    element.height = 0;
  }

  return element;
}

const storage = new Map();
const elements = new Map();

const documentStub = {
  hidden: false,
  activeElement: null,
  getElementById(id) {
    if (!elements.has(id)) {
      const element = makeElement(id === 'game' ? 'canvas' : 'div');
      element.id = id;
      elements.set(id, element);
    }
    return elements.get(id);
  },
  createElement(tag) {
    return makeElement(tag);
  },
  addEventListener() {},
  removeEventListener() {},
  querySelector() {
    return null;
  },
};

const sandbox = {
  console,
  Math,
  Date,
  JSON,
  Number,
  Object,
  Array,
  Set,
  Map,
  Error,
  performance: { now: () => Date.now() },
  setTimeout,
  clearTimeout,
  document: documentStub,
  localStorage: {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
    removeItem(key) {
      storage.delete(key);
    },
    clear() {
      storage.clear();
    },
  },
  matchMedia() {
    return { matches: false, addEventListener() {} };
  },
  requestAnimationFrame() {
    return 0;
  },
  cancelAnimationFrame() {},
  addEventListener() {},
  removeEventListener() {},
};

sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);

for (const file of ['sprites.js', 'levels.js', 'audio.js', 'game.js']) {
  const source = fs.readFileSync(path.join(ROOT, 'js', file), 'utf8');
  vm.runInContext(source, sandbox, { filename: file });
}

const Levels = sandbox.window.Levels;
const Sprites = sandbox.window.Sprites;
const Game = sandbox.window.Game;
const SAVE_KEY = 'top-down-shooter:v1';

if (!Levels || !Sprites || !Game) {
  console.error('fatal: game modules did not register on window');
  process.exit(1);
}

const state = Game.state;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function runFor(seconds) {
  const steps = Math.ceil(seconds / STEP) + 2;
  for (let index = 0; index < steps; index += 1) Game.step(STEP);
}

function freshGame() {
  Game.beginGame();
  state.bullets.length = 0;
  state.pickups.length = 0;
}

/* ------------------------------------------------------------------ */
/* Level data                                                          */
/* ------------------------------------------------------------------ */

console.log('\nLevel data');
{
  const result = Levels.validate();
  assert(result.ok, `level definitions are valid (${result.errors.join('; ') || 'no errors'})`);
  assert(Levels.LEVELS.length === 6, 'there are six levels');
  assert(Levels.LEVELS[Levels.LEVELS.length - 1].boss === true, 'final level is a boss level');
  assert(Levels.LEVELS.every((level) => level.waves.length > 0), 'every level has waves');
  assert(Levels.LEVELS.every((level) => !level.waves.some((wave) => 'boss' in wave.types)),
    'boss never appears in a normal wave');
}

console.log('\nWave queues');
{
  const wave = { types: { grunt: 3, rusher: 2, shooter: 1 } };
  const queue = Levels.buildWaveQueue(wave, () => 0.42);
  const counts = queue.reduce((map, type) => {
    map[type] = (map[type] || 0) + 1;
    return map;
  }, {});
  assert(queue.length === 6, 'queue holds every enemy in the wave');
  assert(counts.grunt === 3 && counts.rusher === 2 && counts.shooter === 1,
    'shuffle preserves enemy composition');
  assert(Levels.waveTotal(wave) === 6, 'waveTotal counts all spawns');
}

console.log('\nCollision math');
{
  assert(Levels.circleHit({ x: 0, y: 0, r: 5 }, { x: 6, y: 0, r: 5 }), 'overlapping circles hit');
  assert(Levels.circleHit({ x: 0, y: 0, r: 5 }, { x: 10, y: 0, r: 5 }), 'exactly touching circles hit');
  assert(!Levels.circleHit({ x: 0, y: 0, r: 5 }, { x: 10.5, y: 0, r: 5 }), 'separated circles miss');
  assert(!Levels.circleHit({ x: 0, y: 0, r: 4 }, { x: 0, y: 9, r: 4 }), 'vertical separation misses');
}

console.log('\nSpawn selection');
{
  const player = { x: 480, y: 270 };
  let inside = true;
  let far = true;
  for (let index = 0; index < 300; index += 1) {
    const point = Levels.chooseSpawnPoint(player, Math.random);
    if (point.x < Levels.ARENA_MARGIN || point.x > Levels.WIDTH - Levels.ARENA_MARGIN) inside = false;
    if (point.y < Levels.ARENA_MARGIN || point.y > Levels.HEIGHT - Levels.ARENA_MARGIN) inside = false;
    if (Math.hypot(point.x - player.x, point.y - player.y) < Levels.MIN_SPAWN_DISTANCE) far = false;
  }
  assert(inside, 'spawn points stay inside the arena');
  assert(far, 'spawn points keep the minimum distance from the player');

  const cornerPlayer = { x: Levels.ARENA_MARGIN, y: Levels.ARENA_MARGIN };
  const cornerPoint = Levels.chooseSpawnPoint(cornerPlayer, () => 0);
  const cornerDistance = Math.hypot(cornerPoint.x - cornerPlayer.x, cornerPoint.y - cornerPlayer.y);
  assert(cornerDistance >= Levels.MIN_SPAWN_DISTANCE, 'fallback spawn is far from a cornered player');
}

console.log('\nBoss phases');
{
  assert(Levels.bossPhase(150, 150) === 1, 'full health is phase 1');
  assert(Levels.bossPhase(101, 150) === 1, 'just above two thirds is phase 1');
  assert(Levels.bossPhase(100, 150) === 2, 'two thirds is phase 2');
  assert(Levels.bossPhase(51, 150) === 2, 'just above one third is phase 2');
  assert(Levels.bossPhase(50, 150) === 3, 'one third is phase 3');
  assert(Levels.bossPhase(1, 150) === 3, 'near death is phase 3');
}

console.log('\nVariants');
{
  assert(Levels.variantFor(0, 'grunt') === 'base', 'early levels use base palettes');
  assert(Levels.variantFor(3, 'grunt') === 'toxic', 'late grunts use the toxic palette');
  assert(Levels.variantFor(3, 'boss') === 'base', 'bosses keep their own palette');
}

/* ------------------------------------------------------------------ */
/* Game flow                                                           */
/* ------------------------------------------------------------------ */

console.log('\nGame start');
{
  freshGame();
  assert(state.screen === 'playing', 'beginGame enters the playing screen');
  assert(state.levelIndex === 0 && state.waveIndex === 0, 'beginGame starts at level 1 wave 1');
  assert(state.player && state.player.hp === 100, 'player starts at full health');
  assert(state.wave && state.wave.queue.length === 4, 'first wave queues four grunts');

  Game.step(STEP);
  assert(state.enemies.length === 0, 'no enemy spawns before the wave timer elapses');
}

console.log('\nHold-to-fire');
{
  freshGame();
  Game.input.mouse.down = true;
  Game.input.mouse.x = state.player.x + 200;
  Game.input.mouse.y = state.player.y;
  Game.step(STEP);
  const first = state.bullets.filter((bullet) => bullet.friendly).length;
  Game.step(STEP);
  const second = state.bullets.filter((bullet) => bullet.friendly).length;
  Game.input.mouse.down = false;
  assert(first === 1, 'holding fire shoots one bullet immediately');
  assert(second === first, 'fire cooldown blocks a second bullet on the next step');

  freshGame();
  state.player.power.spread = 8;
  Game.input.mouse.down = true;
  Game.step(STEP);
  Game.input.mouse.down = false;
  assert(state.bullets.filter((bullet) => bullet.friendly).length === 3,
    'spread shot fires three bullets');
}

console.log('\nWave progression');
{
  freshGame();
  state.wave.queue = [];
  Game.spawnEnemy('grunt');
  Game.step(STEP);
  assert(state.enemies.length === 1, 'enemy stays alive through the step');
  assert(state.nextAction === null, 'wave does not advance while an enemy lives');

  state.enemies = [];
  Game.step(STEP);
  assert(state.nextAction === 'wave', 'clearing the wave schedules the next one');
  runFor(Levels.LEVELS[0].waves[0].interval + 0.4);
  assert(state.waveIndex === 1, 'next wave starts after the inter-wave delay');
}

console.log('\nLevel completion');
{
  freshGame();
  const lastWave = Levels.LEVELS[0].waves.length - 1;
  Game.startWave(lastWave);
  state.wave.queue = [];
  state.enemies = [];
  Game.step(STEP);
  assert(state.nextAction === 'complete', 'clearing the last wave schedules completion');
  runFor(1.0);
  assert(state.screen === 'levelComplete', 'level complete screen appears');
  assert(state.score === 500, 'level one clear awards a 500 point bonus');
}

console.log('\nBoss fight');
{
  Game.beginLevel(5);
  Game.startWave(Levels.LEVELS[5].waves.length - 1);
  state.wave.queue = [];
  state.enemies = [];
  Game.step(STEP);
  assert(state.nextAction === 'boss', 'clearing the final wave schedules the boss');
  runFor(2.8);
  assert(state.boss && state.boss.type === 'boss', 'boss spawns after the warning delay');
  assert(state.boss.maxHp === 150, 'boss has its base health');
  assert(state.boss.spawnTimer <= 0, 'boss finishes its spawn telegraph');

  state.boss.hp = 100;
  Game.step(STEP);
  assert(state.boss.phase === 2, 'boss enters phase 2 at two thirds health');
  state.boss.hp = 40;
  Game.step(STEP);
  assert(state.boss.phase === 3, 'boss enters phase 3 at one third health');

  Game.killEnemy(state.boss);
  assert(state.screen === 'victory', 'killing the boss wins the game');
  assert(state.score >= 5000, 'boss awards its 5000 point bounty');
}

console.log('\nDamage and death');
{
  freshGame();
  Game.damagePlayer(10);
  assert(state.player.hp === 90, 'damage reduces health');
  Game.damagePlayer(10);
  assert(state.player.hp === 90, 'invulnerability window blocks chained damage');

  state.player.invuln = 0;
  state.player.hp = 5;
  Game.damagePlayer(10);
  assert(state.player.hp === 0, 'health floors at zero');
  assert(state.screen === 'gameOver', 'zero health ends the game');
}

console.log('\nEnemy bullets and pickups');
{
  freshGame();
  state.player.invuln = 0;
  state.bullets.push({
    x: state.player.x, y: state.player.y, vx: 0, vy: 0,
    r: 4, damage: 6, friendly: false, life: 1,
  });
  Game.step(STEP);
  assert(state.player.hp === 94, 'enemy bullet damages the player');

  freshGame();
  state.player.hp = 90;
  state.pickups.push({
    type: 'health', x: state.player.x, y: state.player.y, r: 12, life: 10, bob: 0,
  });
  Game.step(STEP);
  assert(state.player.hp === 100, 'health pickup heals but never overheals');
  assert(state.pickups.length === 0, 'pickup is consumed on contact');
}

console.log('\nScoring');
{
  freshGame();
  const before = state.score;
  Game.spawnEnemy('grunt');
  const grunt = state.enemies[state.enemies.length - 1];
  Game.killEnemy(grunt);
  assert(state.score === before + 100, 'grunt awards 100 points');
  assert(!state.enemies.includes(grunt), 'dead enemy is removed');

  const scoreBefore = state.score;
  assert(scoreBefore >= before, 'score never decreases');
}

console.log('\nPause');
{
  freshGame();
  const x = state.player.x;
  const y = state.player.y;
  const time = state.time;
  Game.pauseGame();
  Game.step(STEP);
  assert(state.screen === 'paused', 'pause changes the screen');
  assert(state.player.x === x && state.player.y === y, 'pause freezes player position');
  assert(state.time === time, 'pause freezes simulation time');
  Game.resumeGame();
  assert(state.screen === 'playing', 'resume returns to play');
}

console.log('\nPersistence');
{
  freshGame();
  state.highScore = 4321;
  state.bestLevel = 4;
  state.muted = true;
  Game.saveState();

  state.highScore = 0;
  state.bestLevel = 1;
  state.muted = false;
  Game.loadSaved();
  assert(state.highScore === 4321, 'high score round-trips');
  assert(state.bestLevel === 4, 'best level round-trips');
  assert(state.muted === true, 'mute setting round-trips');

  storage.set(SAVE_KEY, '{not json');
  Game.loadSaved();
  assert(state.highScore === 4321, 'malformed save data is ignored');

  storage.set(SAVE_KEY, JSON.stringify({ highScore: -5, bestLevel: 99, muted: 'yes' }));
  Game.loadSaved();
  assert(state.highScore === 4321, 'negative high score is rejected');
  assert(state.bestLevel === 6, 'best level is clamped to the level count');
  assert(state.muted === true, 'non-boolean mute value is ignored');
}

console.log('\nSoak');
{
  freshGame();
  Game.beginLevel(5);
  Game.spawnBoss();
  ['grunt', 'rusher', 'shooter', 'tank'].forEach((type) => Game.spawnEnemy(type));
  state.enemies.forEach((enemy) => {
    enemy.spawnTimer = 0;
  });
  state.player.invuln = 1e9;
  Game.input.mouse.down = true;

  let threw = false;
  try {
    for (let index = 0; index < 3000; index += 1) {
      if (index % 7 === 0) {
        Game.input.mouse.x = 100 + Math.random() * 760;
        Game.input.mouse.y = 100 + Math.random() * 340;
      }
      Game.step(STEP);
    }
  } catch (error) {
    threw = true;
    console.error(error);
  }

  Game.input.mouse.down = false;
  assert(!threw, '3000-step soak across all AI paths runs without throwing');
  assert(Number.isFinite(state.score) && state.score >= 0, 'score stays finite and non-negative');
}

console.log('\nRendering');
{
  freshGame();
  let threw = false;
  try {
    Game.render();
  } catch (error) {
    threw = true;
    console.error(error);
  }
  assert(!threw, 'render runs without throwing');

  const sprite = Sprites.validate();
  assert(sprite.ok, `sprite definitions are valid (${sprite.errors.join('; ') || 'no errors'})`);
}

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
