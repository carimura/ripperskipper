// Sky dome (painted gradient, toon clouds, far mountains), lights, and the lakes: for each one a palette, a sun and a scrolling shore of its own.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, ink, gMat, SUN } from './gfx.js';
import { SKY_GLSL, PALETTE } from './water.js';

const SKY_FRAG = SKY_GLSL + `
  uniform vec3 uSun, uHaze, uCloud, uMtn; uniform float uTime;
  uniform vec4 uSky;        // the lake's sky: how big the sun is, mesas for mountains (0/1), snow on them (0/1), stars (0/1)
  uniform vec3 uSky2;       // …how tall the far mountains stand, and one great snow peak behind them: which way it lies, how tall (0: none)
  varying vec3 vDir;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; } return s; }
  float ridge(float az, float f, float seed) {
    vec2 r = vec2(cos(az), sin(az));
    float h = 0.62 * (1.0 - abs(2.0 * vnoise(r * f + seed) - 1.0)) + 0.38 * (1.0 - abs(2.0 * vnoise(r * f * 2.9 + seed * 1.7) - 1.0));
    return mix(h, 0.5 * smoothstep(0.4, 0.44, h) + 0.45 * smoothstep(0.62, 0.65, h), uSky.y);   // mesas: flat tops at two heights, cliffs between
  }
  float cloud(vec3 d) { vec2 uv = d.xz / (d.y + 0.16) * 0.9 + uTime * vec2(0.006, 0.003); return fbm(uv * 1.25) - 0.1 * smoothstep(0.25, 0.0, d.y); }
  void main() {
    vec3 d = normalize(vDir);
    vec3 col = skyGrad(d);
    vec2 sg = d.xz / (0.3 + d.y) * 60.0;             // stars: a dot in a few cells of a grid laid over the sky, twinkling
    float sh = hash(floor(sg));
    col += uSky.w * step(0.985, sh) * smoothstep(0.2, 0.08, length(fract(sg) - 0.5)) * smoothstep(0.03, 0.2, d.y) * (0.65 + 0.35 * sin(uTime * 2.0 + sh * 400.0));
    float sd = dot(d, uSun), edge = 1.0 - 0.0015 * uSky.x * uSky.x;
    col += mix(vec3(1.0, 0.93, 0.75), vec3(0.9, 0.95, 1.0), uSky.w) * (smoothstep(edge, edge + 0.0004, sd) + 0.35 * pow(max(sd, 0.0), 24.0));

    // cumulus: white tops, lilac undersides where there is more cloud just above
    float c = cloud(d), top = cloud(normalize(d + vec3(0.0, 0.045, 0.0)));
    float cover = smoothstep(0.5, 0.52, c) * smoothstep(0.02, 0.09, d.y);
    vec3 cc = mix(vec3(1.0), vec3(0.72, 0.8, 0.96), smoothstep(0.5, 0.53, top));
    cc = mix(cc, vec3(0.56, 0.68, 0.9), smoothstep(0.6, 0.63, top));
    col = mix(col, mix(cc * uCloud, uHorizon, smoothstep(0.2, 0.03, d.y) * 0.5), cover);

    // two ranges of far mountains: jagged skylines, each peak throwing a slanted shadow face
    float az = atan(d.x, -d.z), el = d.y / max(length(d.xz), 1e-4);
    // one great snow peak behind the ranges: broad shoulders, ice-blue in its folds, its foot lost in the haze
    float da = atan(sin(az - uSky2.y), cos(az - uSky2.y)) / 0.17;
    float pk = uSky2.z * (0.8 * exp(-da * da * 2.2) + 0.2 * max(0.0, 1.0 - abs(da) * 1.1) + 0.05 * vnoise(vec2(az * 38.0, 7.0)));
    vec3 ice = mix(vec3(0.66, 0.78, 0.96), vec3(1.0), step(0.42, vnoise(vec2((az + el * 0.9) * 46.0, el * 30.0))));
    col = mix(col, mix(uHorizon, ice, smoothstep(0.0, 0.55 * pk, el)), smoothstep(pk + 0.0015, pk - 0.0015, el) * step(0.001, uSky2.z));
    float r1 = (0.014 + 0.085 * ridge(az, 2.6, 5.0)) * uSky2.x, k1 = (r1 - el) * 0.9;
    float lit1 = step(0.0, ridge(az + k1 + 0.006, 2.6, 5.0) - ridge(az + k1 - 0.006, 2.6, 5.0));
    vec3 m1 = mix(vec3(0.4, 0.55, 0.84), vec3(0.62, 0.77, 0.96), lit1);
    m1 = mix(m1, mix(vec3(0.62, 0.3, 0.24), vec3(0.92, 0.56, 0.36), lit1), uSky.y);       // mesas are red rock
    float snow = uSky.z * step((0.062 + 0.012 * vnoise(vec2(az * 70.0, 3.0))) * uSky2.x, el);
    m1 = mix(m1, mix(vec3(0.8, 0.88, 1.0), vec3(1.0), lit1), snow);
    col = mix(col, mix(m1 * uMtn, uHorizon, 0.18), smoothstep(r1 + 0.0012, r1 - 0.0012, el));
    float r2 = (0.008 + 0.042 * ridge(az + 1.3, 4.7, 11.0)) * uSky2.x, k2 = (r2 - el) * 1.4;
    float lit2 = step(0.0, ridge(az + 1.3 + k2 + 0.004, 4.7, 11.0) - ridge(az + 1.3 + k2 - 0.004, 4.7, 11.0));
    vec3 m2 = mix(mix(vec3(0.16, 0.4, 0.5), vec3(0.27, 0.56, 0.55), lit2), mix(vec3(0.5, 0.24, 0.2), vec3(0.76, 0.42, 0.3), lit2), uSky.y);
    col = mix(col, m2 * uMtn, smoothstep(r2 + 0.0012, r2 - 0.0012, el));

    col = mix(col, uHaze, smoothstep(0.004, -0.004, d.y));       // below the horizon: the far water
    gl_FragColor = vec4(col, 1.0);
  }`;

export function createSky() {
  const uniforms = {
    uSun: { value: SUN }, uTime: { value: 0 }, uSky: { value: new THREE.Vector4() }, uSky2: { value: new THREE.Vector3() }, uHaze: { value: PALETTE.haze }, uCloud: { value: PALETTE.cloud }, uMtn: { value: PALETTE.mtn },
    uHorizon: { value: PALETTE.horizon }, uSkyMid: { value: PALETTE.skyMid }, uZenith: { value: PALETTE.zenith },
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fragmentShader: SKY_FRAG,
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0); }',
  }));
  mesh.renderOrder = -10; mesh.frustumCulled = false;
  mesh.userData.gmat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fragmentShader: 'void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 4000.0); }',
    vertexShader: 'void main() { gl_Position = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0); }',
  });
  return { mesh, look: uniforms.uSky.value, look2: uniforms.uSky2.value, update(t) { uniforms.uTime.value = t; } };
}

export function createLights(scene) {
  const hemi = new THREE.HemisphereLight(), sun = new THREE.DirectionalLight();   // their colours and strengths come from the lake (setLake)
  scene.add(hemi);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 70 });
  sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  return { sun, hemi, aim(x, y, z) { sun.target.position.set(x, y, z); sun.position.copy(sun.target.position).addScaledVector(SUN, 30); } };
}

// ---- shores: 640 m of bank down each side, tiled along the lake. Every lake builds its own: land, plants, buildings ----
const SEG = 640, UP = new THREE.Vector3(0, 1, 0);
const wob = (z, k, ph) => Math.sin(z / SEG * 6.2831853 * k + ph);
const tones = hex => hex.split(' ').map(c => new THREE.Color(c).toArray());
const tint = (geom, c) => { const k = new THREE.Color(c).toArray(), n = geom.attributes.position.count; geom.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => k[i % 3]), 3)); return geom; };
const vmat = map => toon(0xffffff, { rim: 0, params: map ? { vertexColors: true, map } : { vertexColors: true } });
const glow = new THREE.MeshBasicMaterial({ vertexColors: true });                     // lit from inside: lamps, signs
const mesh = (geo, mat) => ink(new THREE.Mesh(geo, mat));
const tex = (w, h, draw) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };

// The land: cross-sections of [distance out from the middle of the lake, height, colour], from the waterline inland, joined up along the lake.
// A point given twice makes a hard edge there.
function land(side, sect, map, len = SEG) {
  const N = Math.round(160 * len / SEG), pos = [], col = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const z = i / N * len, pts = sect(z), n = pts.length;
    pts.forEach(([x, y, c], j) => {
      pos.push(side * x, y, -z); col.push(...c); uv.push(z / 48, y / 48);
      if (i < N && j < n - 1) { const a = i * n + j, b = a + 1, c = a + n, d = c + 1; side > 0 ? idx.push(a, b, c, b, d, c) : idx.push(a, c, b, b, c, d); }
    });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  return mesh(geo, vmat(map));
}
// Copies of one thing: place() gives [x, y, z, size, colour, height if not the same, which way it faces if not at random].
function scatter(g, geo, n, rnd, place, mat = vmat()) {
  const all = new THREE.InstancedMesh(geo, mat, n), m = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    const [x, y, z, s, c, sy = s, turn = rnd() * 6.3] = place(i);
    all.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(UP, turn), new THREE.Vector3(s, sy, s)));
    if (c) all.setColorAt(i, new THREE.Color(c));
  }
  g.add(ink(all));
}
const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];
const build = list => mergeGeometries(list.map(([geo, c]) => tint(geo, c)));           // one thing out of [part, colour] pairs
// A strip of ground between two lines of points.
function ribbon(a, b) {
  const pos = [], idx = [];
  a.forEach((p, i) => { pos.push(p.x, p.y, p.z, b[i].x, b[i].y, b[i].z); if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); } });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}
// An office block faced with windows from one of the window textures: 4 m apart and 3.5 m a floor, whatever its size. The roof takes the colour of the frames.
function block(w, h, d, x, z, rnd) {
  const b = new THREE.BoxGeometry(w, h, d), uv = b.attributes.uv, u0 = Math.floor(rnd() * 16) / 16, v0 = Math.floor(rnd() * 16) / 16;
  for (let k = 0; k < uv.count; k++) k >= 8 && k < 16 ? uv.setXY(k, 0.002, 0.002) : uv.setXY(k, u0 + uv.getX(k) * Math.round((k < 8 ? d : w) / 4) / 16, v0 + uv.getY(k) * Math.round(h / 3.5) / 16);
  return b.translate(x, 2.5 + h / 2, -z);
}
// A lighthouse in bands of red and white, its lamp lit. k: its size (1 stands 35 m).
function lighthouse(g, x, z, k = 1) {
  const band = (r0, r1, y, c) => [new THREE.CylinderGeometry(r1, r0, 7, 10).translate(0, y, 0), c];
  const tower = build([band(3.4, 3, 4, 0xf6f7fb), band(3, 2.6, 11, 0xe8262e), band(2.6, 2.2, 18, 0xf6f7fb), band(2.2, 1.9, 25, 0xe8262e), [new THREE.CylinderGeometry(2.6, 2.6, 0.5, 10).translate(0, 28.7, 0), 0x20242e], [new THREE.ConeGeometry(2.2, 2.4, 10).translate(0, 33, 0), 0xe8262e]]);
  g.add(mesh(tower.scale(k, k, k).translate(x, 0, -z), vmat()), mesh(tint(new THREE.CylinderGeometry(1.5, 1.5, 3, 10).translate(0, 30.4, 0), 0xfff3b0).scale(k, k, k).translate(x, 0, -z), glow));
}

// Pine Lake: green hills, pines, cabins and docks.
const PINE = mergeGeometries([
  tint(new THREE.CylinderGeometry(0.07, 0.09, 0.3, 5).translate(0, 0.15, 0), 0x6b4a2e),
  tint(new THREE.ConeGeometry(0.34, 0.6, 7).translate(0, 0.55, 0), 0xffffff),
  tint(new THREE.ConeGeometry(0.24, 0.5, 7).translate(0, 0.9, 0), 0xffffff),
]);
function pines(side, rnd) {
  const g = new THREE.Group(), T = tones('#e8d9a0 #8cc65a #5aa648 #3a8a44 #2f7a4a');   // from the waterline up the hill
  const bank = z => 115 + 16 * wob(z, 2, side) + 7 * wob(z, 5, 1.7 * side);
  const hill = (z, t) => t * t * (26 + 14 * wob(z, 3, 2 + side) + 9 * wob(z, 7, side * 3)) + t * 5;   // t: 0 at the bank → 1 inland
  g.add(land(side, z => [0, 5, 28, 80, 190].map((dx, j) => [bank(z) + dx, j === 0 ? -0.4 : j === 1 ? 0.7 : hill(z, dx / 190), T[j]])));
  scatter(g, PINE, 230, rnd, () => {
    const z = rnd() * SEG, t = 0.04 + rnd() ** 1.6 * 0.6, h = 8 + rnd() * 9;
    return [side * (bank(z) + t * 190), Math.max(0.7, hill(z, t)) - 0.3, -z, h * 0.9, new THREE.Color().setHSL(0.36 + rnd() * 0.06, 0.5 + rnd() * 0.15, 0.24 + rnd() * 0.12), h];
  });
  const wall = toon(0xf4ead8, { rim: 0 }), roofs = [0xc8443a, 0x3a6ea8, 0x8a5a3a].map(k => toon(k, { rim: 0 })), wood = toon(0x9a7248, { rim: 0 });
  for (let i = 0; i < 5; i++) {
    const z = (i + 0.3 + rnd() * 0.5) * SEG / 5, x = side * (bank(z) + 9 + rnd() * 10), y = hill(z, 0.07);
    const cabin = new THREE.Group();
    cabin.add(mesh(new THREE.BoxGeometry(7, 4, 9).translate(0, 2, 0), wall));
    cabin.add(mesh(new THREE.CylinderGeometry(0.01, 5.6, 3, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 1.25).translate(0, 5.5, 0), roofs[i % 3]));
    cabin.position.set(x, y, -z); cabin.rotation.y = rnd() * 0.6 - 0.3;
    g.add(cabin);
    if (i % 2 === 0) g.add(mesh(new THREE.BoxGeometry(16, 0.35, 2.2).translate(side * (bank(z + 14) - 6), 0.55, -z - 14), wood));
  }
  return g;
}

// San Francisco Bay: not a shore tiled round like the others but one long way in. Open ocean first, a container ship heading in; then the Golden Gate,
// the city's wooded Presidio on the right and the green hills of Marin on the left; on into the bay — Sausalito's houses, Alcatraz, the city stacked up
// its hills in painted houses with Coit Tower, the Transamerica Pyramid and the Ferry Building on the Embarcadero; Oakland's container cranes and towers
// coming up on the left; the Bay Bridge, silver and hung with lights, to go under. Then the shores fall away to open water, and it all comes round again.
const ROCK = tint(new THREE.IcosahedronGeometry(1, 0), 0xffffff);
const HOUSE = tint(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), 0xffffff);
const CONTAINER = tint(new THREE.BoxGeometry(2.4, 2.6, 12).translate(0, 1.3, 0), 0xffffff);
const BAY = 4000, ease = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
// A suspension bridge across the water J along: deck at D, towers at ±X up to T, the cables down to ±A; its towers braced with portals or crosses.
function span(g, J, o) {
  const { D, T, X, A } = o, parts = [new THREE.BoxGeometry(2 * A + 80, o.deck, 18).translate(0, D, -J)], bulbs = [];
  const sag = x => { const a = Math.abs(x); return a < X ? D + 3 + (T - D - 5) * (a / X) ** 2 : D + 4 + (T - D - 6) * (1 - (a - X) / (A - X)) ** 2; };
  for (const x of [X, -X]) {
    for (const dz of [8.5, -8.5]) for (const [y0, y1, w] of [[-3, D - 2, 5.4], [D - 2, 0.6 * T, 4.8], [0.6 * T, 0.8 * T, 4.2], [0.8 * T, T, 3.6]]) parts.push(new THREE.BoxGeometry(w, y1 - y0, w * 1.3).translate(x, (y0 + y1) / 2, -J + dz));
    for (const y of [D - 5, T - 2, ...(o.cross ? [] : [0.58 * T, 0.78 * T])]) parts.push(new THREE.BoxGeometry(3.4, 4, 17).translate(x, y, -J));
    if (o.cross) for (let k = 0; k < 3; k++) {                                 // a cross in each of three panels between the deck and the top
      const y0 = D + 4 + k * (T - D - 8) / 3, y1 = y0 + (T - D - 8) / 3, len = Math.hypot(17, y1 - y0), a = Math.atan2(17, y1 - y0);
      for (const s of [1, -1]) parts.push(new THREE.BoxGeometry(1.6, len, 1.6).rotateX(s * a).translate(x, (y0 + y1) / 2, -J));
    }
    g.add(mesh(new THREE.BoxGeometry(16, 5, 30).translate(x, -0.5, -J), toon(0xb4b0a8, { rim: 0 })));   // its footing
    bulbs.push([x, T + 1, -J + 8.5, 0.9, '#ff3b30'], [x, T + 1, -J - 8.5, 0.9, '#ff3b30']);
  }
  for (const x of [150, -150, 200, -200]) parts.push(new THREE.BoxGeometry(4, D, 14).translate(x, D / 2 - 2, -J));   // the approach piers
  for (const dz of [8.5, -8.5]) {
    for (const [a, b] of [[-A, -X], [-X, X], [X, A]]) parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([0, 1, 2, 3, 4, 5, 6, 7, 8].map(k => new THREE.Vector3(a + (b - a) * k / 8, sag(a + (b - a) * k / 8), -J + dz))), 32, 0.9, 6));
    for (let x = -A + 10; x < A; x += 10) if (Math.abs(Math.abs(x) - X) > 4) parts.push(new THREE.BoxGeometry(0.25, sag(x) - D, 0.25).translate(x, (sag(x) + D) / 2, -J + dz));
    if (o.lights) for (let x = -A + 5; x < A; x += 10) bulbs.push([x, sag(x) + 1.2, -J + dz, 0.6, '#fff3c4']);
  }
  g.add(mesh(mergeGeometries(parts.map(p => p.toNonIndexed())), toon(o.col, { rim: 0 })));
  g.add(mesh(new THREE.BoxGeometry(2 * A + 80, 0.3, 14).translate(0, D + o.deck / 2 + 0.15, -J), toon(0x4a4f58, { rim: 0 })));   // the roadway
  scatter(g, BULB, bulbs.length, () => 0, i => bulbs[i], glow);
}
function bay(rnd) {
  const g = new THREE.Group(), [wet, sand, grass, wood, quay, street] = tones('#cbbfa0 #e6d6a8 #8cc65a #3f7f4a #a8a399 #c9c2b4');
  // how much of each shore there is, J along the way in: Marin and then Oakland on the left, with the East Bay far off between them; the city on the right
  const mW = J => ease(530, 705, J) * (1 - ease(860, 930, J)), oW = J => ease(930, 1010, J) * (1 - ease(1500, 1700, J)), eW = J => ease(800, 900, J) * (1 - ease(1450, 1700, J));
  const sW = J => ease(510, 695, J) * (1 - ease(1450, 1650, J));
  const pL = J => mW(J) + oW(J) + (1 - mW(J) - oW(J)) * eW(J);
  const bankL = J => 112 + 10 * wob(J, 2, 1) + (1 - mW(J) - oW(J)) * 320, bankR = J => 104 + 8 * wob(J, 2, 3) + (1 - sW(J)) * 320;
  const hL = (J, t) => { const m = mW(J), o = oW(J), e = eW(J);
    return m * (2 + t * (0.4 + 0.6 * t) * (62 + 18 * wob(J, 3, 2) + 8 * wob(J, 7, 3))) + o * (2.5 + Math.max(0, t - 0.45) * 90 * (1 + 0.2 * wob(J, 4, 1))) + (1 - m - o) * (e * (2 + 12 * t) - 4 * (1 - e)); };
  const hR = (J, t) => sW(J) * (3 + t * (30 + 18 * wob(J, 2, 1) + 8 * wob(J, 5, 4))) - 4 * (1 - sW(J));
  const DX = [25, 60, 100, 145, 190];
  g.add(land(-1, J => { const x = bankL(J), oak = J > 930; return [[x, -0.4, wet], [x + 5, -4 + 4.8 * pL(J), oak ? quay : sand], ...DX.map(dx => [x + dx, hL(J, dx / 190), oak ? (dx < 60 ? street : grass) : wob(J, 9, dx / 30) > 0.1 ? wood : grass])]; }, null, BAY));
  g.add(land(1, J => { const x = bankR(J), park = J < 820; return [[x, -0.4, wet], [x + 5, -4 + 4.8 * sW(J), park ? sand : quay], ...DX.map(dx => [x + dx, hR(J, dx / 190), park ? (wob(J, 9, dx / 30) > -0.2 ? wood : grass) : wob(J, 6, dx / 40) > 0.6 ? grass : street])]; }, null, BAY));
  const onL = (J, dx) => [-(bankL(J) + dx), hL(J, dx / 190)], onR = (J, dx) => [bankR(J) + dx, hR(J, dx / 190)];
  const trees = (n, J0, J1, on, d0, d1) => scatter(g, PINE, n, rnd, () => { const J = J0 + rnd() * (J1 - J0), [x, y] = on(J, d0 + rnd() * (d1 - d0)), h = 8 + rnd() * 8; return [x, y - 0.6, -J, h * 0.7, new THREE.Color().setHSL(0.36 + rnd() * 0.05, 0.42, 0.18 + rnd() * 0.1), h]; });
  const houses = (n, J0, J1, on, d0, d1, cols) => scatter(g, HOUSE, n, rnd, () => { const J = J0 + rnd() * (J1 - J0), [x, y] = on(J, d0 + rnd() * (d1 - d0)); return [x, y - 1.5, -J, 7 + rnd() * 4, pick(rnd, cols), 6 + rnd() * 6, rnd() * 0.15]; });
  const paint = ['#f6e7c8', '#e8c4c8', '#c8dcef', '#f2f0ea', '#e9d6a8', '#cfe3c9', '#f2f0ea'];
  // out at sea: a container ship, inbound
  const xs = -300, js = 330;
  g.add(mesh(build([[new THREE.BoxGeometry(30, 9, 200).translate(xs, 2.5, -js), 0x2a3a5c], [new THREE.BoxGeometry(30.4, 2, 200.4).translate(xs, -1, -js), 0xa8302a], [new THREE.BoxGeometry(24, 16, 14).translate(xs, 15, -js + 86), 0xf2f0ea], [new THREE.BoxGeometry(6, 10, 6).translate(xs, 28, -js + 88), 0x2a3a5c],
    ...Array.from({ length: 24 }, (_, i) => [new THREE.BoxGeometry(26, 2.6 * (2 + (i * 7) % 3), 12).translate(xs, 7 + 1.3 * (2 + (i * 7) % 3), -js - 92 + i * 7.2), pick(rnd, [0xc8443a, 0x3a6ea8, 0x3f8a52, 0xe8a23a, 0x8a5a9a, 0xd8d8d8])])]), vmat()));
  // Marin: green hills, trees, a few houses, Sausalito down at the water
  trees(150, 560, 910, onL, 8, 185); houses(8, 560, 790, onL, 10, 60, ['#f6f2e8', '#f2dcc0', '#cfe0ee']); houses(26, 790, 890, onL, 4, 40, ['#f6f2e8', '#f2dcc0', '#cfe0ee', '#e8c8b0']);
  // the city: the Presidio's woods by the bridge, then the houses up its hills, downtown, the landmarks, the Ferry Building on the water
  trees(110, 540, 840, onR, 6, 185); houses(480, 790, 1450, onR, 18, 190, paint);
  const blocks = [];
  for (let i = 0; i < 18; i++) { const J = 960 + i * 9 + rnd() * 8; blocks.push(block(12 + rnd() * 12, 30 + rnd() ** 2 * 80, 12 + rnd() * 10, bankR(J) + 30 + rnd() * 70, J, rnd)); }
  for (let i = 0; i < 12; i++) { const J = 1280 + i * 15 + rnd() * 8; blocks.push(block(14 + rnd() * 12, 28 + rnd() ** 2 * 60, 14 + rnd() * 10, -(bankL(J) + 60 + rnd() * 70), J, rnd)); }   // downtown Oakland
  g.add(mesh(mergeGeometries(blocks), toon(0xffffff, { rim: 0, spec: 0.3, params: { map: GLASS } })));
  const white = 0xf2f0ea, [xt] = onR(1010, 70), [xc, yc] = onR(940, 50), [xf] = onR(1075, 6), [xb] = onR(1100, 95);
  g.add(mesh(build([
    [new THREE.ConeGeometry(11, 128, 4).rotateY(Math.PI / 4).translate(xt, 64, -1010), white], [new THREE.CylinderGeometry(0.4, 0.8, 16, 4).translate(xt, 134, -1010), white],   // the Transamerica Pyramid
    [new THREE.CylinderGeometry(8, 10, 170, 16).translate(xb, 87, -1100), 0xd9dde2], [new THREE.SphereGeometry(8, 16, 8, 0, 6.3, 0, 1.5707).translate(xb, 172, -1100), 0xd9dde2],   // the tall one
    [new THREE.CylinderGeometry(3.2, 3.6, 26, 12).translate(xc, yc + 12, -940), 0xefe6d2], [new THREE.CylinderGeometry(3.8, 3.8, 1.2, 12).translate(xc, yc + 25, -940), 0xefe6d2],   // Coit Tower on Telegraph Hill
    [new THREE.BoxGeometry(14, 10, 80).translate(xf + 7, 5, -1075), 0xe9e2d0], [new THREE.BoxGeometry(15, 1.2, 81).translate(xf + 7, 10.6, -1075), 0x8a8478],   // the Ferry Building and its clock tower
    [new THREE.BoxGeometry(6, 40, 6).translate(xf + 7, 20, -1075), 0xe9e2d0], [new THREE.ConeGeometry(4.6, 8, 4).rotateY(Math.PI / 4).translate(xf + 7, 44, -1075), 0x8a8478],
  ]), vmat()));
  const X2 = -62, J2 = 950;                           // Alcatraz: the rock, the cellhouse along its top, the lighthouse
  g.add(mesh(tint(new THREE.SphereGeometry(1, 12, 6, 0, 6.3, 0, 1.45).scale(15, 11, 34), 0x9a8f80).translate(X2, -1.5, -J2), vmat()));
  g.add(mesh(build([[new THREE.BoxGeometry(9, 6, 26).translate(X2, 11.5, -J2), 0xe8e2d4], [new THREE.BoxGeometry(9.4, 0.6, 26.4).translate(X2, 14.8, -J2), 0x8a8478], [new THREE.CylinderGeometry(0.9, 1.3, 14, 8).translate(X2 + 2, 15, -J2 + 17), white]]), vmat()));
  g.add(mesh(tint(new THREE.CylinderGeometry(1, 1, 1.6, 8).translate(X2 + 2, 22.6, -J2 + 17), 0xfff3b0), glow));
  // Oakland: the port — container cranes along the quay, their booms out over the water, boxes stacked behind — and the hills
  const cranes = [];
  for (let i = 0; i < 5; i++) {
    const J = 985 + i * 28, x = -(bankL(J) + 14), w = 0xe8e8e8, r = 0xc8102e;
    cranes.push([new THREE.BoxGeometry(1.6, 42, 1.6).translate(x - 8, 21, -J - 7), w], [new THREE.BoxGeometry(1.6, 42, 1.6).translate(x - 8, 21, -J + 7), w], [new THREE.BoxGeometry(1.6, 42, 1.6).translate(x + 8, 21, -J - 7), w], [new THREE.BoxGeometry(1.6, 42, 1.6).translate(x + 8, 21, -J + 7), w],
      [new THREE.BoxGeometry(18, 2, 16).translate(x, 42, -J), w], [new THREE.BoxGeometry(76, 2.6, 3).translate(x + 22, 45, -J), r], [new THREE.BoxGeometry(5, 8, 5).translate(x - 6, 48, -J), w], [new THREE.BoxGeometry(6, 3, 5).translate(x + 4, 41, -J), r]);
  }
  g.add(mesh(build(cranes), vmat()));
  scatter(g, CONTAINER, 120, rnd, i => { const J = 975 + rnd() * 140, [x] = onL(J, 26 + rnd() * 30); return [x, 2.5 + 2.6 * (i % 3), -J, 1, pick(rnd, ['#c8443a', '#3a6ea8', '#3f8a52', '#e8a23a', '#8a5a9a', '#d8d8d8']), 1, 0]; });
  trees(90, 1000, 1550, onL, 110, 185);
  scatter(g, SAILBOAT, 16, rnd, () => { const J = 760 + rnd() * 350, d = rnd() < 0.5 ? -1 : 1; return [d * (40 + rnd() * 50), 0, -J, 1, pick(rnd, ['#ffffff', '#ffffff', '#fff3c4', '#ff8a8a', '#9cc4e4'])]; });
  span(g, 720, { D: 40, T: 108, X: 78, A: 240, deck: 3.4, col: 0xc0362c });                        // the Golden Gate, in International Orange
  span(g, 1130, { D: 46, T: 118, X: 82, A: 250, deck: 6, col: 0x9aa4b0, cross: true, lights: true });   // the Bay Bridge
  return g;
}

// Sunset Cove: beaches under jungle hills — palms, parasols, huts on stilts out over the water, a lighthouse.
const frond = k => new THREE.ConeGeometry(0.09, 0.62, 4).translate(0, 0.31, 0).scale(1, 1, 0.3).rotateZ(-1.85 - 0.25 * (k % 2)).rotateY(k * 0.9).translate(0.16, 1, 0);
const PALM = mergeGeometries([
  tint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0, 0, 0], [0.03, 0.4, 0], [0.09, 0.75, 0], [0.16, 1, 0]].map(p => new THREE.Vector3(...p))), 6, 0.032, 5), 0x9a7a52),
  ...[0, 1, 2, 3, 4, 5, 6].map(k => tint(frond(k), 0xffffff)),
]);
const PARASOL = tint(mergeGeometries([new THREE.CylinderGeometry(0.03, 0.03, 1, 5).translate(0, 0.5, 0), new THREE.ConeGeometry(0.8, 0.32, 8).translate(0, 1.05, 0)]), 0xffffff);
function cove(side, rnd) {
  const g = new THREE.Group(), [wet, sand, grass, bush, far] = tones('#d9b98a #f6e2b0 #7fae4a #4a8a44 #2f6a48');
  const bank = z => 96 + 24 * wob(z, 2, side) + 9 * wob(z, 5, 1.7 * side);
  const hill = (z, t) => 3 + 8 * t + t * t * (30 + 16 * wob(z, 3, 2 + side) + 10 * wob(z, 7, 3 * side));
  g.add(land(side, z => { const x = bank(z); return [[x, -0.4, wet], [x + 8, 0.5, sand], [x + 30, 2.2, sand], [x + 36, 3, grass], [x + 90, hill(z, 0.45), bush], [x + 190, hill(z, 1), far]]; }));
  scatter(g, PALM, 110, rnd, () => { const z = rnd() * SEG, dx = 12 + rnd() ** 1.7 * 70; return [side * (bank(z) + dx), dx < 30 ? 0.5 + dx * 0.07 : 3 + (hill(z, 0.45) - 3) * (dx - 36) / 54, -z, 10 + rnd() * 6, new THREE.Color().setHSL(0.3 + rnd() * 0.07, 0.55, 0.27 + rnd() * 0.1)]; });
  scatter(g, PARASOL, 22, rnd, () => { const z = rnd() * SEG, dx = 9 + rnd() * 16; return [side * (bank(z) + dx), 0.4 + dx * 0.07, -z, 2.6, pick(rnd, ['#ff4fa0', '#19c6b4', '#ffd21f', '#ff7a18', '#ffffff'])]; });
  const cane = toon(0xd9a05e, { rim: 0 }), thatch = toon(0xc9a04a, { rim: 0 }), wood = toon(0x8a6a44, { rim: 0 });
  for (let i = 0; i < 4; i++) {                       // huts: every other one out on stilts at the end of a jetty
    const z = (i + 0.2 + rnd() * 0.5) * SEG / 4, out = i % 2 === 0, x = side * (bank(z) + (out ? -17 : 18 + rnd() * 6)), y = out ? 1.3 : 2;
    const hut = new THREE.Group();
    hut.add(mesh(new THREE.BoxGeometry(6.4, 0.3, 6.4).translate(0, 0, 0), wood), mesh(new THREE.BoxGeometry(5, 2.6, 5).translate(0, 1.45, 0), cane));
    hut.add(mesh(new THREE.CylinderGeometry(0.01, 5.4, 3.6, 4, 1).rotateY(Math.PI / 4).translate(0, 4.5, 0), thatch));
    hut.add(mesh(mergeGeometries([-2.6, 2.6].flatMap(a => [-2.6, 2.6].map(b => new THREE.CylinderGeometry(0.2, 0.2, 3, 6).translate(a, -1.5, b)))), wood));
    hut.position.set(x, y, -z); hut.rotation.y = rnd() * 0.5 - 0.25;
    g.add(hut);
    if (out) g.add(mesh(new THREE.BoxGeometry(20, 0.3, 2).translate(side * (bank(z) - 5), 1.25, -z), wood));
  }
  if (side > 0) lighthouse(g, bank(160) + 5, 160);
  return g;
}

// Midnight City: a quay wall, lamps along it, towers with their windows lit, a big wheel — and a suspension bridge to go under.
const WINDOWS = tex(256, 256, c => {
  c.fillStyle = '#141b3f'; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i++) { c.fillStyle = Math.random() < 0.42 ? ['#ffd76a', '#ffd76a', '#fff3c4', '#7fd6ff', '#ff8ad8'][Math.floor(Math.random() * 5)] : '#232c5c'; c.fillRect((i % 16) * 16 + 4, (i >> 4) * 16 + 3, 9, 10); }
});
WINDOWS.anisotropy = 8;
const LAMP = mergeGeometries([tint(new THREE.CylinderGeometry(0.12, 0.16, 6, 5).translate(0, 3, 0), 0x2a3360), tint(new THREE.SphereGeometry(0.6, 8, 6).translate(0, 6.3, 0), 0xffe9a8)]);
const BULB = tint(new THREE.SphereGeometry(1, 6, 4), 0xffffff);
function city(side, rnd) {
  const g = new THREE.Group(), [wall, quay, ground] = tones('#39406e #4a5488 #1c2448'), bulbs = [];
  const bank = z => 96 + 6 * wob(z, 1, side);
  g.add(land(side, z => { const x = bank(z); return [[x, -0.5, wall], [x, 2.4, wall], [x, 2.4, quay], [x + 16, 2.5, quay], [x + 16, 2.5, ground], [x + 190, 3, ground]]; }));
  const towers = [];
  for (let i = 0; i < 34; i++) {                      // low blocks along the front, tall ones behind
    const back = i % 2, w = 14 + rnd() * 16, d = 14 + rnd() * 12, h = back ? 45 + rnd() ** 2 * 95 : 12 + rnd() * 30, z = (i + rnd() * 0.6) * SEG / 34, x = side * (bank(z) + (back ? 62 + rnd() * 50 : 24 + rnd() * 16));
    towers.push(block(w, h, d, x, z, rnd));
    if (h > 90) bulbs.push([x, 4 + h, -z, 1.1, '#ff3b30']);                               // a red light on top of the tallest
  }
  g.add(mesh(mergeGeometries(towers), new THREE.MeshBasicMaterial({ map: WINDOWS })));
  scatter(g, LAMP, 40, rnd, i => [side * (bank(i * 16) + 2), 2.4, -i * 16, 1], glow);
  const steel = toon(0xc8443a, { rim: 0 }), dark = toon(0x2a3360, { rim: 0 });
  if (side > 0) {                                     // the bridge: deck, two towers, the cables hung with lights
    const Z = -320, sag = x => (Math.abs(x) < 62 ? 31 + 45 * (x / 62) ** 2 : 76 - 48 * (Math.abs(x) - 62) / 138), parts = [new THREE.BoxGeometry(420, 2, 16).translate(0, 27, Z)];
    for (const x of [62, -62]) {
      for (const dz of [6.5, -6.5]) parts.push(new THREE.BoxGeometry(3.4, 80, 3.4).translate(x, 37, Z + dz));
      for (const y of [38, 58, 76]) parts.push(new THREE.BoxGeometry(3.6, 3, 13).translate(x, y, Z));
    }
    for (const dz of [7, -7]) {
      for (const [a, b] of [[-200, -62], [-62, 62], [62, 200]]) parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([0, 1, 2, 3, 4, 5, 6].map(k => new THREE.Vector3(a + (b - a) * k / 6, sag(a + (b - a) * k / 6), Z + dz))), 12, 0.45, 5));
      for (let x = -196; x <= 196; x += 8) bulbs.push([x, sag(x) + 1, Z + dz, 0.55, '#fff3c4']);
    }
    g.add(mesh(mergeGeometries(parts.map(p => p.toNonIndexed())), steel));
  } else {                                            // the wheel, on the quay
    const x = -(bank(150) + 34), y = 31, ring = [new THREE.TorusGeometry(25, 0.5, 5, 40), new THREE.TorusGeometry(21, 0.3, 5, 40)];
    for (let k = 0; k < 8; k++) ring.push(new THREE.BoxGeometry(50, 0.4, 0.4).rotateZ(k * Math.PI / 8));
    g.add(mesh(tint(mergeGeometries(ring.map(p => p.toNonIndexed())), 0xff4fd8).translate(x, y, -150), glow));
    g.add(mesh(mergeGeometries([-1, 1].map(k => new THREE.BoxGeometry(1.2, 34, 1.2).rotateZ(k * 0.3).translate(x + k * 5, y - 15.5, -150))), dark));
    for (let k = 0; k < 16; k++) bulbs.push([x + 25 * Math.cos(k * Math.PI / 8), y + 25 * Math.sin(k * Math.PI / 8), -150, 1.5, k % 2 ? '#5fe3ff' : '#ffd21f']);
  }
  scatter(g, BULB, bulbs.length, rnd, i => bulbs[i], glow);
  return g;
}

// Lake Tahoe: steep pine slopes with snow along the top and ski runs cut down through the trees, granite boulders standing in the shallows,
// lodges — and, out in the lake, Fannette Island with its stone tea house; at her pier, the paddle-wheeler.
const BOULDER = tint(new THREE.IcosahedronGeometry(1, 1), 0xffffff);
function tahoe(side, rnd) {
  const g = new THREE.Group(), [sand, grass, wood, high, snow] = tones('#e6d8b0 #6aa04e #2f7a4a #3f6f58 #f6f8fc');
  const bank = z => 108 + 14 * wob(z, 2, side) + 6 * wob(z, 5, 1.7 * side);
  const hill = (z, t) => 1.6 + t * (0.3 + 0.7 * t) * (58 + 22 * wob(z, 3, 2 + side) + 12 * wob(z, 7, 3 * side));   // steep, and high enough to hold snow
  g.add(land(side, z => [0, 6, 16, 40, 70, 100, 130, 160, 190].map((dx, j) => { const y = j < 3 ? [-0.4, 0.6, 1.6][j] : hill(z, dx / 190); return [bank(z) + dx, y, j < 2 ? sand : j < 3 ? grass : y > 50 ? snow : y > 32 ? high : wood]; })));
  const z0 = side > 0 ? 430 : 200, lane = (k, t) => z0 + k * 70 * (1 - t) + 14 * Math.sin(7 * t + 2 * k);        // ski runs: three, fanning down from one top
  for (const k of [-1, 0, 1]) {
    const a = [], b = [];
    for (let j = 0; j <= 24; j++) { const t = 0.16 + 0.8 * j / 24, z = lane(k, t); for (const [r, e] of [[a, -6], [b, 6]]) r.push(new THREE.Vector3(side * (bank(z + e) + t * 190), hill(z + e, t) + 1, -z - e)); }
    g.add(mesh(ribbon(a, b), toon(0xf6f8fc, { rim: 0, params: { side: THREE.DoubleSide } })));
  }
  scatter(g, PINE, 250, rnd, () => {                 // tall dark pines, none on the runs
    let z, t; do { z = rnd() * SEG; t = 0.1 + rnd() ** 1.4 * 0.7; } while (t > 0.14 && [-1, 0, 1].some(k => Math.abs(z - lane(k, t)) < 10));
    const h = 10 + rnd() * 10;
    return [side * (bank(z) + t * 190), hill(z, t) - (t < 0.2 ? 1.4 : 0.3), -z, h * 0.62, new THREE.Color().setHSL(0.38 + rnd() * 0.05, 0.45, 0.17 + rnd() * 0.1), h * 1.15];
  });
  scatter(g, BOULDER, 42, rnd, () => { const z = rnd() * SEG, s = 1.6 + rnd() ** 2 * 4.5; return [side * (bank(z) - 9 + rnd() * 13), -0.3, -z, s, pick(rnd, ['#dfe2e8', '#c9ced6', '#ebe6dc']), s * 0.8]; });
  const timber = toon(0x8a5a3a, { rim: 0 }), roofs = [0x2f6a4a, 0xa8443a].map(k => toon(k, { rim: 0 }));
  for (let i = 0; i < 4; i++) {                       // lodges under steep roofs
    const z = (i + 0.3 + rnd() * 0.5) * SEG / 4, lodge = new THREE.Group();
    lodge.add(mesh(new THREE.BoxGeometry(9, 4, 12).translate(0, 2, 0), timber), mesh(new THREE.CylinderGeometry(0.01, 7.4, 6.5, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 1.25).translate(0, 7.2, 0), roofs[i % 2]));
    lodge.position.set(side * (bank(z) + 24 + rnd() * 8), 2.6, -z); lodge.rotation.y = rnd() * 0.6 - 0.3;
    g.add(lodge);
  }
  if (side < 0) {                                     // Fannette Island: a granite hump, a few pines, the tea house on top
    const X = -58, Z = 330;
    g.add(mesh(tint(new THREE.SphereGeometry(1, 12, 6, 0, 6.3, 0, 1.45).scale(17, 13, 24), 0xb4b9c2).translate(X, -1.5, -Z), vmat()));
    g.add(mesh(build([[new THREE.BoxGeometry(6.5, 4.2, 6.5).translate(X, 13.2, -Z), 0xa89f90], [new THREE.BoxGeometry(1.8, 2.6, 6.6).translate(X, 12.8, -Z), 0x3a3630], [new THREE.BoxGeometry(6.6, 1.5, 1.8).translate(X, 13.6, -Z), 0x3a3630]]), vmat()));
    scatter(g, PINE, 12, rnd, () => { const a = rnd() * 6.3, r = 0.35 + rnd() * 0.5, h = 7 + rnd() * 5; return [X + 17 * r * Math.cos(a), 13 * Math.sqrt(1 - r * r) - 1.9, -Z + 24 * r * Math.sin(a), h * 0.62, '#2f7a4a', h * 1.15]; });
    scatter(g, BOULDER, 12, rnd, () => { const a = rnd() * 6.3, s = 1.5 + rnd() * 2.5; return [X + 17.5 * Math.cos(a), -0.2, -Z + 24.5 * Math.sin(a), s, '#c9ced6', s * 0.8]; });
  } else {                                            // the paddle-wheeler at her pier: three decks, two stacks, the red wheel at the stern
    const z1 = 150, X = bank(z1) - 20, at = (geo, y, z = 0) => geo.translate(X, y, -z1 + z);
    g.add(mesh(build([
      [at(new THREE.BoxGeometry(9, 2.6, 34), 0.6), 0xf6f7fb], [at(new THREE.BoxGeometry(9.15, 0.5, 34.15), 0.15), 0xc8102e],
      [at(new THREE.BoxGeometry(7.6, 2.8, 26), 3.3, -1), 0xf6f7fb], [at(new THREE.BoxGeometry(7.75, 0.9, 24), 3.6, -1), 0x2a3f66],
      [at(new THREE.BoxGeometry(6.6, 2.6, 20), 6, -2), 0xf6f7fb], [at(new THREE.BoxGeometry(6.75, 0.8, 18), 6.2, -2), 0x2a3f66],
      [at(new THREE.BoxGeometry(7.4, 0.3, 24), 7.45, -1), 0xf6f7fb], [at(new THREE.BoxGeometry(3.6, 2.4, 3.6), 8.8, -10), 0xf6f7fb], [at(new THREE.BoxGeometry(3.75, 0.8, 3.75), 9.1, -10), 0x2a3f66],
      ...[1.6, -1.6].flatMap(x => [[at(new THREE.CylinderGeometry(0.6, 0.6, 5.4, 8).translate(x, 0, 0), 10.2, -4), 0x20242e], [at(new THREE.CylinderGeometry(0.68, 0.68, 0.7, 8).translate(x, 0, 0), 12.2, -4), 0xc8102e]]),
      [at(new THREE.CylinderGeometry(3.3, 3.3, 7.6, 12).rotateZ(Math.PI / 2), 2.3, 19.8), 0xc8102e],
    ]), vmat()));
    g.add(mesh(new THREE.BoxGeometry(24, 0.4, 3).translate(bank(z1) - 6, 1.1, -z1 + 8), toon(0x9a7248, { rim: 0 })));
  }
  return g;
}

// Lake Havasu: bare, rugged desert hills over beaches and palms — and London Bridge, five stone arches under the Union Jack, to go through.
// Its small lighthouses mark the shore; boats lie pulled up on the sand.
const JACK = tex(120, 72, (c, w, h) => {
  c.fillStyle = '#012169'; c.fillRect(0, 0, w, h);
  for (const [k, lw, cross] of [['#fff', 14], ['#c8102e', 6], ['#fff', 24, 1], ['#c8102e', 14, 1]]) {
    c.strokeStyle = k; c.lineWidth = lw; c.beginPath();
    cross ? (c.moveTo(w / 2, 0), c.lineTo(w / 2, h), c.moveTo(0, h / 2), c.lineTo(w, h / 2)) : (c.moveTo(0, 0), c.lineTo(w, h), c.moveTo(w, 0), c.lineTo(0, h));
    c.stroke();
  }
});
const DAYBOAT = mergeGeometries([
  tint(new THREE.CapsuleGeometry(1.15, 4.4, 3, 8).rotateX(Math.PI / 2).scale(1, 0.5, 1).translate(0, 0.35, 0), 0xffffff), tint(new THREE.BoxGeometry(2.2, 0.12, 2.8).translate(0, 2.2, 0.5), 0x3a4050),
  ...[-1, 1].flatMap(a => [-0.8, 1.8].map(b => tint(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 4).translate(a, 1.4, b), 0x3a4050))),
]);
function havasu(side, rnd) {
  const g = new THREE.Group(), [wet, sand, dirt, rock, crag] = tones('#d9c39a #f2ddb0 #c9a478 #a87a58 #8a5e48'), Z = 320;
  const bank = z => 104 + 14 * wob(z, 2, side) + 6 * wob(z, 5, 1.7 * side);
  const hill = (z, t) => 3 + t * (36 + 20 * wob(z, 3, 2 + side) + 12 * wob(z, 6, 3 * side)) * (1 + 0.3 * wob(z, 13, 5 * side + 9 * t) + 0.22 * wob(z, 23, side + 20 * t));   // t: 0 behind the beach → 1 inland; ridged and gullied
  g.add(land(side, z => { const x = bank(z); return [[x, -0.4, wet], [x + 8, 0.5, sand], [x + 24, 1.8, sand], [x + 52, 3, dirt], ...[85, 120, 155, 190].map((dx, j) => [x + dx, hill(z, (dx - 52) / 138), [rock, crag, rock, crag][j]])]; }));
  scatter(g, ROCK, 70, rnd, () => { const z = rnd() * SEG, t = pick(rnd, [33, 68, 103]) / 138, s = 1 + rnd() * 1.4; return [side * (bank(z) + 52 + t * 138), hill(z, t) - 0.4, -z, s, pick(rnd, ['#6a7a3a', '#7a8a4a', '#5a6a34']), s * 0.7]; });   // creosote scrub
  scatter(g, ROCK, 30, rnd, () => { const z = rnd() * SEG, s = 1.2 + rnd() ** 2 * 3.5; return [side * (bank(z) - 2 + rnd() * 9), 0.1, -z, s, pick(rnd, ['#a87a58', '#8a5e48', '#c9a478']), s * 0.7]; });
  scatter(g, PALM, 46, rnd, () => { const z = Z - 150 + rnd() * 300, dx = 10 + rnd() * 38; return [side * (bank(z) + dx), 0.5 + dx * 0.05, -z, 9 + rnd() * 5, new THREE.Color().setHSL(0.28 + rnd() * 0.06, 0.5, 0.3 + rnd() * 0.08)]; });
  scatter(g, DAYBOAT, 12, rnd, () => { const z = rnd() * SEG; return [side * (bank(z) - 2 - rnd() * 9), 0, -z, 1, pick(rnd, ['#ffffff', '#ff4fa0', '#19c6b4', '#ffd21f', '#e8262e', '#1466d6'])]; });
  const stucco = toon(0xf6efe0, { rim: 0 }), tile = toon(0xc8643a, { rim: 0 });
  for (let i = 0; i < 6; i++) {                       // the resort either side of the bridge: white walls, tiled roofs
    const z = 215 + i * 42 + rnd() * 14, w = 12 + rnd() * 9, h = 6 + rnd() * 7, inn = new THREE.Group();
    inn.add(mesh(new THREE.BoxGeometry(w, h, 11).translate(0, h / 2, 0), stucco), mesh(new THREE.CylinderGeometry(0.01, w * 0.82, 3, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.72).translate(0, h + 1.5, 0), tile));
    inn.position.set(side * (bank(z) + 30 + rnd() * 14), 2, -z); inn.rotation.y = rnd() * 0.4 - 0.2;
    g.add(inn);
  }
  lighthouse(g, side * (bank(side > 0 ? 110 : 540) + 2), side > 0 ? 110 : 540, 0.45);
  if (side > 0) {                                     // London Bridge: the stonework in one piece, parapets, lamps, flags
    const stone = toon(0xd2cab8, { rim: 0 }), sh = new THREE.Shape().moveTo(-118, -3).lineTo(-118, 17).lineTo(118, 17).lineTo(118, -3);
    for (const [a, b, top] of [[78.5, 110, 10], [29.5, 71.5, 11.5], [-22.5, 22.5, 13], [-71.5, -29.5, 11.5], [-110, -78.5, 10]]) sh.lineTo(b, -3).lineTo(b, 1).absellipse((a + b) / 2, 1, (b - a) / 2, top - 1, 0, Math.PI, false).lineTo(a, -3);
    g.add(mesh(new THREE.ExtrudeGeometry(sh, { depth: 11, bevelEnabled: false, curveSegments: 14 }).translate(0, 0, -Z - 5.5), stone));
    for (const dz of [5.2, -5.2]) g.add(mesh(new THREE.BoxGeometry(236, 1.2, 0.6).translate(0, 17.6, -Z + dz), stone));
    scatter(g, LAMP, 30, rnd, i => [-105 + (i >> 1) * 15, 18.2, -Z + (i % 2 ? 5.2 : -5.2), 0.8], glow);
    for (const x of [-7, 7]) {
      g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 12, 6).translate(x, 24, -Z), toon(0xf6f7fb, { rim: 0 })));
      g.add(mesh(new THREE.PlaneGeometry(7, 4.2).translate(x + 3.6, 27.8, -Z), toon(0xffffff, { rim: 0, params: { map: JACK, side: THREE.DoubleSide } })));
    }
  }
  return g;
}

// Lake Washington: Seattle down the west shore — the Space Needle, the downtown towers, the stadium at the water's edge — and wooded hills with big houses
// down the east; a floating bridge to go under, sailboats out, a seaplane at its dock. (Rainier, over the far end, is in the sky.)
const GLASS = tex(256, 256, c => {
  c.fillStyle = '#5f86ac'; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i++) { c.fillStyle = ['#9cc4e4', '#86b2d8', '#b4d6f0', '#78a6cc'][Math.floor(Math.random() * 4)]; c.fillRect((i % 16) * 16 + 2, (i >> 4) * 16 + 2, 13, 12); }
});
GLASS.anisotropy = 8;
const SAILBOAT = mergeGeometries([
  tint(new THREE.CapsuleGeometry(1, 5, 3, 8).rotateX(Math.PI / 2).scale(1, 0.55, 1).translate(0, 0.3, 0), 0xffffff), tint(new THREE.CylinderGeometry(0.07, 0.07, 10, 5).translate(0, 5.5, -0.6), 0xdddddd),
  tint(new THREE.ConeGeometry(2.3, 8.6, 4).scale(0.04, 1, 1).translate(0, 5.6, 1.2), 0xffffff), tint(new THREE.ConeGeometry(1.5, 6.5, 4).scale(0.04, 1, 1).translate(0, 4.6, -2), 0xffffff),
]);
const CAR = build([[new THREE.BoxGeometry(4.4, 0.9, 1.9).translate(0, 0.65, 0), 0xffffff], [new THREE.BoxGeometry(2.4, 0.7, 1.7).translate(-0.2, 1.4, 0), 0x2a3040]]);
function washington(side, rnd) {
  const g = new THREE.Group(), west = side < 0, [stone, lawn, wood, far, town] = tones('#b9b4a8 #6aa84e #2a6a44 #245a40 #8f9a8a');
  const bank = z => 106 + 10 * wob(z, 2, side) + 5 * wob(z, 5, 1.7 * side);
  const hill = (z, t) => 3 + t * (west ? 16 : 34 + 14 * wob(z, 3, 2 + side)) + 6 * t * wob(z, 7, 3 * side);
  g.add(land(side, z => { const x = bank(z); return [[x, -0.4, stone], [x + 3, 1, lawn], [x + 34, 3, west ? town : lawn], [x + 80, hill(z, 0.4), west ? town : wood], [x + 130, hill(z, 0.7), wood], [x + 190, hill(z, 1), far]]; }));
  scatter(g, PINE, west ? 70 : 190, rnd, () => {      // firs
    const z = rnd() * SEG, t = (west ? 0.5 : 0.16) + rnd() ** 1.3 * (west ? 0.45 : 0.8), h = 11 + rnd() * 11;
    return [side * (bank(z) + t * 190), (t < 0.42 ? 3 + (hill(z, 0.4) - 3) * (t * 190 - 34) / 46 : hill(z, t)) - 0.5, -z, h * 0.6, new THREE.Color().setHSL(0.39 + rnd() * 0.04, 0.42, 0.16 + rnd() * 0.09), h * 1.15];
  });
  scatter(g, SAILBOAT, 5, rnd, () => [side * (bank(0) - 24 - rnd() * 24), 0, -rnd() * SEG, 1, pick(rnd, ['#ffffff', '#ffffff', '#fff3c4', '#ff8a8a', '#9cc4e4'])]);
  const wood2 = toon(0x9a7248, { rim: 0 });
  if (west) {
    const blocks = [];                                // downtown: glass towers, and one tall dark one
    for (let i = 0; i < 20; i++) { const w = 14 + rnd() * 14, d = 14 + rnd() * 12, h = 34 + rnd() ** 2 * 90, z = 330 + i * 12 + rnd() * 8; blocks.push(block(w, h, d, -(bank(z) + 48 + rnd() * 80), z, rnd)); }
    g.add(mesh(mergeGeometries(blocks), toon(0xffffff, { rim: 0, spec: 0.3, params: { map: GLASS } })));
    g.add(mesh(new THREE.BoxGeometry(24, 150, 24).translate(-(bank(450) + 95), 77, -450), toon(0x2a3040, { rim: 0, spec: 0.4 })));
    // the Space Needle: legs drawn in to a waist, the saucer, the spire
    const xn = -(bank(235) + 52), lathe = (pts, n) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(...p)), n).translate(xn, 2, -235);
    g.add(mesh(build([
      [lathe([[7.5, 0], [3.6, 38], [2.3, 72], [3.2, 96], [6.5, 106]], 6), 0xf2f0ea],
      [lathe([[0.01, 104], [6, 106], [13.5, 110.5], [14, 112.5], [9.5, 115], [0.01, 115.2]], 20), 0xf2f0ea],
      [lathe([[9.5, 115], [5, 118.5], [1.4, 120], [0.5, 138], [0.01, 138]], 20), 0xff8a1f],
    ]), toon(0xffffff, { rim: 0, params: { vertexColors: true, side: THREE.DoubleSide } })));
    // the stadium: two banks of purple seats under cantilevered roofs, open to the lake
    const xs = -(bank(110) + 46), stand = k => [[new THREE.BoxGeometry(74, 4, 30).rotateX(-k * 0.52).translate(xs, 13, -110 + k * 38), 0x4b2e83], [new THREE.BoxGeometry(76, 1.2, 26).rotateX(k * 0.2).translate(xs, 33, -110 + k * 40), 0xcfd3da], [new THREE.BoxGeometry(76, 30, 2).translate(xs, 16, -110 + k * 52), 0xb7a57a]];
    g.add(mesh(build([...stand(1), ...stand(-1), [new THREE.BoxGeometry(74, 0.5, 46).translate(xs, 3.2, -110), 0x3f9a4a]]), vmat()));
  } else {
    const white = toon(0xf2f0ea, { rim: 0 }), roof = toon(0x4a5060, { rim: 0 }), pane = toon(0x6fa8d8, { rim: 0, spec: 0.5 });
    for (let i = 0; i < 6; i++) {                     // big houses on the water, each with its dock
      const z = (i + 0.2 + rnd() * 0.5) * SEG / 6, home = new THREE.Group();
      home.add(mesh(new THREE.BoxGeometry(15, 5, 10).translate(0, 2.5, 0), white), mesh(new THREE.BoxGeometry(16.4, 0.6, 11.4).translate(0, 5.3, 0), roof), mesh(new THREE.BoxGeometry(0.3, 2.6, 7).translate(-7.55, 2.8, 0), pane));
      home.position.set(bank(z) + 14 + rnd() * 10, 2, -z);
      g.add(home, mesh(new THREE.BoxGeometry(18, 0.35, 2.2).translate(bank(z) - 7, 0.6, -z - 8), wood2));
    }
    const zp = 560, xp = bank(zp) - 11;               // the seaplane: yellow, on floats
    g.add(mesh(build([
      ...[-1.5, 1.5].map(a => [new THREE.CapsuleGeometry(0.42, 5.6, 3, 8).rotateX(Math.PI / 2).translate(xp + a, 0.25, -zp), 0xf6f7fb]),
      [new THREE.CapsuleGeometry(0.85, 5.4, 4, 10).rotateX(Math.PI / 2).translate(xp, 2.3, -zp), 0xffd21f], [new THREE.BoxGeometry(13, 0.22, 1.9).translate(xp, 3.35, -zp - 1), 0xffd21f],
      [new THREE.BoxGeometry(0.2, 1.8, 1.4).translate(xp, 3.2, -zp + 3.6), 0xffd21f], [new THREE.BoxGeometry(4, 0.16, 1.1).translate(xp, 2.6, -zp + 3.6), 0xffd21f],
      [new THREE.CylinderGeometry(1.3, 1.3, 0.08, 12).rotateX(Math.PI / 2).translate(xp, 2.3, -zp - 3.75), 0x20242e],
      ...[-1.5, 1.5].flatMap(a => [-1.4, 1.2].map(b => [new THREE.CylinderGeometry(0.07, 0.07, 1.5, 4).translate(xp + a * 0.8, 1.2, -zp + b), 0x9aa3b0])),
    ]), vmat()));
    g.add(mesh(new THREE.BoxGeometry(16, 0.35, 2.4).translate(bank(zp) - 4, 0.6, -zp + 6), wood2));
    // the floating bridge: low on its pontoons from either shore, climbing to a high span over the middle
    const Z = 290, conc = [new THREE.BoxGeometry(70, 1.2, 12).translate(0, 17, -Z), new THREE.BoxGeometry(70, 1.6, 0.6).translate(0, 18.2, -Z + 6), new THREE.BoxGeometry(70, 1.6, 0.6).translate(0, 18.2, -Z - 6)];
    for (const d of [1, -1]) {
      conc.push(new THREE.BoxGeometry(46, 1.2, 12).translate(d * 100, 3, -Z), new THREE.BoxGeometry(47, 1.2, 12).rotateZ(d * -0.31).translate(d * 56, 10, -Z));
      for (const x of [86, 108]) conc.push(new THREE.BoxGeometry(18, 3.2, 17).translate(d * x, 0.2, -Z));
      conc.push(new THREE.BoxGeometry(3, 18, 9).translate(d * 34, 8, -Z), new THREE.BoxGeometry(3, 11, 9).translate(d * 56, 4.5, -Z));
    }
    g.add(mesh(mergeGeometries(conc), toon(0xc4c8ce, { rim: 0 })));
    scatter(g, CAR, 14, rnd, i => { const x = -112 + i * 16 + rnd() * 6, ax = Math.abs(x); return [x, ax < 34 ? 17.6 : ax > 78 ? 3.6 : 3.6 + 14 * (78 - ax) / 44, -Z + (i % 2 ? 3 : -3), 1, pick(rnd, ['#e8262e', '#f6f7fb', '#1466d6', '#ffd21f', '#20242e', '#3a8a44']), 1, 0]; });
  }
  return g;
}

// What makes a lake. pal: the sky from the horizon up, the far water (haze), tints over the clouds and the far mountains, the water's three tones and its foam.
// sun: the way to it. light: [sun colour, strength, sky light above, below, strength]. sky: uSky then uSky2 in the shader. In the order of gear.js.
const LAKES = [
  { build: pines, sun: [-0.62, 0.66, 0.42], light: ['#fff4e0', 2.15, '#d6e8ff', '#5c78b0', 1.15], sky: [1, 0, 1, 0, 1, 0, 0],
    pal: { horizon: '#cfeeff', skyMid: '#58b4f5', zenith: '#1466d6', haze: '#a9dcf6', cloud: '#ffffff', mtn: '#ffffff', deep: '#0d4a8c', mid: '#1778c2', light: '#3fb1e0', foam: '#ffffff', foamShade: '#b4e6f7' } },
  { build: tahoe, sun: [-0.5, 0.75, 0.4], light: ['#fff6e4', 2.25, '#d2e6ff', '#5878b4', 1.15], sky: [1, 0, 1, 0, 1.9, 0, 0],
    pal: { horizon: '#d6ecff', skyMid: '#3d9af0', zenith: '#0b4fc4', haze: '#9ccdf2', cloud: '#ffffff', mtn: '#ffffff', deep: '#083a94', mid: '#1263c4', light: '#3ac8e0', foam: '#ffffff', foamShade: '#b0e8f4' } },
  { build: bay, long: BAY, sun: [-0.5, 0.7, 0.45], light: ['#fff4e4', 2.1, '#dfe9f2', '#5f7890', 1.2], sky: [1, 0, 0, 0, 0.9, 0, 0],
    pal: { horizon: '#e2edf3', skyMid: '#74b0e4', zenith: '#2468c4', haze: '#b4cedc', cloud: '#ffffff', mtn: '#e0e8d8', deep: '#0f3f5e', mid: '#1f6a8a', light: '#4f9fb4', foam: '#ffffff', foamShade: '#bcd6e2' } },
  { build: havasu, sun: [-0.3, 0.9, 0.3], light: ['#fff2d8', 2.4, '#ffeedd', '#a08060', 1.15], sky: [1.3, 0, 0, 0, 1.25, 0, 0],
    pal: { horizon: '#ffe6c0', skyMid: '#52a8ee', zenith: '#1260cc', haze: '#a8dcd8', cloud: '#ffffff', mtn: '#d0a898', deep: '#0a5568', mid: '#168a96', light: '#52d2c0', foam: '#ffffff', foamShade: '#c0ece4' } },
  { build: cove, sun: [-0.6, 0.18, -0.78], light: ['#ffb070', 2.2, '#ffc0a0', '#5a4a8c', 1.0], sky: [2, 0, 0, 0, 1, 0, 0],
    pal: { horizon: '#ffd08a', skyMid: '#ff8a5c', zenith: '#3a2a8c', haze: '#f0a070', cloud: '#ffb0a0', mtn: '#b06a8c', deep: '#2a1a5c', mid: '#6a3a8c', light: '#ff9a6a', foam: '#fff0e0', foamShade: '#ffc0a0' } },
  { build: washington, sun: [-0.55, 0.6, 0.45], light: ['#fff6e8', 2.0, '#dce8f4', '#5c7890', 1.2], sky: [1, 0, 1, 0, 1.15, -0.17, 0.2],
    pal: { horizon: '#dbe9f2', skyMid: '#6fb2e8', zenith: '#2a6fd0', haze: '#a9c8dc', cloud: '#ffffff', mtn: '#eef4ff', deep: '#123f6e', mid: '#2a6da0', light: '#62a8cc', foam: '#ffffff', foamShade: '#bcd8e8' } },
  { build: city, sun: [-0.5, 0.36, -0.79], light: ['#bcd0ff', 1.3, '#5a70c0', '#1a2450', 1.0], sky: [1.9, 0, 0, 1, 1, 0, 0],
    pal: { horizon: '#2a3f86', skyMid: '#12205a', zenith: '#060b2a', haze: '#1c2c66', cloud: '#3a4a80', mtn: '#30406e', deep: '#050c2c', mid: '#0c1c4c', light: '#2a4a8c', foam: '#a9c4ff', foamShade: '#5a78c0' } },
];

export function createShore() {
  const lakes = LAKES.map(lake => new THREE.Group().add(...[0, 1, 2].slice(lake.long ? 1 : 0).map(() => {   // three identical tiles (same seed), built rather than cloned so each keeps its ink material
    let seed = 11;                                                                                     // — or for a long way in, two copies of it end to end
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    return lake.long ? lake.build(rnd) : new THREE.Group().add(lake.build(1, rnd), lake.build(-1, rnd));
  })));
  let last = 0, from = -620, cur = -1;                // a long way in is measured from where the run began (or, before one, from just short of the Golden Gate)
  return {
    group: new THREE.Group().add(...lakes),
    update(dist) {
      last = dist;
      lakes.forEach((l, k) => {
        const L = LAKES[k].long, o = dist % SEG;
        if (L) { const j = ((dist - from) % L + L) % L; l.children[0].position.z = j; l.children[1].position.z = j - L; l.children[1].visible = j > L - 1500; }   // the next time round only once it is near
        else l.children.forEach((t, i) => { t.position.z = o + 80 - (i - 1) * SEG; });   // tiles span z ≈ −1200…+720
      });
    },
    pick(i) { if (i !== cur) from = last - 620; cur = i; lakes.forEach((l, j) => { l.visible = i === j; }); },
    start(j = 0) { from = last - j; },                // a run sets off from j along the way in
  };
}

// Go to a lake: its sky and water, its sun and the light it gives, its shore.
export function setLake(i, sky, lights, shore) {
  const lake = LAKES[i], [sun, strength, above, below, fill] = lake.light;
  for (const k in lake.pal) PALETTE[k].set(lake.pal[k]);
  SUN.set(...lake.sun).normalize(); sky.look.set(...lake.sky.slice(0, 4)); sky.look2.set(...lake.sky.slice(4));
  lights.sun.color.set(sun); lights.sun.intensity = strength;
  lights.hemi.color.set(above); lights.hemi.groundColor.set(below); lights.hemi.intensity = fill;
  shore.pick(i);
}
