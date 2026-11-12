// Stills from the journey at chosen times, as lossless PNG at full film quality.
// Same page and route as render_journey.mjs; extra URL flags pass straight through.
//   TIMES=40.3,46 FLAGS=grit=1 OUT=dir node stills_journey.mjs
// Without TIMES: one still at the middle of every place, plus every line's first onset
// with LINES=1.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HERE, openJourney } from './pw.mjs';

const flags = process.env.FLAGS || '';
const out = path.resolve(process.env.OUT || path.join(HERE, 'stills'));
await mkdir(out, { recursive: true });
const { browser, page, errors } = await openJourney({ flags, consoleErrors: true });
const times = process.env.TIMES
  ? process.env.TIMES.split(',').map(Number)
  : await page.evaluate((lines) => {
    const f = window.film, ts = f.zones.map((z) => (z.t0 + z.t1) / 2);
    if (lines) for (const L of window.journeyProbe.lines) if (L.words.length) ts.push(L.words[0].start);
    return ts.sort((a, b) => a - b);
  }, process.env.LINES === '1');
for (const t of times) {
  const t0 = Date.now();
  const b64 = await page.evaluate((t) => { window.renderFilmFrame(t); return document.getElementById('stage').toDataURL('image/png').split(',')[1]; }, t);
  const f = path.join(out, `t${t.toFixed(2)}.png`);
  await writeFile(f, Buffer.from(b64, 'base64'));
  console.log(`${path.basename(f)} · ${Date.now() - t0} ms`);
}
await browser.close();
if (errors.length) process.exit(1);
