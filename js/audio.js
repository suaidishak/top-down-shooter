'use strict';

/*
 * Tiny WebAudio synth. No audio files: every sound is an oscillator envelope
 * or a filtered noise burst. The AudioContext is created lazily on the first
 * user gesture (browser autoplay policy).
 */
const Sfx = (() => {
  let ctx = null;
  let master = null;
  let muted = false;
  let noiseBuffer = null;

  function init() {
    if (ctx) return ctx;

    const AudioCtor = typeof window !== 'undefined'
      ? (window.AudioContext || window.webkitAudioContext)
      : null;
    if (!AudioCtor) return null;

    try {
      ctx = new AudioCtor();
      master = ctx.createGain();
      master.gain.value = 0.28;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
      master = null;
    }

    return ctx;
  }

  function wake() {
    if (ctx && ctx.state === 'suspended') {
      const resumed = ctx.resume();
      if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
    }
  }

  function tone({ freq, to = null, dur = 0.1, type = 'square', gain = 0.3, delay = 0 }) {
    if (!ctx || muted) return;
    wake();

    const start = ctx.currentTime + delay;
    const end = start + dur;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (to !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), end);
    }

    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(env);
    env.connect(master);
    osc.start(start);
    osc.stop(end + 0.02);
  }

  function noise({ dur = 0.15, gain = 0.25, filterFreq = 1200, type = 'lowpass', delay = 0 }) {
    if (!ctx || muted) return;
    wake();

    if (!noiseBuffer) {
      const length = Math.floor(ctx.sampleRate * 0.5);
      noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let index = 0; index < length; index += 1) {
        data[index] = Math.random() * 2 - 1;
      }
    }

    const start = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();

    source.buffer = noiseBuffer;
    filter.type = type;
    filter.frequency.value = filterFreq;

    env.gain.setValueAtTime(Math.max(0.0002, gain), start);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    source.connect(filter);
    filter.connect(env);
    env.connect(master);
    source.start(start);
    source.stop(start + dur);
  }

  const sounds = {
    shoot() {
      tone({ freq: 380, to: 170, dur: 0.06, type: 'square', gain: 0.1 });
    },
    hit() {
      noise({ dur: 0.05, gain: 0.1, filterFreq: 2400, type: 'highpass' });
    },
    enemyDeath() {
      noise({ dur: 0.22, gain: 0.2, filterFreq: 900 });
      tone({ freq: 220, to: 70, dur: 0.2, type: 'sawtooth', gain: 0.1 });
    },
    playerHit() {
      tone({ freq: 140, to: 60, dur: 0.25, type: 'square', gain: 0.24 });
      noise({ dur: 0.14, gain: 0.14, filterFreq: 500 });
    },
    pickup() {
      tone({ freq: 660, dur: 0.08, type: 'sine', gain: 0.18 });
      tone({ freq: 990, dur: 0.12, type: 'sine', gain: 0.15, delay: 0.08 });
    },
    wave() {
      tone({ freq: 440, dur: 0.09, type: 'triangle', gain: 0.14 });
      tone({ freq: 660, dur: 0.12, type: 'triangle', gain: 0.12, delay: 0.09 });
    },
    levelClear() {
      [523, 659, 784, 1047].forEach((freq, index) => {
        tone({ freq, dur: 0.16, type: 'square', gain: 0.13, delay: index * 0.1 });
      });
    },
    bossWarn() {
      tone({ freq: 90, to: 50, dur: 0.6, type: 'sawtooth', gain: 0.22 });
      noise({ dur: 0.6, gain: 0.1, filterFreq: 300 });
    },
    gameOver() {
      [392, 330, 262, 196].forEach((freq, index) => {
        tone({ freq, dur: 0.24, type: 'triangle', gain: 0.16, delay: index * 0.16 });
      });
    },
    victory() {
      [523, 659, 784, 1047, 1319].forEach((freq, index) => {
        tone({ freq, dur: 0.2, type: 'square', gain: 0.14, delay: index * 0.12 });
      });
    },
  };

  function play(name) {
    if (!ctx || muted) return;
    const sound = sounds[name];
    if (sound) sound();
  }

  function unlock() {
    init();
    wake();
  }

  function setMuted(value) {
    muted = Boolean(value);
  }

  function isMuted() {
    return muted;
  }

  return { init, unlock, play, setMuted, isMuted };
})();

if (typeof window !== 'undefined') {
  window.Sfx = Sfx;
}
