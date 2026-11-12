/* The whale-shaped vessel: a lathe body (thin tail stock swelling to a blunt
   head), a flattened cross-section with a belly flattened onto the sand and
   ventral grooves, pale barnacle patches in vertex colour, a wet clearcoat
   skin, extruded flukes and a long pectoral fin. Lies along +x (head at +x). */
import * as THREE from 'three';
import { phys, fbm, smooth, clamp01, mix } from './kit.js';

export function makeWhale(o = {}) {
  const L = o.length || 170, R = o.radius || 17, nu = 200, nv = 72;
  const radius = (u) => {
    const body = Math.pow(Math.sin(Math.PI * clamp01(u)), 0.5) * (0.26 + 0.74 * smooth((u - 0.02) / 0.55));
    return R * body * mix(1, 1.08, smooth((u - 0.7) / 0.18));
  };
  const pos = [], col = [], idx = [];
  for (let i = 0; i <= nu; i++) {
    const u = i / nu, x = (u - 0.5) * L, r = radius(u);
    for (let j = 0; j <= nv; j++) {
      const a = (j / nv) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
      let y = s * r * 0.8, z = c * r;
      if (y < 0) y *= 0.55;                                   // belly flattened onto the sand
      const groove = s < -0.15 ? 1 + 0.018 * Math.sin(a * 70) * smooth((u - 0.45) / 0.2) : 1;
      const lump = 1 + 0.025 * fbm(u * 18, a * 2.2, 3);
      z *= groove * lump; y *= lump;
      if (s > 0.6 && u > 0.12 && u < 0.42) y += R * 0.06 * Math.sin((u - 0.12) / 0.3 * Math.PI) * (s - 0.6) * 2.5; // the dorsal hump
      pos.push(x, y, z);
      const barn = smooth((fbm(u * 9 + 3, a * 1.7, 4) - 0.18) * 6) * smooth((u - 0.7) / 0.12) + smooth((fbm(u * 30, a * 5, 2) - 0.45) * 8) * 0.35;
      const scar = Math.max(0, 1 - Math.abs(fbm(u * 3, a * 0.8 + 7, 2) - 0.1) * 60) * 0.5;
      const v = 0.028 + 0.2 * barn + 0.25 * scar + (s < -0.3 ? 0.05 : 0);
      col.push(v, v * 1.0, v * 1.04);
    }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + nv + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const skin = phys({ vertexColors: true, roughness: 0.38, clearcoat: 0.75, clearcoatRoughness: 0.22, metalness: 0 }, 'whale');
  const group = new THREE.Group();
  const body = new THREE.Mesh(g, skin); body.castShadow = true; body.receiveShadow = true; group.add(body);

  // flukes: a swept two-lobed blade with a notch, lying flat behind the tail
  const fs = new THREE.Shape();
  const span = R * 2.6, len = R * 0.95;
  fs.moveTo(0, 0);
  fs.bezierCurveTo(len * 0.2, span * 0.12, len * 0.55, span * 0.35, len * 1.05, span * 0.5);
  fs.bezierCurveTo(len * 0.9, span * 0.34, len * 0.82, span * 0.12, len * 0.9, 0.0);
  fs.bezierCurveTo(len * 0.82, -span * 0.12, len * 0.9, -span * 0.34, len * 1.05, -span * 0.5);
  fs.bezierCurveTo(len * 0.55, -span * 0.35, len * 0.2, -span * 0.12, 0, 0);
  const fg = new THREE.ExtrudeGeometry(fs, { depth: R * 0.07, bevelEnabled: true, bevelThickness: R * 0.05, bevelSize: R * 0.06, bevelSegments: 4, curveSegments: 32 });
  fg.rotateX(Math.PI / 2); fg.rotateY(Math.PI);
  const fl = new THREE.Mesh(fg, skin); fl.position.set(-L / 2 + R * 0.25, R * 0.1, 0); fl.rotation.z = 0.06;
  fl.castShadow = true; fl.receiveShadow = true; group.add(fl);

  // pectoral fin: a long blade resting on the sand, swept back
  const ps = new THREE.Shape(), pl = R * 2.4, pw = R * 0.42;
  ps.moveTo(0, 0); ps.bezierCurveTo(pl * 0.3, pw * 0.9, pl * 0.75, pw * 0.7, pl, pw * 0.15);
  ps.bezierCurveTo(pl * 0.8, -pw * 0.2, pl * 0.3, -pw * 0.5, 0, -pw * 0.35);
  const pg = new THREE.ExtrudeGeometry(ps, { depth: R * 0.05, bevelEnabled: true, bevelThickness: R * 0.04, bevelSize: R * 0.04, bevelSegments: 3 });
  pg.rotateX(Math.PI / 2);
  const fin = new THREE.Mesh(pg, skin); fin.position.set(L * 0.2, -R * 0.12, R * 0.82); fin.rotation.y = -2.5; fin.rotation.z = -0.08;
  fin.castShadow = true; group.add(fin);
  const fin2 = fin.clone(); fin2.position.z = -R * 0.82; fin2.rotation.y = 2.5; group.add(fin2);
  group.userData = { L, R, radius };
  return group;
}
