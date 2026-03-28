import { defineFormula } from './definition.js';

export default defineFormula({
  name: 'LEFT',
  signature: 'LEFT(text, [count])',
  summary: 'Returns the leftmost characters from a string.',
  examples: ['`=LEFT("North America", 5)`'],
  execute: ({ args, helpers }) => {
    const text = String(helpers.firstScalar(args[0]) == null ? '' : helpers.firstScalar(args[0]));
    const count = Math.max(0, Math.floor(helpers.toNumber(typeof args[1] === 'undefined' ? 1 : args[1])));
    return text.slice(0, count);
  },
});
