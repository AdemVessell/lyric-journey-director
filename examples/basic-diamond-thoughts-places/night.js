/* 0:00–0:21.6 — THE NIGHT SEA. Black water under a low moon. The title gathers
   out of the fog; on the 6.4 s hit we launch, skimming three metres above the
   swell at up to 60 m/s through banks of mist, into a fog wall that whites out
   on the dawn coast. */
import * as THREE from 'three';
import { Track } from '../camera.js';
import { Lockup } from '../type3d.js';
import { makeOcean } from '../ocean.js';
import { makeField } from '../particles.js';
import { place, env, C, dir, step, mix, makeMist, fakeLine, lerpEnv, spire, std, mulberry32 } from './kit.js';
import { level } from '../drive.js';

export function night(ctx) {
  const group = new THREE.Group();
  const ocean = makeOcean(ctx.sky, { amp: 0.55, chop: 1.3, glint: 1.2, rough: 0.35, deep: C(0.002, 0.003, 0.007), scatter: C(0.004, 0.008, 0.014) });
  group.add(ocean.mesh);
  // moonlit fog banks, brighter than the fog colour: they catch the moon
  const mist = makeMist({ count: 18, z0: -40, z1: -820, width: 560, height: 46, y: 12, spreadX: 220, opacity: 0.5, tint: C(2.6, 2.7, 3.3), bottom: 0, soft: 22 });
  group.add(mist.group);
  // the fog wall we enter at the end, rising ahead out of the dark
  const wall = makeMist({ count: 4, z0: -870, z1: -960, width: 2600, height: 300, y: 110, spreadX: 30, opacity: 1, tint: C(8, 8, 9), seed: 5, bottom: -10, soft: 30 });
  group.add(wall.group);
  // sea stacks: silhouettes that pass close at speed, for parallax and scale
  const rock = std({ color: C(0.03, 0.03, 0.035), roughness: 0.95 });
  const rnd = mulberry32(31);
  const stacks = [[-70, -60, 70], [95, -150, 110], [-150, -230, 55], [60, -320, 150], [-48, -420, 95], [140, -500, 70],
    [-110, -590, 130], [42, -680, 80], [-230, -140, 160], [260, -380, 190], [-300, -520, 140], [210, -740, 120]];
  for (const [x, z, h] of stacks) { const s = spire(h, h * (0.12 + rnd() * 0.1), rnd() * 10, rock); s.position.set(x, -2, z); group.add(s); }
  const spray = makeField({ count: 6000, box: [70, 12, 120], size: 0.09, color: C(0.55, 0.6, 0.78), opacity: 0.8, vel: [0, 0.3, 0], turb: 0.8, floor: 0.3, twinkle: 0.5 });
  spray.u.uCenter.value.set(0, 3, -30);
  group.add(spray.mesh);

  const track = new Track([
    { t: 0, p: [0, 2.4, 40], l: [-40, 9, -500], fov: 36 },
    { t: 5.5, p: [0, 2.5, 22], l: [-36, 10, -500], fov: 36 },
    { t: 6.4, p: [0, 2.6, 15], l: [-30, 10, -500], fov: 37 },
    { t: 10.5, p: [2, 3.2, -150], l: [-10, 14, -600], fov: 44 },
    { t: 14, p: [8, 3.8, -340], l: [10, 4, -900], fov: 50, roll: -5 },
    { t: 17.5, p: [-4, 3.0, -560], l: [-20, 3, -1100], fov: 50, roll: 4 },
    { t: 21.6, p: [-10, 2.8, -830], l: [0, 4, -1400], fov: 52 },
  ]);

  const title = new Lockup(fakeLine([['BASIC', 2.4, 7], ['DIAMOND', 3.0, 7], ['THOUGHTS', 3.6, 7]]), 'BASIC DIAMOND / THOUGHTS', { tracking: 0.16, lead: 1.25 });
  title.fx('condense', [0, 0, 0, 0], 0.6);
  title.words.forEach((w) => { w.rise = 1.8; w.from = w.lit - w.rise; });
  place(title, track, 4.5, { dist: 260, dy: 0.42, fill: 0.58 });
  title.set('uIntensity', 2.2); title.set('uFogMul', 0.25);
  group.add(title.group);

  const moonDir = dir(-28, 11);
  const E0 = {
    zenith: C(0.006, 0.008, 0.02), horizon: C(0.05, 0.055, 0.08), ground: C(0.01, 0.012, 0.02),
    sunDir: moonDir, sunColor: C(0.25, 0.3, 0.45), sunSky: C(0.2, 0.24, 0.35), sunSize: 0.0, sunGlow: 0.25, sunCore: 0,
    moon: 1.2, moonDir, stars: 1, fog: C(0.045, 0.05, 0.07), fogSun: C(0.22, 0.25, 0.34), fogSunPow: 6,
    density: 0.0032, falloff: 0.045, sunI: 0.35, hemiI: 0.15, hemiSky: C(0.2, 0.24, 0.4), hemiGround: C(0.02, 0.02, 0.03),
  };
  const E1 = { ...E0, fog: C(0.42, 0.4, 0.47), fogSun: C(0.7, 0.62, 0.66), horizon: C(0.4, 0.38, 0.45), density: 0.03, falloff: 0.0, stars: 0 };
  E0.horizon = C(0.07, 0.075, 0.105);   // a little light along the horizon toward the moon, so the swell shows

  return {
    name: 'night sea', t0: -1, t1: 21.6, group, track, lockups: [title], blurDepth: 18,
    env(t, c) { env(c, lerpEnv(E0, E1, step(t, 20.7, 21.6))); },
    update(t) {
      title.set('uOpacity', 1 - step(t, 9.5, 11.5));
      spray.u.uOpacity.value = 0.25 + 0.5 * step(t, 6.4, 9);
      ocean.u.uAmp.value = 0.45 + 0.25 * level(t);
    },
    post(t, P) {
      P.exposure = 1.35; P.bloom = 0.75; P.bloomThreshold = 0.8; P.vignette = 0.55; P.grain = 0.05;
      P.letterbox = 0.128; P.saturation = 0.9; P.split.set(-0.02, 0.0, 0.05);
      P.veilColor.setRGB(0, 0, 0); P.veil = 1 - step(t, 0.3, 3.6);
      if (t > 20) { P.veilColor.setRGB(0.82, 0.8, 0.84); P.veil = step(t, 20.6, 21.6); }
    },
  };
}
