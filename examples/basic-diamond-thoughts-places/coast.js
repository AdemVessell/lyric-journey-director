/* 0:21.6–0:58.5 — THE COAST. Out of the fog onto a mirror-wet shore at dawn. A
   whale-shaped vessel lies across our path; we read the first line on the dark
   of its flank, the second by its flukes, rise over them onto dunes encrusted
   with dispersive diamond, fly down a colonnade through two hanging banners,
   and arrive at a colossal window standing alone in the desert. Its glass is
   fogged; the line is written in the fog. Through the window is the sea — and
   nowhere else is. We fly through it. */
import * as THREE from 'three';
import { Track } from '../camera.js';
import { Lockup } from '../type3d.js';
import { FOG, FOG_GLSL } from '../engine.js';
import { Reflector } from 'three/addons/Reflector.js';
import { makeField } from '../particles.js';
import { makeWhale } from './whale.js';
import { std, phys, terrain, fbm, place, env, C, dir, step, smooth, mix, clamp01, lerpEnv, mulberry32, makeMist, scatter } from './kit.js';
import { band } from '../drive.js';

const pathX = (z) => {   // where the camera crosses the dunes, so they can part for it
  const P = [[-330, -100], [-380, -80], [-450, -40], [-510, -8], [-560, 0], [-1300, 0]];
  if (z > P[0][0]) return P[0][1];
  for (let i = 0; i < P.length - 1; i++) if (z <= P[i][0] && z >= P[i + 1][0]) return mix(P[i][1], P[i + 1][1], (z - P[i][0]) / (P[i + 1][0] - P[i][0]));
  return 0;
};
export function ground(x, z) {
  const dunes = smooth((-300 - z) / 60) * smooth((z + 572) / 30);
  let d = 1 - Math.abs(fbm(x * 0.0045 + 3.1, z * 0.0032, 4));
  d = Math.pow(d, 2.4) * 30 + fbm(x * 0.02, z * 0.02, 3) * 3 + 3;
  const lane = 1 - 0.7 * Math.exp(-Math.pow((x - pathX(z)) / 70, 2));
  const floor = z < -300 ? 0.15 + fbm(x * 0.01, z * 0.01, 2) * 0.6 : -0.4;
  return mix(floor, d * lane, dunes);
}

export function coast(ctx) {
  const group = new THREE.Group();
  const sand = std({ color: C(0.93, 0.9, 0.88), roughness: 0.96 }, 'sand');
  const land = terrain(ground, { x0: -950, x1: 950, z0: -1450, z1: -230, nx: 380, nz: 300 }, sand);
  group.add(land);

  /* ---- the mirror shore: a planar reflection under a wet-sand shader ---- */
  const wet = {
    name: 'WetSand',
    uniforms: { color: { value: new THREE.Color(1, 1, 1) }, tDiffuse: { value: null }, textureMatrix: { value: null } },
    vertexShader: `uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWorld;
      void main(){ vUv = textureMatrix * vec4(position, 1.0); vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D tDiffuse; varying vec4 vUv; varying vec3 vWorld;
      ${FOG_GLSL}
      uniform float uTime;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
      void main(){
        vec2 p = vWorld.xz;
        float wet = smoothstep(0.38, 0.55, fbm(p * 0.008) + 0.16);
        vec2 rip = vec2(noise(p * 0.5 + uTime * 0.4), noise(p * 0.5 + 9.0 - uTime * 0.33)) - 0.5;
        vec4 uv = vUv; uv.xy += rip * 0.02 * uv.w * (0.3 + wet);
        vec3 refl = texture2DProj(tDiffuse, uv).rgb;
        vec3 v = normalize(vWorld - uCamPos);
        float fres = 0.05 + 0.95 * pow(1.0 - abs(v.y), 4.0);
        vec3 damp = vec3(0.42, 0.39, 0.39) * (0.8 + 0.3 * fbm(p * 0.1));
        vec3 col = mix(damp * 0.55, refl * 0.92, mix(0.22, 0.94, wet) * mix(0.6, 1.0, fres));
        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }`,
  };
  const mirror = new Reflector(new THREE.PlaneGeometry(2600, 1500), { textureWidth: 1280, textureHeight: 720, clipBias: 0.002, shader: wet });
  for (const k of Object.keys(FOG)) mirror.material.uniforms[k] = FOG[k];   // shared fog, not the clone Reflector makes
  mirror.rotation.x = -Math.PI / 2; mirror.position.set(0, 0.05, 460);
  group.add(mirror);

  /* ---- the whale ---- */
  const whale = makeWhale({ length: 170, radius: 17 });
  whale.position.set(0, 6, -250); whale.rotation.y = 0.04;
  group.add(whale);

  /* ---- diamonds on the dunes, and their glints ---- */
  const rnd = mulberry32(77);
  const gem = phys({ color: C(1, 1, 1), transmission: 1, thickness: 1.4, ior: 2.4, dispersion: 4, roughness: 0.02, metalness: 0, specularIntensity: 1, envMapIntensity: 1.6 }, 'gem');
  const gemGeo = new THREE.OctahedronGeometry(1, 0);
  const gems = [];
  const diamonds = scatter(gemGeo, gem, 1400, (i, p, q, s) => {
    const z = mix(-335, -560, Math.pow(rnd(), 0.9)), x = pathX(z) + (rnd() - 0.5) * (rnd() < 0.7 ? 160 : 600);
    const k = 0.35 + Math.pow(rnd(), 3) * 2.4;
    p.set(x, ground(x, z) + k * 0.4, z);
    q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 6.3, rnd() * 3));
    s.set(k * (0.6 + rnd() * 0.5), k * (1 + rnd() * 1.2), k * (0.6 + rnd() * 0.5));
    gems.push([p.x, p.y + k * 0.9, p.z, Math.floor(rnd() * 32), rnd()]);
  });
  diamonds.castShadow = true;
  group.add(diamonds);
  const gp = new Float32Array(gems.length * 3), gb = new Float32Array(gems.length * 2);
  gems.forEach((g, i) => { gp.set(g.slice(0, 3), i * 3); gb[i * 2] = g[3]; gb[i * 2 + 1] = g[4]; });
  const glintGeo = new THREE.BufferGeometry();
  glintGeo.setAttribute('position', new THREE.BufferAttribute(gp, 3));
  glintGeo.setAttribute('aBand', new THREE.BufferAttribute(gb, 2));
  const bandU = { value: new Float32Array(32) };
  const glints = new THREE.Points(glintGeo, new THREE.ShaderMaterial({
    uniforms: { ...FOG, uBands: bandU, uGain: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uBands[32]; uniform float uTime, uGain; attribute vec2 aBand; varying float vI; varying vec3 vWorld;
      void main(){ float b = uBands[int(aBand.x)]; float tw = pow(0.5 + 0.5 * sin(uTime * (3.0 + aBand.y * 9.0) + aBand.y * 60.0), 6.0);
        vI = (pow(b, 2.2) * 2.5 + tw * 0.5) * uGain; vWorld = position;
        vec4 mv = viewMatrix * vec4(position, 1.0); gl_PointSize = clamp(2600.0 * (0.4 + b) / -mv.z, 1.0, 36.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vI; varying vec3 vWorld; ${FOG_GLSL}
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0;
        float star = max(exp(-abs(d.x) * 40.0) * exp(-abs(d.y) * 4.0), exp(-abs(d.y) * 40.0) * exp(-abs(d.x) * 4.0));
        float a = (smoothstep(1.0, 0.0, r) * 0.4 + star) * vI * (1.0 - fogAmount(vWorld));
        gl_FragColor = vec4(vec3(1.0, 0.97, 1.05) * a * 3.0, 1.0); }`,
  }));
  glints.frustumCulled = false; group.add(glints);

  /* ---- the halls ---- */
  const stone = std({ color: C(0.075, 0.072, 0.08), roughness: 0.82 }, 'stone');
  for (let i = 0; i < 5; i++) {
    const z = -580 - i * 42;
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(12, 150, 12), stone); m.position.set(sx * 37, 75, z);
      m.castShadow = true; m.receiveShadow = true; group.add(m);
    }
    const lin = new THREE.Mesh(new THREE.BoxGeometry(88, 9, 12), stone); lin.position.set(0, 154, z);
    lin.castShadow = true; group.add(lin);
  }
  const sparks = makeField({ count: 3500, box: [90, 70, 150], size: 0.12, color: C(2.4, 1.4, 0.6), vel: [0.4, 3.2, 0], turb: 1.6, spark: 1, twinkle: 0.7 });
  sparks.u.uCenter.value.set(0, 6, -60); group.add(sparks.mesh);

  /* ---- the window: frame, fogged glass, and the sea painted behind it ---- */
  const WZ = -850, WW = 180, WH = 120, WY = 64;
  const frameMat = std({ color: C(0.03, 0.03, 0.034), roughness: 0.45, metalness: 0.7 }, 'frame');
  for (const [w, h, x, y] of [[WW + 16, 9, 0, WY + WH / 2 + 4], [WW + 16, 9, 0, WY - WH / 2 - 4], [9, WH + 16, -WW / 2 - 4, WY], [9, WH + 16, WW / 2 + 4, WY]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 10), frameMat); b.position.set(x, y, WZ); b.castShadow = true; b.receiveShadow = true; group.add(b);
  }
  const seaFace = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), new THREE.ShaderMaterial({
    uniforms: { ...FOG },
    vertexShader: `varying vec2 vUv; varying vec3 vWorld; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying vec3 vWorld;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 uv = vUv;
        vec3 deep = mix(vec3(0.004, 0.03, 0.04), vec3(0.06, 0.22, 0.24), pow(uv.y, 1.6));
        float shafts = 0.0;
        for (int i = 0; i < 5; i++) { float fi = float(i); float x = fract(0.17 + fi * 0.23 + sin(uTime * 0.11 + fi) * 0.04);
          shafts += exp(-pow((uv.x - x + (1.0 - uv.y) * 0.18) * 14.0, 2.0)) * (0.4 + 0.6 * noise(vec2(fi * 7.0, uTime * 0.3))); }
        deep += vec3(0.15, 0.35, 0.34) * shafts * pow(uv.y, 0.7) * 0.6;
        float caust = pow(1.0 - abs(noise(uv * vec2(18.0, 9.0) + uTime * 0.25) - noise(uv * vec2(22.0, 11.0) - uTime * 0.2)), 8.0);
        deep += vec3(0.2, 0.4, 0.38) * caust * smoothstep(0.55, 1.0, uv.y) * 0.5;
        for (int i = 0; i < 3; i++) { float fi = float(i);   // hull silhouettes near the surface
          vec2 c = vec2(0.22 + fi * 0.3, 0.93 - fi * 0.02); vec2 q = (uv - c) * vec2(3.2, 22.0);
          deep *= mix(1.0, 0.25, smoothstep(1.0, 0.7, length(q)) * step(uv.y, c.y + 0.015)); }
        gl_FragColor = vec4(deep * 1.6, 1.0);
      }`,
  }));
  seaFace.position.set(0, WY, WZ - 4); group.add(seaFace);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), phys({ color: C(0.86, 0.93, 1), transmission: 1, roughness: 0.22, thickness: 0.6, ior: 1.5, metalness: 0, envMapIntensity: 0.8 }, 'glass'));
  glass.position.set(0, WY, WZ); group.add(glass);
  // condensation: fog, droplets and drips painted once into a texture
  const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 1366;
  const g = cv.getContext('2d'), r2 = mulberry32(5);
  g.fillStyle = 'rgba(255,255,255,0)'; g.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < 900; i++) {
    const x = r2() * cv.width, y = r2() * cv.height, rr = 40 + r2() * 220;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, `rgba(255,255,255,${0.05 + r2() * 0.08})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 70; i++) {          // drips: clear trails through the fog
    let x = r2() * cv.width, y = r2() * cv.height * 0.6; const w = 3 + r2() * 7, len = 120 + r2() * 600;
    g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < len; k += 20) { x += (r2() - 0.5) * 6; y += 20; g.lineTo(x, y); }
    g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 2600; i++) {        // droplets
    const x = r2() * cv.width, y = r2() * cv.height, rr = 1.5 + Math.pow(r2(), 3) * 9;
    g.fillStyle = `rgba(255,255,255,${0.25 + r2() * 0.4})`; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
  }
  const fogTex = new THREE.CanvasTexture(cv); fogTex.colorSpace = THREE.NoColorSpace; fogTex.anisotropy = 8;
  const condense = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH), new THREE.ShaderMaterial({
    uniforms: { ...FOG, uTex: { value: fogTex }, uAmt: { value: 1 } }, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vUv; varying vec3 vWorld; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uAmt; varying vec2 vUv; varying vec3 vWorld; ${FOG_GLSL}
      void main(){ float a = texture2D(uTex, vUv).a * uAmt; vec3 c = fogTint(vWorld) * 1.25 + vec3(0.06);
        gl_FragColor = vec4(c, a * 0.9); }`,
  }));
  condense.position.set(0, WY, WZ + 0.6); condense.renderOrder = 8; group.add(condense);

  /* ---- haze banks over the shore ---- */
  const haze = makeMist({ count: 10, z0: 820, z1: 40, width: 900, height: 70, y: 20, spreadX: 260, opacity: 0.5, tint: C(1.15, 1.12, 1.15), bottom: 0, soft: 25, seed: 9 });
  group.add(haze.group);

  /* ---- camera ---- */
  const track = new Track([
    { t: 21.6, p: [-8, 3.0, 900], l: [-4, 6, 400], fov: 50, cut: true },
    { t: 26.0, p: [-2, 3.4, 650], l: [0, 9, 0], fov: 46 },
    { t: 31.0, p: [4, 5.0, 400], l: [0, 13, -250], fov: 42 },
    { t: 35.5, p: [16, 9, 60], l: [12, 15, -250], fov: 40 },
    { t: 38.6, p: [36, 12, -128], l: [34, 14, -240], fov: 40 },
    { t: 40.6, p: [12, 12, -150], l: [12, 15, -240], fov: 40 },
    { t: 42.6, p: [-28, 11, -160], l: [-38, 13, -245], fov: 41 },
    { t: 44.5, p: [-66, 13, -172], l: [-92, 13, -262], fov: 42 },
    { t: 46.1, p: [-104, 36, -228], l: [-90, 18, -400], fov: 46 },
    { t: 47.6, p: [-80, 30, -320], l: [-55, 8, -450], fov: 46 },
    { t: 49.0, p: [-40, 24, -420], l: [-10, 14, -560], fov: 46 },
    { t: 50.3, p: [-8, 22, -510], l: [0, 30, -610], fov: 48 },
    { t: 51.4, p: [0, 26, -608], l: [0, 28, -730], fov: 52 },
    { t: 52.6, p: [0, 24, -680], l: [0, 26, -850], fov: 52 },
    { t: 53.5, p: [0, 26, -732], l: [0, 34, -850], fov: 50 },
    { t: 55.2, p: [0, 36, -736], l: [0, 48, -850], fov: 46 },
    { t: 57.7, p: [0, 40, -752], l: [0, 48, -850], fov: 44 },
    { t: 58.5, p: [0, 40, -856], l: [0, 46, -1050], fov: 50 },
  ]);

  /* ---- the lines ---- */
  const white = C(0.93, 0.91, 0.88);
  const L0 = new Lockup(ctx.line('L0'), 'Beaching / _this ^whale').fx('rise', [0.25, 0, 0, 0], 0.5);
  place(L0, track, 40.4, { at: new THREE.Vector3(-2, 13.5, -221), plane: 'plane', normal: new THREE.Vector3(0.08, 0.1, 1), xdir: new THREE.Vector3(1, 0, 0), width: 46 });
  const L1 = new Lockup(ctx.line('L1'), '_once _and _for / ^all').fx('drop', [0, 0, 0, 0], 0.45);
  place(L1, track, 44.4, { dist: 58, dx: -0.12, dy: 0.05, fill: 0.36 });
  const L2 = new Lockup(ctx.line('L2'), '^!diamond / encrusted ~dunes').fx('assemble', [0, 0, 0, 0], 0.45, 9);
  place(L2, track, 48.3, { dist: 110, dy: 0.04, dx: -0.06, fill: 0.56, plane: 'floor', tilt: 62, lift: 14 });
  const L3a = new Lockup(ctx.line('L3'), '~sparking / ^!light', { words: [0, 2] }).fx('flip', [0, 0, 0, 0], 0.5);
  place(L3a, track, 50.6, { at: new THREE.Vector3(0, 32, -610), plane: 'plane', normal: new THREE.Vector3(0, 0, 1), xdir: new THREE.Vector3(1, 0, 0), width: 50 });
  const L3b = new Lockup(ctx.line('L3'), '_for _the / ^halls', { words: [2, 5] }).fx('streak', [70, 0, 0, 0], 0.4);
  place(L3b, track, 52.4, { at: new THREE.Vector3(0, 29, -730), plane: 'plane', normal: new THREE.Vector3(0, 0, 1), xdir: new THREE.Vector3(1, 0, 0), width: 46 });
  const L4 = new Lockup(ctx.line('L4'), 'alien ~breath / _this ^fog _on _the / ^window').fx('condense', [0, 0, 0, 0], 0.5);
  place(L4, track, 56.5, { at: new THREE.Vector3(0, 52, WZ + 1.2), plane: 'plane', normal: new THREE.Vector3(0, 0, 1), xdir: new THREE.Vector3(1, 0, 0), width: 84 });
  const lockups = [L0, L1, L2, L3a, L3b, L4];
  for (const l of lockups) { l.color(white, l === L2 ? C(0.9, 0.9, 1.15) : C(1.25, 0.78, 0.42)); group.add(l.group); }
  L4.color(C(0.018, 0.075, 0.085)); L4.set('uIntensity', 1.0); L4.set('uHalo', 0.0); L4.set('uFogMul', 0.0);
  for (const w of L4.words) w.uniforms.uGlowColor.value.setRGB(0.3, 0.9, 0.95);

  const sunDir = dir(8, 6.5);
  // pearl dawn (regraded 2026-10-29 for more colour): gold toward the sun, silver-blue
  // haze away from it, where it had been one beige grey
  const E = {
    gain: 1.35,
    zenith: C(0.24, 0.28, 0.5), horizon: C(1.08, 1.04, 1.12), ground: C(0.86, 0.86, 0.92),
    sunDir, sunColor: C(3.0, 2.15, 1.5), sunSky: C(2.1, 1.45, 0.95), sunSize: 0.0009, sunGlow: 1.2, sunCore: 22,
    fog: C(0.88, 0.9, 1.02), fogSun: C(1.9, 1.35, 0.9), fogSunPow: 7, density: 0.00105, falloff: 0.008,
    sunI: 3.8, hemiI: 1.6, hemiSky: C(0.68, 0.74, 0.98), hemiGround: C(0.62, 0.56, 0.55), shadowFocus: 90,
  };
  const Efog = { ...E, density: 0.009, falloff: 0.0 };
  return {
    name: 'coast', t0: 21.6, t1: 58.5, group, track, lockups, blurDepth: 32,
    env(t, c) { env(c, lerpEnv(Efog, E, step(t, 21.6, 25.5))); },
    update(t) {
      for (let b = 0; b < 32; b++) bandU.value[b] = band(b, t);
      sparks.u.uOpacity.value = step(t, 49.5, 50.5) * (1 - step(t, 54, 55.5));
      condense.material.uniforms.uAmt.value = 1;
    },
    post(t, P) {
      P.exposure = 1.15; P.bloom = 0.5; P.bloomThreshold = 1.5; P.rays = 0.5; P.vignette = 0.38; P.contrast = 1.06;
      P.letterbox = 0.128 * (1 - step(t, 34, 38.6)); P.split.set(-0.015, 0.0, 0.03);
      P.veilColor.setRGB(0.82, 0.8, 0.84); P.veil = 1 - step(t, 21.6, 22.9);
      if (t > 58.3) { P.veilColor.setRGB(0.7, 0.92, 0.95); P.veil = step(t, 58.3, 58.5) * 0.9; }
    },
  };
}
