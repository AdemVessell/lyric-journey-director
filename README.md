# lyric-journey-director

A shared agent skill for Adem's lyric journey films. The camera travels through
one hand-built, impossible three.js world, and every sung line is a place it
passes through. The words are timed to the voice and checked legible at every
sung onset, and the film is finished with heavy analogue grit and rendered
offline to a 1080p MP4.

- **`SKILL.md`** is the entry point: the hard rules and the workflow.
- **`references/`** holds:
  - the engine API;
  - the timing contract (ElevenLabs forced alignment, corrections, the
    ear-check);
  - the house style;
  - the lessons;
  - the two worked examples.
- **`template/journey/`** is the engine, which `lj new` copies into every project.
- **`examples/`** holds the places of Basic Diamond Thoughts and Made Well.
- **`scripts/lj`** is the tool: `lj doctor`, then `lj selftest`.

One copy, linked into Claude Code, Codex and Cursor (`~/.claude/skills`,
`~/.codex/skills`, `~/.cursor/skills`). Grok Bot reads `agents/grok-bot.md`, a
pointer to this folder.
