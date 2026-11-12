/* The journey: boot, frame loop, transport.
 * renderFilmFrame(t) is the offline entry point (window.filmReady gates it);
 * the live player calls the same function, so they are frame-identical apart
 * from the shutter: offline renders take up to 24 motion-blur sub-samples,
 * live playback at most 3. */
import * as THREE from 'three';
import { Engine, FOG, W, H } from './engine.js';
import { loadDrive } from './drive.js';
import { buildAtlas, atlas } from './type3d.js';
import { makeSky } from './sky.js';
import { applyPose } from './camera.js';
import { buildFilm } from './film.js';

const Q = new URLSearchParams(location.search);
const OFFSET = Number(Q.get('t0') || 0);
const FILM_MODE = Q.has('film'), DEBUG = Q.has('debug'), NOBLUR = Q.get('blur') === '0', BASE_LOOK = Q.get('look') === '0';
const SHUTTER = 0.5 / 30;                 // 180-degree shutter at 30 fps

const canvas = document.getElementById('stage');
const engine = new Engine(canvas);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 30000);
const sky = makeSky(); scene.add(sky.mesh);
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
const sc = sun.shadow.camera; sc.near = 1; sc.far = 1600; sc.left = -160; sc.right = 160; sc.top = 160; sc.bottom = -160;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 0.4); scene.add(hemi);
const ctx = { scene, camera, sky, sun, hemi, engine };
// Physical materials (wet skin, gems, glass, glaze) reflect an environment
// made from the current place's own sky, rebuilt whenever the place changes.
const pmrem = new THREE.PMREMGenerator(engine.renderer);
const envScene = new THREE.Scene();
let envZone = null;
function refreshEnv(z, t) {
  if (envZone === z) return;
  envZone = z;
  z.env(t + 2, ctx);
  scene.remove(sky.mesh); envScene.add(sky.mesh); sky.mesh.position.set(0, 0, 0);
  const rt = pmrem.fromScene(envScene, 0, 0.1, 2000);
  envScene.remove(sky.mesh); scene.add(sky.mesh);
  if (scene.environment) scene.environment.dispose?.();
  scene.environment = rt.texture;
}
let film = null, frameIdx = 0;

const _f = new THREE.Vector3();
function setScene(t) {
  refreshEnv(film.zoneAt(t), t);
  applyPose(camera, film.pose(t));
  FOG.uCamPos.value.copy(camera.position); FOG.uTime.value = t;
  sky.mesh.position.copy(camera.position); sky.u.uTime.value = t;
  film.update(t, ctx);
  // the sun's shadow frustum follows what the camera is looking at
  camera.getWorldDirection(_f);
  const focus = camera.position.clone().addScaledVector(_f, ctx.shadowFocus || 70);
  sun.target.position.copy(focus);
  sun.position.copy(focus).addScaledVector(FOG.uSunDir.value, 700);
  sun.target.updateMatrixWorld();
}
// Shutter samples follow how far the frame actually moves: view rotation plus
// translation over a nominal depth, in pixels.
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
function blurSamples(t) {
  const p0 = film.pose(t - SHUTTER), p1 = film.pose(t);
  _a.copy(p0.look).sub(p0.pos).normalize(); _b.copy(p1.look).sub(p1.pos).normalize();
  const ang = Math.acos(Math.min(1, _a.dot(_b))) + Math.abs(THREE.MathUtils.degToRad(p1.roll - p0.roll)) * 0.5;
  const fpx = (H / 2) / Math.tan(THREE.MathUtils.degToRad(p1.fov / 2));
  const px = ang * fpx + p0.pos.distanceTo(p1.pos) / (film.blurDepth?.(t) || 25) * fpx + (film.extraBlur?.(t) || 0);
  return Math.max(1, Math.min(FILM_MODE ? 24 : 3, Math.ceil(px / 3)));
}
function renderFilmFrame(tRaw) {
  const t = tRaw + OFFSET;
  film.post(t, engine.P, camera);
  if (BASE_LOOK) engine.P.lookPower = engine.P.lookSat = 1;   // ?look=0: base AgX, for comparison
  const K = NOBLUR ? 1 : blurSamples(t);
  for (let k = 0; k < K; k++) {
    const tk = K === 1 ? t : t - SHUTTER * (1 - k / (K - 1));
    setScene(tk);
    engine.sample(scene, camera, 1 / K, k === 0);
  }
  engine.finish(frameIdx++);
  if (DEBUG) debugHud(t, K);
  window.lastSamples = K;
}
window.renderFilmFrame = renderFilmFrame;

let hud = null;
function debugHud(t, K) {
  if (!hud) { hud = document.createElement('div'); hud.style.cssText = 'position:absolute;left:8px;top:8px;font:12px ui-monospace,monospace;color:#9cf;background:rgba(0,0,0,.6);padding:4px 8px;pointer-events:none'; document.getElementById('screen').appendChild(hud); }
  hud.textContent = `t ${t.toFixed(3)}  ${film.zoneAt(t)?.name || '-'}  blur ${K}  cam ${camera.position.toArray().map((v) => v.toFixed(0)).join(',')}`;
}

/* ---------- transport ---------- */
const el = (id) => document.getElementById(id);
const audio = el('audio');
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
let playing = false;
function loop() {
  if (!playing) return;
  const src = audio.currentTime;
  renderFilmFrame(src - OFFSET);
  el('time').textContent = fmt(src - OFFSET); el('seek').value = src - OFFSET;
  const live = film.liveWord(src);
  el('readout').textContent = live ? `"${live.text}"  ${live.start.toFixed(3)}s  ·  ${film.zoneAt(src)?.name || ''}` : `${src.toFixed(2)}s · ${film.zoneAt(src)?.name || ''}`;
  requestAnimationFrame(loop);
}
function play() {
  audio.play().then(() => { playing = true; el('play').textContent = '❚❚'; el('start').classList.add('hidden'); requestAnimationFrame(loop); })
    .catch((e) => { el('loading').classList.remove('hidden'); el('loading').textContent = 'Audio blocked: ' + e.message; });
}
function pause() { audio.pause(); playing = false; el('play').textContent = '▶'; }
el('start').addEventListener('click', play);
el('play').addEventListener('click', () => (playing ? pause() : play()));
el('seek').addEventListener('input', (e) => { audio.currentTime = Number(e.target.value) + OFFSET; if (!playing) renderFilmFrame(Number(e.target.value)); });
el('sound').addEventListener('click', () => { audio.muted = !audio.muted; el('sound').textContent = audio.muted ? '◖·' : '◖))'; });
el('fullscreen').addEventListener('click', () => { const s = el('screen'); document.fullscreenElement ? document.exitFullscreen() : s.requestFullscreen(); });
addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); } });

/* ---------- boot ---------- */
(async () => {
  const [d, timed] = await Promise.all([
    fetch('../assets/drive.json').then((r) => r.json()),
    fetch('../timing.json').then((r) => r.json()),
  ]);
  loadDrive(d);
  if (document.fonts) { await document.fonts.load('400 64px Didot'); await document.fonts.load('italic 400 64px Didot'); }
  const t0 = performance.now();
  const title = document.querySelector('h1')?.textContent || '';
  buildAtlas(timed.words.map((w) => w.text).join('') + title);   // every letter the sheet and title use gets a glyph
  const byLine = new Map();
  for (const w of timed.words) { if (!byLine.has(w.line_id)) byLine.set(w.line_id, []); byLine.get(w.line_id).push(w); }
  const lines = timed.lines.map((L) => ({ id: L.id, text: L.text, words: (byLine.get(L.id) || []).slice().sort((a, b) => a.start - b.start).map((w) => ({ text: w.text, start: w.start, end: w.end })) }));
  film = buildFilm({ ...ctx, lines, title });
  window.film = film; window.THREE = THREE; window.camera = camera;
  window.journeyProbe = { setScene, camera, scene, film, engine, FOG, lines, atlas };
  el('seek').max = d.duration - OFFSET; el('duration').textContent = fmt(d.duration - OFFSET);
  if (OFFSET > 0) audio.currentTime = OFFSET;
  window.bootMs = Math.round(performance.now() - t0);
  renderFilmFrame(0);
  el('loading').classList.add('hidden');
  window.filmReady = true;
})().catch((e) => { el('loading').textContent = 'Error: ' + e.message; console.error(e); window.filmError = String(e.stack || e); });
