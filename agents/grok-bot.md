---
name: lyric-journey-director
description: Direct and build Adem's lyric journey films - a three.js camera journey through one hand-built impossible world, every sung line a place we pass through, timed by ElevenLabs forced alignment and checked legible at every sung onset, with heavy analogue grit. The skill and its engine live on Adem's Mac; read them and run them there with your local tools. Use when planning, timing, building, checking, rendering or reviewing a lyric video in this style.
---

# Lyric Journey Director (pointer for the Grok Bot box)

The real skill is on Adem's Mac, not in this box:

    ~/Desktop/Arkhē Claude Lab/SKILLS/lyric-journey-director/

It is one shared git repository; Claude Code, Codex and Cursor load the same folder.
The masters, the lyric sheets, Chrome, ffmpeg and the fonts are all on the Mac, so
the work happens there.

1. With your local tools, read `SKILL.md` in that folder, then the references it
   names: `references/craft.md` for the style, `references/engine.md` for the
   engine, `references/timing.md` for the timing.
2. Run everything on the Mac through `scripts/lj` in that folder. Start with
   `lj doctor`, then `lj new`, `lj align`, `lj timing-check`, `lj earcheck`,
   `lj check`, `lj stills`, `lj render` and `lj verify`. A full render of a 2–3
   minute song takes 7–12 minutes; let each command finish.
3. The places of each film are built by hand from a treatment that Adem approves.
   Never ship the starter place, and never generate a film automatically.
4. Timing comes from ElevenLabs forced alignment. If the request in
   `scripts/align_elevenlabs.py` is still a stub, wiring it is a task of its own:
   follow the contract in `request_alignment()`'s docstring exactly. Only upload a
   master that Adem has cleared for upload.
5. If you change the engine or the scripts, run `lj selftest` before and after,
   then commit in that folder with a message saying what changed and why. Push
   only with Adem's go-ahead.

If the Mac is unreachable, say so. Do not rebuild the engine in this box.
