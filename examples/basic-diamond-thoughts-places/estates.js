/* 2:22.7–2:33.1 — BURIED ESTATES / THE DOUGH. The music slams back: fast and low
   over a sea of houses buried in pale sand to their roofs; the line rises out of
   the sand. Then the sand softens into pastel dough that kneads itself, strewn
   with crescent clippings; the line is pressed into it. A fold of dough rises and
   closes over us. */
import * as THREE from 'three';
import { Track } from '../camera.js';
import { Lockup, sequence } from '../type3d.js';
import { FOG } from '../engine.js';
import { std, terrain, place, env, C, dir, step, mix, fbm, mulberry32, lerpEnv, scatter } from './kit.js';
import { level, hits } from '../drive.js';

export function estates(ctx) {
  const group = new THREE.Group();
  const T0 = 142.7, T1 = 153.1;
  const pathX = (z) => Math.sin(z * 0.003) * 70;
  const sandH = (x, z) => {
    let d = 1 - Math.abs(fbm(x * 0.004 + 1.3, z * 0.004, 4)); d = Math.pow(d, 2.2) * 20;
    return d * (1 - 0.6 * Math.exp(-Math.pow((x - pathX(z)) / 90, 2))) + fbm(x * 0.02, z * 0.02, 2) * 1.5;
  };
  const doughU = { uDough: { value: 0 }, uKnead: { value: 0 } };
  const ground = std({ color: C(0.92, 0.88, 0.85), roughness: 0.95 }, 'estates');
  const pg = ground.onBeforeCompile;
  ground.onBeforeCompile = (sh, r) => {
    pg(sh, r);
    Object.assign(sh.uniforms, doughU, { uTime: FOG.uTime });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uDough, uKnead, uTime; varying vec3 vDW;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 dw = (modelMatrix * vec4(position, 1.0)).xyz; vDW = dw;
        float kn = sin(dw.x * 0.05 + uTime * 1.6) * sin(dw.z * 0.04 - uTime * 1.2) * 4.0 + sin(length(dw.xz) * 0.03 - uTime * 2.0) * 2.5;
        transformed.y = mix(transformed.y, transformed.y * 0.45 + kn + 6.0, uKnead);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uDough; varying vec3 vDW;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 pastel = mix(vec3(0.98, 0.78, 0.84), vec3(0.8, 0.76, 1.0), 0.5 + 0.5 * sin(vDW.x * 0.004 + vDW.z * 0.003));
        pastel = mix(pastel, vec3(1.0, 0.88, 0.74), 0.5 + 0.5 * sin(vDW.z * 0.006 - 1.0) * 0.6);
        diffuseColor.rgb = mix(diffuseColor.rgb, pastel, uDough);`);
  };
  ground.customProgramCacheKey = () => 'estates-dough';
  const land = terrain(sandH, { x0: -900, x1: 900, z0: -1400, z1: 200, nx: 300, nz: 300 }, ground);
  group.add(land);
  land.userData.gpuDisplaced = (t) => t > 147.2;   // the dough is shaped on the GPU; a CPU raycast would test the wrong surface
  // houses buried to their roofs
  const rnd = mulberry32(88);
  const wall = std({ color: C(0.8, 0.76, 0.74), roughness: 0.9 }, 'house');
  const roofM = std({ color: C(0.24, 0.22, 0.25), roughness: 0.7 }, 'roof');
  const N = 260, bodies = [], roofs = [];
  const houseSpot = () => {
    const z = 80 - rnd() * 1250;
    let x; do { x = pathX(z) + (rnd() - 0.5) * 560; } while (Math.abs(x - pathX(z)) < 72);   // the flight lane stays clear: houses line it
    return { x, z, y: sandH(x, z) - rnd() * 6, s: 0.8 + rnd() * 0.7, a: rnd() * 6.3 };
  };
  const spots = []; for (let i = 0; i < N; i++) spots.push(houseSpot());
  const roofGeo = new THREE.CylinderGeometry(0.01, 6.5, 4.5, 4, 1); roofGeo.rotateY(Math.PI / 4); roofGeo.scale(1, 1, 1.5);
  const bodiesM = scatter(new THREE.BoxGeometry(9, 7, 13), wall, N, (i, p, q, s) => { const h = spots[i]; p.set(h.x, h.y, h.z); q.setFromEuler(new THREE.Euler(0, h.a, 0)); s.setScalar(h.s); });
  const roofsM = scatter(roofGeo, roofM, N, (i, p, q, s) => { const h = spots[i]; p.set(h.x, h.y + 3.5 * h.s + 2.2 * h.s, h.z); q.setFromEuler(new THREE.Euler(0, h.a, 0)); s.setScalar(h.s); });
  bodiesM.castShadow = roofsM.castShadow = true; bodiesM.receiveShadow = true;
  group.add(bodiesM, roofsM);
  // crescent clippings
  const crescent = new THREE.TorusGeometry(1, 0.16, 6, 24, Math.PI * 0.9);
  const clipMat = std({ color: C(1, 0.86, 0.9), roughness: 0.4, emissive: C(0.12, 0.08, 0.1) }, 'clip');
  const clips = scatter(crescent, clipMat, 700, (i, p, q, s) => {
    const z = -380 - rnd() * 900, x = pathX(z) + (rnd() - 0.5) * 340;
    p.set(x, sandH(x, z) * 0.45 + 6.5, z); q.setFromEuler(new THREE.Euler(Math.PI / 2 + (rnd() - 0.5) * 0.4, 0, rnd() * 6.3)); s.setScalar(1.5 + rnd() * 3);
  });
  const clipColors = [[1, 0.8, 0.86], [0.82, 0.78, 1], [1, 0.9, 0.74], [0.8, 0.95, 0.9]];
  for (let i = 0; i < 700; i++) clips.setColorAt(i, new THREE.Color(...clipColors[i % 4]));
  group.add(clips);

  // camera: fast and low over the roofs, banking; generated so it clears them
  const keys = [];
  for (let t = T0; t <= T1 + 0.01; t += 0.5) {
    const s = t - T0, z = 120 - s * 52, x = pathX(z);
    let h = 0; for (let dz = 0; dz <= 80; dz += 20) h = Math.max(h, sandH(x, z - dz));
    const y = h + (t < 147 ? 22 : 24) - (t > 152.2 ? (t - 152.2) * 30 : 0);
    const z2 = z - 90, x2 = pathX(z2);
    keys.push({ t, p: [x, y, z], l: [x2, (t > 152.2 ? y - 40 : mix(sandH(x2, z2) + 6, y + 4, t < 147.9 ? 1 : 0.4)), z2], fov: 54, roll: Math.sin(s * 0.8) * 10 });
  }
  keys[0].cut = true;
  const track = new Track(keys);

  const L21 = new Lockup(ctx.line('L21'), 'Buried _all / ~fortunate future / ^estates ~well').fx('rise', [0.4, 0, 0, 0], 0.5);
  place(L21, track, 145.7, { dist: 210, dy: 0.2, fill: 0.46 });
  L21.color(C(0.98, 0.95, 0.92)); L21.set('uIntensity', 1.6);
  const L22a = new Lockup(ctx.line('L22'), '~kneading _the / ^dough', { words: [0, 3] }).fx('pop', [0, 0, 0, 0], 0.4);
  place(L22a, track, 148.5, { dist: 110, dy: -0.06, fill: 0.46 });
  const L22b = new Lockup(ctx.line('L22'), '~with !pastel / ~fingernail ^clippings', { words: [3, 7] }).fx('pop', [0, 0, 0, 0], 0.45);
  place(L22b, track, 150.8, { dist: 120, dy: 0.08, fill: 0.62 });
  for (const l of [L22a, L22b]) { l.color(C(1.0, 0.97, 1.0), C(1.3, 0.85, 1.05)); l.set('uIntensity', 1.7); }
  sequence([L21, L22a, L22b], 0);
  // 'well' and 'kneading' are sung 0.16 s apart: the dough line takes a short entrance so 'well' is still whole when sung
  { const w = L22a.words[0]; w.rise = 0.1; w.from = w.lit - 0.1; L21.exit(w.from - 0.0, w.from + 0.1); }
  const lockups = [L21, L22a, L22b];
  for (const l of lockups) group.add(l.group);

  const E = {
    gain: 1.5,
    zenith: C(0.3, 0.34, 0.6), horizon: C(1.1, 1.0, 1.0), ground: C(0.7, 0.66, 0.66), horizonPow: 0.5,
    sunDir: dir(60, 20), sunColor: C(3.2, 2.7, 2.3), sunSky: C(2, 1.7, 1.4), sunSize: 0.0008, sunGlow: 1, sunCore: 22,
    fog: C(0.95, 0.88, 0.9), fogSun: C(1.5, 1.25, 1.1), fogSunPow: 6, density: 0.0014, falloff: 0.006,
    sunI: 4, hemiI: 1.5, hemiSky: C(0.7, 0.7, 0.95), hemiGround: C(0.55, 0.5, 0.5), shadowFocus: 70,
  };
  const Ed = { ...E, zenith: C(0.4, 0.34, 0.6), horizon: C(1.15, 0.95, 1.05), fog: C(1.05, 0.88, 0.98), fogSun: C(1.6, 1.2, 1.2), hemiSky: C(0.95, 0.8, 1.0) };
  return {
    name: 'buried estates', t0: T0, t1: T1, group, track, lockups, blurDepth: 22,
    env(t, c) { env(c, lerpEnv(E, Ed, step(t, 146.8, 148.2))); },
    update(t) {
      doughU.uDough.value = step(t, 146.8, 148.2); doughU.uKnead.value = step(t, 147.2, 148.6);
      bodiesM.visible = roofsM.visible = t < 148.8;
      clips.visible = t > 147.4;
    },
    post(t, P) {
      P.exposure = 1.2; P.bloom = 0.55; P.bloomThreshold = 1.6; P.rays = 0.4; P.vignette = 0.36; P.contrast = 1.07; P.saturation = 1.08;
      P.veilColor.setRGB(1, 0.98, 0.95); P.veil = 1 - step(t, T0, T0 + 0.35);
      if (t > 152.6) { P.veilColor.setRGB(0.25, 0.16, 0.22); P.veil = step(t, 152.6, 153.1); }
    },
  };
}
