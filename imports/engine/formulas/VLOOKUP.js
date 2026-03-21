import { defineFormula } from './definition.js';

export default defineFormula({
  name: 'VLOOKUP',
  signature: 'VLOOKUP(lookupValue, table, columnIndex, [exactMatch])',
  summary:
    'Looks for a value in the first column of a table and returns a value from another column.',
  examples: ['`=VLOOKUP("Pro", A2:C10, 3)`'],
  execute: ({ args, helpers }) => {
    const lookupValue = helpers.firstScalar(args[0]);
    const table = helpers.toMatrix(args[1]);
    const columnIndex = Math.max(1, Math.floor(helpers.toNumber(args[2] || 1)));
    const exactMatch = typeof args[3] === 'undefined' ? true : !!args[3];

    if (!table.length) return '';

    let approximateRow = null;
    for (let i = 0; i < table.length; i += 1) {
      const row = table[i] || [];
      const firstCell = typeof row[0] === 'undefined' ? '' : row[0];
      if (String(firstCell) === String(lookupValue)) {
        return typeof row[columnIndex - 1] === 'undefined'
          ? ''
          : row[columnIndex - 1];
      }
      if (
        !exactMatch &&
        helpers.isNumberLike(firstCell) &&
        helpers.isNumberLike(lookupValue)
      ) {
        if (helpers.toNumber(firstCell) <= helpers.toNumber(lookupValue)) {
          approximateRow = row;
        }
      }
    }

    if (approximateRow) {
      return typeof approximateRow[columnIndex - 1] === 'undefined'
        ? ''
        : approximateRow[columnIndex - 1];
    }
    return '';
  },
});
