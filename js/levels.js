'use strict';

/*
 * Level data + pure helpers shared by the game and the tests.
 * Nothing in here touches the DOM, so it can be loaded on its own in Node.
 */
const Levels = (() => {
  const WIDTH = 960;
  const HEIGHT = 540;
  const ARENA_MARGIN = 40;
  const MIN_SPAWN_DISTANCE = 200;

  const ENEMY_TYPES = {
    grunt: {
      hp: 2, speed: 58, radius: 15, contactDamage: 8, score: 100, sprite: 'grunt',
    },
    rusher: {
      hp: 1, speed: 150, radius: 13, contactDamage: 12, score: 150, sprite: 'rusher',
    },
    shooter: {
      hp: 2, speed: 70, radius: 15, contactDamage: 0, score: 200, sprite: 'shooter',
      fireInterval: 1.5, bulletSpeed: 320, bulletDamage: 6,
    },
    tank: {
      hp: 8, speed: 38, radius: 22, contactDamage: 20, score: 400, sprite: 'tank',
    },
    boss: {
      hp: 150, speed: 55, radius: 34, contactDamage: 25, score: 5000, sprite: 'boss',
      bulletSpeed: 260, bulletDamage: 10,
    },
  };

  const LEVELS = [
    {
      name: 'OUTPOST',
      waves: [
        { types: { grunt: 4 }, interval: 0.95, hpScale: 1, speedScale: 1 },
        { types: { grunt: 5 }, interval: 0.85, hpScale: 1, speedScale: 1 },
        { types: { grunt: 6 }, interval: 0.75, hpScale: 1.05, speedScale: 1.05 },
      ],
    },
    {
      name: 'RUSH HOUR',
      waves: [
        { types: { grunt: 4, rusher: 1 }, interval: 0.85, hpScale: 1.05, speedScale: 1.05 },
        { types: { grunt: 3, rusher: 3 }, interval: 0.8, hpScale: 1.05, speedScale: 1.08 },
        { types: { rusher: 5 }, interval: 0.7, hpScale: 1.1, speedScale: 1.1 },
        { types: { grunt: 4, rusher: 3 }, interval: 0.7, hpScale: 1.1, speedScale: 1.12 },
      ],
    },
    {
      name: 'CROSSFIRE',
      waves: [
        { types: { grunt: 4, shooter: 1 }, interval: 0.85, hpScale: 1.1, speedScale: 1.1 },
        { types: { grunt: 3, rusher: 2, shooter: 2 }, interval: 0.8, hpScale: 1.12, speedScale: 1.12 },
        { types: { shooter: 4, grunt: 2 }, interval: 0.75, hpScale: 1.15, speedScale: 1.15 },
        { types: { rusher: 4, shooter: 2 }, interval: 0.7, hpScale: 1.18, speedScale: 1.15 },
        { types: { grunt: 4, shooter: 3, rusher: 2 }, interval: 0.65, hpScale: 1.2, speedScale: 1.18 },
      ],
    },
    {
      name: 'HEAVY METAL',
      waves: [
        { types: { grunt: 5, tank: 1 }, interval: 0.85, hpScale: 1.2, speedScale: 1.15 },
        { types: { rusher: 4, tank: 1 }, interval: 0.75, hpScale: 1.22, speedScale: 1.18 },
        { types: { grunt: 4, shooter: 2, tank: 2 }, interval: 0.75, hpScale: 1.25, speedScale: 1.18 },
        { types: { tank: 3, rusher: 4 }, interval: 0.7, hpScale: 1.28, speedScale: 1.2 },
        { types: { grunt: 5, shooter: 2, tank: 2, rusher: 3 }, interval: 0.65, hpScale: 1.3, speedScale: 1.22 },
      ],
    },
    {
      name: 'GAUNTLET',
      waves: [
        { types: { grunt: 6, rusher: 3 }, interval: 0.6, hpScale: 1.3, speedScale: 1.25 },
        { types: { shooter: 4, rusher: 4 }, interval: 0.6, hpScale: 1.33, speedScale: 1.25 },
        { types: { tank: 2, shooter: 3, grunt: 4 }, interval: 0.6, hpScale: 1.35, speedScale: 1.28 },
        { types: { rusher: 6, tank: 2 }, interval: 0.55, hpScale: 1.38, speedScale: 1.3 },
        { types: { grunt: 6, shooter: 4, tank: 2, rusher: 4 }, interval: 0.55, hpScale: 1.42, speedScale: 1.32 },
        { types: { grunt: 8, rusher: 6, shooter: 4, tank: 3 }, interval: 0.5, hpScale: 1.5, speedScale: 1.35 },
      ],
    },
    {
      name: 'OVERLORD',
      boss: true,
      waves: [
        { types: { grunt: 5, rusher: 2 }, interval: 0.8, hpScale: 1.3, speedScale: 1.2 },
        { types: { shooter: 3, grunt: 5, tank: 1 }, interval: 0.75, hpScale: 1.35, speedScale: 1.22 },
      ],
    },
  ];

  const VARIANTS = {
    grunt: 'toxic',
    rusher: 'pink',
    shooter: 'sour',
    tank: 'steel',
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function circleHit(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const radius = a.r + b.r;
    return dx * dx + dy * dy <= radius * radius;
  }

  function waveTotal(wave) {
    return Object.values(wave.types).reduce((sum, count) => sum + count, 0);
  }

  function buildWaveQueue(wave, rng = Math.random) {
    const queue = [];
    for (const [type, count] of Object.entries(wave.types)) {
      for (let index = 0; index < count; index += 1) queue.push(type);
    }
    for (let index = queue.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(rng() * (index + 1));
      const temp = queue[index];
      queue[index] = queue[swap];
      queue[swap] = temp;
    }
    return queue;
  }

  function chooseSpawnPoint(player, rng = Math.random, options = {}) {
    const margin = options.margin ?? ARENA_MARGIN;
    const minDistance = options.minDistance ?? MIN_SPAWN_DISTANCE;

    for (let attempt = 0; attempt < 24; attempt += 1) {
      const edge = Math.floor(rng() * 4);
      let x;
      let y;

      if (edge === 0) {
        x = margin + rng() * (WIDTH - margin * 2);
        y = margin;
      } else if (edge === 1) {
        x = WIDTH - margin;
        y = margin + rng() * (HEIGHT - margin * 2);
      } else if (edge === 2) {
        x = margin + rng() * (WIDTH - margin * 2);
        y = HEIGHT - margin;
      } else {
        x = margin;
        y = margin + rng() * (HEIGHT - margin * 2);
      }

      if (Math.hypot(x - player.x, y - player.y) >= minDistance) {
        return { x, y };
      }
    }

    // Fallback: the corner furthest from the player, always inside the arena.
    const corners = [
      { x: margin, y: margin },
      { x: WIDTH - margin, y: margin },
      { x: margin, y: HEIGHT - margin },
      { x: WIDTH - margin, y: HEIGHT - margin },
    ];
    return corners.reduce((best, corner) => {
      const bestDistance = Math.hypot(best.x - player.x, best.y - player.y);
      const cornerDistance = Math.hypot(corner.x - player.x, corner.y - player.y);
      return cornerDistance > bestDistance ? corner : best;
    });
  }

  function bossPhase(hp, maxHp) {
    if (hp > maxHp * (2 / 3)) return 1;
    if (hp > maxHp / 3) return 2;
    return 3;
  }

  function variantFor(levelIndex, type) {
    return levelIndex >= 3 && VARIANTS[type] ? VARIANTS[type] : 'base';
  }

  function validate() {
    const errors = [];

    if (!Array.isArray(LEVELS) || LEVELS.length === 0) {
      errors.push('no levels defined');
      return { ok: false, errors };
    }

    LEVELS.forEach((level, levelIndex) => {
      if (!level.name) errors.push(`level ${levelIndex + 1}: missing name`);

      if (!Array.isArray(level.waves) || level.waves.length === 0) {
        errors.push(`level ${levelIndex + 1}: no waves`);
        return;
      }

      level.waves.forEach((wave, waveIndex) => {
        const prefix = `level ${levelIndex + 1} wave ${waveIndex + 1}`;
        const entries = Object.entries(wave.types || {});

        if (entries.length === 0) errors.push(`${prefix}: no enemy types`);

        for (const [type, count] of entries) {
          if (!ENEMY_TYPES[type] || type === 'boss') {
            errors.push(`${prefix}: unknown enemy type "${type}"`);
          }
          if (!Number.isFinite(count) || count < 1) {
            errors.push(`${prefix}: bad count for "${type}"`);
          }
        }

        if (!Number.isFinite(wave.interval) || wave.interval <= 0) {
          errors.push(`${prefix}: bad spawn interval`);
        }
        if (!Number.isFinite(wave.hpScale) || wave.hpScale <= 0) {
          errors.push(`${prefix}: bad hp scale`);
        }
        if (!Number.isFinite(wave.speedScale) || wave.speedScale <= 0) {
          errors.push(`${prefix}: bad speed scale`);
        }
      });
    });

    if (!LEVELS[LEVELS.length - 1].boss) {
      errors.push('final level must be a boss level');
    }

    return { ok: errors.length === 0, errors };
  }

  return {
    WIDTH,
    HEIGHT,
    ARENA_MARGIN,
    MIN_SPAWN_DISTANCE,
    ENEMY_TYPES,
    LEVELS,
    VARIANTS,
    clamp,
    circleHit,
    waveTotal,
    buildWaveQueue,
    chooseSpawnPoint,
    bossPhase,
    variantFor,
    validate,
  };
})();

if (typeof window !== 'undefined') {
  window.Levels = Levels;
}
