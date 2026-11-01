'use strict';

/*
 * GRIDFIRE — game state machine, fixed-step simulation, input, rendering and UI.
 * Pure helpers live in levels.js; sprite art lives in sprites.js; sound in audio.js.
 */

const WIDTH = Levels.WIDTH;
const HEIGHT = Levels.HEIGHT;
const STEP = 1 / 60;
const SAVE_KEY = 'top-down-shooter:v1';

const PLAYER_SPEED = 240;
const PLAYER_RADIUS = 14;
const PLAYER_MAX_HP = 100;
const FIRE_COOLDOWN = 0.18;
const RAPID_COOLDOWN = 0.09;
const BULLET_SPEED = 720;
const BULLET_RADIUS = 3;
const BULLET_LIFE = 1.4;
const POWERUP_TIME = 8;
const PICKUP_LIFE = 12;
const INTER_WAVE_DELAY = 1.2;
const MAX_PARTICLES = 500;

const ENEMY_COLORS = {
  grunt: '#a855f7',
  rusher: '#ef4444',
  shooter: '#22c55e',
  tank: '#f59e0b',
  boss: '#f43f5e',
};

const PICKUP_SPRITES = {
  health: 'pickup-health',
  rapid: 'pickup-rapid',
  spread: 'pickup-spread',
};

const MOVE_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
]);

/* ------------------------------------------------------------------ */
/* DOM                                                                 */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const hud = document.getElementById('hud');
const hpBar = document.getElementById('hp-bar');
const hpFill = document.getElementById('hp-fill');
const hpText = document.getElementById('hp-text');
const hudLevel = document.getElementById('hud-level');
const hudWave = document.getElementById('hud-wave');
const hudScore = document.getElementById('hud-score');
const hudPowerup = document.getElementById('hud-powerup');
const hudPowerupLabel = document.getElementById('hud-powerup-label');
const bossBar = document.getElementById('boss-bar');
const bossFill = document.getElementById('boss-fill');
const bossName = document.getElementById('boss-name');
const srStatus = document.getElementById('sr-status');

const screens = {
  menu: document.getElementById('screen-menu'),
  paused: document.getElementById('screen-pause'),
  levelComplete: document.getElementById('screen-level'),
  gameOver: document.getElementById('screen-gameover'),
  victory: document.getElementById('screen-victory'),
};

const btnPlay = document.getElementById('btn-play');
const btnMute = document.getElementById('btn-mute');
const btnMutePause = document.getElementById('btn-mute-pause');
const btnResume = document.getElementById('btn-resume');
const btnRestart = document.getElementById('btn-restart');
const btnQuit = document.getElementById('btn-quit');
const btnContinue = document.getElementById('btn-continue');
const btnRetry = document.getElementById('btn-retry');
const btnMenu = document.getElementById('btn-menu');
const btnAgain = document.getElementById('btn-again');
const btnVictoryMenu = document.getElementById('btn-victory-menu');
const btnPause = document.getElementById('btn-pause');
const menuHighScore = document.getElementById('menu-high-score');
const levelSummary = document.getElementById('level-summary');
const finalScore = document.getElementById('final-score');
const victoryScore = document.getElementById('victory-score');

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const state = {
  screen: 'menu',
  levelIndex: 0,
  waveIndex: 0,
  score: 0,
  highScore: 0,
  bestLevel: 1,
  muted: false,
  player: null,
  enemies: [],
  bullets: [],
  pickups: [],
  particles: [],
  boss: null,
  wave: null,
  nextAction: null,
  waveBreak: 0,
  bossSpawned: false,
  shake: 0,
  reducedMotion: false,
  time: 0,
  accumulator: 0,
  lastTime: 0,
};

const input = {
  keys: new Set(),
  mouse: { x: WIDTH / 2 + 120, y: HEIGHT / 2, down: false },
};

let arenaCache = null;

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

function clamp(value, min, max) {
  return Levels.clamp(value, min, max);
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function now() {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

function announce(message) {
  if (srStatus) srStatus.textContent = message;
}

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

function loadSaved() {
  let data = null;

  try {
    data = JSON.parse(window.localStorage.getItem(SAVE_KEY) ?? 'null');
  } catch {
    data = null;
  }

  if (data && typeof data === 'object') {
    if (Number.isFinite(data.highScore) && data.highScore >= 0) {
      state.highScore = Math.floor(data.highScore);
    }
    if (Number.isFinite(data.bestLevel) && data.bestLevel >= 1) {
      state.bestLevel = clamp(Math.floor(data.bestLevel), 1, Levels.LEVELS.length);
    }
    if (typeof data.muted === 'boolean') {
      state.muted = data.muted;
    }
  }

  Sfx.setMuted(state.muted);
  updateMuteUI();
}

function saveState() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      highScore: state.highScore,
      bestLevel: state.bestLevel,
      muted: state.muted,
    }));
  } catch {
    /* Storage unavailable — play on without persistence. */
  }
}

function recordResult() {
  if (state.score > state.highScore) state.highScore = state.score;
  state.bestLevel = Math.max(state.bestLevel, state.levelIndex + 1);
  saveState();
}

/* ------------------------------------------------------------------ */
/* Screens and HUD                                                     */
/* ------------------------------------------------------------------ */

function setScreen(name) {
  state.screen = name;

  for (const [key, node] of Object.entries(screens)) {
    if (node) node.hidden = key !== name;
  }

  if (hud) hud.hidden = name !== 'playing';
  canvas.style.cursor = name === 'playing' ? 'none' : 'default';

  if (name !== 'playing' && bossBar) bossBar.hidden = true;
  if (name === 'menu') updateMenu();

  if (name === 'playing') {
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
    if (canvas.focus) canvas.focus();
  } else {
    const focusTarget = {
      menu: btnPlay,
      paused: btnResume,
      levelComplete: btnContinue,
      gameOver: btnRetry,
      victory: btnAgain,
    }[name];
    if (focusTarget && focusTarget.focus) focusTarget.focus();
  }
}

function updateMenu() {
  if (menuHighScore) menuHighScore.textContent = String(state.highScore);
}

function updateMuteUI() {
  Sfx.setMuted(state.muted);
  const label = state.muted ? 'SOUND: OFF' : 'SOUND: ON';
  for (const button of [btnMute, btnMutePause]) {
    if (!button) continue;
    button.textContent = label;
    button.setAttribute('aria-pressed', String(state.muted));
  }
}

function toggleMute() {
  state.muted = !state.muted;
  updateMuteUI();
  saveState();
  if (!state.muted) Sfx.play('pickup');
}

function updateHUD() {
  const player = state.player;

  if (player) {
    const percent = Math.max(0, Math.round((player.hp / player.maxHp) * 100));
    if (hpFill) {
      hpFill.style.width = `${percent}%`;
      hpFill.style.backgroundColor = percent > 60 ? '#34d399' : percent > 30 ? '#fbbf24' : '#f43f5e';
    }
    if (hpBar) hpBar.setAttribute('aria-valuenow', String(percent));
    if (hpText) hpText.textContent = String(Math.max(0, Math.ceil(player.hp)));
  }

  const level = Levels.LEVELS[state.levelIndex];
  if (hudLevel) hudLevel.textContent = `LVL ${state.levelIndex + 1}/${Levels.LEVELS.length}`;
  if (hudWave) {
    hudWave.textContent = `WAVE ${Math.min(state.waveIndex + 1, level.waves.length)}/${level.waves.length}`;
  }
  if (hudScore) hudScore.textContent = String(state.score);

  if (hudPowerup && hudPowerupLabel && player) {
    const active = [];
    if (player.power.rapid > 0) active.push(`RAPID ${Math.ceil(player.power.rapid)}s`);
    if (player.power.spread > 0) active.push(`SPREAD ${Math.ceil(player.power.spread)}s`);
    hudPowerup.hidden = active.length === 0;
    hudPowerupLabel.textContent = active.join(' · ');
  }

  if (bossBar && bossFill) {
    if (state.boss && state.screen === 'playing') {
      bossBar.hidden = false;
      bossFill.style.width = `${Math.max(0, (state.boss.hp / state.boss.maxHp) * 100)}%`;
    } else {
      bossBar.hidden = true;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Flow                                                                */
/* ------------------------------------------------------------------ */

function beginGame() {
  Sfx.unlock();
  state.score = 0;
  state.bestLevel = Math.max(state.bestLevel, 1);
  beginLevel(0);
}

function beginLevel(index) {
  state.levelIndex = clamp(index, 0, Levels.LEVELS.length - 1);
  state.waveIndex = 0;
  state.enemies = [];
  state.bullets = [];
  state.pickups = [];
  state.particles = [];
  state.boss = null;
  state.bossSpawned = false;
  state.wave = null;
  state.nextAction = null;
  state.waveBreak = 0;
  state.shake = 0;
  state.accumulator = 0;
  state.bestLevel = Math.max(state.bestLevel, state.levelIndex + 1);
  input.mouse.down = false;
  input.keys.clear();

  state.player = {
    x: WIDTH / 2,
    y: HEIGHT / 2,
    r: PLAYER_RADIUS,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    speed: PLAYER_SPEED,
    aim: 0,
    walk: 0,
    moving: false,
    fireTimer: 0,
    invuln: 0,
    power: { rapid: 0, spread: 0 },
  };

  saveState();
  startWave(0);
  setScreen('playing');
  updateHUD();
  announce(`Level ${state.levelIndex + 1}: ${Levels.LEVELS[state.levelIndex].name}`);
}

function startWave(index) {
  const level = Levels.LEVELS[state.levelIndex];
  const wave = level.waves[index];

  state.waveIndex = index;
  state.wave = {
    queue: Levels.buildWaveQueue(wave),
    interval: wave.interval,
    timer: 0.6,
    hpScale: wave.hpScale,
    speedScale: wave.speedScale,
  };
  state.nextAction = null;
  state.waveBreak = 0;

  updateHUD();
  announce(`Wave ${index + 1} of ${level.waves.length}`);
  Sfx.play('wave');
}

function checkWaveProgress(dt) {
  if (state.screen !== 'playing' || !state.wave) return;

  const level = Levels.LEVELS[state.levelIndex];

  if (!state.nextAction) {
    state.wave.timer -= dt;

    if (state.wave.queue.length > 0 && state.wave.timer <= 0) {
      spawnEnemy(state.wave.queue.shift());
      state.wave.timer = state.wave.interval;
    }

    if (state.wave.queue.length === 0 && state.enemies.length === 0) {
      if (state.waveIndex + 1 < level.waves.length) {
        state.nextAction = 'wave';
        state.waveBreak = INTER_WAVE_DELAY;
      } else if (level.boss && !state.bossSpawned) {
        state.nextAction = 'boss';
        state.waveBreak = 1.4;
      } else {
        state.nextAction = 'complete';
        state.waveBreak = 0.8;
      }
      announce('Wave cleared');
    }
    return;
  }

  state.waveBreak -= dt;
  if (state.waveBreak > 0) return;

  const action = state.nextAction;
  state.nextAction = null;

  if (action === 'wave') {
    startWave(state.waveIndex + 1);
  } else if (action === 'boss') {
    spawnBoss();
  } else if (action === 'complete') {
    completeLevel();
  }
}

function completeLevel() {
  const bonus = 500 * (state.levelIndex + 1);
  state.score += bonus;
  recordResult();

  if (levelSummary) {
    levelSummary.textContent = `SECTOR ${state.levelIndex + 1} CLEAR · +${bonus} PTS`;
  }
  setScreen('levelComplete');
  Sfx.play('levelClear');
  announce(`Level ${state.levelIndex + 1} complete. Bonus ${bonus} points`);
}

function gameOver() {
  input.mouse.down = false;
  input.keys.clear();
  recordResult();
  if (finalScore) finalScore.textContent = String(state.score);
  setScreen('gameOver');
  Sfx.play('gameOver');
  announce(`Game over. Score ${state.score}`);
}

function victory() {
  input.mouse.down = false;
  recordResult();
  if (victoryScore) victoryScore.textContent = String(state.score);
  setScreen('victory');
  Sfx.play('victory');
  announce(`Victory! Final score ${state.score}`);
}

function pauseGame() {
  if (state.screen !== 'playing') return;
  input.mouse.down = false;
  input.keys.clear();
  setScreen('paused');
  announce('Paused');
}

function resumeGame() {
  if (state.screen !== 'paused') return;
  Sfx.unlock();
  setScreen('playing');
  announce('Resumed');
}

function returnToMenu() {
  input.mouse.down = false;
  input.keys.clear();
  state.player = null;
  state.enemies = [];
  state.bullets = [];
  state.pickups = [];
  state.particles = [];
  state.boss = null;
  state.wave = null;
  state.nextAction = null;
  setScreen('menu');
}

/* ------------------------------------------------------------------ */
/* Enemies                                                             */
/* ------------------------------------------------------------------ */

function createEnemy(type, point, scales = null) {
  const def = Levels.ENEMY_TYPES[type];
  const hpScale = scales ? scales.hpScale : (state.wave ? state.wave.hpScale : 1);
  const speedScale = scales ? scales.speedScale : (state.wave ? state.wave.speedScale : 1);
  const hp = Math.max(1, Math.round(def.hp * hpScale));
  const spawnDuration = type === 'boss' ? 1.2 : 0.55;

  return {
    type,
    sprite: def.sprite,
    x: point.x,
    y: point.y,
    r: def.radius,
    hp,
    maxHp: hp,
    speed: def.speed * speedScale,
    contactDamage: def.contactDamage,
    score: def.score,
    angle: 0,
    flash: 0,
    hitCooldown: 0,
    spawnTimer: spawnDuration,
    spawnDuration,
    aiState: 'seek',
    aiTimer: type === 'rusher' ? rand(0.6, 1.4) : 0,
    fireTimer: def.fireInterval ? rand(0.5, 1.2) : 0,
    strafeSign: Math.random() < 0.5 ? -1 : 1,
    variant: Levels.variantFor(state.levelIndex, type),
    phase: 1,
    attackTimer: 1.8,
    spiralAngle: 0,
    summonTimer: 6,
    dashTimer: 0,
    dashAngle: 0,
  };
}

function spawnEnemy(type) {
  if (!state.player) return;
  const point = Levels.chooseSpawnPoint(state.player, Math.random);
  state.enemies.push(createEnemy(type, point));
}

function spawnBoss() {
  const point = Levels.chooseSpawnPoint(state.player, Math.random, { minDistance: 260 });
  const boss = createEnemy('boss', point, { hpScale: 1, speedScale: 1 });

  state.bossSpawned = true;
  state.boss = boss;
  state.enemies.push(boss);
  state.shake = 10;
  if (bossName) bossName.textContent = Levels.LEVELS[Levels.LEVELS.length - 1].name;
  announce('The Overlord has arrived');
  Sfx.play('bossWarn');
}

function moveEnemy(enemy, nx, ny, speed, dt) {
  enemy.x = clamp(enemy.x + nx * speed * dt, Levels.ARENA_MARGIN, WIDTH - Levels.ARENA_MARGIN);
  enemy.y = clamp(enemy.y + ny * speed * dt, Levels.ARENA_MARGIN, HEIGHT - Levels.ARENA_MARGIN);
  enemy.angle = Math.atan2(ny, nx);
}

function updateRusher(enemy, dt, nx, ny) {
  enemy.aiTimer -= dt;

  if (enemy.aiState === 'seek') {
    moveEnemy(enemy, nx, ny, enemy.speed, dt);
    if (enemy.aiTimer <= 0) {
      enemy.aiState = 'wind';
      enemy.aiTimer = 0.45;
      enemy.angle = Math.atan2(ny, nx);
    }
    return;
  }

  if (enemy.aiState === 'wind') {
    enemy.flash = Math.max(enemy.flash, 0.6);
    if (enemy.aiTimer <= 0) {
      enemy.aiState = 'dash';
      enemy.aiTimer = 0.35;
      enemy.dashAngle = enemy.angle;
    }
    return;
  }

  moveEnemy(enemy, Math.cos(enemy.dashAngle), Math.sin(enemy.dashAngle), enemy.speed * 3, dt);
  enemy.angle = enemy.dashAngle;
  if (enemy.aiTimer <= 0) {
    enemy.aiState = 'seek';
    enemy.aiTimer = rand(0.7, 1.3);
  }
}

function updateShooter(enemy, dt, nx, ny, distance) {
  const def = Levels.ENEMY_TYPES.shooter;

  if (distance > 300) {
    moveEnemy(enemy, nx, ny, enemy.speed, dt);
  } else if (distance < 210) {
    moveEnemy(enemy, -nx, -ny, enemy.speed, dt);
  } else {
    moveEnemy(enemy, -ny * enemy.strafeSign, nx * enemy.strafeSign, enemy.speed * 0.6, dt);
  }

  enemy.angle = Math.atan2(ny, nx);
  enemy.fireTimer -= dt;

  if (enemy.fireTimer <= 0) {
    fireEnemyBullet(enemy, enemy.angle, def.bulletSpeed, def.bulletDamage);
    enemy.fireTimer = def.fireInterval * rand(0.9, 1.25);
  }
}

function fireEnemyBullet(enemy, angle, speed, damage) {
  const offset = enemy.r + 8;
  state.bullets.push({
    x: enemy.x + Math.cos(angle) * offset,
    y: enemy.y + Math.sin(angle) * offset,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: 4,
    damage,
    friendly: false,
    life: BULLET_LIFE * 1.6,
  });
}

function radialBurst(enemy, count, speed, damage) {
  for (let index = 0; index < count; index += 1) {
    fireEnemyBullet(enemy, (index / count) * Math.PI * 2, speed, damage);
  }
}

function spreadShot(enemy, angle, count, arc, speed, damage) {
  for (let index = 0; index < count; index += 1) {
    const offset = (index - (count - 1) / 2) * arc;
    fireEnemyBullet(enemy, angle + offset, speed, damage);
  }
}

function updateBoss(enemy, dt, nx, ny, distance) {
  const def = Levels.ENEMY_TYPES.boss;
  const phase = Levels.bossPhase(enemy.hp, enemy.maxHp);

  if (phase !== enemy.phase) {
    enemy.phase = phase;
    enemy.attackTimer = 0.9;
    enemy.summonTimer = 3;
    state.shake = 12;
    announce(`Overlord phase ${phase}`);
    Sfx.play('bossWarn');
  }

  if (enemy.dashTimer > 0) {
    enemy.dashTimer -= dt;
    moveEnemy(enemy, Math.cos(enemy.dashAngle), Math.sin(enemy.dashAngle), 380, dt);
    enemy.angle = enemy.dashAngle;
  } else {
    enemy.angle = Math.atan2(ny, nx);
    const drift = phase === 3 ? 0.9 : phase === 2 ? 0.7 : 0.5;
    moveEnemy(enemy, nx, ny, enemy.speed * drift, dt);
  }

  enemy.attackTimer -= dt;

  if (phase === 1) {
    if (enemy.attackTimer <= 0) {
      radialBurst(enemy, 10, def.bulletSpeed, def.bulletDamage);
      enemy.attackTimer = 2.4;
    }
    return;
  }

  if (phase === 2) {
    if (enemy.attackTimer <= 0) {
      spreadShot(enemy, Math.atan2(ny, nx), 3, 0.26, def.bulletSpeed, def.bulletDamage);
      enemy.attackTimer = 1.5;
      if (distance > 130 && Math.random() < 0.45) {
        enemy.dashTimer = 0.4;
        enemy.dashAngle = Math.atan2(ny, nx);
      }
    }
    return;
  }

  if (enemy.attackTimer <= 0) {
    enemy.spiralAngle += 0.55;
    fireEnemyBullet(enemy, enemy.spiralAngle, def.bulletSpeed * 1.15, def.bulletDamage);
    enemy.attackTimer = 0.12;
  }

  enemy.summonTimer -= dt;
  if (enemy.summonTimer <= 0) {
    const liveAdds = state.enemies.filter((other) => other.type === 'grunt').length;
    if (liveAdds < 8) {
      for (let index = 0; index < 2; index += 1) {
        const point = Levels.chooseSpawnPoint(state.player, Math.random, { minDistance: 220 });
        state.enemies.push(createEnemy('grunt', point, { hpScale: 1, speedScale: 1 }));
      }
    }
    enemy.summonTimer = 6.5;
    Sfx.play('wave');
  }
}

function updateEnemies(dt) {
  const player = state.player;
  if (!player) return;

  for (let index = state.enemies.length - 1; index >= 0; index -= 1) {
    const enemy = state.enemies[index];
    if (!enemy) continue;

    if (enemy.spawnTimer > 0) {
      enemy.spawnTimer -= dt;
      continue;
    }

    enemy.flash = Math.max(0, enemy.flash - dt * 5);
    enemy.hitCooldown = Math.max(0, enemy.hitCooldown - dt);

    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const nx = dx / distance;
    const ny = dy / distance;

    if (enemy.type === 'grunt' || enemy.type === 'tank') {
      moveEnemy(enemy, nx, ny, enemy.speed, dt);
    } else if (enemy.type === 'rusher') {
      updateRusher(enemy, dt, nx, ny);
    } else if (enemy.type === 'shooter') {
      updateShooter(enemy, dt, nx, ny, distance);
    } else if (enemy.type === 'boss') {
      updateBoss(enemy, dt, nx, ny, distance);
    }

    if (enemy.contactDamage > 0 && enemy.hitCooldown <= 0 && Levels.circleHit(enemy, player)) {
      damagePlayer(enemy.contactDamage);
      enemy.hitCooldown = 0.9;
    }
  }
}

function hitEnemy(enemy, damage, x, y) {
  enemy.hp -= damage;
  enemy.flash = 1;
  Sfx.play('hit');
  spawnBurst(x, y, '#fef08a', 3, 90);
  if (enemy.hp <= 0) killEnemy(enemy);
}

function killEnemy(enemy) {
  const index = state.enemies.indexOf(enemy);
  if (index >= 0) state.enemies.splice(index, 1);

  state.score += enemy.score;
  state.shake = Math.min(14, state.shake + (enemy.type === 'boss' ? 14 : 2));
  spawnBurst(enemy.x, enemy.y, ENEMY_COLORS[enemy.type] || '#f87171',
    enemy.type === 'boss' ? 60 : 14,
    enemy.type === 'boss' ? 260 : 200);
  Sfx.play('enemyDeath');
  updateHUD();

  if (enemy.type === 'boss') {
    state.boss = null;
    if (bossBar) bossBar.hidden = true;
    state.enemies = [];
    victory();
    return;
  }

  maybeDropPickup(enemy);
}

/* ------------------------------------------------------------------ */
/* Player                                                              */
/* ------------------------------------------------------------------ */

function fire() {
  const player = state.player;
  if (!player) return;

  player.fireTimer = player.power.rapid > 0 ? RAPID_COOLDOWN : FIRE_COOLDOWN;

  const angles = player.power.spread > 0
    ? [player.aim - 0.21, player.aim, player.aim + 0.21]
    : [player.aim];

  for (const angle of angles) {
    const offset = player.r + 12;
    state.bullets.push({
      x: player.x + Math.cos(angle) * offset,
      y: player.y + Math.sin(angle) * offset,
      vx: Math.cos(angle) * BULLET_SPEED,
      vy: Math.sin(angle) * BULLET_SPEED,
      r: BULLET_RADIUS,
      damage: 1,
      friendly: true,
      life: BULLET_LIFE,
    });

    addParticle({
      x: player.x + Math.cos(angle) * (offset + 4),
      y: player.y + Math.sin(angle) * (offset + 4),
      vx: 0,
      vy: 0,
      life: 0.06,
      maxLife: 0.06,
      size: 10,
      angle,
      color: '#fef9c3',
      kind: 'muzzle',
    });
  }

  state.shake = Math.min(3, state.shake + 0.7);
  Sfx.play('shoot');
}

function updatePlayer(dt) {
  const player = state.player;
  if (!player) return;

  let dx = 0;
  let dy = 0;
  if (input.keys.has('ArrowLeft') || input.keys.has('KeyA')) dx -= 1;
  if (input.keys.has('ArrowRight') || input.keys.has('KeyD')) dx += 1;
  if (input.keys.has('ArrowUp') || input.keys.has('KeyW')) dy -= 1;
  if (input.keys.has('ArrowDown') || input.keys.has('KeyS')) dy += 1;

  player.moving = dx !== 0 || dy !== 0;

  if (player.moving) {
    const length = Math.hypot(dx, dy);
    dx /= length;
    dy /= length;
    player.walk += dt * 11;
    player.x = clamp(player.x + dx * player.speed * dt, player.r, WIDTH - player.r);
    player.y = clamp(player.y + dy * player.speed * dt, player.r, HEIGHT - player.r);
  }

  player.aim = Math.atan2(input.mouse.y - player.y, input.mouse.x - player.x);
  player.invuln = Math.max(0, player.invuln - dt);
  player.fireTimer = Math.max(0, player.fireTimer - dt);
  player.power.rapid = Math.max(0, player.power.rapid - dt);
  player.power.spread = Math.max(0, player.power.spread - dt);

  if (input.mouse.down && player.fireTimer <= 0) fire();
}

function damagePlayer(amount) {
  const player = state.player;
  if (!player || state.screen !== 'playing' || player.invuln > 0) return;

  player.hp -= amount;
  player.invuln = 0.7;
  state.shake = Math.min(12, state.shake + 6);
  spawnBurst(player.x, player.y, '#f43f5e', 10, 150);
  Sfx.play('playerHit');
  updateHUD();

  if (player.hp <= 0) {
    player.hp = 0;
    gameOver();
  }
}

/* ------------------------------------------------------------------ */
/* Bullets, pickups, particles                                         */
/* ------------------------------------------------------------------ */

function updateBullets(dt) {
  for (let index = state.bullets.length - 1; index >= 0; index -= 1) {
    const bullet = state.bullets[index];

    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;

    if (bullet.life <= 0 || bullet.x < -30 || bullet.x > WIDTH + 30 || bullet.y < -30 || bullet.y > HEIGHT + 30) {
      state.bullets.splice(index, 1);
      continue;
    }

    if (bullet.friendly) {
      let consumed = false;
      for (let enemyIndex = state.enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
        const enemy = state.enemies[enemyIndex];
        if (enemy.spawnTimer > 0) continue;
        if (Levels.circleHit(bullet, enemy)) {
          state.bullets.splice(index, 1);
          hitEnemy(enemy, bullet.damage, bullet.x, bullet.y);
          consumed = true;
          break;
        }
      }
      if (consumed) continue;
    } else if (state.player && state.player.invuln <= 0 && Levels.circleHit(bullet, state.player)) {
      state.bullets.splice(index, 1);
      damagePlayer(bullet.damage);
    }
  }
}

function maybeDropPickup(enemy) {
  if (Math.random() > 0.12) return;

  const roll = Math.random();
  const type = roll < 0.5 ? 'health' : roll < 0.75 ? 'rapid' : 'spread';

  state.pickups.push({
    type,
    x: enemy.x,
    y: enemy.y,
    r: 12,
    life: PICKUP_LIFE,
    bob: Math.random() * Math.PI * 2,
  });
}

function updatePickups(dt) {
  const player = state.player;

  for (let index = state.pickups.length - 1; index >= 0; index -= 1) {
    const pickup = state.pickups[index];
    pickup.life -= dt;
    pickup.bob += dt * 4;

    if (pickup.life <= 0) {
      state.pickups.splice(index, 1);
      continue;
    }

    if (player && Levels.circleHit(pickup, player)) {
      applyPickup(pickup.type);
      state.pickups.splice(index, 1);
    }
  }
}

function applyPickup(type) {
  const player = state.player;
  if (!player) return;

  if (type === 'health') {
    player.hp = Math.min(player.maxHp, player.hp + 25);
  } else if (type === 'rapid') {
    player.power.rapid = POWERUP_TIME;
  } else if (type === 'spread') {
    player.power.spread = POWERUP_TIME;
  }

  Sfx.play('pickup');
  spawnBurst(player.x, player.y, '#34d399', 8, 100);
  announce(`${type} pickup`);
  updateHUD();
}

function addParticle(particle) {
  if (state.particles.length >= MAX_PARTICLES) {
    state.particles.shift();
  }
  state.particles.push(particle);
}

function spawnBurst(x, y, color, count, speed) {
  const amount = state.reducedMotion ? Math.ceil(count / 2) : count;
  for (let index = 0; index < amount; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = speed * (0.35 + Math.random() * 0.65);
    const life = rand(0.25, 0.6);
    addParticle({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life,
      maxLife: life,
      size: rand(2, 4),
      angle: 0,
      color,
      kind: 'spark',
    });
  }
}

function updateParticles(dt) {
  for (let index = state.particles.length - 1; index >= 0; index -= 1) {
    const particle = state.particles[index];
    particle.life -= dt;

    if (particle.life <= 0) {
      state.particles.splice(index, 1);
      continue;
    }

    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.94;
    particle.vy *= 0.94;
  }
}

/* ------------------------------------------------------------------ */
/* Simulation step                                                     */
/* ------------------------------------------------------------------ */

function step(dt, force = false) {
  if (!force && state.screen !== 'playing') return;

  state.time += dt;
  state.shake = Math.max(0, state.shake - dt * 25);

  updatePlayer(dt);
  updateEnemies(dt);
  updateBullets(dt);
  updatePickups(dt);
  updateParticles(dt);
  checkWaveProgress(dt);

  if (state.screen === 'playing') updateHUD();
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function buildArenaCache() {
  const cache = document.createElement('canvas');
  cache.width = WIDTH;
  cache.height = HEIGHT;
  const g = cache.getContext('2d');

  const gradient = g.createRadialGradient(WIDTH / 2, HEIGHT / 2, 80, WIDTH / 2, HEIGHT / 2, 620);
  gradient.addColorStop(0, '#0b1324');
  gradient.addColorStop(1, '#04060d');
  g.fillStyle = gradient;
  g.fillRect(0, 0, WIDTH, HEIGHT);

  g.strokeStyle = 'rgba(56, 189, 248, 0.07)';
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= WIDTH; x += 48) {
    g.moveTo(x + 0.5, 0);
    g.lineTo(x + 0.5, HEIGHT);
  }
  for (let y = 0; y <= HEIGHT; y += 48) {
    g.moveTo(0, y + 0.5);
    g.lineTo(WIDTH, y + 0.5);
  }
  g.stroke();

  g.strokeStyle = 'rgba(56, 189, 248, 0.35)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, WIDTH - 2, HEIGHT - 2);

  return cache;
}

function drawSpawnWarning(enemy) {
  const progress = 1 - enemy.spawnTimer / enemy.spawnDuration;
  const radius = enemy.r + 16 * (1 - progress);

  ctx.save();
  ctx.strokeStyle = `rgba(244, 114, 182, ${0.25 + progress * 0.6})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = `rgba(244, 114, 182, ${0.1 + progress * 0.2})`;
  ctx.beginPath();
  ctx.arc(enemy.x, enemy.y, Math.max(1, radius * progress), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  const player = state.player;
  if (!player) return;

  const blink = player.invuln > 0 && Math.floor(state.time * 20) % 2 === 0;
  const bob = player.moving ? Math.sin(player.walk * 2) * 1.5 : Math.sin(state.time * 3) * 0.8;
  const squash = player.moving ? 1 + Math.sin(player.walk * 4) * 0.04 : 1;

  Sprites.draw(ctx, 'player', player.x, player.y + bob, player.aim, {
    alpha: blink ? 0.45 : 1,
    squashY: squash,
  });
}

function render() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);

  if (arenaCache) {
    ctx.drawImage(arenaCache, 0, 0);
  } else {
    ctx.fillStyle = '#070b16';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  const shakeMag = state.reducedMotion ? 0 : Math.min(10, state.shake);
  const offsetX = shakeMag > 0 ? (Math.random() - 0.5) * shakeMag : 0;
  const offsetY = shakeMag > 0 ? (Math.random() - 0.5) * shakeMag : 0;

  ctx.save();
  ctx.translate(offsetX, offsetY);

  for (const pickup of state.pickups) {
    const remaining = pickup.life;
    const fade = remaining < 3 ? 0.4 + 0.6 * Math.abs(Math.sin(state.time * 10)) : 1;
    const bob = Math.sin(pickup.bob) * 3;
    Sprites.draw(ctx, PICKUP_SPRITES[pickup.type], pickup.x, pickup.y + bob, 0, { alpha: fade });
  }

  for (const enemy of state.enemies) {
    if (enemy.spawnTimer > 0) {
      drawSpawnWarning(enemy);
      continue;
    }

    const bob = Math.sin(state.time * 10 + enemy.x * 0.05) * 1.2;
    Sprites.draw(ctx, enemy.sprite, enemy.x, enemy.y + bob, enemy.angle, {
      variant: enemy.variant,
      flash: enemy.flash,
      scale: enemy.type === 'boss' ? 1.4 : 1,
    });
  }

  for (const bullet of state.bullets) {
    ctx.save();
    ctx.fillStyle = bullet.friendly ? '#e0f2fe' : '#fda4af';
    ctx.shadowColor = bullet.friendly ? '#38bdf8' : '#f43f5e';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawPlayer();

  for (const particle of state.particles) {
    const alpha = Math.max(0, Math.min(1, particle.life / particle.maxLife));
    if (particle.kind === 'muzzle') {
      Sprites.draw(ctx, 'muzzle', particle.x, particle.y, particle.angle, { alpha, scale: 1.3 });
    } else {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
      ctx.globalAlpha = 1;
    }
  }

  ctx.restore();

  if (state.screen === 'playing') drawCrosshair();
}

function drawCrosshair() {
  const { x, y } = input.mouse;

  ctx.save();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.moveTo(x - 14, y);
  ctx.lineTo(x - 5, y);
  ctx.moveTo(x + 5, y);
  ctx.lineTo(x + 14, y);
  ctx.moveTo(x, y - 14);
  ctx.lineTo(x, y - 5);
  ctx.moveTo(x, y + 5);
  ctx.lineTo(x, y + 14);
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Loop                                                                */
/* ------------------------------------------------------------------ */

function tick(dt) {
  if (state.screen !== 'playing') return;
  state.accumulator += dt;
  let steps = 0;
  while (state.accumulator >= STEP && steps < 5) {
    step(STEP);
    state.accumulator -= STEP;
    steps += 1;
  }
  if (steps === 5) state.accumulator = 0;
}

function frame(timestamp) {
  const delta = Math.min(0.1, Math.max(0, (timestamp - state.lastTime) / 1000));
  state.lastTime = timestamp;

  tick(delta);
  render();

  window.requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ */
/* Input + wiring                                                      */
/* ------------------------------------------------------------------ */

function updatePointer(event) {
  const rect = canvas.getBoundingClientRect();
  const rectWidth = rect.width || WIDTH;
  const rectHeight = rect.height || HEIGHT;

  input.mouse.x = clamp((event.clientX - rect.left) * (WIDTH / rectWidth), 0, WIDTH);
  input.mouse.y = clamp((event.clientY - rect.top) * (HEIGHT / rectHeight), 0, HEIGHT);
}

function bindInput() {
  window.addEventListener('keydown', (event) => {
    if (MOVE_KEYS.has(event.code)) {
      if (state.screen === 'playing' || state.screen === 'paused') event.preventDefault();
      input.keys.add(event.code);
      return;
    }

    if (event.code === 'Escape' || event.code === 'KeyP') {
      event.preventDefault();
      if (state.screen === 'playing') pauseGame();
      else if (state.screen === 'paused') resumeGame();
      return;
    }

    if (event.code === 'KeyM') {
      toggleMute();
      return;
    }

    if (event.code === 'Enter' || event.code === 'Space') {
      if (state.screen === 'menu') {
        event.preventDefault();
        beginGame();
      } else if (state.screen === 'gameOver' || state.screen === 'victory') {
        event.preventDefault();
        beginGame();
      } else if (state.screen === 'levelComplete') {
        event.preventDefault();
        beginLevel(state.levelIndex + 1);
      }
    }
  });

  window.addEventListener('keyup', (event) => {
    input.keys.delete(event.code);
  });

  canvas.addEventListener('mousemove', updatePointer);

  canvas.addEventListener('mousedown', (event) => {
    if (state.screen !== 'playing' || event.button !== 0) return;
    event.preventDefault();
    updatePointer(event);
    Sfx.unlock();
    input.mouse.down = true;
  });

  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) input.mouse.down = false;
  });

  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });

  window.addEventListener('blur', () => {
    input.mouse.down = false;
    input.keys.clear();
    if (state.screen === 'playing') pauseGame();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.screen === 'playing') pauseGame();
  });
}

function bindUI() {
  btnPlay.addEventListener('click', beginGame);
  btnResume.addEventListener('click', resumeGame);
  btnRestart.addEventListener('click', () => beginLevel(state.levelIndex));
  btnQuit.addEventListener('click', returnToMenu);
  btnContinue.addEventListener('click', () => beginLevel(state.levelIndex + 1));
  btnRetry.addEventListener('click', beginGame);
  btnMenu.addEventListener('click', returnToMenu);
  btnAgain.addEventListener('click', beginGame);
  btnVictoryMenu.addEventListener('click', returnToMenu);
  btnPause.addEventListener('click', pauseGame);
  btnMute.addEventListener('click', toggleMute);
  btnMutePause.addEventListener('click', toggleMute);
}

function detectReducedMotion() {
  try {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    state.reducedMotion = Boolean(query.matches);
    if (query.addEventListener) {
      query.addEventListener('change', (event) => {
        state.reducedMotion = Boolean(event.matches);
      });
    }
  } catch {
    state.reducedMotion = false;
  }
}

function boot() {
  arenaCache = buildArenaCache();
  loadSaved();
  detectReducedMotion();
  updateMuteUI();
  updateMenu();
  bindUI();
  bindInput();
  setScreen('menu');

  state.lastTime = now();
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(frame);
  }
}

/* ------------------------------------------------------------------ */
/* Test hooks + start                                                  */
/* ------------------------------------------------------------------ */

const Game = {
  state,
  input,
  step,
  tick,
  render,
  beginGame,
  beginLevel,
  startWave,
  spawnEnemy,
  spawnBoss,
  killEnemy,
  damagePlayer,
  pauseGame,
  resumeGame,
  returnToMenu,
  setScreen,
  updateHUD,
  saveState,
  loadSaved,
  recordResult,
};

if (typeof window !== 'undefined') {
  window.Game = Game;
  boot();
}
