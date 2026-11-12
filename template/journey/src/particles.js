/* Particle fields that wrap around the camera: every particle lives in a box
 * centred on the camera and re-enters on the far side, so there is always
 * matter at every depth however far we travel. Motion is closed-form in time
 * (drift + turbulence), so the field is identical at any seek and in every
 * shutter sub-sample. */
import * as THREE from 'three';
import { FOG, FOG_GLSL } from './engine.js';
import { mulberry32 } from './zones/kit.js';
export function makeField(o = {}) {
  const n = o.count || 4000, rnd = mulberry32(o.seed || 7);
  const base = new Float32Array(n * 3), seed = new Float32Array(n * 4);
  const [bx, by, bz] = o.box || [200, 80, 200];
  for (let i = 0; i < n; i++) {
    base[i * 3] = (rnd() - 0.5) * bx; base[i * 3 + 1] = (rnd() - 0.5) * by; base[i * 3 + 2] = (rnd() - 0.5) * bz;
    seed[i * 4] = rnd(); seed[i * 4 + 1] = rnd(); seed[i * 4 + 2] = rnd(); seed[i * 4 + 3] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(base, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const u = {
    ...FOG,
    uBox: { value: new THREE.Vector3(bx, by, bz) }, uVel: { value: new THREE.Vector3(...(o.vel || [0, 0, 0])) },
    uTurb: { value: o.turb ?? 1 }, uSize: { value: o.size ?? 0.15 }, uColor: { value: o.color || new THREE.Color(1, 1, 1) },
    uOpacity: { value: o.opacity ?? 1 }, uScale: { value: 1080 / 2 / Math.tan(THREE.MathUtils.degToRad(21)) },
    uTwinkle: { value: o.twinkle ?? 0 }, uStreak: { value: o.streak ?? 0 }, uCenter: { value: new THREE.Vector3() },
    uFloor: { value: o.floor ?? -1e6 }, uSpark: { value: o.spark ?? 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: o.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform vec3 uBox, uVel, uCenter; uniform float uTime, uTurb, uSize, uScale, uTwinkle, uFloor;
      uniform vec3 uCamPos;
      attribute vec4 aSeed;
      varying float vA; varying vec3 vWorld; varying float vSeed;
      void main(){
        vec3 p = position + uVel * uTime * (0.6 + 0.8 * aSeed.w);
        p += uTurb * vec3(sin(uTime * (0.3 + aSeed.x) + aSeed.y * 6.28), sin(uTime * (0.2 + aSeed.y * 0.7) + aSeed.z * 6.28) * 0.6, cos(uTime * (0.25 + aSeed.z) + aSeed.x * 6.28));
        vec3 c = uCamPos + uCenter;
        p = c + mod(p - c + uBox * 0.5, uBox) - uBox * 0.5;
        p.y = max(p.y, uFloor);
        vec3 q = abs(p - c) / (uBox * 0.5);
        float edge = 1.0 - smoothstep(0.75, 1.0, max(q.x, max(q.y, q.z)));
        vA = edge * (1.0 - uTwinkle + uTwinkle * (0.5 + 0.5 * sin(uTime * (2.0 + aSeed.x * 6.0) + aSeed.z * 30.0)));
        vSeed = aSeed.x; vWorld = p;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(uSize * (0.5 + aSeed.y) * uScale / max(-mv.z, 0.1), 0.0, 48.0);
        if (gl_PointSize < 0.6) vA *= gl_PointSize / 0.6;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity, uSpark;
      varying float vA; varying vec3 vWorld; varying float vSeed;
      ${FOG_GLSL}
      void main(){
        vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0;
        float a = smoothstep(1.0, 0.0, r); a *= a;
        float core = smoothstep(0.35, 0.0, r) * uSpark;
        vec3 col = uColor * (1.0 + core * 4.0);
        float f = fogAmount(vWorld);
        gl_FragColor = vec4(col * a * vA * uOpacity * (1.0 - f), 1.0);
      }`,
  });
  if (o.additive === false) {
    mat.fragmentShader = mat.fragmentShader.replace('gl_FragColor = vec4(col * a * vA * uOpacity * (1.0 - f), 1.0);',
      'gl_FragColor = vec4(applyFog(col, vWorld), a * vA * uOpacity);');
  }
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 5;
  return { mesh: pts, u };
}
