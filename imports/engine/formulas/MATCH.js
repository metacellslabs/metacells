import { defineFormula } from './definition.js';

export default defineFormula({
  name: 'MATCH',
  signature: 'MATCH(lookupValue, lookupRange, [matchType])',
  summary: 'Returns the 1-based index of a matching value in a range.',
  examples: ['`=MATCH("pro", A2:A4, 0)`'],
  execute: ({ args, helpers }) => {
    const lookupValue = helpers.firstScalar(args[0]);
    const values = helpers.flattenValues([args[1]]);
    const matchType = Math.floor(helpers.toNumber(typeof args[2] === 'undefined' ? 0 : args[2]));

    if (matchType !== 0) return '#N/A';

    for (let i = 0; i < values.length; i += 1) {
      if (String(values[i]) === String(lookupValue)) return i + 1;
    }

    return '#N/A';
  },
});
