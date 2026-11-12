/* Made Well: parts the places share. Thrown clay, gold, the seams that mend,
   cracks that gold can flood, spark bursts struck on a beat, light shafts. */
import * as THREE from 'three';
import { FOG, FOG_GLSL } from '../engine.js';
import { std, phys, C, mulberry32 } from './kit.js';

/* ---------- materials ---------- */
export const wetClay = (k = '') => std({ color: C(0.36, 0.2, 0.13), roughness: 0.32, metalness: 0 }, 'wetclay' + k);
export const dryClay = (k = '') => std({ color: C(0.74, 0.55, 0.4), roughness: 0.92 }, 'pots' + k);
export const adobe = () => std({ color: C(0.62, 0.45, 0.33), roughness: 0.95 }, 'adobe');
export const earth = () => std({ color: C(0.34, 0.25, 0.19), roughness: 0.95 }, 'floor');
export const wood = () => std({ color: C(0.26, 0.17, 0.11), roughness: 0.8 }, 'wood');
export const iron = (k = '') => std({ color: C(0.09, 0.085, 0.08), roughness: 0.55, metalness: 0.85 }, 'iron' + k);
export const GOLD = new THREE.Color(1.0, 0.72, 0.28);

/* ---------- thrown shapes ---------- */
// A lathe from [radius, height] pairs; rings: throwing lines, per metre of height
export function thrown(profile, { segs = 72, rings = 0, ringAmp = 0, steps = 4 } = {}) {
  const pts = [];
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
    for (let k = 0; k < steps; k++) {
      const u = k / steps, s = u * u * (3 - 2 * u);
      const y = y0 + (y1 - y0) * u, r = r0 + (r1 - r0) * s;
      pts.push(new THREE.Vector2(Math.max(0.001, r * (1 + ringAmp * Math.sin(y * rings * Math.PI * 2))), y));
    }
  }
  pts.push(new THREE.Vector2(...profile[profile.length - 1]));
  const g = new THREE.LatheGeometry(pts, segs);
  g.computeVertexNormals();
  return g;
}
export const SHAPES = {
  amphora: [[0.01, 0], [2.3, 0.04], [2.5, 0.5], [2.6, 1.0], [3.6, 3.2], [4.6, 6.2], [4.3, 8.6], [3.0, 10.6], [1.7, 12.2], [1.5, 13.4], [2.0, 14.6], [2.1, 15.0]],
  jar: [[0.01, 0], [0.55, 0.02], [0.78, 0.35], [0.95, 0.9], [0.88, 1.35], [0.55, 1.62], [0.6, 1.8]],
  bowl: [[0.01, 0], [0.4, 0.02], [0.85, 0.3], [1.15, 0.7], [1.25, 0.85]],
  vase: [[0.01, 0], [0.4, 0.02], [0.55, 0.6], [0.38, 1.5], [0.28, 2.1], [0.42, 2.5]],
};

/* ---------- seams and cracks ---------- */
const CELL = /* glsl */`
  vec3 mwHash3(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
  vec2 mwHash2(vec2 p){ vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
  // distance to the nearest cell border (F2 - F1, halved) in 3D and 2D
  float mwEdge3(vec3 p){ vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec3 o = vec3(x, y, z), r = o + mwHash3(i + o) * 0.85 - f; float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
    return (sqrt(d2) - sqrt(d1)) * 0.5; }
  float mwVn3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(mwHash3(i).x, mwHash3(i+vec3(1,0,0)).x, f.x), mix(mwHash3(i+vec3(0,1,0)).x, mwHash3(i+vec3(1,1,0)).x, f.x), f.y),
               mix(mix(mwHash3(i+vec3(0,0,1)).x, mwHash3(i+vec3(1,0,1)).x, f.x), mix(mwHash3(i+vec3(0,1,1)).x, mwHash3(i+vec3(1,1,1)).x, f.x), f.y), f.z); }
  float mwEdge2(vec2 p){ vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(x, y), r = o + mwHash2(i + o) * 0.9 - f; float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
    return (sqrt(d2) - sqrt(d1)) * 0.5; }
`;
// Kintsugi: a break network in object space, mended with gold. glow lights the gold
// (molten in the foundry, a warm gleam on the finished vessel); grow reveals it from
// the base upward, so a vessel can be mended over time.
export function seams(material, o = {}) {
  const u = { uSeamScale: { value: o.scale ?? 0.45 }, uSeamW: { value: o.width ?? 0.03 }, uSeamGlow: { value: o.glow ?? 0.6 },
    uSeamGrow: { value: o.grow ?? 1e4 }, uSeamCol: { value: (o.color || GOLD).clone() }, uSeamKeep: { value: o.keep ?? 1 } };
  const prev = material.onBeforeCompile, prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSeamObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeamObj = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vSeamObj; uniform float uSeamScale, uSeamW, uSeamGlow, uSeamGrow, uSeamKeep; uniform vec3 uSeamCol;
      ${CELL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float sE = mwEdge3(vSeamObj * uSeamScale);
        float sAA = fwidth(sE) * 1.2 + 1e-4;
        // a line thinner than a pixel dims rather than fattening: coverage, not width
        float sSeam = (1.0 - smoothstep(uSeamW, uSeamW + sAA, sE)) * (uSeamW / (uSeamW + sAA)) * step(vSeamObj.y, uSeamGrow);
        // a break runs along some cell edges, not all: keep a share of the network, in runs
        sSeam *= smoothstep(1.0 - uSeamKeep - 0.06, 1.0 - uSeamKeep + 0.06, mwVn3(vSeamObj * uSeamScale * 0.9 + 3.7));
        diffuseColor.rgb = mix(diffuseColor.rgb, uSeamCol * 0.85, sSeam);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.22, sSeam);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = mix(metalnessFactor, 1.0, sSeam);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += uSeamCol * sSeam * uSeamGlow;');
  };
  material.customProgramCacheKey = () => prevKey() + '|seams';
  return u;
}
// Cracked ground: polygon cracks on world xz. Gold floods the cracks outward from
// uFloodAt within radius uFlood, welling up behind a hot front.
export function cracked(material, o = {}) {
  const u = { uCrackScale: { value: o.scale ?? 0.22 }, uCrackW: { value: o.width ?? 0.035 }, uFloodAt: { value: o.at || new THREE.Vector2() },
    uFlood: { value: 0 }, uFloodGlow: { value: o.glow ?? 2.2 } };
  const prev = material.onBeforeCompile, prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uCrackScale, uCrackW, uFlood, uFloodGlow; uniform vec2 uFloodAt;
      ${CELL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // two scales of polygon: large plates, and finer crazing inside them
        float cE = mwEdge2(vFogWorld.xz * uCrackScale), cE2 = mwEdge2(vFogWorld.xz * uCrackScale * 3.7 + 11.0);
        float cAA = fwidth(cE) * 1.2 + 1e-4, cAA2 = fwidth(cE2) * 1.2 + 1e-4;
        float cBig = 1.0 - smoothstep(uCrackW, uCrackW + cAA, cE);
        float cFine = (1.0 - smoothstep(uCrackW * 0.6, uCrackW * 0.6 + cAA2, cE2)) * 0.6;
        float cr = max(cBig, cFine * (1.0 - smoothstep(0.0, 0.02, fwidth(cE2))));
        float fd = length(vFogWorld.xz - uFloodAt);
        float cCov = (1.0 - smoothstep(uCrackW, uCrackW + cAA, cE)) * (uCrackW / (uCrackW + cAA));
        float flood = cCov * (1.0 - smoothstep(uFlood - 6.0, uFlood, fd));
        float front = cCov * exp(-pow((fd - uFlood) / 4.0, 2.0)) * step(0.5, uFlood);
        diffuseColor.rgb *= mix(1.0, 0.35, cr);
        diffuseColor.rgb = mix(diffuseColor.rgb, ${vec3(GOLD)} * 0.9, flood);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.25, flood);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = mix(metalnessFactor, 1.0, flood);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += ${vec3(GOLD)} * (flood * uFloodGlow + front * uFloodGlow * 3.0);`);
  };
  material.customProgramCacheKey = () => prevKey() + '|cracked';
  return u;
}
function vec3(c) { return `vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)})`; }

/* ---------- sparks ---------- */
// Bursts struck every `period` seconds (offset `phase`), each spark on a ballistic
// arc, white-hot cooling to red. Closed-form in time, so every shutter sample agrees.
export function makeSparks(o = {}) {
  const n = o.count || 600, rnd = mulberry32(o.seed || 5);
  const seed = new Float32Array(n * 4), pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { seed[i * 4] = rnd(); seed[i * 4 + 1] = rnd(); seed[i * 4 + 2] = rnd(); seed[i * 4 + 3] = rnd(); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const u = {
    ...FOG, uOrigin: { value: o.origin ? o.origin.clone() : new THREE.Vector3() }, uAxis: { value: (o.axis || new THREE.Vector3(0, 1, 0)).clone().normalize() },
    uSpeed: { value: o.speed ?? 14 }, uCone: { value: o.cone ?? 1.2 }, uLife: { value: o.life ?? 1.2 }, uPeriod: { value: o.period ?? 1 },
    uPhase: { value: o.phase ?? 0 }, uGrav: { value: o.gravity ?? 9.8 }, uBright: { value: o.bright ?? 3 }, uSize: { value: o.size ?? 0.06 },
    uSpread: { value: o.spread ?? 0.25 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform vec3 uOrigin, uAxis; uniform float uTime, uSpeed, uCone, uLife, uPeriod, uPhase, uGrav, uSize, uSpread;
      attribute vec4 aSeed; varying float vHeat; varying vec3 vWorld;
      void main(){
        float tt = uTime - uPhase - aSeed.w * uSpread;
        float age = mod(tt, uPeriod);
        vHeat = age < uLife ? 1.0 - age / uLife : 0.0;
        vec3 t1 = normalize(cross(uAxis, abs(uAxis.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0))), t2 = cross(uAxis, t1);
        float a = aSeed.x * 6.2832, c = mix(cos(uCone), 1.0, pow(aSeed.y, 0.7));
        vec3 d = uAxis * c + (t1 * cos(a) + t2 * sin(a)) * sqrt(1.0 - c * c);
        vec3 p = uOrigin + d * uSpeed * (0.35 + 0.9 * aSeed.z) * age - vec3(0.0, 0.5 * uGrav * age * age, 0.0);
        vWorld = p;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(uSize * (0.6 + aSeed.z) * projectionMatrix[1][1] * 540.0 / max(-mv.z, 0.05), 0.0, 7.0) * step(0.001, vHeat);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uBright; varying float vHeat; varying vec3 vWorld;
      ${FOG_GLSL}
      void main(){
        float a = 1.0 - smoothstep(0.1, 0.5, length(gl_PointCoord - 0.5));
        vec3 hot = mix(vec3(1.6, 0.35, 0.06), vec3(2.6, 2.0, 1.4), vHeat * vHeat);
        gl_FragColor = vec4(hot * a * vHeat * uBright * (1.0 - fogAmount(vWorld)), 1.0);
      }`,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 6;
  return { mesh: pts, u };
}

/* ---------- light shafts ---------- */
// Sun through a gap: a long box along the light, drawn additively with soft edges and
// drifting dust, brightest near its source. A film trick, not volumetric scattering.
export function shaft(from, dir, len, w, d, o = {}) {
  const geo = new THREE.BoxGeometry(w, len, d); geo.translate(0, -len / 2, 0);
  const u = { ...FOG, uCol: { value: (o.color || C(1.0, 0.8, 0.55)).clone() }, uAmt: { value: o.amount ?? 0.05 }, uLen: { value: len } };
  const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`varying vec3 vL; varying vec3 vWorld; void main(){ vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCol; uniform float uAmt, uLen, uTime; varying vec3 vL; varying vec3 vWorld;
      ${FOG_GLSL}
      float h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i), h(i+vec3(1,0,0)), f.x), mix(h(i+vec3(0,1,0)), h(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i+vec3(0,0,1)), h(i+vec3(1,0,1)), f.x), mix(h(i+vec3(0,1,1)), h(i+vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        float along = -vL.y / uLen;
        float dust = 0.6 + 0.4 * n3(vWorld * 0.35 + vec3(0.0, -uTime * 0.2, uTime * 0.1));
        float a = uAmt * dust * (1.0 - along * 0.7) * smoothstep(0.0, 0.08, along) * (1.0 - smoothstep(0.7, 1.0, along));
        gl_FragColor = vec4(uCol * a * (1.0 - fogAmount(vWorld) * 0.7), 1.0);
      }`,
  }));
  m.position.copy(from);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
  m.renderOrder = 4;
  return m;
}

/* ---------- grass ---------- */
// One tuft of dry blades fanned from a point: thin, leaning, two-sided.
export function tuft(blades = 7, rnd = mulberry32(3)) {
  const pos = [], idx = [];
  for (let b = 0; b < blades; b++) {
    const a = rnd() * Math.PI * 2, lean = 0.15 + rnd() * 0.5, h = 0.6 + rnd() * 1.0, w = 0.05 + rnd() * 0.05;
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz * w, pz = dx * w;
    const k = pos.length / 3;
    pos.push(px, 0, pz, -px, 0, -pz, dx * lean * h, h, dz * lean * h);
    idx.push(k, k + 1, k + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/* ---------- smoke and steam ---------- */
// Columns of billowing puffs: camera-facing quads that rise and swell from each
// source, closed-form in time. Lit by the sun from behind (forward scattering),
// so their edges glow when we look toward the light.
export function makePuffs(sources, o = {}) {
  const per = o.per || 40, n = sources.length * per, rnd = mulberry32(o.seed || 9);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const src = new Float32Array(n * 3), seed = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const s = sources[Math.floor(i / per)];
    src.set([s.x, s.y, s.z], i * 3); seed.set([rnd(), rnd(), rnd(), rnd()], i * 4);
  }
  geo.setAttribute('aSrc', new THREE.InstancedBufferAttribute(src, 3));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  geo.instanceCount = n;
  const u = {
    ...FOG, uRise: { value: o.rise ?? 4 }, uHeight: { value: o.height ?? 160 }, uR0: { value: o.r0 ?? 6 }, uR1: { value: o.r1 ?? 30 },
    uDrift: { value: (o.drift || new THREE.Vector3(3, 0, 0)).clone() }, uOpacity: { value: o.opacity ?? 0.7 },
    uDark: { value: (o.dark || C(0.12, 0.1, 0.09)).clone() }, uLight: { value: (o.light || C(0.6, 0.5, 0.42)).clone() },
    uGlowBase: { value: (o.glowBase || C(0, 0, 0)).clone() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false,
    vertexShader: /* glsl */`
      uniform float uTime, uRise, uHeight, uR0, uR1; uniform vec3 uDrift;
      attribute vec3 aSrc; attribute vec4 aSeed;
      varying vec2 vUv; varying float vAge; varying vec3 vWorld; varying float vSeed;
      void main(){
        float life = uHeight / uRise;
        float age = fract(uTime / life + aSeed.x);
        vAge = age; vSeed = aSeed.y; vUv = uv;
        float h = age * uHeight, r = mix(uR0, uR1, sqrt(age));
        vec3 c = aSrc + vec3(0.0, h, 0.0) + uDrift * age * life + (aSeed.yzw - 0.5) * vec3(r, r * 0.3, r) * 0.8;
        // billboard: the quad spans the camera's right and up
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float sz = r * (1.4 + aSeed.z);
        vec3 p = c + (right * position.x + up * position.y) * sz;
        vWorld = c;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity, uTime; uniform vec3 uDark, uLight, uGlowBase;
      varying vec2 vUv; varying float vAge; varying vec3 vWorld; varying float vSeed;
      ${FOG_GLSL}
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 x){ vec2 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 q = vUv - 0.5; float r = length(q) * 2.0;
        vec2 w = vUv * 3.0 + vSeed * 17.0 + vec2(0.0, uTime * 0.05);
        float n = n2(w) * 0.5 + n2(w * 2.3) * 0.3 + n2(w * 5.1) * 0.2;
        float a = smoothstep(1.0, 0.25, r + (n - 0.5) * 0.7) * uOpacity;
        a *= smoothstep(0.0, 0.08, vAge) * (1.0 - smoothstep(0.55, 1.0, vAge));
        if (a < 0.004) discard;
        vec3 v = normalize(vWorld - uCamPos);
        float back = pow(max(dot(v, uSunDir), 0.0), 6.0);
        vec3 col = mix(uDark, uLight, n * 0.8 + 0.2) * (0.7 + 0.6 * (1.0 - r)) + uFogSunColor * back * (1.0 - smoothstep(0.2, 1.0, 1.0 - r)) * 0.6;
        col += uGlowBase * (1.0 - smoothstep(0.0, 0.3, vAge));
        gl_FragColor = vec4(applyFog(col, vWorld), a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 6;
  return { mesh, u };
}
