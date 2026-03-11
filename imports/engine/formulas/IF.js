import { defineFormula } from './definition.js';

export default defineFormula({
  name: 'IF',
  signature: 'IF(condition, valueIfTrue, valueIfFalse)',
  summary:
    'Returns one value when a condition is truthy and another when it is not.',
  examples: ['`=IF(B1>5, "High", "Low")`'],
  execute: ({ args }) => {
    const condition = args[0];
    const whenTrue = typeof args[1] === 'undefined' ? '' : args[1];
    const whenFalse = typeof args[2] === 'undefined' ? '' : args[2];
    return condition ? whenTrue : whenFalse;
  },
});
