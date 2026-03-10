import { defineFormula } from "./definition.js";

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default defineFormula({
  name: "TODAY",
  signature: "TODAY()",
  summary: "Returns today's date in YYYY-MM-DD format.",
  examples: ["`=TODAY()`"],
  execute: () => formatDate(new Date()),
});
