import path from 'node:path';
import {
  printViolationsAndExit,
  readLines,
  relativeFile,
  resolveFiles,
  rootDir,
} from './guard-utils.mjs';

const scanRoots = ['imports/ui/metacell/runtime'];
const allowedFiles = new Set([
  path.join(rootDir, 'imports/ui/metacell/runtime/selection-model.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/selection-range-facade.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/app-bootstrap-init-runtime.js'),
]);

const patterns = [/\bapp\.selectionRange\b/g, /\bapp\.fillRange\b/g];
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
  'Direct selection range state access found outside selection facade/model files',
  violations,
  'No direct selection range state access found outside selection facade/model files.',
);
