/* 0:58.5–1:02.5 — BENEATH THE SHIPS. Through the window, the sea. The surface is
   a ceiling: Snell's window bright overhead, total internal reflection beyond
   it. Hulls hang at the waterline, their undersides patterned. The line gathers
   on the underside of the surface like a school; we rise to break it. */
import * as THREE from 'three';
import { Track } from '../camera.js';
import { Lockup } from '../type3d.js';
import { FOG, FOG_GLSL } from '../engine.js';
import { makeField } from '../particles.js';
import { std, terrain, fbm, place, env, C, step, mix, mulberry32 } from './kit.js';

const SURF = 100;
export function sea(ctx) {
  const group = new THREE.Group();
  const VERT = `varying vec3 vWorld; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
  const NOISE = `
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }`;

  // the surface, seen from below
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000, 1, 1), new THREE.ShaderMaterial({
    uniforms: { ...FOG }, side: THREE.DoubleSide,
    vertexShader: VERT,
    fragmentShader: `${FOG_GLSL} ${NOISE} uniform float uTime; varying vec3 vWorld;
      void main(){
        vec2 p = vWorld.xz;
        vec2 rip = vec2(noise(p * 0.08 + uTime * 0.5), noise(p * 0.08 - uTime * 0.4 + 5.0)) - 0.5;
        vec3 v = normalize(vWorld - uCamPos);
        float c = v.y + (rip.x + rip.y) * 0.06;                  // cosine to vertical, rippled
        float win = smoothstep(0.62, 0.70, c);                   // Snell's window, critical angle ~48.6 deg
        float ring = exp(-pow((c - 0.66) * 30.0, 2.0));
        vec3 sky = vec3(0.75, 0.92, 0.95) * (1.4 + 0.6 * noise(p * 0.3 + uTime));
        vec3 tir = vec3(0.01, 0.06, 0.07) * (0.7 + 0.6 * noise(p * 0.15 - uTime * 0.2));
        float caust = pow(1.0 - abs(noise(p * 0.35 + uTime * 0.6) - noise(p * 0.42 - uTime * 0.5)), 10.0);
        vec3 col = mix(tir + caust * 0.08, sky, win) + ring * vec3(0.4, 0.7, 0.7);
        gl_FragColor = vec4(mix(col, fogTint(vWorld), fogAmount(vWorld) * 0.85), 1.0);
      }`,
  }));
  surface.rotation.x = Math.PI / 2; surface.position.set(0, SURF, -1000); group.add(surface);

  // hulls with patterned undersides
  const rnd = mulberry32(19);
  const hullMat = new THREE.ShaderMaterial({
    uniforms: { ...FOG },
    vertexShader: `varying vec3 vWorld; varying vec3 vLocal; void main(){ vLocal = position; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `${FOG_GLSL} uniform float uTime; varying vec3 vWorld; varying vec3 vLocal;
      void main(){
        vec2 q = vLocal.xz * vec2(9.0, 3.0);
        float diamonds = abs(fract(abs(q.x) + abs(q.y) * 0.5 + uTime * 0.05) - 0.5);
        float stripes = abs(fract(length(vLocal.xz * vec2(1.0, 2.6)) * 7.0 - uTime * 0.08) - 0.5);
        float pat = smoothstep(0.06, 0.0, min(diamonds, stripes * 1.2));
        vec3 col = vec3(0.004, 0.006, 0.01) + vec3(0.42, 0.38, 0.62) * pat * 0.9;
        gl_FragColor = vec4(mix(col, fogTint(vWorld), fogAmount(vWorld)), 1.0);
      }`,
  });
  const hullGeo = new THREE.SphereGeometry(1, 64, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const hulls = [[-125, -1000, 120, 20, 14], [55, -1060, 150, 26, 16], [-20, -1150, 90, 16, 11], [110, -960, 80, 15, 10], [-140, -1110, 110, 18, 12], [20, -1260, 160, 28, 18]];
  for (const [x, z, L, wdt, d] of hulls) {
    const m = new THREE.Mesh(hullGeo, hullMat); m.scale.set(L / 2, d, wdt / 2); m.position.set(x, SURF, z); m.rotation.y = (rnd() - 0.5) * 0.6;
    group.add(m);
  }

  // light shafts from the surface
  const shaftMat = new THREE.ShaderMaterial({
    uniforms: { ...FOG }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: VERT,
    fragmentShader: `${FOG_GLSL} ${NOISE} uniform float uTime; varying vec3 vWorld; varying vec2 vUv;
      void main(){
        float edge = sin(vUv.x * 3.14159); edge *= edge;
        float n = 0.5 + 0.5 * noise(vec2(vUv.x * 6.0 + uTime * 0.3, vWorld.y * 0.02));
        float a = edge * n * pow(vUv.y, 1.5) * (1.0 - fogAmount(vWorld) * 0.7);
        gl_FragColor = vec4(vec3(0.25, 0.5, 0.48) * a * 0.55, 1.0);
      }`,
  });
  const shafts = [];
  for (let i = 0; i < 16; i++) {
    const w = 6 + rnd() * 20, m = new THREE.Mesh(new THREE.PlaneGeometry(w, 110), shaftMat);
    m.position.set((rnd() - 0.5) * 260, SURF - 55, -900 - rnd() * 400); m.userData.tilt = (rnd() - 0.5) * 0.3;
    shafts.push(m); group.add(m);
  }

  // the seabed far below, and the water's own matter
  const bed = std({ color: C(0.3, 0.32, 0.3), roughness: 1 }, 'bed');
  group.add(terrain((x, z) => fbm(x * 0.01, z * 0.01, 4) * 6 + Math.sin(x * 0.2 + fbm(x * 0.02, z * 0.02, 2) * 6) * 0.6, { x0: -800, x1: 800, z0: -1600, z1: -800, nx: 200, nz: 120 }, bed));
  const snow = makeField({ count: 7000, box: [120, 70, 160], size: 0.06, color: C(0.6, 0.85, 0.85), opacity: 0.7, vel: [0, -0.3, 0], turb: 0.5 });
  group.add(snow.mesh);
  const bubbles = makeField({ count: 2500, box: [40, 40, 60], size: 0.18, color: C(0.8, 1, 1), opacity: 0, vel: [0, 7, 0], turb: 0.6, spark: 1, seed: 3 });
  bubbles.u.uCenter.value.set(0, 0, -12); group.add(bubbles.mesh);

  const track = new Track([
    { t: 58.5, p: [0, 40, -856], l: [0, 46, -1050], fov: 50, cut: true },
    { t: 59.6, p: [0, 44, -880], l: [0, 80, -1050], fov: 52 },
    { t: 61.3, p: [0, 54, -918], l: [0, 86, -1060], fov: 54 },
    { t: 62.0, p: [0, 70, -940], l: [0, 140, -990], fov: 56 },
    { t: 62.5, p: [0, 99.5, -960], l: [0, 170, -990], fov: 58 },
  ]);

  const L5 = new Lockup(ctx.line('L5'), 'seen ~from ^below / _the ~ships / patterned ~innuendo').fx('assemble', [0, 0, 0, 0], 0.5, 7);
  // below the surface and between the hulls, turned to where we will be while it is read
  place(L5, track, 60.4, { dist: 120, fill: 0.58 });
  L5.color(C(0.85, 0.97, 1.0)); L5.set('uIntensity', 1.6); L5.set('uFogMul', 0.45); L5.set('uHalo', 0.35);
  for (const w of L5.words) w.uniforms.uGlowColor.value.setRGB(0.5, 1, 1);
  group.add(L5.group);

  const E = {
    zenith: C(0.02, 0.09, 0.1), horizon: C(0.012, 0.05, 0.058), ground: C(0.004, 0.015, 0.02),
    sunDir: new THREE.Vector3(0, 1, -0.15).normalize(), sunColor: C(0.6, 0.9, 0.9), sunSky: C(0.3, 0.5, 0.5), sunSize: 0, sunGlow: 0.3, sunCore: 0,
    fog: C(0.012, 0.05, 0.058), fogSun: C(0.2, 0.42, 0.42), fogSunPow: 4, density: 0.0105, falloff: 0.0,
    sunI: 1.2, hemiI: 0.5, hemiSky: C(0.2, 0.45, 0.45), hemiGround: C(0.02, 0.05, 0.05),
  };
  return {
    name: 'beneath the ships', t0: 58.5, t1: 62.5, group, track, lockups: [L5], blurDepth: 22,
    env(t, c) { env(c, E); },
    update(t, c) {
      bubbles.u.uOpacity.value = 1 - step(t, 58.6, 59.8);
      for (const s of shafts) { s.lookAt(c.camera.position.x, s.position.y, c.camera.position.z); s.rotateZ(s.userData.tilt); }
    },
    post(t, P) {
      P.exposure = 1.25; P.bloom = 0.7; P.bloomThreshold = 1.0; P.rays = 0.7; P.raysDecay = 0.965; P.vignette = 0.5;
      P.saturation = 1.05; P.split.set(-0.01, 0.02, 0.03);
      P.veilColor.setRGB(0.7, 0.92, 0.95); P.veil = 0.9 * (1 - step(t, 58.5, 58.6));
      if (t > 62.2) { P.veilColor.setRGB(0.95, 0.98, 1); P.veil = step(t, 62.2, 62.5); }
    },
  };
}
