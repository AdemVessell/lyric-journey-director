// Headless Chrome for the check, the render and the stills.
//
// It finds Playwright and Chrome, serves the project folder to the page straight
// from disk (no server, no network), and opens the journey once its world is built.
//   LJ_PLAYWRIGHT  a playwright or playwright-core package folder. Without it: the
//                  project's own node_modules, then the global npm root, then a
//                  known copy on Adem's Mac.
//   LJ_CHROME      the Chrome binary. Without it: Google Chrome.app on macOS, else
//                  Playwright's own browser.
import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
const HOST = 'http://lj.local';
const AUDIO = new Set(['.wav', '.mp3', '.m4a', '.aac', '.flac', '.ogg']);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function packageDirs() {
  const dirs = [];
  try {
    const g = execFileSync('npm', ['root', '-g'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (g) dirs.push(path.join(g, 'playwright'), path.join(g, 'playwright-core'));
  } catch { /* no npm on PATH */ }
  dirs.push(path.join(os.homedir(), 'Desktop/ARSENAL/capsules/room-interaction-v1/node_modules/playwright'));
  return dirs;
}
async function fromDir(dir) {
  const entry = ['index.mjs', 'index.js'].map((f) => path.join(dir, f)).find((f) => existsSync(f));
  if (!entry) return null;
  const m = await import(pathToFileURL(entry).href);
  const chromium = m.chromium || m.default?.chromium;
  return chromium ? { chromium, from: dir } : null;
}
export async function loadPlaywright() {
  if (process.env.LJ_PLAYWRIGHT) {
    const pw = await fromDir(path.resolve(process.env.LJ_PLAYWRIGHT));
    if (pw) return pw;
    throw Error(`LJ_PLAYWRIGHT=${process.env.LJ_PLAYWRIGHT} holds no playwright package`);
  }
  for (const spec of ['playwright', 'playwright-core']) {
    try { const m = await import(spec); return { chromium: m.chromium || m.default.chromium, from: spec }; } catch { /* not installed here */ }
  }
  for (const dir of packageDirs()) { const pw = await fromDir(dir); if (pw) return pw; }
  throw Error('Playwright not found. Set LJ_PLAYWRIGHT to a playwright or playwright-core folder; `lj doctor` lists where it looked.');
}
export function chromePath() {
  if (process.env.LJ_CHROME) return process.env.LJ_CHROME;
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return process.platform === 'darwin' && existsSync(mac) ? mac : undefined;
}
// Metal through ANGLE on macOS, the tested path. Elsewhere WebGL falls back to
// SwiftShader: it works, but it is slow.
export const chromeArgs = () => (process.platform === 'darwin'
  ? ['--no-sandbox', '--use-angle=metal', '--ignore-gpu-blocklist']
  : ['--no-sandbox', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']);

// Opens journey/index.html?film&<flags> and waits for window.filmReady.
// Returns { browser, page, errors }; errors collects uncaught page errors.
export async function openJourney({ flags = '', timeout = 180000, consoleErrors = false } = {}) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true, executablePath: chromePath(), args: chromeArgs() });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1 });
  await page.route(HOST + '/**', (route) => {
    const p = decodeURIComponent(new URL(route.request().url()).pathname), f = path.join(ROOT, p);
    // only the kinds of file the page loads, and only from inside the project; the song
    // itself is never fetched (ffmpeg muxes it from disk)
    if (!f.startsWith(ROOT + path.sep)) return route.abort();
    if (AUDIO.has(path.extname(p).toLowerCase())) return route.fulfill({ status: 204, body: '' });
    if (!TYPES[path.extname(p)]) return route.abort();
    return route.fulfill({ path: f, contentType: TYPES[path.extname(p)] });
  });
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.error('pageerror:', e.message); });
  if (consoleErrors) page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error(`console ${m.type()}:`, m.text()); });
  await page.goto(`${HOST}/journey/index.html?film${flags ? '&' + flags : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.filmReady === true || window.filmError, { timeout });
  const err = await page.evaluate(() => window.filmError);
  if (err) { await browser.close(); throw Error(err); }
  return { browser, page, errors };
}
