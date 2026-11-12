/* 2:51.5–3:11.04 — THE BLOOMING WHALE. The outro is the loudest passage of the
   song, so it is the climax: back on the coast, flowers open along the whale's
   body in a wave from tail to head and spread across the shore, backlit gold. We
   come in low over the dunes, rise along its length, circle its head and pull
   away high; on the final hit, black, and the title. */
import * as THREE from 'three';
import { Track } from '../camera.js';
import { Lockup } from '../type3d.js';
import { FOG } from '../engine.js';
import { Reflector } from 'three/addons/Reflector.js';
import { makeWhale } from './whale.js';
import { makeFlowers } from '../flowers.js';
import { makeFlakes } from '../flakes.js';
import { ground } from './coast.js';
import { std, terrain, place, env, C, dir, step, mix, mulberry32, lerpEnv, fakeLine } from './kit.js';
import { level } from '../drive.js';

export function finale(ctx) {
  const group = new THREE.Group();
  const T0 = 171.5, T1 = 191.1, HIT = 189.6;
  const sand = std({ color: C(0.93, 0.9, 0.88), roughness: 0.96 }, 'sand');
  group.add(terrain(ground, { x0: -950, x1: 950, z0: -1450, z1: -230, nx: 300, nz: 240 }, sand));
  const flat = new THREE.Mesh(new THREE.PlaneGeometry(2600, 1500), std({ color: C(0.5, 0.47, 0.48), roughness: 0.25, metalness: 0.2 }, 'wetflat'));
  flat.rotation.x = -Math.PI / 2; flat.position.set(0, 0.05, 460); group.add(flat);
  const whale = makeWhale({ length: 170, radius: 17 });
  whale.position.set(0, 6, -250); whale.rotation.y = 0.04; group.add(whale);
  whale.updateMatrixWorld(true);

  // flowers on the whale's body: sampled from its own surface, each facing out along
  // the surface normal, opening in a wave from tail (-x) to head (+x)
  const rnd = mulberry32(2024);
  const body = whale.children[0], bp = body.geometry.attributes.position, bn = body.geometry.attributes.normal;
  const spots = [];
  const p = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(body.matrixWorld);
  for (let i = 0; i < 2600; i++) {
    const k = Math.floor(rnd() * bp.count);
    p.fromBufferAttribute(bp, k).applyMatrix4(body.matrixWorld); n.fromBufferAttribute(bn, k).applyMatrix3(nm).normalize();
    if (p.y < 2) { i--; continue; }
    const u = (p.x + 85) / 170;
    spots.push({ p: p.clone().addScaledVector(n, 0.3), n: n.clone(), s: 1.8 + rnd() * 3.4, t: 173.0 + u * 9 + rnd() * 0.8 });
  }
  // and across the shore and dunes, spreading outward from the whale
  for (let i = 0; i < 4200; i++) {
    const a = rnd() * 6.28, r = 30 + Math.pow(rnd(), 0.8) * 520;
    const x = Math.cos(a) * r * 1.3, z = -250 + Math.sin(a) * r;
    const y = z < -300 ? ground(x, z) : 0.2;
    spots.push({ p: new THREE.Vector3(x, y + 0.3, z), s: 1.6 + rnd() * 3.8, t: 176 + r / 520 * 9 + rnd() * 0.6 });
  }
  const flowers = makeFlowers(spots, { petals: 7, glow: 1.0, palette: [[1.35, 1.3, 1.45], [1.05, 0.82, 1.55], [1.5, 1.05, 1.25], [1.5, 1.25, 0.85]] });
  group.add(flowers.mesh);
  const petals = makeFlakes({ count: 2400, box: [240, 120, 300], size: 1.3, vel: [6, 4, 10], spin: 4, turb: 4, shape: 'petal', color: C(1.4, 1.2, 1.4), color2: C(1.2, 0.9, 1.5), glow: 0.6 });
  group.add(petals.mesh);

  const track = new Track([
    { t: T0, p: [-40, 26, -620], l: [-20, 18, -380], fov: 56, cut: true },
    { t: 174.5, p: [-60, 22, -420], l: [-80, 14, -260], fov: 54 },
    { t: 177.5, p: [-120, 30, -300], l: [-60, 18, -250], fov: 52, roll: -8 },
    { t: 180.5, p: [-60, 44, -196], l: [20, 22, -250], fov: 50, roll: -4 },
    { t: 183.5, p: [40, 52, -190], l: [90, 18, -250], fov: 50, roll: 4 },
    { t: 186.0, p: [140, 64, -230], l: [70, 16, -260], fov: 52, roll: 10 },
    { t: 188.0, p: [170, 130, -330], l: [40, 10, -250], fov: 54, roll: 6 },
    { t: 189.6, p: [190, 230, -420], l: [20, 0, -250], fov: 56, roll: 0 },
    { t: T1, p: [190, 250, -430], l: [20, 0, -250], fov: 56 },
  ]);
  // the end card, on black after the last hit
  const title = new Lockup(fakeLine([['BASIC', 189.9, 192], ['DIAMOND', 190.05, 192], ['THOUGHTS', 190.2, 192]]), 'BASIC DIAMOND / THOUGHTS', { tracking: 0.16, lead: 1.25 });
  title.fx('condense', [0, 0, 0, 0], 0.6);
  title.words.forEach((w) => { w.rise = 0.6; w.from = w.lit - 0.6; });
  place(title, track, 190.5, { dist: 60, fill: 0.5 });
  title.set('uIntensity', 2.2); title.set('uFogMul', 0); title.set('uHalo', 0);
  group.add(title.group);

  const sunDir = dir(-170, 9);
  const E = {
    gain: 1.5,
    zenith: C(0.25, 0.24, 0.5), horizon: C(1.25, 1.0, 0.95), ground: C(0.7, 0.62, 0.62), horizonPow: 0.5,
    sunDir, sunColor: C(3.4, 2.4, 1.6), sunSky: C(2.6, 1.7, 1.1), sunSize: 0.0013, sunGlow: 1.6, sunCore: 26, bands: 1,
    fog: C(1.0, 0.86, 0.88), fogSun: C(1.9, 1.35, 0.95), fogSunPow: 5, density: 0.0011, falloff: 0.007,
    sunI: 4, hemiI: 1.5, hemiSky: C(0.75, 0.66, 0.95), hemiGround: C(0.6, 0.5, 0.5), shadowFocus: 110,
  };
  return {
    name: 'the blooming whale', t0: T0, t1: T1, group, track, lockups: [title], blurDepth: 32,
    env(t, c) {
      // after the last hit the world is gone: black sky, black fog, the title alone
      env(c, t < HIT ? E : { ...E, gain: 1, zenith: C(0, 0, 0), horizon: C(0, 0, 0), ground: C(0, 0, 0), fog: C(0, 0, 0), fogSun: C(0, 0, 0), sunSky: C(0, 0, 0), sunGlow: 0, sunCore: 0, sunI: 0, hemiI: 0 });
    },
    update(t) {
      petals.u.uOpacity.value = step(t, 175, 178) * (1 - step(t, HIT - 0.05, HIT));
      const lit = t < HIT;
      flowers.mesh.visible = whale.visible = lit;
      for (const ch of group.children) if (ch !== title.group) ch.visible = lit;
    },
    post(t, P) {
      P.exposure = 1.2 + 0.25 * level(t); P.bloom = 0.75; P.bloomThreshold = 1.3; P.rays = 0.7; P.vignette = 0.38; P.contrast = 1.08; P.saturation = 1.12;
      P.veilColor.setRGB(1, 0.97, 1); P.veil = 1 - step(t, T0, T0 + 0.6);
      if (t >= HIT) { P.veilColor.setRGB(0, 0, 0); P.veil = t < 189.8 ? 1 : 0; P.exposure = 1.2; P.rays = 0; }
      if (t > 190.6) { P.veilColor.setRGB(0, 0, 0); P.veil = step(t, 190.6, 191.04); }
    },
  };
}
