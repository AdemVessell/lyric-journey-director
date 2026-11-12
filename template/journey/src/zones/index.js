import { starter } from './starter.js';
// The whole film, in order. Each place owns its span [t0, t1); cuts between places
// happen only under a medium (light, smoke, steam, a film frame, dark).
// A new project starts with one placeholder place over the whole song. Replace it
// with the treatment's places (SKILL.md, step 5); examples/ holds a finished film's.
export function zones(ctx) {
  return [starter(ctx, { title: ctx.title })];
}
