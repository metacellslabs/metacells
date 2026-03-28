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
  path.join(rootDir, 'imports/api/sheets/sheet-update-helpers.js'),
]);

const violations = [];

for (const file of resolveFiles(scanRoots)) {
  if (allowedFiles.has(file)) continue;
  const lines = readLines(file);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.includes('Sheets.updateAsync(')) continue;
    violations.push(`${relativeFile(file)}:${index + 1}: ${line.trim()}`);
  }
}

printViolationsAndExit(
  'Direct Sheets.updateAsync paths found outside sheet update helpers',
  violations,
  'No direct Sheets.updateAsync paths found outside sheet update helpers.',
);
