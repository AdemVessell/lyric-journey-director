/* 0:00–0:16.9 — THE WORKSHOP. A potter's hall at monumental scale, sun falling
   through a slatted roof in sheets of dust. A wheel the size of a plaza turns a
   wet amphora; "made well" is cut into the wheel's clay as it turns, "so well
   made" gathers before the vessel's shoulder. We rise over its lip and fly the
   aisle of drying pots — "even after all", "what's more" — to the great door,
   where "we're on our way" is carved in the lintel, and out into the light. */
import * as THREE from 'three';
import { Track } from '../camera.js';
import { Lockup, sequence } from '../type3d.js';
import { std, place, env, C, dir, step, mulberry32, scatter } from './kit.js';
import { wetClay, dryClay, adobe, earth, wood, thrown, SHAPES, shaft } from './mwkit.js';
import { level } from '../drive.js';

export function workshop(ctx) {
  const group = new THREE.Group();
  const T0 = -1, T1 = 16.9, SPIN = 0.22;
  const rnd = mulberry32(1107);
  const sunDir = dir(-58, 56);

  // the hall: earth floor, adobe walls, a far wall with the great door, a slatted roof
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(170, 250), earth());
  floor.rotation.x = -Math.PI / 2; floor.position.z = -10; floor.receiveShadow = true; group.add(floor);
  const wallM = adobe();
  const box = (w, h, d, x, y, z, m = wallM) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; group.add(b); return b; };
  box(4, 44, 250, -74, 22, -10); box(4, 44, 250, 74, 22, -10); box(152, 44, 4, 0, 22, 112);
  box(63, 44, 4, -44.5, 22, -124); box(63, 44, 4, 44.5, 22, -124); box(26, 18, 4, 0, 35, -124);
  // the carved panel over the door
  box(30, 13, 3, 0, 33.5, -121.5, std({ color: C(0.55, 0.5, 0.44), roughness: 0.9 }, 'milestone-lintel'));
  const beams = wood();
  for (let z = -118; z < 108; z += 9) box(150, 1.6, 6, 0, 44.8, z, beams);       // roof slats, 3 m gaps between
  for (let z = -110; z < 100; z += 30) for (const x of [-60, -20, 20, 60]) box(1.4, 44, 1.4, x, 22, z, beams);   // posts

  // sheets of sun through the roof gaps
  for (let z = -113.5; z < 104; z += 9) group.add(shaft(new THREE.Vector3(0, 44, z), sunDir.clone().negate(), 70, 148, 2.6, { amount: 0.035 }));

  // the wheel and the amphora on it, turning
  const wheel = new THREE.Group(); group.add(wheel);
  const clay = wetClay();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(12, 12.2, 0.7, 96), clay); disc.position.y = 1.85; disc.receiveShadow = disc.castShadow = true; wheel.add(disc);
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4, 1.6, 32), wood()); ped.position.y = 0.8; group.add(ped);
  const vessel = new THREE.Mesh(thrown(SHAPES.amphora, { rings: 1.7, ringAmp: 0.012, steps: 6, segs: 96 }), wetClay('-vessel'));
  vessel.material.side = THREE.DoubleSide; vessel.position.y = 2.2; vessel.castShadow = vessel.receiveShadow = true; wheel.add(vessel);

  // the kiln: a brick dome with a mouth of fire
  const kiln = new THREE.Mesh(new THREE.SphereGeometry(12, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: C(0.42, 0.24, 0.16), roughness: 0.95 }, 'brick'));
  kiln.position.set(-50, 0, -34); kiln.castShadow = kiln.receiveShadow = true; group.add(kiln);
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(3.4, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 3.6, 1.0) }));
  mouth.position.set(-38.2, 3.4, -34); mouth.rotation.y = Math.PI / 2; group.add(mouth);
  const fire = new THREE.PointLight(0xff8a3c, 0, 0, 2); fire.position.set(-36, 3.5, -34); group.add(fire);

  // shelves of drying pots down both walls
  const boards = [];
  for (const side of [-1, 1]) for (let lv = 0; lv < 6; lv++) boards.push({ x: side * 67, y: 4 + lv * 5.2, side });
  for (const b of boards) box(9, 0.5, 212, b.x, b.y, -14, beams);
  const pots = dryClay();
  const kinds = [[SHAPES.jar, 1.2], [SHAPES.vase, 1.0], [SHAPES.bowl, 1.1], [SHAPES.jar, 2.0]];
  kinds.forEach(([shape, sc], k) => {
    const geo = thrown(shape, { segs: 24, steps: 2 });
    group.add(scatter(geo, pots, 260, (i, p, q, s) => {
      const b = boards[Math.floor(rnd() * boards.length)], z = -116 + rnd() * 200;
      const sz = sc * (0.8 + rnd() * 0.7);
      p.set(b.x + (rnd() - 0.5) * 6, b.y + 0.25, z); q.setFromEuler(new THREE.Euler(0, rnd() * 6.3, 0)); s.setScalar(sz);
    }));
  });
  // big unfinished pots along the floor, and lumps of clay
  group.add(scatter(thrown(SHAPES.amphora, { segs: 32, steps: 2 }), dryClay('-big'), 26, (i, p, q, s) => {
    const side = i % 2 ? 1 : -1; p.set(side * (52 + rnd() * 8), 0, -110 + i * 8 + rnd() * 3); q.setFromEuler(new THREE.Euler(0, rnd() * 6, 0)); s.setScalar(0.28 + rnd() * 0.18);
  }));
  group.add(scatter(new THREE.IcosahedronGeometry(1, 2), wetClay('-lump'), 60, (i, p, q, s) => {
    p.set((rnd() - 0.5) * 90, 0.3, -100 + rnd() * 180); q.setFromEuler(new THREE.Euler(rnd(), rnd(), rnd())); s.set(0.8 + rnd(), 0.5 + rnd() * 0.5, 0.8 + rnd());
  }));

  const track = new Track([
    { t: T0, p: [4, 3.4, 40], l: [0, 5, 0], fov: 40, cut: true },
    { t: 2.0, p: [1.5, 6.5, 28], l: [0, 3.5, 2], fov: 42 },
    { t: 4.3, p: [0, 10.5, 19], l: [0, 2.2, 5.5], fov: 44 },
    { t: 5.15, p: [0, 9.8, 14.5], l: [0, 9.5, 0], fov: 46 },
    { t: 6.9, p: [0, 10.5, 10.5], l: [0, 11, 0], fov: 46 },
    { t: 8.4, p: [0, 19.5, 3.5], l: [0, 14, -24], fov: 50 },
    { t: 10.2, p: [-5, 13, -27], l: [-24, 11, -50], fov: 50 },
    { t: 11.5, p: [2, 11.5, -46], l: [12, 10.5, -66], fov: 50 },
    { t: 12.9, p: [1, 11.5, -60], l: [0, 24, -122], fov: 48 },
    { t: 14.7, p: [0, 12.5, -80], l: [0, 25, -122], fov: 48 },
    { t: T1, p: [0, 14, -128], l: [0, 13, -175], fov: 52 },
  ]);

  // the lines
  const cream = C(0.97, 0.9, 0.8);
  const L0 = new Lockup(ctx.line('L0'), 'made ^well').fx('write', [0, 0, 0, 0], 0.3);
  wheel.rotation.y = SPIN * 4.4; wheel.updateMatrixWorld(true);
  place(L0, track, 4.4, { plane: 'floor', y: 2.24, dy: -0.28, fill: 0.5 });
  wheel.attach(L0.group);                               // cut into the wheel's clay, it turns with it
  const L1 = new Lockup(ctx.line('L1'), '_so ~well / ^made').fx('rise', [0.4, 0, 0, 0], 0.45);
  place(L1, track, 6.0, { dist: 6, fill: 0.4, dy: 0.02 });
  const L2 = new Lockup(ctx.line('L2'), '_even ~after / ^all').fx('assemble', [0, 0, 0, 0], 0.5, 8);
  place(L2, track, 10.35, { dist: 26, fill: 0.44, dx: -0.02 });
  const L3 = new Lockup(ctx.line('L3'), "_what's / ^more").fx('unfold', [1, 0, 0, 0], 0.4);
  place(L3, track, 11.6, { dist: 24, fill: 0.4, dx: 0.03 });
  const L4 = new Lockup(ctx.line('L4'), "~we're ~on ~our / ^way").fx('write', [0, 0, 0, 0], 0.3);
  place(L4, track, 14.4, { at: new THREE.Vector3(0, 33.4, -119.9), plane: 'plane', normal: new THREE.Vector3(0, 0, 1), xdir: new THREE.Vector3(1, 0, 0), width: 21 });
  sequence([L0, L1]); sequence([L2, L3, L4]);
  const lockups = [L0, L1, L2, L3, L4];
  for (const l of lockups) { l.color(cream); l.set('uIntensity', 1.6); }
  L4.color(C(0.98, 0.86, 0.62)); L4.set('uIntensity', 1.9);
  for (const l of [L1, L2, L3, L4]) group.add(l.group);

  const E = {
    gain: 1.3,
    zenith: C(0.36, 0.44, 0.66), horizon: C(1.15, 0.98, 0.82), ground: C(0.42, 0.34, 0.27), horizonPow: 0.45,
    sunDir, sunColor: C(3.4, 2.6, 1.75), sunSky: C(2.4, 1.8, 1.2), sunSize: 0.0009, sunGlow: 1.2, sunCore: 20,
    fog: C(0.2, 0.15, 0.12), fogSun: C(1.5, 1.05, 0.7), fogSunPow: 6, density: 0.0055, falloff: 0.012,
    sunI: 4.2, hemiI: 0.4, hemiSky: C(0.55, 0.48, 0.42), hemiGround: C(0.32, 0.22, 0.15), shadowFocus: 55,
  };
  return {
    name: 'the workshop', t0: T0, t1: T1, group, track, lockups, blurDepth: 20,
    env(t, c) { env(c, E); },
    update(t) {
      wheel.rotation.y = SPIN * t;
      fire.intensity = 2.6e4 * (0.85 + 0.15 * Math.sin(t * 7.3) * Math.sin(t * 3.1) + 0.3 * level(t));
      mouth.material.color.setRGB(9, 3.6, 1.0).multiplyScalar(0.85 + 0.15 * Math.sin(t * 6.1));
    },
    post(t, P) {
      P.exposure = 1.3; P.bloom = 0.6; P.bloomThreshold = 1.1; P.vignette = 0.45; P.contrast = 1.06;
      P.veilColor.setRGB(0, 0, 0); P.veil = 1 - step(t, -0.6, 1.4);
      if (t > 16.2) { P.veilColor.setRGB(1, 0.96, 0.88); P.veil = step(t, 16.2, 16.9); }
    },
  };
}
