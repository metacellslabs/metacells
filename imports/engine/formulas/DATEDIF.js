import { defineFormula } from './definition.js';

export default defineFormula({
  name: 'DATEDIF',
  signature: 'DATEDIF(startDate, endDate, unit)',
  summary: 'Returns the difference between two dates using units D, M, or Y.',
  examples: ['`=DATEDIF("2024-01-01", TODAY(), "D")`'],
  execute: ({ args, helpers }) => {
    const start = helpers.parseDate(args[0]);
    const end = helpers.parseDate(args[1]);
    const unit = String(helpers.firstScalar(args[2]) || 'D')
      .trim()
      .toUpperCase();

    if (!start || !end) return 0;

    if (unit === 'Y') return helpers.diffYears(start, end);
    if (unit === 'M') return helpers.diffMonths(start, end);
    return helpers.diffDays(start, end);
  },
});
