// Cel-shading kit: toon materials, the ink-outline registry, and the render pipeline
// (colour pass → normal/id/depth pass → ink composite → spray particles).
import * as THREE from 'three';

export const SUN = new THREE.Vector3(-0.62, 0.66, 0.42).normalize();     // direction towards the sun
const RIM_DIR = new THREE.Vector3(0.8, 0.2, -0.55).normalize();

// three flat tones: shadow, a thin half-tone at the terminator, light
const rampData = new Uint8Array(32).map((_, i) => (i < 16 ? 95 : i < 18 ? 175 : 255));
export const ramp = new THREE.DataTexture(rampData, 32, 1, THREE.RedFormat);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
ramp.needsUpdate = true;

export function toon(color, o = {}) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: ramp, ...o.params });
  const u = { uRim: { value: o.rim ?? 0.5 }, uSpec: { value: o.spec ?? 0 }, uShine: { value: o.shine ?? 40 }, uRimDir: { value: RIM_DIR } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRim, uSpec, uShine; uniform vec3 uRimDir;')
      .replace('#include <opaque_fragment>', `{
        vec3 vd = normalize(vViewPosition);
        vec3 wn = inverseTransformDirection(normal, viewMatrix);
        float fr = 1.0 - saturate(dot(vd, normal));
        float rim = smoothstep(0.58, 0.64, fr) * smoothstep(-0.05, 0.3, dot(wn, uRimDir));
        outgoingLight += (diffuseColor.rgb * 0.6 + 0.25) * vec3(0.7, 0.9, 1.0) * rim * uRim;
        #if NUM_DIR_LIGHTS > 0
          vec3 hv = normalize(directionalLights[0].direction + vd);
          outgoingLight += uSpec * smoothstep(0.5, 0.58, pow(saturate(dot(normal, hv)), uShine));
        #endif
      }
      #include <opaque_fragment>`);
  };
  return m;
}

// ---- ink registry: every outlined mesh gets a companion material that writes (view normal.xy, id, depth) ----
let nextId = 1;
export const newId = () => nextId++;
const gCache = new Map();
const G_VERT = `
  #include <common>
  varying vec3 vN; varying float vD;
  void main() {
    #include <beginnormal_vertex>
    #include <defaultnormal_vertex>
    #include <begin_vertex>
    #include <project_vertex>
    vN = transformedNormal; vD = -mvPosition.z;
  }`;
const G_FRAG = `
  uniform float uId; varying vec3 vN; varying float vD;
  void main() {
    vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
    gl_FragColor = vec4(n.xy, uId, vD);
  }`;
export function gMat(id, side = THREE.FrontSide) {
  const key = id + ':' + side;
  if (!gCache.has(key)) gCache.set(key, new THREE.ShaderMaterial({ uniforms: { uId: { value: id } }, vertexShader: G_VERT, fragmentShader: G_FRAG, side }));
  return gCache.get(key);
}
// Outline a mesh. Meshes that share an id read as one object: no line is drawn where they meet.
export function ink(mesh, id = newId()) {
  mesh.userData.gmat = gMat(id, mesh.material.side);
  return mesh;
}
export const noInk = o => { o.traverse(c => c.layers.set(1)); return o; };   // colour pass only

const COMPOSITE_FRAG = `
  uniform sampler2D tColor, tG; uniform vec2 uRes; uniform vec3 uInk;
  varying vec2 vUv;
  vec3 nrm(vec4 g) { return vec3(g.xy, sqrt(max(0.0, 1.0 - dot(g.xy, g.xy)))); }
  void main() {
    vec4 g = texture2D(tG, vUv);
    float id = g.b, d = g.a;
    vec3 n = nrm(g);
    float px = clamp(11.0 / d, 0.55, 1.5) * uRes.y / 720.0;          // heavier lines up close
    float dTol = (0.05 + 0.009 * d) / max(n.z, 0.2);
    float e = 0.0;
    for (int i = 0; i < 8; i++) {
      float a = 0.7853982 * float(i);
      vec4 s = texture2D(tG, vUv + vec2(cos(a), sin(a)) * px / uRes);
      float k = step(0.5, abs(s.b - id));                             // a different object
      if (k < 0.5 && id > 0.5) {
        k = max(smoothstep(0.35, 0.6, 1.0 - dot(n, nrm(s))),          // a crease
                step(dTol, abs(s.a - d)));                            // one part in front of another
      }
      e += k;
    }
    float line = smoothstep(0.1, 0.5, e / 8.0) * mix(1.0, 0.3, smoothstep(40.0, 320.0, min(d, 400.0)));
    vec3 col = texture2D(tColor, vUv).rgb;
    col = mix(col, uInk, line * 0.92);
    vec2 q = vUv - 0.5;
    col *= 1.0 - 0.22 * smoothstep(0.35, 0.95, dot(q, q) * 2.0);     // soft vignette
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

export function createPipeline(renderer, scene, camera) {
  const colorRT = new THREE.WebGLRenderTarget(2, 2, { samples: 4, type: THREE.HalfFloatType });
  const gRT = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const res = new THREE.Vector2(2, 2);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { tColor: { value: colorRT.texture }, tG: { value: gRT.texture }, uRes: { value: res }, uInk: { value: new THREE.Color(0x0b1026) } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: COMPOSITE_FRAG, depthTest: false, depthWrite: false,
  }));
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene().add(quad), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let inked = null;

  const api = {
    gTexture: gRT.texture, res, fxScene: null,
    resize(w, h, dpr) {
      res.set(Math.round(w * dpr), Math.round(h * dpr));
      colorRT.setSize(res.x, res.y); gRT.setSize(res.x, res.y);
    },
    render() {
      if (!inked) {
        inked = [];
        scene.traverse(o => { if (o.isMesh && o.layers.mask & 1) { if (!o.userData.gmat) ink(o); inked.push(o); } });
      }
      camera.layers.enableAll();
      renderer.setRenderTarget(colorRT); renderer.render(scene, camera);

      camera.layers.set(0);
      for (const o of inked) { o.userData.cmat = o.material; o.material = o.userData.gmat; }
      const bg = scene.background; scene.background = null;
      renderer.setRenderTarget(gRT); renderer.setClearColor(0x000000, 0); renderer.render(scene, camera);
      scene.background = bg;
      for (const o of inked) o.material = o.userData.cmat;
      camera.layers.enableAll();

      renderer.setRenderTarget(null); renderer.render(quadScene, quadCam);
      if (api.fxScene) { renderer.autoClear = false; renderer.render(api.fxScene, camera); renderer.autoClear = true; }
    },
  };
  return api;
}
