/* The cloud sea: a slab of cloud between two heights, raymarched per pixel.
 *
 * Density is a coverage field carved by tiling Perlin–Worley and Worley noise,
 * baked once into two 3D textures on the GPU, after Schneider, "The Real-time
 * Volumetric Cloudscapes of Horizon Zero Dawn" (SIGGRAPH 2015). Light is single
 * scattering toward the sun with Beer–Lambert extinction along a short light
 * march, a two-lobe Henyey–Greenstein phase, an octave approximation of
 * multiple scattering (Wrenninge, Kulla & Lundqvist, "Oz: The Great and
 * Volumetric", SIGGRAPH 2013 talks), and ambient sky light by height in the
 * slab. Each step is integrated in Hillaire's energy-conserving form
 * ("Physically Based Sky, Atmosphere and Cloud Rendering in Frostbite",
 * SIGGRAPH 2016).
 *
 * The slab is drawn as the back faces of a box around it, depth-tested, so solid
 * ground in front hides it, and composited premultiplied. Every shutter
 * sub-sample jitters the march differently, so the motion blur also denoises it.
 * Shading, not simulation: the clouds drift but do not evolve.
 */
import * as THREE from 'three';
import { FOG, FOG_GLSL } from './engine.js';

const NOISE_FRAG = /* glsl */`
  uniform float uSlice, uN; uniform int uKind;
  out vec4 outColor;
  // Dave Hoskins, "Hash without Sine" (MIT)
  vec3 hash33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
  // Worley (cellular) noise, tiling with the period, inverted so cell centres are bright
  float worley(vec3 p, float per) {
    vec3 id = floor(p), f = fract(p); float d = 1.0;
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec3 o = vec3(x, y, z), r = o + hash33(mod(id + o, per)) - f;
      d = min(d, dot(r, r));
    }
    return 1.0 - sqrt(d);
  }
  float wfbm(vec3 p, float per) { return worley(p, per) * 0.625 + worley(p * 2.0, per * 2.0) * 0.25 + worley(p * 4.0, per * 4.0) * 0.125; }
  // gradient noise, tiling with the period
  float grad(vec3 i, vec3 f, vec3 o, float per) { return dot(hash33(mod(i + o, per)) * 2.0 - 1.0, f - o); }
  float gnoise(vec3 p, float per) {
    vec3 i = floor(p), f = fract(p), u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(mix(mix(grad(i, f, vec3(0, 0, 0), per), grad(i, f, vec3(1, 0, 0), per), u.x),
                   mix(grad(i, f, vec3(0, 1, 0), per), grad(i, f, vec3(1, 1, 0), per), u.x), u.y),
               mix(mix(grad(i, f, vec3(0, 0, 1), per), grad(i, f, vec3(1, 0, 1), per), u.x),
                   mix(grad(i, f, vec3(0, 1, 1), per), grad(i, f, vec3(1, 1, 1), per), u.x), u.y), u.z);
  }
  float gfbm(vec3 p, float per) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * gnoise(p, per); p *= 2.0; per *= 2.0; a *= 0.5; } return s; }
  float remap(float v, float a, float b, float c, float d) { return c + (v - a) / (b - a) * (d - c); }
  void main() {
    vec3 q = vec3(gl_FragCoord.xy, uSlice + 0.5) / uN;
    if (uKind == 0) {
      // shape: R Perlin–Worley, G B A Worley fbm at rising frequencies
      float pn = clamp(gfbm(q * 4.0, 4.0) * 1.1 + 0.5, 0.0, 1.0);
      float w4 = wfbm(q * 4.0, 4.0);
      outColor = vec4(clamp(remap(pn, w4 - 1.0, 1.0, 0.0, 1.0), 0.0, 1.0), w4, wfbm(q * 8.0, 8.0), wfbm(q * 16.0, 16.0));
    } else {
      // detail: Worley fbm, for eroding edges
      outColor = vec4(wfbm(q * 2.0, 2.0), wfbm(q * 4.0, 4.0), wfbm(q * 8.0, 8.0), 1.0);
    }
  }`;

// Bake one tiling noise volume, n^3 RGBA8, slice by slice.
function bake(renderer, n, kind) {
  const rt = new THREE.WebGL3DRenderTarget(n, n, n, { depthBuffer: false });
  const tex = rt.texture;
  tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType; tex.generateMipmaps = false;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false,
    uniforms: { uSlice: { value: 0 }, uN: { value: n }, uKind: { value: kind } },
    vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: NOISE_FRAG,
  });
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const quad = new THREE.Mesh(tri, mat); quad.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  for (let z = 0; z < n; z++) { mat.uniforms.uSlice.value = z; renderer.setRenderTarget(rt, z); renderer.render(scene, cam); }
  renderer.setRenderTarget(prev);
  mat.dispose(); tri.dispose();
  return tex;
}

const CLOUD_FRAG = /* glsl */`
  uniform highp sampler3D uShape, uDetail;
  uniform float uBottom, uTop, uCoverage, uDensity, uShapeScale, uDetailScale, uWeatherScale, uErode, uVis, uMaxDist, uTime;
  uniform vec2 uFadeZ;
  uniform vec3 uWind, uSunCol, uAmbTop, uAmbBot;
  varying vec3 vWorld;
  ${FOG_GLSL}
  float remap(float v, float a, float b, float c, float d) { return c + (v - a) / (b - a) * (d - c); }
  // large-scale coverage: uCoverage +- 0.25 across the weather field (near 1 the slab
  // fills solid; cells and gaps need it well under); withheld before uFadeZ so the deck
  // builds ahead of us
  float coverageAt(vec3 q) {
    float w = texture(uShape, vec3(q.xz * uWeatherScale, 0.21)).r * 0.6 + texture(uShape, vec3(q.xz * uWeatherScale * 2.7, 0.63)).g * 0.4;
    float zf = clamp((uFadeZ.x - q.z) / (uFadeZ.x - uFadeZ.y), 0.0, 1.0);
    return clamp(uCoverage + (clamp(remap(w, 0.35, 0.8, 0.0, 1.0), 0.0, 1.0) - 0.5) * 0.5, 0.0, 1.0) * zf;
  }
  // base density from the shape volume, before detail erosion
  float baseAt(vec3 q, float h, float c) {
    vec4 s = texture(uShape, q * uShapeScale);
    float fb = s.g * 0.625 + s.b * 0.25 + s.a * 0.125;
    float b = remap(s.r, fb - 1.0, 1.0, 0.0, 1.0);
    b *= smoothstep(0.0, 0.12, h) * (1.0 - smoothstep(0.3, 1.0, h));    // flat-ish base, rounded tops
    return remap(b, 1.0 - c, 1.0, 0.0, 1.0) * c;
  }
  float hg(float mu, float g) { float g2 = g * g; return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * mu, 1.5); }   // 4pi-normalised
  void main() {
    vec3 ro = uCamPos, rd = normalize(vWorld - uCamPos);
    float t0 = 0.0, t1 = min(length(vWorld - uCamPos), uMaxDist);
    if (abs(rd.y) > 1e-5) {
      float ta = (uBottom - ro.y) / rd.y, tb = (uTop - ro.y) / rd.y;
      t0 = max(0.0, min(ta, tb)); t1 = min(t1, max(ta, tb));
    } else if (ro.y < uBottom || ro.y > uTop) discard;
    if (t1 <= t0) discard;
    float mu = dot(rd, uSunDir);
    float ph0 = mix(hg(mu, 0.6), hg(mu, -0.25), 0.3), ph1 = mix(hg(mu, 0.3), hg(mu, -0.12), 0.3), ph2 = mix(hg(mu, 0.15), hg(mu, -0.06), 0.3);
    // interleaved gradient noise (Jimenez 2014), moved every shutter sub-sample
    vec2 px = gl_FragCoord.xy + 5.588238 * floor(fract(uTime * 7.31) * 64.0);
    float jit = fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715))));
    float T = 1.0, wsum = 0.0, dsum = 0.0; vec3 L = vec3(0.0);
    float t = t0 + clamp(t0 * 0.01, 3.0, 80.0) * jit;
    for (int i = 0; i < 160; i++) {
      if (t >= t1 || T < 0.02) break;
      float dt = clamp(t * 0.01, 3.0, 80.0);
      vec3 p = ro + rd * t, q = p + uWind;
      float h = (p.y - uBottom) / (uTop - uBottom);
      float c = coverageAt(q);
      float b = c > 0.0 ? baseAt(q, h, c) : 0.0;
      if (b <= 0.0) { t += dt * 2.0; continue; }
      vec3 dn = texture(uDetail, q * uDetailScale).rgb;
      float hf = dn.r * 0.625 + dn.g * 0.25 + dn.b * 0.125;
      float d = remap(b, mix(hf, 1.0 - hf, clamp(h * 10.0, 0.0, 1.0)) * uErode, 1.0, 0.0, 1.0) * uDensity;   // wisps below, billows above
      if (d > 0.0) {
        // optical depth toward the sun, coverage held from this step
        float od = 0.0, ds = 5.0; vec3 lq = q;
        for (int k = 0; k < 6; k++) {
          lq += uSunDir * ds;
          float lh = (lq.y - uWind.y - uBottom) / (uTop - uBottom);
          if (lh < 1.0) od += max(baseAt(lq, lh, c), 0.0) * uDensity * ds;
          ds *= 1.7;
        }
        vec3 Li = uSunCol * (ph0 * exp(-od) + 0.5 * ph1 * exp(-od * 0.35) + 0.25 * ph2 * exp(-od * 0.12))
          + mix(uAmbBot, uAmbTop, sqrt(clamp(h, 0.0, 1.0)));
        float Td = exp(-d * dt), w = T * (1.0 - Td);
        L += Li * w; wsum += w; dsum += w * t;
        T *= Td;
      }
      t += dt;
    }
    float a = 1.0 - T;
    if (a < 0.002) discard;
    vec3 pm = ro + rd * (dsum / max(wsum, 1e-5));
    L = mix(L, fogTint(pm) * a, fogAmount(pm));     // aerial perspective at the cloud's mean depth
    gl_FragColor = vec4(L, a) * uVis;
  }`;

/* bottom/top: slab heights (m). center: [x, z] of the box. fadeZ: [z0, z1], the deck
   builds from nothing at z0 to full at z1. sizes in metres per noise tile. */
export function makeCloudSea(renderer, o = {}) {
  const u = {
    ...FOG,
    uShape: { value: bake(renderer, 128, 0) }, uDetail: { value: bake(renderer, 32, 1) },
    uBottom: { value: o.bottom ?? 385 }, uTop: { value: o.top ?? 485 },
    uCoverage: { value: o.coverage ?? 0.45 }, uDensity: { value: o.density ?? 0.06 }, uErode: { value: o.erode ?? 0.35 },
    uShapeScale: { value: 1 / (o.shapeSize ?? 700) }, uDetailScale: { value: 1 / (o.detailSize ?? 130) }, uWeatherScale: { value: 1 / (o.weatherSize ?? 4600) },
    uFadeZ: { value: new THREE.Vector2(...(o.fadeZ || [1e5, 1e5 - 1])) }, uMaxDist: { value: o.maxDist ?? 9000 },
    uWind: { value: new THREE.Vector3() }, uVis: { value: 1 },
    uSunCol: { value: new THREE.Color() }, uAmbTop: { value: new THREE.Color() }, uAmbBot: { value: new THREE.Color() },
  };
  const H = u.uTop.value - u.uBottom.value, [cx, cz] = o.center || [0, 0];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(24000, H, 24000), new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: `varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: CLOUD_FRAG,
  }));
  mesh.position.set(cx, (u.uTop.value + u.uBottom.value) / 2, cz);
  mesh.frustumCulled = false; mesh.renderOrder = 5;
  const sunScale = o.sunScale ?? 1 / Math.PI, ambScale = o.ambScale ?? 0.6, bounce = o.bounce ?? 0.25;
  return {
    mesh, u,
    // light it from the place's environment preset, the same values the sky and fog use
    light(e) {
      const g = e.gain ?? 1;
      u.uSunCol.value.copy(e.sunColor).multiplyScalar((e.sunI ?? 2.5) * sunScale);
      u.uAmbTop.value.copy(e.zenith).multiplyScalar(g * ambScale);
      u.uAmbBot.value.copy(e.hemiGround || e.ground || e.horizon).multiplyScalar(g * bounce);
    },
  };
}
