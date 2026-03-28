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
  path.join(rootDir, 'imports/engine/storage-service.js'),
  path.join(rootDir, 'imports/engine/workbook-storage-adapter.js'),
  path.join(rootDir, 'imports/api/sheets/index.js'),
  path.join(rootDir, 'imports/api/sheets/workbook-codec.js'),
  path.join(rootDir, 'imports/api/sheets/cell-record-helpers.js'),
  path.join(rootDir, 'imports/api/sheets/server/compute.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/drag-debug-runtime.js'),
]);

const patterns = [
  /\bsourceVersion\b/g,
  /\bcomputedVersion\b/g,
  /\bdependencyVersion\b/g,
  /\bdependencySignature\b/g,
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
  'Dependency version/signature logic found outside approved dependency-version files',
  violations,
  'No dependency version/signature logic found outside approved dependency-version files.',
);
