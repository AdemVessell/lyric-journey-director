import { night } from './night.js';
import { coast } from './coast.js';
import { sea } from './sea.js';
import { skyzone } from './skyzone.js';
import { depths } from './depths.js';
import { wind } from './wind.js';
import { flight } from './flight.js';
import { salt } from './salt.js';
import { estates } from './estates.js';
import { finale } from './finale.js';
// The whole film, in order. Each place owns its span; cuts between places happen
// only under a transition medium (fog, glass, water, a tear, light, a fold).
export function zones(ctx) {
  const L = ctx.line;
  return [
    night(ctx), coast(ctx), sea(ctx), skyzone(ctx),
    depths(ctx, { t0: 80.3, t1: 88.4, lines: [L('L9'), L('L10')] }),
    wind(ctx, { t0: 88.4, t1: 98.4, lines: ['L11', 'L12', 'L13', 'L14', 'L15', 'L16'].map(L) }),
    flight(ctx), salt(ctx), estates(ctx),
    depths(ctx, { t0: 153.1, t1: 161.2, lines: [L('L23'), L('L24')], variant: 'crystal' }),
    wind(ctx, { t0: 161.2, t1: 171.5, lines: ['L25', 'L26', 'L27', 'L28', 'L29', 'L30'].map(L), variant: 'petals' }),
    finale(ctx),
  ];
}
