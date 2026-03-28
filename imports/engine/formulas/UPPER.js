import { defineFormula } from './definition.js';

export default defineFormula({
  name: 'UPPER',
  signature: 'UPPER(text)',
  summary: 'Converts text to uppercase.',
  examples: ['`=UPPER("North America")`'],
  execute: ({ args, helpers }) =>
    String(helpers.firstScalar(args[0]) == null ? '' : helpers.firstScalar(args[0])).toUpperCase(),
});
