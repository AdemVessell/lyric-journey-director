/* 1:20.3–1:28.4 — DEEPER. Through the tear, straight down a stratified shaft whose
   mineral veins glow; the line lies across the shaft at successive depths and we
   dive through each word just after it is sung. The shaft opens into a cavern of
   wandering lights; the camera pitches up and levels out (the floor of the dive
   becomes the wall we fly past); "further careless wonderings" gathers among the
   wisps; a bright opening waits in the far wall. Built twice — the chorus comes
   back — so it takes a variant: 'stone' or 'crystal'. */
import * as THREE from 'three';
import { Track } from '../camera.js';
import { Lockup, sequence } from '../type3d.js';
import { FOG, FOG_GLSL } from '../engine.js';
import { makeField } from '../particles.js';
import { std, phys, place, env, C, step, mix, fbm, mulberry32, lerpEnv, scatter } from './kit.js';
import { level, hits } from '../drive.js';

export function depths(ctx, o) {
  const { t0, t1, lines: [LA, LB], variant = 'stone' } = o;
  const T = (x) => t0 + (x - 80.3);                   // all times authored against the first chorus
  const group = new THREE.Group();
  const crystal = variant === 'crystal';

  // the shaft: an open cylinder seen from inside, strata in vertex colour, glowing veins
  const sg = new THREE.CylinderGeometry(70, 70, 520, 96, 180, true);
  sg.translate(0, -260, 0);
  const sp = sg.attributes.position, cols = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < sp.count; i++) {
    v.fromBufferAttribute(sp, i);
    const a = Math.atan2(v.z, v.x);
    const k = 1 + 0.18 * fbm(Math.cos(a) * 2 + 4, v.y * 0.02, 4) + 0.06 * fbm(a * 5, v.y * 0.1, 3);
    sp.setXYZ(i, v.x * k, v.y, v.z * k);
    const band = 0.5 + 0.5 * Math.sin(v.y * 0.09 + fbm(a, v.y * 0.01, 2) * 3);
    const c = crystal ? [0.16 + band * 0.1, 0.16 + band * 0.12, 0.24 + band * 0.18] : [0.1 + band * 0.16, 0.095 + band * 0.13, 0.11 + band * 0.16];
    cols.push(...c);
  }
  sg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  sg.computeVertexNormals();
  const shaftMat = std({ vertexColors: true, roughness: crystal ? 0.25 : 0.85, metalness: crystal ? 0.2 : 0, side: THREE.BackSide }, 'shaft' + variant);
  const veinsU = { uVein: { value: crystal ? 2.2 : 1.4 } };
  const prev = shaftMat.onBeforeCompile;
  shaftMat.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    Object.assign(sh.uniforms, veinsU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObj; uniform float uVein;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float a = atan(vObj.z, vObj.x);
        float vn = abs(sin(vObj.y * 0.31 + sin(a * 3.0 + vObj.y * 0.05) * 2.2) * sin(a * 7.0 + vObj.y * 0.02));
        float vein = smoothstep(0.035, 0.0, vn);
        totalEmissiveRadiance += mix(vec3(0.45, 0.3, 0.9), vec3(0.2, 0.75, 0.85), 0.5 + 0.5 * sin(vObj.y * 0.013)) * vein * uVein;`);
  };
  shaftMat.customProgramCacheKey = () => 'shaft-' + variant;
  const shaft = new THREE.Mesh(sg, shaftMat); group.add(shaft);

  // the cavern: an ellipsoid seen from inside, its walls pushed out of round
  const C0 = new THREE.Vector3(0, -640, -380), RAD = new THREE.Vector3(360, 190, 470);
  const cg = new THREE.IcosahedronGeometry(1, 6), cp = cg.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    v.fromBufferAttribute(cp, i);
    const k = 1 + 0.22 * fbm(v.x * 2.2 + 9, v.z * 2.2 + v.y * 1.3, 5);
    cp.setXYZ(i, C0.x + v.x * RAD.x * k, C0.y + v.y * RAD.y * k, C0.z + v.z * RAD.z * k);
  }
  cg.computeVertexNormals();
  const rock = crystal ? phys({ color: C(0.3, 0.3, 0.42), roughness: 0.18, metalness: 0.1, clearcoat: 1 }, 'cavern-x') : std({ color: C(0.13, 0.12, 0.14), roughness: 0.9 }, 'cavern');
  rock.side = THREE.BackSide;
  group.add(new THREE.Mesh(cg, rock));
  const rnd = mulberry32(crystal ? 71 : 17);
  // hanging formations (or crystals) from the cavern roof and floor
  const fg = crystal ? new THREE.OctahedronGeometry(1, 0) : new THREE.ConeGeometry(1, 1, 7);
  const fm = crystal ? phys({ color: C(0.95, 0.95, 1), transmission: 1, ior: 2.2, dispersion: 3, roughness: 0.03, thickness: 6 }, 'cav-gem') : rock;
  group.add(scatter(fg, fm, crystal ? 260 : 360, (i, p, q, s) => {
    const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 0.85, up = rnd() < 0.55;
    p.set(C0.x + Math.cos(a) * r * RAD.x, C0.y + (up ? 1 : -1) * RAD.y * Math.sqrt(1 - r * r) * 0.92, C0.z + Math.sin(a) * r * RAD.z);
    const h = 20 + rnd() * (crystal ? 70 : 120);
    q.setFromEuler(new THREE.Euler(up ? Math.PI : 0, rnd() * 6.3, (rnd() - 0.5) * 0.3));
    s.set(h * (crystal ? 0.25 : 0.12), h, h * (crystal ? 0.25 : 0.12));
  }));
  // the opening in the far wall
  const exit = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 12, 10) }));
  exit.position.set(20, -600, -842); exit.scale.set(60, 40, 1); group.add(exit);
  // wandering lights: points that drift, and a few real lights that light the walls
  const wisps = makeField({ count: 900, box: [500, 240, 600], size: 0.9, color: crystal ? C(1.2, 1.0, 2.2) : C(0.7, 1.6, 1.8), opacity: 1, vel: [0, 0.2, 0], turb: 14, spark: 1, twinkle: 0.5 });
  wisps.u.uCenter.value.set(0, 0, -150); group.add(wisps.mesh);
  const lights = [];
  for (let i = 0; i < 5; i++) { const L = new THREE.PointLight(i % 2 ? 0x9a7bff : 0x6fe0f0, 0, 600, 1.4); group.add(L); lights.push(L); }
  // a lamp that falls with us down the shaft, so the walls rush past
  const lamp = new THREE.PointLight(0xd8d0ff, 0, 220, 1.2); group.add(lamp);

  const track = new Track([
    { t: T(80.3), p: [0, -2, 0], l: [0, -100, -8], fov: 62, up: [0, 0, -1], cut: true },
    { t: T(81.4), p: [0, -70, -1], l: [0, -300, -8], fov: 60, up: [0.5, 0, -0.85] },
    { t: T(82.5), p: [0, -150, -3], l: [0, -380, -20], fov: 60, up: [1, 0, -0.25] },
    { t: T(83.5), p: [2, -330, -20], l: [8, -520, -230], fov: 58, up: [0.4, 1, 0] },
    { t: T(84.6), p: [8, -490, -150], l: [16, -600, -440], fov: 54, up: [0, 1, 0] },
    { t: T(86.2), p: [14, -596, -400], l: [20, -600, -700], fov: 52 },
    { t: T(87.7), p: [18, -600, -650], l: [20, -600, -900], fov: 50 },
    { t: T(88.4), p: [20, -600, -800], l: [20, -600, -1000], fov: 56 },
  ]);

  // the first line: one word per depth, each placed where the dive will be when it is sung
  const marks = [['^Deeper', 0.55], ['~than', 0.3], ['~my', 0.28], ['^mind', 0.62]];
  const wordsA = LA.words.map((w, i) => {
    const lk = new Lockup(LA, marks[i][0].replace(/Deeper/, w.text).replace(/than|my|mind/, w.text), { words: [i, i + 1] }).fx('pop', [0, 0, 0, 0], 0.4);
    place(lk, track, w.start, { dist: 120, fill: marks[i][1] * 0.55, dx: [-0.16, 0.2, -0.2, 0.08][i], dy: [0.24, 0.05, -0.12, -0.3][i] });
    lk.idx = i;
    return lk;
  });
  // each word leaves as the next starts to arrive: sung 0.26 s apart, they cannot share the frame
  sequence(wordsA, 0);
  const lastA = wordsA[wordsA.length - 1];
  lastA.exit(lastA.words[0].end + 0.4, lastA.words[0].end + 0.9);
  wordsA.forEach((lk) => {
    lk.color(C(0.95, 0.94, 1.0)); lk.set('uIntensity', 2.0); lk.set('uFogMul', 0.2);
  });
  const LBk = new Lockup(LB, 'further / ^careless ~' + LB.words[2].text).fx('assemble', [0, 0, 0, 0], 0.5, 10);
  place(LBk, track, LB.words[1].start, { dist: 165, fill: 0.38, dx: -0.1, dy: 0.04 });
  LBk.color(crystal ? C(0.92, 0.88, 1.15) : C(0.85, 1.0, 1.05)); LBk.set('uIntensity', 1.9); LBk.set('uFogMul', 0.25);
  const lockups = [...wordsA, LBk];
  for (const l of lockups) group.add(l.group);

  const E = {
    zenith: C(0.0, 0.0, 0.0), horizon: C(0.012, 0.01, 0.02), ground: C(0, 0, 0),
    sunDir: new THREE.Vector3(0.03, 0.02, -1).normalize(), sunColor: C(1.2, 1.0, 0.85), sunSky: C(0, 0, 0), sunSize: 0, sunGlow: 0, sunCore: 0,
    fog: C(0.012, 0.009, 0.022), fogSun: C(0.5, 0.42, 0.36), fogSunPow: 10, density: 0.0028, falloff: 0.0,
    sunI: 0.6, hemiI: 0.12, hemiSky: C(0.3, 0.3, 0.5), hemiGround: C(0.05, 0.04, 0.06),
  };
  const Eout = { ...E, fog: C(0.6, 0.55, 0.5), fogSun: C(2.5, 2.2, 1.8), density: 0.004 };
  return {
    name: crystal ? 'deeper (crystal)' : 'deeper', t0, t1, group, track, lockups, blurDepth: 18,
    env(t, c) { env(c, lerpEnv(E, Eout, step(t, T(87.4), T(88.4)))); },
    update(t) {
      lights.forEach((L, i) => {
        L.position.set(Math.sin(t * 0.37 + i * 1.7) * 200, -600 + Math.sin(t * 0.53 + i) * 70, -380 + Math.cos(t * 0.29 + i * 2.1) * 260);
        L.intensity = (9e4 + 6e4 * level(t)) * step(t, T(82.2), T(83.2));
      });
      const P0 = track.eval(t), fwd = P0.look.clone().sub(P0.pos).normalize();
      lamp.position.copy(P0.pos).addScaledVector(fwd, 40);
      lamp.intensity = 6e3 * (1 - step(t, T(83.0), T(83.6)));
      wisps.u.uOpacity.value = 0.6 + 0.6 * level(t) + Math.min(1, hits(t, 0.2, 0.6));
      exit.material.color.setScalar(10 + 6 * step(t, T(86.5), T(88.4)));
    },
    post(t, P) {
      P.exposure = 1.3; P.bloom = 0.8; P.bloomThreshold = 0.9; P.rays = 0.9; P.raysDecay = 0.97; P.vignette = 0.55; P.contrast = 1.08;
      P.veilColor.setRGB(0, 0, 0); P.veil = 1 - step(t, T(80.3), T(80.7));
      if (t > T(87.8)) { P.veilColor.setRGB(1, 0.97, 0.92); P.veil = step(t, T(87.8), T(88.4)); }
    },
  };
}
