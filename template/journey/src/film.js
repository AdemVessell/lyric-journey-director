/* The film: every place, in order, with its time span. */
import * as THREE from 'three';
import { zones as makeZones } from './zones/index.js';
import { GRIT } from './engine.js';
import { makeDust, gritPost } from './grit.js';

export function buildFilm(ctx) {
  const { scene, lines } = ctx;
  const line = (id) => { const l = lines.find((x) => x.id === id); if (!l) throw Error('no line ' + id); return l; };
  const zones = makeZones({ ...ctx, line });
  for (const z of zones) scene.add(z.group);
  const dust = GRIT ? makeDust() : null;   // ?grit: dust in the air around the camera, every place
  if (dust) scene.add(dust.mesh);
  const lockups = zones.flatMap((z) => z.lockups || []);
  const zoneAt = (t) => zones.find((z) => t >= z.t0 && t < z.t1) || (t < zones[0].t0 ? zones[0] : zones[zones.length - 1]);
  const words = lockups.flatMap((l) => l.words).sort((a, b) => a.start - b.start);
  return {
    zones, lockups, words, zoneAt,
    pose: (t) => zoneAt(t).track.eval(t),
    blurDepth: (t) => zoneAt(t).blurDepth || 25,
    update(t, c) {
      const z = zoneAt(t);
      for (const o of zones) o.group.visible = o === z;
      z.env(t, c);
      z.update?.(t, c);
      for (const l of z.lockups || []) l.update(t);
    },
    post(t, P, camera) {
      const z = zoneAt(t);
      // the house look, 2026-10-29: AgX with a punchier look, for deeper mid-tones and
      // richer colour. Saturation stays gentle: this film's casts are mostly violet, and a
      // strong push only makes everything purple. (A global shadow split was tried and
      // dropped: it turned the tea lake purple and lifted black to navy.)
      Object.assign(P, { exposure: 1, bloom: 0.55, bloomThreshold: 1.1, bloomKnee: 0.7, rays: 0, raysDecay: 0.955, saturation: 1, contrast: 1.05,
        lookPower: 1.28, lookSat: 1.22, vignette: 0.4, ca: 0.5, grain: 0.035, veil: 0, letterbox: 0 });
      P.lift.set(0, 0, 0); P.gamma.set(1, 1, 1); P.gain.set(1, 1, 1); P.split.set(0, 0, 0); P.veilColor.setRGB(1, 1, 1);
      z.post?.(t, P, camera);
      if (GRIT) gritPost(t, P, z, dust);
      // god rays aim at the sun's position on screen
      const sd = ctx.sky.u.uSunDir.value.clone();
      const p = camera.position.clone().addScaledVector(sd, 1000).project(camera);
      P.sunUv.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
      P.sunOn = p.z < 1 && Math.abs(p.x) < 1.6 && Math.abs(p.y) < 1.6 ? 1 - Math.max(0, Math.max(Math.abs(p.x), Math.abs(p.y)) - 1) / 0.6 : 0;
    },
    liveWord(t) { let w = null; for (const x of words) if (t >= x.start && t <= x.end + 0.1) w = x; return w; },
  };
}
