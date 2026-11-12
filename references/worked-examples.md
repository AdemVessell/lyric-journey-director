# Worked examples

Two finished films define the style. Their projects are on Adem's Mac, in
ARSENAL. Their places are copied into this skill's `examples/`, to read for
patterns.

## Basic Diamond Thoughts (2026-10-28 to 2026-10-29): the original

- **Project:** `~/Desktop/ARSENAL/remixes/basic-diamond-thoughts/journey/`. Its
  `README.md`, `BRIEF.md` and `TREATMENT.md` are the model documents. The film is
  `../Basic-Diamond-Thoughts-journey.mp4`.
- **Adem's verdict:** "for now that video is done". He loves the movements, the
  direction and the effects, and that style carries over. His critique was "a bit
  too plain cgi" in places, so the next films have more detail, more grit and a more
  analogue look.
- **The journey:**
  1. the night sea and the title;
  2. the coast, with the whale;
  3. dunes of dispersive diamond;
  4. a hall of monoliths;
  5. a glass wall in the desert;
  6. beneath the ships;
  7. the sky: skywriting, a braid of cords, a plain of cloth;
  8. down a shaft;
  9. mountains in a hard wind;
  10. the long instrumental flight, through a raymarched cloud sea;
  11. the salt flat, with its train and tea lake;
  12. the buried estates;
  13. the shaft again, now crystal;
  14. the mountains again, now petals;
  15. the blooming whale.
- **Numbers:**
  - 114 sung words. The first check failed 42; the final check passes, with a
    minimum cap height of 24 px and a median of 97 px.
  - The render: 5,732 frames, 191.07 s, 16.6 Mb/s, 402 MB. It took 11.5 min on
    the M1 Max, at a mean of 16.1 blur samples per frame.
  - Audio lag 0.00 ms (r 0.9996).
- **What to study in `examples/basic-diamond-thoughts-places/`:**
  - `night.js`: the title gathering out of fog, a launch on a hit of the music, a
    skim at up to 60 m/s, and a fog wall as the medium.
  - `coast.js`, with `whale.js`, has five beats in one place:
    - a hero object with a line on its flank;
    - the diamond dunes;
    - the colonnade's banners;
    - the window, its line written in the fog on the glass.
  - `sea.js`: the plane change through the window. The sea's surface is a ceiling,
    with Snell's window overhead, and the line gathers beneath it like a school.
  - `skyzone.js`: skywriting (`write`), strokes that become a braid of cords while
    the camera rolls a full turn, and a tear in cloth as the medium.
  - `depths.js`: a vertical dive with one word per depth. The camera pitches up so
    the floor of the dive becomes a wall. It has a `crystal` variant.
  - `wind.js`: a line riding the leaf stream ahead of a fast camera, and the chorus
    singles as world events. It has a `petals` variant.
  - `flight.js`: the long wordless flight through `clouds.js`, inverted, then diving
    on the break's three hits.
  - `salt.js`: a line painted on a moving train carriage, a line floating on the tea
    lake, and a line running down the sticks. A night place with a gentler grade.
  - `estates.js`: a line rising out of sand, a line pressed into dough, and a fold of
    dough closing over the camera as the medium.
  - `finale.js`: the return to the motif, with flowers opening in a wave along the
    whale on the loudest passage. Then black on the final hit, and the title.
- **Timing:** Lyric Lock, made in an earlier session (engine
  `torchaudio-mms-fa`). It was not rendered with grit; the grit layer was tested on
  it afterwards (`?grit=1|2`).

## Made Well (2026-10-29): the house style with grit

- **Project:** `~/Desktop/ARSENAL/remixes/made-well/`. The film is
  `Made-Well-journey.mp4`, the ear-check cut is `Made-Well-timing-check.mp4`, and
  the docs are in `journey/`.
- **Status when this skill was written:** built and rendered; not yet seen by Adem.
  His answers to the eight ear-check questions are pending.
- **The journey** (a kintsugi story):
  1. the workshop;
  2. the road and its milestones;
  3. the foundry;
  4. the quench;
  5. the film-frame lakebed;
  6. the well;
  7. the night foundry;
  8. the gold canyon;
  9. the mended vessel among the stars.
- **Numbers:**
  - 123 sung words. The first full check failed 27; the final check passes, with a
    minimum cap height of 22 px and a median of 80 px.
  - The render, at heavy grit: 4,674 frames, 155.80 s, 40.3 Mb/s, 791 MB. It took
    7.4 min, at a mean of 9.1 blur samples per frame.
  - Audio lag 0.00 ms (r 0.9995).
- **What to study in `examples/made-well-places/`:**
  - `mwkit.js`: shared parts.
    - `thrown()` lathes vessels from a profile;
    - gold seams that grow, with coverage anti-aliasing;
    - cracks gold can flood;
    - spark bursts struck on a beat;
    - light shafts and smoke puffs.
  - `workshop.js`: the opening: slatted sun through dust, a wheel the size of a
    plaza, words cut into its turning disc.
  - `road.js`: carved words standing on milestones sized to the lockup. The
    smallest complete place; read it first.
  - `foundry.js`: one place used twice (`variant: 'night'`), hammers on the beat, a
    line set at an arc's look target.
  - `frames.js`: a quarter roll through a film frame, floor-plane lines, gold
    flooding the cracks, dark ink on a pale ground.
  - `well.js`: down a shaft and back up, the terrain cut under the rim, words on the
    water among reflected stars.
  - `quench.js`, `canyon.js` and `vessel.js`: wordless passages, and the ending.
- **Timing:** Lyric Lock, sectioned run 2, plus six corrections grounded in Adem's
  July labels (`alignment/RECEIPTS.md`). `lj timing-check` passes it, with one
  warning: *I* (W77) overlaps *say* by 20 ms.

## Using an example

The places use their own film's line ids and times, so they run only with that
film's `timing.json`. To study one live, use a scratch copy of the project, never
the original:
1. copy the project's `assets/`, `timing.json` and `lyrics.txt`;
2. create the engine with `lj new`, or copy `template/journey`;
3. copy that example's places into `journey/src/zones/`, replacing `index.js`.

Then `lj check` and `lj play` show it working. Copy techniques into a new film,
never places: every film needs its own world.
