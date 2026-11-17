// The tow boats, modelled in code, one shown at a time (gear.js): the Skipper — lofted hull with a plain pointed bow, cockpit, windshield,
// a thin forward-swept wake tower — a pontoon party barge and a mahogany runabout. Each has its crew and somewhere up high to tie the rope.
// Local frame: origin at the transom waterline, bow towards −Z.
import * as THREE from 'three';
import { toon, ink, noInk, newId } from './gfx.js';
import { C } from './physics.js';

const LEN = 7, NS = 28;
const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const beam = s => (1.2 + 0.07 * sm(0, 0.3, s)) * (1 - 0.8 * s ** 2.6);      // drawn in to a plain, pointed bow
const sheer = s => 0.78 + 0.22 * s * s;

// A strip of quads between two rails of points; `out` says which way its faces should look.
function strip(a, b, out) {
  const pos = [], idx = [];
  for (let i = 0; i < a.length; i++) { pos.push(a[i].x, a[i].y, a[i].z, b[i].x, b[i].y, b[i].z); if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); } }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const n = g.attributes.normal, avg = new THREE.Vector3();
  for (let i = 0; i < n.count; i++) avg.add(new THREE.Vector3().fromBufferAttribute(n, i));
  if (avg.dot(out) < 0) { g.setIndex(idx.map((_, i) => idx[i - i % 3 + [0, 2, 1][i % 3]])); g.computeVertexNormals(); }
  return g;
}
const tex = (w, h, draw) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };
const lie = geo => geo.rotateX(Math.PI / 2);                 // a cylinder laid fore and aft: its first radius is the aft end
const tube = (pts, r, closed = false) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), closed, 'catmullrom', 0.25), 48, r, 8, closed);

export function createBoat() {
  const g = new THREE.Group(), models = [], arms = [], heads = [], fists = [], spotters = [], stock = [], cones = [];   // stock: each boat's own speakers; cones: the big ones'
  let cur = g;                                            // what is being built: one of the boats, or g for what they share
  const model = () => { models.push(cur = new THREE.Group()); g.add(cur); };
  const M = {
    white: toon(0xf7f9fd, { spec: 0.5, shine: 30 }), red: toon(0xe8262e, { spec: 0.5, shine: 30 }), navy: toon(0x1a2440, { rim: 0.3 }),
    black: toon(0x20242e, { spec: 0.25, shine: 20 }), floor: toon(0x8f9bb0, { rim: 0 }), seat: toon(0xf3e7cf, { rim: 0.2 }), teak: toon(0xb98a52, { rim: 0 }),
    chrome: toon(0xcfd8e6, { spec: 0.8, shine: 60 }), glass: toon(0x2a5a9c, { spec: 0.6, shine: 50, params: { transparent: true, opacity: 0.55, side: THREE.DoubleSide } }),
  };
  const add = (geo, mat, id, parent = cur) => { const m = ink(new THREE.Mesh(geo, mat), id); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

  // ==== SKIPPER ====
  model();
  // ---- hull: rails of points along the length, mirrored port/starboard ----
  const rails = side => {
    const r = { keel: [], chine: [], mid: [], gun: [], capIn: [], wall: [] };
    for (let i = 0; i <= NS; i++) {
      const s = i / NS, z = -LEN * s, b = beam(s), gy = sheer(s), rake = s ** 6;         // the bow leans forward: the deck reaches further than the keel
      const keel = new THREE.Vector3(0, -0.34 + 0.9 * s ** 4, z), chine = new THREE.Vector3(side * b * 0.86, 0.0 + 0.6 * s ** 3, z - 0.1 * rake), gun = new THREE.Vector3(side * b, gy, z - 0.35 * rake);
      r.keel.push(keel); r.chine.push(chine); r.gun.push(gun);
      r.mid.push(chine.clone().lerp(gun, 0.42 + 0.3 * s * s));          // the colour break sweeps up towards the bow
      r.capIn.push(new THREE.Vector3(side * Math.max(0, b - 0.14), gy, gun.z));
      r.wall.push(new THREE.Vector3(side * Math.max(0, b - 0.17), 0.22, z));
    }
    return r;
  };
  const hullId = newId();
  for (const side of [1, -1]) {
    const r = rails(side), out = new THREE.Vector3(side, 0, 0);
    add(strip(r.keel, r.chine, new THREE.Vector3(side * 0.3, -1, 0)), M.navy, hullId);
    add(strip(r.chine, r.mid, out), M.red);
    add(strip(r.mid, r.gun, out), M.white);
    add(strip(r.gun, r.capIn, new THREE.Vector3(0, 1, 0)), M.white, hullId);
    add(strip(r.capIn.slice(0, 17), r.wall.slice(0, 17), out.clone().negate()), M.seat);
  }
  const P = rails(1), Q = rails(-1);
  // transom, cockpit floor, foredeck
  add(strip([Q.keel[0], Q.chine[0], Q.mid[0], Q.gun[0]], [P.keel[0], P.chine[0], P.mid[0], P.gun[0]].map((p, i) => i ? p : p.clone().setY(p.y + 1e-3)), new THREE.Vector3(0, 0, 1)), M.white);
  add(strip(Q.wall.slice(0, 17), P.wall.slice(0, 17), new THREE.Vector3(0, 1, 0)), M.floor);
  const crown = P.capIn.slice(16).map((p, i) => new THREE.Vector3(0, p.y + 0.09 * (1 - i / 12), p.z));
  add(strip(Q.capIn.slice(16), crown, new THREE.Vector3(0, 1, 0)), M.white, hullId);
  add(strip(crown, P.capIn.slice(16), new THREE.Vector3(0, 1, 0)), M.white, hullId);
  // bow: a small raked face where the two sides meet
  const fwd = new THREE.Vector3(0, 0, -1), quad = (p0, p1, p2, p3, out) => strip([p0, p3], [p1, p2], out);
  add(strip([Q.keel[NS], Q.chine[NS]], [P.keel[NS].clone().setY(P.keel[NS].y + 1e-3), P.chine[NS]], fwd), M.navy, hullId);
  add(strip([Q.chine[NS], Q.mid[NS]], [P.chine[NS], P.mid[NS]], fwd), M.red, hullId);
  add(strip([Q.mid[NS], Q.gun[NS]], [P.mid[NS], P.gun[NS]], fwd), M.white, hullId);
  add(box(2 * beam(4 / LEN) - 0.36, 0.75, 0.06, 0, 0.55, -4.0), M.seat);              // dash bulkhead, inside the hull's walls
  add(box(2.3, 0.09, 0.06, 0, 0.5, 0.02), M.red);                                      // transom stripe
  add(box(2.05, 0.07, 0.7, 0, 0.17, 0.37), M.teak);                                    // swim platform

  // ---- cockpit ----
  add(box(2.1, 0.56, 1.25, 0, 0.5, -0.68), M.seat);                                    // engine hatch / sun pad
  add(box(1.9, 0.05, 1.05, 0, 0.8, -0.68), M.red);
  add(box(2.0, 0.3, 0.5, 0, 0.37, -1.6), M.seat);                                      // rear bench
  for (const x of [0.62, -0.62]) {                                                     // helm + observer seats
    add(box(0.5, 0.32, 0.5, x, 0.38, -3.0), M.seat);
    add(box(0.5, 0.55, 0.1, x, 0.75, -2.74), M.seat);
  }
  add(box(0.8, 0.3, 0.3, 0.62, 0.86, -3.85), M.black);                                 // dash
  add(new THREE.TorusGeometry(0.16, 0.022, 8, 20).rotateX(-0.5).translate(0.62, 0.92, -3.62), M.black);

  // ---- windshield: a raked, wrapped band of glass with a top rail ----
  const wb = [], wt = [];
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14 - 0.5) * 2, x = a * (beam(0.6) - 0.08), z = -3.85 - 0.75 * Math.cos(a * 1.45);
    wb.push(new THREE.Vector3(x, sheer(0.6) + 0.02, z)); wt.push(new THREE.Vector3(x * 0.9, sheer(0.6) + 0.47, z + 0.3));
  }
  add(strip(wb, wt, new THREE.Vector3(0, 0.3, 1)), M.glass);
  add(tube(wt.map(p => p.toArray()), 0.022), M.chrome);

  // ---- wake tower ----
  // Two flat frames, swept forward and leaning in, carry a broad header; the rope leaves from its back edge.
  const ty = C.TOWER[1], tz = C.TOWER[2], gy = sheer(0.3), lean = 0.26, H = (ty - gy) / Math.cos(lean), towerId = newId();
  const path = pts => pts.map(p => new THREE.Vector2(...p));                             // [distance forward of the transom, height up the frame]
  const frame = new THREE.Shape(path([[1.86, 0], [2.3, H], [3.2, H], [2.92, 0]]));
  frame.holes.push(new THREE.Path(path([[1.98, 0.08], [2.4, H - 0.09], [3.09, H - 0.09], [2.8, 0.08]])));   // thin legs: plain tube, not a broad blade
  for (const side of [1, -1])
    add(new THREE.ExtrudeGeometry(frame, { depth: 0.06, bevelEnabled: false }).translate(0, 0, -0.03).rotateY(Math.PI / 2).rotateZ(side * lean).translate(side * 1.2, gy, 0), M.black, towerId);
  add(box(1.7, 0.07, 0.9, 0, ty - 0.035, -2.75), M.black, towerId);                                              // header
  add(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8).translate(0, ty + 0.03, tz + 0.02), M.chrome, undefined, g);   // rope pylon: every boat has it here
  add(box(1.6, 0.04, 1.65, 0, ty + 0.02, -3.28), M.red);                                                       // bimini, reaching forward over the helm
  for (const x of [-0.55, -0.33, -0.11, 0.11, 0.33, 0.55]) {                                                   // tower speakers: a row of six facing the rider
    stock.push(add(new THREE.CylinderGeometry(0.105, 0.09, 0.3, 14).rotateX(Math.PI / 2).translate(x, ty - 0.2, tz - 0.05), M.black),
      add(new THREE.CircleGeometry(0.082, 14).translate(x, ty - 0.2, tz + 0.105), M.chrome), add(new THREE.CircleGeometry(0.036, 10).translate(x, ty - 0.2, tz + 0.108), M.black));
  }
  for (const [x, c] of [[-1.08, 0xffc928], [1.08, 0x22c7d6]])                                                  // boards in the racks
    add(new THREE.CapsuleGeometry(0.2, 0.9, 3, 10).scale(0.12, 1, 1).rotateX(Math.PI / 2 - 0.25).translate(x, gy + 0.72, -2.6), toon(c, { spec: 0.4 }));

  // ---- crew: driver at the helm, spotter facing the rider ----
  const person = (x, y, z, shirt, hair, faceBack, flagArm) => {
    const p = new THREE.Group(), skin = toon(0xdc9b6c), id = newId();
    add(new THREE.CapsuleGeometry(0.17, 0.3, 4, 12).scale(1, 1, 0.75), toon(shirt), undefined, p).position.set(0, 0.3, 0);
    const hd = new THREE.Group(); hd.position.set(0, 0.7, 0); p.add(hd); heads.push([hd, p, faceBack]);            // the head turns on the neck
    add(new THREE.SphereGeometry(0.105, 14, 10), skin, id, hd).position.set(0, 0, 0.01);
    add(new THREE.SphereGeometry(0.112, 14, 10, 0, 6.3, 0, 1.5), toon(hair), undefined, hd).position.set(0, 0.015, -0.012);
    for (const sx of flagArm ? [] : [-1, 1]) add(new THREE.CapsuleGeometry(0.045, 0.34, 3, 8).rotateX(1.1).translate(sx * 0.2, 0.36, 0.17), skin, id, p);
    p.position.set(x, y, z); p.rotation.y = faceBack ? 0 : Math.PI;
    cur.add(p);
    if (!flagArm) return;
    // the spotter's inboard arm rests forward, and punches the air for a big landing
    const fist = new THREE.Group(); fist.position.set(0.2, 0.52, 0.02); p.add(fist); fists.push(fist); spotters.push(p); p.userData.y = y;
    add(new THREE.CapsuleGeometry(0.045, 0.34, 3, 8).translate(0, 0.2, 0), skin, id, fist);
    // the spotter's outboard arm holds the orange rider-down flag: it pivots at the shoulder, down by their side until someone is in the water
    const arm = new THREE.Group(); arm.position.set(-0.2, 0.52, 0.02); p.add(arm); arms.push(arm);
    add(new THREE.CapsuleGeometry(0.045, 0.34, 3, 8).translate(0, 0.2, 0), skin, undefined, arm);
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 6).translate(0, 0.66, 0), M.chrome, undefined, arm);
    add(new THREE.PlaneGeometry(0.36, 0.27).translate(0.18, 0.83, 0), toon(0xff6a00, { rim: 0, params: { side: THREE.DoubleSide } }), undefined, arm);
  };
  const crew = (x, y, z, x2, y2, z2) => { person(x, y, z, 0x1f9d8f, 0x3a2a1c, false); person(x2, y2, z2, 0xffb020, 0x6b3a1a, true, true); };   // driver, spotter
  crew(0.62, 0.62, -3.05, -0.62, 0.62, -1.62);

  // ==== PARTY BARGE: a deck on two aluminium pontoons with a fence round it — couches, a helm, a grill, a striped canopy, an outboard ====
  model();
  {
    const D = 0.67, alu = toon(0xc9d3e0, { spec: 0.7, shine: 40 }), teal = toon(0x19c6b4, { spec: 0.3 }), pink = toon(0xff4fa0, { spec: 0.3 });
    for (const x of [0.92, -0.92]) {
      const id = newId();
      add(lie(new THREE.CylinderGeometry(0.46, 0.46, 6, 18)).translate(x, 0.02, -3.1), alu, id);
      add(lie(new THREE.CylinderGeometry(0.46, 0.07, 1.1, 18)).translate(x, 0.02, -6.65), alu, id);
      add(lie(new THREE.CylinderGeometry(0.32, 0.46, 0.2, 18)).translate(x, 0.02, 0), alu, id);
      add(box(0.5, 0.12, 6.4, x, 0.5, -3.2), alu, id);
    }
    add(box(2.74, 0.13, 7, 0, D - 0.065, -3.2), M.teak);                                   // deck, and the rail round its edge
    add(box(2.8, 0.07, 7.06, 0, D - 0.08, -3.2), alu);
    const fence = (x0, z0, x1, z1) => {                                                     // a run of it: panel, stripe, top rail
      const w = Math.abs(x1 - x0) + 0.05, d = Math.abs(z1 - z0) + 0.05, x = (x0 + x1) / 2, z = (z0 + z1) / 2, id = newId();
      add(box(w, 0.56, d, x, D + 0.3, z), teal, id); add(box(w + 0.02, 0.1, d + 0.02, x, D + 0.4, z), pink, id); add(box(w + 0.03, 0.05, d + 0.03, x, D + 0.6, z), M.chrome, id);
    };
    for (const f of [[1.33, -0.2, 1.33, -6.6], [-1.33, -0.2, -1.33, -2.5], [-1.33, -3.4, -1.33, -6.6], [-1.33, -6.6, -0.45, -6.6], [0.45, -6.6, 1.33, -6.6], [-1.33, -0.2, -0.5, -0.2], [0.5, -0.2, 1.33, -0.2]]) fence(...f);
    const couch = (w, d, x, z, bx, bz) => {                                                 // a seat, and its back off to one side of it
      add(box(w, 0.36, d, x, D + 0.18, z), M.seat); add(box(bx ? 0.14 : w, 0.52, bz ? 0.14 : d, x + bx, D + 0.5, z + bz), M.seat); add(box(w - 0.06, 0.04, d - 0.06, x, D + 0.37, z), teal);
    };
    couch(0.62, 2.3, -0.98, -5.35, -0.24, 0); couch(0.62, 2.3, 0.98, -5.35, 0.24, 0); couch(0.62, 1.2, -0.98, -1.8, -0.24, 0);
    couch(1.5, 0.56, -0.5, -0.75, 0, -0.35);                                                // the spotter's, facing aft
    add(box(0.78, 0.72, 0.5, 0.82, D + 0.36, -3.75), M.white); add(box(0.8, 0.06, 0.54, 0.82, D + 0.75, -3.75), M.black);   // helm: console, wheel, screen, chair
    add(new THREE.TorusGeometry(0.16, 0.022, 8, 20).rotateX(-0.5).translate(0.82, D + 0.86, -3.47), M.black);
    add(box(0.76, 0.32, 0.03, 0, 0, 0).rotateX(0.35).translate(0.82, D + 0.94, -3.95), M.glass);
    add(new THREE.CylinderGeometry(0.05, 0.08, 0.34, 8).translate(0.82, D + 0.17, -2.95), M.chrome); add(box(0.5, 0.12, 0.5, 0.82, D + 0.4, -2.95), M.seat); add(box(0.5, 0.5, 0.1, 0.82, D + 0.7, -2.7), M.seat);
    add(new THREE.CylinderGeometry(0.025, 0.025, 0.56, 6).translate(-1.0, D + 0.28, -3.85), M.chrome);                    // kettle grill
    add(new THREE.SphereGeometry(0.24, 14, 8, 0, 6.3, 1.57, 1.57).translate(-1.0, D + 0.72, -3.85), M.black); add(new THREE.SphereGeometry(0.245, 14, 8, 0, 6.3, 0, 1.57).scale(1, 0.75, 1).translate(-1.0, D + 0.72, -3.85), M.red);
    add(box(0.6, 0.34, 0.36, 0.25, D + 0.17, -4.6), toon(0x1466d6)); add(box(0.62, 0.07, 0.38, 0.25, D + 0.375, -4.6), M.white);   // cooler
    add(new THREE.TorusGeometry(0.2, 0.06, 8, 16).rotateY(Math.PI / 2).translate(1.39, D + 0.3, -1.5), toon(0xff6a00));           // life ring
    const fid = newId();                                                                    // a flamingo pool float, up front
    add(new THREE.TorusGeometry(0.3, 0.12, 10, 20).rotateX(Math.PI / 2).translate(0, D + 0.12, -5.6), pink, fid);
    add(tube([[0, D + 0.14, -5.9], [0, D + 0.5, -6.02], [0, D + 0.74, -5.9], [0, D + 0.68, -5.76]], 0.045), pink, fid);
    add(new THREE.SphereGeometry(0.08, 10, 8).translate(0, D + 0.68, -5.74), pink, fid); add(new THREE.ConeGeometry(0.035, 0.14, 6).rotateX(2.2).translate(0, D + 0.63, -5.66), M.black, fid);
    const ty = C.TOWER[1], tz = C.TOWER[2];                                                 // the canopy: the rope ties on to its back bar
    for (const x of [1.3, -1.3]) for (const z of [tz, -5.2]) add(new THREE.CylinderGeometry(0.03, 0.03, ty - D, 8).translate(x, (ty + D) / 2, z), M.chrome);
    add(new THREE.CylinderGeometry(0.035, 0.035, 2.66, 8).rotateZ(Math.PI / 2).translate(0, ty - 0.03, tz), M.chrome);
    add(box(2.8, 0.08, 3, 0, ty + 0.02, tz - 1.56), toon(0xffffff, { rim: 0.2, params: { map: tex(256, 8, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#fff' : '#19c6b4'; c.fillRect(i * w / 8, 0, w / 8, h); } }) } }));
    add(box(0.5, 0.2, 0.3, 0, D - 0.12, 0.42), alu);                                        // outboard: bracket, cowl, leg
    add(new THREE.CapsuleGeometry(0.24, 0.34, 4, 12).scale(1, 1, 1.3).translate(0, 1.12, 0.66), M.black); add(box(0.5, 0.06, 0.66, 0, 1.0, 0.66), M.white);
    add(box(0.16, 1.2, 0.3, 0, 0.2, 0.68), M.black);
    crew(0.82, D + 0.54, -2.98, -0.5, D + 0.44, -0.72);
  }

  // ==== WOODY: a varnished mahogany runabout — a pointed bow, a long planked deck, a barrel-back stern, a low vee windshield, a chrome tube tower ====
  model();
  {
    const L = 7.3, n = 30, V = (x, y, z) => new THREE.Vector3(x, y, z), up = V(0, 1, 0), ty = C.TOWER[1], tz = C.TOWER[2], hullId = newId(), deckId = newId(), towerId = newId();
    const wood = toon(0x8e3d1c, { spec: 0.6, shine: 50 }), green = toon(0x1d5444, { rim: 0.3 });
    const planks = tex(256, 8, (c, w, h) => { c.fillStyle = '#a9521f'; c.fillRect(0, 0, w, h); c.fillStyle = '#f0cf8e'; for (let x = 0; x < w; x += 32) c.fillRect(x, 0, 5, h); });
    planks.wrapS = planks.wrapT = THREE.RepeatWrapping;
    const deck = toon(0xffffff, { spec: 0.5, shine: 50, params: { map: planks } });
    const planked = geo => { const p = geo.attributes.position; geo.setAttribute('uv', new THREE.Float32BufferAttribute(Array.from({ length: p.count * 2 }, (_, i) => (i % 2 ? p.getZ(i >> 1) : p.getX(i >> 1) / 1.1)), 2)); return geo; };
    const half = s => 1.17 * (0.78 + 0.22 * sm(0, 0.38, s)) * (1 - s ** 2.3) ** 0.75, top = s => 0.74 + 0.24 * s * s;   // widest a third of the way forward, drawn in to a point at the stem
    const rails = d => {
      const r = { keel: [], chine: [], wl: [], mid: [], gun: [], capIn: [], wall: [], crown: [] };
      for (let i = 0; i <= n; i++) {
        const s = i / n, z = -L * s, b = half(s), rake = 0.45 * s ** 5, gx = b * (0.86 + 0.14 * sm(0, 0.45, s));   // tumblehome: the deck is narrower than the hull at the stern
        const chine = V(d * b * 0.82, 0.02 + 0.52 * s ** 3, z - 0.3 * rake), mid = V(d * b, 0.44 + 0.3 * s * s, z - 0.75 * rake);
        r.keel.push(V(0, -0.32 + 0.86 * s ** 4, z)); r.chine.push(chine); r.wl.push(chine.clone().lerp(mid, 0.3)); r.mid.push(mid);
        r.gun.push(V(d * gx, top(s), z - rake)); r.capIn.push(V(d * Math.max(0, gx - 0.17), top(s), z - rake)); r.wall.push(V(d * Math.max(0, b - 0.3), 0.2, z));
        r.crown.push(V(0, top(s) + 0.09 * Math.min(1, i / 2, (n - i) / 8), z - rake));
      }
      return r;
    };
    const P = rails(1), Q = rails(-1), a = 4, f = 13;                                       // the cockpit runs from station a to station f
    for (const r of [P, Q]) {
      const d = r === P ? 1 : -1, out = V(d, 0, 0);
      add(strip(r.keel, r.chine, V(d * 0.3, -1, 0)), green, hullId);
      add(strip(r.chine, r.wl, out), M.seat);
      add(strip(r.wl, r.mid, out), wood, hullId); add(strip(r.mid, r.gun, out), wood, hullId);
      add(planked(strip(r.gun.slice(0, a + 1), r.crown.slice(0, a + 1), up)), deck, deckId);
      add(planked(strip(r.gun.slice(a, f + 1), r.capIn.slice(a, f + 1), up)), deck, deckId);
      add(planked(strip(r.gun.slice(f), r.crown.slice(f), up)), deck, deckId);
      add(strip(r.capIn.slice(a, f + 1), r.wall.slice(a, f + 1), out.clone().negate()), M.seat);
      add(tube(r.gun.filter((_, i) => i % 3 === 0).map(p => p.toArray()), 0.02), M.chrome);       // a bright line along the sheer
      add(strip([V(0, 0.86, -3.62), V(d * 0.98, 0.8, -3.2)], [V(0, 1.24, -3.38), V(d * 0.9, 1.16, -3.02)], V(0, 0.3, 1)), M.glass);   // windshield: two panes in a vee
      add(tube([[d * 0.98, 0.8, -3.2], [d * 0.9, 1.16, -3.02], [0, 1.24, -3.38]], 0.02), M.chrome);
      add(tube([[d * 0.9, 0.75, -1.35], [d * 0.84, 1.7, -1.95], [d * 0.7, ty - 0.03, tz]], 0.035), M.chrome, towerId);                // tower: two legs a side, meeting at the top bar
      add(tube([[d * 1.0, 0.78, -3.0], [d * 0.86, 1.7, -2.6], [d * 0.7, ty - 0.03, tz]], 0.035), M.chrome, towerId);
      add(lie(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8)).translate(d * 0.45, 0.3, 0.05), M.chrome);                               // exhaust
    }
    add(new THREE.CylinderGeometry(0.035, 0.035, 1.44, 8).rotateZ(Math.PI / 2).translate(0, ty - 0.03, tz), M.chrome, towerId);
    add(strip([Q.keel[0], Q.chine[0], Q.mid[0], Q.gun[0]], [P.keel[0].clone().setY(P.keel[0].y + 1e-3), P.chine[0], P.mid[0], P.gun[0]], V(0, 0, 1)), wood, hullId);   // transom, with her name on it
    noInk(add(new THREE.PlaneGeometry(1.3, 0.3).translate(0, 0.52, 0.012), toon(0xffffff, { rim: 0, params: { transparent: true, map: tex(416, 96, (c, w, h) => { c.fillStyle = '#ffd21f'; c.font = 'italic 900 80px Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('RIPPER', w / 2, h / 2 + 4); }) } })));
    add(strip(Q.wall.slice(a, f + 1), P.wall.slice(a, f + 1), up), M.teak);                                   // cockpit: floor, bulkheads, two benches back to back
    add(box(1.72, 0.66, 0.06, 0, 0.53, -3.13), wood); add(box(1.5, 0.6, 0.06, 0, 0.5, -1.0), M.seat);
    for (const [z, bz] of [[-2.5, 0.3], [-1.3, -0.32]]) { add(box(1.62, 0.3, 0.52, 0, 0.36, z), M.seat); add(box(1.62, 0.52, 0.12, 0, 0.66, z + bz), M.seat); add(box(1.66, 0.05, 0.15, 0, 0.94, z + bz), M.red); }
    add(new THREE.TorusGeometry(0.16, 0.022, 8, 20).rotateX(-0.5).translate(0.45, 0.86, -2.9), M.chrome);
    add(tube([P.keel[n], P.mid[n], P.gun[n]].map(p => p.toArray()), 0.03), M.chrome);                          // cutwater down the stem, and a light on the bow
    add(new THREE.SphereGeometry(0.05, 10, 8).translate(0, 1.04, -L - 0.38), M.chrome);
    crew(0.45, 0.59, -2.5, -0.45, 0.59, -1.3);
  }

  // ==== X-STAR and G23: the pro wake boats. Both are built the same way — a deep lofted hull with a flash of colour down its side and its name on it,
  // a full cockpit, a swim platform — but each has its own lines, bow (a pickle fork, or brought in to a blunt stem) and tower ====
  const pro = o => {
    model();
    const { L, half, sheer } = o, n = 28, k = L / 7, V = (x, y, z) => new THREE.Vector3(x, y, z), up = V(0, 1, 0), fwd = V(0, 0, -1), ty = C.TOWER[1], tz = C.TOWER[2], hullId = newId(), towerId = newId();
    const hull = toon(o.hull, { spec: 0.6, shine: 40 }), flash = toon(o.flash, { spec: 0.5, shine: 30 }), seat = toon(o.seat, { rim: 0.2 });
    const rails = d => {
      const r = { keel: [], chine: [], lo: [], hi: [], gun: [], capIn: [], wall: [] };
      for (let i = 0; i <= n; i++) {
        const s = i / n, z = -L * s, b = half(s), gy = sheer(s), rake = s ** 6, [lo, hi] = o.band(s);
        const chine = V(d * b * 0.88, 0.02 + 0.6 * s ** 3, z - 0.1 * rake), gun = V(d * b, gy, z - 0.35 * rake);
        r.keel.push(V(0, -0.36 + 0.9 * s ** 4, z)); r.chine.push(chine); r.gun.push(gun);
        r.lo.push(chine.clone().lerp(gun, lo)); r.hi.push(chine.clone().lerp(gun, hi));        // between these two, the flash of colour
        r.capIn.push(V(d * Math.max(0, b - 0.15), gy, gun.z)); r.wall.push(V(d * Math.max(0, b - 0.19), Math.max(0.24, chine.y + 0.08), z));   // the floor climbs with the bottom towards the bow
      }
      return r;
    };
    const P = rails(1), Q = rails(-1), c = o.bow || 17;                                     // the cockpit runs forward to station c — on a bowrider, on through the windshield into the bow
    for (const r of [P, Q]) {
      const d = r === P ? 1 : -1, out = V(d, 0, 0);
      add(strip(r.keel, r.chine, V(d * 0.3, -1, 0)), M.black, hullId);
      add(strip(r.chine, r.lo, out), hull, hullId); add(strip(r.lo, r.hi, out), flash); add(strip(r.hi, r.gun, out), hull, hullId);
      add(strip(r.gun, r.capIn, up), M.white, hullId);
      add(strip(r.capIn.slice(0, c), r.wall.slice(0, c), out.clone().negate()), seat);
    }
    add(strip([Q.keel[0], Q.chine[0], Q.gun[0]], [P.keel[0].clone().setY(P.keel[0].y + 1e-3), P.chine[0], P.gun[0]], V(0, 0, 1)), hull, hullId);   // transom, cockpit floor, foredeck
    add(strip(Q.wall.slice(0, c), P.wall.slice(0, c), up), M.floor);
    const crown = P.capIn.slice(c - 1).map((p, i) => V(0, p.y + 0.09 * (1 - i / (n - c + 1)), p.z));
    add(strip(Q.capIn.slice(c - 1), crown, up), M.white, hullId); add(strip(crown, P.capIn.slice(c - 1), up), M.white, hullId);
    // a bench along each wall from station i0 to i1: a cushion, its front, and both ends
    const bench = (i0, i1) => { for (const r of [P, Q]) {
      const d = r === P ? 1 : -1, w = r.wall.slice(i0, i1 + 1), top = w.map(p => V(p.x, p.y + 0.32, p.z)), lip = top.map(p => V(d * Math.max(0.2, Math.abs(p.x) - 0.42), p.y, p.z)), foot = lip.map((p, j) => V(p.x, w[j].y, p.z)), e = w.length - 1;
      add(strip(top, lip, up), seat); add(strip(lip, foot, V(-d, 0, 0)), seat);
      add(strip([top[0], lip[0]], [w[0], foot[0]], V(0, 0, 1)), seat); add(strip([top[e], lip[e]], [w[e], foot[e]], fwd), seat);
    } };
    if (o.bow) {                                                                             // the bow: a bench down each side, one across the front, a bulkhead closing it off under the foredeck
      const f = c - 1, F = P.wall[f];
      add(strip([Q.wall[f], Q.capIn[f], crown[0]], [P.wall[f], P.capIn[f], crown[0]], V(0, 0, 1)), seat);
      bench(18, f - 2); add(box(2 * F.x, 0.32, 0.5, 0, F.y + 0.16, F.z + 0.25), seat);
      bench(5, 9);                                                                           // in the back: benches down the sides of the cockpit, wrapping round from the rear bench
    }
    add(strip([Q.keel[n], Q.chine[n]], [P.keel[n].clone().setY(P.keel[n].y + 1e-3), P.chine[n]], fwd), M.black, hullId);                          // bow
    add(strip([Q.chine[n], Q.gun[n]], [P.chine[n], P.gun[n]], fwd), hull, hullId);
    if (o.fork) for (const d of [1, -1]) {                                                   // pickle fork: a pod each side, a notch between them
      const G = (d > 0 ? P : Q).gun[n], K = (d > 0 ? P : Q).chine[n], w = Math.abs(G.x), my = (G.y + K.y) / 2, v = (x, y, z) => V(d * x * w, y, z);
      const a = v(0.34, G.y, G.z), al = v(0.34, K.y, K.z), e = v(0.94, G.y - 0.03, G.z - 0.6), f = v(0.54, G.y - 0.03, G.z - 0.6), el = v(0.9, my, G.z - 0.5), fl = v(0.56, my, G.z - 0.5);
      const quad = (p0, p1, p2, p3, out, mat) => add(strip([p0, p3], [p1, p2], out), mat, hullId);
      quad(a, G, e, f, up, M.white); quad(G, e, el, K, V(d, 0, 0), hull); quad(a, f, fl, al, V(-d, 0, 0), hull); quad(f, e, el, fl, fwd, flash); quad(al, K, el, fl, V(0, -1, 0), M.black);
    }
    // her name: across the transom and down each side
    const name = tex(512, 128, (c, w, h) => { c.fillStyle = o.flash; c.font = 'italic 900 112px Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(o.name, w / 2, h / 2 + 6); });
    const label = geo => noInk(add(geo, toon(0xffffff, { rim: 0, params: { transparent: true, map: name } })));
    label(new THREE.PlaneGeometry(1.5, 0.375).translate(0, 0.58, 0.012));
    const [ns, nf] = o.nameAt, nb = half(ns), ny = sheer(ns);
    for (const d of [1, -1]) label(new THREE.PlaneGeometry(1.44, 0.36).rotateY(d * Math.PI / 2).rotateZ(-d * Math.atan2(0.12 * nb, ny)).translate(d * (nb * (0.88 + 0.12 * nf) + 0.02), 0.02 + nf * (ny - 0.02), -L * ns));
    add(box(2.2, 0.07, 0.8, 0, 0.2, 0.42), toon(0x6a7384, { rim: 0 }));                         // swim platform
    // cockpit: sun pad, rear bench, helm and observer seats, dash, wheel, a wrapped windshield
    for (const x of o.bow ? [0.64, -0.64] : [0]) add(box(o.bow ? 0.68 : 1.96, 0.75, 0.06, x, 0.55, -4.0 * k), seat);   // a bowrider's dash parts in the middle for the walk-through
    add(box(2.1, 0.56, 1.25, 0, 0.5, -0.68), seat); add(box(1.9, 0.05, 1.05, 0, 0.8, -0.68), flash);
    if (o.bow) add(new THREE.BoxGeometry(1.9, 0.45, 0.1).rotateX(-0.3).translate(0, 1.0, -1.2), seat);                 // the sun pad's back flipped up: seats facing the rider
    add(box(2.0, 0.3, 0.5, 0, 0.37, -1.6), seat);
    for (const x of [0.62, -0.62]) { add(box(0.5, 0.32, 0.5, x, 0.38, -3.0 * k), seat); add(box(0.5, 0.55, 0.1, x, 0.75, -3.0 * k + 0.26), seat); }
    add(box(0.8, 0.3, 0.3, 0.62, 0.86, -3.85 * k), M.black);
    add(new THREE.TorusGeometry(0.16, 0.022, 8, 20).rotateX(-0.5).translate(0.62, 0.92, -3.85 * k + 0.23), M.black);
    const wb = [], wt = [], wy = sheer(0.6), ww = half(0.6) - 0.03;
    for (let i = 0; i <= 14; i++) { const a = (i / 14 - 0.5) * 2, x = a * ww, z = -3.85 * k - 0.75 * Math.cos(a * 1.45); wb.push(V(x, wy + 0.02, z)); wt.push(V(x * 0.9, wy + 0.5, z + 0.32)); }
    for (const [a, b] of o.bow ? [[0, 6], [9, 15]] : [[0, 15]]) { add(strip(wb.slice(a, b), wt.slice(a, b), V(0, 0.3, 1)), M.glass); add(tube(wt.slice(a, b).map(p => p.toArray()), 0.028), M.black); }   // a gap down the middle to walk through
    // tower: the boat's own, then what hangs off any of them — speakers, and boards in the racks
    const tb = half(0.3) - 0.03, gy = sheer(0.3);
    o.tower(tb, gy, towerId, flash);
    for (const x of [-0.48, -0.16, 0.16, 0.48]) {
      stock.push(add(new THREE.CylinderGeometry(0.13, 0.11, 0.3, 14).rotateX(Math.PI / 2).translate(x, ty - 0.24, tz - 0.05), M.black),
        add(new THREE.CircleGeometry(0.1, 14).translate(x, ty - 0.24, tz + 0.105), M.chrome), add(new THREE.CircleGeometry(0.045, 10).translate(x, ty - 0.24, tz + 0.108), flash));
    }
    for (const [x, col] of [[-tb - 0.1, 0xffc928], [tb + 0.1, 0x22c7d6]]) add(new THREE.CapsuleGeometry(0.2, 0.9, 3, 10).scale(0.12, 1, 1).rotateX(Math.PI / 2 - 0.25).translate(x, gy + 0.8, -2.6), toon(col, { spec: 0.4 }));
    crew(0.62, 0.62, -3.0 * k - 0.05, -0.62, 0.62, -1.62);
  };
  // X-Star: black with a lime flash sweeping up to the stern, a pickle-fork bow, an open bow with benches round it, wraparound seats in the back,
  // and a chunky forged tower — an arch each side, a deep top, the bimini folded away along its front edge
  pro({ name: 'X-STAR', L: 6.8, fork: true, bow: 25, hull: '#15171f', flash: '#b6ff1a', seat: '#3a4050', nameAt: [0.3, 0.77],
    half: s => (1.24 + 0.08 * sm(0, 0.3, s)) * (1 - 0.34 * s ** 2.8), sheer: s => 0.92 + 0.24 * s * s, band: s => [0.1, 0.1 + 0.52 * (1 - s) ** 1.4],
    tower(b, gy, id, flash) {
      const ty = C.TOWER[1], lean = 0.18, H = (ty - gy) / Math.cos(lean), w = b - Math.sin(lean) * H;
      const arch = new THREE.Shape([[1.62, 0], [2.2, H], [3.22, H], [3.64, 0], [3.3, 0], [2.98, H - 0.2], [2.44, H - 0.2], [1.95, 0]].map(p => new THREE.Vector2(...p)));
      for (const d of [1, -1]) {
        add(new THREE.ExtrudeGeometry(arch, { depth: 0.11, bevelEnabled: false }).translate(0, 0, -0.055).rotateY(Math.PI / 2).rotateZ(d * lean).translate(d * b, gy, 0), M.black, id);
        add(box(0.16, 0.12, 1.15, d * w, ty - 0.06, -2.72), M.black, id);                     // the top: a rail each side, open between them
        add(box(0.04, 0.05, 1.0, d * (w + 0.09), ty - 0.06, -2.72), flash);                  // a lime pinstripe down each
      }
      for (const z of [-2.3, -3.18]) add(box(2 * w, 0.12, 0.3, 0, ty - 0.06, z), M.black, id);   // and a crossbar at each end
      add(new THREE.CylinderGeometry(0.09, 0.09, 2 * w - 0.1, 10).rotateZ(Math.PI / 2).translate(0, ty + 0.06, -3.2), M.navy);   // the bimini, stowed
    } });
  // G23: silver-white with an orange flash, a tall blunt bow, and a tower of two swept blades carrying a long top out over the helm
  pro({ name: 'G23', L: 7.2, fork: false, hull: '#e8ecf2', flash: '#ff6a00', seat: '#cfd8e6', nameAt: [0.2, 0.78],
    half: s => (1.24 + 0.07 * sm(0, 0.3, s)) * (1 - 0.86 * s ** 3.4), sheer: s => 0.9 + 0.34 * s ** 1.6, band: s => [0.2 + 0.25 * s, 0.2 + 0.25 * s + 0.24 * sm(0, 0.25, s) * (1 - s ** 3)],
    tower(b, gy, id, flash) {
      const ty = C.TOWER[1], lean = 0.2, H = (ty - gy) / Math.cos(lean), blade = new THREE.Shape([[1.45, 0], [2.25, H], [4.0, H], [3.9, H - 0.1], [2.85, H - 0.22], [2.45, 0]].map(p => new THREE.Vector2(...p)));
      for (const d of [1, -1]) add(new THREE.ExtrudeGeometry(blade, { depth: 0.12, bevelEnabled: false }).translate(0, 0, -0.06).rotateY(Math.PI / 2).rotateZ(d * lean).translate(d * b, gy, 0), M.black, id);
      add(box(2 * (b - Math.sin(lean) * H) + 0.14, 0.1, 1.75, 0, ty - 0.05, -3.125), M.black, id);
      add(box(2 * (b - Math.sin(lean) * H) - 0.1, 0.03, 1.5, 0, ty + 0.015, -3.2), flash);
    } });

  // ==== the big speakers (gear.js): four cans in a row under the top of the tower, on whichever boat, in place of its own. Neon round the rims; the cones kick with the music ====
  const cans = new THREE.Group(), neon = [0xff4fd8, 0x5fe3ff].map(c => new THREE.MeshBasicMaterial({ color: c }));
  g.add(cans); cur = cans;
  [-0.6, -0.2, 0.2, 0.6].forEach((x, i) => {
    const y = C.TOWER[1] - 0.3, z = C.TOWER[2], id = newId();
    add(lie(new THREE.CylinderGeometry(0.195, 0.16, 0.46, 18)).translate(x, y, z - 0.14), M.black, id);
    add(new THREE.TorusGeometry(0.18, 0.02, 8, 24).translate(x, y, z + 0.09), neon[i % 2], id);
    for (const [r, mat, dz] of [[0.16, M.chrome, 0.092], [0.065, M.black, 0.096]]) { const cone = add(new THREE.CircleGeometry(r, 18), mat, id); cone.position.set(x, y, z + dz); cones.push(cone); }
  });
  add(box(1.7, 0.07, 0.12, 0, C.TOWER[1] - 0.085, C.TOWER[2] - 0.14), M.black);
  // the bass cannons add a pair: bigger cans up on top of the tower, either side of the rope
  const pair = new THREE.Group(); cans.add(pair); cur = pair;
  for (const d of [1, -1]) {
    const x = d * 0.34, y = C.TOWER[1] + 0.245, z = C.TOWER[2], id = newId();
    add(lie(new THREE.CylinderGeometry(0.24, 0.2, 0.52, 18)).translate(x, y, z - 0.16), M.black, id);
    add(new THREE.TorusGeometry(0.225, 0.024, 8, 24).translate(x, y, z + 0.1), neon[d > 0 ? 0 : 1], id);
    for (const [r, mat, dz] of [[0.2, M.chrome, 0.102], [0.08, M.black, 0.106]]) { const cone = add(new THREE.CircleGeometry(r, 18), mat, id); cone.position.set(x, y, z + dz); cones.push(cone); }
  }
  cur = cans;

  cur = g;
  // ---- the Stars and Stripes on a pole above the tower ----
  const px = -0.72, pz = tz + 0.06, top = ty + 1.55, FL = 1.15, FH = 0.62, NU = 14, NV = 6;
  add(new THREE.CylinderGeometry(0.018, 0.018, 1.6, 8).translate(px, ty + 0.78, pz), M.chrome);
  add(new THREE.SphereGeometry(0.04, 10, 8).translate(px, top + 0.06, pz), toon(0xffd21f, { spec: 0.6 }));
  const cv = document.createElement('canvas'); cv.width = 494; cv.height = 260;
  const c = cv.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, 494, 260);
  c.fillStyle = '#c8102e'; for (let i = 0; i < 13; i += 2) c.fillRect(0, i * 20, 494, 20);
  c.fillStyle = '#0a3161'; c.fillRect(0, 0, 198, 140);
  c.fillStyle = '#fff';
  for (let r = 0; r < 9; r++) for (let k = 0; k < (r % 2 ? 5 : 6); k++) {      // fifty stars: rows of six and five
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, R = i % 2 ? 2.4 : 6; c.lineTo(16.5 + (r % 2 ? 16.5 : 0) + k * 33 + R * Math.cos(a), 14 + r * 14 + R * Math.sin(a)); }
    c.fill();
  }
  const flagTex = new THREE.CanvasTexture(cv); flagTex.colorSpace = THREE.SRGBColorSpace; flagTex.anisotropy = 8;
  const flagGeo = new THREE.PlaneGeometry(1, 1, NU, NV), fp = flagGeo.attributes.position;
  add(flagGeo, toon(0xffffff, { rim: 0.2, params: { map: flagTex, side: THREE.DoubleSide } })).frustumCulled = false;
  let raise = 0, last = 0, pull = 0, cheer = 0, side = 1, glance = 1;
  const lim = (v, m) => Math.max(-m, Math.min(m, v));

  return {
    group: g,
    pick(i) { models.forEach((m, j) => { m.visible = i === j; }); },   // which boat is out on the water (gear.js)
    speakers(i) {                                                      // 0 the boat's own, 1 the bass cannons, 2 the disco stack (gear.js)
      cans.visible = !!i; pair.visible = i === 1; for (const m of stock) m.visible = !i;
      neon[0].color.set(i === 2 ? 0xffd21f : 0xff4fd8); neon[1].color.set(i === 2 ? 0x7dff3a : 0x5fe3ff);
    },
    cheer() { cheer = 1.8; glance = side; },                       // a big trick landed: the crew saw it
    // down: a rider is in the water; fallT: seconds since they fell (0 if they haven't); beat: how far through the music's beat (0 on it … 1);
    // tug: how hard the rope is hauling the tower sideways (−1 … 1, + to starboard); rx, rz: where the rider is
    update(t, down, fallT, beat, tug = 0, rx = 0, rz = 15) {
      const dt = Math.min(0.05, Math.max(0, t - last)), ease = r => 1 - Math.exp(-dt * r); last = t;
      for (const c of cones) c.scale.setScalar(1 + 0.16 * Math.exp(-7 * beat));
      // sit bow-high (most of all while climbing on to the plane) and breathe a little on the water
      g.position.y = (C.surf ? -0.13 : 0.02) + 0.015 * Math.sin(t * 2.3);           // weighted down at the stern for surfing: platform nearly awash, bow higher
      g.rotation.x = (0.05 + 0.3 * (1 - C.go)) * C.go + (C.surf ? 0.04 : 0) + 0.006 * Math.sin(t * 1.7);
      g.rotation.z = 0.012 * Math.sin(t * 1.1);
      // When the rider falls the driver throttles back and brings the boat round to starboard to pick them up. The world here
      // carries on straight at boat speed, so the turning boat drops back and swings out of its usual place.
      const tau = Math.max(0, fallT - 0.6), R = 16, phi = C.V / R * tau * tau / (tau + 0.8);
      g.position.x = R * (1 - Math.cos(phi)); g.position.z = C.V * tau - R * Math.sin(phi);
      C.turn.R = R; C.turn.zj = C.V * tau; C.turn.phi = phi;                      // the wake follows it round
      g.rotation.y = -phi; g.rotation.z -= 0.13 * Math.min(1, phi * 2.5);        // heeled in to the turn
      pull += (tug - pull) * ease(5);                                            // a rider cutting hard hauls the tower over towards them, and the stern round after it
      g.rotation.y += 0.022 * pull; g.rotation.z -= 0.05 * pull;
      // the crew: the spotter's eyes stay on the rider. For a big landing the driver looks round over a shoulder, and the spotter is up and punching the air
      cheer = Math.max(0, cheer - dt); side = rx >= g.position.x ? 1 : -1;
      const hype = Math.min(1, cheer * 2.5);
      for (const [hd, p, back] of heads) hd.rotation.y += ((back ? lim(Math.atan2(rx - g.position.x - p.position.x, rz - g.position.z - p.position.z), 1.2) : -2 * glance * hype) - hd.rotation.y) * ease(8);
      for (const f of fists) f.rotation.x = 2.39 - hype * (2.7 + 0.35 * Math.sin(t * 15));
      for (const p of spotters) p.position.y = p.userData.y + 0.06 * hype * Math.abs(Math.sin(t * 9));
      // the spotter's flag goes up, and waves, while the rider is down
      raise += ((down ? 1 : 0) - raise) * ease(7);
      for (const arm of arms) { arm.rotation.x = 2.6 - 2.75 * raise; arm.rotation.z = 0.16 * Math.sin(t * 9) * raise; }
      // the big flag hangs at rest and streams aft, a little to starboard, once the boat is moving
      const w = 0.25 + 0.75 * C.go;
      for (let iy = 0; iy <= NV; iy++) for (let ix = 0; ix <= NU; ix++) {
        const u = ix / NU, v = iy / NV, flap = (0.1 * w * Math.sin(7 * u - 9 * t + 1.2 * v) + 0.05 * Math.sin(4 * u - 5 * t)) * u;
        fp.setXYZ(iy * (NU + 1) + ix, px + 0.3 * w * u * FL + flap, top - v * FH - 0.9 * (1 - w) * u * FL + 0.03 * u * Math.sin(6 * u - 7 * t), pz + 0.95 * w * u * FL + 0.3 * flap);
      }
      fp.needsUpdate = true; flagGeo.computeVertexNormals();
    },
  };
}
