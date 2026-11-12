# Timing

Every word must be fully arrived 40 ms before its sung onset and glow on the
syllable, so the film is only as good as its word times. This file covers:
- where those times come from;
- how they are checked;
- how Adem's ear corrects them.

## The doctrine

- **Display at the sung onset, with zero lead.** An earlier rule applied a −239 ms
  "display lead". It was retired on 2026-07-19, because it came from Adem's own
  anticipation when tapping along to songs he knows, not from what reads best. The
  engine's 40 ms landing rule is the only offset.
- **The sheet is the text.** Times attach to the sheet's words. The aligner's
  spelling, tokens and punctuation never reach the screen.
- **Adem's ear is the authority.** No aligner is right everywhere. Melisma,
  ad-libs, backing vocals and vocalises not on the sheet are where they fail. Ask
  him about those passages, with the times.
- **Every change is on record.** The machine's timing is kept as it came, and each
  correction is listed with its evidence. Anyone can see which times are the
  machine's and which are his.

## The flow

```
assets/song.wav + lyrics.txt
  → lj align       → alignment/elevenlabs_response.json   the reply, byte for byte
                   → alignment/timing.machine.json        the reply mapped onto the sheet
                   → timing.json                          plus alignment/corrections.json
  → lj timing-check                                       against the sheet and the song
  → lj earcheck    → <slug>-timing-check.mp4              for Adem's ear
  → his answers    → alignment/corrections.json
  → lj fix         → timing.json
  → lj timing-check --final                               nothing left to review
```

## `timing.json`: the contract

The engine reads `lines[].id`, `lines[].text`, and `words[].text`, `start`, `end`
and `line_id`. Everything else is a receipt.

```json
{
 "schema": "arkhe.lyric_journey.timing/v1",
 "audio":  {"path": "assets/song.wav", "sha256": "…", "duration_s": 155.79},
 "lyrics": {"path": "lyrics.txt", "sha256": "…", "n_lines": 30, "n_words": 123},
 "source": {"aligner": "elevenlabs/forced-alignment", "reply": "alignment/elevenlabs_response.json",
            "reply_sha256": "…", "reply_loss": 0.21, "converter": "scripts/align_elevenlabs.py",
            "converted_utc": "…"},
 "lines": [{"id": "L0", "text": "made well", "section": "verse_1", "start": 3.921, "end": 5.064}],
 "words": [{"id": "W0", "text": "made", "line_id": "L0", "section": "verse_1",
            "start": 3.921, "end": 4.341, "loss": 0.12, "coverage": 1.0, "source": "aligned"}],
 "needs_review": [{"word_id": "W4", "text": "own", "line_id": "L0", "start": 6.7,
                   "reason": "not aligned; placed evenly in the gap around it"}],
 "manual_corrections": [{"word_id": "W9", "text": "more", "line_id": "L3", "kind": "moved",
                         "from": [11.98, 12.3], "to": [11.68, 12.3], "evidence": "Adem's ear, question 2"}],
 "end_trims": [],
 "corrections_file": "alignment/corrections.json"
}
```

- **Ids follow the sheet.** Lines are `L0`, `L1`… in sung order, and words `W0`,
  `W1`…. Sections come from the labels: the second `[Verse]` is `verse_2`.
- **Times** are seconds from the start of the master, to the millisecond.
- **Word fields:**
  - `source` is `aligned`, `split`, `interpolated`, or any of those plus `+manual`.
  - `coverage` is the share of the word's letters the aligner matched.
  - `loss` is the aligner's own loss for its word. Its scale is ElevenLabs'; higher
    is worse.
- **Older timings stay valid.** Made Well's and BDT's timings came from Lyric Lock,
  with other receipt fields. They still satisfy the contract, and
  `lj timing-check` reads them.

## The sheet (`scripts/sheet.py`)

- One sung line per text line.
- A line in square brackets is a section label; a line starting with `#` is a
  note; blank lines are ignored.
- Words are split on whitespace and kept exactly: `(On my way)` is the three words
  `(On`, `my` and `way)`.

## ElevenLabs Forced Alignment (`lj align`)

Adem chose it on 2026-11-12, replacing Lyric Lock for timing ("instead of lyric
lock we need to use ElevenLabs forced alignment").

**Status: the conversion is built and tested; the request is not wired.**
`request_alignment()` in `scripts/align_elevenlabs.py` raises until a bot writes
it. Its docstring is the contract:
- **Endpoint:** `POST https://api.elevenlabs.io/v1/forced-alignment`, as
  multipart form data.
  - `file`: the audio, required; under 1 GB.
  - `text`: the transcript, required.
  - Regional hosts also exist.
- **Reply:** `{"characters": [{"text", "start", "end"}], "words": [{"text", "start", "end", "loss"}], "loss": …}`,
  with times in seconds. A 422 reply carries `detail` errors.
- **Not on the API page; verify before relying on them:**
  - the auth header (probably `xi-api-key`);
  - limits on duration and language;
  - pricing and data retention;
  - whether uploads may be used for training;
  - the commercial terms for the output.
- **Rules for the wiring:**
  - the key comes from `ELEVENLABS_API_KEY` and is never written down;
  - upload only a song Adem has cleared for upload;
  - save the raw reply before parsing it;
  - fail loudly on any error;
  - no silent retries.
- **Text sent:** the sheet's sung lines joined with newlines, with no labels and no
  notes.

Until it is wired, a reply saved by any other means converts with
`lj align DIR --response reply.json`.

### How the reply maps onto the sheet

- **Match letters, not tokens.** Both the sheet and the reply's words are reduced
  to letters and digits, case-folded, and the two letter streams are aligned with
  `difflib`. Each sheet word takes the times of the reply words its letters landed
  in. So it does not matter how the service splits `(Oh-oh-oh-oh)`, whether it keeps
  the parentheses, or how it writes an apostrophe.
- **Flagged for review** (`needs_review`):
  - **merged:** one reply word carries two sheet words. Its span is divided by their
    letter counts.
  - **partial:** under 60% of a word's letters matched.
  - **missing:** a sheet word with no matched letters. It is placed evenly in the
    gap between its aligned neighbours.
  - **out of order:** a word that starts before the word sung before it. It is
    moved just after.
- **Then tidied:** every word lasts at least 50 ms, and each ends before the next
  begins.

`lj selftest` exercises all of this on a fake reply with spaces as words, dropped
parentheses, a straightened apostrophe, a word split in three, two words merged
and one missing. Every aligned word must land on its known onset.

## The check (`lj timing-check`)

**Errors:**
- the words are not the sheet's, exactly and in order (it shows the first
  difference);
- the lines are not the sheet's, or a word sits on the wrong line;
- a time is not a number, a word does not start before it ends, or a word runs past
  the song;
- a word starts before the word sung before it;
- with `--final`, any open review item.

**Warnings:**
- overlaps and 80 ms flashes;
- shared onsets;
- characters outside the default glyph set;
- a song or sheet that changed since the timing was made;
- open review items.

## The ear-check (`lj earcheck`)

- **What it shows:** black picture with the master's audio. Each line is grey and
  its words light white on their onsets, with the next line small below, the
  section name, and a running timecode.
- **Numbered LISTEN prompts** sit over the passages in question. Without a prompts
  file, they are made from `needs_review`, one per cluster of nearby words.
- **Hand-written prompts are better.** Put them in
  `alignment/earcheck_prompts.json`:

  ```json
  [{"t0": 6.4, "t1": 10.9, "text": "1 · Anything sung after 'so well made' that isn't on your sheet?"}]
  ```

  `\N` breaks a prompt's line. Ask about what the machine could not know: words
  not on the sheet, which take of a repeated tag is sung, and wordless vocalises.

## Corrections (`alignment/corrections.json`, applied by `lj fix`)

```json
[
 {"word_id": "W4", "text": "made", "start": 6.66, "evidence": "Adem's ear, ear-check question 1, 2026-11-12"},
 {"word_id": "W9", "text": "more", "confirm": true, "evidence": "Adem: lands as it is"}
]
```

- `start` and/or `end` move a word; `confirm` keeps it as it is. Either way the word
  leaves `needs_review`.
- `text` is optional. When given it must match, so a correction cannot land on the
  wrong word.
- `evidence` is required.
- After corrections, any end that overruns the next word's start is trimmed, and the
  trim is listed in `end_trims`. Nothing else moves.

## Why not Lyric Lock

Lyric Lock (Adem's own tool, `~/Desktop/arkhe-lyric-lock`) timed both finished
films. Two of its findings decided the switch:
1. **Its aligner is non-commercial.** It uses Meta's MMS_FA weights, licensed
   CC-BY-NC 4.0. Adem means his lyric tools to be commercial.
2. **It is not reproducible.** It calls Demucs with its default `--shifts 1`, an
   unseeded random offset, so every run separates a slightly different vocal stem.
   On an identical command, the median word moved 0 ms, but contested words moved
   up to 3.16 s.

   The fix, not applied because it is his tool to change: pass `--shifts 0`, and
   record the stem's hash.

What it taught still holds, and still applies to any aligner:
- **A single pass can collapse** on a song whose sheet does not cover every sung
  sound. It smears words across vocalises rather than leaving holes, and smear
  looks like coverage. Lyric Lock aligned per section to stop this. With ElevenLabs,
  watch for a word stretched over seconds, and ask Adem about every passage the
  sheet leaves out.
- **Melisma and held words** are where onsets are least reliable. Flash function
  words (80–120 ms) are easy to miss by ear.
- **Timing that came from Lyric Lock:** Made Well's, BDT's and Out From Within's.
  Whether timing made by a CC-BY-NC model can go into commercial releases is a
  licensing question. The handoff
  `~/Desktop/Arkhē Claude Lab/99_WORKING/LYRIC_LOCK_USAGE_HANDOFF_20261030.md`
  records the facts.
