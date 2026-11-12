/* 1:28.4–1:38.4 — HARDER THAN THE WIND. Out of the cave mouth onto ridged
   mountains in a hard crosswind: streaks (fast matter smears into real wind under
   the shutter) and tumbling leaves. "Harder" drops in heavy; "than the wind" is
   blown in by it; "carrying the mountain leaves" rides the leaf stream. Then the
   four chorus words are events, not captions: Fog floods the world, Eats takes
   the light down to black, Light flares gold, Blooms opens flowers all round us.
   Built twice (leaves, then petals for the second chorus). The camera path is
   generated from the terrain so it always clears the ridges. */
import * as THREE from 'three';
import { Track } from '../camera.js';
import { Lockup, sequence } from '../type3d.js';
import { makeField } from '../particles.js';
import { makeFlakes } from '../flakes.js';
import { makeFlowers } from '../flowers.js';
import { std, terrain, place, poseBasis, env, C, dir, step, smooth, mix, noise, mulberry32, lerpEnv } from './kit.js';
import { level, hits } from '../drive.js';

function ridged(x, z) {
  let h = 0, amp = 1, f = 0.0011, w = 1;
  for (let i = 0; i < 6; i++) {
    let n = 1 - Math.abs(noise.noise(x * f + 31.7, z * f - 11.3)); n *= n;
    h += n * amp * w; w = Math.min(1, n * 1.4); amp *= 0.5; f *= 2.07;
  }
  return h * 240 - 60;
}
export function wind(ctx, o) {
  const { t0, t1, lines, variant = 'leaves' } = o;
  const [LH, LC, LF, LE, LL, LB] = lines;
  const group = new THREE.Group();
  const petals = variant === 'petals';
  const valley = (x, z) => ridged(x, z) * (1 - 0.55 * Math.exp(-Math.pow((x - Math.sin(z * 0.004) * 60) / 160, 2)));
  const ground = (x, z) => valley(x, z);
  const geo = terrain(ground, { x0: -1400, x1: 1400, z0: -2600, z1: 300, nx: 360, nz: 380 }, null).geometry;
  const pos = geo.attributes.position, nrm = geo.attributes.normal, cols = [];
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), ny = nrm.getY(i);
    const snow = smooth((y - 70) / 70) * smooth((ny - 0.5) / 0.2);
    const r = 0.28 + 0.1 * noise.noise(pos.getX(i) * 0.02, pos.getZ(i) * 0.02);
    const c = petals ? [mix(r * 1.1, 0.92, snow), mix(r, 0.86, snow), mix(r * 1.25, 0.95, snow)] : [mix(r, 0.94, snow), mix(r, 0.94, snow), mix(r * 1.12, 0.98, snow)];
    cols.push(...c);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const land = new THREE.Mesh(geo, std({ vertexColors: true, roughness: 0.88 }, 'mtn' + variant));
  land.receiveShadow = true; land.castShadow = true; group.add(land);

  // the camera path, generated: forward along the valley, always well clear of the ground
  const fly = (t) => {
    const s = t - t0;
    const z = 120 - s * 78, x = Math.sin(z * 0.004) * 60 + Math.sin(s * 0.7) * 18;
    let hmax = -1e9;
    for (let dz = -100; dz <= 260; dz += 40) for (let dx = -140; dx <= 140; dx += 35) hmax = Math.max(hmax, ground(x + dx, z - dz));
    return [x, hmax + 48, z];
  };
  const keys = [];
  for (let t = t0; t <= t1 + 0.01; t += 0.5) {
    const p = fly(t), q = fly(t + 1.6);
    keys.push({ t, p, l: [q[0], q[1] - 4, q[2]], fov: 54, roll: Math.sin((t - t0) * 0.6) * 7 });
  }
  keys[0].cut = true;
  // the monuments: slow almost to a hover so the four words own the frame
  const f0 = LF.words[0].start;
  for (const k of keys) if (k.t >= f0 - 0.4) {
    const hold = fly(f0 - 0.4), q = fly(f0 + 1.2);
    k.p = [hold[0], hold[1] + (k.t - f0) * 2, hold[2] - (k.t - f0) * 6]; k.l = [q[0], hold[1] - 4, q[2] - 80]; k.fov = 50; k.roll = 0;
  }
  const track = new Track(keys);

  const streaks = makeField({ count: 9000, box: [220, 90, 260], size: 0.06, color: C(1, 1, 1.05), opacity: 0.75, vel: [46, 3, 14], turb: 2, seed: 9 });
  group.add(streaks.mesh);
  // petals brighter than this sky (about 2): darker than it, they read as soot on the lens
  const flakes = makeFlakes({ count: 2200, box: [160, 70, 200], size: petals ? 1.4 : 1.2, vel: [42, 2, 10], spin: 5, turb: 2.5,
    shape: petals ? 'petal' : 'leaf', color: petals ? C(2.5, 2.3, 2.6) : C(0.85, 0.88, 0.72), color2: petals ? C(2.2, 1.8, 2.7) : C(0.95, 0.88, 1.05), glow: 0.3 });
  group.add(flakes.mesh);

  // Blooms: flowers placed round the camera's hover point, opening in a wave
  const rnd = mulberry32(petals ? 99 : 55);
  const bloomT = LB.words[0].start, hover = new THREE.Vector3(...fly(f0 - 0.4));
  const spots = [];
  for (let i = 0; i < 900; i++) {
    const a = rnd() * Math.PI * 2, r = 12 + Math.pow(rnd(), 0.7) * 160;
    const p = new THREE.Vector3(hover.x + Math.cos(a) * r, 0, hover.z - 60 + Math.sin(a) * r * 1.3);
    p.y = Math.min(ground(p.x, p.z) + 1, hover.y - 8 - rnd() * 30);
    if (ground(p.x, p.z) > p.y - 0.5) p.y = ground(p.x, p.z) + 0.6;
    spots.push({ p, s: 1.6 + rnd() * 3.2, t: bloomT - 0.5 + r / 160 * 0.7 });
  }
  const flowers = makeFlowers(spots, { petals: 7, glow: 1.1, palette: [[1.3, 1.25, 1.4], [1.0, 0.8, 1.5], [1.4, 1.0, 1.25]] });
  group.add(flowers.mesh);
  const flare = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(30, 24, 16) }));
  group.add(flare);

  /* ---- the lines ---- */
  const white = C(0.96, 0.95, 0.98);
  const H1 = new Lockup(LH, '^' + LH.words[0].text, { words: [0, 1] }).fx('drop', [0, 0, 0, 0], 0.35);
  place(H1, track, LH.words[0].start + 0.2, { dist: 95, dy: 0.36, fill: 0.4 });
  const H2 = new Lockup(LH, '_than _the ~wind', { words: [1, 4] }).fx('wind', [16, 0, 0, 0], 0.45);
  place(H2, track, LH.words[3].start, { dist: 90, dy: -0.3, fill: 0.46 });
  // "carrying the mountain leaves" rides the leaf stream with us. Left standing, the
  // camera's 78 m/s made its first words ~30 px at their onsets and ran its last off the
  // frame. Carried ahead of the camera, closing on it slowly and following its heading
  // 0.15 s late (so a turn or a ridge swings it rather than locking it to the lens), the
  // whole line holds a readable size while the mountains rush past.
  const CL = new Lockup(LC, 'carrying / _the ^mountain ~leaves').fx('wind', [22, 0, 0, 0], 0.5);
  const tCL = LC.words[0].start, clD = (s) => 80 - 7 * s;
  place(CL, track, tCL, { dist: clD(0), dx: -0.08, fill: 0.72 });
  const rideCL = (t, cam) => {
    const B = poseBasis(track, t - 0.15), s = t - tCL, D = clD(s);
    CL.group.position.copy(cam.position).addScaledVector(B.f, D).addScaledVector(B.r, -0.08 * B.halfW * D + 1.5 * s);
    CL.group.quaternion.copy(B.q);
  };
  const mono = (L, mark, fx, color, fill) => {
    const lk = new Lockup(L, mark, { tracking: 0.06 }).fx(fx, [0, 0, 0, 0], 0.4, 12);
    place(lk, track, L.words[0].start, { dist: 60, fill });
    lk.color(color); lk.set('uFogMul', 0.0);
    return lk;
  };
  const FOGW = mono(LF, LF.words[0].text.toUpperCase() === LF.words[0].text ? LF.words[0].text : LF.words[0].text, 'condense', C(0.05, 0.05, 0.06), 0.62);
  FOGW.set('uIntensity', 1); FOGW.set('uHalo', 0);
  const EATS = mono(LE, LE.words[0].text, 'pop', C(1.0, 0.98, 0.96), 0.66); EATS.set('uIntensity', 2.2);
  EATS.words[0].rise = 0.18; EATS.words[0].from = EATS.words[0].lit - 0.18;   // a short entrance: Fog has the frame until then
  const LIGHT = mono(LL, LL.words[0].text, 'pop', C(1.4, 0.95, 0.5), 0.62); LIGHT.set('uIntensity', 2.8);
  const BLOOM = mono(LB, LB.words[0].text, 'assemble', C(1.0, 0.92, 1.15), 0.7); BLOOM.set('uIntensity', 2.2);
  for (const l of [H1, H2, CL]) { l.color(white); l.set('uIntensity', 1.7); l.set('uFogMul', 0.4); }
  H2.after(LH.words[0].start);
  H1.exit(LH.words[1].start - 0.05, LH.words[1].start + 0.2);   // gone as "than" lands, before the camera overtakes it
  H2.exit(LC.words[0].start - 0.6, LC.words[0].start - 0.2);
  const tF0 = LF.words[0].start, tE0 = LE.words[0].start;
  sequence([CL, FOGW]);
  FOGW.exit(EATS.words[0].from - 0.02, EATS.words[0].from + 0.1);
  EATS.exit(tE0 + 0.45, tE0 + 0.9);
  LIGHT.exit(LB.words[0].start - 0.5, LB.words[0].start - 0.25);
  const lockups = [H1, H2, CL, FOGW, EATS, LIGHT, BLOOM];
  for (const l of lockups) group.add(l.group);

  const sunDir = dir(55, 34);
  // alpine (regraded 2026-10-29 for more colour): warm sun on the snow, blue haze and
  // shadow, where it had been neutral grey
  const E = {
    gain: 1.9,
    zenith: C(0.4, 0.52, 0.92), horizon: C(1.08, 1.1, 1.2), ground: C(0.66, 0.7, 0.8), horizonPow: 0.6,
    sunDir, sunColor: C(3.6, 3.0, 2.4), sunSky: C(2.4, 2.0, 1.6), sunSize: 0.0007, sunGlow: 0.9, sunCore: 28,
    fog: C(0.9, 0.95, 1.08), fogSun: C(1.8, 1.55, 1.25), fogSunPow: 6, density: 0.0011, falloff: 0.0022,
    sunI: 4.4, hemiI: 1.8, hemiSky: C(0.62, 0.72, 1.05), hemiGround: C(0.5, 0.48, 0.52), shadowFocus: 120,
  };
  const Efog = { ...E, fog: C(1.15, 1.13, 1.18), fogSun: C(1.3, 1.27, 1.3), density: 0.045, falloff: 0.0, horizon: C(1.15, 1.13, 1.18), zenith: C(1.1, 1.1, 1.15) };
  const Edark = { ...Efog, fog: C(0, 0, 0), fogSun: C(0, 0, 0), horizon: C(0, 0, 0), zenith: C(0, 0, 0), sunI: 0, hemiI: 0, density: 0.05 };
  const Elight = { ...E, fog: C(1.5, 1.2, 0.85), fogSun: C(3, 2.3, 1.4), horizon: C(1.4, 1.15, 0.85), zenith: C(0.9, 0.75, 0.6), density: 0.004, sunI: 5 };
  const Ebloom = { ...E, fog: C(0.24, 0.18, 0.34), fogSun: C(0.8, 0.6, 0.9), horizon: C(0.3, 0.22, 0.4), zenith: C(0.08, 0.05, 0.16), density: 0.006, falloff: 0, sunI: 1.4, hemiI: 0.6 };
  const tF = LF.words[0].start, tE = LE.words[0].start, tL = LL.words[0].start, tB = LB.words[0].start;
  const envAt = (t) => {
    if (t < tF - 0.3) return E;
    if (t < tE - 0.1) return lerpEnv(E, Efog, step(t, tF - 0.3, tF - 0.05));
    if (t < tL - 0.2) return lerpEnv(Efog, Edark, step(t, tE + 0.15, tE + 0.7));
    if (t < tB - 0.3) return lerpEnv(Edark, Elight, step(t, tL - 0.2, tL - 0.04));
    return lerpEnv(Elight, Ebloom, step(t, tB - 0.3, tB + 0.4));
  };
  return {
    name: petals ? 'wind (petals)' : 'harder than the wind', t0, t1, group, track, lockups, blurDepth: 24,
    env(t, c) { env(c, envAt(t)); },
    update(t, c) {
      rideCL(t, c.camera);
      streaks.u.uOpacity.value = 0.5 + 0.6 * level(t);
      flakes.u.uOpacity.value = 1 - step(t, tF - 0.3, tF + 0.2) * (1 - step(t, tB - 0.3, tB + 0.3));
      const k = step(t, tL - 0.12, tL + 0.05) * (1 - step(t, tL + 0.4, tB));
      flare.visible = k > 0.01;
      const cp = c.camera.position, fw = new THREE.Vector3(); c.camera.getWorldDirection(fw);
      flare.position.copy(cp).addScaledVector(fw, 400).addScaledVector(c.camera.up, 150); flare.scale.setScalar(14 + 70 * k);
      flowers.mesh.visible = t > tB - 1;
    },
    post(t, P) {
      P.exposure = 1.25; P.bloom = 0.6; P.bloomThreshold = 1.6; P.rays = 0.45; P.vignette = 0.36; P.contrast = 1.06;
      if (t >= tE - 0.1 && t < tL) P.vignette = mix(0.36, 1.0, step(t, tE + 0.1, tE + 0.6));
      if (t >= tL - 0.2 && t < tB) { P.bloom = 1.2; P.rays = 1.4; P.exposure = 1.25 + 0.6 * (1 - step(t, tL, tL + 0.6)); }
      P.veilColor.setRGB(1, 0.97, 0.92); P.veil = 1 - step(t, t0, t0 + 0.2);
      if (t > t1 - 0.35) { P.veilColor.setRGB(1, 0.97, 1.0); P.veil = step(t, t1 - 0.35, t1); }
    },
  };
}
