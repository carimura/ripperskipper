// Stylised lake: a displaced grid that carries the boat's wake, with banded toon shading,
// cellular foam, the rider's trail and blob shadows, all in the boat's frame.
import * as THREE from 'three';
import { C } from './physics.js';
import { SUN } from './gfx.js';

// GLSL mirror of wakeHeight()/surfHeight()/swell()/wakeCoord() in physics.js — keep the two in step.
const HEIGHT = `
  uniform float uTime, uDist, uSurf, uGo;
  uniform vec3 uTurn;       // the boat turning back: radius, where the turn began, how far round it is
  vec2 wakeCoord(vec2 p) {  // (across the wake, metres behind the boat along it): straight to where the turn began, then round the arc
    if (uTurn.z < 0.001) return p;
    vec2 q = p - uTurn.xy; float a = atan(-q.y, -q.x);
    return a < 0.0 || a > uTurn.z + 1.5 ? vec2(p.x, p.y - uTurn.y + uTurn.x * uTurn.z) : vec2(uTurn.x - length(q), uTurn.x * (uTurn.z - a));
  }
  float wakeHalfWidth(float d) { return 1.15 + 0.095 * d; }
  float wakeH(vec2 p) {
    float d = p.y;
    float grow = smoothstep(-1.0, 6.0, d), fade = 1.0 - 0.55 * smoothstep(16.0, 70.0, d);
    float H = 0.62 * grow * fade, tr = 0.07 * grow * fade;
    float u = abs(p.x) - wakeHalfWidth(d), dd = max(d, 0.0);
    float wi = 1.0 + 0.02 * dd, wo = 1.5 + 0.03 * dd;
    float c = u < 0.0 ? max(u / wi, -1.0) : min(u / wo, 1.0);
    float lobe = 0.5 + 0.5 * cos(3.14159265 * c);
    return u < 0.0 ? -tr + (H + tr) * lobe : H * lobe;
  }
  float surfLip(float z) { return 2.6 + 0.05 * z; }
  float surfFace(vec2 p) {
    float u = (p.x - surfLip(p.y)) / 2.4, q = clamp(1.0 + u, 0.0, 1.0);
    return u < 0.0 ? 1.0 - pow(1.0 - q, 1.6) : 1.0 - smoothstep(0.0, 0.8, u);
  }
  float surfH(vec2 p) {
    float f = clamp((p.y - 0.8) / 5.6, 0.0, 1.0);
    float size = p.y < 6.4 ? pow(f, 2.5) : 1.0 - 0.7 * smoothstep(6.4, 16.4, p.y);
    float port = 0.28 * smoothstep(0.3, 1.9, -p.x) * (1.0 - smoothstep(2.2, 4.8, -p.x)) * smoothstep(0.8, 4.5, p.y) * (1.0 - 0.7 * smoothstep(4.5, 16.0, p.y));
    return 1.6 * surfFace(p) * size + port;
  }
  float swell(vec2 w) {
    return 0.022 * sin(0.55 * w.x + 0.5 * w.y + 1.1 * uTime) + 0.016 * sin(-0.9 * w.x + 0.36 * w.y + 1.7 * uTime + 1.3);
  }
  float waterH(vec2 p) {
    vec2 w = wakeCoord(p);
    float rooster = 0.2 * exp(-pow((w.y - 2.0) / 1.5, 2.0) - pow(w.x / 0.7, 2.0));   // prop wash hump, out of the rider's reach
    return ((uSurf > 0.5 ? surfH(w) : wakeH(w)) + rooster) * uGo + swell(vec2(p.x, p.y - uDist));
  }`;

const VERT = HEIGHT + `
  varying vec3 vP; varying float vD;
  void main() {
    vec3 p = position;
    p.y = waterH(p.xz);
    vP = p;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vD = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

export const SKY_GLSL = `
  uniform vec3 uHorizon, uSkyMid, uZenith;
  vec3 skyGrad(vec3 d) {
    float h = max(d.y, 0.0);
    return mix(mix(uHorizon, uSkyMid, smoothstep(0.0, 0.2, h)), uZenith, smoothstep(0.12, 0.7, h));
  }`;

const FRAG = HEIGHT + SKY_GLSL + `
  uniform sampler2D tNormal, tFoam, tTrail;
  uniform vec3 uSun, uDeep, uMid, uLight, uFoam, uFoamShade, uHaze;
  uniform vec4 uRider;      // x, height above the water, z, shadow strength
  uniform vec3 uTrail;      // rider world z, cell size, cell count
  uniform vec4 uSplash;     // x, z, radius, strength: a ring of foam spreading from an impact
  uniform vec3 uBoat;       // where the boat is (x, z off its usual place) and its heading, when it turns back for a fallen rider
  varying vec3 vP; varying float vD;

  float segDist(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
  float boxDist(vec2 p, vec2 c, vec2 h) { vec2 q = abs(p - c) - h; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }

  void main() {
    vec2 p = vP.xz, wp = vec2(p.x, p.y - uDist);
    vec2 pw = wakeCoord(p);
    float d = pw.y;
    vec2 qb = p - uBoat.xy, pb = vec2(cos(uBoat.z) * qb.x - sin(uBoat.z) * qb.y, sin(uBoat.z) * qb.x + cos(uBoat.z) * qb.y);   // this point, in the boat's own frame
    vec3 V = normalize(cameraPosition - vP);

    // large-scale shape (wake + swell), then two layers of ripples
    float e = 0.05 + vD * 0.004, h = waterH(p);
    vec3 N = normalize(vec3(h - waterH(p + vec2(e, 0.0)), e, h - waterH(p + vec2(0.0, e))));
    vec3 r1 = texture2D(tNormal, wp * 0.055 + uTime * vec2(0.011, 0.02)).xyz * 2.0 - 1.0;
    vec3 r2 = texture2D(tNormal, wp * 0.16 + uTime * vec2(-0.023, 0.035)).xyz * 2.0 - 1.0;
    vec2 rip = (r1.xy + r2.xy * 0.6) / (1.0 + vD * 0.012);
    vec3 Nr = normalize(N + vec3(rip.x, 0.0, rip.y) * 0.3);

    // three flat tones from how much the surface tilts towards the sun
    float tilt = dot(Nr.xz, normalize(uSun.xz));
    vec3 col = mix(uDeep, uMid, smoothstep(-0.085, -0.06, tilt));
    col = mix(col, uLight, smoothstep(0.075, 0.1, tilt));

    // sky in the grazing reflections
    float fres = pow(1.0 - max(dot(Nr, V), 0.0), 3.0);
    col = mix(col, skyGrad(reflect(-V, Nr)), clamp(fres, 0.0, 1.0) * 0.82);

    // sun glitter
    vec3 r3 = texture2D(tNormal, wp * 0.42 + uTime * vec2(0.04, -0.03)).xyz * 2.0 - 1.0;
    vec3 Ng = normalize(N + vec3(rip.x + r3.x, 0.0, rip.y + r3.y) * 0.5);
    col += vec3(1.0, 0.98, 0.9) * uFoam * smoothstep(0.972, 0.982, dot(Ng, normalize(uSun + V))) * (1.0 - smoothstep(60.0, 260.0, vD));

    // ---- foam ----
    float grow = smoothstep(-0.5, 2.5, d);
    float w = wakeHalfWidth(d), u = abs(pw.x) - w, dd = max(d, 0.0);
    float wi = 1.0 + 0.02 * dd;
    float crest = exp(-pow((u + 0.1) / 0.3, 2.0)) * grow * (1.0 - smoothstep(5.0, 21.0, d)) * 1.2;
    float churn = smoothstep(-wi, -0.1, u) * (1.0 - smoothstep(-0.1, 0.25, u)) * grow * (1.0 - smoothstep(1.5, 10.0, d)) * 0.95;
    float prop = (1.0 - smoothstep(0.35, 1.0, abs(pw.x) / (0.55 + 0.035 * dd))) * exp(-dd / 15.0) * step(-0.4, d) * 1.3;
    float table = (1.0 - smoothstep(0.5, 1.0, abs(pw.x) / max(w - wi, 0.3))) * exp(-dd / 24.0) * grow * 0.36;
    float bz = clamp(-pb.y / 7.0, 0.0, 1.0), beam = 1.26 * pow(1.0 - pow(bz, 3.0), 0.55);
    float hull = (1.0 - smoothstep(0.05, 0.3 + 0.7 * (1.0 - bz), abs(pb.x) - beam)) * step(beam - 0.3, abs(pb.x)) * step(pb.y, 0.6) * smoothstep(-7.2, -5.6, pb.y) * 1.2;
    float m = max(max(max(crest, churn), max(prop, table)), hull);
    if (uSurf > 0.5) {                                 // surfing: the lip feathering along the top of the wall, then the wave breaking and the white water it leaves
      float face = surfFace(pw), lx = pw.x - surfLip(d);
      float top = exp(-pow(lx / 0.24, 2.0)) * smoothstep(2.6, 4.4, d) * 1.08;
      float broken = smoothstep(0.12, 0.5, face) * smoothstep(6.1, 6.5, d) * mix(1.1, 0.7, smoothstep(6.6, 9.0, d)) * (1.0 - smoothstep(9.0, 20.0, d));
      m = max(max(top * (1.0 - smoothstep(6.4, 7.5, d)), broken), max(prop, hull));
    }
    m *= uGo;                                          // no wake until the boat is moving

    // the rider's trail, read from a strip of (x, strength) samples laid along world z
    float cell = (wp.y - uTrail.x) / uTrail.y, age = cell / uTrail.z;
    if (cell > 0.3 && age < 1.0) {
      vec4 tr = texture2D(tTrail, vec2(wp.y / (uTrail.y * uTrail.z), 0.5));
      float wd = 0.2 + 1.3 * age;
      m = max(m, tr.g * pow(1.0 - age, 1.3) * exp(-pow((p.x - tr.r) / wd, 2.0)) * smoothstep(0.3, 1.5, cell) * 1.15);
    }
    // a splash ring where the board is in the water
    float rd = length(p - uRider.xz);
    m = max(m, uRider.w * (1.0 - smoothstep(0.25, 0.75, rd)) * 0.9);
    float sr = length(p - uSplash.xy);
    m = max(m, uSplash.w * max(exp(-pow((sr - uSplash.z) / (0.3 + 0.12 * uSplash.z), 2.0)), 0.7 * (1.0 - smoothstep(0.0, uSplash.z * 0.9, sr))));

    vec2 fw = wp + rip * 0.25;
    float pat = mix(texture2D(tFoam, fw * 0.23).r, texture2D(tFoam, fw * 0.61).g, 0.32) + texture2D(tFoam, wp * 0.04).b * 0.25 - 0.12;
    float foam = smoothstep(1.0, 1.05, m + pat * 0.95) * (1.0 - smoothstep(180.0, 420.0, vD));
    float core = smoothstep(1.3, 1.36, m + pat * 0.95);
    vec3 foamCol = mix(uFoamShade, uFoam, core) * (tilt < -0.07 ? 0.86 : 1.0);
    col = mix(col, foamCol, foam);

    // blob shadows: rider and boat
    vec2 lh = uSun.xz / uSun.y;
    vec2 a = uRider.xz - lh * uRider.y, b = a - lh * 1.6;
    float sh = (1.0 - smoothstep(0.2, 0.34, segDist(p, a, b))) * clamp(1.0 - uRider.y * 0.12, 0.3, 1.0);
    float bd = min(boxDist(pb, vec2(0.0, -3.3), vec2(0.9, 3.0)), boxDist(pb + lh * 1.1, vec2(0.0, -3.3), vec2(0.9, 3.0)));
    sh = max(sh, 1.0 - smoothstep(0.2, 0.5, bd));
    col = mix(col, col * vec3(0.42, 0.5, 0.68), sh * 0.75);

    col = mix(col, uHaze, smoothstep(140.0, 820.0, vD));
    gl_FragColor = vec4(col, 1.0);
  }`;

const G_FRAG = 'varying float vD; void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, vD); }';

// Tileable foam noise: R = coarse cells, G = fine cells, B = soft cloud.
function foamTexture(size = 256) {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const worley = n => {
    const pts = Array.from({ length: n * n }, () => [rnd(), rnd()]), out = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = x / size * n, fy = y / size * n, cx = Math.floor(fx), cy = Math.floor(fy);
      let best = 9;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const q = pts[((cy + j + n) % n) * n + (cx + i + n) % n];
        best = Math.min(best, Math.hypot(cx + i + q[0] - fx, cy + j + q[1] - fy));
      }
      out[y * size + x] = Math.min(1, best / 0.72);
    }
    return out;
  };
  const a = worley(12), b = worley(29);
  const waves = Array.from({ length: 10 }, () => [Math.round(rnd() * 8 - 4), Math.round(rnd() * 8 - 4), rnd() * 6.28]);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let c = 0;
    for (const [kx, ky, ph] of waves) c += Math.sin((kx * x + ky * y) / size * 6.2831853 + ph);
    const i = y * size + x;
    data.set([a[i] * 255, b[i] * 255, 127 + c * 28, 255], i * 4);
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}

// The colours of the sky and the water, shared by both shaders. They belong to the lake: setLake() in env.js fills them in.
export const PALETTE = Object.fromEntries('horizon skyMid zenith haze cloud mtn deep mid light foam foamShade'.split(' ').map(k => [k, new THREE.Color()]));

export function createWater(normalTex) {
  normalTex.wrapS = normalTex.wrapT = THREE.RepeatWrapping; normalTex.anisotropy = 8;

  // grid dense around the wake, stretching out to the horizon
  const NX = 340, NZ = 230, geo = new THREE.PlaneGeometry(2, 2, NX, NZ), pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const a = pos.getX(i), b = pos.getY(i);
    pos.setXYZ(i, Math.sign(a) * (22 * Math.abs(a) + 640 * Math.abs(a) ** 3.5), 0, 12 - Math.sign(b) * (30 * Math.abs(b) + 950 * Math.abs(b) ** 4));
  }
  const N = 160, cellSize = 0.25, trail = new Float32Array(N * 4);
  const tTrail = new THREE.DataTexture(trail, N, 1, THREE.RGBAFormat, THREE.FloatType);
  tTrail.wrapS = THREE.RepeatWrapping; tTrail.minFilter = tTrail.magFilter = THREE.LinearFilter; tTrail.needsUpdate = true;

  const uniforms = {
    uTime: { value: 0 }, uDist: { value: 0 }, uSurf: { value: 0 }, uGo: { value: 1 }, uSun: { value: SUN },
    tNormal: { value: normalTex }, tFoam: { value: foamTexture() }, tTrail: { value: tTrail },
    uDeep: { value: PALETTE.deep }, uMid: { value: PALETTE.mid }, uLight: { value: PALETTE.light },
    uFoam: { value: PALETTE.foam }, uFoamShade: { value: PALETTE.foamShade },
    uHorizon: { value: PALETTE.horizon }, uSkyMid: { value: PALETTE.skyMid }, uZenith: { value: PALETTE.zenith }, uHaze: { value: PALETTE.haze },
    uRider: { value: new THREE.Vector4() }, uBoat: { value: new THREE.Vector3() }, uTurn: { value: new THREE.Vector3() }, uTrail: { value: new THREE.Vector3(0, cellSize, N) }, uSplash: { value: new THREE.Vector4() },
  };
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG }));
  mesh.frustumCulled = false;
  mesh.userData.gmat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: G_FRAG });

  let lastCell = null, grow = 0;
  return {
    mesh,
    boat(x, z, yaw) { uniforms.uBoat.value.set(x, z, yaw); },
    splash(x, z, strength, speed) { uniforms.uSplash.value.set(x, z, 0.3, strength); grow = speed; },
    update(s, dt) {
      const sp = uniforms.uSplash.value;             // the ring stays put in the water, so it streams back past the boat
      sp.y += C.V * dt; sp.z += grow * dt; grow *= Math.exp(-dt * 1.2); sp.w *= Math.exp(-dt * 1.3);
      uniforms.uTime.value = s.t; uniforms.uDist.value = s.dist; uniforms.uSurf.value = C.surf ? 1 : 0; uniforms.uGo.value = C.go; uniforms.uTurn.value.set(C.turn.R, C.turn.zj, C.turn.phi);
      const wet = s.contact && !s.crashed;
      uniforms.uRider.value.set(s.x, Math.max(0, s.y), s.z, wet ? 1 : s.surfaced ? 0.8 : 0);
      // lay the trail down cell by cell as the rider's world z advances (it only ever decreases)
      const wz = s.z - s.dist, cur = Math.floor(wz / cellSize), strength = wet ? 0.5 + 0.5 * Math.min(1, Math.abs(s.lift) / 1.3) : 0;
      if (lastCell === null || cur > lastCell) lastCell = cur + 1;
      const jumped = lastCell - cur > 12;            // a respawn, not riding: leave a gap
      for (let c = lastCell - 1; c >= Math.max(cur, lastCell - N); c--) { const i = ((c % N) + N) % N * 4; trail[i] = s.x; trail[i + 1] = jumped ? 0 : strength; }
      if (cur < lastCell) { lastCell = cur; tTrail.needsUpdate = true; }
      uniforms.uTrail.value.x = wz;
    },
  };
}
