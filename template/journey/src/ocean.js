/* Open water seen from above: a camera-following grid with a few long swells in
 * the vertices and fine procedural normals in the fragment. Reflection samples
 * the same analytic sky as the dome (its uniforms are shared), so the water
 * mirrors exactly the sky that is there, moon and sun glitter included. */
import * as THREE from 'three';
import { FOG, FOG_GLSL } from './engine.js';
export function makeOcean(sky, o = {}) {
  const u = {
    ...FOG, ...sky.u,
    uDeep: { value: o.deep || new THREE.Color(0.004, 0.006, 0.012) },
    uScatter: { value: o.scatter || new THREE.Color(0.01, 0.02, 0.03) },
    uAmp: { value: o.amp ?? 0.5 }, uChop: { value: o.chop ?? 1 }, uGlint: { value: o.glint ?? 1 },
    uRough: { value: o.rough ?? 0.5 }, uMirror: { value: o.mirror ?? 1 }, uSnap: { value: new THREE.Vector3() },
  };
  const size = o.size || 9000, seg = o.seg || 320;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: /* glsl */`
      uniform float uTime, uAmp; uniform vec3 uSnap;
      varying vec3 vWorld;
      float swell(vec2 p){
        return sin(dot(p, vec2(0.021, 0.013)) + uTime * 0.55) * 0.55 + sin(dot(p, vec2(-0.013, 0.031)) + uTime * 0.71) * 0.35
             + sin(dot(p, vec2(0.047, -0.029)) + uTime * 1.13) * 0.18;
      }
      void main(){
        vec3 p = position + vec3(uSnap.x, 0.0, uSnap.z);
        p.y += swell(p.xz) * uAmp;
        vWorld = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uZenith, uHorizon, uSunColor, uMoonDir, uDeep, uScatter;
      uniform float uTime, uAmp, uChop, uGlint, uRough, uSunGlow, uMoon, uHorizonPow, uMirror;
      varying vec3 vWorld;
      ${FOG_GLSL}
      vec2 hash2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453) * 2.0 - 1.0; }
      float gnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(dot(hash2(i), f), dot(hash2(i+vec2(1,0)), f-vec2(1,0)), u.x), mix(dot(hash2(i+vec2(0,1)), f-vec2(0,1)), dot(hash2(i+vec2(1,1)), f-vec2(1,1)), u.x), u.y); }
      float h(vec2 p){
        float s = 0.0, a = 1.0; vec2 q = p * 0.06;
        for (int i = 0; i < 6; i++) { s += a * gnoise(q + vec2(uTime * 0.05 * float(i+1), uTime * 0.03)); q = mat2(1.6, 1.2, -1.2, 1.6) * q; a *= 0.5; }
        return s;
      }
      vec3 skyCol(vec3 d){
        float y = max(d.y, 0.0);
        vec3 c = mix(uHorizon, uZenith, pow(y, uHorizonPow));
        float sd = max(dot(d, uSunDir), 0.0);
        c += uSunColor * (pow(sd, 220.0) * uSunGlow * 2.0 + pow(sd, 12.0) * uSunGlow * 0.35);
        float md = max(dot(d, uMoonDir), 0.0);
        c += vec3(0.85, 0.88, 1.0) * (pow(md, 300.0) * 1.5 + pow(md, 20.0) * 0.12) * uMoon;
        return c;
      }
      void main(){
        vec2 p = vWorld.xz;
        float e = 0.25;
        float hx = h(p + vec2(e, 0.0)) - h(p - vec2(e, 0.0)), hz = h(p + vec2(0.0, e)) - h(p - vec2(0.0, e));
        float dist = length(vWorld - uCamPos);
        float fade = 1.0 / (1.0 + dist * 0.004);          // fine ripples average out with distance
        vec3 n = normalize(vec3(-hx * uChop * fade, 2.0 * e, -hz * uChop * fade));
        vec3 v = normalize(vWorld - uCamPos);
        vec3 r = reflect(v, n); r.y = abs(r.y);
        float f = 0.02 + 0.98 * pow(1.0 - max(dot(-v, n), 0.0), 5.0);
        vec3 col = mix(uDeep + uScatter * max(0.0, n.y - 0.6), skyCol(r) * uMirror, f);
        // glitter: sun and moon, sharp where the surface tilts toward them
        float g = pow(max(dot(r, uSunDir), 0.0), mix(900.0, 120.0, uRough)) * uGlint * 40.0;
        float gm = pow(max(dot(r, uMoonDir), 0.0), mix(1400.0, 160.0, uRough)) * uGlint * 30.0 * uMoon;
        col += uSunColor * g * uSunGlow + vec3(0.8, 0.85, 1.0) * gm;
        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.receiveShadow = false;
  // keep the grid under the camera, snapped so the swell never slides
  mesh.onBeforeRender = () => { const c = FOG.uCamPos.value, s = size / seg; u.uSnap.value.set(Math.round(c.x / s) * s, 0, Math.round(c.z / s) * s); };
  return { mesh, u };
}
