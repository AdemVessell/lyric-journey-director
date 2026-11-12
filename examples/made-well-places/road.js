/* 0:16.9–0:31 — THE ROAD. Out of the door into low gold light over clay hills. An
   old rutted road runs ahead, fence posts ticking past; on monumental milestones
   "on our way" is carved twice, each passed faster than the last. Charcoal burners
   smoke by the road ahead, and we fly up into their smoke toward the work. */
import * as THREE from 'three';
import { Track } from '../camera.js';
import { Lockup } from '../type3d.js';
import { FOG, FOG_GLSL } from '../engine.js';
import { std, terrain, place, env, C, dir, step, fbm, mulberry32, scatter } from './kit.js';
import { tuft, makePuffs } from './mwkit.js';

export function road(ctx) {
  const group = new THREE.Group();
  const T0 = 16.9, T1 = 31.0;
  const rnd = mulberry32(2611);
  const rx = (z) => 34 * Math.sin(z / 260);                                 // the road's centre line
  const hills = (x, z) => 26 * fbm(x * 0.0024 + 7, z * 0.0024, 5) + 7 * fbm(x * 0.011 + 3, z * 0.011, 3) + 10;
  const roadY = (z) => hills(rx(z), z) * 0.55 + 4;
  const ground = (x, z) => {
    const d = Math.abs(x - rx(z)), k = Math.max(0, Math.min(1, 1 - (d - 8) / 26));
    return hills(x, z) * (1 - k * k * (3 - 2 * k)) + roadY(z) * (k * k * (3 - 2 * k)) - 0.2;
  };
  group.add(terrain(ground, { x0: -800, x1: 800, z0: -1500, z1: 220, nx: 360, nz: 390 }, std({ color: C(0.6, 0.42, 0.28), roughness: 0.95 }, 'hills')));

  // the road: a ribbon on the flattened ground, worn into two ruts
  const rg = new THREE.PlaneGeometry(14, 1720, 12, 860); rg.rotateX(-Math.PI / 2); rg.translate(0, 0, -640);
  const rp = rg.attributes.position;
  for (let i = 0; i < rp.count; i++) { const z = rp.getZ(i), x = rp.getX(i) + rx(z); rp.setXYZ(i, x, ground(x, z) + 0.12, z); }
  rg.computeVertexNormals();
  const roadM = std({ color: C(0.42, 0.3, 0.21), roughness: 0.97 }, 'road');
  const pr = roadM.onBeforeCompile;
  roadM.onBeforeCompile = (sh, r) => {
    pr(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float rc = vFogWorld.x - 34.0 * sin(vFogWorld.z / 260.0);
      float rut = exp(-pow((abs(rc) - 2.3) / 0.45, 2.0));
      diffuseColor.rgb *= mix(1.0, 0.62, rut) * mix(0.9, 1.05, smoothstep(6.5, 3.0, abs(rc)));`);
  };
  roadM.customProgramCacheKey = () => 'road-ruts';
  const roadMesh = new THREE.Mesh(rg, roadM); roadMesh.receiveShadow = true; group.add(roadMesh);

  // fence posts down the left, dry grass, stones: things to fly past
  group.add(scatter(new THREE.BoxGeometry(0.35, 2.4, 0.35), std({ color: C(0.24, 0.17, 0.11), roughness: 0.85 }, 'wood-post'), 150, (i, p, q, s) => {
    const z = 20 - i * 10.5, x = rx(z) - 10.5; p.set(x, ground(x, z) + 1.0, z); q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.12, rnd(), (rnd() - 0.5) * 0.15)); s.set(1, 0.8 + rnd() * 0.4, 1);
  }));
  const grassM = std({ color: C(0.8, 0.64, 0.36), roughness: 0.9, side: THREE.DoubleSide }, 'hills-grass');
  group.add(scatter(tuft(9, rnd), grassM, 9000, (i, p, q, s) => {
    const z = 30 - rnd() * 1450, x = rx(z) + (rnd() < 0.5 ? -1 : 1) * (8 + Math.pow(rnd(), 1.5) * 90);
    p.set(x, ground(x, z) - 0.05, z); q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.2, rnd() * 6, (rnd() - 0.5) * 0.2)); s.setScalar(0.8 + rnd() * 1.6);
  }));
  group.add(scatter(new THREE.IcosahedronGeometry(1, 1), std({ color: C(0.5, 0.42, 0.36), roughness: 0.9 }, 'milestone-rock'), 700, (i, p, q, s) => {
    const z = 30 - rnd() * 1450, x = rx(z) + (rnd() < 0.5 ? -1 : 1) * (8 + rnd() * 60);
    p.set(x, ground(x, z), z); q.setFromEuler(new THREE.Euler(rnd(), rnd(), rnd())); s.set(0.6 + rnd() * 1.6, 0.4 + rnd(), 0.6 + rnd() * 1.6);
  }));

  // charcoal burners smoking by the road ahead: low domes, and smoke we fly up into
  const SM = new THREE.Vector3(rx(-690) + 6, 0, -690), burners = [];
  for (let k = 0; k < 5; k++) {
    const x = SM.x + (k - 2) * 26 + rnd() * 8, z = SM.z - k * 18 - rnd() * 10, y = ground(x, z);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: C(0.12, 0.1, 0.09), roughness: 0.95 }, 'soot'));
    dome.position.set(x, y - 1, z); group.add(dome);
    burners.push(new THREE.Vector3(x, y + 6, z));
  }
  const smoke = makePuffs(burners, { per: 70, rise: 5, height: 220, r0: 8, r1: 46, drift: new THREE.Vector3(2.5, 0, -1), opacity: 0.55, glowBase: C(0.6, 0.22, 0.06) });
  group.add(smoke.mesh);

  // camera, along the road; the milestones are set where it reads them
  const P = (z, h, dx = 0) => [rx(z) + dx, roadY(z) + h, z];
  const track = new Track([
    { t: T0, p: P(0, 8), l: P(-120, 4), fov: 50, cut: true },
    { t: 18.6, p: P(-36, 5.5), l: P(-80, 4.5, 6), fov: 48 },
    { t: 20.6, p: P(-82, 4.5), l: P(-150, 4, 2), fov: 50 },
    { t: 22.6, p: P(-160, 6), l: P(-260, 4), fov: 52 },
    { t: 25.1, p: P(-262, 8.5), l: P(-320, 6, 6), fov: 48 },
    { t: 27.6, p: P(-316, 8), l: P(-420, 6, 2), fov: 50 },
    { t: 28.7, p: P(-430, 8), l: P(-640, 30), fov: 52 },
    { t: 30.3, p: P(-590, 24), l: [SM.x, 120, SM.z], fov: 54 },
    { t: T1, p: [SM.x - 4, 70, SM.z + 24], l: [SM.x, 140, SM.z - 40], fov: 58 },
  ]);
  const stoneM = std({ color: C(0.6, 0.55, 0.48), roughness: 0.92 }, 'milestone');
  const milestone = (lk) => {
    // a stone to carry the carving: sized to the lockup, standing on the ground behind it
    const g = lk.group, W = lk.width * g.scale.x + 1.6, Ht = lk.height * g.scale.x + 1.4;
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(g.quaternion);
    const base = ground(g.position.x, g.position.z);
    const top = g.position.y + Ht / 2, h = top - base + 1;
    const st = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, h, 1.6), stoneM); body.position.y = h / 2 - 1; body.castShadow = body.receiveShadow = true;
    // a half-disc on top, its thickness along the stone's facing, flattened into a low arch
    const capG = new THREE.CylinderGeometry(W / 2, W / 2, 1.6, 32, 1, false, 0, Math.PI); capG.rotateX(Math.PI / 2); capG.rotateZ(Math.PI / 2);
    const cap = new THREE.Mesh(capG, stoneM); cap.scale.set(1, 0.55, 1); cap.position.y = h - 1; cap.castShadow = true;
    st.add(body, cap);
    st.position.set(g.position.x, base, g.position.z).addScaledVector(n, -0.86);
    st.rotation.y = Math.atan2(n.x, n.z);
    group.add(st);
  };
  const carve = C(0.95, 0.88, 0.76);
  const L5 = new Lockup(ctx.line('L5'), '~on ~our / ^way').fx('write', [0, 0, 0, 0], 0.3);
  place(L5, track, 18.3, { dist: 40, dx: 0.2, dy: 0.06, fill: 0.26 });
  const L6 = new Lockup(ctx.line('L6'), '~on ~our / ^way').fx('write', [0, 0, 0, 0], 0.3);
  place(L6, track, 26.2, { dist: 46, dx: 0.12, dy: 0.24, fill: 0.27 });
  for (const lk of [L5, L6]) {
    // stand the carving upright on its stone, facing back along the road
    const g = lk.group, f = new THREE.Vector3(0, 0, 1).applyQuaternion(g.quaternion); f.y = 0; f.normalize();
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), f);
    milestone(lk); lk.color(carve); lk.set('uIntensity', 1.7); group.add(g);
  }
  const lockups = [L5, L6];

  const E = {
    gain: 1.6,
    zenith: C(0.26, 0.32, 0.58), horizon: C(1.22, 0.86, 0.58), ground: C(0.5, 0.36, 0.26), horizonPow: 0.42,
    sunDir: dir(-22, 7), sunColor: C(3.5, 2.2, 1.15), sunSky: C(3.0, 1.8, 0.9), sunSize: 0.0013, sunGlow: 1.8, sunCore: 24, bands: 0.6,
    fog: C(0.86, 0.64, 0.48), fogSun: C(2.1, 1.3, 0.66), fogSunPow: 5, density: 0.0011, falloff: 0.0045,
    sunI: 3.6, hemiI: 0.85, hemiSky: C(0.55, 0.55, 0.75), hemiGround: C(0.46, 0.32, 0.22), shadowFocus: 90,
  };
  return {
    name: 'the road', t0: T0, t1: T1, group, track, lockups, blurDepth: 26,
    env(t, c) { env(c, E); },
    post(t, P) {
      P.exposure = 1.12; P.bloom = 0.6; P.bloomThreshold = 1.2; P.rays = 0.55; P.vignette = 0.42; P.contrast = 1.06;
      P.veilColor.setRGB(1, 0.96, 0.88); P.veil = 1 - step(t, T0, T0 + 0.4);
      if (t > 30.45) { P.veilColor.setRGB(0.16, 0.12, 0.1); P.veil = step(t, 30.45, 31.0); }
    },
  };
}
