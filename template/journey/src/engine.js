/* Render engine for the journey.
 *
 * scene -> HDR target (half float, 4x MSAA) -> bloom (13-tap down / tent up mip
 * chain) + god rays (radial blur of the bright pass toward the sun) -> combined
 * and ADDED, weighted, into a linear accumulation target once per shutter
 * sub-sample -> final grade (AgX with a look, grade, chromatic edge split,
 * vignette, veil, grain) -> canvas.
 *
 * Motion blur therefore averages linear light before tone mapping, the way a
 * real shutter integrates, and grain is applied once per output frame so the
 * average never smooths it away.
 *
 * Fog is one shared exponential height fog (Quilez's analytic integral) with
 * in-scatter toward the sun. Built-in materials are patched to it; custom shaders
 * include FOG_GLSL. Every uniform object is shared by reference, so one write
 * reaches every material.
 *
 * ?grit=1 or 2 compiles in the film half of the grit layer (see grit.js):
 * halation in each shutter sub-sample; weave, flicker, edge softness and grain
 * in the final pass. Without it the passes compile exactly as before.
 */
import * as THREE from 'three';

export const W = 1920, H = 1080;
// The house look takes the heavy grit by default (Adem chose it for Made Well, 2026-10-29);
// ?grit=1 is medium and ?grit=0 renders plain.
const GRIT_Q = new URLSearchParams(globalThis.location?.search || '').get('grit');
export const GRIT = GRIT_Q === null ? 2 : Math.min(2, Number(GRIT_Q) || 0);

export const FOG = {
  uFogColor: { value: new THREE.Color(0.5, 0.5, 0.55) },
  uFogSunColor: { value: new THREE.Color(1, 0.9, 0.8) },
  uSunDir: { value: new THREE.Vector3(0, 0.2, -1).normalize() },
  uFogDensity: { value: 0.002 },
  uFogFalloff: { value: 0.02 },
  uFogBase: { value: 0 },
  uFogSunPow: { value: 8 },
  uCamPos: { value: new THREE.Vector3() },
  uTime: { value: 0 },
};

export const FOG_GLSL = /* glsl */`
uniform vec3 uFogColor;
uniform vec3 uFogSunColor;
uniform vec3 uSunDir;
uniform float uFogDensity;
uniform float uFogFalloff;
uniform float uFogBase;
uniform float uFogSunPow;
uniform vec3 uCamPos;
float fogAmount(vec3 worldPos) {
  vec3 d = worldPos - uCamPos;
  float dist = length(d);
  float b = max(uFogFalloff, 1e-5);
  float dy = d.y;
  float amt = uFogDensity * exp(-b * (uCamPos.y - uFogBase)) * dist;
  if (abs(dy) > 1e-3) amt *= (1.0 - exp(-b * dy)) / (b * dy);
  return 1.0 - exp(-max(amt, 0.0));
}
vec3 fogTint(vec3 worldPos) {
  vec3 dir = normalize(worldPos - uCamPos);
  float s = pow(max(dot(dir, uSunDir), 0.0), uFogSunPow);
  return mix(uFogColor, uFogSunColor, s);
}
vec3 applyFog(vec3 col, vec3 worldPos) {
  return mix(col, fogTint(worldPos), fogAmount(worldPos));
}
`;

// Route a built-in material's fog through the shared height fog.
export function patchFog(material, extra) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    Object.assign(sh.uniforms, FOG);
    sh.vertexShader = sh.vertexShader
      .replace('#include <fog_pars_vertex>', 'varying vec3 vFogWorld;')
      .replace('#include <fog_vertex>', `
        #ifdef USE_INSTANCING
          vFogWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vFogWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <fog_pars_fragment>', 'varying vec3 vFogWorld;\n' + FOG_GLSL)
      .replace('#include <fog_fragment>', 'gl_FragColor.rgb = applyFog(gl_FragColor.rgb, vFogWorld);');
    if (prev) prev(sh, r);
    if (extra) extra(sh, r);
  };
  material.customProgramCacheKey = () => 'hfog' + (material.userData.cacheKey || '');
  return material;
}

/* ---------- full-screen passes ---------- */
const quadGeo = new THREE.BufferGeometry();
quadGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
quadGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
function pass(frag, uniforms, opts = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms, depthTest: false, depthWrite: false, glslVersion: THREE.GLSL3,
    vertexShader: `out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `precision highp float; in vec2 vUv; out vec4 outColor;\n${frag}`,
    ...opts,
  });
  const mesh = new THREE.Mesh(quadGeo, mat);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(mesh);
  return { mat, run(renderer, target) { renderer.setRenderTarget(target); renderer.render(scene, quadCam); } };
}
const rt = (w, h, o = {}) => new THREE.WebGLRenderTarget(w, h, {
  type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false,
  minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, ...o,
});

export class Engine {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance',
    });
    r.setPixelRatio(1); r.setSize(W, H, false);
    r.outputColorSpace = THREE.LinearSRGBColorSpace;   // the grade pass encodes sRGB itself
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap; r.shadowMap.autoUpdate = false;
    this.maxAniso = r.capabilities.getMaxAnisotropy();

    this.hdr = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
    this.accum = rt(W, H, { type: THREE.FloatType });
    // bloom mip chain, from half resolution down
    this.mips = [];
    for (let i = 1; i <= 6; i++) this.mips.push(rt(Math.max(1, W >> i), Math.max(1, H >> i)));
    this.ups = this.mips.slice(0, 5).map((m) => rt(m.width, m.height));
    this.rays = rt(W >> 2, H >> 2);

    this.P = {
      exposure: 1, bloom: 0.6, bloomThreshold: 1.0, bloomKnee: 0.6, rays: 0, raysDecay: 0.95,
      sunUv: new THREE.Vector2(0.5, 0.5), sunOn: 0,
      lift: new THREE.Vector3(0, 0, 0), gamma: new THREE.Vector3(1, 1, 1), gain: new THREE.Vector3(1, 1, 1),
      saturation: 1, contrast: 1, lookPower: 1, lookSat: 1, vignette: 0.35, ca: 0.6, grain: 0.035, veil: 0,
      veilColor: new THREE.Color(1, 1, 1), letterbox: 0, split: new THREE.Vector3(0, 0, 0),
      // grit only: set per frame by gritPost
      halation: 0, weave: new THREE.Vector2(), flicker: 1, softBase: 0, softEdge: 0, grainAmt: 0, grainSize: 1, grainChroma: 0,
    };

    this.prefilter = pass(`
      uniform sampler2D tSrc; uniform vec2 texel; uniform float threshold, knee;
      void main(){
        vec3 c = vec3(0.0);
        c += texture(tSrc, vUv + texel * vec2(-0.5,-0.5)).rgb; c += texture(tSrc, vUv + texel * vec2(0.5,-0.5)).rgb;
        c += texture(tSrc, vUv + texel * vec2(-0.5,0.5)).rgb;  c += texture(tSrc, vUv + texel * vec2(0.5,0.5)).rgb;
        c *= 0.25;
        float br = max(c.r, max(c.g, c.b));
        float rq = clamp(br - threshold + knee, 0.0, 2.0 * knee); rq = rq * rq / (4.0 * knee + 1e-5);
        float w = max(rq, br - threshold) / max(br, 1e-5);
        outColor = vec4(min(c * w, vec3(64.0)), 1.0);
      }`, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1 }, knee: { value: 0.5 } });
    // 13-tap downsample (Jimenez, "Next Generation Post Processing in Call of Duty")
    this.down = pass(`
      uniform sampler2D tSrc; uniform vec2 texel;
      vec3 s(vec2 o){ return texture(tSrc, vUv + texel * o).rgb; }
      void main(){
        vec3 a = s(vec2(-2,2)), b = s(vec2(0,2)), c = s(vec2(2,2));
        vec3 d = s(vec2(-2,0)), e = s(vec2(0,0)), f = s(vec2(2,0));
        vec3 g = s(vec2(-2,-2)), h = s(vec2(0,-2)), i = s(vec2(2,-2));
        vec3 j = s(vec2(-1,1)), k = s(vec2(1,1)), l = s(vec2(-1,-1)), m = s(vec2(1,-1));
        vec3 o = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
        outColor = vec4(o, 1.0);
      }`, { tSrc: { value: null }, texel: { value: new THREE.Vector2() } });
    // 3x3 tent upsample, added to the finer level
    this.up = pass(`
      uniform sampler2D tSrc; uniform sampler2D tBase; uniform vec2 texel; uniform float radius;
      vec3 s(vec2 o){ return texture(tSrc, vUv + texel * o * radius).rgb; }
      void main(){
        vec3 o = s(vec2(0,0)) * 4.0 + (s(vec2(-1,0)) + s(vec2(1,0)) + s(vec2(0,-1)) + s(vec2(0,1))) * 2.0
          + s(vec2(-1,-1)) + s(vec2(1,-1)) + s(vec2(-1,1)) + s(vec2(1,1));
        outColor = vec4(texture(tBase, vUv).rgb + o / 16.0, 1.0);
      }`, { tSrc: { value: null }, tBase: { value: null }, texel: { value: new THREE.Vector2() }, radius: { value: 1 } });
    // crepuscular rays: march the bright pass toward the sun's screen position
    this.raysPass = pass(`
      uniform sampler2D tSrc; uniform vec2 sun; uniform float decay;
      void main(){
        vec2 d = (sun - vUv) / 48.0; vec2 uv = vUv; float w = 1.0; vec3 acc = vec3(0.0);
        for (int i = 0; i < 48; i++) { acc += texture(tSrc, uv).rgb * w; w *= decay; uv += d; }
        outColor = vec4(acc / 48.0, 1.0);
      }`, { tSrc: { value: null }, sun: { value: new THREE.Vector2() }, decay: { value: 0.95 } });
    // one shutter sub-sample, added into the accumulation target with its weight
    this.acc = pass(`${GRIT ? '#define GRIT\n' : ''}
      uniform sampler2D tHdr, tBloom, tRays; uniform float bloom, rays, weight;
      #ifdef GRIT
      // halation: light that crossed the emulsion and came back off the film base, which the
      // red layer records as a warm fringe around bright sources
      uniform sampler2D tHalA, tHalB; uniform float halation;
      #endif
      void main(){
        vec3 c = texture(tHdr, vUv).rgb + texture(tBloom, vUv).rgb * bloom + texture(tRays, vUv).rgb * rays;
        #ifdef GRIT
        c += (texture(tHalA, vUv).rgb * 0.55 + texture(tHalB, vUv).rgb * 0.45) * vec3(1.0, 0.32, 0.12) * halation;
        #endif
        outColor = vec4(c * weight, 1.0);
      }`, { tHdr: { value: null }, tBloom: { value: null }, tRays: { value: null }, bloom: { value: 0 }, rays: { value: 0 }, weight: { value: 1 },
        ...(GRIT ? { tHalA: { value: null }, tHalB: { value: null }, halation: { value: 0 } } : {}) },
      { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
    this.grade = pass(`${GRIT ? '#define GRIT\n' : ''}
      uniform sampler2D tSrc; uniform float exposure, saturation, contrast, vignette, ca, grain, veil, letterbox, seed, lookPower, lookSat;
      uniform vec3 lift, gammaV, gain, veilColor, split; uniform vec2 res;
      // AgX, after three.js r185 tonemapping_pars_fragment (MIT), itself after Filament / Blender
      vec3 agxContrast(vec3 x){ vec3 x2 = x*x; vec3 x4 = x2*x2;
        return 15.5*x4*x2 - 40.14*x4*x + 31.96*x4 - 6.868*x2*x + 0.4298*x2 + 0.1191*x - 0.00232; }
      vec3 agx(vec3 color){
        const mat3 toRec2020 = mat3(0.6274, 0.0691, 0.0164, 0.3293, 0.9195, 0.0880, 0.0433, 0.0113, 0.8956);
        const mat3 toSrgb = mat3(1.6605, -0.1246, -0.0182, -0.5876, 1.1329, -0.1006, -0.0728, -0.0083, 1.1187);
        const mat3 inset = mat3(0.856627153315983, 0.137318972929847, 0.11189821299995, 0.0951212405381588, 0.761241990602591, 0.0767994186031903, 0.0482516061458583, 0.101439036467562, 0.811302368396859);
        const mat3 outset = mat3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826, -0.11060664309660323, 1.157823702216272, -0.11060664309660294, -0.016493938717834573, -0.016493938717834257, 1.2519364065950405);
        const float minEv = -12.47393, maxEv = 4.026069;
        color = toRec2020 * color; color = inset * color; color = max(color, 1e-10);
        color = log2(color); color = (color - minEv) / (maxEv - minEv); color = clamp(color, 0.0, 1.0);
        color = agxContrast(color);
        // look: an ASC CDL power and saturation in the encoded domain, as in Sobotka's AgX
        // "Punchy" look (power 1.35, saturation 1.4); 1 and 1 is base AgX
        float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
        color = pow(max(color, 0.0), vec3(lookPower)); color = luma + lookSat * (color - luma);
        color = outset * color;
        color = pow(max(vec3(0.0), color), vec3(2.2)); color = toSrgb * color; return clamp(color, 0.0, 1.0);
      }
      // integer hash (pcg2d): float hashes of large pixel coordinates lose precision and stripe
      uvec2 pcg2d(uvec2 v){ v = v * 1664525u + 1013904223u; v.x += v.y * 1664525u; v.y += v.x * 1664525u;
        v = v ^ (v >> 16u); v.x += v.y * 1664525u; v.y += v.x * 1664525u; v = v ^ (v >> 16u); return v; }
      float hash(vec2 p){ return float(pcg2d(uvec2(p)).x) / 4294967295.0; }
      vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
      #ifdef GRIT
      uniform vec2 weave; uniform float flicker, softBase, softEdge, grainAmt, grainSize, grainChroma;
      // the frame as a lens and a film resolve it: the gate weave shifts it, and a soft
      // 9-tap disc widens toward the corners (r2 is 0.5 there)
      vec3 gritSample(vec2 q, float r2, vec2 o){
        vec2 uv = vUv + weave / res, px = (softBase + softEdge * r2 * 2.0) / res;
        const vec2 tap[9] = vec2[9](vec2(0.0), vec2(0.5, 0.0), vec2(-0.5, 0.0), vec2(0.0, 0.5), vec2(0.0, -0.5),
          vec2(0.71, 0.71), vec2(-0.71, 0.71), vec2(0.71, -0.71), vec2(-0.71, -0.71));
        const float wt[9] = float[9](0.28, 0.11, 0.11, 0.11, 0.11, 0.07, 0.07, 0.07, 0.07);
        vec3 c = vec3(0.0);
        for (int k = 0; k < 9; k++) {
          vec2 d = uv + tap[k] * px;
          c += wt[k] * vec3(texture(tSrc, d - o).r, texture(tSrc, d).g, texture(tSrc, d + o).b);
        }
        return c;
      }
      // grain in the encoded domain: three partly shared layers (one per dye), clumped at
      // grainSize pixels over a one-pixel floor, strongest in the mid-tones as in a print
      float gh(vec2 p){ uvec2 v = pcg2d(uvec2(p)); return float((v.x & 65535u) + (v.x >> 16u) + (v.y & 65535u) + (v.y >> 16u)) / 65535.0 - 2.0; }
      float gn(vec2 p){
        vec2 s = p / grainSize, i = floor(s), f = s - i; f = f * f * (3.0 - 2.0 * f);
        float a = gh(i), b = gh(i + vec2(1.0, 0.0)), c = gh(i + vec2(0.0, 1.0)), d = gh(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y) * 1.6 + gh(p + 7919.0) * 0.5;
      }
      vec3 filmGrain(vec3 e){
        vec2 p = gl_FragCoord.xy + vec2(seed * 211.0, seed * 97.0) + 64.0;
        vec3 n = mix(vec3(gn(p)), vec3(gn(p + vec2(1931.0, 0.0)), gn(p + vec2(0.0, 2713.0)), gn(p + vec2(3571.0, 1187.0))), grainChroma);
        float le = dot(e, vec3(0.2126, 0.7152, 0.0722));
        return clamp(e + n * grainAmt * (0.45 + 2.2 * le * (1.0 - le)), 0.0, 1.0);
      }
      #endif
      void main(){
        vec2 q = vUv - 0.5; float r2 = dot(q, q);
        // chromatic edge split: zero at centre, grows with the square of the radius
        vec2 o = q * r2 * ca * 0.02;
        #ifdef GRIT
        vec3 c = gritSample(q, r2, o) * exposure * flicker;
        #else
        vec3 c = vec3(texture(tSrc, vUv - o).r, texture(tSrc, vUv).g, texture(tSrc, vUv + o).b) * exposure;
        #endif
        c = agx(c);
        c = pow(max(c * gain + lift * (1.0 - c), 0.0), 1.0 / gammaV);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, saturation);
        c = mix(c, c + split * (0.5 - l) , 0.5);
        c = (c - 0.5) * contrast + 0.5;
        c *= mix(1.0, smoothstep(0.95, 0.2, sqrt(r2) * 1.25), vignette);
        c = mix(c, veilColor, veil);
        #ifdef GRIT
        float bar = step(abs(q.y), 0.5 - letterbox);
        outColor = vec4(filmGrain(srgb(clamp(c, 0.0, 1.0))) * bar, 1.0);
        #else
        float g = hash(vUv * res + vec2(seed * 211.0, seed * 97.0)) - 0.5;
        c += g * grain * (0.6 + 0.8 * (1.0 - l));
        float bar = step(abs(q.y), 0.5 - letterbox);
        outColor = vec4(srgb(clamp(c, 0.0, 1.0)) * bar, 1.0);
        #endif
      }`, {
        tSrc: { value: null }, exposure: { value: 1 }, saturation: { value: 1 }, contrast: { value: 1 }, vignette: { value: 0.3 },
        ca: { value: 0.5 }, grain: { value: 0.03 }, veil: { value: 0 }, letterbox: { value: 0 }, seed: { value: 0 }, lookPower: { value: 1 }, lookSat: { value: 1 },
        lift: { value: new THREE.Vector3() }, gammaV: { value: new THREE.Vector3(1, 1, 1) }, gain: { value: new THREE.Vector3(1, 1, 1) },
        veilColor: { value: new THREE.Color() }, split: { value: new THREE.Vector3() }, res: { value: new THREE.Vector2(W, H) },
        ...(GRIT ? { weave: { value: new THREE.Vector2() }, flicker: { value: 1 }, softBase: { value: 0 }, softEdge: { value: 0 },
          grainAmt: { value: 0 }, grainSize: { value: 1 }, grainChroma: { value: 0 } } : {}),
      });
  }

  // Render one shutter sub-sample of the scene and add it into the accumulation.
  sample(scene, camera, weight, first) {
    const r = this.renderer, P = this.P;
    r.shadowMap.needsUpdate = true;   // once per sub-sample; a mirror's own render must not redo it
    r.setRenderTarget(this.hdr); r.setClearColor(0x000000, 1); r.clear(); r.render(scene, camera);
    this.prefilter.mat.uniforms.tSrc.value = this.hdr.texture;
    this.prefilter.mat.uniforms.texel.value.set(1 / W, 1 / H);
    this.prefilter.mat.uniforms.threshold.value = P.bloomThreshold;
    this.prefilter.mat.uniforms.knee.value = P.bloomKnee;
    this.prefilter.run(r, this.mips[0]);
    for (let i = 1; i < this.mips.length; i++) {
      this.down.mat.uniforms.tSrc.value = this.mips[i - 1].texture;
      this.down.mat.uniforms.texel.value.set(1 / this.mips[i - 1].width, 1 / this.mips[i - 1].height);
      this.down.run(r, this.mips[i]);
    }
    let src = this.mips[this.mips.length - 1];
    for (let i = this.mips.length - 2; i >= 0; i--) {
      this.up.mat.uniforms.tSrc.value = src.texture;
      this.up.mat.uniforms.tBase.value = this.mips[i].texture;
      this.up.mat.uniforms.texel.value.set(1 / src.width, 1 / src.height);
      this.up.run(r, this.ups[i]);
      src = this.ups[i];
    }
    if (P.rays > 0 && P.sunOn > 0) {
      this.raysPass.mat.uniforms.tSrc.value = this.mips[1].texture;
      this.raysPass.mat.uniforms.sun.value.copy(P.sunUv);
      this.raysPass.mat.uniforms.decay.value = P.raysDecay;
      this.raysPass.run(r, this.rays);
    }
    const u = this.acc.mat.uniforms;
    u.tHdr.value = this.hdr.texture; u.tBloom.value = this.ups[0].texture; u.tRays.value = this.rays.texture;
    u.bloom.value = P.bloom; u.rays.value = P.rays > 0 && P.sunOn > 0 ? P.rays * P.sunOn : 0; u.weight.value = weight;
    if (GRIT) { u.tHalA.value = this.mips[1].texture; u.tHalB.value = this.mips[2].texture; u.halation.value = P.halation; }
    r.setRenderTarget(this.accum);
    if (first) { r.setClearColor(0x000000, 1); r.clear(); }
    this.acc.run(r, this.accum);
  }

  finish(frameSeed) {
    const r = this.renderer, P = this.P, u = this.grade.mat.uniforms;
    u.tSrc.value = this.accum.texture;
    u.exposure.value = P.exposure; u.saturation.value = P.saturation; u.contrast.value = P.contrast;
    u.vignette.value = P.vignette; u.ca.value = P.ca; u.grain.value = P.grain; u.veil.value = P.veil;
    u.letterbox.value = P.letterbox; u.seed.value = frameSeed % 97; u.lookPower.value = P.lookPower; u.lookSat.value = P.lookSat;
    u.lift.value.copy(P.lift); u.gammaV.value.copy(P.gamma); u.gain.value.copy(P.gain);
    u.veilColor.value.copy(P.veilColor); u.split.value.copy(P.split);
    if (GRIT) {
      u.weave.value.copy(P.weave); u.flicker.value = P.flicker; u.softBase.value = P.softBase; u.softEdge.value = P.softEdge;
      u.grainAmt.value = P.grainAmt; u.grainSize.value = P.grainSize; u.grainChroma.value = P.grainChroma;
    }
    this.grade.run(r, null);
  }
}
