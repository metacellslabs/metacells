function isNumberLike(value) {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (!text) return false;
  return Number.isFinite(Number(text));
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return 0;
    const numeric = Number(text);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return 0;
}

function parseCsv(text) {
  const input = String(text == null ? "" : text);
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input.charAt(i);
    const next = input.charAt(i + 1);

    if (inQuotes) {
      if (ch === "\"" && next === "\"") {
        cell += "\"";
        i += 1;
        continue;
      }
      if (ch === "\"") {
        inQuotes = false;
        continue;
      }
      cell += ch;
      continue;
    }

    if (ch === "\"") {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (ch === "\r") {
      continue;
    }
    cell += ch;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function normalizeScalar(value) {
  if (value == null) return "";
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

function toMatrix(value) {
  if (Array.isArray(value)) {
    if (!value.length) return [];
    if (Array.isArray(value[0])) {
      return value.map((row) => row.map(normalizeScalar));
    }
    return [value.map(normalizeScalar)];
  }

  if (value == null) return [[""]];

  if (typeof value === "string") {
    const text = value;
    if (text.indexOf("\n") !== -1 || text.indexOf(",") !== -1 || text.indexOf("\"") !== -1) {
      return parseCsv(text);
    }
    return [[text]];
  }

  return [[normalizeScalar(value)]];
}

function flattenValues(values) {
  if (!Array.isArray(values)) return [];
  const out = [];

  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    const matrix = toMatrix(value);
    for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
      for (let colIndex = 0; colIndex < matrix[rowIndex].length; colIndex += 1) {
        out.push(matrix[rowIndex][colIndex]);
      }
    }
  }

  return out;
}

function firstScalar(value) {
  const matrix = toMatrix(value);
  if (!matrix.length || !matrix[0].length) return "";
  return matrix[0][0];
}

function isBlank(value) {
  return value == null || String(value).trim() === "";
}

function matchesCriteria(candidate, criteria) {
  const rawCriteria = firstScalar(criteria);
  const text = String(rawCriteria == null ? "" : rawCriteria).trim();
  const candidateValue = normalizeScalar(candidate);

  if (!text) return isBlank(candidateValue);

  const match = /^(<=|>=|<>|=|<|>)(.*)$/.exec(text);
  const operator = match ? match[1] : "=";
  const operandText = match ? String(match[2] || "").trim() : text;

  const candidateNumeric = isNumberLike(candidateValue);
  const operandNumeric = isNumberLike(operandText);

  const left = candidateNumeric && operandNumeric ? Number(candidateValue) : String(candidateValue);
  const right = candidateNumeric && operandNumeric ? Number(operandText) : String(operandText);

  switch (operator) {
    case "=":
      return left === right;
    case "<>":
      return left !== right;
    case ">":
      return left > right;
    case "<":
      return left < right;
    case ">=":
      return left >= right;
    case "<=":
      return left <= right;
    default:
      return false;
  }
}

function matrixColumn(matrix, columnIndex) {
  const col = Math.max(0, Number(columnIndex || 0));
  return matrix.map((row) => (Array.isArray(row) && row.length > col ? row[col] : ""));
}

function matrixCell(matrix, rowIndex, columnIndex) {
  const row = Math.max(0, Number(rowIndex || 0));
  const col = Math.max(0, Number(columnIndex || 0));
  if (!Array.isArray(matrix[row])) return "";
  return typeof matrix[row][col] === "undefined" ? "" : matrix[row][col];
}

function escapeCsvCell(value) {
  const text = String(value == null ? "" : value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function matrixToCsv(matrix) {
  const rows = Array.isArray(matrix) ? matrix : [];
  return rows
    .map((row) => (Array.isArray(row) ? row : [row]).map((value) => escapeCsvCell(value)).join(","))
    .join("\n");
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = String(value == null ? "" : value).trim();
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function diffDays(start, end) {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / dayMs);
}

function diffMonths(start, end) {
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) {
    months -= 1;
  }
  return months;
}

function diffYears(start, end) {
  let years = end.getFullYear() - start.getFullYear();
  const endMonth = end.getMonth();
  const startMonth = start.getMonth();
  if (endMonth < startMonth || (endMonth === startMonth && end.getDate() < start.getDate())) {
    years -= 1;
  }
  return years;
}

export const formulaHelpers = {
  toNumber,
  toMatrix,
  flattenValues,
  firstScalar,
  isBlank,
  isNumberLike,
  matchesCriteria,
  matrixColumn,
  matrixCell,
  matrixToCsv,
  parseDate,
  diffDays,
  diffMonths,
  diffYears,
};
