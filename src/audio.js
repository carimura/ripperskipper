// All sound is synthesised: engine drone, water rush that follows the edge, wind in the air, splashes,
// score chime, and the music (music.js). Everything runs through one low-pass that closes while the rider is under water.
import { createMusic } from './music.js';
import { C } from './physics.js';

export function createAudio() {
  let ctx, master, muffle, noise, rush, rushF, wind, music, engine, engineF, engineG, musicOn = true, songNo = 0;

  function start() {
    if (ctx) return;
    ctx = new AudioContext();
    muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.connect(ctx.destination);
    const limiter = ctx.createDynamicsCompressor();           // music + a big splash together must not clip
    limiter.threshold.value = -9; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.15; limiter.connect(muffle);
    master = ctx.createGain(); master.gain.value = 0.55; master.connect(limiter);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const loop = (type, freq, q) => {
      const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f).connect(g).connect(master); src.start();
      return [g, f];
    };
    [rush, rushF] = loop('bandpass', 1400, 0.5);
    [wind] = loop('highpass', 2500, 0.3);
    const lp = engineF = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 280;
    const eg = engineG = ctx.createGain(); eg.gain.value = 0.15; lp.connect(eg).connect(master);
    engine = [52, 78.5, 104.6].map(f => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); return [o, f]; });
    const lope = ctx.createOscillator(), depth = ctx.createGain(); lope.frequency.value = 13; depth.gain.value = 0.05;   // the engine's uneven beat: a rumble, not a hum
    lope.connect(depth).connect(eg.gain); lope.start();
    music = createMusic(ctx, master, noise); music.song(songNo);
    if (musicOn) music.start();
    document.addEventListener('visibilitychange', () => (document.hidden ? ctx.suspend() : ctx.resume()));
  }
  function splash(amount, len = 0.7, type = 'lowpass', from = 5000, to = 350) {
    if (!ctx) return;
    const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(from, ctx.currentTime); f.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + len * 0.85);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5 * amount, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + len);
    src.connect(f).connect(g).connect(master); src.start(0, Math.random()); src.stop(ctx.currentTime + len + 0.05);
  }
  const hz = m => 440 * 2 ** ((m - 69) / 12);
  const pent = i => 68 + 12 * Math.floor(i / 5) + [0, 2, 4, 7, 9][i % 5];   // A-flat major pentatonic, step by step: in key with the music
  function tone(freq, at, len, type = 'triangle', vol = 0.16, to = freq) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + at;
    o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(to, t + len);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(g).connect(master); o.start(t); o.stop(t + len);
  }
  return {
    start, splash,
    // A move ticked off in the air: one step up the scale each time.
    tick(n) { const m = pent(Math.min(n, 11)); tone(hz(m), 0, 0.13, 'square', 0.1); tone(hz(m + 12), 0, 0.09, 'triangle', 0.09); },
    // A landed trick, level 0–5 by the size of the move: a longer, louder run up the scale, then glitter, a chord, and a boom on the big ones.
    // Each trick landed in a row before it (streak) starts the run a step higher and a touch louder.
    reward(lvl, streak = 0) {
      const up = Math.min(streak, 5), vol = (0.11 + 0.05 * lvl) * (1 + 0.05 * up), n = Math.min(12, 3 + lvl * 2), gap = 0.062 - 0.005 * lvl, end = n * gap;
      for (let i = 0; i < n; i++) { tone(hz(pent(i + up)), i * gap, 0.24, 'square', vol); tone(hz(pent(i + up) + 12), i * gap, 0.2, 'triangle', vol * 0.8); }
      for (let k = 0; k < lvl * 6; k++) tone(hz(pent(Math.floor(Math.random() * 6) + 4) + 24), end + k * 0.04, 0.14, 'sine', 0.04 + 0.02 * lvl);
      if (lvl >= 2) for (const m of [56, 63, 68, 72, 75]) tone(hz(m), end, 0.45 + 0.2 * lvl, 'sawtooth', 0.035 + 0.015 * lvl);
      if (lvl >= 3) { tone(120, end, 0.7, 'sine', 0.35 + 0.1 * lvl, 38); splash(0.25 * lvl, 0.9); }
      if (lvl >= 4) for (let i = 0; i < 6; i++) tone(hz(pent(i + 5 + up) + 12), end + 0.1 + i * 0.05, 0.3, 'square', vol * 0.8);
      if (lvl >= 5) {                                           // the biggest: a siren sweep, a second and deeper hit, and the top of the scale ringing on
        tone(220, 0, end + 0.5, 'sawtooth', 0.1, 1760); tone(70, end + 0.45, 1.3, 'sine', 0.9, 28); splash(1.1, 1.8);
        for (let i = 0; i < 12; i++) tone(hz(pent(8 + i % 4) + 12), end + 0.5 + i * 0.075, 0.28, 'square', vol * 0.6);
      }
    },
    thud(vol = 0.5) { tone(95, 0, 0.55, 'sine', vol, 36); },
    twang(k = 1) { tone(170, 0, 0.2, 'sawtooth', 0.1 * k, 80); tone(700, 0, 0.05, 'square', 0.05 * k, 250); splash(0.2 * k, 0.1, 'highpass', 3500, 2500); },   // the rope snapping tight
    whistle() { tone(1500, 0.05, 0.16, 'sine', 0.07, 2700); tone(2700, 0.24, 0.3, 'sine', 0.07, 1500); },   // from the boat, for a big one
    // Hitting the water: the usual wash, plus a bright slap of spray and a plop that sit above the music.
    wipeout() { splash(0.8); splash(1.6, 0.9, 'highpass', 2500, 1500); splash(2, 0.5, 'bandpass', 1100, 600); tone(520, 0, 0.16, 'sine', 0.5, 130); tone(95, 0, 0.55, 'sine', 0.4, 36); },
    update(s) {
      if (!ctx) return;
      const t = ctx.currentTime, edge = Math.min(1, Math.abs(s.lift) / 1.4), wet = s.contact && !s.crashed;
      rush.gain.setTargetAtTime(wet ? 0.05 + 0.2 * edge : 0.006, t, 0.05);
      rushF.frequency.setTargetAtTime(1100 + 1900 * edge, t, 0.08);
      wind.gain.setTargetAtTime(s.air ? 0.07 : 0.012, t, 0.12);
      const surge = 4 * C.go * (1 - C.go), rev = 0.5 + 0.5 * C.go + 0.5 * surge;   // engine: idling, flat out to get the boat on to the plane, then settling to a cruise
      const load = C.surf || s.crashed ? 0 : Math.min(1, s.tension / 2600);          // a rider cutting hard drags the revs down, and the engine works
      for (const [o, f] of engine) o.frequency.setTargetAtTime(f * rev * (1 - 0.06 * load), t, 0.06);
      engineG.gain.setTargetAtTime(0.15 * (0.6 + 0.4 * C.go + 1.2 * surge + 0.35 * load), t, 0.08); engineF.frequency.setTargetAtTime(280 + 500 * surge, t, 0.08);
      muffle.frequency.setTargetAtTime(s.crashed && s.plunged && !s.surfaced ? 380 : 20000, t, s.surfaced ? 0.25 : 0.04);
    },
    song(i) { songNo = i; music?.song(i); },                  // which track: the stock stereo's or the big speakers' (gear.js)
    get beat() { return music ? music.beat : 1; },
    toggleMusic() { musicOn = !musicOn; if (music) musicOn ? music.start() : music.stop(); return musicOn; },
  };
}
