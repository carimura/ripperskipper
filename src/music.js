// The backing tracks, sequenced and synthesised live. Both are 16-bar loops in F minor, so the reward sounds are in key with either.
// 0, the stock stereo's: electro at 128 BPM — four-on-the-floor kick, off-beat bass with a sub underneath, saw-stack chord stabs and a lead line.
// 2, the disco stack's: disco-house at 122 BPM — four on the floor, an octave-jumping bass, chords on the off-beat, a bright lead.
// 1, the bass cannons': half-time at 140 BPM — a long 808 boom and one heavy backbeat a bar, a bass that wobbles, sparser stabs, a slower lead — with the low end turned right up.
// Everything except the drums is ducked under each kick, so the whole mix pumps.
const hz = m => 440 * 2 ** ((m - 69) / 12);
const SONGS = [{
  bpm: 128, kick: 'x...x...x...x...', clap: '....x.......x...', stab: 'x..x..x.x..x..x.',     // the stabs go 3-3-2
  bass: ['..x...x...x...xo', '..xx..xx..xx..xo'],        // off-beats, then a gallop for the second half (o = octave up)
  bars: [[41, [60, 65, 68]], [37, [61, 65, 68]], [44, [60, 63, 68]], [39, [58, 63, 67]]],    // [bass root, chord] — Fm · Db · Ab · Eb
  lead: [                                                // eight 8th-notes per bar (0 = rest)
    [72, 0, 68, 0, 65, 0, 68, 70], [72, 0, 73, 0, 72, 0, 68, 0], [75, 0, 72, 0, 68, 0, 72, 75], [74, 0, 0, 70, 67, 0, 70, 0],
    [77, 0, 75, 0, 72, 0, 68, 70], [72, 0, 73, 0, 77, 0, 73, 0], [80, 0, 77, 0, 75, 0, 72, 75], [79, 0, 0, 75, 79, 0, 82, 0],
  ],
}, {
  bpm: 140, kick: 'x.........x.....', clap: '........x.......', stab: 'x.....x.....x...',
  wob: [[0, 8, 2], [8, 4, 4], [12, 4, 3]],               // the bass, bar by bar: [from step, for how many, wobbles a beat]
  bars: [[41, [65, 68, 72]], [41, [65, 68, 72]], [37, [65, 68, 73]], [39, [67, 70, 75]]],    // Fm · Fm · Db · Eb
  lead: [
    [77, 0, 0, 0, 75, 0, 72, 0], [0, 0, 72, 0, 75, 0, 77, 0], [80, 0, 0, 0, 77, 0, 73, 0], [79, 0, 0, 75, 0, 0, 70, 0],
    [77, 0, 0, 0, 80, 0, 84, 0], [0, 0, 84, 0, 82, 0, 80, 0], [80, 0, 0, 0, 77, 0, 73, 0], [75, 0, 77, 0, 79, 0, 82, 0],
  ],
}, {
  bpm: 122, kick: 'x...x...x...x...', clap: '....x.......x...', stab: '..x...x...x...x.',
  bass: ['o.x.o.x.o.x.o.xo', 'o.xoo.x.o.xoo.xo'],        // F, Bb, Eb, Ab with the octave above on the beat
  bars: [[41, [65, 68, 72]], [46, [65, 70, 73]], [39, [67, 70, 75]], [44, [68, 72, 75]]],    // Fm · Bbm · Eb · Ab
  lead: [
    [84, 0, 84, 82, 80, 0, 77, 0], [77, 0, 80, 0, 82, 0, 80, 77], [79, 0, 79, 77, 75, 0, 72, 0], [75, 0, 77, 0, 80, 0, 0, 0],
    [84, 0, 84, 82, 80, 0, 84, 0], [85, 0, 84, 0, 82, 0, 80, 0], [79, 0, 82, 0, 84, 0, 87, 0], [84, 0, 0, 0, 80, 0, 0, 0],
  ],
}];

export function createMusic(ctx, out, noise) {
  const make = (n, set) => { set(n); return n; };
  const gain = v => make(ctx.createGain(), n => { n.gain.value = v; });
  const filter = (type, f, q = 0.7) => make(ctx.createBiquadFilter(), n => { n.type = type; n.frequency.value = f; n.Q.value = q; });

  let song = SONGS[0], STEP = 60 / song.bpm / 4;        // STEP: one 16th note
  const shelf = filter('lowshelf', 110), bus = gain(0.5); bus.connect(shelf).connect(out);   // the shelf: more bottom end for the big speakers
  shelf.gain.value = 0;
  const drums = gain(1); drums.connect(bus);
  const pump = gain(1); pump.connect(bus);              // bass, chords and lead: ducked by every kick
  const drive = make(ctx.createWaveShaper(), n => { n.curve = Float32Array.from({ length: 513 }, (_, i) => Math.tanh((i / 256 - 1) * 3)); });
  drive.connect(filter('lowpass', 3200)).connect(gain(0.42)).connect(pump);
  const echo = make(ctx.createDelay(1), n => { n.delayTime.value = STEP * 3; }), feedback = gain(0.35);
  echo.connect(feedback).connect(echo); echo.connect(gain(0.4)).connect(pump);

  // attack, decay to `hold` of the peak across the note, short release (hold ≈ 0 makes a pluck or a drum)
  const env = (g, t, peak, len, hold = 0.001) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.005); g.gain.exponentialRampToValueAtTime(peak * hold, t + len); g.gain.linearRampToValueAtTime(0, t + len + 0.02); };
  const osc = (type, freq, detune, t, len, dest) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune; o.connect(dest); o.start(t); o.stop(t + len + 0.04); return o; };
  function hit(t, len, peak, type, freq, q) {             // filtered noise: claps, hats, crashes
    const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = noise; src.loop = true; env(g, t, peak, len);
    src.connect(filter(type, freq, q)).connect(g).connect(drums); src.start(t, Math.random()); src.stop(t + len + 0.04);
  }
  function kick(t) {                                    // the bass cannons' song: a long 808 boom, sliding down to the sub
    const len = song.wob ? 0.95 : 0.34, g = ctx.createGain(), o = osc('sine', 190, 0, t, len, g);
    o.frequency.setValueAtTime(song.wob ? 170 : 190, t); o.frequency.exponentialRampToValueAtTime(song.wob ? 36 : 47, t + (song.wob ? 0.32 : 0.1));
    g.gain.setValueAtTime(song.wob ? 1.15 : 1, t); g.gain.exponentialRampToValueAtTime(0.001, t + len); g.connect(drums);
    hit(t, 0.012, 0.3, 'highpass', 3000);
    pump.gain.setValueAtTime(0.25, t); pump.gain.setTargetAtTime(1, t + 0.02, 0.075);
  }
  function clap(t, v = 0.42) { for (const d of [0, 0.011, 0.023]) hit(t + d, 0.02, v, 'bandpass', 1500, 1); hit(t + 0.03, 0.17, v, 'bandpass', 1300, 1); }
  function bass(t, note, len) {
    const f = filter('lowpass', 2600, 7), g = ctx.createGain();
    f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(260, t + len);
    env(g, t, 0.5, len, 0.5); f.connect(g).connect(drive);
    osc('sawtooth', hz(note + 12), -7, t, len, f); osc('sawtooth', hz(note + 12), 7, t, len, f); osc('square', hz(note), 0, t, len, f);
    const sub = ctx.createGain(); env(sub, t, 0.6, len, 0.7); sub.connect(pump); osc('sine', hz(note), 0, t, len, sub);
  }
  function wobble(t, note, len, rate) {                 // the big speakers' bass: a growl that opens and closes `rate` times a second, over a sub
    const f = filter('lowpass', 700, 9), g = ctx.createGain(), depth = gain(560);
    osc('sine', rate, 0, t, len, depth); depth.connect(f.frequency);
    env(g, t, 0.55, len, 0.8); f.connect(g).connect(drive);
    osc('sawtooth', hz(note), -9, t, len, f); osc('sawtooth', hz(note), 9, t, len, f); osc('square', hz(note - 12), 0, t, len, f);
    const sub = ctx.createGain(); env(sub, t, 0.7, len, 0.8); sub.connect(pump); osc('sine', hz(note - 12), 0, t, len, sub);
  }
  function stab(t, chord, level) {
    const f = filter('lowpass', 6000, 1.5), g = ctx.createGain();
    f.frequency.setValueAtTime(6000, t); f.frequency.exponentialRampToValueAtTime(1100, t + 0.2);
    env(g, t, 0.075 * level, 0.22, 0.12); f.connect(g); g.connect(pump); g.connect(echo);
    for (const n of [...chord, chord[2] + 12]) for (const d of [-15, 0, 15]) osc('sawtooth', hz(n), d, t, 0.22, f);
  }
  function lead(t, note, len) {
    const f = filter('lowpass', 4200, 2), g = ctx.createGain();
    env(g, t, 0.1, len, 0.45); f.connect(g); g.connect(pump); g.connect(echo);
    osc('sawtooth', hz(note), -9, t, len, f); osc('sawtooth', hz(note), 9, t, len, f); osc('square', hz(note - 12), 0, t, len, f);
  }
  function riser(t, len) {                              // a bar of noise sweeping up into the drop
    const src = ctx.createBufferSource(), f = filter('bandpass', 300, 1.2), g = ctx.createGain(); src.buffer = noise; src.loop = true;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(9000, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.3, t + len); g.gain.linearRampToValueAtTime(0, t + len + 0.03);
    src.connect(f).connect(g).connect(drums); src.start(t); src.stop(t + len + 0.05);
  }

  function schedule(i, t) {
    const bar = Math.floor(i / 16) % 16, s = i % 16, [root, chord] = song.bars[bar % 4], build = bar === 15;
    if (song.kick[s] === 'x' && !(build && s >= 8)) kick(t);
    if (song.clap[s] === 'x') { clap(t, song.wob ? 0.6 : 0.42); if (song.wob) hit(t, 0.16, 0.5, 'lowpass', 420); }   // half-time: one backbeat, with a body to it
    if (song.wob && bar % 4 === 3 && s >= 12) hit(t + STEP / 2, 0.03, 0.09, 'highpass', 8500);                     // …and a hat roll into every fourth bar
    hit(t, s % 4 === 2 ? 0.13 : 0.03, s % 4 === 2 ? 0.2 : s % 2 ? 0.06 : 0.11, 'highpass', 8500);
    if (s === 0 && bar % 8 === 0) hit(t, 1.4, 0.3, 'highpass', 5000);                       // crash into each half
    if (build) {                                                                              // last bar: snare roll and riser, kick drops out
      if (s === 0) riser(t, STEP * 16);
      if (s >= 8 || s % 2 === 0) clap(t, 0.16 + 0.02 * s);
      if (s >= 12) clap(t + STEP / 2, 0.16 + 0.02 * s);
    }
    const b = song.bass?.[bar < 8 ? 0 : 1][s] ?? '.';
    if (b !== '.' && !(build && s >= 12)) bass(t, root + (b === 'o' ? 12 : 0), STEP * (b === 'o' || bar >= 8 ? 0.9 : 1.9));
    for (const [from, len, rate] of song.wob || []) if (s === from && !(build && s >= 12)) wobble(t, root, STEP * len, rate * song.bpm / 60);
    if (song.stab[s] === 'x') stab(t, chord, bar >= 8 ? 1 : 0.8);
    const n = bar >= 4 && s % 2 === 0 && song.lead[bar % 8][s / 2];                           // the lead comes in after four bars
    if (n) lead(t, n, STEP * (song.lead[bar % 8][s / 2 + 1] === 0 ? 3.6 : 1.8));
  }

  let step = 15 * 16, next = 0, timer = null;           // come in on the build, so the first thing heard is the drop arriving
  const tick = () => { while (next < ctx.currentTime + 0.15) { schedule(step++, next); next += STEP; } };
  return {
    get on() { return !!timer; },
    start() { if (!timer) { step -= step % 16; next = ctx.currentTime + 0.08; timer = setInterval(tick, 40); } },
    stop() { clearInterval(timer); timer = null; },
    song(i) {                                           // change track: the new one comes in on its build
      song = SONGS[i]; STEP = 60 / song.bpm / 4; echo.delayTime.value = STEP * 3; shelf.gain.value = [0, 9, 2][i]; bus.gain.value = [0.5, 0.56, 0.5][i];
      step = 15 * 16; next = ctx.currentTime + 0.08;
    },
    get beat() { return timer ? Math.max(0, (ctx.currentTime - (next - step * STEP)) / (4 * STEP)) % 1 : 1; },   // how far through the beat: 0 on it … 1
  };
}
