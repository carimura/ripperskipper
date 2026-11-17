// Particles: spray (hard-edged white blobs that erode as they age), mist, and the stars thrown off by tricks.
// Drawn after the ink pass, depth-tested by hand against the g-buffer so they sit behind the rider and the boat correctly.
import * as THREE from 'three';
import { C, surfaceY } from './physics.js';

const MAX = 3000;

export function createFx(gTexture, res, camera) {
  const pos = new Float32Array(MAX * 3), vel = new Float32Array(MAX * 3), data = new Float32Array(MAX * 3);
  const age = new Float32Array(MAX).fill(1), life = new Float32Array(MAX).fill(1), size0 = new Float32Array(MAX), size1 = new Float32Array(MAX);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aData', new THREE.BufferAttribute(data, 3));           // size (m), remaining 0..1, tone
  const uniforms = { tG: { value: gTexture }, uRes: { value: res }, uScale: { value: 1 } };
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms, depthTest: false, depthWrite: false, transparent: true,
    vertexShader: `
      attribute vec3 aData; uniform float uScale; varying float vLeft, vTone, vD;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vD = -mv.z; vLeft = aData.y; vTone = aData.z;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aData.y > 0.0 ? aData.x * uScale / max(vD, 0.2) : 0.0;
      }`,
    fragmentShader: `
      uniform sampler2D tG; uniform vec2 uRes; varying float vLeft, vTone, vD;
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0;
        float seed = fract(vTone), ang = atan(q.y, q.x);
        if (vD > texture2D(tG, gl_FragCoord.xy / uRes).a + 0.03) discard;
        if (vTone >= 2.0) {                                               // a five-point star with an ink edge, spinning and shrinking away
          float spin = seed * 6.2832 + (1.0 - vLeft) * (seed - 0.5) * 9.0, an = 0.6283185;
          vec2 p = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * q / (0.25 + 0.75 * sqrt(vLeft));
          float seg = abs(mod(atan(p.y, p.x), 2.0 * an) - an), rr = length(p);
          vec2 pt = rr * vec2(cos(seg), sin(seg)), V = 0.44 * vec2(cos(an), sin(an));       // tip at (1, 0), valley at V
          float d = ((V.x - 1.0) * pt.y - V.y * (pt.x - 1.0)) / length(V - vec2(1.0, 0.0));
          if (d < 0.0) discard;
          vec3 c = seed < 0.55 ? vec3(1.0, 0.64, 0.014) : seed < 0.72 ? vec3(1.0) : seed < 0.87 ? vec3(0.114, 0.768, 1.0) : vec3(1.0, 0.1, 0.58);
          gl_FragColor = vec4(d < 0.11 ? vec3(0.003, 0.005, 0.019) : mix(c, vec3(1.0), smoothstep(0.42, 0.05, rr)), 1.0);
          #include <colorspace_fragment>
          return;
        }
        float r = dot(q, q) / (0.8 + 0.2 * sin(ang * 3.0 + seed * 40.0));   // slightly lumpy, not a perfect disc
        if (r > vLeft) discard;
        if (vTone >= 1.0) gl_FragColor = vec4(0.86, 0.95, 1.0, 0.3 * vLeft * smoothstep(1.0, 0.45, r / vLeft));            // mist
        else gl_FragColor = vec4(mix(vec3(0.66, 0.87, 0.97), vec3(1.0), step(r + q.y * 0.35, vLeft * 0.5 + seed * 0.2)), 1.0);   // droplet
        #include <colorspace_fragment>
      }`,
  }));
  points.frustumCulled = false;
  const scene = new THREE.Scene().add(points);

  let head = 0;
  const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  function emit(x, y, z, vx, vy, vz, s0, s1, t, kind = 0) {      // kind: 0 droplet, 1 mist, 2 star
    const i = head; head = (head + 1) % MAX;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    age[i] = 0; life[i] = t; size0[i] = s0; size1[i] = s1; data[i * 3 + 2] = kind + Math.random() * 0.999;
  }
  function burst(x, y, z, n, power, vz = C.V * 0.5) {   // a crown of water thrown up and out
    for (let i = 0; i < n; i++) {
      const a = rnd(6.283), sp = rnd(1, 5.5) * power, up = rnd(1.5, 6) * power;
      const mist = i % 6 === 0 ? 1 : 0;
      emit(x + Math.cos(a) * 0.3, y + 0.05, z + Math.sin(a) * 0.3, Math.cos(a) * sp, up * (mist ? 0.6 : 1), Math.sin(a) * sp + vz, mist ? 0.5 : rnd(0.05, 0.12), mist ? 1.6 : rnd(0.16, 0.4), rnd(0.5, 1.0), mist);
    }
  }
  function column(x, y, z, n, power, vz) {        // the tall plume where a body goes in
    for (let i = 0; i < n; i++) {
      const a = rnd(6.283), r = rnd(0.5), mist = i % 4 === 0 ? 1 : 0;
      emit(x + Math.cos(a) * r, y, z + Math.sin(a) * r, Math.cos(a) * rnd(1.3), rnd(3.5, 10.5) * power * (mist ? 0.7 : 1), Math.sin(a) * rnd(1.3) + vz, mist ? 0.6 : rnd(0.06, 0.14), mist ? 2 : rnd(0.2, 0.5), rnd(0.7, 1.3), mist);
    }
  }
  function stars(x, y, z, n, power, vx, vz) {      // thrown off the rider when a trick lands or ticks over
    for (let i = 0; i < n; i++) {
      const a = rnd(6.283), el = rnd(-0.35, 1.25), sp = rnd(1.8, 6.5) * power, size = rnd(0.16, 0.36) * (0.75 + 0.45 * power);
      emit(x, y + 0.9, z, vx + Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp + 1.2, vz + Math.sin(a) * Math.cos(el) * sp * 0.7, size, size * 1.1, rnd(0.55, 1.15), 2);
    }
  }
  let acc = 0;
  return {
    scene, burst, column, stars,
    update(s, dt) {
      uniforms.uScale.value = res.y / (2 * Math.tan(camera.fov * Math.PI / 360));
      acc += dt;
      // rider: a fan of spray off the working edge, thrown away from the turn, plus churn off the tail
      if (s.contact && !s.crashed) {
        const edge = Math.min(1, Math.abs(s.lift) / 1.4), dir = -Math.sign(s.lift || 1);
        const hx = Math.sin(s.psiV + s.aoa), hz = -Math.cos(s.psiV + s.aoa);       // along the board
        let n = (60 + 1100 * edge * edge) * dt + Math.random();
        for (; n >= 1; n--) {
          const hard = Math.random() < edge, mist = Math.random() < 0.2 ? 1 : 0, along = rnd(-0.75, 0.25);
          emit(s.x + hx * along + dir * rnd(0, 0.2), s.y + 0.04, s.z + hz * along,
            hard ? dir * rnd(0.8, 4) * edge + s.vx * 0.3 : rnd(-0.5, 0.5), (hard ? rnd(1.5, 5) * (0.4 + 0.8 * edge) : rnd(0.4, 1.3)) * (mist ? 0.75 : 1), C.V * rnd(0.5, 0.75) + s.vz,
            mist ? 0.35 : rnd(0.03, 0.08), mist ? rnd(0.8, 1.2) : rnd(0.08, 0.2), rnd(0.25, 0.6), mist);
        }
      }
      // boat: prop wash off the transom and spray peeling off the hull
      for (let n = s.crashed && s.crashT > 0.6 ? 0 : (150 * dt + Math.random()) * C.go; n >= 1; n--) {   // (not while the boat is off its line, turning back)
        if (Math.random() < 0.45) emit(rnd(-0.5, 0.5), 0.1, rnd(0.7, 1.6), rnd(-0.6, 0.6), rnd(1, 2.8), rnd(3, 6), rnd(0.05, 0.1), rnd(0.16, 0.34), rnd(0.4, 0.8));
        else { const side = Math.random() < 0.5 ? -1 : 1; emit(side * rnd(1.15, 1.3), 0.12, rnd(-4.2, -0.3), side * rnd(1, 2.6), rnd(0.6, 2), rnd(5, 8), rnd(0.04, 0.09), rnd(0.14, 0.3), rnd(0.4, 0.75)); }
      }
      for (let i = 0; i < MAX; i++) {
        if (age[i] >= life[i]) { data[i * 3 + 1] = 0; continue; }
        age[i] += dt;
        const j = i * 3, k = age[i] / life[i];
        if (data[j + 2] >= 2) vel[j + 1] -= 3.5 * dt;                    // stars float along with the rider
        else { vel[j + 1] -= 9.81 * dt; vel[j + 2] += (C.V - vel[j + 2]) * 1.3 * dt; vel[j] *= 1 - 1.3 * dt; }   // water: gravity, and the air leaves it behind
        pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
        if (data[j + 2] < 2 && vel[j + 1] < 0 && pos[j + 1] < surfaceY(pos[j], pos[j + 2], s.t, s.dist) - 0.03) age[i] = life[i];
        data[j] = size0[i] + (size1[i] - size0[i]) * k; data[j + 1] = Math.max(0, 1 - k * k);
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.aData.needsUpdate = true;
    },
  };
}
