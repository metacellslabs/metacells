import { defineFormula } from './definition.js';

export default defineFormula({
  name: 'COUNTIF',
  signature: 'COUNTIF(range, criteria)',
  summary:
    'Counts values in a range that match a criteria string like ">5" or "Pro".',
  examples: ['`=COUNTIF(A1:A10, ">5")`'],
  execute: ({ args, helpers }) => {
    const values = helpers.flattenValues([args[0]]);
    const criteria = args[1];
    let count = 0;

    for (let i = 0; i < values.length; i += 1) {
      if (helpers.matchesCriteria(values[i], criteria)) {
        count += 1;
      }
    }

    return count;
  },
});
