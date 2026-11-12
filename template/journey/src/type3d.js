/* Words in the world.
 *
 * Glyphs are rasterised from the system Didot (roman + italic) and converted to
 * signed distance with an exact Euclidean distance transform (Felzenszwalb &
 * Huttenlocher 2012) seeded from the anti-aliased coverage, so letters stay sharp
 * at any size: a small echo or a word that fills the screen.
 *
 * A word is one mesh of per-letter quads. Its arrival effect runs per letter in
 * the vertex shader from a single progress value, so every effect — rise out of
 * the plane, unfold on the baseline hinge, assemble, drop, flip, streak, write,
 * condense, orbit, pop, wind — is a pure function of time and finishes exactly
 * when the word lands.
 *
 * Timing: identical rule to the 2D cuts. A word is fully arrived LAND before its
 * sung onset; the arrival may use most of the gap behind it, never more; the glow
 * is off while arriving and peaks on the syllable.
 */
import * as THREE from 'three';
import { FOG, FOG_GLSL } from './engine.js';

export const LAND = 0.04, FX_MAX = 0.6, FX_FIRST = 0.75, WORD_ROOM = 0.8, RISE_FLOOR = 0.06;
export const FX = { rise: 0, unfold: 1, assemble: 2, drop: 3, flip: 4, streak: 5, write: 6, condense: 7, orbit: 8, pop: 9, wind: 10, none: 11 };

const GLYPH_PX = 256, PAD = 20, SPREAD = 18;
const FACES = {
  roman: `400 ${GLYPH_PX}px "Didot", "Bodoni 72", "Times New Roman", serif`,
  italic: `italic 400 ${GLYPH_PX}px "Didot", "Bodoni 72", "Times New Roman", serif`,
};
const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,\'"-·:;!?&()';   // () for the sheet's backing lines

/* ---------- signed distance ---------- */
const INF = 1e20;
function edt1d(f, n, d, v, z) {
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1, k = 0; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
function edt2d(grid, w, h) {
  const n = Math.max(w, h), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
  }
}
function glyphSDF(alpha, w, h) {
  const outer = new Float64Array(w * h), inner = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = alpha[i] / 255;
    if (a >= 1) { outer[i] = 0; inner[i] = INF; }
    else if (a <= 0) { outer[i] = INF; inner[i] = 0; }
    else { const e = 0.5 - a; outer[i] = e > 0 ? e * e : 0; inner[i] = e < 0 ? e * e : 0; }
  }
  edt2d(outer, w, h); edt2d(inner, w, h);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const dist = Math.sqrt(outer[i]) - Math.sqrt(inner[i]);      // + outside, - inside
    out[i] = Math.max(0, Math.min(255, Math.round(255 * (0.5 - dist / (2 * SPREAD)))));
  }
  return out;
}

/* ---------- atlas ---------- */
export const atlas = { tex: null, glyphs: {}, ctx: null };
// extra: more characters to rasterise (the sheet's own, so curly quotes or accents are
// never silently dropped); without any, the atlas is exactly the default set's.
export function buildAtlas(extra = '') {
  const chars = [...new Set([...CHARS, ...extra])].filter((ch) => ch.trim());
  const meas = document.createElement('canvas').getContext('2d');
  const cells = [];
  for (const [face, font] of Object.entries(FACES)) {
    meas.font = font;
    for (const ch of chars) {
      const m = meas.measureText(ch);
      const l = Math.ceil(m.actualBoundingBoxLeft), r = Math.ceil(m.actualBoundingBoxRight);
      const a = Math.ceil(m.actualBoundingBoxAscent), d = Math.ceil(m.actualBoundingBoxDescent);
      cells.push({ face, ch, l, r, a, d, w: l + r + 2 * PAD, h: a + d + 2 * PAD });
    }
  }
  // shelf packing into a 4096-wide atlas
  const AW = 4096; let x = 0, y = 0, rowH = 0;
  cells.sort((p, q) => q.h - p.h);
  for (const c of cells) {
    if (x + c.w > AW) { x = 0; y += rowH; rowH = 0; }
    c.x = x; c.y = y; x += c.w; rowH = Math.max(rowH, c.h);
  }
  const AH = 1 << Math.ceil(Math.log2(y + rowH));
  const data = new Uint8Array(AW * AH);
  const cv = document.createElement('canvas'), g = cv.getContext('2d', { willReadFrequently: true });
  for (const c of cells) {
    cv.width = c.w; cv.height = c.h;
    g.clearRect(0, 0, c.w, c.h); g.font = FACES[c.face]; g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
    g.fillText(c.ch, PAD + c.l, PAD + c.a);
    const img = g.getImageData(0, 0, c.w, c.h).data, alpha = new Uint8Array(c.w * c.h);
    for (let i = 0; i < c.w * c.h; i++) alpha[i] = img[i * 4 + 3];
    const sdf = glyphSDF(alpha, c.w, c.h);
    for (let j = 0; j < c.h; j++) data.set(sdf.subarray(j * c.w, (j + 1) * c.w), (c.y + j) * AW + c.x);
    // quad in em units relative to the glyph origin (y up); uv in atlas space (v up)
    atlas.glyphs[c.face + c.ch] = {
      x0: (-c.l - PAD) / GLYPH_PX, x1: (c.r + PAD) / GLYPH_PX, y0: (-c.d - PAD) / GLYPH_PX, y1: (c.a + PAD) / GLYPH_PX,
      u0: c.x / AW, u1: (c.x + c.w) / AW, v0: 1 - (c.y + c.h) / AH, v1: 1 - c.y / AH,
    };
  }
  // flip rows so v runs up, as the quads expect
  const flipped = new Uint8Array(AW * AH);
  for (let j = 0; j < AH; j++) flipped.set(data.subarray(j * AW, (j + 1) * AW), (AH - 1 - j) * AW);
  const tex = new THREE.DataTexture(flipped, AW, AH, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = 8; tex.needsUpdate = true;
  atlas.tex = tex; atlas.ctx = meas; atlas.size = [AW, AH];
  return atlas;
}
export function measure(word, face, tracking = 0) {
  const g = atlas.ctx; g.font = FACES[face];
  const xs = [];
  for (let i = 0; i <= word.length; i++) xs.push(g.measureText(word.slice(0, i)).width / GLYPH_PX + tracking * Math.max(0, Math.min(i, word.length - 1)));
  return xs;
}

/* ---------- word material ---------- */
const VERT = /* glsl */`
  uniform float uProg, uStagger, uTime, uSeed, uWordW, uSpread, uFx;
  uniform vec4 uP;            // effect parameters
  attribute vec4 aGlyph;      // x: letter order 0..1, y: random, z,w: glyph centre (em)
  varying vec2 vUv; varying vec3 vWorld; varying float vLi; varying vec2 vLocal; varying float vFade;
  float h1(float n){ return fract(sin(n * 91.345 + uSeed * 17.13) * 43758.5453); }
  vec3 rotX(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x, c*p.y - s*p.z, s*p.y + c*p.z); }
  vec3 rotY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z); }
  vec3 rotZ(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c*p.x - s*p.y, s*p.x + c*p.y, p.z); }
  float outCubic(float x){ return 1.0 - pow(1.0 - x, 3.0); }
  float outQuart(float x){ return 1.0 - pow(1.0 - x, 4.0); }
  float outBack(float x){ float c = 1.9; return 1.0 + (c + 1.0) * pow(x - 1.0, 3.0) + c * pow(x - 1.0, 2.0); }
  float outBounce(float x){
    if (x < 1.0/2.75) return 7.5625*x*x;
    if (x < 2.0/2.75) { x -= 1.5/2.75; return 7.5625*x*x + 0.75; }
    if (x < 2.5/2.75) { x -= 2.25/2.75; return 7.5625*x*x + 0.9375; }
    x -= 2.625/2.75; return 7.5625*x*x + 0.984375;
  }
  void main(){
    vUv = uv;
    float li = clamp((uProg - aGlyph.x * uStagger) / max(1e-4, 1.0 - uStagger), 0.0, 1.0);
    vLi = li;
    vec3 c = vec3(aGlyph.z, aGlyph.w, 0.0);
    vec3 p = position;
    vLocal = p.xy;
    float r1 = aGlyph.y, r2 = h1(aGlyph.y * 7.0 + 1.0), r3 = h1(aGlyph.y * 13.0 + 2.0);
    vFade = 1.0;
    int fx = int(uFx + 0.5);
    if (fx == 0) {                      // rise out of the plane
      p.y -= (1.0 - outQuart(li)) * (1.0 + uP.x);
    } else if (fx == 1) {               // unfold on the baseline hinge
      p = rotX(p, (1.0 - outBack(li)) * -1.5708 * (uP.x == 0.0 ? 1.0 : uP.x));
    } else if (fx == 2) {               // assemble from scattered letters
      float e = outCubic(li);
      vec3 off = (vec3(r1, r2, r3) - 0.5) * vec3(uSpread, uSpread * 0.7, uSpread * 1.6);
      vec3 q = p - c;
      q = rotZ(rotX(q, (1.0 - e) * (r2 - 0.5) * 6.0), (1.0 - e) * (r3 - 0.5) * 6.0) * mix(0.3, 1.0, e);
      p = c + q + off * (1.0 - e);
      vFade = smoothstep(0.0, 0.35, li);
    } else if (fx == 3) {               // drop from above, landing with a settle
      p.y += (1.0 - outBounce(li)) * (2.5 + r1);
      vFade = smoothstep(0.0, 0.2, li);
    } else if (fx == 4) {               // card flip about each letter's upright
      vec3 q = p - c; q = rotY(q, (1.0 - outBack(li)) * 1.5708); p = c + q;
    } else if (fx == 5) {               // streak in along the line of travel
      float e = outQuart(li);
      p.z -= (1.0 - e) * uP.x * (0.8 + 0.4 * r1);
      p.x += (1.0 - e) * uP.y;
      vFade = smoothstep(0.0, 0.3, li);
    } else if (fx == 8) {               // orbit in around the word's axis
      float e = outCubic(li);
      vec3 q = p - vec3(uWordW * 0.5, 0.0, 0.0);
      q = rotY(q, (1.0 - e) * (3.1416 + r1)); q.y += (1.0 - e) * (r2 - 0.5) * 3.0;
      p = q + vec3(uWordW * 0.5, 0.0, 0.0);
      vFade = smoothstep(0.0, 0.3, li);
    } else if (fx == 9) {               // pop
      p = c + (p - c) * max(0.0, outBack(li));
    } else if (fx == 10) {              // blown in on the wind, tumbling
      float e = outCubic(li);
      vec3 q = rotZ(p - c, (1.0 - e) * (r1 - 0.5) * 9.0);
      p = c + q + vec3(-(1.0 - e) * (uP.x + r2 * uP.x), sin(li * 9.0 + r3 * 6.0) * (1.0 - e) * 1.2, (1.0 - e) * (r3 - 0.5) * 4.0);
      vFade = smoothstep(0.0, 0.25, li);
    }
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const FRAG = /* glsl */`
  uniform sampler2D uAtlas;
  uniform float uProg, uLive, uOpacity, uIntensity, uFx, uWordW, uTime, uHalo, uThin, uSeed, uFogMul;
  uniform vec3 uColor, uGlowColor, uHaloColor;
  uniform vec4 uP;
  varying vec2 vUv; varying vec3 vWorld; varying float vLi; varying vec2 vLocal; varying float vFade;
  ${FOG_GLSL}
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
  void main(){
    // biased toward sharp mips: at grazing angles the low mips of a packed SDF atlas
    // erase thin strokes, and a letter goes dark behind its own halo
    float sd = texture(uAtlas, vUv, -2.0).r;
    // true gradient length, not fwidth: fwidth over-blurs letters seen on oblique planes
    float w = max(length(vec2(dFdx(sd), dFdy(sd))) * 0.85, 1e-4);
    float edge = 0.5 - uThin;
    int fx = int(uFx + 0.5);
    float tip = 0.0;
    if (fx == 7) {                      // condense: letters gather out of fog
      float n = noise(vLocal * 9.0 + uSeed) * 0.6 + noise(vLocal * 23.0) * 0.4;
      edge = mix(0.5, 0.92, (1.0 - smoothstep(n - 0.15, n + 0.15, vLi * 1.15)));
      w = max(w, (1.0 - vLi) * 0.08);
    }
    float a = smoothstep(edge - w, edge + w, sd);
    if (fx == 0 && vLi < 1.0 && vLocal.y < -0.28) discard;   // the slot edge the word rises out of
    if (fx == 6) {                      // write: revealed left to right behind a bright pen
      float x = vLocal.x / max(uWordW, 1e-3);
      float head = uProg * 1.08;
      a *= smoothstep(head, head - 0.04, x);
      tip = exp(-pow((x - head + 0.02) * 30.0, 2.0)) * (1.0 - smoothstep(0.95, 1.0, uProg));
    }
    float halo = smoothstep(0.08, 0.48, sd) * (1.0 - a) * uHalo;
    float glowAmt = uLive;
    vec3 core = uColor * uIntensity * (1.0 + glowAmt * 1.6) + uGlowColor * tip * 6.0;
    vec3 col = mix(uHaloColor, core, a);
    float alpha = max(a, halo) * uOpacity * vFade;
    if (alpha < 0.003) discard;
    col = mix(col, fogTint(vWorld), fogAmount(vWorld) * uFogMul);
    gl_FragColor = vec4(col, alpha);
  }`;
const DEPTH_FRAG = /* glsl */`
  #include <packing>
  uniform sampler2D uAtlas; uniform float uProg, uFx, uOpacity;
  varying vec2 vUv; varying vec3 vWorld; varying float vLi; varying vec2 vLocal; varying float vFade;
  void main(){
    float sd = texture2D(uAtlas, vUv).r;
    if (sd < 0.5 || uOpacity * vFade < 0.5) discard;
    if (int(uFx + 0.5) == 0 && vLi < 1.0 && vLocal.y < -0.28) discard;
    gl_FragColor = packDepthToRGBA(gl_FragCoord.z);
  }`;

function wordUniforms() {
  return {
    uAtlas: { value: atlas.tex }, uProg: { value: 1 }, uStagger: { value: 0.5 }, uTime: FOG.uTime, uSeed: { value: 0 },
    uWordW: { value: 1 }, uSpread: { value: 6 }, uFx: { value: 0 }, uP: { value: new THREE.Vector4() },
    uLive: { value: 0 }, uOpacity: { value: 1 }, uIntensity: { value: 1.2 }, uHalo: { value: 0.55 }, uThin: { value: 0 }, uFogMul: { value: 1 },
    uColor: { value: new THREE.Color(0.93, 0.91, 0.87) }, uGlowColor: { value: new THREE.Color(1, 0.95, 0.85) },
    uHaloColor: { value: new THREE.Color(0.01, 0.01, 0.015) },
    ...FOG,
  };
}

let seedN = 0;
// A run of lockups read in order (a corridor, a dive, a stack of lines): each one's
// entrance uses the gap behind it, and each leaves as the one `keep` places later
// starts to arrive, so at most keep+1 lines share the frame.
export function sequence(lks, keep = 0) {
  for (let i = 1; i < lks.length; i++) lks[i].after(lks[i - 1].words[lks[i - 1].words.length - 1].start);
  for (let i = 0; i < lks.length; i++) {
    const nx = lks[i + 1 + keep];
    if (nx) { const f = nx.words[0].from; lks[i].exit(f - 0.02, f + 0.1); }
  }
  return lks;
}

export class Word3D {
  // face: 'roman' | 'italic'; timing: { start, end }
  constructor(text, face, timing, tracking = 0) {
    this.text = text; this.face = face;
    this.start = timing.start; this.end = timing.end; this.lit = timing.start - LAND;
    const xs = measure(text, face, tracking);
    this.width = xs[xs.length - 1];
    const pos = [], uv = [], gl = [], idx = [];
    const n = text.length;
    let k = 0;
    for (let i = 0; i < n; i++) {
      const g = atlas.glyphs[face + text[i]];
      if (!g || text[i] === ' ') continue;
      const ox = xs[i];
      const cx = ox + (g.x0 + g.x1) / 2, cy = (g.y0 + g.y1) / 2;
      const order = n > 1 ? i / (n - 1) : 0, rnd = Math.abs(Math.sin((seedN + i) * 12.9898) * 43758.5453) % 1;
      const quad = [[g.x0, g.y0, g.u0, g.v0], [g.x1, g.y0, g.u1, g.v0], [g.x1, g.y1, g.u1, g.v1], [g.x0, g.y1, g.u0, g.v1]];
      for (const [qx, qy, qu, qv] of quad) { pos.push(ox + qx, qy, 0); uv.push(qu, qv); gl.push(order, rnd, cx, cy); }
      idx.push(k, k + 1, k + 2, k, k + 2, k + 3); k += 4;
    }
    seedN += 17;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('aGlyph', new THREE.Float32BufferAttribute(gl, 4));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    geo.boundingSphere.radius += 40;                   // effects move letters far from their rest pose
    this.uniforms = wordUniforms();
    this.uniforms.uWordW.value = this.width;
    this.uniforms.uSeed.value = seedN * 0.137;
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    this.mesh.customDepthMaterial = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: DEPTH_FRAG, side: THREE.DoubleSide });
    this.mesh.renderOrder = 10;
    this.mesh.frustumCulled = false;
    this.fx = 'rise';
  }
  setFx(name, params = [0, 0, 0, 0], stagger = 0.5, spread = 6) {
    this.fx = name;
    this.uniforms.uFx.value = FX[name]; this.uniforms.uP.value.set(...params);
    this.uniforms.uStagger.value = stagger; this.uniforms.uSpread.value = spread;
    return this;
  }
  // glow: off while arriving, ramps over the LAND window to the onset, held while sung
  live(t) {
    if (t < this.lit) return 0;
    if (t < this.start) return (t - this.lit) / LAND;
    if (t <= this.end + 0.18) return 1;
    return Math.max(0, 1 - (t - this.end - 0.18) / 0.45);
  }
  progress(t) { return this.rise > 0 ? Math.min(1, Math.max(0, (t - this.from) / this.rise)) : (t >= this.lit ? 1 : 0); }
  update(t) {
    const u = this.uniforms;
    u.uProg.value = this.progress(t);
    u.uLive.value = this.live(t);
    this.mesh.visible = t >= this.from && u.uOpacity.value > 0.002;
  }
}

/* ---------- lockups ----------
   A line set as rows. Markup per row, rows separated by ' / ':
     ^word  large   _word  small italic   ~word  medium   !word  accent colour
   The words must be the line's words in order; a mismatch throws, so the sheet
   can never silently diverge from what is shown. */
const SIZE = { '^': 1.55, '~': 0.78, '_': 0.5 };
export class Lockup {
  constructor(line, markup, opts = {}) {
    this.line = line; this.group = new THREE.Group(); this.words = [];
    const rows = markup.split(' / ').map((r) => r.trim().split(/\s+/));
    const flat = rows.flat().map((w) => w.replace(/^[\^_~!]+/, ''));
    // a lockup may carry part of a line (opts.words = [first, end)); the check
    // requires every sung word to be carried by exactly one lockup
    const [w0, w1] = opts.words || [0, line.words.length];
    const sungWords = line.words.slice(w0, w1);
    const sung = sungWords.map((w) => w.text);
    if (flat.join(' ') !== sung.join(' ')) throw Error(`lockup mismatch:\n  sheet: ${sung.join(' ')}\n  markup: ${flat.join(' ')}`);
    const gap = 0.3 + (opts.tracking || 0) * 1.8, lead = opts.lead || 1.05;
    let wi = 0, y = 0;
    this.lineId = line.id; this.wordRange = [w0, w1];
    const rowObjs = [];
    for (const r of rows) {
      const items = r.map((tok) => {
        const mods = tok.match(/^[\^_~!]*/)[0], text = tok.slice(mods.length);
        let size = 1; for (const m of mods) if (SIZE[m]) size *= SIZE[m];
        const face = mods.includes('_') ? 'italic' : 'roman';
        const w = new Word3D(text, face, sungWords[wi++], opts.tracking || 0);
        w.size = size; w.accent = mods.includes('!');
        return w;
      });
      const width = items.reduce((s, w) => s + w.width * w.size, 0) + items.slice(1).reduce((s, w, i) => s + gap * Math.max(w.size, items[i].size), 0);
      const rowH = Math.max(...items.map((w) => w.size));
      rowObjs.push({ items, width, rowH });
    }
    this.width = Math.max(...rowObjs.map((r) => r.width));
    const align = opts.align || 'center';
    for (const r of rowObjs) {
      y -= r.rowH * 0.78;
      let x = align === 'left' ? 0 : align === 'right' ? this.width - r.width : (this.width - r.width) / 2;
      r.items.forEach((w, i) => {
        w.mesh.position.set(x - this.width / 2, y, 0);
        w.mesh.scale.setScalar(w.size);
        this.group.add(w.mesh); this.words.push(w);
        x += w.width * w.size + (i + 1 < r.items.length ? gap * Math.max(w.size, r.items[i + 1].size) : 0);
      });
      y -= r.rowH * (lead - 0.78);
    }
    this.height = -y;
    // centre the block vertically on the group origin
    for (const w of this.words) w.mesh.position.y += this.height / 2;
    this.timeArrivals();
  }
  // The landing rule, per word: arrive by lit; the first word may take a longer
  // entrance, later words most of the gap to the word before.
  timeArrivals(firstRoom = FX_FIRST) {
    this.words.forEach((w, j) => {
      if (j === 0) w.rise = firstRoom;
      else {
        const g = w.start - this.words[j - 1].start;
        w.rise = Math.min(FX_MAX, Math.max(WORD_ROOM * g, Math.min(RISE_FLOOR, g * 0.9)));
      }
      w.from = w.lit - w.rise;
    });
  }
  fx(name, params, stagger, spread) { for (const w of this.words) w.setFx(name, params, stagger, spread); return this; }
  // Re-time this lockup's first word from the gap to the word sung before it.
  after(prevStart) {
    const w = this.words[0], g = w.start - prevStart;
    w.rise = Math.min(FX_FIRST, Math.max(WORD_ROOM * g, Math.min(RISE_FLOOR, g * 0.9)));
    w.from = w.lit - w.rise;
    return this;
  }
  color(c, accent) {
    for (const w of this.words) w.uniforms.uColor.value.copy(w.accent && accent ? accent : c);
    return this;
  }
  set(key, v) { for (const w of this.words) w.uniforms[key].value = v; return this; }
  // exit: the lockup fades out over [a, b] (a place's words are left behind as we
  // travel; where the next words would land in the same view, they must also go)
  exit(a, b) { this.out = [a, b]; return this; }
  update(t) {
    if (this.out) {
      const k = Math.min(1, Math.max(0, (t - this.out[0]) / Math.max(1e-3, this.out[1] - this.out[0])));
      const o = (1 - k) * (this.baseOpacity ?? 1);
      for (const w of this.words) w.uniforms.uOpacity.value = o;
    }
    for (const w of this.words) w.update(t);
  }
}
