import { defineFormula } from './definition.js';

export default defineFormula({
  name: 'TRIM',
  signature: 'TRIM(value)',
  summary:
    'Removes leading/trailing spaces and collapses repeated internal whitespace.',
  examples: ['`=TRIM("  hello   world  ")`'],
  execute: ({ args, helpers }) => {
    return String(helpers.firstScalar(args[0]) || '')
      .replace(/\s+/g, ' ')
      .trim();
  },
});
