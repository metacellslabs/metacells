import { defineFormula } from "./definition.js";

export default defineFormula({
  name: "AVERAGE",
  signature: "AVERAGE(value1, value2, ...)",
  summary: "Returns the arithmetic mean of numeric values.",
  examples: ["`=AVERAGE(A1:A10)`"],
  execute: ({ args, helpers }) => {
    const numbers = helpers.flattenValues(args).filter((value) => helpers.isNumberLike(value)).map((value) => helpers.toNumber(value));
    if (!numbers.length) return 0;
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  },
});
