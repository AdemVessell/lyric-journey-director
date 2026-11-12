/* The song as data: assets/drive.json (32 log bands, level, flux, onsets at
 * 30 fps), decoded once. Everything visual that reacts to the music reads this,
 * never a live AnalyserNode, so playback and the offline render agree exactly. */
export const drive = { ready: false };
function unb64(s) {
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function loadDrive(d) {
  Object.assign(drive, d);
  drive.bands = unb64(d.bands_b64); drive.levels = unb64(d.level_b64); drive.fluxes = unb64(d.flux_b64);
  drive.ready = true;
}
const lerpFrame = (arr, stride, off, t) => {
  const f = t * drive.fps, i = Math.floor(f), n = drive.n_frames;
  if (i < 0) return arr[off] / 255;
  if (i >= n - 1) return arr[(n - 1) * stride + off] / 255;
  const a = arr[i * stride + off] / 255, b = arr[(i + 1) * stride + off] / 255;
  return a + (b - a) * (f - i);
};
export const band = (b, t) => lerpFrame(drive.bands, drive.n_bands, b, t);
export const level = (t) => lerpFrame(drive.levels, 1, 0, t);
export const flux = (t) => lerpFrame(drive.fluxes, 1, 0, t);
export function bandGroup(b0, b1, t) { let s = 0; for (let b = b0; b <= b1; b++) s += band(b, t); return s / (b1 - b0 + 1); }
// Decaying impulse from onsets at or before t: sum of s * exp(-(t - t0) / tau)
export function hits(t, tau = 0.25, min = 0) {
  let v = 0;
  for (const [t0, s] of drive.onsets) {
    if (t0 > t) break;
    if (s < min || t - t0 > tau * 6) continue;
    v += s * Math.exp(-(t - t0) / tau);
  }
  return v;
}
