/* 1:38.4–2:07.8 — THE LONG FLIGHT (instrumental). Low and fast over a valley that
   blooms as we pass, banking hard; pull up over a ridge into the sky and the sea
   of clouds below; then the plane change in its purest form — the camera rolls a
   full half-turn and flies inverted, the cloud sea a ceiling, the sky a floor —
   and on the three hits of the break it dives through the clouds toward the
   salt flat of the second verse. */
import * as THREE from 'three';
import { Track } from '../camera.js';
import { FOG, FOG_GLSL } from '../engine.js';
import { makeFlowers } from '../flowers.js';
import { makeFlakes } from '../flakes.js';
import { makeCloudSea } from '../clouds.js';
import { std, terrain, env, C, dir, step, smooth, mix, fbm, mulberry32, lerpEnv } from './kit.js';
import { level, hits } from '../drive.js';

export function flight(ctx) {
  const group = new THREE.Group();
  const T0 = 98.4, T1 = 127.8;
  const pathX = (z) => Math.sin(z * 0.0021) * 180 + Math.sin(z * 0.0047) * 60;
  const ground = (x, z) => {
    const hills = fbm(x * 0.0018, z * 0.0018, 5) * 140 + fbm(x * 0.006, z * 0.006, 3) * 24;
    const valley = Math.exp(-Math.pow((x - pathX(z)) / 260, 2));
    return hills * (1 - 0.8 * valley) + 20;
  };
  const meadow = std({ color: C(0.42, 0.4, 0.5), roughness: 0.95 }, 'meadow');
  group.add(terrain(ground, { x0: -1800, x1: 1800, z0: -4200, z1: 300, nx: 300, nz: 380 }, meadow));

  // the bloom: flowers along the valley floor that open in a wave just ahead of us
  const rnd = mulberry32(123);
  const flyZ = (t) => 100 - (t - T0) * 82;
  const spots = [];
  for (let i = 0; i < 7000; i++) {
    const z = mix(80, -1400, rnd()), x = pathX(z) + (rnd() - 0.5) * 520 * (0.3 + rnd());
    const tPass = T0 + (100 - z) / 82;
    spots.push({ p: new THREE.Vector3(x, ground(x, z) + 0.4, z), s: 1.4 + rnd() * 3.6, t: tPass - 1.6 + rnd() * 0.5 });
  }
  const flowers = makeFlowers(spots, { petals: 6, glow: 0.9, palette: [[1.25, 1.2, 1.35], [1.0, 0.8, 1.45], [1.35, 1.0, 1.2], [1.4, 1.2, 0.9]] });
  group.add(flowers.mesh);
  const petals = makeFlakes({ count: 1800, box: [200, 90, 260], size: 1.1, vel: [8, 3, 30], spin: 4, turb: 3, shape: 'petal', color: C(1.2, 1.1, 1.3), color2: C(1.0, 0.8, 1.3), glow: 0.4 });
  group.add(petals.mesh);

  const xcLater = pathX(100 - (107.5 - T0) * 82);
  // the cloud sea: a raymarched slab of cloud that the camera climbs through, skims,
  // flies inverted beneath and dives through. It builds ahead of us after the valley,
  // so the valley keeps its low sun. (It replaced a heightfield sheet with sprite puffs.)
  const sea = makeCloudSea(ctx.engine.renderer, { bottom: 385, top: 485, center: [xcLater, -3200], fadeZ: [-500, -900] });
  group.add(sea.mesh);

  // camera: generated low over the valley, then authored for the climb, the roll and the dive
  const keys = [];
  for (let t = T0; t <= 107.5; t += 0.5) {
    const z = flyZ(t), x = pathX(z), y = ground(x, z) + 16 + Math.sin((t - T0) * 0.9) * 4;
    const z2 = flyZ(t + 1.4), x2 = pathX(z2);
    keys.push({ t, p: [x, y, z], l: [x2, ground(x2, z2) + 10, z2], fov: 58, roll: -Math.cos(z * 0.0021) * 22 });
  }
  keys[0].cut = true;
  const zc = flyZ(107.5), xc = pathX(zc);
  keys.push(
    { t: 110.0, p: [xc + 40, 260, zc - 240], l: [xc + 60, 520, zc - 600], fov: 60, roll: 8 },
    { t: 113.0, p: [xc + 70, 540, zc - 520], l: [xc + 90, 520, zc - 1000], fov: 58, roll: 0 },
    { t: 116.5, p: [xc + 90, 520, zc - 880], l: [xc + 100, 470, zc - 1300], fov: 60, roll: 180 },
    { t: 119.8, p: [xc + 100, 505, zc - 1220], l: [xc + 110, 460, zc - 1640], fov: 62, roll: 180 },
    { t: 121.4, p: [xc + 110, 470, zc - 1440], l: [xc + 120, 300, zc - 1700], fov: 64, roll: 300 },
    { t: 123.0, p: [xc + 120, 340, zc - 1640], l: [xc + 120, 150, zc - 1940], fov: 62, roll: 360 },
    // out through the cloud base: level out beneath it, toward the low sun that lights it
    // from below (terrain tops out near 184 m; this stays above 220)
    { t: 125.0, p: [xc + 110, 245, zc - 1900], l: [xc + 40, 225, zc - 2500], fov: 56, roll: 360 },
    { t: 127.8, p: [xc + 90, 230, zc - 2280], l: [xc + 10, 222, zc - 2900], fov: 52, roll: 360 },
  );
  const track = new Track(keys);

  const sunDir = dir(-25, 9);
  const E = {
    gain: 1.6,
    zenith: C(0.26, 0.24, 0.5), horizon: C(1.15, 0.92, 0.95), ground: C(0.5, 0.45, 0.55), horizonPow: 0.5,
    sunDir, sunColor: C(3.2, 2.3, 1.7), sunSky: C(2.4, 1.6, 1.1), sunSize: 0.0012, sunGlow: 1.4, sunCore: 24, bands: 1,
    fog: C(0.85, 0.72, 0.85), fogSun: C(1.6, 1.15, 0.85), fogSunPow: 5, density: 0.0011, falloff: 0.0028,
    sunI: 4.2, hemiI: 1.5, hemiSky: C(0.7, 0.6, 0.95), hemiGround: C(0.45, 0.36, 0.45), shadowFocus: 90,
  };
  // above the haze the air clears: a crisp sky over a bright cloud floor
  // (no sky bands up here: beside real cloud they read as stripes)
  const Esky = { ...E, gain: 1.9, zenith: C(0.34, 0.44, 0.92), horizon: C(1.2, 1.05, 1.05), sunDir: dir(-25, 15), density: 0.0003, falloff: 0.0015, bands: 0 };
  // under the deck, the sun just below the horizon: it lights the cloud base from beneath
  // (an afterglow), while the land below is already in shadow
  const Edusk = { ...E, gain: 1.2, zenith: C(0.05, 0.06, 0.16), horizon: C(0.75, 0.45, 0.45), fog: C(0.34, 0.3, 0.4), fogSun: C(1.2, 0.6, 0.4),
    sunDir: dir(-25, -0.8), sunColor: C(3.4, 1.7, 0.9), sunSky: C(3.0, 1.4, 0.7), sunI: 1.6, hemiI: 0.6, density: 0.0016 };
  return {
    name: 'the long flight', t0: T0, t1: T1, group, track, lockups: [], blurDepth: 30,
    env(t, c) {
      // the dive: the cloud itself is the medium; day turns to dusk while we are inside it
      let e = lerpEnv(E, Esky, step(t, 107.5, 112));
      if (t > 121.0) e = lerpEnv(Esky, Edusk, step(t, 121.6, 123.4));
      env(c, e); sea.light(e);
    },
    update(t) {
      petals.u.uOpacity.value = 1 - step(t, 107, 110);
      sea.mesh.visible = t > 106; sea.u.uVis.value = step(t, 106, 108.5);
      sea.u.uWind.value.set(t * 3, 0, t);
    },
    post(t, P) {
      P.exposure = 1.2 + 0.45 * step(t, 122.0, 123.6);   // opened up for the afterglow under the deck
      P.bloom = 0.65; P.bloomThreshold = 1.5; P.rays = 0.55; P.vignette = 0.38; P.contrast = 1.07; P.saturation = 1.0;
      P.veilColor.setRGB(1, 0.97, 1); P.veil = 1 - step(t, T0, T0 + 0.6);
      if (t > 127.4) { P.veilColor.setRGB(0.3, 0.28, 0.36); P.veil = step(t, 127.4, 127.8); }
    },
  };
}
