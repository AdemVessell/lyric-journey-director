// Offline export of the journey: 1920x1080, 30 fps, up to 24 motion-blur
// sub-samples per frame (?film). The page is served to headless Chrome from disk
// (no server); the song's WAV goes straight to ffmpeg, untouched.
//   node render_journey.mjs
// Env:
//   FPS          30
//   START        seconds into the song (default 0)
//   FRAME_LIMIT  frames to render (default: to the end of the song)
//   OUTPUT       default <project>/<project folder>-journey.mp4
//   BITRATE      16M; the grain wants 40M for a final
//   CODEC        h264_videotoolbox on macOS, libx264 elsewhere
//   FLAGS        extra URL flags, e.g. grit=1. A render with FLAGS is a test, so it
//                writes no evidence frames.
//   MARK         seconds between evidence frames (default 8), into journey/evidence/
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HERE, ROOT, openJourney } from './pw.mjs';

const drive = JSON.parse(await readFile(path.join(ROOT, 'assets/drive.json'), 'utf8'));
const fps = Number(process.env.FPS) || 30, songEnd = drive.duration;
const start = Number(process.env.START || 0);
const limit = Number(process.env.FRAME_LIMIT) || Math.ceil(fps * (songEnd - start));
const output = path.resolve(process.env.OUTPUT || path.join(ROOT, `${path.basename(ROOT)}-journey.mp4`));
const flags = process.env.FLAGS || '';
const codec = process.env.CODEC || (process.platform === 'darwin' ? 'h264_videotoolbox' : 'libx264');
const markEvery = Math.max(1, Math.round(fps * (Number(process.env.MARK) || 8)));
await mkdir(path.join(HERE, 'evidence'), { recursive: true });
const { browser, page, errors } = await openJourney({ flags });
await page.evaluate(() => document.getElementById('start').classList.add('hidden'));
const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'image2pipe', '-framerate', String(fps), '-vcodec', 'mjpeg', '-i', 'pipe:0',
  '-ss', String(start), '-i', path.join(ROOT, 'assets/song.wav'),
  '-map', '0:v:0', '-map', '1:a:0', '-c:v', codec, '-b:v', process.env.BITRATE || '16M', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '256k', '-t', String(limit / fps), '-movflags', '+faststart', output], { stdio: ['pipe', 'ignore', 'inherit'] });
ff.stdin.on('error', (e) => console.error('ffmpeg pipe:', e.message));
const t0 = Date.now(); let samples = 0;
for (let i = 0; i < limit; i++) {
  const t = start + i / fps, n = i + Math.round(start * fps);
  const data = await page.evaluate((t) => {
    window.renderFilmFrame(t);
    return [document.getElementById('stage').toDataURL('image/jpeg', 0.93).split(',')[1], window.lastSamples];
  }, t);
  samples += data[1];
  const buf = Buffer.from(data[0], 'base64');
  if (!flags && n % markEvery === 0) await writeFile(path.join(HERE, 'evidence', `frame-${String(n).padStart(5, '0')}.jpg`), buf);
  if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');
  if (i % 300 === 0) console.log(`frame ${i}/${limit} · t ${t.toFixed(1)} · ${((Date.now() - t0) / 1000).toFixed(0)} s · mean samples ${(samples / (i + 1)).toFixed(1)}`);
}
ff.stdin.end();
const [status] = await once(ff, 'close');
await browser.close();
if (status !== 0) throw Error(`ffmpeg failed: ${status}`);
if (errors.length) { console.error(`FAIL — ${errors.length} page errors during the render`); process.exit(1); }
console.log(`exported ${output} · ${limit} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s · mean ${(samples / limit).toFixed(1)} shutter samples per frame`);
