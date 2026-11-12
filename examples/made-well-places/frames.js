/* 1:04.4–1:22.6 — THE FRAMES. Out of the steam we are behind a strip of film the
   height of a tower, its frames a reel of a pot being thrown; "Came" lands in the
   frame and we fly through it as the world turns a quarter turn — "all out of
   frame". A dried lakebed, cracked into plates, strips of film standing on it
   like monoliths, glowing amber against the low sun. "no matter what had dried up
   first" on the mud; "there's no mistake" against the strips; on "break" the
   ground splits and gold wells up through the cracks, and "on our way" rises out
   of it, twice, as we ride the gold toward the horizon. */
import * as THREE from 'three';
import { Track } from '../camera.js';
import { Lockup, sequence } from '../type3d.js';
import { FOG, FOG_GLSL } from '../engine.js';
import { std, place, env, C, dir, step, mulberry32, scatter } from './kit.js';
import { cracked, dryClay, GOLD } from './mwkit.js';

// celluloid: amber base, sprocket holes cut through, a reel of frames, each showing a
// thrown pot at a slightly different turn; bright when the sun is behind it
function filmMat(seed) {
  return new THREE.ShaderMaterial({
    uniforms: { ...FOG, uSeed: { value: seed } }, side: THREE.DoubleSide, transparent: true,
    vertexShader: `varying vec2 vUv; varying vec3 vWorld; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`${FOG_GLSL}
      uniform float uSeed, uTime; varying vec2 vUv; varying vec3 vWorld;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        // strip is 14 x 64 m: uv.x across, uv.y along
        vec2 m = vec2(vUv.x * 14.0, vUv.y * 64.0);
        float edge = step(m.x, 1.0) + step(13.0, m.x);
        vec2 sp = vec2(m.x < 7.0 ? m.x - 0.5 : m.x - 13.5, mod(m.y, 1.9) - 0.95);
        if (edge > 0.5 && abs(sp.x) < 0.32 && abs(sp.y) < 0.42) discard;              // sprocket holes
        float fy = mod(m.y, 10.0), fi = floor(m.y / 10.0);
        float bar = step(fy, 1.0);
        vec2 f = vec2((m.x - 7.0) / 6.0, (fy - 5.5) / 4.5);                            // -1..1 inside a frame
        // the pot: a lathe silhouette whose belly swells and leans from frame to frame
        float yy = f.y * 1.2 + 0.1, turn = sin(fi * 0.9 + uSeed) * 0.12;
        float r = 0.28 + 0.34 * exp(-pow((yy + 0.25) * 1.9, 2.0)) - 0.1 * smoothstep(0.4, 0.9, yy) + 0.06 * smoothstep(0.8, 1.0, yy);
        float pot = step(abs(f.x - turn * yy), r) * step(-0.95, yy) * step(yy, 1.0);
        float vig = 1.0 - 0.5 * dot(f, f) * 0.5;
        vec3 base = vec3(1.0, 0.62, 0.26);
        float dens = mix(0.35, 0.9, pot) * vig;
        // wear: vertical scratches and dust
        float scratch = step(0.985, h(vec2(floor(m.x * 7.0), uSeed))) * step(0.3, h(vec2(floor(m.x * 7.0), floor(m.y * 0.2))));
        float dust = step(0.997, h(floor(m * 9.0) + uSeed));
        vec3 v = normalize(vWorld - uCamPos);
        float back = 0.3 + 2.4 * pow(max(dot(v, uSunDir), 0.0), 2.5);
        vec3 col = base * (1.0 - dens * 0.85) * back * (1.0 - bar * 0.85);
        col = mix(col, vec3(0.04, 0.025, 0.015), edge * 0.85);
        col = mix(col, vec3(1.2, 1.0, 0.8) * back, scratch * 0.5) * (1.0 - dust * 0.8);
        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }`,
  });
}

export function frames(ctx) {
  const group = new THREE.Group();
  const T0 = 64.4, T1 = 82.6;
  const rnd = mulberry32(6440);
  const L = (id) => ctx.line(id);
  const breakT = L('L16').words[2].start;
  const FLOOD = new THREE.Vector2(10, -236);

  // the lakebed: cracked plates; gold floods the cracks after "break"
  const mud = std({ color: C(0.74, 0.6, 0.47), roughness: 0.95 }, 'mud');
  const crackU = cracked(mud, { scale: 0.1, width: 0.03, at: FLOOD, glow: 2.4 });
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200), mud);
  bed.rotation.x = -Math.PI / 2; bed.position.z = -600; bed.receiveShadow = true; group.add(bed);
  // shards of old pots on the mud
  group.add(scatter(new THREE.IcosahedronGeometry(1, 0), dryClay('-shard'), 900, (i, p, q, s) => {
    p.set((rnd() - 0.5) * 300, 0.1, -rnd() * 520); q.setFromEuler(new THREE.Euler(rnd() * 0.4, rnd() * 6, rnd() * 0.4)); s.set(0.4 + rnd() * 1.2, 0.08 + rnd() * 0.12, 0.3 + rnd() * 0.8);
  }));
  // strips of film: the one we fly through, and others standing across the lakebed
  const strips = [[0, 0, 0, 0], [-62, -122, 0.12, 0.04], [44, -150, -0.3, -0.05], [76, -214, 0.2, 0.03], [-34, -236, 0.5, -0.06],
    [28, -290, -0.1, 0.05], [-74, -318, 0.3, 0.0], [62, -352, 0.1, -0.04], [-12, -420, -0.2, 0.06], [96, -460, 0.4, 0.02], [-90, -500, -0.3, -0.03]];
  strips.forEach(([x, z, yaw, lean], i) => {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(14, 64), filmMat(i * 1.7 + 0.3));
    s.position.set(x, 32 - (i === 0 ? 26.5 : 0), z); s.rotation.set(0, yaw, lean); s.renderOrder = 2; group.add(s);
  });

  const track = new Track([
    { t: T0, p: [0, 12, 30], l: [0, 11.5, 0], fov: 50, cut: true },
    { t: 65.6, p: [0, 11, 12], l: [0, 11, -40], fov: 50, roll: 0 },
    { t: 66.8, p: [0, 10, -6], l: [0, 9, -70], fov: 54, roll: 90 },
    { t: 67.9, p: [0, 8, -26], l: [0, 6, -90], fov: 54, roll: 90 },
    { t: 69.3, p: [-2, 15, -44], l: [-5, 0, -76], fov: 52, roll: 0 },
    { t: 71.6, p: [-3, 14, -54], l: [-6, 0, -90], fov: 52 },
    { t: 72.5, p: [-2, 8, -104], l: [20, 20, -200], fov: 50 },
    { t: 74.2, p: [2, 9, -132], l: [26, 18, -222], fov: 50 },
    { t: 75.6, p: [6, 14, -156], l: [10, 0, -240], fov: 52 },
    { t: 76.9, p: [8, 15, -172], l: [10, 0, -256], fov: 52 },
    { t: 78.2, p: [10, 6, -198], l: [14, 3, -262], fov: 54 },
    { t: 80.2, p: [14, 5, -252], l: [20, 3, -332], fov: 54 },
    { t: 81.8, p: [18, 7, -300], l: [24, 5, -382], fov: 56 },
    { t: T1, p: [22, 7, -340], l: [30, 6, -440], fov: 58 },
  ]);

  // the lines
  const ink = C(0.98, 0.92, 0.82), gold = C(1.6, 1.12, 0.42);
  const l13 = L('L13');
  const A1 = new Lockup(l13, '^Came', { words: [0, 1] }).fx('condense', [0, 0, 0, 0], 0.5);
  place(A1, track, 65.1, { at: new THREE.Vector3(0, 11, 0.06), plane: 'plane', normal: new THREE.Vector3(0, 0, 1), xdir: new THREE.Vector3(1, 0, 0), width: 6 });
  A1.exit(66.0, 66.35);
  const A2 = new Lockup(l13, '_all _out _of / ^frame', { words: [1, 5] }).fx('streak', [8, 0, 0, 0], 0.4);
  place(A2, track, 67.55, { dist: 22, fill: 0.48 });
  const B = new Lockup(L('L14'), '~no ~matter ~what / _had ^dried / ~up ~first').fx('unfold', [1, 0, 0, 0], 0.35);
  place(B, track, 71.2, { plane: 'floor', y: 0.05, dy: 0.06, fill: 0.42 });
  const D = new Lockup(L('L15'), "_there's _no / ^mistake").fx('flip', [0, 0, 0, 0], 0.4);
  place(D, track, 73.2, { dist: 40, fill: 0.46, dy: 0.04 });
  const F = new Lockup(L('L16'), '_just _the / ^break').fx('drop', [0, 0, 0, 0], 0.3);
  place(F, track, 75.9, { dist: 34, fill: 0.42, dy: 0.1 });
  const G = new Lockup(L('L17'), '~on ~our / ^way').fx('rise', [0.6, 0, 0, 0], 0.4);
  place(G, track, 78.3, { dist: 30, fill: 0.4, dy: 0.04 });
  const H = new Lockup(L('L18'), '~on ~our / ^way').fx('rise', [0.6, 0, 0, 0], 0.4);
  place(H, track, 81.65, { dist: 30, fill: 0.34, dy: -0.08 });
  // the gold lines rise from the cracks: their lowest row must stand clear of the mud
  for (const l of [G, H]) l.group.position.y = Math.max(l.group.position.y, l.height * l.group.scale.y / 2 + 0.6);
  sequence([A2, B, D, F, G, H]);
  const lockups = [A1, A2, B, D, F, G, H];
  for (const l of lockups) { l.color(ink); l.set('uIntensity', 1.7); group.add(l.group); }
  for (const l of [G, H]) { l.color(gold); l.set('uIntensity', 2.1); }
  // dark ink where the ground and sky are pale, with a pale halo to part it from the cracks
  for (const l of [B, D, F]) { l.color(C(0.1, 0.075, 0.06)); l.set('uIntensity', 1.0); l.set('uHalo', 0.4); for (const w of l.words) w.uniforms.uHaloColor.value.setRGB(0.95, 0.88, 0.78); }

  const E = {
    gain: 1.55,
    zenith: C(0.3, 0.38, 0.6), horizon: C(1.15, 0.92, 0.7), ground: C(0.6, 0.48, 0.38), horizonPow: 0.45,
    sunDir: dir(-8, 13), sunColor: C(3.6, 2.5, 1.5), sunSky: C(3.0, 2.0, 1.1), sunSize: 0.0012, sunGlow: 1.6, sunCore: 24, bands: 0.5,
    fog: C(0.9, 0.72, 0.56), fogSun: C(2.2, 1.5, 0.8), fogSunPow: 5, density: 0.0012, falloff: 0.006,
    sunI: 3.8, hemiI: 0.9, hemiSky: C(0.55, 0.58, 0.8), hemiGround: C(0.55, 0.42, 0.3), shadowFocus: 90,
  };
  return {
    name: 'the frames', t0: T0, t1: T1, group, track, lockups, blurDepth: 26,
    env(t, c) { env(c, E); },
    update(t) { crackU.uFlood.value = Math.max(0, (t - breakT) * 60); },
    post(t, P) {
      P.exposure = 1.1; P.bloom = 0.7; P.bloomThreshold = 1.15; P.rays = 0.6; P.vignette = 0.42; P.contrast = 1.07;
      P.veilColor.setRGB(0.98, 0.97, 0.95); P.veil = 1 - step(t, T0, T0 + 0.45);
      if (t > 82.05) { P.veilColor.setRGB(1.0, 0.8, 0.42); P.veil = step(t, 82.05, 82.6); }
    },
  };
}
