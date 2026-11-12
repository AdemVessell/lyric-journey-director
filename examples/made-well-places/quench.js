/* 0:54.2–1:04.4 — THE QUENCH. Out of the foundry over a dark quench pool under a
   pale sky. Hot iron hangs from a gantry, lowered into the water, and the steam
   stands up in columns lit orange from beneath. No words: the vocalise and the
   gap. We drift low through the steam and into a wall of it. */
import * as THREE from 'three';
import { Track } from '../camera.js';
import { makeOcean } from '../ocean.js';
import { env, C, dir, step, mulberry32, scatter } from './kit.js';
import { iron, makePuffs } from './mwkit.js';
import { level } from '../drive.js';

export function quench(ctx) {
  const group = new THREE.Group();
  const T0 = 54.2, T1 = 64.4;
  const rnd = mulberry32(5401);
  const water = makeOcean(ctx.sky, { amp: 0.18, chop: 0.7, glint: 0.8, rough: 0.35, deep: C(0.012, 0.013, 0.016), scatter: C(0.02, 0.022, 0.026) });
  group.add(water.mesh);
  // the gantry over the pool, and the hot bars hanging from it
  const ironM = iron('-gantry');
  const beam = (w, h, d, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), ironM); b.position.set(x, y, z); b.castShadow = true; group.add(b); };
  for (const x of [-46, 46]) for (let z = -30; z > -200; z -= 42) beam(2.4, 36, 2.4, x, 18, z);
  for (const z of [-50, -110, -170]) beam(96, 2.6, 3, 0, 36, z);
  beam(3, 2.6, 180, -46, 36, -115); beam(3, 2.6, 180, 46, 36, -115);
  const bars = [];
  for (let i = 0; i < 12; i++) {
    const x = -38 + (i % 6) * 15 + rnd() * 4, z = i < 6 ? -50 : -110, drop = rnd() * 4;
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1, 6), ironM); group.add(chain);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 10, 1.6), ironM); bar.castShadow = true; group.add(bar);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.65, 3.4, 1.65), new THREE.MeshBasicMaterial({ color: C(4, 1.3, 0.35) })); group.add(tip);
    const light = new THREE.PointLight(0xff7a30, 0, 0, 2); group.add(light);
    bars.push({ x, z, drop, chain, bar, tip, light, k: rnd() });
  }
  // steam: columns from every bar, and a dense bank at the far end we fly into
  const sources = bars.map((b) => new THREE.Vector3(b.x, 0.5, b.z));
  for (let k = 0; k < 14; k++) sources.push(new THREE.Vector3(-60 + k * 9, 0.5, -176 - rnd() * 14));
  const steam = makePuffs(sources, { per: 30, rise: 5, height: 110, r0: 5, r1: 34, drift: new THREE.Vector3(1.5, 0, 0.5), opacity: 0.42,
    dark: C(0.5, 0.52, 0.56), light: C(1.05, 1.05, 1.08), glowBase: C(0.9, 0.35, 0.1), seed: 21 });
  group.add(steam.mesh);

  const track = new Track([
    { t: T0, p: [0, 9, 30], l: [0, 7, -40], fov: 50, cut: true },
    { t: 57.0, p: [4, 7, -18], l: [10, 10, -90], fov: 50 },
    { t: 60.0, p: [-6, 9, -74], l: [-4, 13, -150], fov: 52 },
    { t: 62.6, p: [2, 12, -126], l: [6, 15, -200], fov: 54 },
    { t: T1, p: [6, 13, -164], l: [8, 15, -232], fov: 56 },
  ]);
  const E = {
    gain: 1.5,
    zenith: C(0.46, 0.5, 0.58), horizon: C(0.92, 0.92, 0.95), ground: C(0.5, 0.5, 0.52), horizonPow: 0.5,
    sunDir: dir(25, 32), sunColor: C(1.5, 1.45, 1.38), sunSky: C(0.6, 0.58, 0.55), sunSize: 0, sunGlow: 0.4, sunCore: 0,
    fog: C(0.78, 0.79, 0.83), fogSun: C(1.1, 1.05, 1.0), fogSunPow: 4, density: 0.0032, falloff: 0.01,
    sunI: 1.3, hemiI: 1.0, hemiSky: C(0.7, 0.74, 0.82), hemiGround: C(0.3, 0.3, 0.32), shadowFocus: 60,
  };
  return {
    name: 'the quench', t0: T0, t1: T1, group, track, lockups: [], blurDepth: 24,
    env(t, c) { env(c, E); },
    update(t) {
      for (const b of bars) {
        // each bar lowered on its chain, its hot end going into the water and cooling
        const y = 8 - b.drop - Math.max(0, t - T0 - b.k * 3) * 0.55;
        b.bar.position.set(b.x, y, b.z);
        b.tip.position.set(b.x, y - 3.4, b.z);
        const len = 36 - (y + 5); b.chain.position.set(b.x, 36 - len / 2, b.z); b.chain.scale.y = len;
        const heat = Math.max(0.15, 1 - Math.max(0, -(y - 5.5)) * 0.25);
        b.tip.material.color.setRGB(4, 1.3, 0.35).multiplyScalar(heat);
        b.light.position.set(b.x, 2.5, b.z); b.light.intensity = 6000 * heat * (0.9 + 0.2 * level(t));
      }
    },
    post(t, P) {
      P.exposure = 1.15; P.bloom = 0.7; P.bloomThreshold = 1.1; P.vignette = 0.45; P.contrast = 1.05;
      P.veilColor.setRGB(0.95, 0.95, 0.96); P.veil = 1 - step(t, T0, T0 + 0.5);
      if (t > 63.8) { P.veilColor.setRGB(0.98, 0.97, 0.95); P.veil = step(t, 63.8, 64.4); }
    },
  };
}
