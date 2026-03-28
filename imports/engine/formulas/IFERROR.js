import { defineFormula } from './definition.js';

function isErrorLike(value) {
  if (value instanceof Error) return true;
  if (typeof value !== 'string') return false;
  return value.trim().charAt(0) === '#';
}

export default defineFormula({
  name: 'IFERROR',
  signature: 'IFERROR(value, fallback)',
  summary: 'Returns fallback when value resolves to an error-like result.',
  examples: ['`=IFERROR(VLOOKUP("x", A1:B10, 2), "Missing")`'],
  execute: ({ args }) => {
    const value = typeof args[0] === 'undefined' ? '' : args[0];
    const fallback = typeof args[1] === 'undefined' ? '' : args[1];
    return isErrorLike(value) ? fallback : value;
  },
});
