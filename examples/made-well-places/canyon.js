/* 1:58.5–2:22 — THE GOLD CANYON. The break, the loudest part of the song, and no
   words: a fast flight down a winding gorge at dusk. Its walls are terraced rock
   mended with gold, veins of it glowing through the stone, and a river of molten
   gold runs on its floor. The camera speeds up into the loudest bars, banking
   through the bends, and climbs out into the stars at the end. */
import * as THREE from 'three';
import { Track } from '../camera.js';
import { FOG, FOG_GLSL } from '../engine.js';
import { makeField } from '../particles.js';
import { std, terrain, env, C, dir, step, fbm, mulberry32 } from './kit.js';
import { seams, GOLD } from './mwkit.js';
import { level } from '../drive.js';

export function canyon(ctx) {
  const group = new THREE.Group();
  const T0 = 118.5, T1 = 142.0, TOP = 130;
  const cx = (z) => 120 * Math.sin(z / 520) + 38 * Math.sin(z / 170 + 1.3);
  const half = (z) => 34 + 18 * Math.sin(z / 300 + 0.7);
  const floorY = (z) => 4 + 2 * fbm(cx(z) * 0.01, z * 0.01, 2);
  const ground = (x, z) => {
    const d = Math.abs(x - cx(z)), w = half(z);
    const k = Math.max(0, Math.min(1, (d - w) / 46));
    const wall = k * k * (3 - 2 * k);
    const terr = Math.floor(wall * TOP / 17 + fbm(x * 0.01, z * 0.01, 2) * 1.2) * 17;              // ledges every 17 m
    const h = floorY(z) + (wall * TOP * 0.55 + terr * 0.45) + 9 * fbm(x * 0.02 + 5, z * 0.02, 4) * wall + 3 * fbm(x * 0.07, z * 0.07, 3);
    return h;
  };
  const rock = std({ color: C(0.62, 0.4, 0.27), roughness: 0.9 }, 'canyon');
  seams(rock, { scale: 0.02, width: 0.008, glow: 1.3, keep: 0.42 });
  const land = terrain(ground, { x0: -420, x1: 420, z0: -2700, z1: 60, nx: 300, nz: 920 }, rock);
  group.add(land);
  // the river of molten gold down the middle of the floor
  const n = 1400, rg = new THREE.PlaneGeometry(16, 2760, 4, n); rg.rotateX(-Math.PI / 2); rg.translate(0, 0, -1320);
  const rp = rg.attributes.position;
  for (let i = 0; i < rp.count; i++) { const z = rp.getZ(i), x = rp.getX(i) * (0.6 + 0.4 * Math.sin(z / 90)) + cx(z); rp.setXYZ(i, x, floorY(z) + 0.6, z); }
  const river = new THREE.Mesh(rg, new THREE.ShaderMaterial({
    uniforms: { ...FOG, uCol: { value: GOLD.clone() } },
    vertexShader: `varying vec3 vWorld; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `${FOG_GLSL} uniform float uTime; uniform vec3 uCol; varying vec3 vWorld; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 x){ vec2 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 p = vec2(vUv.x * 4.0, vWorld.z * 0.08 + uTime * 2.2);
        float n = n2(p) * 0.6 + n2(p * 2.3 + 4.0) * 0.4;
        float edge = smoothstep(0.0, 0.2, vUv.x) * (1.0 - smoothstep(0.8, 1.0, vUv.x));
        vec3 col = uCol * (1.1 + 1.3 * n) * edge + vec3(0.05, 0.03, 0.01) * (1.0 - edge);
        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }`,
  }));
  group.add(river);
  const embers = makeField({ count: 4500, box: [160, 90, 260], size: 0.12, color: GOLD.clone().multiplyScalar(3), opacity: 1, vel: [0.5, 4, 0], turb: 3, spark: 1, twinkle: 0.7, seed: 13 });
  group.add(embers.mesh);

  // the flight: speed ramps into the loudest bars; banking from the bend of the centre line
  const dist = [], keys = [];
  let z = 0;
  for (let t = T0, k = 0; t <= T1 + 1e-6; t += 0.9, k++) {
    const v = 46 + 62 * step(t, 124, 134) - 20 * step(t, 139.5, 142);
    const climb = step(t, 139.0, 142.0);
    const zz = z, ahead = zz - 90;
    const curv = (cx(zz - 30) - 2 * cx(zz) + cx(zz + 30)) / 900;
    keys.push({ t, p: [cx(zz), floorY(zz) + 16 + climb * 140, zz], l: [cx(ahead), floorY(ahead) + 10 + climb * 260, ahead], fov: 54 + 6 * step(t, 124, 134), roll: THREE.MathUtils.clamp(-curv * 9000, -26, 26) * (1 - climb), ...(k === 0 ? { cut: true } : {}) });
    z -= v * 0.9;
  }
  const track = new Track(keys);

  const E = {
    gain: 1.2,
    zenith: C(0.03, 0.05, 0.14), horizon: C(0.9, 0.42, 0.2), ground: C(0.12, 0.08, 0.07), horizonPow: 0.35,
    sunDir: dir(70, 11), sunColor: C(3.4, 1.8, 0.9), sunSky: C(2.6, 1.2, 0.5), sunSize: 0.0012, sunGlow: 1.4, sunCore: 14, stars: 0.4,
    fog: C(0.32, 0.17, 0.12), fogSun: C(1.4, 0.7, 0.3), fogSunPow: 4, density: 0.0016, falloff: 0.006,
    sunI: 3.2, hemiI: 1.5, hemiSky: C(0.34, 0.4, 0.7), hemiGround: C(0.62, 0.38, 0.16), shadowFocus: 90,
  };
  return {
    name: 'the gold canyon', t0: T0, t1: T1, group, track, lockups: [], blurDepth: 34,
    env(t, c) { env(c, E); },
    update(t) { embers.u.uOpacity.value = 0.7 + 0.8 * level(t); },
    post(t, P) {
      P.exposure = 1.6 + 0.2 * level(t); P.lookPower = 1.14; P.bloom = 0.8; P.bloomThreshold = 1.0; P.rays = 0.4; P.vignette = 0.5; P.contrast = 1.08;
      P.veilColor.setRGB(1.0, 0.78, 0.38); P.veil = 1 - step(t, T0, T0 + 0.5);
      if (t > 141.5) { P.veilColor.setRGB(0.02, 0.02, 0.04); P.veil = step(t, 141.5, 142.0); }
    },
  };
}
