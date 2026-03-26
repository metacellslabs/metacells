import path from 'node:path';
import {
  printViolationsAndExit,
  readLines,
  relativeFile,
  resolveFiles,
  rootDir,
} from './guard-utils.mjs';

const scanRoots = ['imports/api', 'imports/ui/metacell/runtime'];
const allowedFiles = new Set([
  path.join(rootDir, 'imports/api/ai/index.js'),
  path.join(rootDir, 'imports/api/sheets/index.js'),
  path.join(rootDir, 'imports/api/sheets/server/compute.js'),
]);

const patterns = [
  /\breloadWorkbookData\b/g,
  /\bloadWorkbookForQueueMeta\b/g,
  /\bloadSheetDocumentStorageHook\b/g,
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
  'Workbook reload/fallback entrypoints found outside approved compute/AI files',
  violations,
  'No workbook reload/fallback entrypoints found outside approved compute/AI files.',
);
