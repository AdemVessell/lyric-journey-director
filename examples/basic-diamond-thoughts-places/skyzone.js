/* 1:02.5–1:20.3 — THE SKY. We burst out of the sea into a vast sky: the line is
   skywritten, a kilometre wide, behind a bright pen. We fly into the writing and
   its strokes become cords — a braid spiralling round our path, the camera rolling
   a full turn (the planes change) while the bound line passes on its ribbons. The
   braid unravels over a plain of cloth where flounders glide; the cloth tears and
   we dive into the dark. */
import * as THREE from 'three';
import { Track } from '../camera.js';
import { Lockup, sequence } from '../type3d.js';
import { FOG, FOG_GLSL } from '../engine.js';
import { makeOcean } from '../ocean.js';
import { makeField } from '../particles.js';
import { phys, place, env, C, dir, step, smooth, mix, mulberry32, lerpEnv } from './kit.js';
import { hits, level } from '../drive.js';

const CLOTH_Y = 0, TEAR = new THREE.Vector3(0, 0, -1402);
export function skyzone(ctx) {
  const group = new THREE.Group();
  const ocean = makeOcean(ctx.sky, { amp: 0.9, chop: 1.1, glint: 1.4, rough: 0.45, deep: C(0.01, 0.025, 0.04), scatter: C(0.02, 0.06, 0.08), mirror: 1 });
  ocean.mesh.position.y = 0; group.add(ocean.mesh);

  /* ---- the braid: six ribbons wound round the line of flight ---- */
  const AX0 = new THREE.Vector3(0, 150, -260), AXLEN = 760;
  const braidU = { ...FOG, uPulse: { value: 0 }, uFade: { value: 1 } };
  const ribbonMat = new THREE.ShaderMaterial({
    uniforms: braidU, side: THREE.DoubleSide, transparent: true, depthWrite: true,
    vertexShader: `varying vec3 vWorld; varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `${FOG_GLSL} uniform float uPulse, uFade, uTime; varying vec3 vWorld; varying vec2 vUv; varying vec3 vN;
      void main(){
        vec3 v = normalize(uCamPos - vWorld);
        float fres = pow(1.0 - abs(dot(v, normalize(vN))), 2.0);
        float fiber = 0.85 + 0.15 * sin(vUv.y * 180.0) * sin(vUv.x * 9.0 + uTime);
        float edge = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
        vec3 col = mix(vec3(0.42, 0.4, 0.55), vec3(1.4, 1.35, 1.6), fres) * fiber * (1.0 + uPulse * 1.5);
        gl_FragColor = vec4(applyFog(col, vWorld), edge * uFade);
      }`,
  });
  const ribbons = [];
  for (let k = 0; k < 6; k++) {
    const N = 600, pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const s = i / N, z = -s * AXLEN;
      const R = 34 * (0.55 + 0.45 * Math.cos(s * Math.PI * 1.4)) + 6;     // tightening, then letting go
      const a = s * Math.PI * 7 + k * Math.PI / 3;
      const c = new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, z);
      const w = 3.2;
      const n = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);               // outward
      const tz = new THREE.Vector3(-Math.sin(a), Math.cos(a), 0).multiplyScalar(R * Math.PI * 7).add(new THREE.Vector3(0, 0, -AXLEN)).normalize();
      const b = new THREE.Vector3().crossVectors(tz, n).normalize();
      pos.push(...c.clone().addScaledVector(b, -w).toArray(), ...c.clone().addScaledVector(b, w).toArray());
      uv.push(s, 0, s, 1);
      if (i < N) { const j = i * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, ribbonMat); m.position.copy(AX0); m.frustumCulled = false; m.renderOrder = 4;
    ribbons.push(m); group.add(m);
  }

  /* ---- the cloth: a plain of fabric with real sheen, breathing in slow folds ---- */
  const clothGeo = new THREE.PlaneGeometry(2600, 2200, 320, 280); clothGeo.rotateX(-Math.PI / 2);
  const clothU = { uTear: { value: 0 } };
  const cloth = phys({ color: C(0.82, 0.78, 0.9), roughness: 0.72, sheen: 1, sheenColor: C(1.0, 0.96, 1.0), sheenRoughness: 0.35 }, 'cloth');
  const prevCompile = cloth.onBeforeCompile;
  cloth.onBeforeCompile = (sh, r) => {
    prevCompile(sh, r);
    Object.assign(sh.uniforms, clothU, { uTime: FOG.uTime });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      uniform float uTime; varying vec3 vClothW;
      // draped cloth: long directional folds with sharper crests, slowly breathing
      float ridge(float x){ return 1.0 - abs(sin(x)); }
      float folds(vec2 p){
        float a = ridge(p.x * 0.018 + p.y * 0.006 + sin(p.y * 0.004) * 1.5 + uTime * 0.12);
        float b = ridge(p.x * -0.011 + p.y * 0.024 + uTime * 0.09);
        return a * a * 9.0 + b * 4.5 + sin(p.x * 0.07 + p.y * 0.05 + uTime * 0.3) * 0.7 + sin(length(p - vec2(0.0, -1300.0)) * 0.018 - uTime * 0.35) * 1.4; }`)
      .replace('#include <beginnormal_vertex>', `
        vec3 pw = (modelMatrix * vec4(position, 1.0)).xyz;
        float e = 1.5, h0 = folds(pw.xz), hx = folds(pw.xz + vec2(e, 0.0)), hz = folds(pw.xz + vec2(0.0, e));
        vec3 objectNormal = normalize(vec3(-(hx - h0) / e, 1.0, -(hz - h0) / e));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3( tangent.xyz );
        #endif`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position); transformed.y += folds(pw.xz); vClothW = pw;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uTear; varying vec3 vClothW;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        vec2 tq = (vClothW.xz - vec2(${TEAR.x.toFixed(1)}, ${TEAR.z.toFixed(1)})) / vec2(18.0 + 60.0 * uTear, 6.0 + 150.0 * uTear);
        float jag = sin(vClothW.z * 0.4) * 0.08 + sin(vClothW.z * 1.3 + 2.0) * 0.04;
        if (uTear > 0.0 && length(tq) < 1.0 + jag) discard;`);
  };
  cloth.customProgramCacheKey = () => 'cloth-folds';
  const clothMesh = new THREE.Mesh(clothGeo, cloth); clothMesh.position.set(0, CLOTH_Y, -1400); clothMesh.receiveShadow = true;
  clothMesh.userData.gpuDisplaced = () => true;   // folds are shaped on the GPU
  group.add(clothMesh);
  const under = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2200), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  under.rotation.x = -Math.PI / 2; under.position.set(0, CLOTH_Y - 60, -1400); group.add(under);

  /* ---- flounders: flat fish gliding over the cloth, undulating along the body ---- */
  const rnd = mulberry32(42), NF = 46;
  const fishGeo = new THREE.PlaneGeometry(1, 1, 24, 12); fishGeo.rotateX(-Math.PI / 2);
  const fishU = { ...FOG, uTimeF: FOG.uTime };
  const fishMat = new THREE.ShaderMaterial({
    uniforms: fishU, transparent: true, side: THREE.DoubleSide,
    vertexShader: `attribute vec4 aFish; uniform float uTime; varying vec2 vUv; varying vec3 vWorld; varying float vSeed;
      void main(){
        vUv = uv; vSeed = aFish.w;
        vec3 p = position;
        float ph = uTime * (2.0 + aFish.w * 2.0) - uv.x * 6.0;
        p.y += sin(ph) * 0.12 * (0.3 + uv.x);                          // the undulation runs nose to tail
        vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
        vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `${FOG_GLSL} varying vec2 vUv; varying vec3 vWorld; varying float vSeed;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec2 q = vUv - vec2(0.45, 0.5);
        float body = length(q * vec2(1.25, 1.9));
        float tail = step(0.78, vUv.x) * step(abs(q.y), (vUv.x - 0.78) * 1.4 + 0.04) * step(vUv.x, 0.98);
        float a = max(smoothstep(0.5, 0.47, body), tail);
        if (a < 0.01) discard;
        vec2 cell = floor(vUv * vec2(18.0, 10.0)); float spot = step(0.78, hash(cell + vSeed * 9.0));
        vec3 col = mix(vec3(0.5, 0.45, 0.42), vec3(0.78, 0.72, 0.66), 0.5 + 0.5 * sin(vUv.x * 30.0 + vSeed * 6.0) * 0.3) * (1.0 - spot * 0.35);
        float fringe = smoothstep(0.38, 0.48, body) * (1.0 - tail);
        col = mix(col, vec3(0.85, 0.8, 0.78), fringe * 0.5);
        gl_FragColor = vec4(applyFog(col, vWorld), a);
      }`,
  });
  const fishes = new THREE.InstancedMesh(fishGeo, fishMat, NF); fishes.frustumCulled = false;
  const fishData = [];
  for (let i = 0; i < NF; i++) fishData.push({ x: (rnd() - 0.5) * 240, z: -1000 - rnd() * 420, s: 6 + rnd() * 9, h: rnd() * 6.3, v: 2 + rnd() * 4, w: rnd() });
  fishes.geometry.setAttribute('aFish', new THREE.InstancedBufferAttribute(new Float32Array(fishData.flatMap((f) => [0, 0, 0, f.w])), 4));
  group.add(fishes);

  const wind = makeField({ count: 5000, box: [160, 60, 220], size: 0.07, color: C(1, 0.97, 1.0), opacity: 0.6, vel: [-4, 0.5, 2], turb: 1.4, twinkle: 0.3 });
  group.add(wind.mesh);

  /* ---- camera ---- */
  const track = new Track([
    { t: 62.5, p: [0, -2, 0], l: [0, 80, -40], fov: 58, cut: true },
    { t: 63.2, p: [0, 34, -55], l: [0, 250, -700], fov: 52 },
    { t: 64.8, p: [0, 112, -210], l: [0, 230, -760], fov: 50 },
    { t: 65.4, p: [0, 150, -262], l: [0, 150, -420], fov: 56, roll: 0 },
    { t: 67.1, p: [0, 150, -520], l: [0, 150, -700], fov: 58, roll: -200 },
    { t: 68.8, p: [0, 150, -780], l: [0, 150, -960], fov: 58, roll: -360 },
    { t: 70.0, p: [0, 80, -960], l: [0, 20, -1130], fov: 52, roll: -360 },
    { t: 72.0, p: [0, 44, -1040], l: [0, 8, -1200], fov: 48, roll: -360 },
    { t: 75.0, p: [4, 28, -1150], l: [8, 6, -1310], fov: 46, roll: -360 },
    { t: 78.2, p: [0, 22, -1270], l: [0, 2, -1400], fov: 48, roll: -360 },
    { t: 79.6, p: [0, 14, -1368], l: [0, -40, -1404], fov: 56, roll: -360 },
    { t: 80.3, p: [0, -26, -1402], l: [0, -120, -1412], fov: 62, roll: -360, up: [0, 0, -1] },
  ]);

  /* ---- the lines ---- */
  const white = C(0.95, 0.94, 0.98);
  const L6 = new Lockup(ctx.line('L6'), '^sky ~writes / _my ^writ').fx('write', [0, 0, 0, 0], 0.0);
  place(L6, track, 63.9, { dist: 640, dy: 0.12, fill: 0.72 });
  L6.color(white); L6.set('uIntensity', 2.4); L6.set('uFogMul', 0.15); L6.set('uHalo', 0.0); L6.set('uThin', -0.06);
  // the bound line: one word at a time, carried on the braid as we spiral through it
  const L7 = [0, 1, 2, 3, 4].map((i) => {
    const lk = new Lockup(ctx.line('L7'), [['~wrists'], ['^bound'], ['~gagged'], ['utterance'], ['mutterings']][i][0], { words: [i, i + 1] }).fx('flip', [0, 0, 0, 0], 0.5);
    const w = lk.words[0];
    place(lk, track, w.start, { dist: 110, dx: [-0.24, 0.24, -0.22, 0.22, 0][i], dy: [0.2, -0.18, -0.16, 0.18, 0][i], fill: 0.32 });
    lk.color(white); lk.set('uIntensity', 1.9); lk.set('uFogMul', 0.3);
    return lk;
  });
  const L8a = new Lockup(ctx.line('L8'), 'blanket / ^statements ~abound', { words: [0, 3] }).fx('unfold', [1, 0, 0, 0], 0.45);
  place(L8a, track, 71.0, { dist: 140, dy: -0.03, dx: -0.05, fill: 0.5, plane: 'floor', tilt: 62, lift: 16 });
  const L8b = new Lockup(ctx.line('L8'), '_as _the ~suffering', { words: [3, 6] }).fx('unfold', [1, 0, 0, 0], 0.45);
  place(L8b, track, 74.4, { dist: 120, dy: -0.02, fill: 0.5, plane: 'floor', tilt: 62, lift: 14 });
  const L8c = new Lockup(ctx.line('L8'), '^flounders', { words: [6, 7] }).fx('drop', [0, 0, 0, 0], 0.4);
  place(L8c, track, 77.0, { dist: 105, dy: -0.06, fill: 0.58, plane: 'floor', tilt: 58, lift: 13 });
  for (const l of [L8a, L8b, L8c]) { l.color(C(0.98, 0.96, 1.0)); l.set('uIntensity', 1.6); }
  L7[0].after(L6.words[L6.words.length - 1].start);
  sequence(L7, 0);
  L6.exit(L7[0].words[0].from - 0.05, L7[0].words[0].from + 0.08);
  sequence([L8a, L8b, L8c]);
  const lockups = [L6, ...L7, L8a, L8b, L8c];
  for (const l of lockups) group.add(l.group);

  const sunDir = dir(-35, 12);
  const E = {
    gain: 1.6,
    zenith: C(0.38, 0.46, 0.8), horizon: C(1.2, 1.1, 1.14), ground: C(0.6, 0.62, 0.7), horizonPow: 0.6,
    sunDir, sunColor: C(3.0, 2.6, 2.3), sunSky: C(2.0, 1.7, 1.4), sunSize: 0.0008, sunGlow: 1.0, sunCore: 26, bands: 1,
    fog: C(0.92, 0.88, 0.96), fogSun: C(1.5, 1.3, 1.15), fogSunPow: 6, density: 0.0006, falloff: 0.0025,
    sunI: 4.0, hemiI: 1.3, hemiSky: C(0.6, 0.65, 0.9), hemiGround: C(0.55, 0.5, 0.55), shadowFocus: 80,
  };
  const Edark = { ...E, sunI: 0.2, hemiI: 0.05, horizon: C(0.02, 0.02, 0.03), zenith: C(0.0, 0.0, 0.01), fog: C(0.0, 0.0, 0.0), fogSun: C(0, 0, 0), density: 0.02, falloff: 0 };
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), pp = new THREE.Vector3(), ss = new THREE.Vector3();
  return {
    name: 'the sky', t0: 62.5, t1: 80.3, group, track, lockups, blurDepth: 30,
    env(t, c) { env(c, lerpEnv(E, Edark, step(t, 79.4, 80.2))); },
    update(t) {
      ocean.mesh.visible = t < 68.5;
      braidU.uPulse.value = Math.min(1.2, hits(t, 0.18, 0.5));
      braidU.uFade.value = step(t, 64.6, 65.4) * (1 - step(t, 69.0, 70.4));
      for (const r of ribbons) { r.visible = t > 64.4 && t < 70.6; r.scale.set(1 + (t > 68.8 ? (t - 68.8) * 0.6 : 0), 1 + (t > 68.8 ? (t - 68.8) * 0.6 : 0), 1); }
      clothMesh.visible = under.visible = t > 67.5;
      clothU.uTear.value = step(t, 78.6, 80.0);
      fishes.visible = t > 68;
      fishData.forEach((f, i) => {
        const a = f.h + Math.sin(t * 0.2 + f.w * 6) * 0.6;
        pp.set(f.x + Math.cos(a) * f.v * (t - 68), 10 + Math.sin(t * 1.3 + f.w * 9) * 1.2, f.z + Math.sin(a) * f.v * (t - 68));
        qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a);
        ss.set(f.s, f.s, f.s * 0.72);
        m4.compose(pp, qq, ss); fishes.setMatrixAt(i, m4);
      });
      fishes.instanceMatrix.needsUpdate = true;
      wind.u.uOpacity.value = 0.3 + 0.5 * level(t);
    },
    post(t, P) {
      P.exposure = 1.35; P.bloom = 0.5; P.bloomThreshold = 1.9; P.rays = 0.4; P.vignette = 0.32; P.contrast = 1.07; P.saturation = 1.08;
      P.veilColor.setRGB(0.95, 0.98, 1); P.veil = 1 - step(t, 62.5, 62.68);
      if (t > 79.9) { P.veilColor.setRGB(0, 0, 0); P.veil = step(t, 79.9, 80.3); }
    },
  };
}
