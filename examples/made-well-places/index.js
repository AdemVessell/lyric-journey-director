import { workshop } from './workshop.js';
import { road } from './road.js';
import { foundry } from './foundry.js';
import { quench } from './quench.js';
import { frames } from './frames.js';
import { well } from './well.js';
import { canyon } from './canyon.js';
import { vessel } from './vessel.js';
// The whole film, in order. Each place owns its span; cuts between places happen
// only under a medium (light, smoke, steam, a film frame, gold).
export function zones(ctx) {
  const L = ctx.line;
  return [
    workshop(ctx), road(ctx),
    foundry(ctx, { t0: 31.0, t1: 54.2, lines: ['L7', 'L8', 'L9', 'L10', 'L11', 'L12'].map(L) }),
    quench(ctx), frames(ctx), well(ctx),
    foundry(ctx, { t0: 94.6, t1: 118.5, lines: ['L24', 'L25', 'L26', 'L27', 'L28', 'L29'].map(L), variant: 'night', lead: L('L23') }),
    canyon(ctx), vessel(ctx),
  ];
}
