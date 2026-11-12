/* Shared parts for the places: materials, terrain, scatter, placement. */
import * as THREE from 'three';
import { W, H, FOG, patchFog } from '../engine.js';
import { applyPose } from '../camera.js';
import { SimplexNoise } from 'three/addons/SimplexNoise.js';
import { gritMaterial } from '../grit.js';

export const noise = new SimplexNoise({ random: mulberry32(0xB0D7) });
export function mulberry32(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
export const step = (t, a, b) => smooth((t - a) / Math.max(1e-6, b - a));
export const mix = (a, b, k) => a + (b - a) * k;
export const C = (r, g, b) => new THREE.Color(r, g, b);
export const fbm = (x, y, oct = 5, lac = 2, gain = 0.5) => {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise.noise(x * f, y * f); n += a; a *= gain; f *= lac; }
  return s / n;
};

// Built-in materials: routed through the shared fog, and given their grit profile when ?grit is on.
export function std(params, cacheKey) {
  const m = new THREE.MeshStandardMaterial(params);
  m.userData.cacheKey = cacheKey || '';
  return gritMaterial(patchFog(m));
}
export function phys(params, cacheKey) {
  const m = new THREE.MeshPhysicalMaterial(params);
  m.userData.cacheKey = cacheKey || '';
  return gritMaterial(patchFog(m));
}

// Heightfield terrain over [x0,x1]x[z0,z1], height from fn(x, z).
export function terrain(fn, { x0 = -500, x1 = 500, z0 = -500, z1 = 500, nx = 256, nz = 256 } = {}, material) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, fn(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true; m.castShadow = true;
  return m;
}

/* ---------- placing a lockup in the world ----------
   Camera-first: the lockup is put where the camera will be looking when the
   line is read, so it is in frame by construction; check_journey.mjs verifies
   every word at its onset anyway. Planes:
     face   faces the camera
     floor  lies on a horizontal plane at o.y, text reading away from the camera
     ceil   on a horizontal plane above, read looking up
     wallL / wallR  a vertical plane beside the line of travel, reading forward
     plane  explicit: o.normal and o.xdir */
const _cam = new THREE.PerspectiveCamera(42, W / H, 0.1, 10);
export function poseBasis(track, t) {
  const pose = track.eval(t);
  _cam.fov = pose.fov; _cam.updateProjectionMatrix(); applyPose(_cam, pose);
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(_cam.quaternion);
  const r = new THREE.Vector3(1, 0, 0).applyQuaternion(_cam.quaternion);
  const u = new THREE.Vector3(0, 1, 0).applyQuaternion(_cam.quaternion);
  const halfH = Math.tan(THREE.MathUtils.degToRad(pose.fov / 2));
  return { pose, f, r, u, halfH, halfW: halfH * W / H, q: _cam.quaternion.clone() };
}
export function place(lk, track, t, o = {}) {
  const B = poseBasis(track, t);
  const dist = o.dist ?? 30, plane = o.plane || 'face';
  const ray = B.f.clone().addScaledVector(B.r, (o.dx || 0) * B.halfW).addScaledVector(B.u, (o.dy || 0) * B.halfH).normalize();
  let c = o.at ? o.at.clone() : B.pose.pos.clone().addScaledVector(ray, dist);
  let X, Y, N;
  const up = new THREE.Vector3(0, 1, 0);
  if (plane === 'face') { X = B.r.clone(); Y = B.u.clone(); N = B.f.clone().negate(); }
  else if (plane === 'floor' || plane === 'ceil') {
    N = plane === 'floor' ? up.clone() : up.clone().negate();
    if (!o.at && o.y !== undefined && Math.abs(ray.y) > 1e-3) { const k = (o.y - B.pose.pos.y) / ray.y; if (k > 0) c = B.pose.pos.clone().addScaledVector(ray, k); }
    X = B.r.clone().projectOnPlane(up).normalize();
    Y = B.f.clone().projectOnPlane(up).normalize();
    if (plane === 'ceil') Y.negate();
  } else if (plane === 'wallL' || plane === 'wallR') {
    const fwd = B.f.clone().projectOnPlane(up).normalize();
    N = plane === 'wallL' ? B.r.clone().projectOnPlane(up).normalize() : B.r.clone().projectOnPlane(up).normalize().negate();
    X = plane === 'wallL' ? fwd.clone() : fwd.clone().negate();
    Y = up.clone();
  } else { N = o.normal.clone().normalize(); X = o.xdir.clone().projectOnPlane(N).normalize(); }
  if (!Y) Y = new THREE.Vector3().crossVectors(N, X).normalize();
  X = new THREE.Vector3().crossVectors(Y, N).normalize();
  const m = new THREE.Matrix4().makeBasis(X, Y, N);
  lk.group.quaternion.setFromRotationMatrix(m);
  if (o.tilt) lk.group.rotateX(THREE.MathUtils.degToRad(o.tilt));
  if (o.yaw) lk.group.rotateY(THREE.MathUtils.degToRad(o.yaw));
  if (o.spin) lk.group.rotateZ(THREE.MathUtils.degToRad(o.spin));
  const camDist = c.distanceTo(B.pose.pos);
  const width = o.width ?? (o.fill ?? 0.55) * 2 * B.halfW * camDist;
  lk.group.scale.setScalar(width / lk.width);
  lk.group.position.copy(c);
  if (o.lift) lk.group.position.addScaledVector(N, o.lift);
  lk.placement = { t, ...o };
  return lk;
}

// Instanced scatter helper
export function scatter(geo, mat, n, fn) {
  const im = new THREE.InstancedMesh(geo, mat, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < n; i++) { fn(i, p, q, s); m.compose(p, q, s); im.setMatrixAt(i, m); }
  im.instanceMatrix.needsUpdate = true;
  return im;
}

// Environment state: sky + fog + lights, blended between named presets.
export function env(ctx, e) {
  const { sky, sun, hemi } = ctx;
  // gain: daylit skies are authored as if display-referred; AgX needs them in HDR,
  // about 2x, to read as bright sky rather than navy. Sky and fog take the same
  // gain so the horizon never shows a seam.
  const g = e.gain ?? 1;
  sky.u.uZenith.value.copy(e.zenith).multiplyScalar(g); sky.u.uHorizon.value.copy(e.horizon).multiplyScalar(g); sky.u.uGround.value.copy(e.ground || e.horizon).multiplyScalar(g);
  sky.u.uSunDir.value.copy(e.sunDir); sky.u.uSunColor.value.copy(e.sunSky || e.sunColor);
  sky.u.uSunSize.value = e.sunSize ?? 0.0006; sky.u.uSunGlow.value = e.sunGlow ?? 1; sky.u.uSunCore.value = e.sunCore ?? 30;
  sky.u.uStars.value = e.stars || 0; sky.u.uMoon.value = e.moon || 0; sky.u.uBands.value = e.bands || 0;
  sky.u.uHorizonPow.value = e.horizonPow ?? 0.45;
  if (e.moonDir) sky.u.uMoonDir.value.copy(e.moonDir);
  FOG.uFogColor.value.copy(e.fog || e.horizon).multiplyScalar(g); FOG.uFogSunColor.value.copy(e.fogSun || e.sunColor).multiplyScalar(g);
  FOG.uSunDir.value.copy(e.sunDir); FOG.uFogDensity.value = e.density; FOG.uFogFalloff.value = e.falloff;
  FOG.uFogBase.value = e.fogBase || 0; FOG.uFogSunPow.value = e.fogSunPow || 8;
  sun.color.copy(e.sunColor); sun.intensity = e.sunI ?? 2.5;
  hemi.color.copy(e.hemiSky || e.zenith); hemi.groundColor.copy(e.hemiGround || e.ground || e.horizon); hemi.intensity = e.hemiI ?? 0.6;
  ctx.shadowFocus = e.shadowFocus || 70;
}
export function lerpEnv(a, b, k) {
  const o = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[key] ?? b[key], y = b[key] ?? a[key];
    if (x instanceof THREE.Color) o[key] = x.clone().lerp(y, k);
    else if (x instanceof THREE.Vector3) o[key] = x.clone().lerp(y, k).normalize();
    else if (typeof x === 'number') o[key] = x + (y - x) * k;
    else o[key] = k < 0.5 ? x : y;
  }
  return o;
}
export const dir = (az, el) => {   // azimuth (deg, 0 = -z, 90 = +x), elevation (deg)
  const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
};

/* Mist sheets: soft fog banks standing across the line of travel. The camera
   flies through them; each fades as it comes within reach so it never pops. */
export function makeMist(o = {}) {
  const rnd = mulberry32(o.seed || 11), group = new THREE.Group();
  const uni = { ...FOG, uOpacity: { value: o.opacity ?? 0.5 }, uTint: { value: o.tint || new THREE.Color(1, 1, 1) }, uBottom: { value: o.bottom ?? 0 }, uSoft: { value: o.soft ?? 16 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vWorld; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uOpacity, uTime, uBottom, uSoft; uniform vec3 uTint;
      varying vec3 vWorld; varying vec2 vUv;
      ${FOG_GLSL_REF()}
      float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){
        vec3 q = vWorld * 0.018 + vec3(uTime * 0.04, 0.0, uTime * 0.02);
        float n = n3(q) * 0.55 + n3(q * 2.3) * 0.3 + n3(q * 5.1) * 0.15;
        float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x) * smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
        float near = smoothstep(6.0, 45.0, length(vWorld - uCamPos));
        // soft where the sheet meets the ground or water, so it never draws a hard line there
        float ground = smoothstep(uBottom, uBottom + uSoft, vWorld.y);
        float a = smoothstep(0.35, 0.8, n) * edge * near * ground * uOpacity;
        gl_FragColor = vec4(fogTint(vWorld) * uTint, a);
      }`,
  });
  for (let i = 0; i < (o.count || 10); i++) {
    const w = o.width || 420, h = o.height || 70;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    const z = mix(o.z0 ?? 0, o.z1 ?? -1000, (i + rnd() * 0.6) / (o.count || 10));
    m.position.set((rnd() - 0.5) * (o.spreadX || 120) + (o.x || 0), (o.y ?? h * 0.35), z);
    m.rotation.y = (rnd() - 0.5) * 0.5;
    m.renderOrder = 6; group.add(m);
  }
  return { group, u: uni };
}
// fog GLSL for materials defined here (kept as a function to avoid an import cycle in string templates)
import { FOG_GLSL } from '../engine.js';
function FOG_GLSL_REF() { return FOG_GLSL; }

// A title or any text that is not a sung line: words with explicit times.
export function fakeLine(words) { return { id: 'title', words: words.map(([text, start, end]) => ({ text, start, end })) }; }

// A rock spire: a tapered cylinder pushed out of round by noise, for silhouettes.
export function spire(h, r, seed, material) {
  const g = new THREE.CylinderGeometry(r * 0.35, r, h, 18, 24, false);
  g.translate(0, h / 2, 0);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x), y = v.y / h;
    const k = 1 + 0.35 * fbm(Math.cos(a) * 1.3 + seed, y * 4 + seed * 3, 4) + 0.15 * fbm(a * 3 + seed, y * 12, 3);
    p.setXYZ(i, v.x * k, v.y + fbm(a + seed, seed, 2) * h * 0.04, v.z * k);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material); m.castShadow = true; m.receiveShadow = true;
  return m;
}
