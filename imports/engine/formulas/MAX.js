import { defineFormula } from './definition.js';

export default defineFormula({
  name: 'MAX',
  signature: 'MAX(value1, value2, ...)',
  summary: 'Returns the highest numeric value from the inputs.',
  examples: ['`=MAX(A1:A10, B1)`'],
  execute: ({ args, helpers }) => {
    const values = helpers.flattenValues(args).map((value) => helpers.toNumber(value));
    return values.length ? Math.max.apply(null, values) : 0;
  },
});
