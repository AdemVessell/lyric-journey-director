# Lessons that cost iterations

Each of these failed at least once on Basic Diamond Thoughts, on Made Well, or while
this skill was built. Read this before building a place, and again when `lj check`
fails.

## Placement and camera

- **A line held still while the camera travels fast fails at one end.** In BDT, at
  the camera's 78 m/s, a standing line measured about 30 px when its first words
  were sung, and was off the frame by its last. Two fixes:
  - let the line ride ahead of the camera, closing slowly and following its heading
    0.15 s late;
  - or set it farther out and slow the camera while it is read.
- **A line fixed in the world during a fast camera arc fails.** Set it at the arc's
  look target. Made Well's *far around* stands before the flywheel the camera arcs
  round (`place(…, { at })`).
- **Floor-plane lines lose their nearest row first.** That row is the one sung
  last. Place them farther out, or raise the camera.
- **Lines leaving the frame before their last word.** This was one cause among the
  27 words Made Well's first full check failed. Hold keys (`hold: true`) at the
  reading moment fixed them.
- **A heightfield covers any shaft or opening.** Cut the triangles under a well rim;
  do not just hide the terrain.
- **Terrain and props occlude lines from below.** A road crest hid a milestone's
  bottom row, and BDT's carriage roofs (turned a quarter-turn too far) hid
  *Heavyset* while *train* was sung. Lift the line, or move the thing.
- **Mud beneath a rising line.** Gold-rise lines on Made Well's lakebed had to be
  lifted above the mud.
- **The lower half of the frame meets the ground.** A level camera low over a plain
  sinks lower-half lines into the terrain as they are set farther out. The starter
  place keeps its eye at 30 m for this reason.

## Words and contrast

- **Pale text on a pale ground passes the check and fails by eye.** The check
  measures geometry, not contrast. On Made Well's pale lakebed the words became
  dark ink with a pale halo.
- **Haze washes words out.** The starter place's first pass had heavy pale fog and
  mist, and white words on it barely read. It became a darker blue-hour plain.
- **Split a line only where its words are far apart.** A split fades its own first
  word.
- **One big word hanging over the rest crops them.** In BDT's second chorus,
  *Harder* hung huge over *than the wind*. Now *Harder* leaves as *than* lands.
- **Particles darker than the sky read as soot.** BDT's petals had to be brightened.
- **Words at the 22 px floor pass, but only just.** Made Well's smallest was *Make*
  in the well. Aim for a median above 60 px.
- **A character with no glyph vanished silently** (curly quotes, accents). The
  atlas now takes every character the sheet uses, and the check fails a missing
  glyph.

## World and shaders

- **Reversed `smoothstep` edges are undefined in GLSL.** Use
  `1.0 - smoothstep(a, b, x)` instead. This was fixed in Made Well's kit and canyon.
- **Thin seams fatten into cell blobs at a distance.** Use coverage
  anti-aliasing, `width / (width + fwidth)`, and a noise keep-mask, or they read as
  a grid.
- **A heightfield sheet with sprite puffs looks like CGI cloud.** Adem asked for the
  cloud sea to be strengthened, and it became a raymarched volume (`clouds.js`).
- **Mirror physics can be bent for the picture.** A deep well's water would mirror
  only a pinhead of sky, so Made Well draws the reflected circle wider for its stars
  to show. Say so in the README's claim boundary.
- **Keep everything a function of time.** No state carried between frames, and no
  `Math.random()` at render time. Motion blur samples, seeks, the check and the
  render must all see the same world.

## Grit

- **The first pass was blotchy:**
  - thresholded value-noise speckle;
  - a full-fbm cavity term;
  - a relief slope of 1–3 degrees, which no one can see.

  The fixes were a flat slope spectrum (each octave weighted equally), a high-pass
  cavity, fine grit, and stricter fades as detail nears a pixel.
- **Turning grit off must change nothing.** `?grit=0` compiles none of it, so the
  plain film is byte-identical to before. Keep it that way when you add to it.
- **Grade pushes overshoot.** A global split-tone turned amber purple and lifted
  black to navy. Saturation 1.3 turned violet casts purple. Push colour from the
  light instead.

## Timing

- **Same-named masters differ.** `made well.wav` (155.44 s) and
  `made well — lustre V2.wav` (155.79 s) are different files. Identify a master by
  its SHA-256.
- **An aligner smears across sound the sheet does not cover.** Smear looks like
  coverage, so ask Adem about every vocalise, ad-lib and backing line.
- **Lyric Lock was not reproducible.** Demucs's unseeded `--shifts 1` moved contested
  words up to 3.16 s between identical runs. Never treat one run of a stochastic
  tool as ground truth.
- **A tapped "lead" is the tapper's anticipation, not a display preference.** The
  −239 ms lead was retired.
- **Fix the camera, never the timing.** When a word fails the check, move the line
  or the camera. Timing changes only on Adem's ear.

## Tooling

- **The check must call `scene.updateMatrixWorld()`.** Nothing renders between
  probes, so moving lines and solids would otherwise be measured where they last
  rendered.
- **zsh traps in shell one-liners:**
  - `echo =====` is expanded as a filename, so quote it;
  - `$FONT:t` is read as a modifier, so brace it: `${FONT}:t`.
- **The headless page aborts what it does not serve.** Audio requests are answered
  with an empty 204, so the page logs no false errors. The song reaches the film
  through ffmpeg, never through the page.
- **Preview panes may not screenshot WebGL.** Verify with `lj stills` and the
  render, or watch in Safari.
