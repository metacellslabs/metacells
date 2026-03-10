import { defineFormula } from "./definition.js";

export default defineFormula({
  name: "INDEX",
  signature: "INDEX(range, rowNumber, [columnNumber])",
  summary: "Returns a value from a range by 1-based row and column index.",
  examples: ["`=INDEX(A1:C10, 2, 3)`"],
  execute: ({ args, helpers }) => {
    const matrix = helpers.toMatrix(args[0]);
    const rowNumber = Math.max(1, Math.floor(helpers.toNumber(args[1] || 1)));
    const columnNumber = Math.max(1, Math.floor(helpers.toNumber(typeof args[2] === "undefined" ? 1 : args[2])));
    return helpers.matrixCell(matrix, rowNumber - 1, columnNumber - 1);
  },
});
