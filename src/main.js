import * as THREE from 'three';
import { C, createSim, step, resetRider, setMode, beginStart, surfLip, GRABS } from './physics.js';
import { createPipeline } from './gfx.js';
import { createWater } from './water.js';
import { createSky, createLights, createShore, setLake } from './env.js';
import { GEAR } from './gear.js';
import { createBoat } from './boat.js';
import { createRider } from './rider.js';
import { createFx } from './fx.js';
import { createAudio } from './audio.js';

const RUN_TIME = 120, STEP = 1 / 240;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---- scene ----
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.3, 4000);

const sky = createSky(), lights = createLights(scene), shore = createShore(), boat = createBoat();
const water = createWater(new THREE.TextureLoader().load('/waternormals.jpg'));
const rider = createRider(scene);
scene.add(sky.mesh, water.mesh, shore.group, boat.group, rider.root);
const pipeline = createPipeline(renderer, scene, camera);
const fx = createFx(pipeline.gTexture, pipeline.res, camera);
pipeline.fxScene = fx.scene;
const audio = createAudio();

let dpr = Math.min(devicePixelRatio, 2), slow = 0, ui = 1;
function resize() {
  const w = innerWidth, h = Math.min(innerHeight, visualViewport?.height || innerHeight);   // a phone's browser bars take some of the height
  document.documentElement.style.setProperty('--ui', ui = Math.min(1, w / 1100, h / 700));   // menus and HUD are laid out for a window that size: on anything smaller they shrink to fit
  renderer.setPixelRatio(dpr); renderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  pipeline.resize(w, h, dpr);
}
addEventListener('resize', resize); visualViewport?.addEventListener('resize', resize); resize();

// ---- game state ----
const s = createSim();
const game = { mode: 'title', kind: 'wake', score: 0, mult: 1, time: RUN_TIME, best: 0, landed: 0, falls: 0, top: null, airMax: 0, recent: [] };
const fmt = n => Math.round(n).toLocaleString('en-US'), FT = 3.281;      // the simulation is in metres; heights are shown in feet
const BEST = { wake: 'ripperskipper.best', surf: 'ripperskipper.best.surf' };

// ---- leaderboard: the best ten for each mode, shared by everyone who plays (worker/index.js). Quietly absent if the server isn't there. ----
const scores = post => fetch('/api/scores' + (post ? '' : '?mode=' + game.kind), post && { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(post) })
  .then(r => (r.ok ? r.json() : null)).catch(() => null);
const clean = n => String(n).replace(/[^A-Z0-9 ._-]/g, '');
function showBoard(top, mine) {                       // on the title screen and the results screen
  const html = top?.length ? `<tr><th colspan="3">TOP 10 · ${C.surf ? 'WAKESURF' : 'WAKEBOARD'}</th></tr>` + top.map((r, i) => `<tr${i + 1 === mine ? ' class="me"' : ''}><td>${i + 1}</td><td>${clean(r.name)}</td><td>${fmt(r.score)}</td></tr>`).join('') : '';
  for (const el of document.querySelectorAll('.board')) el.innerHTML = html;
}
function loadBoard(offer) {                           // offer: this score, if it makes the ten, gets a name
  const kind = game.kind;
  $('entry').classList.remove('on'); $('name').blur();
  scores().then(d => {
    if (game.kind !== kind) return;
    showBoard(d?.top);
    if (d && offer > 0 && game.mode === 'over' && (d.top.length < 10 || offer > d.top[d.top.length - 1].score)) {
      $('entry').classList.add('on'); $('name').value = localStorage.getItem('ripperskipper.name') || ''; $('name').focus();
    }
  });
}
function submitName() {
  const name = clean($('name').value.toUpperCase()).trim() || 'RIDER';
  localStorage.setItem('ripperskipper.name', name); $('entry').classList.remove('on'); $('name').blur();
  scores({ mode: game.kind, name, score: game.score }).then(d => d && showBoard(d.top, d.rank));
}

// Wakeboard or wakesurf: a different boat speed, wave, rider set-up and best score. Chosen on the title and results screens.
function setKind(kind) {
  game.kind = kind; setMode(kind === 'surf'); rider.setSurf(C.surf);
  game.best = +localStorage.getItem(BEST[kind]) || 0;
  resetRider(s); s.events.length = 0;
  document.body.className = kind;                     // menus and HUD show this mode's controls
  loadBoard(0);
}
setKind('wake');

// ---- XP and unlocks: every point scored adds to a total, kept in this browser, that unlocks tricks, boats and lakes (gear.js).
// The locker comes up after each run's results (and with G): ↑ ↓ pick speakers, boats or lakes, ← → choose one that is unlocked. ----
const PICK = ['trick', 'speaker', 'boat', 'lake'], all = Object.values(GEAR).flat(), [RALEY, TANTRUM, STALE, HOOCHIE, SBEND, MUTE, SPIN720, DOUBLE] = GEAR.trick;
if (import.meta.env.DEV && new URLSearchParams(location.search).has('unlock')) localStorage.setItem('ripperskipper.xp', 1e6);   // on the dev server, ?unlock opens everything
let xp = +localStorage.getItem('ripperskipper.xp') || 0, played = localStorage.getItem('ripperskipper.xp') !== null, row = 2, demo = -1, fresh = [];   // demo: the trick the rider shows off in the locker   // fresh: what the last run unlocked
const got = it => (it.first ? played : xp >= it.at);
const order = list => [...list].sort((a, b) => (a.first ? -1 : a.at) - (b.first ? -1 : b.at));   // in the order they unlock
const worn = { ...JSON.parse(localStorage.getItem('ripperskipper.gear') || '{}') };   // which speakers, boat and lake
for (const k of PICK.slice(1)) if (!GEAR[k][worn[k]] || !got(GEAR[k][worn[k]])) worn[k] = 0;
function wear() {
  C.SPIN_MAX = got(SPIN720) ? 10.2 : 7.6; C.FLIP_MAX = got(DOUBLE) ? 10.2 : 7.2;   // quick enough for a 720, or a double roll, off the biggest airs
  boat.pick(worn.boat); boat.speakers(worn.speaker); audio.song(worn.speaker); setLake(worn.lake, sky, lights, shore);
  GEAR.trick.forEach((t, i) => document.documentElement.classList.toggle('lock' + i, !got(t)));   // the help only lists the tricks there are
  const n = GEAR.trick.filter(t => !got(t)).length;
  $('more').textContent = n ? `${n} more trick${n > 1 ? 's' : ''} to unlock — the locker has them` : '';
}
wear();
// One unlock: its icon, dim while it is locked. `pop` (seconds from now): it starts out dim, then flashes as it is added.
const card = (it, cls, pop) => `<span data-n="${all.indexOf(it)}" class="card ${got(it) ? cls : 'locked'}${pop ? ' pop' : ''}"${pop ? ` style="--d: ${pop}s"` : ''}><svg viewBox="0 0 64 64">${it.icon}</svg><b>${it.name}</b>`
  + `<small>${!got(it) ? (it.first ? 'FINISH A RUN' : fmt(it.at) + ' XP') : (fresh.includes(it) ? 'NEW! ' : '') + (it.how || '')}</small></span>`;
function showGear(pop) {
  const next = all.filter(i => !got(i)).sort((a, b) => (a.at || 0) - (b.at || 0))[0];
  $('xp').textContent = `${fmt(xp)} XP · ` + (!next ? 'EVERYTHING UNLOCKED' : next.first ? 'FINISH A RUN TO UNLOCK A TRICK' : `NEXT UNLOCK AT ${fmt(next.at)}`);
  $('xpV').style.width = (next ? 100 * xp / (next.at || Infinity) : 100) + '%';
  $('shelf').innerHTML = [['trick'], ['speaker', 'boat'], ['lake']].map(line => '<section>' + line.map(k => `<div${k === PICK[row] ? ' class="at"' : ''}><em>${k.toUpperCase()}S</em>`   // speakers and boats share a line
    + order(GEAR[k]).map(it => card(it, (GEAR[k].indexOf(it) === (k === 'trick' ? demo : worn[k]) ? 'on' : '') + (fresh.includes(it) ? ' new' : ''), pop && fresh.includes(it) && 0.5 + 0.35 * fresh.indexOf(it))).join('') + '</div>').join('') + '</section>').join('');
}
function openGear() {
  game.mode = 'gear';
  $('title').classList.remove('on'); $('over').classList.remove('on'); $('gear').classList.add('on');
  showGear(true);
}

function startRun() {
  Object.assign(game, { mode: 'run', score: 0, mult: 1, time: RUN_TIME, landed: 0, falls: 0, top: null, airMax: 0, recent: [] });
  shown = 0; fresh = [];
  resetRider(s); s.events.length = 0; shore.start(C.surf ? 420 : 0);   // San Francisco Bay: out at sea again — surfing, slower, starts nearer the Golden Gate so it gets under it
  if (!C.surf) beginStart(s);                         // a wakeboard run opens with the boat pulling the rider up out of the water
  for (const id of ['title', 'over', 'gear']) $(id).classList.remove('on');
}
function endRun() {
  game.mode = 'over'; game.score = Math.round(game.score / 10) * 10;      // surfing adds points by the fraction
  if (game.score > game.best) { game.best = game.score; localStorage.setItem(BEST[game.kind], game.best); }
  const had = all.filter(got);
  xp += game.score; played = true; localStorage.setItem('ripperskipper.xp', xp);
  fresh = order(all.filter(i => got(i) && !had.includes(i))); wear();
  $('final').textContent = fmt(game.score);
  $('stats').innerHTML = [['BEST', fmt(game.best)], ['TRICKS LANDED', game.landed], ['TOP TRICK', game.top ? `${game.top.name} · ${fmt(game.top.pts)}` : '—'], ['BIGGEST AIR', (game.airMax * FT).toFixed(1) + ' ft'], ['WIPEOUTS', game.falls], ['TOTAL XP', fmt(xp)]]
    .map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
  $('fresh').innerHTML = fresh.map((it, i) => card(it, 'new', 1 + 0.5 * i)).join('');      // each one flashes on in turn
  fresh.forEach((_, i) => setTimeout(() => { if (game.mode !== 'over') return; audio.reward(3, i); flash = 0.7; }, 1250 + 500 * i));
  const first = fresh.some(it => it.first);                 // the first run ever (it unlocks the Air Raley, and whatever its score reaches): made a big deal of
  $('fresh').classList.toggle('big', first);
  if (first) setTimeout(() => {
    if (game.mode !== 'over') return;
    audio.reward(5, 5); flash = 1; shake = 0.25;
    $('rays').classList.add('mega'); $('rays').classList.remove('go'); void $('rays').offsetWidth; $('rays').classList.add('go');
    for (const ms of [0, 250, 500, 750]) setTimeout(() => fx.stars(s.x, s.y + 1, s.z, 90, 1.5, s.vx, s.vz), ms);
  }, 1350 + 500 * fresh.length);
  $('over').classList.add('on');
  loadBoard(game.score);
}
function pop(text, sub, bad, lvl = 1) {
  const el = $('pop'), hype = ['', '', 'NICE!', 'SICK!', 'INSANE!', 'LEGENDARY!'][lvl];
  el.innerHTML = (hype ? `<em>${hype}</em>` : '') + text + (sub ? `<b>${sub}</b>` : '');
  el.style.fontSize = Math.min([38, 50, 60, 70, 84, 104][lvl], innerWidth / ui * 0.92 / (text.length * 0.52)) + 'px';   // bigger scores shout, but stay on one line
  el.className = `ui l${lvl}` + (bad ? ' bad' : ''); void el.offsetWidth; el.classList.add('go');
}
// A landed trick, level 0–5 by what the move itself is worth (before the combo multiplier): the bigger the move,
// the more of everything. Sunburst rays are kept for the big ones (4), and the biggest (5) fills the screen.
// streak = tricks landed in a row before this one: the fanfare climbs with it.
function celebrate(lvl, streak) {
  const stars = () => fx.stars(s.x, s.y, s.z, [8, 18, 32, 50, 80, 130][lvl], [0.55, 0.7, 0.85, 1, 1.25, 1.6][lvl], s.vx, s.vz);
  stars(); audio.reward(lvl, streak);
  flash = Math.max(flash, [0.1, 0.18, 0.26, 0.34, 0.5, 0.9][lvl]); shake = Math.max(shake, 0.04 * lvl);
  const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  if (lvl >= 4) { slowmo = lvl > 4 ? 0.75 : 0.3; $('rays').classList.toggle('mega', lvl > 4); restart($('rays'), 'go'); }
  if (lvl > 4) for (const ms of [180, 360, 540]) setTimeout(() => { stars(); flash = Math.max(flash, 0.5); shake = Math.max(shake, 0.12); }, ms);   // and it keeps going off
  restart($('scoreV'), 'punch');
  if (lvl >= 3) { boat.cheer(); audio.whistle(); }      // the crew saw that
}

// A landed trick: points (less for a repeat, more for every trick in a row), popup and celebration.
function award(e) {
  const repeats = e.trick ? game.recent.filter(n => n === e.name).length : 0;
  const own = e.points * [1, 0.8, 0.6][Math.min(repeats, 2)], pts = Math.round(own * game.mult / 10) * 10, streak = (game.mult - 1) * 2;
  game.score += pts;
  if (e.trick) { game.landed++; game.recent = [...game.recent.slice(-3), e.name]; if (!game.top || pts > game.top.pts) game.top = { name: e.name, pts }; }
  const lvl = own < 300 ? 0 : own < 700 ? 1 : own < 1300 ? 2 : own < 2000 ? 3 : own < 3000 ? 4 : 5;
  pop((e.clean ? 'STOMPED! ' : '') + e.name.toUpperCase(), `+${fmt(pts)}` + (game.mult > 1 ? ` · x${game.mult}` : '') + (repeats ? ' · REPEAT' : ''), false, lvl);
  if (e.trick) game.mult = Math.min(4, game.mult + 0.5);        // every trick landed in a row is worth more than the last
  celebrate(lvl, streak);
}

// ---- input ----
let quit = false;                                       // Esc in a run: stopped, asking whether to exit
const keys = new Set(), stale = new Set(), downAt = {};   // stale: the carving key, still held at take-off, doesn't start a spin
const held = c => keys.has(c) && !stale.has(c);
addEventListener('keydown', e => {
  if (document.activeElement === $('name')) {         // typing a name for the leaderboard: the keys aren't the game's
    if (e.code === 'Escape') { $('entry').classList.remove('on'); $('name').blur(); }
    return;
  }
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (quit || (e.code === 'Escape' && game.mode === 'run')) {   // Esc stops a run and asks: Y (or Enter) exits to the title, N (or Esc again) rides on
    const yes = quit && (e.code === 'KeyY' || e.code === 'Enter');
    if (!quit || yes || e.code === 'KeyN' || e.code === 'Escape') $('quit').classList.toggle('on', quit = !quit);
    if (yes) { game.mode = 'title'; setKind(game.kind); $('title').classList.add('on'); }
    keys.clear(); return;
  }
  keys.add(e.code); downAt[e.code] = e.timeStamp; audio.start();
  if (e.code === 'KeyM') audio.toggleMusic();
  const [dr, di] = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.code] || [0, 0];
  if (game.mode === 'gear') {                         // the locker: ↑ ↓ pick speakers, boats or lakes, ← → choose the next one that is unlocked
    const k = PICK[row = (row + dr + PICK.length) % PICK.length], n = GEAR[k].length;
    if (k === 'trick' && (di || demo < 0)) { const list = order(GEAR.trick).filter(got); if (list.length) { const j = list.indexOf(GEAR.trick[demo]); demo = GEAR.trick.indexOf(list[j < 0 ? 0 : (j + di + list.length) % list.length]); } }   // tricks: which one the rider shows
    else if (di) { const list = order(GEAR[k]); let j = list.indexOf(GEAR[k][worn[k]]); do j = (j + di + n) % n; while (!got(list[j])); worn[k] = GEAR[k].indexOf(list[j]); localStorage.setItem('ripperskipper.gear', JSON.stringify(worn)); wear(); }
    showGear();
  } else if (game.mode !== 'run' && di) setKind(game.kind === 'wake' ? 'surf' : 'wake');
  if (e.code === 'KeyG' && game.mode !== 'run') openGear();
  if ((e.code === 'Space' || e.code === 'Enter') && game.mode !== 'run') { game.mode === 'over' ? openGear() : startRun(); keys.delete('Space'); }
});
addEventListener('keyup', e => { keys.delete(e.code); stale.delete(e.code); });
addEventListener('blur', () => keys.clear());

function readInput() {
  if (game.mode !== 'run' && C.surf) {              // attract mode, surfing: hold the pocket, ollie into a grab now and then
    const ph = s.t % 6;
    return { steer: s.air ? 0 : clamp((surfLip(s.z) - 0.6 - s.x) * 1.5 - s.head * 1.2, -1, 1), flip: 0, pop: !s.air && ph > 5.3 && ph < 5.7 && game.mode !== 'gear', grab: s.air && s.air.t > 0.15 ? 'indy' : null };
  }
  if (game.mode === 'gear' && PICK[row] === 'trick' && demo >= 0) {   // the locker, on a trick: carve out, cut back, pop off the wake and do it — again and again
    const ph = s.t % 7.2, a = s.air, T = GEAR.trick[demo], inp = { steer: a ? 0 : ph < 3.3 ? 1 : ph < 6.9 ? -1 : 0, flip: 0, pop: !a && ph > 4.6 && ph < 5.2, grab: null };
    if (a) {
      if (a.goal === undefined && (T === SPIN720 || T === DOUBLE) && s.vy > 5.6) s.vy = Math.max(s.vy, 6.9);   // a showcase: the big jump is made the biggest, so there is time for the 720 or the double
      a.goal ??= s.vy > 6.75 ? 2 : s.vy > 5.6 ? 1.5 : 1;   // the 720 and the double roll only off the biggest take-offs; otherwise something smaller
      const end = a.goal * 2 * Math.PI - 0.6;
      if (T === RALEY) inp.grab = a.t < 0.5 ? 'raley' : null;
      else if (T === HOOCHIE) inp.grab = a.t < 0.5 ? 'hoochie' : null;
      else if (T === STALE) inp.grab = 'stale';
      else if (T === MUTE) inp.grab = 'mute';
      else if (T === TANTRUM) inp.tant = a.tant < 5.6;
      else if (T === SBEND) inp.bend = a.bend < 5.6;
      else if (T === SPIN720) { if (a.goal > 1) inp.steer = Math.abs(a.spin) < end - 0.9 ? 1 : 0; else inp.grab = 'indy'; }   // let go early: a spin this quick coasts on a long way. Off a small take-off just a grab, so the rider stays regular for the next big one
      else if (T === DOUBLE) inp.flip = a.flip < (a.goal > 1.5 ? end : 2 * Math.PI - 0.6) ? 1 : 0;
    }
    return inp;
  }
  if (game.mode !== 'run') {                        // attract mode: carve out, cut back, float a grab — in the locker, just ride along behind the boat to be looked at
    const ph = s.t % 7.2;
    return { steer: s.air || game.mode === 'gear' ? 0 : ph < 3.3 ? 1 : ph < 6.9 ? -1 : 0, flip: 0, pop: false, grab: s.air && s.air.t > 0.25 ? 'indy' : null };
  }
  const grab = held('KeyD') ? 'indy' : held('KeyA') ? 'melon' : held('KeyS') ? 'tail' : held('KeyW') ? 'nose' : held('KeyF') && got(STALE) ? 'stale' : held('KeyC') && got(MUTE) ? 'mute' : null, b = held('KeyE');
  return {
    steer: (held('ArrowRight') ? 1 : 0) - (held('ArrowLeft') ? 1 : 0),
    flip: C.surf ? 0 : (held('ArrowDown') ? 1 : 0) - (held('ArrowUp') ? 1 : 0),   // no rolls on a surfboard
    pop: (held('Space') || (held('ArrowDown') && !C.surf)) && !s.air,          // wakeboarding, ↓ is a crouch on the water and a back roll in the air
    grab: b && !C.surf && got(RALEY) ? (grab && got(HOOCHIE) ? 'hoochie' : 'raley') : grab,   // E: an Air Raley behind the boat, a Hoochie Glide with a grab key as well (once they are unlocked); a shove-it on the wave
    bend: !C.surf && held('KeyR') && got(SBEND),                             // R: an S-Bend
    up: C.surf && held('KeyQ'), shove: C.surf && b, tant: !C.surf && held('KeyQ') && got(TANTRUM),   // Q: a tantrum behind the boat (once it is unlocked), a surface 180 on the wave
    trim: C.surf ? (held('ArrowUp') ? 1 : 0) - (held('ArrowDown') ? 1 : 0) : 0,   // surfing, ↑ ↓ step forward and back on the board
  };
}

function handleEvents() {
  for (const e of s.events) {
    if (e.type === 'takeoff') {                       // ← → ↓ pressed in the last moment before the lip are a spin or roll; held for longer they were a carve or a crouch…
      const popped = s.popT > 0 && !C.surf;           // …except that popping with ← → still held is a jump and a spin in one go (not surfing: there ← → is held all the time)
      const touch = document.documentElement.classList.contains('touch');   // on a phone the thumb is always on the stick: nothing it holds at take-off spins or rolls — only a fresh push in the air
      for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowDown', ...(touch ? ['ArrowUp'] : [])]) if (keys.has(k) && (touch || performance.now() - downAt[k] > 300 && !(popped && k !== 'ArrowDown'))) stale.add(k);
    }
    else if (e.type === 'tick') {                    // a half-spin, roll or grab completed in the air
      const n = Math.min(e.n, 7);
      audio.tick(e.n); fx.stars(s.x, s.y, s.z, 4 + 2 * n, 0.45 + 0.05 * n, s.vx, s.vz); flash = Math.max(flash, 0.05);
    }
    else if (e.type === 'land') {
      stale.clear();                                  // a key held through the air goes back to carving
      const hard = clamp(e.impact / 8, 0.15, 1);
      fx.burst(s.x, s.y, s.z, 30 + 130 * hard, 0.45 + 0.6 * hard); audio.splash(0.3 + 0.7 * hard); shake = Math.max(shake, 0.12 * hard);
      if (hard > 0.6) audio.thud(0.6 * hard);         // a flat landing is heard
      water.splash(s.x, s.z, 0.45 + 0.6 * hard, 1.5 + 2.5 * hard);
      if (game.mode === 'gear' && e.points > 0) pop(e.name.toUpperCase(), '', false, 1);   // the locker's demo: name what was shown
      if (game.mode !== 'run') continue;
      game.airMax = Math.max(game.airMax, e.peak);
      if (e.points > 0) award(e);
    } else if (e.type === 'trick') {                  // a surface spin on the wave
      if (game.mode === 'run') award(e);
    } else if (e.type === 'snap') {                   // a light rope loads up hard (the catch after a landing): a twang, the arms yanked straight
      const k = clamp(e.v / 4, 0.25, 1);
      audio.twang(k); rider.state.jerk = k;
    } else if (e.type === 'crash') {
      fx.burst(s.x, s.y, s.z, 120, 0.9, s.vz); water.splash(s.x, s.z, 1, 3); audio.wipeout(); shake = 0.3; slowmo = 0.5;
      if (game.mode === 'run') { game.mult = 1; game.falls++; pop(e.why === 'lost' ? 'LOST THE WAVE!' : 'WIPEOUT!', 'COMBO LOST', true); }
    } else if (e.type === 'plunge') {                 // the cartwheel ends: straight in
      fx.burst(s.x, 0, s.z, 200, 1.15, s.vz); fx.column(s.x, 0, s.z, 110, 1, s.vz); water.splash(s.x, s.z, 1.4, 4.5);
      audio.splash(1, 1.6); audio.thud(0.7); shake = 0.4; slowmo = 0.45;
    } else if (e.type === 'surface') {
      fx.burst(s.x, 0, s.z, 40, 0.35, s.vz); water.splash(s.x, s.z, 0.7, 1.6); audio.splash(0.3);
    }
  }
  s.events.length = 0;
}

// ---- camera ----
const camPos = new THREE.Vector3(0, 3, 24), camLook = new THREE.Vector3(0, 1.2, 8), want = new THREE.Vector3(), tower = new THREE.Vector3();
let shake = 0, slowmo = 0, flash = 0, shown = 0, lift = 0;
function updateCamera(dt) {
  const y = Math.max(0, s.y), k = r => 1 - Math.exp(-dt * r), out = rider.state.raley;   // a Raley is seen from further round the side
  if (game.mode === 'run' && C.surf) {               // surfing: straight in behind the rider, a little to the trough side, so the wall stands up beside them
    want.set(s.x - 1.3, (s.crashed ? 2.0 : 1.9) + y * 0.4, s.z + (s.crashed ? 4.6 : 4.8));
    camPos.x += (want.x - camPos.x) * k(5); camPos.y += (want.y - camPos.y) * k(4); camPos.z += (want.z - camPos.z) * k(s.crashed ? 5 : 6);
    camLook.lerp(want.set(s.x + (s.crashed ? 0 : 0.6), s.crashed ? 0.4 : 0.9 + y * 0.5, s.z - (s.crashed ? 0.3 : 3)), k(7));
    if (s.crashed) { camPos.z += s.vz * dt; camLook.z += s.vz * dt; }
  } else if (game.mode === 'run') {
    want.set(s.x * 0.9 + 2.7 - 3.3 * clamp((-s.x - 1) / 7, 0, 1) + s.vx * 0.18 + 3.4 * out, (s.crashed ? 2.0 : 2.7) + y * 0.45, s.z + (s.crashed ? 5.8 : 7.2));   // sits off the rider's toe side, sliding behind them out wide on the left
    camPos.x += (want.x - camPos.x) * k(7); camPos.y += (want.y - camPos.y) * k(4); camPos.z += (want.z - camPos.z) * k(s.crashed ? 5 : 8);
    want.set(s.x * (s.crashed ? 0.92 : 0.62 + 0.3 * out), s.crashed ? 0.5 : 1.2 + y * 0.6, s.z - (s.crashed ? 1 : 6.5 - 4 * out));
    camLook.lerp(want, k(8));
    if (s.crashed) { camPos.z += s.vz * dt; camLook.z += s.vz * dt; }   // the fallen rider is left behind at boat speed: stay with them
  } else {                                           // title / results: a slow orbit that shows off rider and boat. The locker: round the boat, or back and up to take in the lake
    const a = 0.55 * Math.sin(s.t * 0.16) + 0.5, on = game.mode === 'gear' && PICK[row], atBoat = on === 'speaker' || on === 'boat', atRider = on === 'trick';   // the speakers are on the boat
    camPos.lerp(atBoat ? want.set(Math.sin(a + 0.4) * 20, 4.6, Math.cos(a + 0.4) * 20 - 3.5) : atRider ? want.set(s.x + Math.sin(a) * 11, 3.6 + y * 0.6, s.z + Math.cos(a) * 11) : on ? want.set(s.x + 9 * Math.sin(a), 7, s.z + 12) : want.set(s.x + Math.sin(a) * 6.2, 1.9 + y * 0.5, s.z + Math.cos(a) * 6.2), k(2.5));
    camLook.lerp(atBoat ? want.set(0, 1.9, -3.5) : atRider ? want.set(s.x, 2.9 + y * 0.85, s.z - 1) : on ? want.set(0, 11, -80) : want.set(s.x * 0.85, 1.0 + y * 0.7, s.z - 3), k(4));
  }
  camera.fov += ((s.crashed && game.mode === 'run' ? 31 : 38) - camera.fov) * k(4);   // push in on a fall
  lift += ((game.mode === 'gear' ? 0.34 : 0) - lift) * k(6);                         // the locker fills most of the screen: the picture slides up into the band above it
  camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * lift, innerWidth, innerHeight);
  shake *= Math.exp(-dt * 7);
  camera.position.copy(camPos).add(want.set(Math.sin(s.t * 71), Math.sin(s.t * 93), 0).multiplyScalar(shake));
  camera.lookAt(camLook);
  if (window.__cam) { camera.position.fromArray(window.__cam.pos); camera.lookAt(...window.__cam.look); }
}

// ---- HUD ----
function updateHud(dt) {
  shown += (game.score - shown) * Math.min(1, dt * 7);                   // the score counts up to its new total
  if (Math.abs(game.score - shown) < 6) shown = game.score;
  $('scoreV').textContent = fmt(Math.round(shown / 10) * 10);
  $('flash').style.opacity = flash; flash *= Math.exp(-dt * 6);
  $('multV').textContent = 'x' + game.mult;
  $('best').textContent = 'BEST ' + fmt(Math.max(game.best, game.score));
  const t = Math.max(0, Math.ceil(game.time));
  $('timeV').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  $('time').classList.toggle('low', t <= 10);
  const a = s.air, live = $('live');
  if (a && a.t > 0.3 && game.mode === 'run') {
    const parts = [], rolls = Math.round(Math.abs(a.flip) / 6.2832 + 0.2), spin = Math.round(Math.abs(a.spin) / Math.PI + 0.2) * 180;
    if (rolls) parts.push((rolls > 1 ? rolls + '× ' : '') + (a.flip > 0 ? 'BACK ROLL' : 'FRONT ROLL'));
    if (spin) parts.push(spin + '°');
    if (a.shove > 2.6) parts.push('SHOVE-IT');
    if (a.tant > 5) parts.push('TANTRUM');
    if (a.bend > 5) parts.push('S-BEND');
    for (const g in a.grabs) parts.push(GRABS[g].toUpperCase());
    parts.push(`${(a.peak * FT).toFixed(1)} FT`);
    live.textContent = parts.join(' · '); live.style.opacity = 1; live.className = 'ui';
  } else if (C.surf && game.mode === 'run' && !s.crashed && s.back > 0.5) {   // sliding back off the wave
    live.textContent = 'FALLING BEHIND — PUMP ← → ← →'; live.style.opacity = 1; live.className = 'ui warn';
  } else live.style.opacity = 0;
  $('pocketV').style.width = (C.surf && !s.crashed ? 100 * s.back : 0) + '%';
  $('fade').style.opacity = s.crashed ? clamp((s.crashT - 3.25) / 0.45, 0, 1) : Math.max(0, +$('fade').style.opacity - 0.06);
  for (const id of ['score', 'time', 'mult', 'help', 'pocket']) $(id).style.opacity = game.mode === 'run' ? 1 : 0;
  document.documentElement.classList.toggle('run', game.mode === 'run');
}

// ---- loop ----
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const last0 = last, real = Math.min(0.05, (now - last) / 1000); last = now;
  const dt = quit ? 0 : real * (window.__speed ?? 1) * (slowmo > 0 ? 1 - 0.7 * Math.min(1, slowmo / 0.2) : 1);   // a beat of slow motion on a wipeout; stopped while asking whether to exit
  slowmo -= real;
  slow = now - last0 > 24 ? slow + 1 : Math.max(0, slow - 2);      // struggling to hold 60 fps: render fewer pixels
  if (slow > 90 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); slow = 0; resize(); }
  acc += dt;
  while (acc >= STEP) { step(s, readInput(), STEP); handleEvents(); acc -= STEP; }
  if (game.mode === 'run') {
    if (C.surf && s.contact && !s.crashed) game.score += s.ride * dt;   // surfing pays by the second for staying on the wave, more the higher you ride
    if (!s.starting) game.time -= dt;                 // the clock starts once the rider is up
    if (game.time <= 0 && !s.air && !s.crashed) endRun();
  }

  boat.update(s.t, s.crashed || s.low > 0.5, s.crashed ? s.crashT : 0, audio.beat, C.surf || s.crashed ? 0 : clamp(s.x / 10, -1, 1) * Math.min(1, s.tension / 2600), s.x, s.z);
  water.boat(boat.group.position.x, boat.group.position.z, boat.group.rotation.y);
  boat.group.updateMatrixWorld(true);
  tower.fromArray(C.TOWER).applyMatrix4(boat.group.matrixWorld);
  rider.update(s, dt, tower);
  if (rider.state.skim && C.go > 0.3) fx.burst(rider.state.skim.x, rider.state.skim.y, rider.state.skim.z, 2, 0.25);   // a rope dragging in the water throws up spray
  water.update(s, dt); sky.update(s.t); shore.update(s.dist);
  fx.update(s, dt); audio.update(s);
  lights.aim(s.x * 0.5, 0, 5.5);
  updateCamera(dt); updateHud(real);
  pipeline.render();
}
// ---- touch and mouse. On a phone a stick under the left thumb, and under the right a swipe down and up to pop and buttons for the tricks, press the same keys as a keyboard would,
// and the menus have buttons to tap; with either, the modes and the locker's cards can be picked directly. ----
const key = (type, code) => dispatchEvent(new KeyboardEvent(type, { code })), root = document.documentElement;
if (matchMedia('(pointer: coarse)').matches) root.classList.add('touch');
addEventListener('touchstart', () => root.classList.add('touch'), { once: true, passive: true });
for (const t of ['touchend', 'click']) addEventListener(t, () => audio.start(), { passive: true });   // the touches an iPhone lets sound start from
addEventListener('contextmenu', e => e.preventDefault());
for (const b of document.querySelectorAll('[data-key]')) {                       // a button is a key: down while it is held
  const up = () => { if (b.classList.contains('held')) { b.classList.remove('held'); key('keyup', b.dataset.key); } };
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('held'); key('keydown', b.dataset.key); });
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
}
const DIRS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }, knob = $('knob');
let thumb = null;                                                                // where the left thumb came down: the stick's middle
function steer(dx, dy) {                                                          // far enough off the middle is a key held — further for ↑ ↓, which are not to be hit by accident while carving, and further again in the air, where it is a spin or a roll
  for (const k in DIRS) { const on = dx * DIRS[k][0] + dy * DIRS[k][1] > (DIRS[k][0] ? (s.air ? 30 : 16) : (s.air ? 50 : 36)); if (on !== keys.has(k)) key(on ? 'keydown' : 'keyup', k); }
  knob.firstChild.style.transform = `translate(${clamp(dx, -40, 40)}px, ${clamp(dy, -40, 40)}px)`;
}
$('stick').addEventListener('pointerdown', e => { e.target.setPointerCapture(e.pointerId); thumb = [e.clientX, e.clientY]; knob.style.left = e.clientX + 'px'; knob.style.top = e.clientY + 'px'; audio.start(); });
$('stick').addEventListener('pointermove', e => thumb && steer(e.clientX - thumb[0], e.clientY - thumb[1]));
for (const t of ['pointerup', 'pointercancel']) $('stick').addEventListener(t, () => { thumb = null; steer(0, 0); knob.style.left = knob.style.top = ''; });
let flick = null;                                                                // the right thumb off the buttons: drag down to load, then back up (or let go) to pop
$('flick').addEventListener('pointerdown', e => { e.target.setPointerCapture(e.pointerId); flick = { at: e.clientY, on: false }; audio.start(); });
$('flick').addEventListener('pointermove', e => {
  if (!flick) return;
  const y = e.clientY, f = flick;
  if (f.on ? f.at - y > 10 : y - f.at > 14) { f.on = !f.on; f.at = y; key(f.on ? 'keydown' : 'keyup', 'Space'); $('lane').classList.toggle('held', f.on); }
  else f.at = f.on ? Math.max(f.at, y) : Math.min(f.at, y);                     // measured from the lowest point while loading, the highest while not
});
for (const t of ['pointerup', 'pointercancel']) $('flick').addEventListener(t, () => { if (flick?.on) { key('keyup', 'Space'); $('lane').classList.remove('held'); } flick = null; });
for (const el of document.querySelectorAll('.pick span')) el.addEventListener('click', () => {      // tap a mode to choose it
  if (game.mode !== 'run' && game.mode !== 'gear' && el.classList.contains('w') !== (game.kind === 'wake')) setKind(game.kind === 'wake' ? 'surf' : 'wake');
});
$('shelf').addEventListener('click', e => {                                       // tap a card in the locker to choose it
  const it = all[e.target.closest('.card')?.dataset.n], k = PICK.find(k => GEAR[k].includes(it));
  if (!k || !got(it)) return;
  if (k === 'trick') { demo = GEAR.trick.indexOf(it); row = 0; showGear(); return; }   // a trick: the rider shows it
  worn[k] = GEAR[k].indexOf(it); row = PICK.indexOf(k); localStorage.setItem('ripperskipper.gear', JSON.stringify(worn)); wear(); showGear();
});
$('entry').addEventListener('submit', e => { e.preventDefault(); submitName(); });   // Enter in the name box, or its OK button

if (new URLSearchParams(location.search).has('surf')) setKind('surf');
if (new URLSearchParams(location.search).has('play')) startRun();
window.__game = { s, game, startRun, endRun, rider, boat };
requestAnimationFrame(frame);
