import { defineFormula } from './definition.js';

export default defineFormula({
  name: 'LEN',
  signature: 'LEN(value)',
  summary: 'Returns the length of a text value.',
  examples: ['`=LEN(@idea)`'],
  execute: ({ args, helpers }) => {
    return String(helpers.firstScalar(args[0]) || '').length;
  },
});
