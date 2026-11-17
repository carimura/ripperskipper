// Pure simulation (no rendering) of the two ways to ride: wakeboarding on a rope, and wakesurfing the boat's wave with no rope.
// Everything lives in the boat's frame: +X right, +Y up, the boat drives toward −Z at constant speed, so still water streams by toward +Z.

export const C = {
  surf: false,               // which way of riding: set with setMode()
  V: 10,                     // boat speed, m/s (~22 mph wakeboarding, ~11 mph surfing)
  go: 1,                     // how far the boat is up to speed, 0 at rest … 1: the wake grows with it
  turn: { R: 16, zj: 0, phi: 0 },   // the boat turning back for a fallen rider: radius, where the turn began (m behind its usual place), how far round it is
  L: 17,                     // rope length, m (55 ft)
  TOWER: [0, 2.35, -2.3],    // rope attachment on the tower
  HANDLE_H: 0.95,            // the rope pulls this far above the board
  M: 80, G: 9.81,
  AOA_MAX: 0.52,             // hardest edge: board angle of attack to the water, rad
  K_LIFT: 14,                // side force  = K_LIFT * speed² * sin(aoa)
  K_DRAG: 2.8,               // drag        = (K_DRAG + K_INDUCED * sin²(aoa)) * speed²
  K_INDUCED: 20,
  LAT_MAX: 16,               // the most side force a rider can hold, m/s² per kg
  SPIN_MAX: 7.6, FLIP_MAX: 7.2, ROT_ACC: 30,
  POP_MIN: 1.0, POP_MAX: 2.6,
  LEG_EXT: 0.35,             // how far the legs can reach down to keep the board on the water, m
  LEG_RATE: 6,               // how fast bent knees straighten again, 1/s
  SOFT: 0.3,                 // share of the water's upward shove that soft knees pass on to the body
};

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrap = a => a - TAU * Math.round(a / TAU);

// ---- water surface (mirrored in GLSL in water.js — keep the two in step) ----
export const wakeHalfWidth = d => 1.15 + 0.095 * d;

export function wakeHeight(x, z) {
  const d = z;                                    // metres behind the transom
  const grow = smooth(-1, 6, d), fade = 1 - 0.55 * smooth(16, 70, d);
  const H = 0.62 * grow * fade, tr = 0.07 * grow * fade;
  const u = Math.abs(x) - wakeHalfWidth(d), dd = Math.max(d, 0);
  const wi = 1.0 + 0.02 * dd, wo = 1.5 + 0.03 * dd;
  const c = u < 0 ? Math.max(u / wi, -1) : Math.min(u / wo, 1);
  const lobe = 0.5 + 0.5 * Math.cos(Math.PI * c);
  return u < 0 ? -tr + (H + tr) * lobe : H * lobe;
}

export function swell(x, zw, t) {
  return 0.022 * Math.sin(0.55 * x + 0.5 * zw + 1.1 * t) + 0.016 * Math.sin(-0.9 * x + 0.36 * zw + 1.7 * t + 1.3);
}

// Surf mode: the boat is weighted to throw one big wave to starboard. It is a wall running back alongside the rider: the lip
// on the outside, the face sloping down towards the prop wash, building all the way back to where it breaks. Because it is
// still building, the face also tilts forward — that is what drives the board. The rider goes along it, toes to the wall.
const SURF = { A: 1.6, W: 2.4, START: 0.8, BREAK: 6.4, LOST: 12 };                  // height, width of the face, where it starts and breaks (m behind the transom)
export const surfLip = z => 2.6 + 0.05 * z;                               // the lip: a line running back from the boat's quarter, a touch outward
export function surfFace(x, z) {                                          // across the wave: 0 in the trough, 1 at the lip, 0 again beyond it
  const u = (x - surfLip(z)) / SURF.W, p = clamp(1 + u, 0, 1);
  return u < 0 ? 1 - (1 - p) ** 1.6 : 1 - smooth(0, 0.8, u);            // steep low down, easing to a rounded top: most of the face has push in it
}
export function surfHeight(x, z) {
  const f = clamp((z - SURF.START) / (SURF.BREAK - SURF.START), 0, 1);
  const size = z < SURF.BREAK ? f ** 2.5 : 1 - 0.7 * smooth(SURF.BREAK, SURF.BREAK + 10, z);
  const port = 0.28 * smooth(0.3, 1.9, -x) * (1 - smooth(2.2, 4.8, -x)) * smooth(0.8, 4.5, z) * (1 - 0.7 * smooth(4.5, 16, z));   // the washed-out side
  return SURF.A * surfFace(x, z) * size + port;
}

// When the boat turns back its wake bends with it: straight down to where the turn began, then round the arc to the boat.
// Maps a point to (across the wake, metres behind the boat along it). Mirrored in GLSL.
let wx = 0, wz = 0;
function wakeCoord(x, z) {
  const { R, zj, phi } = C.turn, qx = x - R, qz = z - zj, a = Math.atan2(-qz, -qx);
  if (phi < 1e-3) { wx = x; wz = z; }
  else if (a < 0 || a > phi + 1.5) { wx = x; wz = z - zj + R * phi; }
  else { wx = R - Math.hypot(qx, qz); wz = R * (phi - a); }
}
export function surfaceY(x, z, t, dist) {
  wakeCoord(x, z);
  return (C.surf ? surfHeight(wx, wz) : wakeHeight(wx, wz)) * C.go + swell(x, z - dist, t);
}
export function setMode(surf) { C.surf = surf; C.V = surf ? 5 : 10; C.go = 1; }
// A wakeboard run opens with a deep-water start: boat at rest, rider sat in the water behind the board.
export function beginStart(s) { s.starting = s.low = 1; C.go = C.V = 0; }

// ---- rider ----
const REST_Z = C.TOWER[2] + Math.sqrt(C.L * C.L - (C.TOWER[1] - C.HANDLE_H) ** 2) - 0.02;

export function createSim() {
  const s = { t: 0, dist: 0, events: [] };
  resetRider(s);
  return s;
}

export function resetRider(s) {
  const x = C.surf ? 1.9 : 0, z = C.surf ? 5 : REST_Z, y = C.surf ? surfaceY(x, z, s.t, s.dist) : 0;
  Object.assign(s, {
    x, y, z, vx: 0, vy: 0, vz: 0,
    yb: y, e: 0, stiff: 1, popT: 0, landT: 9,       // body height over neutral legs, leg extension (− = bent), knee stiffness
    aoa: 0, sw: false, psiV: 0,
    head: 0, U: C.V, turn: 0, turnDir: 1, turnT: 9, upHeld: false, ride: 0, back: 0, behind: 0, pump: 0, squat: 0, trim: 0,   // surfing: heading up the face, speed over the water, surface spin
    contact: true, offT: 0, air: null, ysPrev: surfaceY(x, z, s.t, s.dist),
    load: 0, impact: 0, lift: 0, tension: 280, slack: 0,
    starting: 0, low: 0,                            // wakeboard deep-water start: 1 → 0 through it, and how far down in the water the rider still is
    crashed: false, crashT: 0, plunged: false, plungeT: 0, surfaced: false, tumble: 0, tumbleV: 0, tumbleYawV: 0,
  });
}

// yaw of the board's nose (the regular rider's front foot): 0 = pointing at the boat, + = to the right
export const boardPsi = s => s.air ? s.air.psi0 + s.air.spin : s.psiV + s.aoa + (s.sw ? Math.PI : 0) + s.turn;

// inp: { steer −1..1, flip −1 (forward, over the toes) .. +1 (backward, over the heels), pop: bool, grab: name|null,
//        wakeboarding only: tant: bool (tantrum); surfing only: up: bool (surface 180), shove: bool (spin the board under the feet),
//        trim −1..1 (weight back … forward on the board) }
export function step(s, inp, dt) {
  s.t += dt; s.dist += C.V * dt;
  if (s.crashed) return stepCrash(s, dt);
  if (C.surf) return stepSurf(s, inp, dt);
  if (s.starting > 0) {                           // the boat idles, takes up the rope, then drives off: slowly at first, and the rider comes up as it gathers speed
    s.starting = Math.max(0, s.starting - dt / 5.5);
    C.go = smooth(0.86, 0.2, s.starting); C.V = 10 * C.go;
    const low = s.low = 1 - smooth(0.3, 0.85, C.go), ys = surfaceY(s.x, s.z, s.t, s.dist);
    s.y = s.yb = ys - 0.95 * low; s.ysPrev = ys; s.e = 0; s.vx = s.vy = s.vz = 0;
    s.lift = 5 * low * (1 - low) * C.go; s.tension = 300 + 1500 * low * C.go;   // the board ploughs before it planes
    if (!s.starting) { C.go = 1; C.V = 10; }
    return;
  }

  const gx = s.vx, gz = s.vz - C.V;               // velocity over the water
  const sp = Math.hypot(gx, gz) || 1e-6, dx = gx / sp, dz = gz / sp;
  s.psiV = Math.atan2(dx, -dz);

  if (!s.air) {
    const target = inp.steer * C.AOA_MAX;          // progressive edge: slow to build, quick to let go
    const rate = Math.abs(target) > Math.abs(s.aoa) && target * s.aoa >= 0 ? 2.4 : 5.5;
    s.aoa += clamp(target - s.aoa, -rate * dt, rate * dt);
    if (inp.pop) s.load = Math.min(1, s.load + dt / 0.4);
    else if (s.load > 0) {
      if (s.contact || s.offT < 0.1) { s.vy += C.POP_MIN + (C.POP_MAX - C.POP_MIN) * s.load; s.popT = 0.3; }
      s.load = 0;
    }
  } else airControl(s, inp, dt);

  if (s.contact) {
    const sa = Math.sin(clamp(s.aoa, -C.AOA_MAX, C.AOA_MAX));
    const FL = clamp(C.K_LIFT * sp * sp * sa, -C.M * C.LAT_MAX, C.M * C.LAT_MAX);
    const FD = (C.K_DRAG + C.K_INDUCED * sa * sa) * sp * sp;
    s.vx += (FL * -dz - FD * dx) / C.M * dt;      // lift acts square to the travel, drag against it
    s.vz += (FL * dx - FD * dz) / C.M * dt;
    s.lift = FL / (C.M * C.G);
  } else {
    const k = 0.3 * sp / C.M * dt;                // a little air drag
    s.vx -= k * gx; s.vz -= k * gz;
    s.lift *= Math.exp(-dt * 8);
  }

  // Knees. Standing tall (cutting in towards the boat's line, loading, popping) the wake throws the rider;
  // riding away from the line, or just after a landing, soft knees soak the wake up instead.
  const soft = s.load === 0 && s.popT <= 0 && (s.x * s.vx > 0 || s.landT < 0.5);
  s.stiff += ((soft ? C.SOFT : 1) - s.stiff) * (1 - Math.exp(-dt * 15));
  s.popT -= dt; s.landT += dt;

  s.vy -= C.G * dt;
  s.x += s.vx * dt; s.yb += s.vy * dt; s.z += s.vz * dt;

  // rope: inextensible, only pulls
  const T = C.TOWER, cx = s.x - T[0], cy = s.yb + C.HANDLE_H - T[1], cz = s.z - T[2];
  const d = Math.hypot(cx, cy, cz);
  let pull = 0;
  if (d > C.L) {
    const k = C.L / d, nx = cx / d, ny = cy / d, nz = cz / d;
    s.x = T[0] + cx * k; s.z = T[2] + cz * k;
    if (!s.contact) s.yb = T[1] + cy * k - C.HANDLE_H;
    const vr = s.vx * nx + s.vy * ny + s.vz * nz;
    if (vr > 0) { s.vx -= vr * nx; s.vz -= vr * nz; if (!s.contact) s.vy -= vr * ny; pull = C.M * vr / dt; }
  }
  s.tension += (Math.min(pull, 4000) - s.tension) * (1 - Math.exp(-dt / 0.06));
  s.slack = Math.max(0, C.L - d);
  // The line going light (in the air, mostly) and loading up hard again within a moment is felt as a jolt: a 'snap', sent once that load has peaked.
  s.lightT = s.tension < 500 ? 0 : (s.lightT ?? 9) + dt;
  if (s.tension > 1900 && (s.lightT < 0.45 || s.top)) s.top = Math.max(s.top || 0, s.tension);
  if (s.top && s.tension < 0.97 * s.top) { s.events.push({ type: 'snap', v: (s.top - 1500) / 300 }); s.top = 0; s.lightT = 9; }

  // Water contact. The body (yb) rides on legs above the board (y); e is the leg extension. On the water the
  // board stays on the surface while the legs can reach it; the body is only held up once the legs are bent.
  const ys = surfaceY(s.x, s.z, s.t, s.dist), vs = (ys - s.ysPrev) / dt;
  if (s.contact) {
    s.e = s.yb - ys;
    const softness = 1 - (s.stiff - C.SOFT) / (1 - C.SOFT);
    if (s.e < 0) {
      // Stiff legs pass the water's shove straight on and spring back at once. Soft knees pass on a share of it
      // and stay bent while the water is still rising, then straighten as it falls away — so the body stays level.
      const give = softness * smooth(0.1, 0.6, vs);
      s.vy = Math.max(s.vy, (vs > 0 ? s.stiff : 1) * vs - (1 - give) * C.LEG_RATE * s.e);
      if (s.e < -0.45) { s.yb = ys - 0.45; s.e = -0.45; s.vy = Math.max(s.vy, vs); }
    }
    s.y = ys;
    if (s.e > (s.popT > 0 ? 0.1 : C.LEG_EXT + 0.25 * softness)) { s.contact = false; s.offT = 0; }   // legs straight and still rising: the board leaves the water
  } else {
    s.e *= Math.exp(-dt * 6);                        // the board comes up under the body
    s.y = s.yb - s.e; s.offT += dt;
    if (s.y <= ys) {
      const impact = vs - s.vy;
      s.contact = true; s.y = ys; s.e = s.yb - ys; s.offT = 0;
      if (s.air) { s.landT = 0; land(s, impact); }
    } else if (!s.air && (s.y - ys > 0.12 || s.offT > 0.06)) takeoff(s);
  }
  s.ysPrev = ys;
  s.impact *= Math.exp(-dt * 5);
  if (s.air) { s.air.t += dt; s.air.peak = Math.max(s.air.peak, s.y); }
}

function takeoff(s) {
  const psi0 = s.psiV + s.aoa + (s.sw ? Math.PI : 0);
  const lx = Math.sin(psi0), lz = -Math.cos(psi0);          // the rider's front-foot direction
  s.air = {
    t: 0, peak: s.y, spin: 0, flip: 0, spinV: 0, flipV: 0, psi0, sw0: s.sw,
    axis: [-lx, 0, -lz],                                     // +flip about this = rolling back over the heels
    toeside: s.vx * -lz + s.vz * lx > 0,                     // travelling toes-first?
    x0: s.x, vx0: s.vx, grab: null, grabs: {}, n: 0, ext: 0, shove: 0, shoveV: 0, bend: 0, bendV: 0,
    tant: 0, tantV: 0, axis2: s.vx ? [0, 0, Math.sign(s.vx)] : [lz, 0, -lx],   // tantrum: a backflip end over end along the line across the wake
  };
  s.load = 0;
  s.events.push({ type: 'takeoff', vy: s.vy, vx: s.vx });
}

function airControl(s, inp, dt) {
  const a = s.air, acc = C.ROT_ACC * dt;
  a.spinV += clamp(inp.steer * C.SPIN_MAX - a.spinV, -acc, acc);
  a.flipV += clamp(inp.flip * C.FLIP_MAX - a.flipV, -acc, acc);
  a.spin += a.spinV * dt; a.flip += a.flipV * dt;
  // with the keys released, settle onto the nearest clean landing position if it is close (surfing, on a loose board: from anywhere but nearly sideways)
  const reach = C.surf ? 1.2 : 0.7;
  const settle = (v, unit, on) => { const e = unit * Math.round(v / unit) - v; return on && Math.abs(e) < reach ? v + e * Math.min(1, 7 * dt) : v; };
  a.spin = settle(a.spin, Math.PI, !inp.steer);
  a.flip = settle(a.flip, TAU, !inp.flip);
  a.tantV += clamp((inp.tant ? 8.4 : 0) - a.tantV, -acc, acc);                    // a tantrum snaps round quicker than a roll
  a.tant = settle(a.tant + a.tantV * dt, TAU, !inp.tant);
  a.shoveV += clamp((inp.shove ? 11 : 0) - a.shoveV, -2 * acc, 2 * acc);          // surfing: the loose board spun under the feet
  a.shove = settle(a.shove + a.shoveV * dt, Math.PI, !inp.shove);
  const g = a.t > 0.12 && inp.grab ? inp.grab : null;
  a.bendV += clamp((inp.bend && a.ext > 0.4 ? 14 : 0) - a.bendV, -2 * acc, 2 * acc);          // S-Bend: laid out like a Raley, the body rolls right over about the rope
  a.bend = settle(a.bend + a.bendV * dt, TAU, !inp.bend);
  const n = Math.floor((Math.abs(a.spin) + 0.4) / Math.PI) + Math.floor((Math.abs(a.flip) + 0.6) / TAU) + Math.floor((a.tant + 0.6) / TAU) + Math.floor((a.bend + 0.6) / TAU) + Math.floor((a.shove + 0.4) / Math.PI) + Object.keys(a.grabs).length + (g && !a.grabs[g] ? 1 : 0);
  if (n > a.n) { a.n = n; s.events.push({ type: 'tick', n }); }      // another half-spin, roll or grab ticked off
  a.grab = g;
  if (a.grab) a.grabs[a.grab] = (a.grabs[a.grab] || 0) + dt;
  a.ext = clamp(a.ext + (g === 'raley' || g === 'hoochie' || inp.bend ? dt / 0.25 : -dt / 0.3), 0, 1);   // Air Raley (and what is built on it): how far the body is laid out behind the handle
}

function land(s, impact) {
  const a = s.air; s.air = null;
  let d = wrap(a.psi0 + a.spin - s.psiV);
  const sw = Math.abs(d) > Math.PI / 2;
  if (sw) d = wrap(d - Math.PI);
  const flipErr = Math.max(Math.abs(a.flip - TAU * Math.round(a.flip / TAU)), Math.abs(a.tant - TAU * Math.round(a.tant / TAU)), Math.abs(a.bend - TAU * Math.round(a.bend / TAU)));
  if (flipErr > 0.95 || Math.abs(d) > 1.0 || a.ext > 0.35) return crash(s, a);   // upside down, sideways, or still laid out
  s.sw = sw; s.aoa = d; s.impact = clamp(impact / 8, 0, 1);
  const w2w = Math.sign(a.vx0) === -Math.sign(a.x0) && Math.sign(s.x) === -Math.sign(a.x0)
    && Math.abs(a.x0) > 0.5 * wakeHalfWidth(s.z) && Math.abs(s.x) > wakeHalfWidth(s.z) - 0.3;
  s.events.push({ type: 'land', impact, airT: a.t, peak: a.peak, ...score(a, w2w, flipErr < 0.3 && Math.abs(d) < 0.3) });
}

function crash(s, a, why) {
  Object.assign(s, { crashed: true, crashT: 0, contact: false, load: 0, plunged: false, plungeT: 0, surfaced: false, turn: 0 });
  const over = Math.abs(a.tant - TAU * Math.round(a.tant / TAU)) > 0.95;        // came down part-way through a tantrum: it carries on over that way
  s.tumbleAxis = over ? a.axis2 : a.axis; s.tumbleYaw = a.psi0 + a.spin; s.tumble = over ? a.tant : a.flip;
  s.tumbleV = 8 * (over ? 1 : Math.abs(a.flipV) > 1 ? Math.sign(a.flipV) : Math.random() < 0.5 ? -1 : 1);
  s.tumbleYawV = (Math.random() - 0.5) * 5;
  s.vy = 1.1; s.y += 0.05; s.vx *= 0.6;            // catches an edge: slaps down, tumbles over once in the water…
  s.events.push({ type: 'crash', airT: a.t, why });
}

function stepCrash(s, dt) {
  s.crashT += dt; s.tension = 0; s.lift = 0;
  const ys = surfaceY(s.x, s.z, s.t, s.dist);
  if (!s.plunged) {
    const k = Math.exp(-dt * 2.5);                 // the water has hold of the rider already
    s.vy -= C.G * dt; s.vx *= k; s.vz = C.V + (s.vz - C.V) * k;
    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
    s.tumble += s.tumbleV * dt; s.tumbleYaw += s.tumbleYawV * dt;
    if (s.vy < 0 && s.y <= ys - 0.1) { s.plunged = true; s.events.push({ type: 'plunge' }); }      // …and goes under
  } else {
    s.plungeT += dt;
    const k = Math.exp(-dt * 4);                   // the water stops the rider dead while the boat drives on
    s.vx *= k; s.vz = C.V + (s.vz - C.V) * k;
    s.x += s.vx * dt; s.z += s.vz * dt;
    const under = s.plungeT < 0.9;                 // right under, then the vest floats the rider back up
    const target = ys - (under ? 1.9 : (C.surf ? 1.15 : 0.95) + 0.04 * Math.sin(s.plungeT * 4));
    s.y += (target - s.y) * (1 - Math.exp(-dt * (under ? 7 : 3.5)));
    s.tumbleV *= Math.exp(-dt * 6); s.tumbleYawV *= Math.exp(-dt * 4);
    s.tumble += s.tumbleV * dt + (TAU * Math.round(s.tumble / TAU) - s.tumble) * (1 - Math.exp(-dt * 4));   // rights itself under water
    s.tumbleYaw += s.tumbleYawV * dt;
    if (!s.surfaced && s.plungeT > 1.05) { s.surfaced = true; s.events.push({ type: 'surface' }); }
  }
  if (s.crashT > 3.7) { resetRider(s); s.events.push({ type: 'respawn' }); }
}

// ---- wakesurfing ----
// No rope: the board is driven by the forward tilt of the face and dragged back by the water. High on the face there is more
// push than drag; low down, in the prop wash, or sideways in a spin there is less — so the rider slides back, and past the
// break the white water still shoves, but not enough to hold a rider: they slip back through it, and a few metres on the
// wave is gone. ← → point the board down or up the face: dropping down it gathers speed, climbing spends it — and working
// it from rail to rail (pumping) drives it forward, which is how to get back up to the pocket.
const S = { DRAG: 2.5, TURN: 1.8, HEAD: 0.28, SLIP: 0.006, PUMP: 2.2, SEEK: 0.9, TRIM: 0.8, LIP: 1.6, FOAM: 0.55, POP_MIN: 2.3, POP_MAX: 3.8, FRONT: 1.55 };

function stepSurf(s, inp, dt) {
  const gx = s.vx, gz = s.vz - C.V, sp = Math.hypot(gx, gz) || 1e-6;
  s.psiV = Math.atan2(gx / sp, -gz / sp);
  s.popT -= dt; s.landT += dt; s.turnT += dt; s.impact *= Math.exp(-dt * 5); s.tension = 0; s.slack = 0;
  if (s.air) {
    const near = s.vy < 0 && s.y - surfaceY(s.x, s.z, s.t, s.dist) < -0.15 * s.vy;   // the water is a moment away: the rider stops turning and squares the board up to land, whatever is held
    airControl(s, near ? { ...inp, steer: 0, shove: false } : inp, dt);
    s.pump *= Math.exp(-dt * 5); s.squat = 0;
    if (s.air.lip) s.vx += (surfLip(s.z) - 0.7 - s.x) * 2.5 * dt;            // off the lip: out over the top, and back in to the face
    s.vy -= C.G * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.yb = s.y;
    s.air.t += dt; s.air.peak = Math.max(s.air.peak, s.y);
    const ys = surfaceY(s.x, s.z, s.t, s.dist);
    if (s.vy < 0 && s.y <= ys) { s.y = s.yb = s.ysPrev = ys; s.contact = true; s.landT = 0; landSurf(s, -s.vy); }
    return;
  }
  const e = 0.2, Y = (x, z) => surfaceY(x, z, s.t, s.dist);
  const hx = (Y(s.x + e, s.z) - Y(s.x - e, s.z)) / (2 * e), hz = (Y(s.x, s.z + e) - Y(s.x, s.z - e)) / (2 * e);
  const head0 = s.head, face = surfFace(s.x, s.z), foam = smooth(SURF.BREAK - 0.3, SURF.BREAK + 0.5, s.z);
  s.head += clamp(inp.steer * S.HEAD - s.head, -S.TURN * dt, S.TURN * dt);
  s.pump += (Math.min(1, Math.abs(s.head - head0) / dt / S.TURN) - s.pump) * (1 - Math.exp(-dt * 5));   // how hard the rider is pumping, 0…1
  s.squat = s.pump * (0.5 - 0.5 * s.head / S.HEAD);                        // …and the body with it: down over the knees as the board drops, up tall as it climbs
  if (inp.up && !s.upHeld && !s.turn && !s.load) { s.turnDir = inp.steer < 0 ? -1 : 1; s.turn = 1e-3 * s.turnDir; }   // surface 180: slide the tail round
  s.upHeld = inp.up;
  if (s.turn) {
    s.turn += s.turnDir * 7 * dt;
    if (Math.abs(s.turn) >= Math.PI) {
      const full = s.turnT < 1.7;                                          // the second half, straight after the first: a 360
      s.turn = 0; s.sw = !s.sw; s.turnT = full ? 9 : 0;
      s.events.push({ type: 'trick', name: full ? 'Surface 360' : 'Surface 180', trick: true, clean: false, points: full ? 500 : 250 });
    }
  }
  // speed along the board: the slope drives it, the water drags at it — hardest in the prop wash and while the board is sideways
  const drag = S.DRAG * (s.U / C.V) ** 2 * (1 + 0.5 * (1 - smooth(0.2, 0.9, s.x)) * (1 - foam) + (s.turn ? 0.5 : 0));
  const push = C.G * hz * (1 - foam) + S.FOAM * S.DRAG * Math.max(face, 0.6) * foam, pump = s.turn ? 0 : S.PUMP * Math.abs(s.head - head0) / dt;
  s.trim = inp.trim || 0;                                                  // stepping forward on the board trims it to run a little faster, back a little slower: fine position, not rescue
  s.U = clamp(s.U + (push * Math.cos(s.head) - C.G * hx * Math.sin(s.head) + pump + S.TRIM * s.trim - drag) * dt, 2.5, 8);
  s.vx = C.V * Math.sin(s.head) - S.SLIP * C.G * hx + S.SEEK * s.pump * clamp(surfLip(s.z) - 0.8 - s.x, -1.5, 1.5);   // across the face at a steady rate; a pumping rider works back towards the wave
  s.vz = C.V - s.U * Math.cos(s.head);
  s.x += s.vx * dt; s.z += s.vz * dt;
  if (s.z < S.FRONT) { s.z = S.FRONT; s.U = Math.min(s.U, C.V); }          // right up behind the platform: nowhere further to go
  const top = surfLip(s.z) + 0.1;                                          // the lip holds the board: it can ride the top but not go over
  if (s.x > top) s.x = top;
  const ys = Y(s.x, s.z), vs = (ys - s.ysPrev) / dt;
  s.y = s.yb = s.ysPrev = ys; s.vy = 0; s.lift = 1.3 * s.head;
  if (inp.pop && !s.turn) s.load = Math.min(1, s.load + dt / 0.35);
  else if (s.load > 0) {                                                   // ollie: off the water with whatever climb the face was giving
    const lip = face > 0.8 && s.head > 0.1;                                // popped near the top while climbing: launched off the lip, higher and out over it
    s.vy = Math.max(0, vs) + S.POP_MIN + (S.POP_MAX - S.POP_MIN) * s.load + (lip ? S.LIP : 0); s.popT = 0.3; s.contact = false;
    takeoff(s); s.air.lip = lip;
  }
  s.back = clamp((s.z - 5.6) / (SURF.LOST - 5.6), 0, 1);                   // 0 in the pocket … 1 the wave is gone
  s.behind = Math.max(s.behind, s.back);                                   // getting back to the pocket from well behind is worth points: more, the further back it was from
  if (!s.back) { if (s.behind > 0.35) s.events.push({ type: 'trick', name: 'Wave Saved', trick: false, clean: false, points: Math.round(15 + 45 * s.behind) * 10 }); s.behind = 0; }
  s.ride = s.z < SURF.BREAK ? 5 + 25 * face * face : 0;                    // points a second: more for riding high
  if (s.z > SURF.LOST || s.x > 6.5 || s.x < -2.5) {
    const psi = boardPsi(s);
    crash(s, { axis: [-Math.sin(psi), 0, Math.cos(psi)], psi0: psi, spin: 0, flip: 0, flipV: 0, t: 0 }, 'lost');
  }
}

function landSurf(s, impact) {
  const a = s.air; s.air = null;
  let d = wrap(a.psi0 + a.spin - s.psiV);
  const sw = Math.abs(d) > Math.PI / 2;
  if (sw) d = wrap(d - Math.PI);
  const off = Math.abs(a.shove - Math.PI * Math.round(a.shove / Math.PI));  // the board has to be pointing along the wave again
  if (Math.abs(d) > 1.3 || off > 1.3) return crash(s, a);                  // forgiving: only a board that comes down nearly sideways throws the rider
  s.sw = sw; s.impact = clamp(impact / 6, 0, 1); s.U = Math.max(3, s.U - 0.12 * impact);   // a landing scrubs a little speed
  s.events.push({ type: 'land', impact, airT: a.t, peak: a.peak, ...scoreSurf(a, Math.abs(d) < 0.3 && off < 0.3) });
}

const SURF_SPIN = [0, 400, 1100, 2000], SURF_SHOVE = [0, 350, 900, 1600];
function scoreSurf(a, clean) {
  const halves = Math.round(a.spin / Math.PI), nS = Math.min(Math.abs(halves), 3), nB = Math.min(Math.round(a.shove / Math.PI), 3), parts = [];
  let pts = SURF_SPIN[nS] + SURF_SHOVE[nB];
  if (nS) parts.push(`${(halves < 0) !== a.sw0 ? 'Frontside' : 'Backside'} Air ${nS * 180}`);
  if (nB) parts.push(['', 'Shove-It', '360 Shove-It', '540 Shove-It'][nB]);
  if (!parts.length && a.t > 0.3) parts.push(a.lip ? 'Lip Air' : a.t > 0.62 ? 'Big Air' : 'Ollie');
  else if (a.lip) parts.push('Off the Lip');
  if (a.lip) pts += 250;
  if (a.sw0 && parts.length) { parts[0] = 'Switch ' + parts[0]; pts *= 1.25; }
  let grabbed = false;
  for (const g in a.grabs) if (a.grabs[g] > 0.12) { grabbed = true; parts.push(GRABS[g]); pts += 200 + Math.min(400, 600 * a.grabs[g]); }
  if (a.t > 0.3) pts += 60 + a.t * 100;
  if (clean && (nS || nB)) pts *= 1.2;
  return { name: parts.join(' + '), trick: nS > 0 || nB > 0 || grabbed || !!a.lip, points: Math.round(pts / 10) * 10, clean: clean && (nS > 0 || nB > 0), w2w: false };
}

// ---- trick naming and points ----
const SPIN_PTS = [0, 150, 400, 800, 1400, 2200, 3200, 4500];
const FLIP_PTS = [0, 600, 1800, 4000], TANT_PTS = [0, 900, 2600];
const COMBOS = {
  'Backroll': ['', 'Roll to Revert', 'Mobius', 'Mobius 540', 'Mobius 720'],
  'Front Roll': ['', 'Scarecrow', 'Crow Mobe', 'Crow Mobe 540', 'Crow Mobe 720'],
  'Front Flip': ['', 'Bel Air', 'Slim Chance'],
  'Toeside Backroll': ['', 'Half Cab Roll', 'Pete Rose'],
};
export const GRABS = { indy: 'Indy', melon: 'Melon', tail: 'Tail Grab', nose: 'Nose Grab', stale: 'Stalefish', mute: 'Mute', raley: 'Air Raley', hoochie: 'Hoochie Glide' };
const LAID = { raley: 400, hoochie: 700 };          // the laid-out ones: they take longer to count, and pay more

function score(a, w2w, clean) {
  const halves = Math.round(a.spin / Math.PI), flips = Math.round(a.flip / TAU);
  const nS = Math.min(Math.abs(halves), SPIN_PTS.length - 1), nF = Math.min(Math.abs(flips), FLIP_PTS.length - 1);
  const nT = Math.min(Math.round(a.tant / TAU), TANT_PTS.length - 1), parts = [];
  let pts = 0, name = '';
  if (nT && !nF) {                                 // tantrum, and what a spin on top of it is called
    name = (nT > 1 ? 'Double ' : '') + (nS ? ['', 'Tantrum to Blind', 'Whirlybird'][nS] || `Tantrum ${nS * 180}` : 'Tantrum');
    pts = (TANT_PTS[nT] + SPIN_PTS[nS]) * (nS ? 1.4 : 1);
  } else if (nF) {
    const natural = (flips > 0) !== a.toeside;     // heels-first rolls back, toes-first rolls forward
    const base = flips > 0 ? (a.toeside ? 'Toeside Backroll' : 'Backroll') : (a.toeside ? 'Front Roll' : 'Front Flip');
    name = nS ? COMBOS[base][nS] || `${base} ${nS * 180}` : base;
    if (nF > 1) name = ['', '', 'Double ', 'Triple '][nF] + name;
    pts = FLIP_PTS[nF] * (natural ? 1 : 1.3) + SPIN_PTS[nS];
    if (nS) pts *= 1.4;
  } else if (nS) {
    const frontside = (halves < 0) !== a.sw0;
    name = `${frontside ? 'Frontside' : 'Backside'} ${nS * 180}`;
    pts = SPIN_PTS[nS];
  } else if (a.t > 0.55) { name = a.peak > 1.6 ? 'Huge Air' : 'Wake Jump'; }
  if (a.sw0 && name) { name = 'Switch ' + name; pts *= 1.25; }
  if (name) parts.push(name);
  if (nT && nF) { parts.push((nT > 1 ? 'Double ' : '') + 'Tantrum'); pts += TANT_PTS[nT]; }
  let grabbed = false;
  const nB = Math.min(Math.round(a.bend / TAU), 2);
  if (nB) { parts.push((nB > 1 ? 'Double ' : '') + 'S-Bend'); pts += [0, 1200, 3200][nB]; }
  for (const g in a.grabs) if (a.grabs[g] > (LAID[g] ? 0.25 : 0.12)) { grabbed = true; parts.push(GRABS[g]); pts += LAID[g] ? LAID[g] + Math.min(800, 800 * a.grabs[g]) : 150 + Math.min(450, 300 * a.grabs[g]); }
  if (a.t > 0.55) pts += a.t * 100 + Math.max(0, a.peak - 0.6) * 80;
  if (w2w && a.t > 0.5) { parts.push('Wake to Wake'); pts += 300; }
  if (clean && pts > 0 && (nF || nS || nT || nB)) pts *= 1.2;
  return { name: parts.join(' + '), trick: nF > 0 || nS > 0 || nT > 0 || nB > 0 || grabbed, points: Math.round(pts / 10) * 10, clean: clean && (nF > 0 || nS > 0 || nT > 0), w2w };
}
