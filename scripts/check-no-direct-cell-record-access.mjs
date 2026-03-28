import path from 'node:path';
import {
  printViolationsAndExit,
  readLines,
  relativeFile,
  resolveFiles,
  rootDir,
} from './guard-utils.mjs';

const scanRoots = ['imports/api'];
const allowedFiles = new Set([
  path.join(rootDir, 'imports/api/sheets/cell-record-helpers.js'),
  path.join(rootDir, 'imports/api/sheets/workbook-codec.js'),
  path.join(rootDir, 'imports/api/artifacts/index.js'),
  path.join(rootDir, 'imports/api/sheets/server/compute.js'),
]);

const patterns = [
  /\bcell\.source\b/g,
  /\bcell\.value\b/g,
  /\bcell\.displayValue\b/g,
  /\bcell\.state\b/g,
  /\bcell\.error\b/g,
  /\bcell\.generatedBy\b/g,
];

const violations = [];

for (const file of resolveFiles(scanRoots)) {
  if (allowedFiles.has(file)) continue;
  const lines = readLines(file);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      if (!pattern.test(line)) continue;
      violations.push(`${relativeFile(file)}:${index + 1}: ${line.trim()}`);
      break;
    }
  }
}

printViolationsAndExit(
  'Direct cell record property access found outside approved facade/helper files',
  violations,
  'No direct cell record property access found outside approved facade/helper files.',
);
