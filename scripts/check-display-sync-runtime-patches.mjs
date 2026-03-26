import {
  printViolationsAndExit,
  relativeFile,
  resolveFiles,
} from './guard-utils.mjs';
import { readFileSync } from 'node:fs';

const scanRoots = [
  'imports/api/sheets',
  'imports/api/sheets/server',
  'imports/ui/metacell/runtime',
];

const allowedMissingDisplayValue = new Set([
  'imports/ui/metacell/runtime/index.js',
  'imports/ui/metacell/runtime/structure-runtime.js',
]);

const violations = [];

for (const file of resolveFiles(scanRoots)) {
  const relativePath = relativeFile(file);
  if (allowedMissingDisplayValue.has(relativePath)) continue;
  const source = readFileSync(file, 'utf8');
  if (!/\bstate\s*:/.test(source)) continue;
  if (!/\bvalue\s*:/.test(source)) continue;
  if (/\bdisplayValue\s*:/.test(source)) continue;
  violations.push(relativePath);
}

printViolationsAndExit(
  'Runtime patch files with value/state updates but no displayValue sync found',
  violations,
  'No runtime patch files with unsynced value/state updates found.',
);
