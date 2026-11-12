# The engine

The journey is a three.js r185 page (`journey/index.html`). The same code plays live
in a browser and renders offline in headless Chrome, frame by frame, so the two are
identical apart from the shutter: the offline render takes up to 24 motion-blur
sub-samples per frame, live playback at most 3. Everything is a pure function of the
song's time `t`, which is why scrubbing, the check, the stills and the render all
see exactly the same frame.

## How a frame is made

- **`src/main.js`** boots the page. It loads `../assets/drive.json` and
  `../timing.json`, builds the glyph atlas (every character the sheet and the title
  use), groups the timed words into lines, and builds the film. `renderFilmFrame(t)`
  is the one entry point; `window.filmReady` says the world is built.
- **`src/film.js`** holds the places in order (from `zones/index.js`).
  - `zoneAt(t)` picks the place whose `[t0, t1)` holds `t`. Before the first place
    it gives the first; after the last, the last.
  - Only the current place's group is visible.
  - Every frame it sets the house look, then calls the place's `post`, then the
    grit pass.
- **`src/engine.js`** renders: scene to an HDR target with 4x MSAA, then bloom, god
  rays, accumulation of the shutter sub-samples in linear light, and the grade
  (AgX with a look, CDL, chromatic split, vignette, veil, grain).
  - **Fog** is one shared exponential height fog with in-scatter toward the sun.
    Built-in materials are patched to it (`patchFog`). A custom shader includes
    `FOG_GLSL`, spreads `...FOG` into its uniforms, and calls
    `fogTint(world)` / `fogAmount(world)`.

## A place

A place is a function `(ctx, opts) => zone`. `ctx` holds:
- `scene`, `camera`, `sky`, `sun`, `hemi`, `engine`;
- `lines`: every timed line, `{id, text, words: [{text, start, end}]}`;
- `line(id)`: one line, or an error naming it;
- `title`: the page's `<h1>`.

The zone it returns:

| field | |
|---|---|
| `name` | shown in `?debug` and in check failures; it also keys the grit dust table |
| `t0`, `t1` | its span in song seconds |
| `group` | a `THREE.Group` holding its world and its lockups' groups |
| `track` | its camera, a `Track` |
| `lockups` | its lines, `Lockup[]`; the check requires each sung word to be in exactly one |
| `env(t, c)` | sets sky, fog and lights every frame, usually `env(c, E)` from the kit; also used to build the reflection environment when the place starts |
| `update(t, c)` | optional; animates the world (`t` is song time) |
| `post(t, P, camera)` | optional; the grade and transitions (below) |
| `blurDepth` | optional, default 25: the nominal depth in metres for motion-blur sampling |
| `dust` | optional, 0 to 1.3: dust in the air for the grit layer (default 0.8) |

A place used twice takes options, as in Made Well:
`foundry(ctx, { t0, t1, lines, variant: 'night' })`.

**Surfaces the check cannot test.** If a solid's shape is moved in its vertex
shader, give it `userData.gpuDisplaced = (t) => true` while that is so. The check
then skips occlusion against it and names the place, instead of testing against the
wrong shape.

## The camera: `Track` (`src/camera.js`)

```js
new Track([
  { t: 16.9, p: [0, 8, 0], l: [0, 4, -120], fov: 50, cut: true },
  { t: 18.6, p: [3, 5.5, -36], l: [6, 4.5, -80], fov: 48 },
  { t: 20.6, p: [5, 4.5, -82], l: [4, 4, -150], hold: true },
]);
```

- Keys are time-keyed Hermite splines. Each key's velocity is the central
  difference in *time*, so speed is continuous through every key, and the spacing of
  keys in time sets the speed.
- **Fields:**
  - `p`: position; `l`: look target; `up` (default `[0, 1, 0]`); `roll` in degrees; `fov` (default 42).
  - `hold: true` zeroes the velocity at that key: a dead stop.
  - `cut: true` starts a new path at that key. Use it only under a medium that covers the frame.
  - `vel: [x, y, z]` authors the velocity leaving a key.
- Past the last key, or before a cut, the camera carries on at its velocity, so a
  medium can hide the jump without the camera braking first.
- `track.eval(t)` gives `{pos, look, up, roll, fov}`.
- `shake(t, amp)` gives a deterministic handheld offset `[x, y, z]`.

## The words: `Lockup` (`src/type3d.js`)

```js
const L7 = new Lockup(ctx.line('L7'), '_So ^whatever / _the ^work / ~got !loud')
  .fx('drop').color(C(0.95, 0.9, 0.82), C(1, 0.6, 0.2));
```

- **Markup.** Rows are separated by ` / `. Prefixes on a word:
  - `^` large (x1.55)
  - `~` medium (x0.78)
  - `_` small italic (x0.5)
  - `!` accent colour (the second argument of `.color()`)

  Prefixes multiply: `^^` is x2.4. The words must be the line's words, in order and
  exactly. A mismatch throws, so the sheet can never drift from what is shown.
- **Options:** `new Lockup(line, markup, { words: [a, b], tracking, lead, align })`
  - `words`: carry only words `a` to `b-1` of the line, for a line split across places or planes.
  - `tracking`: letter spacing.
  - `lead`: row spacing (default 1.05).
  - `align`: `center`, `left` or `right`.
- **Methods:**

  | method | |
  |---|---|
  | `.fx(name, params, stagger, spread)` | the arrival; stagger (0.5) spreads it across the letters |
  | `.color(c, accent)` | word colour, and the accent colour for `!` words |
  | `.set(uniform, value)` | any word uniform: `uIntensity` (1.2), `uHalo` (0.55), `uHaloColor`, `uGlowColor`, `uFogMul` (1), `uThin` (0; above 0 thins the strokes), `uOpacity` |
  | `.exit(a, b)` | fade out over `[a, b]` |
  | `.after(prevStart)` | re-time the first word's entrance from the gap to the word sung before |
  | `lk.group` | position, rotate or parent it like any object (it can ride with the camera or a moving thing) |
  | `lk.width`, `lk.height` | its size in em, before `place()` scales it |

- **`sequence(lockups, keep = 0)`.** For lines read in the same view: each entrance
  uses the gap behind it, and each line leaves as the one `keep` places later
  begins to arrive. At most `keep + 1` lines share the frame.
- **Arrivals.** Run per letter on the GPU, and finished when the word lands:

  | name | | params `[x, y, z, w]` |
  |---|---|---|
  | `rise` | rises out of a slot in its plane | x: extra depth |
  | `unfold` | unfolds on its baseline hinge | x: angle multiplier |
  | `assemble` | gathers from scattered letters | `spread` (6) |
  | `drop` | drops from above and settles | |
  | `flip` | each letter flips like a card | |
  | `streak` | streaks in along the line of travel | x: depth, y: sideways |
  | `write` | revealed left to right behind a bright pen | stagger 0.3 reads best |
  | `condense` | condenses out of fog | |
  | `orbit` | orbits in around the word's axis | |
  | `pop` | pops | |
  | `wind` | blown in, tumbling | x: distance |
  | `none` | appears on its onset | |

- **Timing constants** (do not change them; they are the house rules):
  - `LAND` 0.04 s: arrived before the onset.
  - `FX_FIRST` 0.75 s: the longest entrance for a line's first word.
  - `FX_MAX` 0.6 s, and `WORD_ROOM` 0.8 of the gap: the limits for the words after it.
- **Glyphs.** The system Didot (roman and italic), rasterised at boot into a
  signed-distance atlas, so letters stay sharp from 22 px to full screen. Any
  character the sheet uses is added; `lj check` fails a word whose glyph is
  missing.
- **Titles and other unsung text:** `new Lockup(fakeLine([[text, start, end], …]), markup)`.
  Its `lineId` is `title`, so the check ignores it.

## Putting words in the world: `place()` (`src/zones/kit.js`)

```js
place(lk, track, t, { dist: 40, dx: 0.2, dy: 0.06, fill: 0.3, plane: 'face' });
```

Camera first: the lockup goes where the camera looks at time `t` (usually the
middle of the line), so it is in frame by construction. `lj check` verifies it at
every onset anyway.

| option | |
|---|---|
| `dist` | metres along the view ray (30) |
| `dx`, `dy` | offset of that ray, as fractions of the half-frame (-1 to 1) |
| `at` | a world point instead (a `Vector3`), for words set on a thing |
| `plane` | `face` (faces the camera), `floor`, `ceil`, `wallL`, `wallR`, or `plane` with `normal` and `xdir` |
| `y` | for `floor` and `ceil`: the plane's height; the view ray meets it there |
| `fill` | the lockup's width as a fraction of the frame width (0.55) |
| `width` | its width in metres instead |
| `tilt`, `yaw`, `spin` | degrees, after the plane |
| `lift` | metres off the plane, along its normal |

The camera moves after `t`. Every word between the line's first and last onset must
still pass, so set a line farther out when the camera is fast or the line is long.
The starter place (`zones/starter.js`) shows the arithmetic.

## Materials, terrain and helpers (`src/zones/kit.js`)

- `std(params, cacheKey)` and `phys(params, cacheKey)` make `MeshStandardMaterial`
  and `MeshPhysicalMaterial`, patched to the fog and given their grit profile by the
  cache key. Always pass a cache key.
- `terrain((x, z) => height, { x0, x1, z0, z1, nx, nz }, material)`: a heightfield.
- `scatter(geometry, material, n, (i, p, q, s) => …)`: an `InstancedMesh`; set the
  position, quaternion and scale of each instance. One draw call however many.
- `spire(h, r, seed, material)`: a rock spire pushed out of round by noise.
- `makeMist({ count, z0, z1, width, height, y, opacity, spreadX, bottom, soft, tint, seed })`:
  fog banks standing across the line of travel. They fade as the camera comes
  within reach. Transparent, so they never hide a word.
- `fakeLine(words)`: unsung text with explicit times.
- Noise and maths:
  - `noise` (seeded simplex), `fbm(x, y, oct, lac, gain)`, `mulberry32(seed)`;
  - `step(t, a, b)` (smooth 0 to 1), `smooth`, `mix`, `clamp01`;
  - `C(r, g, b)`, `dir(azimuthDeg, elevationDeg)`.

**The environment.** `env(c, E)` sets the sky, fog and lights from one object, and
`lerpEnv(a, b, k)` blends two:

```js
const E = {
  gain: 1.6,                                  // daylit skies need ~1.5–2 in HDR to read as sky
  zenith: C(0.26, 0.32, 0.58), horizon: C(1.22, 0.86, 0.58), ground: C(0.5, 0.36, 0.26), horizonPow: 0.42,
  sunDir: dir(-22, 7), sunColor: C(3.5, 2.2, 1.15), sunSky: C(3.0, 1.8, 0.9), sunSize: 0.0013, sunGlow: 1.8, sunCore: 24,
  stars: 0, moon: 0, moonDir: dir(40, 30), bands: 0.6,
  fog: C(0.86, 0.64, 0.48), fogSun: C(2.1, 1.3, 0.66), fogSunPow: 5, density: 0.0011, falloff: 0.0045, fogBase: 0,
  sunI: 3.6, hemiI: 0.85, hemiSky: C(0.55, 0.55, 0.75), hemiGround: C(0.46, 0.32, 0.22), shadowFocus: 90,
};
```

The sky's colour below the horizon is `ground`. Make it the fog colour, and terrain
edges far out vanish into the haze.

## The music: `src/drive.js`

`assets/drive.json` is the song as data at 30 fps. `lj new` makes it with
`scripts/analyze_bands.py`. It never uses a live analyser, so playback and render
agree.
- `band(b, t)` reads one of 32 log bands, 40 Hz to 14 kHz, each 0–1.
- `bandGroup(b0, b1, t)` averages a range of bands.
- `level(t)` is the loudness, `flux(t)` the change.
- `hits(t, tau, min)` sums decaying impulses from the detected onsets.
- `drive.onsets` is `[[t, strength]]`, and `drive.duration` the song's length.

Use them for light, embers, smoke and particles. Made Well's hammers strike every
two beats of 120 bpm, phased from the chorus onsets. Beat-driven motion is
authored, not detected: measure the tempo and phase once, then write it down.

## The grade: `post(t, P, camera)`

`film.js` resets the house look every frame, then the place adjusts it:

| | house look |
|---|---|
| `exposure` | 1 |
| `bloom`, `bloomThreshold`, `bloomKnee` | 0.55, 1.1, 0.7 |
| `rays`, `raysDecay` | 0 (god rays toward the sun when above 0), 0.955 |
| `lookPower`, `lookSat` | 1.28, 1.22: AgX with a punchy look |
| `saturation`, `contrast` | 1, 1.05 |
| `vignette`, `ca` (chromatic edge split), `grain` | 0.4, 0.5, 0.035 |
| `lift`, `gamma`, `gain`, `split` (`Vector3`s) | a CDL-style grade |
| `veil`, `veilColor` | a full-frame wash for transitions: 1 covers the frame |
| `letterbox` | 0 |

**Transitions are veils.** Fade `P.veil` up over the cut under the place's medium:
white light, warm smoke, steam, black. The check fails any word sung while the veil
is above 0.35, so keep veils off the sung words.

## Grit (`src/grit.js`)

Heavy by default in this template. `?grit=1` is medium; `?grit=0` compiles none
of it, so no material, pass or scene object changes.
- **Surfaces.** Every `std` and `phys` material takes a profile by its cache key:
  - relief, tonal patches, roughness variation, fine grit;
  - strata and cracks, rust and smudges, scars, weave, puddles;
  - dust on faces that look up, darkening in cavities.

  The profiles are `sand`, `ground`, `rock`, `alpine`, `metal`, `skin`, `cloth`,
  `glass`, `plaster`, `wet` and `smooth`; an unknown key gets `rock`.
  - Keys map by exact name (`BY_KEY`) or by prefix (`BY_PREFIX`). Name a new
    material's key with an existing prefix (`stone-…`, `iron-…`, `mud-…`), or add a
    row.
  - Each octave fades as its wavelength nears a pixel, so distant surfaces never
    shimmer.
  - Custom `ShaderMaterial`s get no surface grit. Give them their own texture.
- **Air.** Dust drifts around the camera, lit by the sun. A place's `dust` sets
  how much.
- **Film.** Grain in the encoded domain, halation, gate weave, flicker, edge
  softness, and a little extra vignette and chromatic split.
- **Readability first.** Grit must never cost a word. Judge it in stills at full
  size.

## Other engine parts

| module | what it makes |
|---|---|
| `sky.js` | the sky dome (made by `main.js`): gradient, sun, stars, moon |
| `ocean.js` | `makeOcean(sky, { size, seg, amp, chop, deep, scatter, glint, mirror, rough })`: open water that mirrors the actual sky |
| `clouds.js` | `makeCloudSea(renderer, { y, bottom, top, coverage, density, … })`: a raymarched cloud volume you can fly through, over and under |
| `flowers.js` | `makeFlowers(spots, { petals, palette, open, glow, sway, seed })`: translucent flowers that bloom in a wave |
| `flakes.js` | `makeFlakes({ count, box, vel, turb, spin, size, shape, color, glow, opacity, seed })`: leaves, petals, ash or bubbles, tumbling around the camera |
| `particles.js` | `makeField({ count, box, vel, turb, size, color, opacity, additive, spark, streak, twinkle, floor, seed })`: particle fields that wrap around the camera |

Each is a closed-form function of time, so every shutter sub-sample and every seek
sees the same thing. Keep anything you add that way: no state carried from frame
to frame, no `Math.random()` at render time.

## The check (`journey/check_journey.mjs`, run by `lj check`)

At every sung word's onset, against the real scene, in headless Chrome:

| test | fails when |
|---|---|
| arrived | the arrival has not finished |
| visible | hidden, or opacity under 0.9 |
| its place | the place showing is not the one that owns the lockup |
| glyphs | a character has no glyph |
| in frame | an inked corner is outside 97% of the width or 95% of the height, or behind the camera |
| size | cap height under 22 px |
| facing | more than about 75 degrees from facing the camera |
| fog | fog amount above 0.6 at the word |
| veil | the veil is above 0.35 |
| occlusion | 2 or more of 5 rays from the camera hit an opaque solid of the place first |
| overlap | another line's visible word covers more than 15% of its box |
| coverage | a sung word is carried by no lockup, or by more than one |
| page | any uncaught page error |

`lj check DIR --json` gives every word's result. `FLAGS=grit=0 lj check DIR` checks
another variant.

**What it cannot see:**
- contrast (pale on pale);
- crowding that stays under 15%;
- a line that leaves the frame between onsets;
- anything a transparent material hides;
- whether a place looks good.

## Rendering and the page

- **`render_journey.mjs`** (run by `lj render`). Env:
  - `FPS` (30), `START`, `FRAME_LIMIT`, `OUTPUT`;
  - `BITRATE` (16M; 40M for finals);
  - `CODEC` (`h264_videotoolbox` on macOS, `libx264` elsewhere);
  - `FLAGS`, extra URL flags (a render with flags writes no evidence);
  - `MARK`, seconds between evidence frames (8).

  The song's WAV goes straight to ffmpeg; the picture is piped as JPEG at quality
  0.93.
- **`stills_journey.mjs`** (run by `lj stills`): lossless PNG at film quality.
- **`pw.mjs`** finds Playwright and Chrome, and serves the project from disk.
  - `LJ_PLAYWRIGHT` names a playwright or playwright-core folder.
  - `LJ_CHROME` names the browser.
  - On macOS, WebGL runs on Metal through ANGLE: the tested path. Elsewhere it
    falls back to SwiftShader, which works but is slow.
- **URL flags:**
  - `?film`: full motion blur; the scripts add it.
  - `?grit=0|1|2`.
  - `?look=0`: base AgX, for comparison.
  - `?debug`: a HUD with time, place and camera.
  - `?blur=0`: no motion blur.
  - `?t0=SECONDS`: an offset.
- **Speed:** a full 2:35 song at heavy grit renders in about 7.4 min on an M1 Max,
  at a mean of 9 motion-blur samples per frame.
