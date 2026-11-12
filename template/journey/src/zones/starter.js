/* THE STARTER — a placeholder place, so a new project checks and renders on day one.
   A dusk plain with standing stones, low mist and a far ridge. The camera dollies
   straight ahead at walking pace, level, and every sung line is set face-on ahead
   of it, alternating upper and lower halves of the frame, with the arrivals cycled.

   It is scaffolding, not the film. It proves the timing, the check and the render
   end to end; the treatment's hand-built places replace it (SKILL.md, step 5).

   Why it passes the check on most timings:
   - the camera never turns, so a line stays where it was set;
   - a line sits wholly above or wholly below eye level, so as the camera nears it
     grows away from the middle and never into the other line;
   - the eye is high (30 m) and the stones stand wide of the way, so even a far
     line in the lower half clears the ground and nothing stands in front of it;
   - its distance grows with how long it is sung, so it stays in frame and readable
     from its first onset to its last;
   - each line leaves before the next line in its own half arrives. */
import * as THREE from 'three';
import { Track } from '../camera.js';
import { Lockup } from '../type3d.js';
import { drive, level } from '../drive.js';
import { std, terrain, place, env, C, dir, step, fbm, mulberry32, scatter, spire, makeMist, fakeLine } from './kit.js';

// [effect, params, stagger]: every arrival the engine has, in turn
const ARRIVALS = [['rise'], ['unfold'], ['condense'], ['assemble'], ['write', [0, 0, 0, 0], 0.3], ['drop'], ['flip'], ['streak', [24, 0, 0, 0]], ['pop'], ['orbit']];

// Markup with rows of at most `max` characters, so a long line stacks instead of shrinking.
// Plain words only: sizes, italics and accents are hand work (SKILL.md, the markup).
export function rowsMarkup(words, max = 16) {
  const rows = [[]];
  for (const w of words) {
    const r = rows[rows.length - 1], len = r.join(' ').length;
    if (r.length && len + 1 + w.length > max) rows.push([w]); else r.push(w);
  }
  return rows.map((r) => r.join(' ')).join(' / ');
}

export function starter(ctx, o = {}) {
  const group = new THREE.Group();
  const T0 = o.t0 ?? 0, T1 = o.t1 ?? drive.duration;
  const V = o.speed ?? 3, EYE = 30, len = V * (T1 - T0) + 200;
  const rnd = mulberry32(o.seed || 7001);

  // the plain: flat along the line of travel, rising into low hills to either side
  const ground = (x, z) => 18 * fbm(x * 0.003 + 5, z * 0.003, 5) * step(Math.abs(x), 30, 140) + 1.1 * fbm(x * 0.02, z * 0.02, 3) - 0.6;
  // long and wide enough that its edges lie deep in the fog, which matches the sky below the horizon
  group.add(terrain(ground, { x0: -1500, x1: 1500, z0: -len - 1800, z1: 150, nx: 400, nz: Math.min(1000, Math.ceil((len + 1950) / 4)) },
    std({ color: C(0.3, 0.25, 0.2), roughness: 0.95 }, 'meadow')));

  // standing stones by the way, and a far ridge of spires for the skyline
  const stoneM = std({ color: C(0.36, 0.33, 0.31), roughness: 0.9 }, 'stone');
  for (let v = 0; v < 3; v++) {
    const geo = spire(1, 0.16, 3 + v * 5, stoneM).geometry;
    group.add(scatter(geo, stoneM, Math.ceil(len / 9), (i, p, q, s) => {
      const z = 40 - rnd() * (len + 300), x = (rnd() < 0.5 ? -1 : 1) * (60 + Math.pow(rnd(), 1.4) * 220), k = 4 + rnd() * 22;
      p.set(x, ground(x, z) - 0.5, z); q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.12, rnd() * 6.3, (rnd() - 0.5) * 0.12)); s.set(k * (0.5 + rnd() * 0.5), k, k * (0.5 + rnd() * 0.5));
    }));
    group.add(scatter(geo, stoneM, 40, (i, p, q, s) => {
      const z = -rnd() * (len + 900), x = (rnd() < 0.5 ? -1 : 1) * (260 + rnd() * 520), k = 60 + rnd() * 140;
      p.set(x, ground(x, z) - 4, z); q.setFromEuler(new THREE.Euler(0, rnd() * 6.3, 0)); s.set(k * 0.7, k, k * 0.7);
    }));
  }
  group.add(scatter(new THREE.IcosahedronGeometry(1, 1), std({ color: C(0.38, 0.35, 0.31), roughness: 0.92 }, 'stone-pebble'), 2400, (i, p, q, s) => {
    const z = 40 - rnd() * (len + 300), x = (rnd() - 0.5) * 300;
    p.set(x, ground(x, z), z); q.setFromEuler(new THREE.Euler(rnd(), rnd(), rnd())); s.set(0.3 + rnd() * 1.2, 0.2 + rnd() * 0.6, 0.3 + rnd() * 1.2);
  }));
  const mist = makeMist({ count: Math.ceil(len / 80), z0: -30, z1: -len, width: 620, height: 50, y: 12, opacity: 0.18, spreadX: 140, bottom: -1, soft: 12, tint: C(1, 0.9, 0.86), seed: 31 });
  group.add(mist.group);

  // the camera: straight ahead, level, at constant speed
  const track = new Track([
    { t: T0, p: [0, EYE, 0], l: [0, EYE, -100], fov: 42 },
    { t: T1, p: [0, EYE, -V * (T1 - T0)], l: [0, EYE, -V * (T1 - T0) - 100], fov: 42 },
  ]);

  // the lines, in the order they are sung
  const lines = (o.lines || ctx.lines).filter((L) => L.words.length).slice().sort((a, b) => a.words[0].start - b.words[0].start);
  const lastStart = (lk) => lk.words[lk.words.length - 1].start;
  const lockups = lines.map((L, i) => {
    const [name, params, stagger] = ARRIVALS[i % ARRIVALS.length];
    const lk = new Lockup(L, rowsMarkup(L.words.map((w) => w.text))).fx(name, params, stagger);
    const a = L.words[0].start, b = L.words[L.words.length - 1].start, half = (b - a) / 2;
    // far enough that it is still inside the frame at its last onset
    const dist = Math.min(150, Math.max(45, 3 * V * half));
    // no wider than half the frame, and no taller than its own half
    const fill = Math.min(0.52, 0.124 * lk.width / lk.height);
    place(lk, track, (a + b) / 2, { dist, dy: i % 2 ? -0.27 : 0.27, fill });
    group.add(lk.group);
    return lk;
  });
  // each entrance uses the gap behind it; each line leaves before the next one in its half
  for (let i = 1; i < lockups.length; i++) lockups[i].after(lastStart(lockups[i - 1]));
  lockups.forEach((lk, i) => {
    const last = lastStart(lk), nx = lockups[i + 2];
    let a = last + 1.6;
    if (nx) a = Math.min(a, nx.words[0].from - 0.35);
    a = Math.max(a, last + 0.12);
    lk.exit(a, a + 0.3);
  });

  // the title, centred, if the voice comes in late enough to leave room for it
  const first = lines.length ? lines[0].words[0].start : T1;
  const lastSung = lines.length ? Math.max(...lines.map((L) => L.words[L.words.length - 1].end)) : T0;
  // fade up from black, and down at the end, both clear of the sung words
  const fadeIn = Math.max(T0 + 0.05, Math.min(T0 + 0.6, first - 0.3));
  const fadeOut = Math.min(T1 - 0.25, Math.max(T1 - 2.5, lastSung + 0.3));
  const title = (o.title || '').trim();
  if (title && !title.includes('{{') && first - T0 > 4.5) {
    const tl = new Lockup(fakeLine(title.split(/\s+/).map((w, k) => [w, T0 + 1.2 + 0.3 * k, T0 + 1.5 + 0.3 * k])), title.split(/\s+/).join(' ')).fx('condense');
    const end = first - 1.4;
    place(tl, track, (T0 + 1.2 + end) / 2, { dist: 70, fill: Math.min(0.42, 0.18 * tl.width / tl.height) });
    tl.exit(end - 0.6, end);
    group.add(tl.group);
    lockups.push(tl);
  }

  // blue hour: a dark plain under a warm horizon, so white words read against both halves
  const E = {
    gain: 1.3,
    zenith: C(0.06, 0.08, 0.2), horizon: C(0.85, 0.42, 0.3), ground: C(0.2, 0.15, 0.18), horizonPow: 0.55,
    sunDir: dir(-38, 3), sunColor: C(3.0, 1.5, 0.75), sunSky: C(2.6, 1.2, 0.55), sunSize: 0.0016, sunGlow: 1.3, sunCore: 20, bands: 0.4,
    fog: C(0.2, 0.15, 0.18), fogSun: C(1.2, 0.6, 0.3), fogSunPow: 6, density: 0.0011, falloff: 0.004,
    sunI: 2.6, hemiI: 0.55, hemiSky: C(0.3, 0.32, 0.55), hemiGround: C(0.22, 0.16, 0.14), shadowFocus: 110,
  };
  return {
    name: 'the starter plain', t0: T0, t1: T1, group, track, lockups, blurDepth: 30,
    env(t, c) { env(c, E); },
    update(t) { mist.u.uOpacity.value = 0.14 + 0.1 * level(t); },
    post(t, P) {
      P.exposure = 1.0; P.bloom = 0.5 + 0.3 * level(t); P.rays = 0.25; P.vignette = 0.45; P.contrast = 1.06;
      P.veilColor.setRGB(0, 0, 0);
      P.veil = Math.max(1 - step(t, T0, fadeIn), step(t, fadeOut, T1));
    },
  };
}
