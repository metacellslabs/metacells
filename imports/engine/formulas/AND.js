import { defineFormula } from './definition.js';

export default defineFormula({
  name: 'AND',
  signature: 'AND(value1, value2, ...)',
  summary: 'Returns TRUE when all arguments evaluate to truthy values.',
  examples: ['`=AND(A1>0, B1>0)`'],
  execute: ({ args }) => args.every((value) => !!value),
});
