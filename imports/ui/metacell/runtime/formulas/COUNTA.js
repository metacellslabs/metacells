import { defineFormula } from "./definition.js";

export default defineFormula({
  name: "COUNTA",
  signature: "COUNTA(value1, value2, ...)",
  summary: "Counts non-empty values.",
  examples: ["`=COUNTA(A1:A20)`"],
  execute: ({ args, helpers }) => {
    return helpers.flattenValues(args).filter((value) => !helpers.isBlank(value)).length;
  },
});
