/* The sky: a dome that travels with the camera, so it is always at infinity.
 * Gradient by elevation, a sun with a hot core and a wide glow, optional stars
 * and a moon. Its horizon colour is the fog colour, so distance haze and sky
 * meet without a seam. */
import * as THREE from 'three';
export function makeSky() {
  const u = {
    uZenith: { value: new THREE.Color(0.1, 0.1, 0.16) }, uHorizon: { value: new THREE.Color(0.5, 0.5, 0.56) },
    uGround: { value: new THREE.Color(0.2, 0.2, 0.22) }, uSunDir: { value: new THREE.Vector3(0, 0.2, -1).normalize() },
    uSunColor: { value: new THREE.Color(1, 0.9, 0.8) }, uSunSize: { value: 0.0006 }, uSunGlow: { value: 1 },
    uSunCore: { value: 30 }, uStars: { value: 0 }, uHorizonPow: { value: 0.45 }, uMoon: { value: 0 },
    uMoonDir: { value: new THREE.Vector3(0.3, 0.25, -1).normalize() }, uBands: { value: 0 }, uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 uZenith, uHorizon, uGround, uSunDir, uSunColor, uMoonDir;
      uniform float uSunSize, uSunGlow, uSunCore, uStars, uHorizonPow, uMoon, uBands, uTime;
      varying vec3 vDir;
      float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h >= 0.0 ? mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), uHorizonPow))
                            : mix(uHorizon, uGround, pow(clamp(-h * 3.0, 0.0, 1.0), 0.6));
        // faint high cloud bands
        col *= 1.0 + uBands * 0.08 * sin(d.x * 9.0 + d.z * 5.0 + h * 40.0) * smoothstep(0.0, 0.3, h);
        float sd = dot(d, uSunDir);
        col += uSunColor * (smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.5, sd) * uSunCore
          + pow(max(sd, 0.0), 220.0) * uSunGlow * 2.0 + pow(max(sd, 0.0), 12.0) * uSunGlow * 0.35);
        if (uStars > 0.0) {
          vec3 g = floor(d * 420.0);
          float s = hash(g); float tw = 0.6 + 0.4 * sin(uTime * (1.0 + s * 3.0) + s * 40.0);
          col += vec3(0.9, 0.92, 1.0) * step(0.9975, s) * uStars * tw * smoothstep(-0.02, 0.15, h) * 2.5;
        }
        if (uMoon > 0.0) {
          float md = dot(d, uMoonDir);
          col += vec3(0.85, 0.88, 1.0) * (smoothstep(0.99955, 0.9997, md) * 6.0 + pow(max(md, 0.0), 300.0) * 1.5 + pow(max(md, 0.0), 20.0) * 0.12) * uMoon;
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  mesh.frustumCulled = false; mesh.renderOrder = -10;
  return { mesh, u };
}
