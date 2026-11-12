/* 1:22.6–1:34.6 — THE WELL. Night, a stone well in a field under the moon. We go
   down it: "Make me what will I say" on its wall, a lantern coming down with us;
   at the bottom the water holds the circle of sky at the mouth, stars and all,
   shivering — "see all the shimmers glistening". We turn and look up the shaft
   and rise out of it as gold stars join into constellations — "stars that won't
   fade" — and out over the dark land, "on our way", toward a glow on the horizon. */
import * as THREE from 'three';
import { Track } from '../camera.js';
import { Lockup, sequence } from '../type3d.js';
import { FOG, FOG_GLSL } from '../engine.js';
import { std, terrain, place, env, C, dir, step, fbm, mulberry32, scatter } from './kit.js';
import { tuft, wood, makePuffs, GOLD } from './mwkit.js';

const DEPTH = 58, R = 5.5;

export function well(ctx) {
  const group = new THREE.Group();
  const T0 = 82.6, T1 = 94.6;
  const rnd = mulberry32(8260);
  const L = (id) => ctx.line(id);

  // the field
  const field = (x, z) => { const r = Math.hypot(x, z); return (6 * fbm(x * 0.004, z * 0.004, 4) + 2 * fbm(x * 0.02, z * 0.02, 3)) * Math.min(1, Math.max(0, r - 9) / 40); };
  const fieldMesh = terrain(field, { x0: -700, x1: 700, z0: -900, z1: 400, nx: 240, nz: 220 }, std({ color: C(0.32, 0.3, 0.22), roughness: 0.95 }, 'floor-field'));
  {   // a hole where the well is, its ragged edge hidden under the rim
    const g = fieldMesh.geometry, p = g.attributes.position, idx = g.index.array, keep = [];
    for (let i = 0; i < idx.length; i += 3) {
      const cxp = (p.getX(idx[i]) + p.getX(idx[i + 1]) + p.getX(idx[i + 2])) / 3, czp = (p.getZ(idx[i]) + p.getZ(idx[i + 1]) + p.getZ(idx[i + 2])) / 3;
      if (Math.hypot(cxp, czp) > R + 1.0) keep.push(idx[i], idx[i + 1], idx[i + 2]);
    }
    g.setIndex(keep);
  }
  group.add(fieldMesh);
  group.add(scatter(tuft(9, rnd), std({ color: C(0.45, 0.42, 0.3), roughness: 0.9, side: THREE.DoubleSide }, 'floor-grass'), 7000, (i, p, q, s) => {
    const a = rnd() * 6.28, r = 7 + Math.pow(rnd(), 1.4) * 160, x = Math.cos(a) * r, z = Math.sin(a) * r;
    p.set(x, field(x, z) - 0.05, z); q.setFromEuler(new THREE.Euler(0, rnd() * 6, 0)); s.setScalar(0.7 + rnd() * 1.2);
  }));

  // the shaft: stone blocks in courses, mortar between, seen from inside
  const sg = new THREE.CylinderGeometry(R, R, DEPTH + 2, 192, 150, true); sg.translate(0, -DEPTH / 2 + 1, 0);
  const sp = sg.attributes.position, cols = [], v = new THREE.Vector3();
  for (let i = 0; i < sp.count; i++) {
    v.fromBufferAttribute(sp, i);
    const a = Math.atan2(v.z, v.x), row = Math.floor((v.y + 100) / 0.82), u = (a / (Math.PI * 2) + 0.5) * 44 + (row % 2) * 0.5;
    const col = Math.floor(u), fu = u - col, fv = (v.y + 100) / 0.82 - row;
    const mortar = Math.min(fu, 1 - fu, fv * 0.8, (1 - fv) * 0.8) < 0.06 ? 1 : 0;
    const blockR = Math.abs(Math.sin(col * 12.9898 + row * 78.233) * 43758.5453) % 1;
    const k = 1 + mortar * 0.018 - blockR * 0.012 + 0.006 * fbm(a * 6, v.y * 0.6, 2);
    sp.setXYZ(i, v.x * k, v.y, v.z * k);
    const c = mortar ? 0.16 : 0.34 + blockR * 0.18;
    cols.push(c * 1.05, c, c * 0.9);
  }
  sg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); sg.computeVertexNormals();
  const shaftM = std({ vertexColors: true, roughness: 0.92, side: THREE.BackSide }, 'wellstone');
  const shaft = new THREE.Mesh(sg, shaftM); shaft.receiveShadow = true; group.add(shaft);
  // the rim, the frame with its pulley, rope and bucket
  const stone = std({ color: C(0.42, 0.4, 0.36), roughness: 0.9 }, 'wellstone-rim');
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(R + 1.4, R + 1.6, 1.6, 64, 1, true), stone); rim.position.y = 0.6; group.add(rim);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(R + 0.7, 0.75, 10, 64), stone); lip.rotation.x = Math.PI / 2; lip.position.y = 1.4; group.add(lip);
  const timber = wood();
  for (const x of [-R - 1.2, R + 1.2]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, 0.6), timber); p.position.set(x, 4.4, 0); group.add(p); }
  const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2 * R + 3.2, 12), timber); cross.rotation.z = Math.PI / 2; cross.position.y = 7.6; group.add(cross);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), std({ color: C(0.5, 0.42, 0.3), roughness: 0.9 }, 'wood-rope')); group.add(rope);
  const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: C(5, 3, 1.4) })); group.add(lantern);
  const lamp = new THREE.PointLight(0xffb060, 0, 0, 2); group.add(lamp);

  // the water at the bottom: it can only mirror the circle of sky at the mouth
  const water = new THREE.Mesh(new THREE.CircleGeometry(R + 0.2, 64), new THREE.ShaderMaterial({
    uniforms: { ...FOG, ...ctx.sky.u },
    vertexShader: `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`${FOG_GLSL}
      uniform vec3 uZenith, uHorizon, uMoonDir; uniform float uTime, uStars, uMoon;
      varying vec3 vWorld;
      float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      vec2 rip(vec2 p){ float a = 0.0, b = 0.0;
        for (int i = 0; i < 4; i++) { float f = 1.7 + float(i) * 1.3, s = uTime * (1.1 + float(i) * 0.4);
          a += sin(p.x * f + s + float(i)) * cos(p.y * f * 0.8 - s * 0.7); b += cos(p.y * f + s * 0.9) * sin(p.x * f * 0.7 + s); }
        return vec2(a, b) * 0.05; }
      void main(){
        vec2 g = rip(vWorld.xz);
        vec3 n = normalize(vec3(g.x, 1.0, g.y));
        vec3 v = normalize(vWorld - uCamPos);
        vec3 r = reflect(v, n);
        // the circle of sky at the mouth, drawn wider than the true 5 degrees so its stars show
        float open = smoothstep(0.955, 0.985, r.y);
        vec3 sky = mix(uHorizon, uZenith, 0.85);
        vec3 gq = floor(r * 420.0); float s = h3(gq);
        sky += vec3(0.95, 0.97, 1.0) * step(0.996, s) * (uStars + 0.6) * 4.0 * (0.6 + 0.4 * sin(uTime * (2.0 + s * 4.0) + s * 40.0));
        sky += vec3(0.85, 0.88, 1.0) * pow(max(dot(r, uMoonDir), 0.0), 60.0) * uMoon * 3.0;
        vec3 wall = vec3(0.03, 0.025, 0.02) + vec3(0.35, 0.2, 0.08) * pow(max(n.y, 0.0), 30.0) * 0.4;
        vec3 col = mix(wall, sky * 1.4, open);
        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }`,
  }));
  water.rotation.x = -Math.PI / 2; water.position.y = -DEPTH; group.add(water);

  // gold stars that join into constellations, from the zenith outward
  const N = 90, sp3 = [], order = [];
  for (let i = 0; i < N; i++) {
    const el = THREE.MathUtils.degToRad(48 + Math.pow(rnd(), 0.6) * 42 * (i < 10 ? 0.1 : 1)), az = rnd() * Math.PI * 2, rr = 700;
    const p = new THREE.Vector3(Math.cos(az) * Math.cos(el) * rr, Math.sin(el) * rr, Math.sin(az) * Math.cos(el) * rr - 60);
    sp3.push(p); order.push(1 - (el - THREE.MathUtils.degToRad(48)) / THREE.MathUtils.degToRad(42));
  }
  const linePos = [], lineOrd = [];
  sp3.forEach((p, i) => {
    const near = sp3.map((q, j) => [q.distanceTo(p), j]).filter(([d, j]) => j !== i && d < 190).sort((a, b) => a[0] - b[0]).slice(0, 2);
    for (const [, j] of near) if (j > i) { linePos.push(p.x, p.y, p.z, sp3[j].x, sp3[j].y, sp3[j].z); lineOrd.push(Math.max(order[i], order[j]), Math.max(order[i], order[j])); }
  });
  const starU = { ...FOG, uReveal: { value: 0 }, uCol: { value: GOLD.clone().multiplyScalar(3.4) } };
  const starV = `attribute float aOrd; uniform float uReveal; varying float vA; void main(){ vA = smoothstep(aOrd, aOrd + 0.12, uReveal * 1.12);
    vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = 5.0; gl_Position = projectionMatrix * mv; }`;
  const starF = `uniform vec3 uCol; varying float vA; void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(uCol * vA, 1.0); }`;
  const sg2 = new THREE.BufferGeometry().setFromPoints(sp3); sg2.setAttribute('aOrd', new THREE.Float32BufferAttribute(order, 1));
  const stars = new THREE.Points(sg2, new THREE.ShaderMaterial({ uniforms: starU, vertexShader: starV, fragmentShader: starF.replace('gl_FragColor', 'float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3)); lg.setAttribute('aOrd', new THREE.Float32BufferAttribute(lineOrd, 1));
  const lines = new THREE.LineSegments(lg, new THREE.ShaderMaterial({ uniforms: { ...starU, uCol: { value: GOLD.clone().multiplyScalar(1.4) }, uReveal: starU.uReveal }, vertexShader: starV, fragmentShader: starF, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  for (const o of [stars, lines]) { o.frustumCulled = false; o.renderOrder = 3; group.add(o); }
  // the glow on the horizon we head for: the night foundry's fires and smoke
  const glow = makePuffs([new THREE.Vector3(-40, 0, -820), new THREE.Vector3(10, 0, -840), new THREE.Vector3(60, 0, -810)], { per: 30, rise: 6, height: 260, r0: 20, r1: 90, opacity: 0.4,
    dark: C(0.06, 0.04, 0.035), light: C(0.25, 0.14, 0.08), glowBase: C(2.4, 1.1, 0.3), seed: 41 });
  group.add(glow.mesh);

  const down = [0, 0, -1], upv = [0, 0, 1];
  const track = new Track([
    { t: T0, p: [0, 13, 12], l: [0, -6, -4], fov: 58, cut: true },
    { t: 83.4, p: [0, 1, 2.6], l: [0, -5, -6], fov: 58 },
    { t: 84.7, p: [0, -2.5, 1.8], l: [0, -5, -6], fov: 58, hold: true },     // a breath, then the plunge
    { t: 85.25, p: [0, -43, 0], l: [0, -DEPTH, 0.01], fov: 62, up: down },
    { t: 86.9, p: [0, -50, 0], l: [0, -DEPTH, 0.01], fov: 62, up: down },
    { t: 87.25, p: [0, -52.5, 0.5], l: [0, -52.5, -10], fov: 62 },             // level for an instant: the up vector turns over
    { t: 87.6, p: [0, -53, 0], l: [0, 0, 0.01], fov: 62, up: upv },
    { t: 88.45, p: [0, 4, 0], l: [0, 80, -6], fov: 60, up: upv },              // shot out of the well
    { t: 89.6, p: [0, 20, -6], l: [0, 120, -40], fov: 58, up: upv },
    { t: 91.2, p: [0, 30, -14], l: [0, 120, -70], fov: 56 },
    { t: 92.6, p: [0, 34, -30], l: [0, 95, -170], fov: 56 },
    { t: 93.6, p: [0, 40, -50], l: [0, 12, -500], fov: 54 },
    { t: T1, p: [0, 46, -88], l: [0, 4, -600], fov: 56 },
  ]);

  // the lines
  const cream = C(0.97, 0.92, 0.84), silver = C(0.88, 0.94, 1.08), gold = C(1.6, 1.15, 0.45);
  const A = new Lockup(L('L19'), '_Make _me ~what / _will _I ^say').fx('condense', [0, 0, 0, 0], 0.5);
  place(A, track, 84.1, { at: new THREE.Vector3(0, -3.6, -4.6), plane: 'plane', normal: new THREE.Vector3(0, 0, 1), xdir: new THREE.Vector3(1, 0, 0), width: 4.8 });
  const B = new Lockup(L('L20'), '~see ~all ~the / ^shimmers / ~glistening').fx('condense', [0, 0, 0, 0], 0.5);
  place(B, track, 86.4, { at: new THREE.Vector3(0, -DEPTH + 0.15, 0), plane: 'plane', normal: new THREE.Vector3(0, 1, 0), xdir: new THREE.Vector3(1, 0, 0), width: 7 });
  const D = new Lockup(L('L21'), '^stars / _that ~won\'t ^fade').fx('assemble', [0, 0, 0, 0], 0.5, 18);
  place(D, track, 89.5, { dist: 60, fill: 0.4 });
  const F = new Lockup(L('L22'), '~on ~our / ^way').fx('condense', [0, 0, 0, 0], 0.5);
  place(F, track, 91.8, { dist: 50, fill: 0.34 });
  sequence([A, B, D, F]);
  const lockups = [A, B, D, F];
  A.color(cream); B.color(silver); D.color(gold); F.color(gold);
  A.set('uIntensity', 2.6);
  for (const l of lockups) { if (l !== A) l.set('uIntensity', 1.8); l.set('uFogMul', 0.3); group.add(l.group); }

  const E = {
    gain: 1,
    zenith: C(0.012, 0.016, 0.045), horizon: C(0.06, 0.07, 0.12), ground: C(0.02, 0.02, 0.025), horizonPow: 0.5,
    sunDir: dir(30, 52), sunColor: C(0.55, 0.62, 0.9), sunSky: C(0, 0, 0), sunSize: 0, sunGlow: 0, sunCore: 0,
    stars: 1.2, moon: 0.32, moonDir: dir(30, 52),
    fog: C(0.04, 0.045, 0.07), fogSun: C(0.1, 0.11, 0.16), fogSunPow: 6, density: 0.0016, falloff: 0.004,
    sunI: 0.9, hemiI: 0.3, hemiSky: C(0.25, 0.3, 0.5), hemiGround: C(0.08, 0.07, 0.06), shadowFocus: 40,
  };
  return {
    name: 'the well', t0: T0, t1: T1, group, track, lockups, blurDepth: 14,
    env(t, c) { env(c, E); },
    update(t) {
      // the lantern on the rope, a little below the camera while we are in the shaft
      const cam = track.eval(t), ly = Math.min(1, Math.max(-DEPTH + 3, cam.pos.y + 2.5));      // just above us, out of the shot
      lantern.position.set(2.2, ly, 2.2); lamp.position.copy(lantern.position);
      lamp.intensity = cam.pos.y < 4 ? 420 : 0; lantern.visible = cam.pos.y < 4;
      rope.position.set(2.2, (7.6 + ly) / 2, 2.2); rope.scale.y = Math.max(0.1, 7.6 - ly);
      starU.uReveal.value = step(t, L('L21').words[0].start - 0.4, L('L21').words[3].start + 0.6);
    },
    post(t, P) {
      P.exposure = 1.55; P.bloom = 0.85; P.bloomThreshold = 0.9; P.vignette = 0.5; P.contrast = 1.06; P.lookPower = 1.15;
      P.veilColor.setRGB(1.0, 0.8, 0.42); P.veil = 1 - step(t, T0, T0 + 0.35);
      if (t > 94.1) { P.veilColor.setRGB(0.3, 0.16, 0.06); P.veil = step(t, 94.1, 94.6); }
    },
  };
}
