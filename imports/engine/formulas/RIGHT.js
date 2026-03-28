import { defineFormula } from './definition.js';

export default defineFormula({
  name: 'RIGHT',
  signature: 'RIGHT(text, [count])',
  summary: 'Returns the rightmost characters from a string.',
  examples: ['`=RIGHT("North America", 7)`'],
  execute: ({ args, helpers }) => {
    const text = String(helpers.firstScalar(args[0]) == null ? '' : helpers.firstScalar(args[0]));
    const count = Math.max(0, Math.floor(helpers.toNumber(typeof args[1] === 'undefined' ? 1 : args[1])));
    return count ? text.slice(-count) : '';
  },
});
