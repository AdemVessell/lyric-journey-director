/* Tumbling flakes — leaves, petals, ash, bubbles — as instanced quads that wrap
 * round the camera like the particle fields, but rotate as they fly. Motion is
 * closed-form in time, so every shutter sub-sample sees the same flight. */
import * as THREE from 'three';
import { FOG, FOG_GLSL } from './engine.js';
import { mulberry32 } from './zones/kit.js';
const SHAPES = { leaf: 0, petal: 1, ash: 2, bubble: 3 };
export function makeFlakes(o = {}) {
  const n = o.count || 1200, rnd = mulberry32(o.seed || 13);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const [bx, by, bz] = o.box || [120, 60, 160];
  const base = new Float32Array(n * 3), seed = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    base.set([(rnd() - 0.5) * bx, (rnd() - 0.5) * by, (rnd() - 0.5) * bz], i * 3);
    seed.set([rnd(), rnd(), rnd(), rnd()], i * 4);
  }
  geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 3));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  geo.instanceCount = n;
  const u = {
    ...FOG, uBox: { value: new THREE.Vector3(bx, by, bz) }, uVel: { value: new THREE.Vector3(...(o.vel || [0, 0, 0])) },
    uSize: { value: o.size || 0.4 }, uSpin: { value: o.spin ?? 3 }, uTurb: { value: o.turb ?? 1 }, uOpacity: { value: o.opacity ?? 1 },
    uColor: { value: o.color || new THREE.Color(1, 1, 1) }, uColor2: { value: o.color2 || o.color || new THREE.Color(1, 1, 1) },
    uShape: { value: SHAPES[o.shape || 'leaf'] }, uCenter: { value: new THREE.Vector3() }, uGlow: { value: o.glow ?? 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      uniform vec3 uBox, uVel, uCenter, uCamPos; uniform float uTime, uSize, uSpin, uTurb;
      attribute vec3 aBase; attribute vec4 aSeed;
      varying vec2 vUv; varying vec3 vWorld; varying float vA; varying float vSeed; varying float vLit;
      mat3 rot(vec3 a){ vec3 c = cos(a), s = sin(a);
        return mat3(c.y*c.z, c.y*s.z, -s.y, s.x*s.y*c.z - c.x*s.z, s.x*s.y*s.z + c.x*c.z, s.x*c.y, c.x*s.y*c.z + s.x*s.z, c.x*s.y*s.z - s.x*c.z, c.x*c.y); }
      void main(){
        vUv = uv; vSeed = aSeed.x;
        vec3 p = aBase + uVel * uTime * (0.7 + 0.6 * aSeed.w) + uTurb * vec3(sin(uTime * (0.7 + aSeed.y) + aSeed.z * 6.3), sin(uTime * (0.5 + aSeed.z) + aSeed.x * 6.3), cos(uTime * (0.6 + aSeed.x) + aSeed.y * 6.3)) * 2.0;
        vec3 c = uCamPos + uCenter;
        p = c + mod(p - c + uBox * 0.5, uBox) - uBox * 0.5;
        vec3 q = abs(p - c) / (uBox * 0.5);
        vA = 1.0 - smoothstep(0.75, 1.0, max(q.x, max(q.y, q.z)));
        mat3 R = rot(vec3(aSeed.x, aSeed.y, aSeed.z) * 6.3 + uTime * uSpin * (aSeed.wxy - 0.5) * 2.0);
        vec3 local = position * uSize * (0.6 + 0.8 * aSeed.z);
        vec3 n = R * vec3(0.0, 0.0, 1.0);
        vLit = 0.55 + 0.45 * abs(dot(n, normalize(vec3(0.3, 1.0, 0.2))));
        vec3 wp = p + R * local;
        vWorld = wp;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor, uColor2; uniform float uOpacity, uShape, uGlow;
      varying vec2 vUv; varying vec3 vWorld; varying float vA; varying float vSeed; varying float vLit;
      ${FOG_GLSL}
      void main(){
        vec2 p = vUv * 2.0 - 1.0; float a;
        int s = int(uShape + 0.5);
        if (s == 0) { float w = 0.55 * sin(clamp((p.y + 1.0) * 0.5, 0.0, 1.0) * 3.14159); a = smoothstep(w, w - 0.08, abs(p.x)) * step(-0.98, p.y); a *= 1.0 - 0.3 * smoothstep(0.03, 0.0, abs(p.x)); }
        else if (s == 1) { float r = length(p * vec2(1.4, 1.0)); a = smoothstep(1.0, 0.85, r) * smoothstep(-1.0, -0.6, p.y); }
        else if (s == 2) { a = smoothstep(1.0, 0.4, length(p)) * (0.5 + 0.5 * fract(sin(vSeed * 91.0) * 437.0)); }
        else { float r = length(p); a = smoothstep(1.0, 0.85, r) * (0.25 + 0.75 * smoothstep(0.6, 0.95, r)); }
        a *= vA * uOpacity;
        if (a < 0.01) discard;
        vec3 col = mix(uColor, uColor2, vSeed) * vLit * (1.0 + uGlow);
        gl_FragColor = vec4(applyFog(col, vWorld), a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 7;
  return { mesh, u };
}
