import { defineFormula } from './definition.js';

export default defineFormula({
  name: 'OR',
  signature: 'OR(value1, value2, ...)',
  summary: 'Returns TRUE when any argument evaluates to truthy.',
  examples: ['`=OR(A1>0, B1>0)`'],
  execute: ({ args }) => args.some((value) => !!value),
});
