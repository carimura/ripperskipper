// The rider, modelled and posed in code. No skeleton: every frame the pose is solved from the
// simulation (board on the water, hips over the board, two-bone IK for legs and arms, both hands
// on the handle) and each body part is placed between its joints.
//
// Rider space = board space: +X toes / the way the chest faces, +Y up, −Z the front (left) foot.
import * as THREE from 'three';
import { toon, ink, newId, noInk } from './gfx.js';
import { C, boardPsi, surfaceY } from './physics.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const THIGH = 0.43, SHIN = 0.42, UPPER = 0.29, FORE = 0.26, GRIP = 0.07, ANKLE_Y = 0.165, STANCE = 0.29;
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);

// ---- geometry ----
// Closed tube through elliptical rings [y, rx, rz, cx, cz] (rx along X = depth, rz along Z = width).
function loft(rings, seg = 18, colorAt) {
  rings = [...rings].sort((a, b) => a[0] - b[0]);
  const pos = [], col = [], idx = [], n = rings.length;
  rings.forEach(([y, rx, rz = rx, cx = 0, cz = 0], i) => {
    for (let j = 0; j < seg; j++) {
      const a = j / seg * Math.PI * 2;
      pos.push(cx + rx * Math.cos(a), y, cz + rz * Math.sin(a));
      if (colorAt) col.push(...colorAt(y, a));
    }
    if (i < n - 1) for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + (j + 1) % seg, c = a + seg, d = b + seg;
      idx.push(a, c, b, b, c, d);
    }
  });
  const cap = (ring, top) => {
    const [y, , , cx = 0, cz = 0] = rings[ring], c = pos.length / 3;
    pos.push(cx, y, cz); if (colorAt) col.push(...colorAt(y, 0));
    for (let j = 0; j < seg; j++) { const a = ring * seg + j, b = ring * seg + (j + 1) % seg; top ? idx.push(c, b, a) : idx.push(c, a, b); }
  };
  cap(0, false); cap(n - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (colorAt) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// Double the rings at the given heights so a colour band gets a hard edge instead of a gradient.
function cut(rings, at) {
  const out = rings.map(r => [...r, 0, 0, 0].slice(0, 5));
  for (const y of at) {
    const i = out.findIndex(r => r[0] > y), a = out[i - 1], b = out[i], k = (y - a[0]) / (b[0] - a[0]);
    const mid = a.map((v, j) => v + (b[j] - v) * k);
    out.splice(i, 0, [y - 1e-4, ...mid.slice(1)], [y + 1e-4, ...mid.slice(1)]);
  }
  return out;
}
// A limb hangs down −Y from its joint: stations are [distance along the bone, rx, rz, cx, cz].
const limb = (st, seg = 14, colorAt) => loft(st.map(([t, rx, rz = rx, cx = 0, cz = 0]) => [-t, rx, rz, cx, cz]), seg, colorAt);
const ball = (r, sx = 1, sy = 1, sz = 1) => new THREE.SphereGeometry(r, 16, 12).scale(sx, sy, sz);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function boardGeo(top) {
  const NU = 32, NV = 8, pos = [], uv = [], idx = [];
  for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) {
    const u = i / NU * 2 - 1, v = j / NV * 2 - 1;
    const w = 0.215 * (1 - 0.13 * u * u) * Math.sqrt(1 - Math.abs(u) ** 5);
    pos.push(v * w, 0.085 * Math.abs(u) ** 2.3 + (top ? 0.022 : 0), u * 0.69);
    uv.push(i / NU, top ? 1 - j / NV : j / NV);
    if (i < NU && j < NV) { const a = i * (NV + 1) + j, b = a + 1, c = a + NV + 1, d = c + 1; top ? idx.push(a, c, b, b, c, d) : idx.push(a, b, c, b, d, c); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function headGeo(scale = 1, hairOnly = false) {
  const g = new THREE.SphereGeometry(1, 28, 20), p = g.attributes.position, keep = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    keep.push(y - 0.8 * x > 0.14);                               // hairline: over the crown and down the back
    let sx = 0.106, sy = 0.126, sz = 0.089;
    if (y < 0) { const t = -y; sz *= 1 - 0.34 * t ** 1.5; sx *= x < 0 ? 1 - 0.5 * t : 1 - 0.1 * t * t; sy = 0.136; }
    p.setXYZ(i, x * sx * scale + (y < 0 ? 0.012 * -y : 0), y * sy * scale, z * sz * scale);
  }
  if (hairOnly) { const src = g.index.array, idx = []; for (let i = 0; i < src.length; i += 3) if (keep[src[i]] && keep[src[i + 1]] && keep[src[i + 2]]) idx.push(src[i], src[i + 1], src[i + 2]); g.setIndex(idx); }
  g.computeVertexNormals();
  return g;
}

// ---- solver helpers ----
const _m = new THREE.Matrix4(), _a = V(), _b = V(), _c = V(), _d = V(), _p = V();
// Place a part built along −Y so it runs from → to, with its +X turned towards `front`.
function aim(obj, from, to, front) {
  _b.subVectors(from, to).normalize();
  _c.crossVectors(front, _b); if (_c.lengthSq() < 1e-6) _c.crossVectors(Z, _b); _c.normalize();
  _a.crossVectors(_b, _c);
  obj.quaternion.setFromRotationMatrix(_m.makeBasis(_a, _b, _c));
  obj.position.copy(from);
}
// Two-bone IK: finds the knee/elbow between root and target (target is pulled back into reach).
function ik(root, target, l1, l2, pole, joint) {
  _d.subVectors(target, root);
  const d = clamp(_d.length(), Math.abs(l1 - l2) + 0.02, l1 + l2 - 0.004);
  _d.normalize();
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d)); if (_p.lengthSq() < 1e-6) _p.set(0, 0, 1); _p.normalize();
  joint.copy(root).addScaledVector(_d, x).addScaledVector(_p, h);
  target.copy(root).addScaledVector(_d, d);
}
const quat = (axis, angle) => new THREE.Quaternion().setFromAxisAngle(axis, angle);

export function createRider(scene) {
  const root = new THREE.Group();
  const skinId = newId(), shortsId = newId(), vestId = newId(), hairId = newId(), boardId = newId(), bootId = newId(), handleId = newId();
  const M = {
    skin: toon(0xe2a274, { rim: 0.6 }), shorts: toon(0xffffff, { rim: 0.5, params: { vertexColors: true } }), vest: toon(0xffffff, { rim: 0.6, params: { vertexColors: true } }),
    hair: toon(0xf4c84a, { rim: 0.5, params: { side: THREE.DoubleSide } }), boot: toon(0x272b36, { rim: 0.5, spec: 0.2 }), strap: toon(0xf2f4f8, { rim: 0.3 }),
    grip: toon(0x23262e, { rim: 0.3 }), red: toon(0xe8262e, { rim: 0.3 }), rail: toon(0x1d2030, { rim: 0.3 }),
  };
  const part = (geo, mat, id, parent = root) => { const m = ink(new THREE.Mesh(geo, mat), id); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };

  // ---- board, fins, boots ----
  const topTex = canvasTex(1024, 320, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#ff7a18'); g.addColorStop(0.5, '#ffd21f'); g.addColorStop(1, '#ff7a18');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#15171f'; for (const x of [0, w]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + (x ? -230 : 230), 0); c.lineTo(x + (x ? -110 : 110), h); c.lineTo(x, h); c.fill(); }
    c.fillStyle = '#fff'; for (const x of [250, w - 285]) c.fillRect(x, 0, 35, h);
    c.fillStyle = '#15171f'; c.font = 'italic 900 150px Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('RIPPER', w / 2, h / 2 + 8);
  });
  const baseTex = canvasTex(1024, 320, (c, w, h) => {
    c.fillStyle = '#f6f7fb'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e8262e'; c.beginPath(); c.moveTo(0, h); c.lineTo(420, 0); c.lineTo(640, 0); c.lineTo(220, h); c.fill();
    c.fillStyle = '#15171f'; c.beginPath(); c.moveTo(300, h); c.lineTo(720, 0); c.lineTo(800, 0); c.lineTo(380, h); c.fill();
    c.font = 'italic 900 170px Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('SKIPPER', w * 0.68, h / 2 + 8);
  });
  const boardG = new THREE.Group(); root.add(boardG);
  part(boardGeo(true), toon(0xffffff, { spec: 0.35, shine: 30, params: { map: topTex } }), boardId, boardG);
  part(boardGeo(false), toon(0xffffff, { spec: 0.35, shine: 30, params: { map: baseTex } }), boardId, boardG);
  const rail = boardGeo(true), rp = rail.attributes.position, railIdx = [];
  // the rail: stitch the outline of the top sheet to the base
  { const NU = 32, NV = 8, edge = []; for (let i = 0; i <= NU; i++) edge.push(i * (NV + 1)); for (let i = NU; i >= 0; i--) edge.push(i * (NV + 1) + NV);
    const pos = []; edge.forEach(e => { pos.push(rp.getX(e) * 1.01, rp.getY(e), rp.getZ(e) * 1.005, rp.getX(e) * 1.01, rp.getY(e) - 0.022, rp.getZ(e) * 1.005); });
    for (let i = 0; i < edge.length; i++) { const a = i * 2, b = a + 1, c = (i + 1) % edge.length * 2, d = c + 1; railIdx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(railIdx); g.computeVertexNormals();
    part(g, toon(0x1d2030, { params: { side: THREE.DoubleSide } }), boardId, boardG); }
  for (const z of [-0.56, 0.56]) for (const x of [-0.13, 0.13])
    part(new THREE.ConeGeometry(0.035, 0.07, 4).scale(0.25, 1, 1).rotateX(Math.PI).translate(x, 0.018, z), M.rail, boardId, boardG);
  // the board again, loose: when a surfer falls it leaves without them
  const loose = new THREE.Group(); loose.visible = false; scene.add(loose);
  for (const m of boardG.children) { const c = ink(new THREE.Mesh(m.geometry, m.material), boardId); c.castShadow = true; loose.add(c); }
  const boots = [], feet = [];                                     // bound in for wakeboarding, bare for surfing
  for (const side of [-1, 1]) {                                    // −1 = front (left) foot
    const f = new THREE.Group(); f.position.set(0, 0.022, side * STANCE); f.rotation.y = -side * 0.21; f.visible = false; root.add(f); feet.push(f);
    part(ball(1, 0.118, 0.044, 0.052).translate(0.04, 0.05, 0), M.skin, skinId, f);
    part(ball(0.05).translate(-0.035, 0.115, 0), M.skin, skinId, f);
    const b = new THREE.Group(); b.position.set(0, 0.022, side * STANCE); b.rotation.y = -side * 0.21; root.add(b); boots.push(b);
    part(new THREE.BoxGeometry(0.32, 0.016, 0.17).translate(0.01, 0.008, 0), M.grip, bootId, b);
    part(ball(1, 0.155, 0.062, 0.068).translate(0.025, 0.075, 0), M.boot, bootId, b);
    part(loft([[0.05, 0.062, 0.06, -0.035], [0.15, 0.058, 0.056, -0.04], [0.26, 0.064, 0.062, -0.035], [0.29, 0.06, 0.058, -0.035]], 14), M.boot, bootId, b);
    part(new THREE.BoxGeometry(0.035, 0.03, 0.15).rotateZ(-0.5).translate(0.075, 0.125, 0), M.strap, undefined, b);                  // instep strap
    part(new THREE.CylinderGeometry(0.068, 0.068, 0.035, 14).translate(-0.035, 0.225, 0), M.strap, undefined, b);              // cuff strap
    part(ball(1, 0.16, 0.022, 0.072).translate(0.025, 0.03, 0), M.strap, undefined, b);                                          // sole
  }

  // ---- body ----
  const shortsCol = (y, a) => (y < -0.305 ? [1, 0.82, 0.1] : Math.abs(Math.sin(a)) > 0.93 ? [0.96, 0.97, 1] : [0.07, 0.56, 0.8]);
  const pelvis = part(loft([[-0.12, 0.065, 0.095], [-0.07, 0.113, 0.172], [0, 0.121, 0.183], [0.07, 0.116, 0.175], [0.115, 0.107, 0.165], [0.12, 0.075, 0.12]], 20, () => [0.07, 0.56, 0.8]), M.shorts, shortsId);
  const vestCol = (y, a) => {                                       // a yellow yoke over a purple body, three red straps round it
    const strap = (y > 0.02 && y < 0.05) || (y > 0.085 && y < 0.115) || (y > 0.15 && y < 0.18);
    return strap ? [1, 0.11, 0.04] : y > 0.2 && !(Math.abs(Math.sin(a)) > 0.8 && y < 0.3) ? [0.76, 0.83, 0.14] : [0.27, 0.15, 0.6];
  };
  const vestRings = cut([[-0.09, 0.07, 0.1], [-0.075, 0.12, 0.17], [0, 0.113, 0.161], [0.1, 0.124, 0.178], [0.2, 0.137, 0.198, 0.008], [0.3, 0.141, 0.214, 0.012], [0.37, 0.134, 0.218, 0.004], [0.41, 0.118, 0.2], [0.445, 0.092, 0.15], [0.47, 0.066, 0.092], [0.482, 0.035, 0.045]], [0.02, 0.05, 0.085, 0.115, 0.15, 0.18, 0.2]);
  const chest = part(loft(vestRings, 24, vestCol), M.vest, vestId);
  const tufts = [], tails = [];                                      // what moves in the wind: the hair, and the loose ends of the vest's straps
  for (const y of [0.035, 0.1, 0.165]) {
    part(new THREE.BoxGeometry(0.02, 0.04, 0.05).translate(0.123 + y * 0.09, y, 0), M.grip, undefined, chest);   // buckles
    tails.push(part(new THREE.BoxGeometry(0.004, 0.07, 0.024).translate(0, -0.035, 0), M.red, undefined, chest)); tails.at(-1).position.set(0.13 + y * 0.09, y - 0.012, 0.03);
  }
  // the print on the yoke, back and front: purple splatter, a big red HP, LIQUID KHAOS underneath — laid over the lofted surface
  const logoMat = toon(0xffffff, { rim: 0.3, params: { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, map: canvasTex(640, 352, (c, w, h) => {
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    c.fillStyle = '#6b3fc4';
    for (const [x, y, r] of [[70, 60, 26], [250, 34, 16], [585, 190, 34], [545, 300, 22], [110, 318, 18], [420, 40, 12]])
      for (let i = 0; i < 9; i++) { const d = i ? r * (0.7 + 1.3 * rnd()) : 0, a = rnd() * 6.3; c.beginPath(); c.arc(x + d * Math.cos(a), y + d * Math.sin(a), i ? r * (0.12 + 0.3 * rnd()) : r, 0, 7); c.fill(); }
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.save(); c.translate(w / 2, 148); c.transform(1.55, 0, -0.12, 1, 0, 0); c.font = '900 236px Impact, sans-serif';
    c.fillStyle = c.strokeStyle = '#1b1f4a'; c.lineWidth = 20; c.strokeText('HP', 7, 9); c.fillText('HP', 7, 9); c.lineWidth = 12; c.strokeText('HP', 0, 0);
    c.fillStyle = '#ff4326'; c.fillText('HP', 0, 0); c.restore();
    c.font = '900 56px "Arial Black", Impact, sans-serif'; c.fillStyle = '#1b1f4a'; c.fillText('LIQUID KHAOS', w / 2, 312, w - 170);
  }) } });
  for (const a0 of [Math.PI, 0]) {
    const pos = [], uv = [], idx = [], NA = 12, NY = 6;
    for (let i = 0; i <= NY; i++) for (let j = 0; j <= NA; j++) {
      const y = 0.205 + 0.2 * i / NY, a = a0 + 0.85 * (j / NA * 2 - 1), n = vestRings.findIndex(r => r[0] > y), p = vestRings[n - 1], q = vestRings[n], k = (y - p[0]) / (q[0] - p[0]);
      const [rx, rz, cx] = [1, 2, 3].map(m => p[m] + (q[m] - p[m]) * k);
      pos.push(cx + (rx + 0.004) * Math.cos(a), y, (rz + 0.004) * Math.sin(a)); uv.push(1 - j / NA, i / NY);
      if (i < NY && j < NA) { const v = i * (NA + 1) + j; idx.push(v, v + NA + 1, v + 1, v + 1, v + NA + 1, v + NA + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = noInk(new THREE.Mesh(g, logoMat)); m.receiveShadow = true; chest.add(m);
  }
  const neck = part(new THREE.CylinderGeometry(0.056, 0.064, 0.14, 12).translate(0, 0.05, 0), M.skin, skinId);
  const head = new THREE.Group(); root.add(head);
  const faceTex = canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = '#e2a274'; c.fillRect(0, 0, w, h);
    const cx = w / 2;
    for (const s of [-1, 1]) {
      const ex = cx + s * 33;
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(ex, 122, 10, 5.5, 0, 0, 7); c.fill();
      c.fillStyle = '#2b1a12'; c.beginPath(); c.arc(ex + s * 1, 122, 4.6, 0, 7); c.fill();
      c.strokeStyle = '#2b1a12'; c.lineWidth = 3; c.beginPath(); c.moveTo(ex - 12, 118); c.quadraticCurveTo(ex, 112, ex + 12, 118); c.stroke();
      c.strokeStyle = '#8a5a22'; c.lineWidth = 6; c.beginPath(); c.moveTo(ex - s * 14, 107); c.lineTo(ex + s * 15, 102); c.stroke();
    }
    c.strokeStyle = '#7a3b2a'; c.lineWidth = 3.5; c.beginPath(); c.moveTo(cx - 17, 166); c.quadraticCurveTo(cx, 172, cx + 17, 165); c.stroke();
    c.fillStyle = 'rgba(150,80,50,.35)'; c.beginPath(); c.ellipse(cx, 150, 9, 3, 0, 0, 7); c.fill();
  });
  part(headGeo(), toon(0xffffff, { rim: 0.6, params: { map: faceTex } }), skinId, head);
  part(new THREE.ConeGeometry(0.019, 0.05, 5).rotateZ(-2.0).translate(0.108, -0.014, 0), M.skin, skinId, head);
  for (const s of [-1, 1]) part(ball(1, 0.015, 0.032, 0.013).translate(-0.006, -0.008, s * 0.09), M.skin, skinId, head);
  part(headGeo(1.07, true), M.hair, hairId, head);
  // short hair in rows of tufts, raked back by the wind: [x, y, tilt back, length, half-width of the row]
  for (const [x, y, tilt, len, hw] of [[0.07, 0.092, 0.25, 0.06, 0.05], [0.03, 0.112, 0.75, 0.075, 0.06], [-0.02, 0.112, 1.1, 0.08, 0.064], [-0.065, 0.085, 1.45, 0.08, 0.06], [-0.092, 0.03, 1.9, 0.075, 0.052]])
    for (let i = -2; i <= 2; i++)
      { tufts.push(part(new THREE.ConeGeometry(0.03, len, 5).translate(0, len * 0.35, 0).rotateZ(tilt).rotateY(-i * 0.22), M.hair, hairId, head)); tufts.at(-1).position.set(x, y - 0.006 * i * i, i * hw / 2); }

  const mk = () => ({
    hip: V(), knee: V(), ankle: V(), sh: V(), elbow: V(), wrist: V(), hold: 1,
    thigh: part(limb([[0, 0.094, 0.092], [0.08, 0.094], [0.22, 0.083], [0.36, 0.068, 0.066], [0.43, 0.062, 0.061]]), M.skin, skinId),
    kneeM: part(ball(0.062), M.skin, skinId),
    shin: part(limb([[0, 0.061], [0.06, 0.062, 0.062, -0.006], [0.15, 0.065, 0.06, -0.017], [0.27, 0.047, 0.046, -0.005], [0.42, 0.041]]), M.skin, skinId),
    upper: part(limb([[0, 0.066, 0.066], [0.06, 0.06, 0.061], [0.15, 0.055, 0.053, 0.005], [0.24, 0.046], [0.29, 0.043]], 12), M.skin, skinId),
    elbowM: part(ball(0.043), M.skin, skinId),
    fore: part(limb([[0, 0.043], [0.05, 0.05, 0.047], [0.13, 0.045, 0.042], [0.22, 0.034, 0.031], [0.26, 0.032, 0.029]], 12), M.skin, skinId),
    hand: part(ball(1, 0.03, 0.052, 0.05).translate(-0.006, -0.045, 0), M.skin, skinId),
  });
  const L = mk(), R = mk();
  for (const leg of [L, R]) part(limb(cut([[-0.03, 0.07, 0.08], [0.02, 0.105, 0.103], [0.12, 0.107, 0.107], [0.26, 0.101, 0.103], [0.335, 0.1, 0.102], [0.34, 0.076, 0.079]], [0.305]), 16, shortsCol), M.shorts, shortsId, leg.thigh);
  for (const arm of [L, R]) {
    part(ball(1, 0.072, 0.092, 0.074).translate(0, -0.012, 0), M.skin, skinId, arm.upper);                                   // deltoid
    for (let i = 0; i < 4; i++) {                                    // a fist closed over the bar: knuckles, curled fingers, thumb underneath
      const z = (i - 1.5) * 0.025;
      part(ball(0.0155).translate(0.014, -0.083, z), M.skin, skinId, arm.hand);
      part(new THREE.CapsuleGeometry(0.0125, 0.03, 3, 8).rotateZ(Math.PI / 2).translate(0.03, -0.098, z), M.skin, skinId, arm.hand);
    }
    part(new THREE.CapsuleGeometry(0.014, 0.05, 3, 8).rotateX(Math.PI / 2).translate(0.012, -0.045, 0), M.skin, skinId, arm.hand);
  }

  // ---- handle and rope (live in the scene: the rope spans to the boat) ----
  const handle = new THREE.Group(); scene.add(handle);
  const hp = (geo, mat) => { const m = ink(new THREE.Mesh(geo, mat), handleId); m.castShadow = true; handle.add(m); return m; };
  hp(new THREE.CylinderGeometry(0.016, 0.016, 0.38, 10).rotateX(Math.PI / 2), M.grip);         // bar along local Z, rope leaves along +X
  for (const s of [-1, 1]) hp(ball(0.026).translate(0, 0, s * 0.19), M.red);
  const ROPE_COL = 0xd8ff2a;
  for (const s of [-1, 1]) hp(new THREE.CylinderGeometry(0.007, 0.007, 0.47, 5).rotateZ(Math.PI / 2).translate(0.235, 0, 0).rotateY(s * 0.41).translate(0, 0, s * 0.19), toon(ROPE_COL, { rim: 0 }));
  const BRIDLE = 0.43, SEG = 20, RS = 5;
  const ropeGeo = new THREE.CylinderGeometry(0.014, 0.014, 1, RS, SEG, true), ropeBase = ropeGeo.attributes.position.array.slice();
  const rope = noInk(new THREE.Mesh(ropeGeo, new THREE.MeshBasicMaterial({ color: ROPE_COL })));
  rope.frustumCulled = false; scene.add(rope);

  // ---- pose state ----
  const st = { crouch: 0.3, lean: 0, tilt: new THREE.Quaternion(), twist: 1, bend: 0.3, look: V(0, 0, -1), handleW: V(0, 1, 10), handleQ: new THREE.Quaternion(), grabW: 0, pivot: 0, raley: 0, float: 0, lv: V(), lyaw: 0, step: 0, jerk: 0, skim: null, tweakR: 0, tweakP: 0 };   // jerk: the rope has just snapped tight (set from outside, dies away); skim: where the rope is dragging in the water
  const P = V(), W = V(), pelvisQ = new THREE.Quaternion(), chestQ = new THREE.Quaternion(), headQ = new THREE.Quaternion(), q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion();
  const skimP = V(), towerB = V(), u = V(), bar = V(), H = V(), t0 = V(), t1 = V(), fwd = V(), right = V(), pole = V(), inv = new THREE.Matrix4(), apex = V();
  const GRAB_AT = { indy: [1, V(0.2, 0.03, 0.06)], melon: [-1, V(-0.2, 0.03, -0.06)], tail: [1, V(0.02, 0.1, 0.66)], nose: [-1, V(0.02, 0.1, -0.66)], stale: [1, V(-0.2, 0.03, 0.12)], mute: [-1, V(0.2, 0.03, -0.1)], hoochie: [1, V(-0.2, 0.03, 0.1)] };   // [which hand: 1 = rear, −1 = front, where on the board]
  const TWEAK = { indy: [0.32, 0], mute: [0.28, 0.08], melon: [-0.32, 0], stale: [-0.3, -0.06], nose: [0.05, 0.3], tail: [-0.05, -0.3], hoochie: [-0.2, 0] };   // [roll: + lifts the toe edge, pitch: + lifts the nose]
  const tweakQ = new THREE.Quaternion(), _e = new THREE.Euler();

  function update(s, dt, tower) {
    const k = r => 1 - Math.exp(-dt * r), air = s.air, crashed = s.crashed;
    st.jerk *= Math.exp(-dt * 8);

    // ---- where the board is ----
    const psi = crashed ? s.tumbleYaw : boardPsi(s);
    const e = 0.25, n = _a.set(surfaceY(s.x - e, s.z, s.t, s.dist) - surfaceY(s.x + e, s.z, s.t, s.dist), 2 * e * (C.surf ? 2 : 1), surfaceY(s.x, s.z - e, s.t, s.dist) - surfaceY(s.x, s.z + e, s.t, s.dist)).normalize();
    q0.setFromUnitVectors(Y, n);
    st.tilt.slerp(air || crashed ? q1.identity() : q0, k(air ? 5 : 14));
    const leanT = air || crashed ? 0 : clamp((s.lift * 0.44 + (C.surf ? 0.22 : 0)) * Math.cos(psi - s.psiV), -0.66, 0.66);     // + = onto the toes; a surfer leans in to the wall, with the rail set and the board flatter than the face
    st.lean += (leanT - st.lean) * k(9);
    root.quaternion.copy(st.tilt).multiply(q0.setFromAxisAngle(Y, -psi)).multiply(q1.setFromAxisAngle(Z, -st.lean));
    root.position.set(s.x, s.y + 0.13 * Math.abs(Math.sin(st.lean)) - 0.02, s.z);
    if (air || crashed) {                                           // flips turn about the body's middle, not the board
      const ax = air ? air.axis : s.tumbleAxis, ang = air ? air.flip : s.tumble;
      root.quaternion.premultiply(q0.setFromAxisAngle(_b.set(ax[0], ax[1], ax[2]), ang));
      if (air && air.tant) root.quaternion.premultiply(q0.setFromAxisAngle(_b.set(air.axis2[0], 0, air.axis2[2]), air.tant));   // tantrum: end over end
    }
    st.pivot += ((air || crashed ? 1 : 0) - st.pivot) * k(air || crashed ? 7 : 20);                    // eased in, so nothing jumps at the lip
    root.position.y += 0.7 * st.pivot; root.position.sub(_c.set(0, 0.7 * st.pivot, 0).applyQuaternion(root.quaternion));
    // Air Raley: the hands stay where they are while the body lets go behind them — chest to the boat, laid out flat, board up above the head
    const r = st.raley += ((air ? air.ext * air.ext * (3 - 2 * air.ext) : 0) - st.raley) * (air ? 1 : k(14));
    // Back up after a fall: the same turn to face the boat, but sat back the other way about the body's middle, so the board floats up in front
    // …and the deep-water start is that float run backwards: the board swings round and under as the rope pulls the rider up
    const up = s.low;
    const fl = Math.max(up, st.float += ((crashed && s.surfaced ? 1 : 0) - st.float) * k(crashed ? 3.5 : 30));
    if (r > 0.001 || fl > 0.001 || (air && air.bend)) {
      _a.set(tower.x - s.x, 0, tower.z - s.z).normalize();                                   // level direction to the boat
      const turn = Math.atan2(_a.x, -_a.z) - Math.PI / 2 - psi;
      _c.set(0, 1 - 0.3 * fl, 0).applyQuaternion(root.quaternion).add(root.position);        // the point that stays put: the hands, or the body's middle
      root.quaternion.premultiply(q0.setFromAxisAngle(Y, -Math.max(r, fl) * Math.atan2(Math.sin(turn), Math.cos(turn)))).premultiply(q1.setFromAxisAngle(_b.crossVectors(Y, _a), 1.95 * r - (C.surf ? 0.3 : 2) * fl));
      if (air && air.bend) root.quaternion.premultiply(q0.setFromAxisAngle(_a, air.bend));   // S-Bend: rolling over about the rope
      root.position.copy(_c).sub(_d.set(0.05 * r, 1 + r - 0.3 * fl, 0).applyQuaternion(root.quaternion));
    }
    // surfing: the board is loose — it spins under the feet in a shove-it, and in a fall it is thrown clear and left on the water
    // a grab pulls on the board: the grabbed edge, or the nose or tail, comes up towards the hand — and the feet and the hand go with it
    const g0 = air && air.grab && TWEAK[air.grab], gw = st.grabW * (1 - st.raley);
    st.tweakR += ((g0 ? g0[0] : 0) - st.tweakR) * k(10); st.tweakP += ((g0 ? g0[1] : 0) - st.tweakP) * k(10);
    tweakQ.setFromEuler(_e.set(st.tweakP * gw, 0, st.tweakR * gw));
    boardG.quaternion.copy(tweakQ).multiply(q0.setFromAxisAngle(Y, C.surf && air ? air.shove : 0));
    [...boots, ...feet].forEach((f, i) => { const side = i % 2 ? 1 : -1; f.position.set(0, 0.022, side * STANCE + (i > 1 ? st.step : 0)).applyQuaternion(tweakQ); f.quaternion.copy(tweakQ).multiply(q0.setFromAxisAngle(Y, -side * 0.21)); });
    boardG.visible = !(C.surf && crashed);
    if (!boardG.visible) {
      if (!loose.visible) { loose.visible = true; loose.position.copy(root.position); loose.quaternion.copy(root.quaternion); st.lv.set(s.vx * 0.4 + 1.4, 3.4, s.vz + 1.2); st.lyaw = 0.6 - psi; }
      st.lv.y -= 9.81 * dt; loose.position.addScaledVector(st.lv, dt);
      const ly = surfaceY(loose.position.x, loose.position.z, s.t, s.dist) + 0.03;
      if (loose.position.y <= ly && st.lv.y < 0) {
        loose.position.y = ly; st.lv.set(st.lv.x * (1 - k(3)), 0, st.lv.z + (C.V - st.lv.z) * k(3));
        loose.quaternion.slerp(q0.setFromAxisAngle(Y, st.lyaw), k(6));
      } else { loose.rotateX(7 * dt); loose.rotateY(3 * dt); }
    } else loose.visible = false;
    root.updateMatrixWorld(true);
    towerB.copy(tower).applyMatrix4(inv.copy(root.matrixWorld).invert());

    // ---- stance ----
    const lean = st.lean / 0.6, heel = Math.max(0, -lean), toe = Math.max(0, lean);
    const grab = air && air.grab ? GRAB_AT[air.grab] : null;
    st.grabW += ((grab ? 1 : 0) - st.grabW) * k(12);
    const spinning = air ? Math.min(1, (Math.abs(air.flipV) + Math.abs(air.spinV) + air.tantV) / 6) : 0;
    const floating = crashed && s.surfaced;                          // back up after a fall: sat back in the water, knees up, arms down
    const crouchT = floating ? (C.surf ? 0.55 : 0.9) : crashed ? 0.5 + 0.3 * Math.sin(s.crashT * 9) : air ? lerp(0.42 + 0.25 * spinning + 0.45 * st.grabW, 0.08 + 0.5 * st.grabW, r) : (C.surf ? 0.45 : 0.3) + 0.5 * s.load + 0.85 * s.impact + 0.1 * (heel + toe) + 0.5 * s.squat;
    st.crouch += (clamp(lerp(crouchT, 0.9, up), 0, 1) - st.crouch) * k(air ? 9 : 16);
    const c = st.crouch;

    // the way to the boat, as an angle from the chest's forward: + = towards the front foot
    const ang = Math.atan2(-towerB.z, towerB.x);
    st.twist += (clamp(ang, -1.9, 1.9) * (1 - Math.max(r, fl)) * (C.surf ? 0.45 : 1) - st.twist) * k(8);   // surfing: the chest stays open to the wave
    const tw = st.twist * 0.62;
    const bendT = floating ? (C.surf ? 0.25 : 1.4) : lerp(0.3 + 0.45 * c - 0.32 * heel - 0.16 * toe + 0.35 * st.grabW + 0.4 * st.jerk, -0.2 + 0.5 * st.grabW, r);   // laid out in a Raley; with a hand on the board as well (a Hoochie Glide), knees bent to bring it in reach
    st.bend += (lerp(bendT, 1.4, up) - st.bend) * k(12);

    const legs = crashed ? 0 : clamp(s.e, -0.3, 0.3);               // knees soaking up the wake, or standing tall off the lip
    // surfing with no bindings: ↑ ↓ walk the rider up and back along the board (the nose is −Z; riding switch it is the other way round)
    st.step += ((C.surf && !air && !crashed ? -0.17 * s.trim * (s.sw ? -1 : 1) : 0) - st.step) * k(6);
    const tuck = st.grabW * (1 - st.raley);                          // grabbing: the knees come right up, to bring the board to the hand
    P.set(-0.05 - 0.15 * heel + 0.11 * toe - 0.07 * c, ANKLE_Y + clamp(lerp(0.8, 0.44, c) - 0.1 * st.grabW - 0.24 * tuck + legs, 0.32 - 0.16 * tuck, 0.84), 0.02 * Math.sign(tw) + st.step);
    pelvisQ.setFromAxisAngle(Y, tw * 0.5).multiply(q0.setFromAxisAngle(Z, -(0.08 + 0.2 * c)));
    chestQ.setFromAxisAngle(Y, tw).multiply(q0.setFromAxisAngle(Z, -st.bend)).multiply(q1.setFromAxisAngle(X, grab ? grab[0] * 0.3 * st.grabW : 0));
    W.set(0, 0.105, 0).applyQuaternion(pelvisQ).add(P);
    pelvis.position.copy(P); pelvis.quaternion.copy(pelvisQ);
    chest.position.copy(W); chest.quaternion.copy(chestQ);

    // head: keep the eyes on the boat (on the water below while upside down) — and, coming down out of the air, on where the board is going to land
    t0.copy(towerB).sub(W).normalize();
    if (air && s.vy < 0) t0.lerp(_d.set(s.x + 0.45 * s.vx, surfaceY(s.x, s.z, s.t, s.dist), s.z + 0.45 * s.vz).applyMatrix4(inv).sub(W).normalize(), clamp(-s.vy / 4, 0, 1) * (1 - r)).normalize();
    t0.applyQuaternion(q0.copy(chestQ).invert());
    const yaw = clamp(Math.atan2(-t0.z, t0.x), -1.35, 1.35) * (1 - r), pitch = lerp(clamp(Math.asin(clamp(t0.y, -1, 1)), -0.45, 0.5), 0.9, r);
    q1.copy(chestQ).multiply(q0.setFromAxisAngle(Y, yaw)).multiply(q0.setFromAxisAngle(Z, pitch));
    headQ.slerp(q1, k(10));
    t0.set(-0.006, 0.455, 0).applyQuaternion(chestQ).add(W);
    neck.position.copy(t0); neck.quaternion.copy(chestQ).slerp(headQ, 0.5);
    head.position.set(0.016, 0.19, 0).applyQuaternion(neck.quaternion).add(t0); head.quaternion.copy(headQ);

    // ---- legs ----
    for (const [leg, side] of [[L, -1], [R, 1]]) {
      leg.hip.set(0, -0.035, side * 0.098).applyQuaternion(pelvisQ).add(P);
      leg.ankle.set(-0.035 * Math.cos(0.21), ANKLE_Y, side * (STANCE + 0.007) + st.step).applyQuaternion(tweakQ);
      t0.set(1, 0.2, side * 0.42);                                   // knees track out over the toes
      ik(leg.hip, leg.ankle, THIGH, SHIN, t0, leg.knee);
      aim(leg.thigh, leg.hip, leg.knee, t0); aim(leg.shin, leg.knee, leg.ankle, t0);
      leg.kneeM.position.copy(leg.knee);
    }

    // ---- handle and arms ----
    for (const [arm, side] of [[L, -1], [R, 1]]) arm.sh.set(0, 0.372, side * 0.214).applyQuaternion(chestQ).add(W);
    t0.set(0.19, 0.09, 0).applyQuaternion(chestQ).add(W);            // just in front of the belt
    t0.lerp(t1.addVectors(L.sh, R.sh).multiplyScalar(0.5), r);       // laid out: arms straight, out past the head
    u.copy(towerB).sub(t0).normalize();
    H.copy(t0).addScaledVector(u, lerp(0.17 + 0.11 * clamp(s.tension / 1200, 0, 1) + 0.2 * st.jerk, 0.58, r));   // the harder the rope pulls, the further out the arms: yanked straight when it snaps tight
    fwd.set(1, 0, 0).applyQuaternion(chestQ); right.set(0, 0, 1).applyQuaternion(chestQ);
    const behind = u.dot(fwd) < -0.5 && r < 0.5;                               // the rope is behind the back: mid-spin, one hand only
    bar.copy(right).addScaledVector(u, -right.dot(u)).normalize();
    // which hands are on the bar: both, unless one is grabbing the board or the rope is behind the back
    const lead = u.dot(right) > 0 ? R : L, REACH = UPPER + FORE + GRIP - 0.015;
    if (!behind) {                                                  // keep the bar where both hands can get to it
      const far = Math.max(L.sh.distanceTo(t0.copy(H).addScaledVector(bar, -0.085)), R.sh.distanceTo(t1.copy(H).addScaledVector(bar, 0.085)));
      if (far > REACH) { t0.addVectors(L.sh, R.sh).multiplyScalar(0.5); H.sub(t0).multiplyScalar(Math.max(0.55, 1 - (far - REACH) / H.length())).add(t0); }
    }
    for (const [arm, side] of [[L, -1], [R, 1]]) {
      const holding = !crashed && !C.surf && !(grab && grab[0] === side) && !(behind && arm !== lead);
      arm.hold += ((holding ? 1 : 0) - arm.hold) * k(14);
    }
    if (L.hold < 0.5 || R.hold < 0.5) H.addScaledVector(bar, (R.hold > L.hold ? 1 : -1) * 0.06);
    for (const [arm, side] of [[L, -1], [R, 1]]) {
      const gripP = t0.copy(H).addScaledVector(bar, side * 0.085);
      gripP.addScaledVector(_c.subVectors(arm.sh, gripP).normalize(), GRIP);              // wrist sits behind the grip
      if (grab && grab[0] === side) t1.copy(grab[1]).applyQuaternion(tweakQ);
      else if (floating) t1.set(0.06, -0.35, side * 0.12).applyQuaternion(chestQ).add(arm.sh);   // arms down in the water
      else if (crashed) t1.set(0.25 * Math.sin(s.crashT * 11 + side), 0.5, side * 0.5).applyQuaternion(chestQ).add(arm.sh);
      else if (C.surf) t1.set(0.1 + 0.22 * s.squat, -0.16 + 0.03 * Math.sin(s.t * 2.3 + side) - 0.3 * s.squat + 0.12 * s.pump, side * (0.52 - 0.14 * s.squat)).applyQuaternion(chestQ).add(arm.sh);   // no rope: both arms out wide — thrown down and forward with each pump
      else t1.set(-0.05, -0.3, side * 0.42).applyQuaternion(chestQ).add(arm.sh);          // free arm: out for balance
      arm.wrist.lerpVectors(t1, gripP, arm.hold);
      pole.set(-0.5, -1, side * 0.55).applyQuaternion(chestQ);                             // elbows down and out
      ik(arm.sh, arm.wrist, UPPER, FORE, pole, arm.elbow);
      aim(arm.upper, arm.sh, arm.elbow, fwd); aim(arm.fore, arm.elbow, arm.wrist, fwd);
      arm.elbowM.position.copy(arm.elbow);
      aim(arm.hand, arm.wrist, _c.subVectors(arm.wrist, arm.elbow).add(arm.wrist), u);
    }

    // ---- handle + rope, in the scene ----
    if (!crashed) {
      // put the bar in the palms of whoever is holding it
      const wl = L.hold / Math.max(1e-3, L.hold + R.hold);
      t0.copy(L.wrist).addScaledVector(bar, 0.085); t1.copy(R.wrist).addScaledVector(bar, -0.085);
      H.lerpVectors(t1, t0, wl).addScaledVector(u, GRIP * 0.9);
      st.handleW.copy(H).applyMatrix4(root.matrixWorld);
      _a.copy(u).transformDirection(root.matrixWorld); _c.copy(bar).transformDirection(root.matrixWorld); _b.crossVectors(_c, _a);
      st.handleQ.setFromRotationMatrix(_m.makeBasis(_a, _b, _c));
    } else {                                                         // let go: the handle skips away behind the boat
      st.handleW.x += (0 - st.handleW.x) * k(1.2);
      st.handleW.z += (C.TOWER[2] + C.L - 1 - st.handleW.z) * k(2.5);
      _a.subVectors(st.handleW, tower).setY(0);                       // …on the end of its rope, wherever the boat goes
      if (_a.length() > C.L) st.handleW.addScaledVector(_a, C.L / _a.length() - 1);
      st.handleW.y += (surfaceY(st.handleW.x, st.handleW.z, s.t, s.dist) + 0.05 + 0.25 * Math.abs(Math.sin(s.crashT * 7)) * Math.exp(-s.crashT * 1.5) - st.handleW.y) * k(6);
      _a.subVectors(tower, st.handleW).normalize(); _c.crossVectors(_a, Y).normalize(); _b.crossVectors(_c, _a);
      st.handleQ.setFromRotationMatrix(_m.makeBasis(_a, _b, _c));
    }
    handle.position.copy(st.handleW); handle.quaternion.copy(st.handleQ); handle.visible = rope.visible = !C.surf;
    apex.set(BRIDLE, 0, 0).applyQuaternion(st.handleQ).add(st.handleW);

    // rope: straight when loaded, hanging in a curve when slack
    const span = apex.distanceTo(tower), sag = crashed ? 0.5 : Math.sqrt(Math.max(0, 3 * span * Math.min(s.slack, 1.5) / 8));
    _a.subVectors(tower, apex).normalize(); _b.crossVectors(_a, Y).normalize(); _c.crossVectors(_b, _a);
    const rp2 = ropeGeo.attributes.position.array;
    st.skim = null;
    for (let i = 0; i < rp2.length; i += 3) {
      const t = ropeBase[i + 1] + 0.5;                               // 0 at the handle … 1 at the tower
      _d.lerpVectors(apex, tower, t); _d.y -= 4 * sag * t * (1 - t);
      _d.addScaledVector(_b, 0.1 * st.jerk * Math.sin(Math.PI * t) * Math.sin(s.t * 55));    // snapped tight: it sings for a moment
      const yMin = surfaceY(_d.x, _d.z, s.t, s.dist) + 0.02;
      if (_d.y < yMin) { _d.y = yMin; if (!C.surf && Math.random() < 0.06) st.skim = skimP.copy(_d); }   // lying in the water: one of those places, for the spray it drags up
      rp2[i] = _d.x + _b.x * ropeBase[i] + _c.x * ropeBase[i + 2];
      rp2[i + 1] = _d.y + _b.y * ropeBase[i] + _c.y * ropeBase[i + 2];
      rp2[i + 2] = _d.z + _b.z * ropeBase[i] + _c.z * ropeBase[i + 2];
    }
    ropeGeo.attributes.position.needsUpdate = true;

    // loose things in the wind: the hair lifts and shivers, the strap ends flap — more the faster the air goes by — and a hard landing throws the hair forward
    const wind = clamp(Math.hypot(s.vx, s.vz - C.V) / 12, 0, 1.2) * (crashed ? 0.2 : 1);
    tufts.forEach((m, i) => { m.rotation.z = wind * (0.1 + 0.07 * Math.sin(s.t * 23 + i * 1.7)) - 0.7 * s.impact; });
    tails.forEach((m, i) => { m.rotation.z = wind * (0.5 + 0.35 * Math.sin(s.t * 19 + i * 2.1)); m.rotation.x = 0.5 * wind * Math.sin(s.t * 27 + i); });
  }

  // wakesurfing: bare feet on a wider, shorter board
  function setSurf(on) {
    for (const b of boots) b.visible = !on;
    for (const f of feet) f.visible = on;
    for (const g of [boardG, loose]) g.scale.set(on ? 1.28 : 1, 1, on ? 0.94 : 1);
  }
  return { root, update, setSurf, state: st };
}
