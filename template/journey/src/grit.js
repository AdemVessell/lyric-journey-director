/* The grit layer (2026-10-29). Adem, on the finished film: some places look
 * "a bit too plain cgi"; he would like "more details and yet more grit, more
 * analogue looking". The movement, direction and effects carry over to the next
 * lyric videos, and this is what goes with them.
 *
 * In this template it is on at the heavy strength by default (engine.js): ?grit=1 is
 * medium, and ?grit=0 compiles none of it, so no material, pass or scene object
 * changes and the film renders plain.
 *
 *   surfaces  every built-in material (std / phys in zones/kit.js) takes a profile
 *             by its cache key: relief, patches of colour and roughness, grit,
 *             strata and cracks, rust and smudges, scars and barnacles, weave,
 *             puddles, dust settled on faces that look up, darkening in cavities;
 *   air       dust drifting around the camera, lit by the sun, brightest toward it;
 *   film      in engine.js: grain, halation, gate weave, flicker, edge softness.
 *
 * Every octave of surface detail fades out as its wavelength nears the size of a
 * pixel, so distant surfaces keep their colour and never shimmer. All of it is
 * shading chosen to look right, not a physical model.
 */
import * as THREE from 'three';
import { GRIT, FOG, FOG_GLSL } from './engine.js';

const HEAVY = GRIT === 2 ? 1 : 0;
const L = (medium, heavy) => medium + (heavy - medium) * HEAVY;
export const GRIT_U = { uGrit: { value: L(1, 1.7) } };

/* ---------- surfaces ---------- */
// slope: relief as a mean slope; f0 / oct: its coarsest octave (cycles per metre) and count;
// ridged folds every octave into creases. patch / pf: broad tonal patches and their scale;
// grit / sf: fine light-and-dark texture; cavity: darkening in local hollows. The rest are
// one material's own marks.
const PROFILES = {
  sand:    { slope: 0.1, f0: 1 / 4, oct: 6, patch: 0.05, pf: 1 / 32, rough: 0.04, grit: 0.06, sf: 16, cavity: 0.3, ripple: 0.008 },
  ground:  { slope: 0.14, f0: 1 / 4, oct: 6, patch: 0.07, pf: 1 / 32, rough: 0.05, grit: 0.1, sf: 8, cavity: 0.35 },
  rock:    { slope: 0.3, f0: 1 / 8, oct: 7, ridged: 1, patch: 0.1, pf: 1 / 16, rough: 0.08, grit: 0.12, sf: 4, cavity: 0.5, strata: 0.06, h1: 1.7, h2: 11, crack: 0.5, cf: 1 / 4, dust: 0.4 },
  alpine:  { slope: 0.3, f0: 1 / 16, oct: 8, ridged: 1, patch: 0.08, pf: 1 / 64, rough: 0.06, grit: 0.08, sf: 2, cavity: 0.45, strata: 0.05, h1: 11, h2: 37, crack: 0.3, cf: 1 / 8 },
  metal:   { slope: 0.02, f0: 1, oct: 3, patch: 0.06, pf: 1 / 4, grit: 0.04, sf: 16, cavity: 0.15, smudge: 0.12, rust: 0.35, dust: 0.3 },
  skin:    { slope: 0.08, f0: 1 / 4, oct: 6, patch: 0.14, pf: 1 / 8, rough: 0.1, grit: 0.06, sf: 4, cavity: 0.35, scars: 0.5, barnacles: 0.5 },
  cloth:   { slope: 0.05, f0: 1 / 2, oct: 5, patch: 0.05, pf: 1 / 32, rough: 0.05, cavity: 0.25, weave: 1 },
  glass:   { gsmudge: 0.06, dust: 0.3 },
  plaster: { slope: 0.12, f0: 1, oct: 5, patch: 0.09, pf: 1 / 8, rough: 0.05, grit: 0.08, sf: 8, cavity: 0.35, streaks: 0.35, dust: 0.25 },
  wet:     { slope: 0.03, f0: 1 / 2, oct: 4, patch: 0.05, pf: 1 / 32, cavity: 0.1, puddles: 1 },
  smooth:  { slope: 0.01, f0: 2, oct: 3, patch: 0.04, pf: 1 / 2, rough: 0.04, cavity: 0.1 },
};
const BY_KEY = {
  sand: 'sand', bed: 'sand', estates: 'ground', meadow: 'ground', salt: 'ground',
  stone: 'rock', cavern: 'rock', 'cavern-x': 'rock', pebble: 'rock', stick: 'rock', tie: 'rock', roof: 'rock',
  frame: 'metal', rail: 'metal', train: 'metal', whale: 'skin', cloth: 'cloth',
  gem: 'glass', glass: 'glass', 'cav-gem': 'glass', house: 'plaster', wetflat: 'wet', clip: 'smooth',
};
// Materials by cache-key prefix (Made Well's, kept as examples). A new place's material
// takes a profile by naming its cache key with one of these prefixes, or add a row.
const BY_PREFIX = [['wetclay', 'smooth'], ['pots', 'plaster'], ['adobe', 'plaster'], ['floor', 'ground'], ['wood', 'rock'],
  ['iron', 'metal'], ['milestone', 'rock'], ['road', 'ground'], ['hills', 'ground'], ['soot', 'ground'], ['mud', 'ground'],
  ['wellstone', 'rock'], ['canyon', 'alpine'], ['glaze', 'smooth'], ['gold', 'smooth'], ['film', 'smooth'], ['brick', 'rock'], ['mtn', 'alpine']];
export const profileOf = (key = '') => BY_KEY[key] || (BY_PREFIX.find(([p]) => key.startsWith(p)) || [0, 'rock'])[1];

const LIB = /* glsl */`
uniform float uGrit;
uvec3 g_pcg3(uvec3 v){ v = v * 1664525u + 1013904223u; v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u; v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y; return v; }
float g_h(vec3 i, float n){ return float(g_pcg3(uvec3(mod(i, n))).x) * (1.0 / 4294967295.0); }
// value noise and its analytic gradient, periodic over n cells: (value in [-1,1], d/dx)
vec4 g_vnoise(vec3 x, float n){
  vec3 i = floor(x), f = x - i;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0), du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float a = g_h(i, n), b = g_h(i + vec3(1, 0, 0), n), c = g_h(i + vec3(0, 1, 0), n), d = g_h(i + vec3(1, 1, 0), n);
  float e = g_h(i + vec3(0, 0, 1), n), f1 = g_h(i + vec3(1, 0, 1), n), g = g_h(i + vec3(0, 1, 1), n), h = g_h(i + vec3(1, 1, 1), n);
  float k1 = b - a, k2 = c - a, k3 = e - a, k4 = a - b - c + d, k5 = a - c - e + g, k6 = a - b - e + f1, k7 = -a + b + c - d + e - f1 - g + h;
  float v = a + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z;
  vec3 dv = du * vec3(k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z, k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x, k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y);
  return vec4(v * 2.0 - 1.0, dv * 2.0);
}
// An octave of wavelength 1/f stays while it spans enough pixels at footprint fp (metres per
// pixel): colour and roughness need about eight, below which they read as noise; relief, three.
float g_vis(float fp, float f, float lo){ return 1.0 - smoothstep(lo, lo * 2.5, fp * f); }
// fbm of the world position wrapped to 512 m (so large coordinates keep their precision), from
// f0 cycles per metre (a power of two, so every octave tiles the wrap). It returns the value,
// octaves halving, and the slope with every octave weighted alike, so relief reads at every
// distance; hi is the value of the finer octaves alone, a measure of local hollows. ridged
// folds each octave about zero into creases.
vec4 g_fbm(vec3 q, float f0, int oct, float fp, float ridged, out float hi){
  vec4 s = vec4(0.0); float a = 0.5, f = f0, norm = 0.0, hn = 0.0; hi = 0.0;
  for (int k = 0; k < 8; k++){
    if (k >= oct) break;
    vec4 n = g_vnoise(q * f, 512.0 * f);
    n = mix(n, vec4(1.0 - 2.0 * abs(n.x), -2.0 * sign(n.x) * n.yzw), ridged);
    float vc = g_vis(fp, f, 0.06), vr = g_vis(fp, f, 0.15);
    s.x += a * vc * n.x; s.yzw += vr * n.yzw;
    if (k >= 2) { hi += a * vc * n.x; hn += a; }
    norm += a; a *= 0.5; f *= 2.0;
  }
  hi /= max(hn, 1e-4);
  return vec4(s.x / max(norm, 1e-4), s.yzw / float(oct));
}
`;

const g = (x) => x.toFixed(6);
// The detail for one profile, as GLSL run right after <color_fragment>. Every name starts
// with g_, because zone patches put their own locals into the same scope.
function surface(p) {
  const pf = p.pf || 1 / 8;
  const s = [`
    vec3 g_w = vFogWorld, g_q = mod(g_w, 512.0);
    float g_fp = max(length(dFdx(g_w)), length(dFdy(g_w))) + 1e-5;
    #ifdef FLAT_SHADED
      vec3 g_nv = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
    #else
      vec3 g_nv = normalize(vNormal);
      #ifdef DOUBLE_SIDED
        g_nv *= gl_FrontFacing ? 1.0 : -1.0;
      #endif
    #endif
    vec3 g_n = inverseTransformDirection(g_nv, viewMatrix);
    vec3 g_col = diffuseColor.rgb, g_grad = vec3(0.0);
    float g_rough = 0.0, g_metal = 1.0, g_cav = 1.0, g_hi = 0.0, g_hip = 0.0;
    // broad patches, their outlines warped by the gradient of one coarser noise
    vec4 g_wn = g_vnoise(g_q * ${g(pf * 2)}, ${g(512 * pf * 2)});
    vec4 g_p = g_fbm(g_q + vec3(37.0, 11.0, 53.0) + g_wn.yzw * ${g(0.25 / pf)}, ${g(pf)}, 3, g_fp, 0.0, g_hip);`];
  if (p.slope) s.push(`
    vec4 g_r = g_fbm(g_q, ${g(p.f0)}, ${p.oct}, g_fp, ${g(p.ridged || 0)}, g_hi);
    g_grad += ${g(p.slope)} * uGrit * g_r.yzw;
    g_cav *= 1.0 - ${g(p.cavity || 0)} * clamp(-g_hi * 1.4, 0.0, 1.0) * 0.8;`);
  if (p.patch) s.push(`
    g_col *= 1.0 + ${g(p.patch)} * uGrit * 2.0 * g_p.x * vec3(1.0, 0.95, 0.88);
    g_rough += ${g(p.rough || 0)} * uGrit * 2.0 * g_p.x;`);
  if (p.grit) s.push(`
    float g_gr = g_vnoise(g_q * ${g(p.sf)}, ${g(512 * p.sf)}).x * g_vis(g_fp, ${g(p.sf)}, 0.06);
    g_col *= 1.0 + ${g(p.grit)} * uGrit * g_gr;
    g_rough += ${g(p.grit)} * 0.5 * uGrit * g_gr;`);
  if (p.ripple) s.push(`
    // wind ripples, four to the metre across the wind; darker grains settle in the troughs
    float g_rv = g_vis(g_fp, 4.0, 0.12);
    float g_ph = dot(g_w.xz, vec2(0.82, 0.57)) * 25.13 + g_p.x * 9.0 + ${p.slope ? 'g_r.x' : '0.0'} * 4.0;
    g_grad.xz += ${g(p.ripple)} * uGrit * g_rv * cos(g_ph) * 25.13 * vec2(0.82, 0.57);
    float g_tr = g_rv * smoothstep(0.3, 1.0, -sin(g_ph));
    g_cav *= 1.0 - 0.12 * g_tr; g_col *= 1.0 - 0.07 * uGrit * g_tr;`);
  if (p.strata) s.push(`
    // bedding in two courses, warped by the patches
    float g_wp = g_p.x * 2.5 + g_wn.x * 1.5;
    float g_b1 = g_w.y * ${g(2 * Math.PI / p.h1)} + g_wp * 3.0, g_b2 = g_w.y * ${g(2 * Math.PI / p.h2)} + g_wp * 1.7;
    float g_v1 = 1.0 - smoothstep(0.08, 0.2, g_fp / ${g(p.h1)}), g_v2 = 1.0 - smoothstep(0.08, 0.2, g_fp / ${g(p.h2)});
    g_col *= 1.0 + ${g(p.strata)} * uGrit * (sin(g_b1) * g_v1 + 0.8 * sin(g_b2) * g_v2);
    g_grad.y += ${g(p.strata * 2)} * uGrit * (cos(g_b1) * g_v1 + cos(g_b2) * g_v2);`);
  if (p.crack) s.push(`
    // cracks along the zero lines of a noise, only where the patches allow
    vec4 g_c = g_vnoise(g_q * ${g(p.cf)}, ${g(512 * p.cf)});
    float g_cr = (1.0 - smoothstep(0.0, 0.025, abs(g_c.x))) * smoothstep(-0.1, 0.25, g_p.x) * g_vis(g_fp, ${g(p.cf)}, 0.05);
    g_col *= 1.0 - ${g(p.crack)} * uGrit * 0.6 * g_cr;
    g_cav *= 1.0 - ${g(p.crack)} * 0.7 * g_cr;`);
  if (p.smudge) s.push(`
    // smudged and dulled in patches; rust and grime where two noises agree
    float g_mh = 0.0;
    vec4 g_m = g_fbm(g_q + vec3(91.0, 17.0, 5.0), 0.5, 3, g_fp, 0.0, g_mh);
    g_rough += ${g(p.smudge)} * uGrit * 2.0 * g_m.x;
    float g_ru = clamp(smoothstep(0.1, 0.45, g_m.x + 0.6 * g_p.x) * ${g(p.rust || 0)} * uGrit, 0.0, 1.0);
    g_col = mix(g_col, vec3(0.15, 0.085, 0.05), g_ru * 0.85);
    g_rough += g_ru * 0.45; g_metal *= 1.0 - g_ru * 0.9;`);
  if (p.gsmudge) s.push(`
    g_rough += ${g(p.gsmudge)} * uGrit * smoothstep(0.0, 0.4, g_p.x);`);
  if (p.scars) s.push(`
    // pale scars along the zero lines of a noise; barnacles crusted in clusters
    vec4 g_sc = g_vnoise(g_q * 0.25, 128.0);
    float g_scar = (1.0 - smoothstep(0.0, 0.02, abs(g_sc.x))) * g_vis(g_fp, 0.25, 0.05) * smoothstep(-0.2, 0.2, g_p.x);
    g_col = mix(g_col, g_col * 1.5 + 0.05, g_scar * ${g(p.scars)} * uGrit);
    g_rough += g_scar * 0.25;
    vec4 g_bn = g_vnoise(g_q * 4.0, 2048.0);
    float g_bv = g_vis(g_fp, 4.0, 0.08), g_cl = smoothstep(0.15, 0.45, g_p.x);
    float g_bm = g_cl * mix(0.15, smoothstep(0.05, 0.5, g_bn.x), g_bv);
    g_col = mix(g_col, vec3(0.42, 0.4, 0.36), clamp(g_bm * ${g(p.barnacles)} * uGrit, 0.0, 0.9));
    g_rough += g_bm * ${g(p.barnacles)} * 0.6;
    g_grad += g_cl * g_bv * ${g(p.barnacles)} * uGrit * 0.12 * g_bn.yzw;`);
  if (p.weave) s.push(`
    // a coarse weave, eight threads to the metre, and slubbed bands along the warp
    float g_wv = g_vis(g_fp, 8.0, 0.1);
    float g_sx = sin(g_w.x * 50.265), g_sz = sin(g_w.z * 50.265);
    g_col *= 1.0 + 0.05 * uGrit * g_sx * g_sz * g_wv;
    g_grad += 0.0015 * uGrit * g_wv * 50.265 * vec3(cos(g_w.x * 50.265) * g_sz, 0.0, g_sx * cos(g_w.z * 50.265));
    g_col *= 1.0 + 0.04 * uGrit * sin(g_w.x * 2.3 + g_p.x * 4.0) * sin(g_w.x * 0.71 + 1.3);`);
  if (p.streaks) s.push(`
    // stains run down the walls
    float g_st = smoothstep(0.15, 0.6, g_vnoise(vec3(g_w.x * 2.0, g_w.y * 0.15, g_w.z * 2.0), 65536.0).x) * g_vis(g_fp, 2.0, 0.06);
    g_col *= 1.0 - ${g(p.streaks)} * uGrit * 0.45 * g_st;`);
  if (p.puddles) s.push(`
    // standing water mirrors; the rest is damp and dull
    float g_ph2 = 0.0;
    vec4 g_pd = g_fbm(g_q + vec3(17.0, 0.0, 29.0), 1.0 / 32.0, 4, g_fp, 0.0, g_ph2);
    float g_wet = smoothstep(-0.04, 0.1, g_pd.x);
    g_rough = mix(g_rough + 0.35, -0.22, g_wet);
    g_col *= mix(1.12, 0.82, g_wet);
    g_grad *= 1.0 - g_wet;`);
  if (p.dust) s.push(`
    // dust settled on faces that look up, tinted toward the place's air
    float g_up = clamp(smoothstep(0.45, 0.9, g_n.y) * clamp(0.75 + g_p.x * 0.8, 0.0, 1.0) * ${g(p.dust)} * uGrit, 0.0, 0.85);
    g_col = mix(g_col, mix(vec3(0.6, 0.56, 0.5), normalize(uFogColor + 1e-3) * 1.04, 0.3), g_up);
    g_rough += g_up * 0.3; g_metal *= 1.0 - g_up * 0.8;`);
  s.push(`
    diffuseColor.rgb = max(g_col * mix(1.0, g_cav, 0.4), 0.0);`);
  return s.join('');
}

// Give a built-in material (already routed through patchFog) its grit profile.
export function gritMaterial(material) {
  if (!GRIT) return material;
  const name = profileOf(material.userData.cacheKey), code = surface(PROFILES[name]);
  const prev = material.onBeforeCompile, prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    Object.assign(sh.uniforms, GRIT_U);
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', LIB + 'void main() {')
      .replace('#include <color_fragment>', '#include <color_fragment>' + code)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = clamp(roughnessFactor + g_rough, 0.03, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor *= g_metal;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 g_gv = (viewMatrix * vec4(g_grad, 0.0)).xyz;
        normal = normalize(normal - (g_gv - normal * dot(g_gv, normal)));`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= g_cav; reflectedLight.indirectSpecular *= mix(1.0, g_cav, 0.6);`);
  };
  material.customProgramCacheKey = () => prevKey() + '|grit-' + name;
  return material;
}

/* ---------- air ---------- */
// Dust that wraps around the camera, as particles.js does. A mote only shows when the sun is
// behind it (Henyey-Greenstein, g = 0.7), so it glints looking toward the light and all but
// vanishes away from it. Its strength is set per place by gritPost.
const DUST_BY_PLACE = {
  'the workshop': 1.3, 'the road': 1, 'the foundry': 0.7, 'the quench': 0.3, 'the frames': 1, 'the well': 0.35,
  'the night foundry': 0.7, 'the gold canyon': 1, 'the vessel': 0.3,
};
function prng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function makeDust() {
  const n = 12000, box = [44, 24, 44], rnd = prng(0xD057);
  const base = new Float32Array(n * 3), seed = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) base[i * 3 + k] = (rnd() - 0.5) * box[k];
    for (let k = 0; k < 4; k++) seed[i * 4 + k] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(base, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const u = { ...FOG, uBox: { value: new THREE.Vector3(...box) }, uOpacity: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform vec3 uBox, uCamPos; uniform float uTime;
      attribute vec4 aSeed;
      varying float vA; varying vec3 vWorld;
      void main(){
        // slow drift and a little turbulence, closed-form in time so every shutter sample agrees
        vec3 p = position + vec3(0.25, -0.06, 0.15) * uTime * (0.5 + aSeed.w)
          + 0.6 * vec3(sin(uTime * (0.21 + aSeed.x * 0.3) + aSeed.y * 6.28), 0.5 * sin(uTime * (0.17 + aSeed.y * 0.2) + aSeed.z * 6.28), cos(uTime * (0.19 + aSeed.z * 0.3) + aSeed.x * 6.28));
        p = uCamPos + mod(p - uCamPos + uBox * 0.5, uBox) - uBox * 0.5;
        vec3 q = abs(p - uCamPos) / (uBox * 0.5);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float d = max(-mv.z, 0.05);
        float sz = 0.018 * (0.4 + 1.2 * aSeed.y * aSeed.y) * projectionMatrix[1][1] * 540.0 / d;
        vA = (1.0 - smoothstep(0.7, 1.0, max(q.x, max(q.y, q.z)))) * smoothstep(1.5, 3.5, d) * clamp(sz / 0.8, 0.0, 1.0);
        gl_PointSize = clamp(sz, 0.8, 6.0);
        vWorld = p;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity;
      varying float vA; varying vec3 vWorld;
      ${FOG_GLSL}
      void main(){
        float a = 1.0 - smoothstep(0.15, 0.5, length(gl_PointCoord - 0.5));
        float mu = dot(normalize(vWorld - uCamPos), uSunDir);
        float hg = 0.51 / (12.566 * pow(1.49 - 1.4 * mu, 1.5));
        vec3 col = uFogSunColor * hg * 2.5 + uFogColor * 0.12;
        gl_FragColor = vec4(col * a * vA * uOpacity * (1.0 - fogAmount(vWorld)), 1.0);
      }`,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 5;
  return { mesh: pts, u };
}

/* ---------- film, per output frame ---------- */
function hash1(i) { let h = Math.imul(i ^ 0x9E3779B9, 0x85EBCA6B); h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
const sn = (i) => hash1(i) * 2 - 1;
const vn = (x) => { const i = Math.floor(x), f = x - i, w = f * f * (3 - 2 * f); return sn(i) * (1 - w) + sn(i + 1) * w; };
// Film and dust settings for the frame at time t; runs after the place's own post.
export function gritPost(t, P, place, dust) {
  const f = Math.round(t * 30);
  P.grainAmt = L(0.035, 0.055); P.grainSize = L(1.35, 2.1); P.grainChroma = L(0.3, 0.45);
  P.halation = L(0.3, 0.55); P.softBase = L(0.35, 0.6); P.softEdge = L(1, 2);
  P.vignette += L(0.05, 0.1); P.ca *= L(1.2, 1.4);
  // gate weave: mostly a slow wander, partly frame-to-frame jitter, less vertically
  const wv = L(0.45, 0.9);
  P.weave.set(wv * (0.7 * vn(f * 0.11) + 0.3 * sn(f * 3 + 1)), 0.7 * wv * (0.7 * vn(f * 0.09 + 50) + 0.3 * sn(f * 3 + 2)));
  P.flicker = 1 + L(0.01, 0.022) * (0.6 * vn(f * 0.23 + 100) + 0.4 * sn(f * 3 + 3));
  // a place sets its own dust with `dust: 0..1.3` on its object; Made Well's places are listed by name
  if (dust) dust.u.uOpacity.value = 1.2 * L(1, 1.6) * (place.dust ?? DUST_BY_PLACE[place.name] ?? 0.8);
}
