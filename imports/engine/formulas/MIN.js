import { defineFormula } from './definition.js';

export default defineFormula({
  name: 'MIN',
  signature: 'MIN(value1, value2, ...)',
  summary: 'Returns the lowest numeric value from the inputs.',
  examples: ['`=MIN(A1:A10, B1)`'],
  execute: ({ args, helpers }) => {
    const values = helpers.flattenValues(args).map((value) => helpers.toNumber(value));
    return values.length ? Math.min.apply(null, values) : 0;
  },
});
