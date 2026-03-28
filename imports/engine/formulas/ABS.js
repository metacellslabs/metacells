import { defineFormula } from './definition.js';

export default defineFormula({
  name: 'ABS',
  signature: 'ABS(value)',
  summary: 'Returns the absolute value of a number.',
  examples: ['`=ABS(-12)`'],
  execute: ({ args, helpers }) => Math.abs(helpers.toNumber(args[0])),
});
