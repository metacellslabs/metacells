import path from 'node:path';
import {
  printViolationsAndExit,
  relativeFile,
  resolveFiles,
  rootDir,
} from './guard-utils.mjs';
import { readFileSync } from 'node:fs';

const scanRoots = ['imports/ui/metacell/runtime'];
const allowedFiles = new Set([
  path.join(rootDir, 'imports/ui/metacell/runtime/selection-source-runtime.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/drag-clipboard-runtime.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/drag-debug-runtime.js'),
]);

const selectionPatterns = [
  /\bgetSelectedCellIds\s*\(/,
  /\.\s*getSelectedCellIds\s*\(/,
];

const mutationPatterns = [
  /\bsetCellPresentation\s*\(/,
  /\bsetCellFormat\s*\(/,
  /\bsetCellSchedule\s*\(/,
  /\bsetRawCellValue\s*\(/,
];

const violations = [];

for (const file of resolveFiles(scanRoots)) {
  if (allowedFiles.has(file)) continue;
  const source = readFileSync(file, 'utf8');
  const touchesSelection = selectionPatterns.some((pattern) => pattern.test(source));
  if (!touchesSelection) continue;
  const touchesMutation = mutationPatterns.some((pattern) => pattern.test(source));
  if (!touchesMutation) continue;
  violations.push(relativeFile(file));
}

printViolationsAndExit(
  'Selection mutation paths using raw selected ids found outside source-aware helpers',
  violations,
  'No unsafe selection mutation paths using raw selected ids found.',
);
