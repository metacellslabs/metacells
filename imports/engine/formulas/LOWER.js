import { defineFormula } from './definition.js';

export default defineFormula({
  name: 'LOWER',
  signature: 'LOWER(text)',
  summary: 'Converts text to lowercase.',
  examples: ['`=LOWER("Growth")`'],
  execute: ({ args, helpers }) =>
    String(helpers.firstScalar(args[0]) == null ? '' : helpers.firstScalar(args[0])).toLowerCase(),
});
