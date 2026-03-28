import { defineFormula } from './definition.js';

export default defineFormula({
  name: 'ROUND',
  signature: 'ROUND(value, [digits])',
  summary: 'Rounds a number to the requested decimal places.',
  examples: ['`=ROUND(25.555, 2)`'],
  execute: ({ args, helpers }) => {
    const value = helpers.toNumber(args[0]);
    const digits = Math.max(0, Math.floor(helpers.toNumber(typeof args[1] === 'undefined' ? 0 : args[1])));
    const factor = Math.pow(10, digits);
    return Math.round(value * factor) / factor;
  },
});
