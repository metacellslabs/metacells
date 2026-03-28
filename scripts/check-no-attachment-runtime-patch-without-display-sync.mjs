import { readFileSync } from 'node:fs';
import { printViolationsAndExit, relativeFile, resolveFiles } from './guard-utils.mjs';

const scanRoots = [
  'imports/api/sheets',
  'imports/api/sheets/server',
  'imports/ui/metacell/runtime',
];

const allowedMissingDisplayValue = new Set([
  'imports/ui/metacell/runtime/index.js',
  'imports/ui/metacell/runtime/attachment-preview-runtime.js',
  'imports/ui/metacell/runtime/cell-render-model.js',
  'imports/ui/metacell/runtime/compute-render-runtime.js',
  'imports/ui/metacell/runtime/compute-runtime.js',
  'imports/ui/metacell/runtime/compute-support-runtime.js',
]);

const violations = [];

for (const file of resolveFiles(scanRoots)) {
  const relativePath = relativeFile(file);
  if (allowedMissingDisplayValue.has(relativePath)) continue;
  const source = readFileSync(file, 'utf8');
  const touchesAttachment =
    source.includes('parseAttachmentSource(') ||
    source.includes('buildAttachmentSource(') ||
    source.includes('__ATTACHMENT__:');
  if (!touchesAttachment) continue;
  if (!/\bstate\s*:/.test(source)) continue;
  if (!/\bvalue\s*:/.test(source)) continue;
  if (/\bdisplayValue\s*:/.test(source)) continue;
  violations.push(relativePath);
}

printViolationsAndExit(
  'Attachment patch files with value/state updates but no displayValue sync found',
  violations,
  'No attachment patch files with unsynced value/state updates found.',
);
