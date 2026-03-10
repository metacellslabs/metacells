import { defineFormula } from "./definition.js";

export default defineFormula({
  name: "XLOOKUP",
  signature: "XLOOKUP(lookupValue, lookupRange, returnRange, [ifNotFound])",
  summary: "Looks for a value in one range and returns the aligned value from another range.",
  examples: ["`=XLOOKUP(A2, B2:B10, C2:C10, \"Missing\")`"],
  execute: ({ args, helpers }) => {
    const lookupValue = helpers.firstScalar(args[0]);
    const lookupValues = helpers.flattenValues([args[1]]);
    const returnValues = helpers.flattenValues([args[2]]);
    const fallback = typeof args[3] === "undefined" ? "" : args[3];

    for (let i = 0; i < lookupValues.length; i += 1) {
      if (String(lookupValues[i]) === String(lookupValue)) {
        return typeof returnValues[i] === "undefined" ? "" : returnValues[i];
      }
    }

    return fallback;
  },
});
