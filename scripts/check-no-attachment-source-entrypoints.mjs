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
  path.join(rootDir, 'imports/engine/formulas/FILE.js'),
  path.join(rootDir, 'imports/engine/formulas/PDF.js'),
  path.join(rootDir, 'imports/engine/formulas/DOCX.js'),
  path.join(rootDir, 'imports/api/artifacts/index.js'),
  path.join(rootDir, 'imports/api/sheets/workbook-codec.js'),
  path.join(rootDir, 'imports/api/sheets/server/compute.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/index.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/attachment-cell-facade.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/attachment-upload-runtime.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/cell-actions-runtime.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/report-linked-input-runtime.js'),
]);

const violations = [];

for (const file of resolveFiles(scanRoots)) {
  if (allowedFiles.has(file)) continue;
  const lines = readLines(file);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const writesAttachmentSource =
      line.includes('buildAttachmentSource(') ||
      line.includes("return '__ATTACHMENT__:'") ||
      line.includes('return `__ATTACHMENT__:');
    if (!writesAttachmentSource) continue;
    violations.push(`${relativeFile(file)}:${index + 1}: ${line.trim()}`);
  }
}

printViolationsAndExit(
  'Attachment source construction found outside approved entrypoints',
  violations,
  'No attachment source construction found outside approved entrypoints.',
);
