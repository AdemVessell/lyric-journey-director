/* 2:22–2:35.8 — THE VESSEL. Among the stars, the thing that was made: the
   amphora, now glazed dark and broken and mended, gold seams growing up through
   the glaze while it turns. The outro's voice is not on the sheet, so no words
   but the title, stamped in gold at the end. Then black. */
import * as THREE from 'three';
import { Track } from '../camera.js';
import { Lockup } from '../type3d.js';
import { makeField } from '../particles.js';
import { phys, place, env, C, dir, step, fakeLine } from './kit.js';
import { thrown, SHAPES, seams, GOLD } from './mwkit.js';
import { level } from '../drive.js';

export function vessel(ctx) {
  const group = new THREE.Group();
  const T0 = 142.0, T1 = 155.9, END = 155.4;
  const glaze = phys({ color: C(0.17, 0.18, 0.23), roughness: 0.22, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 }, 'glaze');
  const seamU = seams(glaze, { scale: 0.32, width: 0.02, glow: 1.3, grow: -1, keep: 0.7 });
  const pot = new THREE.Mesh(thrown(SHAPES.amphora, { rings: 1.2, ringAmp: 0.006, steps: 6, segs: 128 }), glaze);
  pot.material.side = THREE.DoubleSide;
  const holder = new THREE.Group(); holder.add(pot); pot.position.y = -7.5; group.add(holder);
  holder.scale.setScalar(3);
  const dust = makeField({ count: 3000, box: [160, 120, 160], size: 0.14, color: GOLD.clone().multiplyScalar(2.6), opacity: 0.8, vel: [0, 0.6, 0], turb: 6, spark: 1, twinkle: 0.8, seed: 31 });
  dust.u.uCenter.value.set(0, 0, 0); group.add(dust.mesh);
  // a warm key that keeps to the camera's side, and a cool rim from behind the vessel
  const key = new THREE.DirectionalLight(0xffd2a0, 0), rim = new THREE.DirectionalLight(0x9db8ff, 0);
  group.add(key, rim, key.target, rim.target);

  const track = new Track([
    { t: T0, p: [0, 10, 150], l: [0, 6, 0], fov: 40, cut: true },
    { t: 145.0, p: [60, 26, 118], l: [0, 4, 0], fov: 40 },
    { t: 148.5, p: [118, 18, 44], l: [0, 6, 0], fov: 38 },
    { t: 151.5, p: [110, 12, -20], l: [0, 8, 0], fov: 38 },
    { t: T1, p: [100, 10, -38], l: [0, 8, 0], fov: 38 },
  ]);
  const title = new Lockup(fakeLine([['MADE', 151.7, 156], ['WELL', 152.0, 156]]), 'MADE WELL', { tracking: 0.18 });
  title.fx('condense', [0, 0, 0, 0], 0.6);
  title.words.forEach((w) => { w.rise = 0.7; w.from = w.lit - 0.7; });
  place(title, track, 152.6, { dist: 40, fill: 0.46, dy: -0.28 });
  title.color(C(1.55, 1.1, 0.45)); title.set('uIntensity', 1.6); title.set('uFogMul', 0); title.set('uHalo', 0.2);
  group.add(title.group);

  const E = {
    gain: 1, zenith: C(0.006, 0.008, 0.02), horizon: C(0.02, 0.022, 0.04), ground: C(0.005, 0.005, 0.01), horizonPow: 0.6,
    sunDir: dir(-120, 30), sunColor: C(1.4, 1.05, 0.7), sunSky: C(0, 0, 0), sunSize: 0, sunGlow: 0, sunCore: 0, stars: 1.6,
    fog: C(0.01, 0.01, 0.02), fogSun: C(0.05, 0.04, 0.03), fogSunPow: 6, density: 0.0004, falloff: 0.0,
    sunI: 1.2, hemiI: 0.7, hemiSky: C(0.32, 0.36, 0.6), hemiGround: C(0.3, 0.2, 0.1), shadowFocus: 80,
  };
  return {
    name: 'the vessel', t0: T0, t1: T1, group, track, lockups: [title], blurDepth: 60,
    env(t, c) { env(c, E); },
    update(t) {
      holder.rotation.y = 0.16 * (t - T0);
      // the mending: gold climbs from the foot to the lip
      seamU.uSeamGrow.value = -0.5 + 16 * step(t, 142.4, 149.5);
      seamU.uSeamGlow.value = 1.1 + 0.9 * level(t);
      const cam = track.eval(t).pos;
      key.position.set(cam.x * 0.8 - cam.z * 0.4, 70, cam.z * 0.8 + cam.x * 0.4); key.intensity = 9;
      rim.position.set(-cam.x, 40, -cam.z); rim.intensity = 4;
    },
    post(t, P) {
      P.exposure = 1.35; P.bloom = 0.9; P.bloomThreshold = 0.9; P.vignette = 0.55; P.contrast = 1.08;
      P.veilColor.setRGB(0.02, 0.02, 0.04); P.veil = 1 - step(t, T0, T0 + 0.6);
      if (t > END) { P.veilColor.setRGB(0, 0, 0); P.veil = step(t, END, 155.79); }
    },
  };
}
