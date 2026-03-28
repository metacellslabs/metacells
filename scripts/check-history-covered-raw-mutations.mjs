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
  path.join(rootDir, 'imports/ui/metacell/runtime/app-methods-cell-update.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/app-methods-generated-results.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/app-methods-local-compute.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/drag-clipboard-runtime.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/drag-selection-runtime.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/structure-runtime.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/mention-runtime.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/index.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/source-edit-facade.js'),
]);

const violations = [];

for (const file of resolveFiles(scanRoots)) {
  if (allowedFiles.has(file)) continue;
  const source = readFileSync(file, 'utf8');
  if (!/\bsetRawCellValue\s*\(/.test(source)) continue;
  if (/\bcaptureHistorySnapshot\s*\(/.test(source)) continue;
  violations.push(relativeFile(file));
}

printViolationsAndExit(
  'Raw workbook mutation paths without explicit history snapshot coverage found',
  violations,
  'No raw workbook mutation paths without explicit history snapshot coverage found.',
);
