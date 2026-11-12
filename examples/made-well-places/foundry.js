/* 0:31–0:54.2 THE FOUNDRY, and again at 1:34.6–1:58.5 at night, all gold.
   An iron hall the length of a street: a row of trip-hammers beating on hot
   ingots in time with the song, sparks off every blow; a hallmark press; a ladle
   pouring molten metal into floor channels; at the far end a flywheel the size of
   a hill. "So whatever the work got loud" is struck into the air by the first
   hammer; "the mark" comes down with the press; on "close" we skim the falling
   hammers; on "far around" we arc round the flywheel; "(On my way)" carries us
   out to the steam. Built twice, as BDT built its shaft: 'day' or 'night'. */
import * as THREE from 'three';
import { Track } from '../camera.js';
import { Lockup, sequence } from '../type3d.js';
import { FOG, FOG_GLSL } from '../engine.js';
import { makeField } from '../particles.js';
import { std, place, env, C, step, mulberry32, scatter } from './kit.js';
import { iron, thrown, SHAPES, makeSparks, makePuffs, shaft, GOLD } from './mwkit.js';
import { level } from '../drive.js';

const PERIOD = 1.0, PHASE = 0.353;      // a blow every two beats of the song's 120 bpm, on its measured phase
const HX = -26, HZ = (i) => -42 - i * 44, PRESS = new THREE.Vector3(24, 0, -98), WHEEL = new THREE.Vector3(0, 38, -318);

// molten metal: flowing light under a drifting crust
function moltenMat(color, flow = new THREE.Vector2(0, 1)) {
  return new THREE.ShaderMaterial({
    uniforms: { ...FOG, uCol: { value: color.clone() }, uFlow: { value: flow.clone() } },
    vertexShader: `varying vec3 vWorld; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `${FOG_GLSL} uniform float uTime; uniform vec3 uCol; uniform vec2 uFlow; varying vec3 vWorld; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 x){ vec2 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 p = vUv * vec2(3.0, 12.0) - uFlow * uTime * 0.6;
        float n = n2(p) * 0.6 + n2(p * 2.7 + 3.1) * 0.4;
        float crust = smoothstep(0.62, 0.78, n2(p * 1.3 + 9.0));
        vec3 col = uCol * (2.2 + 2.6 * n) * (1.0 - crust * 0.85) + vec3(0.04, 0.02, 0.01) * crust;
        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }`,
  });
}

export function foundry(ctx, o) {
  const { t0, t1, lines, variant = 'day', lead } = o;
  const night = variant === 'night';
  const group = new THREE.Group();
  const rnd = mulberry32(night ? 77 : 33);
  const hot = night ? C(1.0, 0.66, 0.24) : C(1.0, 0.4, 0.11);
  const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; group.add(b); return b; };

  // the hall
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(150, 470), std({ color: C(0.1, 0.085, 0.075), roughness: 0.9 }, 'soot-floor'));
  floor.rotation.x = -Math.PI / 2; floor.position.z = -185; floor.receiveShadow = true; group.add(floor);
  const brick = std({ color: C(0.2, 0.12, 0.09), roughness: 0.92 }, 'brick-foundry');
  box(4, 60, 470, -68, 30, -185, brick); box(4, 60, 470, 68, 30, -185, brick); box(140, 60, 4, 0, 30, 48, brick);
  box(84, 60, 4, -28, 30, -418, brick); box(16, 60, 4, 62, 30, -418, brick); box(40, 26, 4, 34, 47, -418, brick);   // the far wall, its opening to the quench
  const ironM = iron(), roofM = iron('-roof');
  // the roof; at night it is open over the first hammers, where we come down through it
  const open = (z) => night && z < 18 && z > -30;
  for (let z = 40; z > -415; z -= 10) if (!open(z)) box(136, 1.6, 1.2, 0, 54, z, roofM);     // trusses
  if (night) { box(140, 1, 30, 0, 58, 33, roofM); box(140, 1, 390, 0, 58, -225, roofM); box(62, 1, 48, -39, 58, -6, roofM); box(38, 1, 48, 51, 58, -6, roofM); }
  else box(140, 1, 470, 0, 58, -185, roofM);
  // tall windows: cool daylight by day, a deep blue at night
  const winM = new THREE.MeshBasicMaterial({ color: night ? new THREE.Color(0.03, 0.05, 0.12) : new THREE.Color(1.7, 2.0, 2.7) });
  for (let z = 20; z > -400; z -= 30) for (const side of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(8, 26), winM); w.position.set(side * 65.9, 32, z); w.rotation.y = -side * Math.PI / 2; group.add(w);
    if (!night) group.add(shaft(new THREE.Vector3(side * 62, 42, z), new THREE.Vector3(-side * 0.8, -1, -0.15), 60, 7, 2, { color: C(0.6, 0.75, 1.1), amount: 0.04 }));
  }

  // the hammers: frame, head, anvil, an ingot that heats under each blow, sparks
  const hammers = [];
  const ingotM = (k) => new THREE.MeshBasicMaterial({ color: hot.clone().multiplyScalar(4) });
  for (let i = 0; i < 6; i++) {
    const z = HZ(i), phase = PHASE + (i % 2) * 0.5;
    for (const dz of [-5, 5]) box(2.4, 28, 2.4, HX, 14, z + dz, ironM);
    box(4, 3, 14, HX, 28.5, z, ironM);
    box(6, 4, 5.4, HX, 2, z, iron('-anvil'));
    const ingot = box(3.6, 0.9, 2.4, HX, 4.45, z, ingotM(i)); ingot.castShadow = false;
    const head = box(5, 6, 5, HX, 12, z, ironM);
    const sp = makeSparks({ origin: new THREE.Vector3(HX, 5.0, z), axis: new THREE.Vector3(0.45, 1, 0), speed: 15, cone: 1.3, life: 0.95, period: PERIOD, phase, count: 420, bright: 4, seed: 11 + i });
    group.add(sp.mesh);
    const light = new THREE.PointLight(hot.getHex(), 0, 0, 2); light.position.set(HX + 4, 7, z); group.add(light);
    hammers.push({ head, ingot, light, phase });
  }
  const headY = (t, phase) => {
    const tau = (((t - phase) % PERIOD) + PERIOD) % PERIOD;
    if (tau < 0.7) { const u = tau / 0.7; return 7.9 + 12 * (1 - (1 - u) * (1 - u)); }
    const u = (tau - 0.7) / 0.3; return 19.9 - 12 * u * u;
  };

  // the hallmark press, which comes down on "mark"
  const markT = lines[1].words.find((w) => w.text === 'mark').start;
  box(10, 3, 9, PRESS.x, 1.5, PRESS.z, ironM);
  for (const dx of [-5, 5]) box(2, 30, 2, PRESS.x + dx, 15, PRESS.z, ironM);
  box(14, 3, 4, PRESS.x, 31, PRESS.z, ironM);
  const bar = std({ color: GOLD, roughness: 0.3, metalness: 1, emissive: hot.clone().multiplyScalar(0.25) }, 'gold-bar');
  box(4.4, 0.9, 3, PRESS.x, 3.45, PRESS.z, bar);
  const punch = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 9, 32), ironM); punch.position.set(PRESS.x, 20, PRESS.z); punch.castShadow = true; group.add(punch);
  const pressSparks = makeSparks({ origin: new THREE.Vector3(PRESS.x, 4.2, PRESS.z), speed: 18, cone: 1.5, life: 1.1, period: 1000, phase: markT, count: 700, bright: 5, spread: 0.05, seed: 3 });
  group.add(pressSparks.mesh);

  // the pour: a ladle tipping molten metal into channels across the floor
  const ladle = new THREE.Mesh(thrown(SHAPES.bowl, { segs: 48 }), iron('-ladle')); ladle.material.side = THREE.DoubleSide;
  ladle.scale.setScalar(8); ladle.position.set(36, 24, -150); ladle.rotation.z = 0.7; group.add(ladle);
  const pour = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 25, 20, 1, true), moltenMat(hot)); pour.position.set(29, 12.5, -150); group.add(pour);
  const chM = moltenMat(hot, new THREE.Vector2(0, 1));
  const channel = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, len), chM);
    m.rotation.x = -Math.PI / 2; m.rotation.z = Math.atan2(x1 - x0, z1 - z0) + Math.PI; m.position.set((x0 + x1) / 2, 0.12, (z0 + z1) / 2); group.add(m);
  };
  channel(29, -150, -18, -150); channel(-18, -150, -18, 10); channel(-18, -150, -18, -300); channel(-18, -300, 30, -330);
  const pourLight = new THREE.PointLight(hot.getHex(), 0, 0, 2); pourLight.position.set(28, 6, -150); group.add(pourLight);

  // the flywheel, turning on its axle at the far end
  const wheel = new THREE.Group(); wheel.position.copy(WHEEL); group.add(wheel);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(34, 2.4, 14, 120), ironM); rim.castShadow = true; wheel.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 7, 32), ironM); hub.rotation.x = Math.PI / 2; wheel.add(hub);
  for (let k = 0; k < 10; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.8, 33, 1.6), ironM); s.position.y = 17; const a = new THREE.Group(); a.rotation.z = k * Math.PI / 5; a.add(s); wheel.add(a); }
  box(8, 38, 6, 0, 19, -322, ironM);
  const pit = new THREE.Mesh(new THREE.CircleGeometry(18, 48), moltenMat(hot, new THREE.Vector2(0.3, 0.2))); pit.rotation.x = -Math.PI / 2; pit.position.set(0, 0.15, -300); group.add(pit);
  const pitLight = new THREE.PointLight(hot.getHex(), 0, 0, 2); pitLight.position.set(0, 7, -296); group.add(pitLight);
  // a furnace in the far wall behind the wheel, so it turns in silhouette against fire
  const furnace = new THREE.Mesh(new THREE.PlaneGeometry(34, 22), new THREE.MeshBasicMaterial({ color: hot.clone().multiplyScalar(5) }));
  furnace.position.set(-12, 16, -415.8); group.add(furnace);
  const furnaceLight = new THREE.PointLight(hot.getHex(), 0, 0, 2); furnaceLight.position.set(-12, 16, -404); group.add(furnaceLight);
  // the line shaft over the hammers, a pulley and belt down to each; chains; stock and scrap
  const shaftBar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 260, 16), ironM); shaftBar.rotation.x = Math.PI / 2; shaftBar.position.set(HX, 50, -150); group.add(shaftBar);
  const pulleys = [];
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 1.4, 24), ironM); p.rotation.z = Math.PI / 2; p.position.set(HX, 50, HZ(i)); group.add(p); pulleys.push(p);
    box(0.25, 20, 1.0, HX - 2.9, 40, HZ(i), iron('-belt')); box(0.25, 20, 1.0, HX + 2.9, 40, HZ(i), iron('-belt'));
  }
  group.add(scatter(new THREE.CylinderGeometry(0.12, 0.12, 1, 6), iron('-chain'), 60, (i, p, q, s) => {
    // chains near the walls, clear of every camera path
    const len = 6 + rnd() * 26; p.set((rnd() < 0.5 ? -1 : 1) * (40 + rnd() * 22), 54 - len / 2, 30 - rnd() * 210); s.set(1, len, 1);
  }));
  group.add(scatter(new THREE.BoxGeometry(3.2, 0.8, 1.4), iron('-stock'), 420, (i, p, q, s) => {
    const k = i % 60, stack = Math.floor(i / 60); p.set(50 + (k % 6) * 2.2 - (stack % 2) * 0.5, 0.4 + Math.floor(k / 6) * 0.8, -40 - stack * 46 + (k % 3)); q.setFromEuler(new THREE.Euler(0, (Math.floor(k / 6) % 2) * Math.PI / 2, 0));
  }));
  group.add(scatter(new THREE.BoxGeometry(1, 1, 1), iron('-scrap'), 300, (i, p, q, s) => {
    const side = rnd() < 0.5 ? -1 : 1; p.set(side * (56 + rnd() * 8), 0.4, -rnd() * 400 + 30); q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3)); s.set(0.4 + rnd() * 3, 0.3 + rnd(), 0.4 + rnd() * 2);
  }));

  // embers, smoke
  const embers = makeField({ count: 3200, box: [140, 50, 220], size: 0.09, color: hot.clone().multiplyScalar(3), opacity: 0.9, vel: [0.6, 2.2, 0], turb: 2.5, spark: 1, twinkle: 0.6, seed: night ? 5 : 4 });
  group.add(embers.mesh);
  const smoke = makePuffs([new THREE.Vector3(29, 2, -150), ...hammers.map((h) => h.ingot.position.clone())], { per: 26, rise: 3, height: 50, r0: 3, r1: 18, opacity: 0.3, dark: C(0.05, 0.04, 0.035), light: C(0.22, 0.16, 0.12), glowBase: hot.clone().multiplyScalar(0.5), seed: 7 });
  group.add(smoke.mesh);

  // camera: each key is tied to a sung word, so the moves follow the timing
  const W = (li, wi) => lines[li].words[wi].start;
  const keys = night ? [
    { t: t0, p: [24, 96, 46], l: [8, 40, -30], fov: 50, cut: true },
    { t: lead.words[0].start + 0.3, p: [14, 70, 6], l: [6, 34, -40], fov: 52 },
    { t: W(0, 0) + 0.2, p: [4, 26, -38], l: [-26, 8, -88], fov: 52 },
    { t: W(0, 5) + 0.4, p: [-2, 17, -50], l: [-26, 6, -88], fov: 50 },
    { t: W(1, 0) + 0.6, p: [4, 11, -62], l: [24, 6, -98], fov: 50 },
    { t: W(1, 3) + 0.4, p: [12, 10, -72], l: [24, 4, -98], fov: 48 },
    { t: W(1, 5) + 0.35, p: [14, 10, -77], l: [24, 4, -98], fov: 48 },
    { t: W(2, 0) + 0.3, p: [-2, 9, -128], l: [-26, 5, -176], fov: 50 },
    { t: W(2, 6) - 0.6, p: [-10, 7, -146], l: [-26, 5, -176], fov: 52 },
    { t: W(2, 6) + 0.3, p: [-16, 6, -160], l: [-26, 6, -176], fov: 52 },
    { t: W(2, 6) + 1.1, p: [-8, 10, -190], l: [6, 24, -260], fov: 52 },
    { t: W(3, 0) + 0.25, p: [8, 24, -214], l: [0, 38, -318], fov: 52 },
    { t: W(3, 5) - 0.2, p: [44, 42, -262], l: [0, 38, -318], fov: 50 },
    { t: W(4, 0) + 0.4, p: [60, 46, -312], l: [0, 38, -318], fov: 50 },
    { t: W(5, 0) + 0.3, p: [40, 44, -362], l: [0, 38, -318], fov: 52 },
    { t: W(5, 2) + 0.25, p: [36, 38, -372], l: [10, 34, -330], fov: 52 },
    { t: W(5, 2) + 1.4, p: [30, 16, -392], l: [44, 8, -420], fov: 54 },
    { t: t1, p: [38, 10, -404], l: [50, 6, -430], fov: 56 },
  ] : [
    { t: t0, p: [0, 16, 24], l: [-10, 8, -40], fov: 48, cut: true },
    { t: W(0, 0) + 0.1, p: [-2, 11, 2], l: [-20, 7, -40], fov: 48 },
    { t: W(0, 5) + 0.3, p: [-6, 9.5, -7], l: [-26, 6, -42], fov: 48 },
    { t: W(1, 0) + 0.9, p: [2, 10, -40], l: [22, 6, -96], fov: 50 },
    { t: W(1, 3) + 0.4, p: [8, 9.5, -64], l: [24, 5, -98], fov: 48 },
    { t: W(1, 5) + 0.35, p: [10, 9.5, -70], l: [24, 5, -98], fov: 48 },
    { t: W(2, 0) + 0.2, p: [-4, 8.5, -96], l: [-26, 5, -130], fov: 50 },
    { t: W(2, 6) - 0.7, p: [-12, 6.5, -108], l: [-26, 5, -131], fov: 52 },
    { t: W(2, 6) + 0.3, p: [-16, 6, -114], l: [-26, 6, -131], fov: 52 },
    { t: W(2, 6) + 1.1, p: [-10, 10, -140], l: [-8, 22, -210], fov: 52 },
    { t: W(3, 0) + 0.25, p: [-6, 22, -176], l: [0, 36, -318], fov: 52 },
    { t: W(3, 4) + 0.4, p: [-40, 40, -246], l: [0, 38, -318], fov: 50 },
    { t: W(4, 0) + 0.3, p: [-58, 44, -300], l: [0, 38, -318], fov: 50 },
    { t: W(5, 0) - 0.2, p: [-44, 44, -352], l: [0, 38, -318], fov: 52 },
    { t: W(5, 1) - 1.6, p: [8, 30, -372], l: [40, 10, -398], fov: 54 },
    { t: W(5, 2) + 0.05, p: [32, 13, -386], l: [46, 6, -410], fov: 54 },
    { t: t1, p: [40, 9, -394], l: [52, 5, -416], fov: 56 },
  ];
  const track = new Track(keys);

  // the lines
  const metal = night ? C(1.35, 1.0, 0.55) : C(1.35, 0.78, 0.46), gold = C(1.6, 1.15, 0.45);
  const [A, B, D, F, G, H] = lines;
  const LA = new Lockup(A, '_So ~whatever / _the ~work ~got / ^loud').fx('drop', [0, 0, 0, 0], 0.3);
  place(LA, track, night ? W(0, 4) : W(0, 2), { dist: 16, fill: 0.5, dy: 0.06 });
  const LB = new Lockup(B, "~Doesn't ~mean / _the ^!mark / _is ~down").fx('unfold', [1, 0, 0, 0], 0.35);
  LB.words.find((w) => w.text === 'mark').setFx('pop', [0, 0, 0, 0], 0.2);
  place(LB, track, W(1, 3) + 0.3, { dist: 20, fill: 0.38 });
  const LD = new Lockup(D, '_And ~even ~when / _it _all ~gets / ^close').fx('streak', [7, 0, 0, 0], 0.4);
  place(LD, track, W(2, 5), { dist: night ? 20 : 10, fill: night ? 0.4 : 0.46, dx: night ? 0 : 0.06 });
  const LF = new Lockup(F, "_It's ~never ~been / _so ^far / ^around").fx('orbit', [0, 0, 0, 0], 0.4);
  // set before the flywheel, which the camera keeps in view as it arcs: we go far around the words
  place(LF, track, W(3, 4), { at: new THREE.Vector3(0, 33, -296), width: night ? 34 : 40 });
  const LG = new Lockup(G, '^(Oh-oh-oh-oh)').fx('assemble', [0, 0, 0, 0], 0.5, 16);
  place(LG, track, W(4, 0) + 0.3, { dist: 20, fill: 0.5 });
  // the last line splits only where its words are far apart (in chorus 1 "(On" is held 3 s)
  const split = H.words[1].start - H.words[0].start > 1.2;
  const LH = split ? [new Lockup(H, '^' + H.words[0].text, { words: [0, 1] }).fx('condense', [0, 0, 0, 0], 0.5),
    new Lockup(H, '~' + H.words[1].text + ' ^' + H.words[2].text, { words: [1, 3] }).fx('streak', [10, 0, 0, 0], 0.4)]
    : [new Lockup(H, '^' + H.words[0].text + ' ~' + H.words[1].text + ' / ^' + H.words[2].text).fx('condense', [0, 0, 0, 0], 0.5)];
  if (split) { place(LH[0], track, W(5, 0) + 0.2, { dist: 30, fill: 0.28, dx: -0.1 }); place(LH[1], track, W(5, 1) + 0.15, { dist: 26, fill: 0.42, dx: 0.04 }); }
  else place(LH[0], track, W(5, 1) + 0.3, { dist: 28, fill: 0.4 });
  const lockups = [LA, LB, LD, LF, LG, ...LH];
  if (lead) {
    const LL = new Lockup(lead, '~on ~our / ^way').fx('condense', [0, 0, 0, 0], 0.5);
    place(LL, track, lead.words[1].start, { dist: 34, fill: 0.36 });
    lockups.unshift(LL);
  }
  sequence(lockups);
  for (const l of lockups) { l.color(metal, gold); l.set('uIntensity', 1.9); l.set('uFogMul', 0.35); group.add(l.group); }
  LG.color(gold); for (const l of LH) l.color(gold);

  const E = night ? {
    gain: 1, zenith: C(0.01, 0.012, 0.03), horizon: C(0.04, 0.05, 0.1), ground: C(0.01, 0.01, 0.01),
    sunDir: new THREE.Vector3(-0.6, 0.5, -0.3).normalize(), sunColor: C(0.3, 0.36, 0.6), sunSky: C(0, 0, 0), sunSize: 0, sunGlow: 0, sunCore: 0, stars: night ? 0.8 : 0,
    fog: C(0.07, 0.05, 0.035), fogSun: C(0.2, 0.15, 0.1), fogSunPow: 6, density: 0.005, falloff: 0.006,
    sunI: 0.5, hemiI: 0.5, hemiSky: C(0.2, 0.24, 0.42), hemiGround: C(0.6, 0.36, 0.12), shadowFocus: 60,
  } : {
    gain: 1.2, zenith: C(0.3, 0.38, 0.6), horizon: C(0.7, 0.75, 0.85), ground: C(0.12, 0.1, 0.09),
    sunDir: new THREE.Vector3(-0.8, 0.55, -0.2).normalize(), sunColor: C(0.9, 1.05, 1.4), sunSky: C(0.8, 0.85, 1.0), sunSize: 0, sunGlow: 0, sunCore: 0,
    fog: C(0.11, 0.07, 0.045), fogSun: C(0.5, 0.32, 0.18), fogSunPow: 4, density: 0.005, falloff: 0.008,
    sunI: 1.4, hemiI: 0.6, hemiSky: C(0.28, 0.33, 0.48), hemiGround: C(0.55, 0.26, 0.1), shadowFocus: 60,
  };
  return {
    name: night ? 'the night foundry' : 'the foundry', t0, t1, group, track, lockups, blurDepth: 20,
    env(t, c) { env(c, E); },
    update(t) {
      for (const h of hammers) {
        h.head.position.y = headY(t, h.phase);
        const since = (((t - h.phase) % PERIOD) + PERIOD) % PERIOD;
        const flash = Math.exp(-since / 0.12);
        h.light.intensity = (night ? 16000 : 13000) * (0.55 + 1.6 * flash);
        h.ingot.material.color.copy(hot).multiplyScalar(3 + 5 * flash);
      }
      const dt = t - markT;
      punch.position.y = dt < -0.12 ? 20 : dt < 0 ? 20 - (dt + 0.12) / 0.12 * 12.1 : dt < 0.15 ? 7.9 : Math.min(20, 7.9 + (dt - 0.15) / 0.8 * 12.1);
      bar.emissive.copy(hot).multiplyScalar(0.25 + 1.6 * Math.exp(-Math.max(0, dt) / 0.5) * (dt > 0 ? 1 : 0));
      pourLight.intensity = 30000 * (0.9 + 0.2 * Math.sin(t * 9) + 0.3 * level(t));
      pitLight.intensity = 60000 * (0.9 + 0.15 * Math.sin(t * 5.3) + 0.3 * level(t));
      furnaceLight.intensity = 90000 * (0.85 + 0.15 * Math.sin(t * 3.7));
      for (const p of pulleys) p.rotation.x = t * 2.4;
      wheel.rotation.z = -0.32 * t;
    },
    post(t, P) {
      P.exposure = night ? 1.5 : 1.42; P.bloom = 0.85; P.bloomThreshold = 1.0; P.vignette = 0.5; P.contrast = 1.08;
      P.veilColor.setRGB(0.16, 0.12, 0.1); P.veil = 1 - step(t, t0, t0 + 0.45);
      if (t > t1 - 0.55) { if (night) P.veilColor.setRGB(1.0, 0.78, 0.38); else P.veilColor.setRGB(0.95, 0.95, 0.96); P.veil = step(t, t1 - 0.55, t1); }
    },
  };
}
