# The craft: the house style

What Basic Diamond Thoughts and Made Well do, so the next film does it too. Adem's
words on BDT set the bar: "I love the movements, the direction, the effects", and
those carry over "the full style and all to new lyric videos". His one critique, "a
bit too plain cgi", sets the finish: "more details and yet more grit, more
analogue looking".

## The idea

**We are the camera, travelling.** One continuous journey through one impossible
world. Every line is a place we pass through. The words are part of the landscape,
not captions over it. We arrive at each line in time to read it as it is sung,
then leave it behind.

## The world

- **One world with one joining idea.** Read the sheet for its images and its ideas,
  then find the single conceit that holds them together.
  - BDT braids its strange images (a whale, diamond dunes, a fog-covered window,
    ships seen from below) into a desert that remembers the sea.
  - Made Well braids making, breaking and going into kintsugi. A vessel is broken
    and mended with gold, and its gold seams become the road and then the stars.
- **The lyric's own images, made literal and impossible.**
  - A whale on a mirror-wet shore.
  - A potter's wheel the size of a plaza.
  - A glass wall alone in the desert with the sea behind it.
  - A flywheel the size of a hill.

  Scale is the impossibility; the materials stay physical.
- **The places follow the song's shape.**
  - An intro is an approach.
  - The loud chorus is the busiest place: hammers, wind, events.
  - A vocalise or gap is a breath: a quench, steam.
  - An instrumental break is a long flight with no words.
  - The outro returns to the motif, transformed.
- **Choruses return to their place, changed.** Same lines, new state: BDT's shaft
  becomes crystal and its wind carries petals; Made Well's foundry returns at night,
  all gold. `foundry(ctx, { variant: 'night' })` builds both from one file.

## The planes change

The places do not share a ground plane. Through glass, a water surface, a tear in
cloth, a film frame or a shaft, the camera's up turns over, so one place's floor
becomes the next one's wall. Each film needs its own device. So far:
- through a glass wall;
- under the ships;
- a full roll on a braid of cords;
- down a shaft;
- an inverted pass beneath a cloud sea;
- a turning wheel's disc;
- a milestone's face;
- a quarter roll through a film frame;
- down a well and straight up out of it;
- the sky itself.

## Transitions

**Only under a medium,** never a plain cut. The medium covers the frame, the camera
path cuts behind it (`cut: true`), and the next place is revealed. The media used so
far:
- fog, glass, water, a tear, a fold;
- light at a door, smoke, steam;
- a film frame, gold, a fire's glow;
- dark.

Pick the medium from the two places it joins: steam joins the foundry to the quench.

## The camera

- **Continuous travel.** Slow glides while a line is read, fast flight between
  lines, and real motion blur, up to 24 shutter samples.
- **Holds only where the music holds.** A dead stop (`hold: true`) is an event, not a
  rest.
- **Arcs, banks, dives and climbs,** timed to the music. On "far around", Made Well
  pulls out in a long arc round the flywheel.
- **Lines can ride with the camera.** BDT's *carrying the mountain leaves* rides
  ahead of the camera at 78 m/s. It closes slowly, and follows the camera's heading
  0.15 s late, so a turn swings it rather than pinning it to the lens.
- **The camera clears the world.** Paths clear terrain and roofs; a near miss is
  thrilling, a clip-through is a bug.

## The words

- **Lockups.** Each line is set as rows broken by meaning, with a scale per word:
  large nouns (`^`) and small italic function words (`_`). The markup is checked
  against the sheet word for word.
- **On the plane the place offers:**
  - carved in clay or stone;
  - stamped in iron;
  - wiped into the condensation on glass;
  - written across the sky;
  - laid on mud;
  - floating on water among reflected stars.

  A carving gets something to be carved in. Made Well's *on our way* stands on
  milestones sized to the lockup.
- **Arrivals belong to the craft of the place:**

  | the place does | the arrival |
  |---|---|
  | cutting, carving, writing | `write`, behind a bright pen |
  | rising out of clay, gold welling up | `rise` |
  | hammering | `drop`, with a settle |
  | stamping a hallmark | `pop` |
  | steam, night, fog | `condense` |
  | dust, scattering, stars | `assemble` |
  | going round | `orbit` |
  | travel, wind | `streak` or `wind` |
  | film frames | `flip` |
  | unfolding, opening | `unfold` |

- **Singles are events.** BDT's chorus words *Fog · Eats · Light · Blooms* are not
  captions. Fog floods the world, the light is eaten, light returns, and everything
  blooms. Find the song's equivalent and make the world do it.
- **Handover.** Lines read in the same view hand over with `sequence()`: each fades
  as the next begins to arrive.
- **Split a line only where its words are far apart.** A split fades its own first
  word.
- **Contrast by eye.** White words with a dark halo read on dark and mid grounds. On
  a pale ground use dark ink with a pale halo, as Made Well's lakebed does.

## Light and colour

- **A palette per film,** written in the treatment. BDT: pale mineral white,
  charcoal, silver and soft violet. Made Well: clay ochre and terracotta, iron
  black, ember orange, steam white, and blue at night.
- **One full saturation, reserved for one thing.** Diamond dispersion and amber in
  BDT, and gold in Made Well, kept for the mending.
- **Colour from the light.** Gold toward the sun and blue in the shadow, with
  charcoal nearer black.
- **The house grade:** AgX with a punchy look (power 1.28, saturation 1.22).
  - Night places take a gentler look and more exposure.
  - Tried and dropped: a global split-tone, which turned amber purple and lifted
    black to navy, and saturation of 1.3, which turned violet casts purple.

## Grit

Heavy by default; it answers "plain cgi".
- **Materials show it.** Choose materials that carry texture (clay, iron, mud,
  stone, cloth, rust), and give every material a cache key with a grit profile.
- **Dust in the air,** set per place with `dust`: thick in a sunlit workshop, thin
  in a well at night.
- **The film finish:** grain, halation on every ember and highlight, gate weave,
  flicker and soft edges.
- **Readability first.** Look at the smallest word of every place in a full-size
  still.

## The music drives the world

- **Light, embers, smoke and particles** read `assets/drive.json`: `level`,
  `band`, `hits`.
- **Mechanisms keep the beat.** Made Well's hammers strike every two beats of the
  song's 120 bpm, phased from the chorus onsets. Each blow throws sparks and heats
  its ingot.
- **The loudest passage gets the biggest motion.** In BDT it is the outro over the
  blooming whale; in Made Well, the gold canyon.

## Title and end

- **The title belongs to the world.** BDT opens on it over the night sea, before the
  coast; Made Well's treatment had it stamped like a maker's mark into hot clay. A
  title is `fakeLine` text, so the check ignores it.
- **The end returns to the motif, transformed.** The whale in bloom; the mended
  vessel turning among the stars. Then black, then the title.

## The brief (`journey/BRIEF.md`)

```markdown
# Brief lock — <Title>: the journey

Mode: ORIGINAL. A lyric video for Adem's song *<title>*, in the house journey style.

## Must achieve (Adem, <date>)
- The song: "<his words>".
- The style: the camera is a traveller through distinct places; the planes change;
  the words vary in position, scale and placement, with various movement effects.
- Grit at the heavy strength.
- Deliverable: a full-song MP4 and a live, scrubbable page.

## Must preserve / avoid
- The lyric sheet is his own (`../lyrics.txt`, SHA-256 …). No rewriting.
- The audio is the master, untouched (`../assets/song.wav`, … s, SHA-256 …).
- The landing rule, and the glow rule.
- Self-contained: procedural only, no network at runtime, no downloaded art.

## Open choices (invented here)
- The world, its places and their order. The plane-change device.
- The typographic system. Camera choreography, light, palette.

## Acceptance evidence
- `lj check` passes at every sung onset.
- The render decodes clean, and its audio is sample-aligned with the master.
- Stills from every place.
- Adem's ear on the timing; open: Adem's eye.
```

## The treatment (`journey/TREATMENT.md`)

1. **One paragraph:** the journey and its joining idea.
2. **The song's ideas,** and how the journey braids them.
3. **The places,** numbered in song order. For each: its section, what we see, and
   which lines sit where, on what, arriving how.
4. **The planes change:** the list of devices.
5. **The words:** lockups, and arrivals by craft.
6. **Light and colour:** the palette, and the one reserved saturation.
7. **Camera:** travel, cuts only under a medium, and holds only where the music holds.

Keep it to one or two pages. Adem approves it before any place is built.

## Building one place: the checklist

1. Its span `[t0, t1)`, from the treatment and the timing.
2. **The camera keys:** slow through each line's onsets, fast between, a medium at
   each end.
3. **The lines:** markup by hand; `place()` at each line's reading time; the
   arrival from the craft.
4. **The world** around the path: big forms first, then the materials with cache
   keys, then the scatter and the life (`update`).
5. **Light:** an `env` object, and `lerpEnv` for any change within the place.
6. **Grade and transitions** in `post`. The veils stay off the sung words.
7. `lj check` until it passes; fix the camera and the placements, never the timing.
8. Stills at the place's middle and at every line's onset. Fix what you see:
   contrast, crowding, plain surfaces, dead air.
