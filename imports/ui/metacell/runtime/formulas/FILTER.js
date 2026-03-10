import { defineFormula } from "./definition.js";

export default defineFormula({
  name: "FILTER",
  signature: "FILTER(range, criteriaRange, criteria)",
  summary: "Returns rows from a range whose aligned criteria values match the condition.",
  examples: ["`=FILTER(A1:B10, C1:C10, \"Pro\")`"],
  execute: ({ args, helpers }) => {
    const sourceMatrix = helpers.toMatrix(args[0]);
    const criteriaValues = helpers.flattenValues([args[1]]);
    const criteria = args[2];
    const result = [];

    for (let rowIndex = 0; rowIndex < sourceMatrix.length; rowIndex += 1) {
      if (!helpers.matchesCriteria(criteriaValues[rowIndex], criteria)) continue;
      result.push(sourceMatrix[rowIndex]);
    }

    return helpers.matrixToCsv(result);
  },
});
