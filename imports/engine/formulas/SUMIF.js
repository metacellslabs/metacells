import { defineFormula } from './definition.js';

export default defineFormula({
  name: 'SUMIF',
  signature: 'SUMIF(range, criteria, [sumRange])',
  summary:
    'Adds values whose matching range entries satisfy a criteria string like ">5" or "Pro".',
  examples: ['`=SUMIF(A1:A10, ">5")`', '`=SUMIF(A1:A10, "Pro", B1:B10)`'],
  execute: ({ args, helpers }) => {
    const criteriaRange = helpers.flattenValues([args[0]]);
    const criteria = args[1];
    const sumValues =
      typeof args[2] === 'undefined'
        ? criteriaRange
        : helpers.flattenValues([args[2]]);
    let sum = 0;

    for (let i = 0; i < criteriaRange.length; i += 1) {
      if (!helpers.matchesCriteria(criteriaRange[i], criteria)) continue;
      sum += helpers.toNumber(
        typeof sumValues[i] === 'undefined' ? '' : sumValues[i],
      );
    }

    return sum;
  },
});
