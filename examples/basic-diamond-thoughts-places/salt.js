/* 2:07.8–2:22.7 — THE SALT FLAT. Out of the clouds at dusk over a white salt crust.
   A heavy train crosses it, windows lit; the line is painted on a carriage and
   travels with it while we track alongside. Pebbles turn on a vertical axis by
   the rails. Beyond, a colossal pour of tea falls out of the sky into an amber
   lake strewn with ash; the line floats on it. A forest of grey sticks stands in
   the lake, the liquid running down them, and the line runs down with it. */
import * as THREE from 'three';
import { Track } from '../camera.js';
import { Lockup, sequence } from '../type3d.js';
import { FOG, FOG_GLSL } from '../engine.js';
import { makeFlakes } from '../flakes.js';
import { std, phys, place, env, C, dir, step, mix, fbm, mulberry32, lerpEnv, scatter } from './kit.js';
import { hits, level } from '../drive.js';

export function salt(ctx) {
  const group = new THREE.Group();
  const T0 = 127.8, T1 = 142.7, VTRAIN = 9;
  // the crust: white salt with a network of raised hexagonal cracks
  const crust = std({ color: C(0.92, 0.9, 0.92), roughness: 0.9 }, 'salt');
  const pc = crust.onBeforeCompile;
  crust.onBeforeCompile = (sh, r) => {
    pc(sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSaltW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSaltW = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vSaltW;
      vec2 hexd(vec2 p){ p /= 9.0; vec2 r = vec2(1.0, 1.7320508); vec2 h = r * 0.5;
        vec2 a = mod(p, r) - h, b = mod(p - h, r) - h; vec2 g = dot(a, a) < dot(b, b) ? a : b;
        vec2 q = abs(g); return vec2(max(dot(q, normalize(vec2(1.0, 1.7320508))), q.x), 0.0); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float e = hexd(vSaltW.xz + sin(vSaltW.zx * 0.05) * 3.0).x;
        float crack = smoothstep(0.47, 0.5, e);
        diffuseColor.rgb *= mix(1.0, 0.72, crack);`);
  };
  crust.customProgramCacheKey = () => 'salt-hex';
  const flat = new THREE.Mesh(new THREE.PlaneGeometry(6000, 3000, 1, 1), crust);
  flat.rotation.x = -Math.PI / 2; flat.receiveShadow = true; group.add(flat);
  // rails
  const rail = std({ color: C(0.25, 0.24, 0.26), roughness: 0.4, metalness: 0.8 }, 'rail');
  for (const z of [-0.75, 0.75]) { const m = new THREE.Mesh(new THREE.BoxGeometry(6000, 0.18, 0.12), rail); m.position.set(0, 0.25, z); group.add(m); }
  const tie = std({ color: C(0.18, 0.15, 0.13), roughness: 0.9 }, 'tie');
  group.add(scatter(new THREE.BoxGeometry(0.3, 0.16, 2.6), tie, 3000, (i, p, q, s) => { p.set(-3000 + i * 2, 0.08, 0); s.set(1, 1, 1); }));
  // the train: a heavy locomotive and carriages, windows lit
  const train = new THREE.Group(); group.add(train);
  const body = std({ color: C(0.06, 0.06, 0.07), roughness: 0.45, metalness: 0.5 }, 'train');
  const lit = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 2.6, 1.2) });
  const cars = [];
  for (let i = 0; i < 9; i++) {
    const car = new THREE.Group(); car.position.x = -i * 23;
    const b = new THREE.Mesh(new THREE.BoxGeometry(21.5, i === 0 ? 5.2 : 4.4, 3.6), body); b.position.y = (i === 0 ? 2.6 : 2.2) + 0.6; b.castShadow = true; car.add(b);
    // a half-cylinder laid along the car, curve up (a second turn about y used to set it
    // across the track, where it stood 10 m out from the side and hid the line)
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 21.5, 16, 1, false, 0, Math.PI), body);
    roof.rotation.z = Math.PI / 2; roof.position.y = (i === 0 ? 5.2 : 4.4) + 0.6; car.add(roof);
    if (i > 0) for (let k = 0; k < 7; k++) for (const side of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), lit); w.position.set(-8.5 + k * 2.8, 3.5, side * 1.81); w.rotation.y = side > 0 ? 0 : Math.PI; car.add(w);
    }
    train.add(car); cars.push(car);
  }
  const headlamp = new THREE.SpotLight(0xffd9a0, 0, 400, 0.35, 0.5, 1.2); headlamp.position.set(11, 3, 0); headlamp.target.position.set(80, 0, 0);
  cars[0].add(headlamp, headlamp.target);
  const trainX = (t) => -140 + VTRAIN * (t - T0);

  // the axis of pebbles
  const rnd = mulberry32(64), AX = new THREE.Vector3(-64, 0, -34);
  const pebMat = std({ color: C(0.5, 0.48, 0.5), roughness: 0.6 }, 'pebble');
  const pebGeo = new THREE.IcosahedronGeometry(1, 2);
  const pebbles = new THREE.InstancedMesh(pebGeo, pebMat, 420); pebbles.castShadow = true;
  const pebData = [];
  for (let i = 0; i < 420; i++) pebData.push({ y: Math.pow(rnd(), 0.8) * 70, r: 2 + rnd() * 16, a: rnd() * 6.3, w: (0.3 + rnd() * 0.6) * (rnd() < 0.5 ? 1 : -1), s: 0.3 + Math.pow(rnd(), 2) * 1.8, k: rnd() });
  group.add(pebbles);

  // the lake of tea: amber liquid, slow swirl, ash on the surface; the pour falling into it
  const LAKE = new THREE.Vector3(820, 0.3, -160);
  const lake = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1200, 1, 1), new THREE.ShaderMaterial({
    uniforms: { ...FOG },
    vertexShader: `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `${FOG_GLSL} uniform float uTime; varying vec3 vWorld;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 c = vWorld.xz - vec2(${LAKE.x.toFixed(1)}, ${LAKE.z.toFixed(1)});
        float r = length(c), a = atan(c.y, c.x) + uTime * 0.35 / (1.0 + r * 0.01);
        vec2 sw = vec2(cos(a), sin(a)) * r;
        float n = noise(sw * 0.05) * 0.6 + noise(sw * 0.17) * 0.3;
        float ash = smoothstep(0.62, 0.7, noise(sw * 0.11 + 7.0)) * smoothstep(20.0, 120.0, r);
        vec3 tea = mix(vec3(0.29, 0.11, 0.027), vec3(1.1, 0.54, 0.14), n);   // lifted for the punchier look, which crushed it to black
        vec3 v = normalize(vWorld - uCamPos);
        float f = 0.04 + 0.96 * pow(1.0 - abs(v.y), 5.0);
        vec3 col = mix(tea, vec3(0.9, 0.62, 0.5), f * 0.6);
        col = mix(col, vec3(0.42, 0.4, 0.42), ash * 0.85);
        col += vec3(1.2, 0.7, 0.3) * exp(-r * 0.05) * 0.6;
        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }`,
  }));
  lake.rotation.x = -Math.PI / 2; lake.position.copy(LAKE); group.add(lake);
  const pour = new THREE.Mesh(new THREE.CylinderGeometry(9, 15, 700, 40, 1, true), new THREE.ShaderMaterial({
    uniforms: { ...FOG }, transparent: true,
    vertexShader: `varying vec3 vWorld; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `${FOG_GLSL} uniform float uTime; varying vec3 vWorld; varying vec2 vUv;
      void main(){ float s = sin(vUv.x * 40.0 + vUv.y * 6.0 + uTime * 9.0) * 0.5 + 0.5;
        vec3 col = mix(vec3(0.35, 0.14, 0.03), vec3(1.6, 0.85, 0.3), s * 0.7 + 0.2);
        gl_FragColor = vec4(applyFog(col, vWorld), 0.92); }`,
  }));
  pour.position.set(LAKE.x, 350, LAKE.z); group.add(pour);
  const ash = makeFlakes({ count: 1400, box: [160, 60, 160], size: 0.8, vel: [2, -1, 1], spin: 2, turb: 3, shape: 'ash', color: C(0.5, 0.48, 0.5), color2: C(0.3, 0.29, 0.31) });
  group.add(ash.mesh);
  // grey sticks standing in the tea, the liquid running down them
  const STICKS = new THREE.Vector3(1180, 0, -340);
  const stickMat = std({ color: C(0.42, 0.41, 0.43), roughness: 0.75 }, 'stick');
  const sp = stickMat.onBeforeCompile;
  stickMat.onBeforeCompile = (sh, r) => {
    sp(sh, r);
    sh.uniforms.uTime = FOG.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vStickW;').replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vStickW = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
      #else
        vStickW = (modelMatrix * vec4(position, 1.0)).xyz;
      #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vStickW; uniform float uTime;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float run = smoothstep(0.75, 1.0, sin(vStickW.y * 0.35 + uTime * 6.0 + vStickW.x * 3.1 + vStickW.z * 1.7));
        totalEmissiveRadiance += vec3(0.9, 0.45, 0.12) * run * 0.8;`);
  };
  stickMat.customProgramCacheKey = () => 'stick-run';
  group.add(scatter(new THREE.CylinderGeometry(0.5, 0.8, 1, 8), stickMat, 520, (i, p, q, s) => {
    let a, r, x, z;
    do { a = rnd() * 6.28; r = Math.sqrt(rnd()) * 240; x = STICKS.x + Math.cos(a) * r; z = STICKS.z + Math.sin(a) * r * 1.3; }
    while (Math.abs((z - (-200)) - (x - 930) * (-140 / 250)) < 40 && x < STICKS.x + 40);   // clear lane along the camera's approach
    const h = 14 + rnd() * 60;
    p.set(x, h / 2, z);
    q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.12, 0, (rnd() - 0.5) * 0.12)); s.set(1, h, 1);
  }));

  // camera
  const tx = trainX;
  const track = new Track([
    // open close enough to read "Heavyset" 0.28 s after the cut: ~64 m from the line
    { t: T0, p: [tx(T0) - 12, 30, 62], l: [tx(T0) - 46, 5, 4], fov: 46, cut: true },
    { t: 128.9, p: [tx(128.9) - 6, 9, 30], l: [tx(128.9) - 40, 4, 0], fov: 44 },
    { t: 130.3, p: [tx(130.3) - 30, 5, 24], l: [tx(130.3) - 52, 3.5, 0], fov: 42 },
    { t: 130.85, p: [tx(130.3) - 22, 7, 30], l: [AX.x, 22, AX.z], fov: 46 },
    { t: 132.4, p: [tx(130.3) - 4, 10, 34], l: [AX.x, 24, AX.z], fov: 46 },
    { t: 133.6, p: [300, 60, 60], l: [LAKE.x, 160, LAKE.z], fov: 50 },
    { t: 135.4, p: [560, 40, -40], l: [LAKE.x, 10, LAKE.z], fov: 48 },
    { t: 138.4, p: [700, 26, -120], l: [LAKE.x + 40, 0, LAKE.z - 60], fov: 46 },
    { t: 140.4, p: [930, 18, -200], l: [STICKS.x, 20, STICKS.z], fov: 50 },
    { t: 142.7, p: [1010, 15, -240], l: [STICKS.x + 60, 18, STICKS.z - 40], fov: 54 },
  ]);

  // the lines
  const warm = C(1.0, 0.92, 0.82);
  const L17 = new Lockup(ctx.line('L17'), 'Heavyset / gravy ^train').fx('drop', [0, 0, 0, 0], 0.4);
  // painted on the third carriage: placed at the reading time, then carried by it
  train.position.x = trainX(129.3); train.updateMatrixWorld(true);
  place(L17, track, 129.3, { at: new THREE.Vector3(trainX(129.3) - 46, 4.0, 5.5), plane: 'plane', normal: new THREE.Vector3(0, 0, 1), xdir: new THREE.Vector3(1, 0, 0), width: 22 });
  L17.color(warm); L17.set('uIntensity', 1.5);
  cars[2].attach(L17.group);
  const L18 = new Lockup(ctx.line('L18'), '~axis _of / ^pebbles').fx('orbit', [0, 0, 0, 0], 0.4);
  place(L18, track, 131.5, { dist: 58, fill: 0.4 }); L18.color(C(0.9, 0.88, 0.92)); L18.set('uIntensity', 1.6);
  const L19 = new Lockup(ctx.line('L19'), 'pouring _out ^!tea / mixed _with ~ashes').fx('unfold', [1, 0, 0, 0], 0.45);
  place(L19, track, 137.0, { dist: 120, dy: -0.04, dx: -0.04, fill: 0.5, plane: 'floor', tilt: 55, lift: 10 });
  L19.color(warm, C(1.5, 0.85, 0.35)); L19.set('uIntensity', 1.7);
  const L20 = new Lockup(ctx.line('L20'), '~the ^liquid ~runs / ~the ~gray ^sticks').fx('drop', [0, 0, 0, 0], 0.45);
  place(L20, track, 141.0, { dist: 52, fill: 0.5 }); L20.color(C(0.86, 0.85, 0.88)); L20.set('uIntensity', 1.6);
  sequence([L17, L18]);
  const lockups = [L17, L18, L19, L20];
  for (const l of [L18, L19, L20]) group.add(l.group);

  const E = {
    gain: 1.25,
    zenith: C(0.04, 0.05, 0.14), horizon: C(0.62, 0.44, 0.52), ground: C(0.3, 0.26, 0.32), horizonPow: 0.4,
    sunDir: dir(-110, 1.2), sunColor: C(1.4, 0.75, 0.55), sunSky: C(1.4, 0.7, 0.45), sunSize: 0.0011, sunGlow: 1.6, sunCore: 16,
    fog: C(0.36, 0.3, 0.4), fogSun: C(0.95, 0.55, 0.45), fogSunPow: 4, density: 0.0012, falloff: 0.004,
    sunI: 1.3, hemiI: 0.75, hemiSky: C(0.35, 0.36, 0.6), hemiGround: C(0.32, 0.28, 0.3), shadowFocus: 60, stars: 0.4,
  };
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), pp = new THREE.Vector3(), ss = new THREE.Vector3();
  return {
    name: 'salt flat', t0: T0, t1: T1, group, track, lockups, blurDepth: 22,
    env(t, c) { env(c, E); },
    update(t) {
      train.position.x = trainX(t);
      headlamp.intensity = 900;
      pebData.forEach((d, i) => {
        const a = d.a + t * d.w;
        pp.set(AX.x + Math.cos(a) * d.r, d.y + Math.sin(t * 0.7 + d.k * 6) * 1.5, AX.z + Math.sin(a) * d.r);
        qq.setFromEuler(new THREE.Euler(t * d.w, d.k * 6, 0)); ss.setScalar(d.s);
        m4.compose(pp, qq, ss); pebbles.setMatrixAt(i, m4);
      });
      pebbles.instanceMatrix.needsUpdate = true;
      ash.u.uOpacity.value = step(t, 133, 135);
      ash.u.uCenter.value.set(0, -10, 0);
    },
    post(t, P) {
      // a night place: the house look's full power crushes it to black, so a gentler one, opened up
      P.exposure = 1.45; P.lookPower = 1.12; P.bloom = 0.75; P.bloomThreshold = 1.1; P.rays = 0.5; P.vignette = 0.5; P.contrast = 1.06; P.saturation = 1.05;
      P.veilColor.setRGB(0.3, 0.28, 0.36); P.veil = 1 - step(t, T0, T0 + 0.22);
      if (t > 142.45) { P.veilColor.setRGB(1, 0.98, 0.95); P.veil = step(t, 142.45, 142.7); }
    },
  };
}
