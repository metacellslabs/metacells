import path from 'node:path';
import {
  printViolationsAndExit,
  readLines,
  relativeFile,
  resolveFiles,
  rootDir,
} from './guard-utils.mjs';

const scanRoots = ['imports'];
const allowedFiles = new Set([
  path.join(rootDir, 'imports/engine/workbook-storage-adapter.js'),
  path.join(rootDir, 'imports/api/sheets/workbook-codec.js'),
  path.join(rootDir, 'imports/api/sheets/cell-record-helpers.js'),
]);

const mutationPatterns = [
  /\bcell\.(?:source|value|displayValue|state|error|generatedBy|computedVersion|dependencyVersion|dependencySignature)\s*=/g,
  /\bsheet\.cells\[[^\]]+\]\s*=(?!=)/g,
  /\bdelete\s+sheet\.cells\[[^\]]+\]/g,
];

const violations = [];

for (const file of resolveFiles(scanRoots)) {
  if (allowedFiles.has(file)) continue;
  const lines = readLines(file);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const pattern of mutationPatterns) {
      pattern.lastIndex = 0;
      if (!pattern.test(line)) continue;
      violations.push(`${relativeFile(file)}:${index + 1}: ${line.trim()}`);
      break;
    }
  }
}

printViolationsAndExit(
  'Direct cell mutations found outside allowed low-level files',
  violations,
  'No forbidden direct cell mutations found.',
);
