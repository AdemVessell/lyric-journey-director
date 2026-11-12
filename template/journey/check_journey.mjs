// Legibility check for the journey, run against the real scene in headless Chrome.
// At every sung word's onset the word must be: fully arrived, visible and not
// fading, inside the frame, large enough to read, facing the camera, not occluded
// by solid geometry, not lost in fog or under a transition veil, and not sharing
// screen space with another line. Every sung word must be carried by exactly one
// lockup. Pages are served from disk (no server).
//   node check_journey.mjs            report
//   node check_journey.mjs --json     machine-readable
// Every letter must also have a glyph in the atlas, and the page must raise no errors.
import { openJourney } from './pw.mjs';
const { browser, page, errors } = await openJourney({ flags: process.env.FLAGS || '', timeout: 120000 });
const res = await page.evaluate(() => {
  const { setScene, camera, scene, film, engine, FOG, lines, atlas } = window.journeyProbe, THREE = window.THREE;
  const H = 1080, W = 1920, ray = new THREE.Raycaster();
  const fogAt = (p) => {
    const c = FOG.uCamPos.value, d = p.clone().sub(c), dist = d.length(), b = Math.max(FOG.uFogFalloff.value, 1e-5);
    let amt = FOG.uFogDensity.value * Math.exp(-b * (c.y - FOG.uFogBase.value)) * dist;
    if (Math.abs(d.y) > 1e-3) amt *= (1 - Math.exp(-b * d.y)) / (b * d.y);
    return 1 - Math.exp(-Math.max(amt, 0));
  };
  // coverage: every sung word carried exactly once
  const carried = new Map();
  for (const lk of film.lockups) {
    if (!lk.lineId || lk.lineId === 'title') continue;
    for (let i = lk.wordRange[0]; i < lk.wordRange[1]; i++) { const k = lk.lineId + ':' + i; carried.set(k, (carried.get(k) || 0) + 1); }
  }
  const coverage = [];
  for (const L of lines) L.words.forEach((w, i) => { const n = carried.get(L.id + ':' + i) || 0; if (n !== 1) coverage.push(`${L.id}:${i} "${w.text}" carried ${n}x`); });
  const all = [];
  for (const lk of film.lockups) for (const w of lk.words) all.push({ lk, w });
  const out = [], untested = new Set();
  for (const { lk, w } of all) {
    if (lk.lineId === 'title') continue;
    const t = w.start;
    film.post(t, engine.P, camera);
    setScene(t);
    // nothing renders here, so bring world matrices up to date: a line that travels (on the
    // train, riding the wind) and moving solids would otherwise be measured where they last rendered
    scene.updateMatrixWorld();
    const zone = film.zoneAt(t);
    const fails = [];
    if (w.progress(t) < 1) fails.push('not arrived');
    const missing = [...w.text].filter((ch) => ch !== ' ' && !atlas.glyphs[w.face + ch]);
    if (missing.length) fails.push(`no glyph for ${missing.join('')}`);
    const opacity = w.uniforms.uOpacity.value;
    if (!w.mesh.visible || opacity < 0.9) fails.push(`hidden/fading (opacity ${opacity.toFixed(2)})`);
    if (!zone.lockups.includes(lk)) fails.push(`belongs to another place (active: ${zone.name})`);
    w.mesh.updateMatrixWorld(true);
    const g = w.mesh.geometry.attributes.position;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < g.count; i++) { x0 = Math.min(x0, g.getX(i)); x1 = Math.max(x1, g.getX(i)); y0 = Math.min(y0, g.getY(i)); y1 = Math.max(y1, g.getY(i)); }
    // the glyph quads carry SDF padding; use the inked box: baseline-ish to cap height
    const ink = [[x0 + 0.05, -0.12], [x1 - 0.05, -0.12], [x1 - 0.05, 0.7], [x0 + 0.05, 0.7]];
    const pts = ink.map(([x, y]) => new THREE.Vector3(x, y, 0).applyMatrix4(w.mesh.matrixWorld));
    const ndc = pts.map((p) => p.clone().project(camera));
    const behind = ndc.some((p) => p.z > 1 || p.z < -1);
    const out_ = ndc.filter((p) => Math.abs(p.x) > 0.97 || Math.abs(p.y) > 0.95).length;
    if (behind) fails.push('behind camera');
    else if (out_) fails.push(`${out_}/4 corners off frame`);
    const capPx = ((ndc[3].y - ndc[0].y) ** 2 + ((ndc[3].x - ndc[0].x) * W / H) ** 2) ** 0.5 * H / 2 * (0.7 / 0.82);
    if (capPx < 22) fails.push(`small (cap ${capPx.toFixed(0)} px)`);
    const ctr = pts[0].clone().add(pts[2]).multiplyScalar(0.5);
    const nrm = new THREE.Vector3(0, 0, 1).transformDirection(w.mesh.matrixWorld);
    const toCam = camera.position.clone().sub(ctr).normalize();
    const facing = Math.abs(nrm.dot(toCam));
    if (facing < 0.25) fails.push(`oblique (${(Math.acos(facing) * 57.3).toFixed(0)} deg)`);
    const fog = fogAt(ctr) * w.uniforms.uFogMul.value;
    if (fog > 0.6) fails.push(`fogged (${fog.toFixed(2)})`);
    if (engine.P.veil > 0.35) fails.push(`under veil (${engine.P.veil.toFixed(2)})`);
    // occlusion against the place's solid geometry
    const solids = [];
    zone.group.traverse((o) => {
      if (!(o.isMesh || o.isInstancedMesh) || !o.visible || o.material.transparent || o.material.side === THREE.BackSide || o.geometry.attributes.aGlyph) return;
      if (o.userData.gpuDisplaced && o.userData.gpuDisplaced(t)) { untested.add(zone.name); return; }
      solids.push(o);
    });
    let blocked = 0, by = '';
    const samples = [ctr, ...pts.map((p) => p.clone().lerp(ctr, 0.25))];
    for (const sp of samples) {
      const dir = sp.clone().sub(camera.position), d = dir.length(); dir.normalize();
      ray.set(camera.position, dir); ray.far = d - 0.5;
      const hit = ray.intersectObjects(solids, false);
      if (hit.length) { blocked++; by = hit[0].object.material.userData.cacheKey || hit[0].object.material.type; }
    }
    if (blocked >= 2) fails.push(`occluded by ${by} (${blocked}/5 samples)`);
    // shared screen space with another line's words that are showing now
    const box = { x0: Math.min(...ndc.map((p) => p.x)), x1: Math.max(...ndc.map((p) => p.x)), y0: Math.min(...ndc.map((p) => p.y)), y1: Math.max(...ndc.map((p) => p.y)) };
    for (const o of all) {
      if (o.lk === lk || !zone.lockups.includes(o.lk) || o.lk.lineId === 'title') continue;
      const ow = o.w;
      if (!ow.mesh.visible || ow.uniforms.uOpacity.value < 0.2 || ow.progress(t) <= 0.05) continue;
      ow.mesh.updateMatrixWorld(true);
      const og = ow.mesh.geometry.attributes.position; let a0 = 1e9, a1 = -1e9;
      for (let i = 0; i < og.count; i++) { a0 = Math.min(a0, og.getX(i)); a1 = Math.max(a1, og.getX(i)); }
      const q = [[a0, -0.12], [a1, -0.12], [a1, 0.7], [a0, 0.7]].map(([x, y]) => new THREE.Vector3(x, y, 0).applyMatrix4(ow.mesh.matrixWorld).project(camera));
      if (q.some((p) => p.z > 1 || p.z < -1)) continue;
      const b = { x0: Math.min(...q.map((p) => p.x)), x1: Math.max(...q.map((p) => p.x)), y0: Math.min(...q.map((p) => p.y)), y1: Math.max(...q.map((p) => p.y)) };
      const ix = Math.max(0, Math.min(box.x1, b.x1) - Math.max(box.x0, b.x0)), iy = Math.max(0, Math.min(box.y1, b.y1) - Math.max(box.y0, b.y0));
      if (ix * iy > 0.15 * (box.x1 - box.x0) * (box.y1 - box.y0)) { fails.push(`overlaps "${ow.text}" (${o.lk.lineId})`); break; }
    }
    out.push({ line: lk.lineId, text: w.text, t: +t.toFixed(2), zone: zone.name, cap: +capPx.toFixed(0), fails });
  }
  return { out, coverage, untested: [...untested] };
});
await browser.close();
const bad = res.out.filter((r) => r.fails.length);
res.pageErrors = errors;
const failed = bad.length || res.coverage.length || errors.length || !res.out.length;
if (process.argv.includes('--json')) { console.log(JSON.stringify(res, null, 1)); process.exit(failed ? 1 : 0); }
console.log(`journey legibility · ${res.out.length} sung words checked at their onsets`);
console.log(`coverage: ${res.coverage.length ? res.coverage.join('; ') : 'every sung word carried exactly once'}`);
if (errors.length) console.log(`page errors: ${errors.length} · first: ${errors[0]}`);
for (const r of bad) console.log(`  ${r.t.toFixed(2).padStart(7)}  ${r.line.padEnd(4)} ${r.text.padEnd(12)} ${r.zone.padEnd(22)} ${r.fails.join(' · ')}`);
const caps = res.out.map((r) => r.cap).sort((a, b) => a - b);
if (caps.length) console.log(`cap height at onset: min ${caps[0]} px · median ${caps[Math.floor(caps.length / 2)]} px`);
if (res.untested.length) console.log(`occlusion not tested against GPU-shaped surfaces in: ${res.untested.join(', ')}`);
console.log(failed ? `FAIL — ${bad.length} words${res.coverage.length ? `, ${res.coverage.length} coverage` : ''}${errors.length ? `, ${errors.length} page errors` : ''}${res.out.length ? '' : ', no words checked'}` : 'PASS — every word legible at its onset');
process.exit(failed ? 1 : 0);
