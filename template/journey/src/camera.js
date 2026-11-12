/* Camera choreography: time-keyed Hermite splines.
 *
 * A track is a list of keys { t, p: position, l: look target, up?, roll?, fov?, hold? }.
 * Tangents are central differences in TIME (metres per second), so speed is
 * continuous through every key and a key's spacing in time sets how fast the
 * camera travels — slow where a line is being read, fast between places.
 * `hold: true` zeroes the velocity at a key: a dead stop. `cut: true` starts a
 * new spline at that key, used only where a transition medium covers the frame.
 * The track is a pure function of t, so motion-blur sub-samples, scrubbing and
 * the legibility check all see exactly the same camera.
 */
import * as THREE from 'three';

const V = (a) => (a instanceof THREE.Vector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));
function hermite(p0, v0, p1, v1, h, u) {
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  return [h00, h10 * h, h01, h11 * h];
}
export class Track {
  constructor(keys) {
    this.keys = keys.map((k) => ({
      ...k, p: V(k.p), l: V(k.l), up: V(k.up || [0, 1, 0]).normalize(),
      roll: k.roll || 0, fov: k.fov || 42,
    }));
    const K = this.keys;
    // velocities, per channel, central difference in time within each uncut run
    for (let i = 0; i < K.length; i++) {
      const k = K[i];
      const a = i > 0 && !k.cut ? K[i - 1] : k, b = i < K.length - 1 && !K[i + 1].cut ? K[i + 1] : k;
      const dt = Math.max(1e-6, b.t - a.t);
      const z = k.hold || a === b;
      k.vp = z ? new THREE.Vector3() : b.p.clone().sub(a.p).divideScalar(dt);
      k.vl = z ? new THREE.Vector3() : b.l.clone().sub(a.l).divideScalar(dt);
      k.vu = z ? new THREE.Vector3() : b.up.clone().sub(a.up).divideScalar(dt);
      k.vr = z ? 0 : (b.roll - a.roll) / dt;
      k.vf = z ? 0 : (b.fov - a.fov) / dt;
      if (k.vel) k.vp = V(k.vel);       // authored velocity where a move must leave a key a certain way
    }
    this.t0 = K[0].t; this.t1 = K[K.length - 1].t;
  }
  eval(t, out = {}) {
    const K = this.keys;
    let i = 0;
    while (i < K.length - 1 && t >= K[i + 1].t) i++;
    const a = K[i], b = K[i + 1];
    if (!b || b.cut || t < a.t) {
      // past the end of a run (the last key, or the key before a cut): keep going
      // on the run's own velocity, so a transition medium can hide the jump without
      // the camera braking first
      const dt = t - a.t;
      out.pos = a.p.clone().addScaledVector(a.vp, dt);
      out.look = a.l.clone().addScaledVector(a.vl, dt);
      out.up = a.up.clone().addScaledVector(a.vu, dt).normalize();
      out.roll = a.roll + a.vr * dt; out.fov = a.fov + a.vf * dt;
      return out;
    }
    const h = Math.max(1e-6, b.t - a.t), u = (t - a.t) / h;
    const [c0, c1, c2, c3] = hermite(0, 0, 0, 0, h, u);
    const mixV = (pa, va, pb, vb) => new THREE.Vector3()
      .addScaledVector(pa, c0).addScaledVector(va, c1).addScaledVector(pb, c2).addScaledVector(vb, c3);
    out.pos = mixV(a.p, a.vp, b.p, b.vp);
    out.look = mixV(a.l, a.vl, b.l, b.vl);
    out.up = mixV(a.up, a.vu, b.up, b.vu).normalize();
    out.roll = a.roll * c0 + a.vr * c1 + b.roll * c2 + b.vr * c3;
    out.fov = a.fov * c0 + a.vf * c1 + b.fov * c2 + b.vf * c3;
    return out;
  }
}

// Apply a pose to a camera. Roll is in degrees about the view axis.
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _z = new THREE.Vector3();
export function applyPose(camera, pose) {
  camera.position.copy(pose.pos);
  camera.up.copy(pose.up);
  camera.lookAt(pose.look);
  if (pose.roll) {
    _z.set(0, 0, 1).applyQuaternion(camera.quaternion);
    _q.setFromAxisAngle(_z, THREE.MathUtils.degToRad(pose.roll));
    camera.quaternion.premultiply(_q);
  }
  if (camera.fov !== pose.fov) { camera.fov = pose.fov; camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld(true);
}

// Deterministic, smooth handheld noise (sum of sines with incommensurate rates).
export function shake(t, amp) {
  const s = (f, p) => Math.sin(t * f + p);
  return [
    amp * (0.6 * s(1.31, 0.3) + 0.3 * s(2.97, 1.7) + 0.1 * s(7.13, 4.1)),
    amp * (0.6 * s(1.07, 2.3) + 0.3 * s(3.41, 0.4) + 0.1 * s(6.43, 2.9)),
    amp * 0.4 * (0.6 * s(0.83, 5.1) + 0.4 * s(2.11, 3.3)),
  ];
}
