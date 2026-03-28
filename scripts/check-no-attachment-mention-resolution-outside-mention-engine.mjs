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
  path.join(rootDir, 'imports/engine/formula-engine/ai-methods.js'),
]);

const violations = [];

for (const file of resolveFiles(scanRoots)) {
  if (allowedFiles.has(file)) continue;
  const lines = readLines(file);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      !line.includes('resolveImageAttachmentMention') &&
      !line.includes('resolveTextAttachmentMention') &&
      !line.includes('getAttachmentForCell(') &&
      !line.includes('getImageAttachmentForCell(') &&
      !line.includes('getTextAttachmentForCell(')
    ) {
      continue;
    }
    violations.push(`${relativeFile(file)}:${index + 1}: ${line.trim()}`);
  }
}

printViolationsAndExit(
  'Attachment mention resolution found outside mention engine',
  violations,
  'No attachment mention resolution found outside mention engine.',
);
