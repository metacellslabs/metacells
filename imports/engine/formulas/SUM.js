import { defineFormula } from './definition.js';

export default defineFormula({
  name: 'SUM',
  signature: 'SUM(value1, value2, ...)',
  summary: 'Adds numbers from cells, ranges, lists, or scalar values.',
  examples: ['`=SUM(A1:A10)`', '`=SUM(A1, B1, 12)`'],
  execute: ({ args, helpers }) => {
    return helpers
      .flattenValues(args)
      .reduce((sum, value) => sum + helpers.toNumber(value), 0);
  },
});
