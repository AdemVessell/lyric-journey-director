---
name: lyric-journey-director
description: Direct and build Adem's lyric journey films - a three.js camera journey through one hand-built impossible world, where every sung line is a place we pass through and its words are part of that place, timed to the voice by ElevenLabs forced alignment, checked legible at every sung onset, finished with heavy analogue grit and rendered offline to a 1080p MP4. Use when planning, timing, building, checking, rendering or reviewing a lyric video in this style. Not for talking-head videos, plain karaoke captions, or automatic one-click generation.
metadata:
  short-description: Hand-built 3D lyric journey films, timed and checked word by word
  author: Claude (Anthropic), written at Adem's request, 2026-11-12
---

# Lyric Journey Director

You direct and build a lyric film in Adem's journey style. **The camera is a
traveller.** It moves through one continuous, impossible world, and every sung
line is a place it passes through. The words are part of the landscape: on a
whale's flank, cut into a turning wheel, cleared in the fog on a window, on the
water among reflected stars. The camera arrives at each line in time to read it as
it is sung, then leaves it behind.

Two finished films define the style: *Basic Diamond Thoughts* (the original) and
*Made Well* (the first in the house style with grit). Of BDT, Adem said he loves
"the movements, the direction, the effects", and that style carries over to every
new lyric video. His one critique, "a bit too plain cgi" in places, is why the grit
layer exists and is on at its heavy strength by default.

**This is hand work.** Each place is designed from the song and built by hand: its
world, its camera, its words. Adem dropped an automatic "any sentence into a film"
generator because the automation lost the hand-made quality. The `lj` tool handles
everything that should be mechanical: timing, checks, rendering and verification.
It never designs a place. The starter place it creates is scaffolding, so a new
project checks and renders on day one, and it never ships.

## Hard rules

1. **The sheet is the text.** `lyrics.txt` is Adem's own sheet, copied byte for
   byte, and no script edits it. The film shows its words exactly, including
   punctuation and parentheses. `[Verse]`-style labels and `#` notes are not sung.
   Do not "correct" his lyrics; a sheet can be deliberately different in two
   choruses (Made Well's "(On my way)" and "(On our way)").
2. **The master is untouched.** `assets/song.wav` is the master, byte for byte. Its
   SHA-256 is recorded in `project.json`. Beware files with the same name that are
   different songs or different mixes; check the hash, not the name.
3. **Timing comes from ElevenLabs forced alignment** (`lj align`), not from Lyric
   Lock. Lyric Lock's aligner, Meta's MMS_FA, is licensed for non-commercial use
   only (CC-BY-NC 4.0), and its runs are not reproducible. Timing moves only on
   Adem's ear or another recorded reason: every change goes in
   `alignment/corrections.json` with its evidence. See `references/timing.md`.
4. **The landing rule.** Every word is fully arrived 40 ms before its sung onset.
   A word's entrance may use most of the gap behind it, never more. The glow is off
   while a word arrives and peaks on the syllable. The engine enforces all three;
   do not work around them.
5. **Every sung word passes `lj check` at its onset.** At that moment it must be
   arrived, in frame, at least 22 px at cap height, facing the camera, unoccluded,
   not fogged, not under a veil, and not overlapping another line. Every sung word
   must also be carried by exactly one lockup. **The check is the floor, not the
   bar.** It cannot see contrast: pale words on a pale ground fail by eye. Look at
   the stills.
6. **The treatment needs Adem's OK** before the world is built. His eye is the
   final acceptance; a passing check is not.
7. **Self-contained.** Procedural, no network at runtime, and no downloaded art.
   three.js r185 is vendored (MIT). Fonts are the system's Didot, used and not
   redistributed.
8. **No Chinese-origin AI models or products** anywhere in the pipeline (no Qwen,
   DeepSeek, Yi, GLM, and the like). **No non-commercial-licence ML** either: Adem's
   lyric tools are meant for commercial use.
9. **Privacy.** Never put Adem's personal details (employer, location, contact
   details) into a film, a page or a public repository. Uploading a master to
   ElevenLabs sends his unreleased music to a third party: do it only for a song he
   has cleared for upload.
10. **Report faithfully.** Say what was verified and how (the check, the stills,
    the render's decode and sync), and say plainly what was not (his ear, his eye,
    anything you could not see).

## The tool

`scripts/lj` runs everything. Put it on the PATH, or call it by its full path.

| command | what it does | time |
|---|---|---|
| `lj doctor` | what this machine has and lacks | 2 s |
| `lj new DIR --song FILE --lyrics FILE --title T` | a project: the master, the sheet, the song's drive data, the engine and the starter place | 2 s |
| `lj align DIR [--response FILE]` | timing from ElevenLabs forced alignment, mapped onto the sheet | 1 s plus the upload |
| `lj timing-check DIR [--final]` | `timing.json` against the sheet and the song | 1 s |
| `lj earcheck DIR [PROMPTS.json]` | the ear-check cut: karaoke over black, with numbered LISTEN prompts | 5–20 s |
| `lj fix DIR` | re-applies `alignment/corrections.json` to the machine timing | 1 s |
| `lj check DIR [--json]` | legibility of every sung word at its onset | 15–40 s |
| `lj stills DIR [TIMES]` | lossless stills; with no times, one per place (`LINES=1` adds every line's first onset) | 2 s each |
| `lj play DIR` | serves the live page at `http://localhost:8765/journey/index.html` | — |
| `lj render DIR [--final]` | the MP4; `--final` encodes at 40 Mb/s, for the grain | ~7 min for 2:35 |
| `lj verify DIR [MP4]` | full decode, sound against the master, SHA-256 | 30 s |
| `lj selftest` | a synthetic song through every step | 30 s |

Run `lj doctor` first on a new machine, and `lj selftest` before and after you
change the engine or the scripts.

## The workflow

### 1. Lock the brief

Find out which song, and fix the exact files:
- **The master.** Get the path from Adem and record its SHA-256. If several files
  share the name, ask; never guess.
- **The sheet.** His own lyric sheet, unedited. If the folder has none, search his
  lyric-tool trees for it before asking (Spotlight, `mdfind`, helps). Never
  transcribe a sheet yourself and present it as his.
- **The deliverables.** Usually a full-song MP4 and the live, scrubbable page.

Write `journey/BRIEF.md`: must achieve (in his words, quoted and dated), must
preserve or avoid, the open choices you will invent, and the acceptance evidence.
The layout is in `references/craft.md`.

### 2. Start the project

```bash
lj new ~/Desktop/ARSENAL/remixes/<song-slug> --song "<master.wav>" --lyrics "<sheet.txt>" --title "<Title>"
```

Adem's lyric films so far live in `~/Desktop/ARSENAL/remixes/<song>/`. Follow
ARSENAL's own `AGENTS.md` when working there.

### 3. Time it

```bash
lj align DIR                     # or: lj align DIR --response saved-reply.json
lj timing-check DIR
lj earcheck DIR                  # DIR/<slug>-timing-check.mp4, for Adem's ear
```

- **The request to ElevenLabs is not wired yet.** `request_alignment()` in
  `scripts/align_elevenlabs.py` documents exactly what to send, what comes back,
  and the rules for wiring it. Everything after the reply is built and tested.
  Until it is wired, `--response` converts a reply saved to disk.
- **The aligner's words are only a source of times.** The converter maps them onto
  the sheet. A sheet word that the reply missed, merged with its neighbour, or only
  partly matched goes on the `needs_review` list.
- **Adem's ear decides.** Send him the ear-check cut. Its prompts come from the
  `needs_review` list, or from your own `alignment/earcheck_prompts.json` (put
  real questions there, numbered, with the times). His answers become entries in
  `alignment/corrections.json`, each one with its evidence. Then:

```bash
lj fix DIR
lj timing-check DIR --final      # refuses while any word still needs review
```

The places can be built while his ear is pending, because placements follow the
sung words. Re-run `lj check` after any timing change.

### 4. Write the treatment, and get Adem's OK

Read the sheet for its ideas, and listen to the song's shape (the intro, the verses,
the loud chorus, the break, the outro). `assets/drive.json` gives the level and the
onsets. Then write `journey/TREATMENT.md`:
- **One world**, and the idea that joins the song's ideas. BDT's is a desert that
  remembers the sea. Made Well's is kintsugi: a thing made, broken, and mended with
  gold.
- **The places, in song order**, each matched to its section and with its lines
  named.
- **The planes change.** Through glass, water, a tear, a frame or a shaft, the
  camera's up turns over, so one place's floor becomes the next one's wall.
- **Words sit on whatever plane the place offers,** and each arrival belongs to the
  craft of its place (cut, stamped, written, condensed, welled up).
- **Light and colour,** with one full saturation reserved for one thing (BDT's
  amber for light and tea; Made Well's gold for the mending).
- **The camera:** slow glides while a line is read, fast flight between lines, and
  holds only where the music holds.

Show it to Adem. Build nothing until he approves it.

### 5. Build the places by hand

One file per place in `journey/src/zones/`, listed in order in `zones/index.js`;
delete the starter from that list once your first place exists. A place is:

```js
export function workshop(ctx) {
  const group = new THREE.Group();              // its world
  const track = new Track([ /* keys {t, p, l, fov, roll, up, hold, cut} */ ]);
  const L1 = new Lockup(ctx.line('L1'), '_so ^well / ~made').fx('write', [0, 0, 0, 0], 0.3);
  place(L1, track, 6.2, { dist: 40, dy: 0.1, fill: 0.4 });  // set where the camera looks at 6.2 s
  group.add(L1.group);
  return { name: 'the workshop', t0: 0, t1: 16.9, group, track, lockups: [L1],
           env(t, c) { env(c, E); }, update(t, c) {}, post(t, P) {} };
}
```

The API (Track, Lockup and its markup, `place()`, the arrivals, `sequence()`,
materials and grit profiles, the sky and fog environment, the music drive, the
post settings) is in `references/engine.md`. `examples/` has both finished films'
places, to read for patterns: copy a technique, not a place.

For each place:
1. Block the camera first: the keys, timed to the lines.
2. Place each line where the camera looks when the line is read (`place()`, camera
   first), with hand-written markup: large nouns (`^`), small italic function words
   (`_`), rows split by meaning.
3. Choose each line's arrival from the place's craft.
4. Build the world around the camera's path, then the light (`env`) and the grade
   (`post`).
5. Run `lj check DIR` and fix every failure in the camera or the placement, never in
   the timing.
6. Look: `lj stills DIR <times>`. Judge contrast, crowding, scale and the grit by
   eye. `references/lessons.md` lists the failures that cost iterations before.

Transitions between places happen only under a medium that covers the frame: light,
fog, smoke, steam, glass, water, a film frame, gold, dark. A camera key with
`cut: true` starts a new path there.

### 6. Review

- **Stills** at every place, at every line's onset (`LINES=1 lj stills DIR`), and
  at each transition.
- **The live page:** `lj play DIR`, then watch it in Safari or Chrome with the sound
  on. `?debug` shows the time, the place and the camera.
- **Your own hostile pass** before Adem sees it. Are any words pale on pale, crowded,
  cropped, or lost in grain? Does any place look like plain CGI? Do the transitions
  happen without a medium? Do the moves fight the music?

### 7. Render and verify

```bash
lj render DIR --final            # DIR/<slug>-journey.mp4, frames in journey/evidence/
lj verify DIR                    # decode, sound against the master, SHA-256
```

A test render takes `START`, `FRAME_LIMIT` and `FLAGS` from the environment (for
example `START=60 FRAME_LIMIT=150 FLAGS=grit=1 lj render DIR`); then verify it with
`START=60 lj verify DIR --partial`.

### 8. Deliver

- **`journey/README.md`**, as Made Well's: status; what it is (a table of places,
  times and lines); how the words behave; the grit; verification (check, render,
  verify, with numbers); rough edges; claim boundary; inputs and timing; how to
  reproduce.
- **To Adem:** the MP4 path, a contact sheet of stills, and the open questions,
  including the ear-check if his answers are still pending.
- **After his approval,** clone the final into `~/Desktop/FINAL VIDEOS` with
  `cp -c`, and add it to that folder's `INDEX.md`.

## Where things are

```
SKILL.md                 this file
references/engine.md     the engine API: places, camera, words, materials, grit, post, the check
references/timing.md     the timing contract, ElevenLabs, corrections, the ear-check
references/craft.md      the house style, and the brief and treatment layouts
references/lessons.md    what cost iterations before, so it does not again
references/worked-examples.md   Basic Diamond Thoughts and Made Well: where, what, numbers
template/journey/        the engine, copied into every project by lj new
examples/                the places of both finished films, for study
scripts/lj               the tool; scripts/*.py are its steps
agents/                  pointers for other agents (Grok Bot, Codex)
```

A project made by `lj new`:

```
assets/song.wav          the master, byte for byte
assets/drive.json        the song as data: 32 bands, level, flux, onsets at 30 fps
lyrics.txt               the sheet, byte for byte
project.json             sources, hashes, the skill commit
alignment/               the aligner's raw reply, the machine timing, corrections, prompts
timing.json              what the engine reads (machine timing plus corrections)
journey/                 the page, the engine, the places, check, render and stills
<slug>-journey.mp4       the film
<slug>-timing-check.mp4  the ear-check cut
```
