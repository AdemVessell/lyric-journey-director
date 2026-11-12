/* Translucent flowers. Each instance is one petal; a flower is N petals round an
 * axis. The bloom is a function of time per flower (bud -> open), so a field of
 * them can open in a wave from any point. Petals are lit from behind like thin
 * tissue: wrap lighting plus a back-light term, a luminous edge, faint veins. */
import * as THREE from 'three';
import { FOG, FOG_GLSL } from './engine.js';
import { mulberry32 } from './zones/kit.js';
export function makeFlowers(spots, o = {}) {
  // spots: [{ p: Vector3, n?: Vector3 (axis), s: scale, t: bloom start, petals }]
  const petalsPer = o.petals || 7;
  const rnd = mulberry32(o.seed || 21);
  const pg = new THREE.PlaneGeometry(1, 1, 6, 10);
  pg.translate(0, 0.5, 0);                                 // petal grows from its base
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = pg.index; geo.setAttribute('position', pg.attributes.position); geo.setAttribute('uv', pg.attributes.uv);
  const count = spots.length * petalsPer;
  const aPos = new Float32Array(count * 3), aAxis = new Float32Array(count * 3), aP = new Float32Array(count * 4), aCol = new Float32Array(count * 3);
  const palette = o.palette || [[0.95, 0.93, 1.0], [0.82, 0.74, 1.0], [1.0, 0.86, 0.92]];
  let k = 0;
  for (const sp of spots) {
    const n = sp.n || new THREE.Vector3(0, 1, 0), col = palette[Math.floor(rnd() * palette.length)];
    const jitter = rnd() * 6.28;
    for (let j = 0; j < petalsPer; j++) {
      aPos.set([sp.p.x, sp.p.y, sp.p.z], k * 3); aAxis.set([n.x, n.y, n.z], k * 3);
      aP.set([j / petalsPer * 6.2832 + jitter, sp.s * (0.85 + rnd() * 0.3), sp.t + rnd() * 0.15, rnd()], k * 4);
      aCol.set(col, k * 3); k++;
    }
  }
  geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(aPos, 3));
  geo.setAttribute('aAxis', new THREE.InstancedBufferAttribute(aAxis, 3));
  geo.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4));
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3));
  geo.instanceCount = count;
  const u = { ...FOG, uOpen: { value: o.open ?? 1.2 }, uGlow: { value: o.glow ?? 0.6 }, uSway: { value: o.sway ?? 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      uniform float uTime, uOpen, uSway; uniform vec3 uSunDir;
      attribute vec3 aPos, aAxis, aCol; attribute vec4 aP;
      varying vec2 vUv; varying vec3 vWorld; varying vec3 vCol; varying float vBack; varying float vOpen;
      vec3 rotA(vec3 v, vec3 ax, float a){ return v * cos(a) + cross(ax, v) * sin(a) + ax * dot(ax, v) * (1.0 - cos(a)); }
      void main(){
        vUv = uv; vCol = aCol;
        float o = clamp((uTime - aP.z) / uOpen, 0.0, 1.0); o = 1.0 - pow(1.0 - o, 3.0); vOpen = o;
        vec3 ax = normalize(aAxis);
        vec3 t0 = normalize(cross(ax, abs(ax.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 side = rotA(t0, ax, aP.x);                     // this petal's direction round the axis
        vec3 binorm = cross(ax, side);
        float tilt = mix(0.08, 1.15, o) + sin(uTime * 1.3 + aP.w * 9.0) * 0.05 * uSway;   // bud -> open
        vec3 dirOut = normalize(ax * cos(tilt) + side * sin(tilt));
        float len = aP.y * mix(0.35, 1.0, o);
        float cup = position.y * position.y * 0.35;          // petals curve upward at the tip
        vec3 p = aPos + dirOut * position.y * len + binorm * position.x * len * 0.62 * sin(3.14159 * clamp(position.y, 0.0, 1.0) + 0.25) + ax * cup * len;
        vWorld = p;
        vec3 nrm = normalize(cross(dirOut, binorm));
        vBack = max(0.0, dot(-nrm, uSunDir)) + max(0.0, dot(nrm, uSunDir)) * 0.5;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uGlow; varying vec2 vUv; varying vec3 vWorld; varying vec3 vCol; varying float vBack; varying float vOpen;
      ${FOG_GLSL}
      void main(){
        float x = vUv.x * 2.0 - 1.0, y = vUv.y;
        float w = sin(3.14159 * y) * 0.95 + 0.05;
        float a = smoothstep(w, w - 0.12, abs(x)) * smoothstep(1.0, 0.92, y + abs(x) * 0.15);
        if (a < 0.02 || vOpen <= 0.0) discard;
        float vein = 0.92 + 0.08 * sin(x * 40.0) * (1.0 - y);
        float edge = smoothstep(w - 0.25, w, abs(x)) + smoothstep(0.8, 1.0, y) * 0.6;
        vec3 col = vCol * (0.35 + 0.75 * vBack) * vein + vCol * edge * 0.6 + vCol * uGlow * (0.4 + y);
        gl_FragColor = vec4(applyFog(col, vWorld), a * 0.82 * smoothstep(0.0, 0.15, vOpen));
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 3;
  return { mesh, u };
}
