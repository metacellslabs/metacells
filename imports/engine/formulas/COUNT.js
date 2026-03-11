import { defineFormula } from './definition.js';

export default defineFormula({
  name: 'COUNT',
  signature: 'COUNT(value1, value2, ...)',
  summary: 'Counts numeric values only.',
  examples: ['`=COUNT(A1:A20)`'],
  execute: ({ args, helpers }) => {
    return helpers
      .flattenValues(args)
      .filter((value) => helpers.isNumberLike(value)).length;
  },
});
