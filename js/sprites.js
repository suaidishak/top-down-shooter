'use strict';

/*
 * Procedural pixel-art sprites.
 *
 * Each sprite is a matrix of palette characters. At first use it is baked to an
 * offscreen canvas, then pre-rotated into 8 directions so pixel art stays crisp
 * (no per-frame bilinear rotation). Enemy variants reuse the same matrices with
 * a different palette. White "flash" palettes are generated automatically for
 * hit feedback.
 */
const Sprites = (() => {
  const SCALE = 3;
  const ROTATIONS = 8;

  const defs = new Map();
  const frameCache = new Map();

  function define(name, rows, palettes) {
    const width = rows[0].length;
    rows.forEach((row, index) => {
      if (row.length !== width) {
        throw new Error(`Sprite "${name}" row ${index} is ${row.length} wide, expected ${width}`);
      }
    });
    if (!palettes || !palettes.base) {
      throw new Error(`Sprite "${name}" needs a base palette`);
    }
    defs.set(name, { width, height: rows.length, rows, palettes });
  }

  function bake(def, palette) {
    const canvas = document.createElement('canvas');
    canvas.width = def.width * SCALE;
    canvas.height = def.height * SCALE;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    for (let y = 0; y < def.height; y += 1) {
      const row = def.rows[y];
      for (let x = 0; x < def.width; x += 1) {
        const color = palette[row[x]];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
      }
    }

    return canvas;
  }

  function whitePalette(def) {
    const palette = {};
    const chars = new Set(def.rows.join('').split(''));
    for (const ch of chars) {
      if (ch !== '.') palette[ch] = '#ffffff';
    }
    return palette;
  }

  function rotateCanvas(base, angle) {
    const size = Math.ceil(Math.hypot(base.width, base.height)) + 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.translate(size / 2, size / 2);
    ctx.rotate(angle);
    ctx.drawImage(base, -base.width / 2, -base.height / 2);

    return canvas;
  }

  function getFrames(name, variant, flash) {
    const def = defs.get(name);
    if (!def) throw new Error(`Unknown sprite "${name}"`);

    const key = `${name}|${variant}|${flash ? 'flash' : 'normal'}`;
    const cached = frameCache.get(key);
    if (cached) return cached;

    const palette = flash
      ? whitePalette(def)
      : (def.palettes[variant] || def.palettes.base);

    const base = bake(def, palette);
    const frames = [];
    for (let index = 0; index < ROTATIONS; index += 1) {
      frames.push(rotateCanvas(base, (index * Math.PI * 2) / ROTATIONS));
    }

    frameCache.set(key, frames);
    return frames;
  }

  function angleIndex(angle) {
    const step = (Math.PI * 2) / ROTATIONS;
    return ((Math.round(angle / step) % ROTATIONS) + ROTATIONS) % ROTATIONS;
  }

  /**
   * Draw a sprite centred at (x, y).
   * options: { variant, flash (0..1), alpha, scale, squashX, squashY }
   */
  function draw(ctx, name, x, y, angle = 0, options = {}) {
    const {
      variant = 'base',
      flash = 0,
      alpha = 1,
      scale = 1,
      squashX = 1,
      squashY = 1,
    } = options;

    if (alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(scale * squashX, scale * squashY);

    let image = getFrames(name, variant, false)[angleIndex(angle)];
    ctx.drawImage(image, -image.width / 2, -image.height / 2);

    if (flash > 0) {
      image = getFrames(name, variant, true)[angleIndex(angle)];
      ctx.globalAlpha = Math.min(1, flash) * 0.85;
      ctx.drawImage(image, -image.width / 2, -image.height / 2);
    }

    ctx.restore();
  }

  function size(name) {
    const def = defs.get(name);
    if (!def) throw new Error(`Unknown sprite "${name}"`);
    return { width: def.width * SCALE, height: def.height * SCALE };
  }

  function validate() {
    const errors = [];

    if (defs.size === 0) errors.push('no sprites defined');

    for (const [name, def] of defs) {
      const width = def.rows[0].length;
      const chars = new Set(def.rows.join('').split(''));

      def.rows.forEach((row, index) => {
        if (row.length !== width) {
          errors.push(`${name}: row ${index} has width ${row.length}, expected ${width}`);
        }
      });

      for (const variant of Object.keys(def.palettes)) {
        const palette = def.palettes[variant];
        for (const ch of chars) {
          if (ch !== '.' && !palette[ch]) {
            errors.push(`${name}: palette "${variant}" missing colour for "${ch}"`);
          }
        }
      }
    }

    return { ok: errors.length === 0, errors };
  }

  return { define, draw, size, validate, SCALE, ROTATIONS };
})();

/* ------------------------------------------------------------------ */
/* Sprite definitions                                                  */
/* ------------------------------------------------------------------ */

Sprites.define('player', [
  '................',
  '......oooo......',
  '....oobbbboo....',
  '...obbbbbbbbo...',
  '...obbhhhhbbo...',
  '...obbhhhhbbo...',
  '...obbbbbbbbo...',
  '...obbbbbbbboggg',
  '...obbbbbbbboggg',
  '...obbbbbbbbo...',
  '...obbbbbbbbo...',
  '...obbddddbbo...',
  '...obbbbbbbbo...',
  '....oobbbboo....',
  '......oooo......',
  '................',
], {
  base: {
    o: '#0b1220',
    b: '#38bdf8',
    h: '#e0f2fe',
    d: '#0ea5e9',
    g: '#cbd5e1',
  },
});

Sprites.define('grunt', [
  '..............',
  '....oooooo....',
  '...obbbbbbo...',
  '..obbbbbbbbo..',
  '..obbbbbeebbo.',
  '..obbbbbeebbo.',
  '..obbbbbbbbo..',
  '..obbbbbbbbo..',
  '..obbbbbbbbo..',
  '...obbbbbbo...',
  '....oooooo....',
  '..............',
  '..............',
  '..............',
], {
  base: { o: '#1a0b2e', b: '#a855f7', e: '#fde047' },
  toxic: { o: '#07231a', b: '#22c55e', e: '#fde047' },
});

Sprites.define('rusher', [
  '..............',
  '......oo......',
  '.....obbo.....',
  '....obbbbo....',
  '...obbbbbbo...',
  '..obbbbbbbboo.',
  '..obbbbbbbboo.',
  '..obbbbbbbboo.',
  '...obbbbbbo...',
  '....obbbbo....',
  '.....obbo.....',
  '......oo......',
  '..............',
  '..............',
], {
  base: { o: '#2a0a0f', b: '#ef4444', e: '#fde047' },
  pink: { o: '#2a0a1a', b: '#f472b6', e: '#fde047' },
});

Sprites.define('shooter', [
  '..............',
  '....oooooo....',
  '...obbbbbbo...',
  '..obbbbbbbbo..',
  '..obbbbbbbbo..',
  '..obbbeebbbbo.',
  '..obbbeebbbbo.',
  '..obbbbbbbbboo',
  '..obbbbbbbbboo',
  '..obbbbbbbbo..',
  '...obbbbbbo...',
  '....oooooo....',
  '..............',
  '..............',
], {
  base: { o: '#06281a', b: '#22c55e', e: '#fde047' },
  sour: { o: '#1f1a03', b: '#eab308', e: '#fef08a' },
});

Sprites.define('tank', [
  '..................',
  '....oooooooooo....',
  '...obbbbbbbbbbo...',
  '..obbbbbbbbbbbbo..',
  '..obbbbbbbbbbbbo..',
  '..obdbbbbbbbbdbo..',
  '..obdbbbbbbbbdbo..',
  '..obbbbbbbbbbbbo..',
  '..obbbbbbbbbbbbo..',
  '..obbbbbbbbbbbbo..',
  '..obbbbbbbbbbbbo..',
  '..obdbbbbbbbbdbo..',
  '..obdbbbbbbbbdbo..',
  '..obbbbbbbbbbbbo..',
  '...obbbbbbbbbbo...',
  '....oooooooooo....',
  '..................',
  '..................',
], {
  base: { o: '#2a1604', b: '#f59e0b', d: '#92400e', e: '#fde047' },
  steel: { o: '#101826', b: '#94a3b8', d: '#475569', e: '#fde047' },
});

Sprites.define('boss', [
  '........................',
  '.........oooooo.........',
  '.......oobbbbbboo.......',
  '......obbbbbbbbbbo......',
  '.....obbbbbbbbbbbbo.....',
  '....obbbbbbbbbbbbbbo....',
  '...obbbbbbbbbbbbbbbbo...',
  '...obbbbbbbbbbbbbbbbo...',
  '..obbbbbbbbbbbbbbbbbbo..',
  '..obbbbbbbbbbbbbbbbbbo..',
  '..obbbbbbbbbeeeeebbbbo..',
  '..obbbbbbbbeeeeeebbbbo..',
  '..obbbbbbbbbeeeeebbbbo..',
  '..obbbbbbbbbbbbbbbbbbo..',
  '..obbbbbbbbbbbbbbbbbbo..',
  '..obbbbbbbbbbbbbbbbbbo..',
  '...obbbbbbbbbbbbbbbbo...',
  '....obbbbbbbbbbbbbbo....',
  '.....obbbbbbbbbbbbo.....',
  '......obbbbbbbbbbo......',
  '.......oobbbbbboo.......',
  '.........oooooo.........',
  '........................',
  '........................',
], {
  base: { o: '#2b0710', b: '#f43f5e', e: '#fde047' },
});

Sprites.define('muzzle', [
  '...##...',
  '...##...',
  '.#.##.#.',
  '..####..',
  '..####..',
  '.#.##.#.',
  '...##...',
  '...##...',
], {
  base: { '#': '#fef9c3' },
});

Sprites.define('pickup-health', [
  '..........',
  '....##....',
  '....##....',
  '..######..',
  '..######..',
  '..######..',
  '..######..',
  '....##....',
  '....##....',
  '..........',
], {
  base: { '#': '#34d399' },
});

Sprites.define('pickup-rapid', [
  '.......##.',
  '......##..',
  '.....##...',
  '....##....',
  '...######.',
  '......##..',
  '.....##...',
  '....##....',
  '...##.....',
  '..........',
], {
  base: { '#': '#fbbf24' },
});

Sprites.define('pickup-spread', [
  '..........',
  '.##....##.',
  '.##....##.',
  '..........',
  '....##....',
  '....##....',
  '..........',
  '.##....##.',
  '.##....##.',
  '..........',
], {
  base: { '#': '#f472b6' },
});

if (typeof window !== 'undefined') {
  window.Sprites = Sprites;
}
