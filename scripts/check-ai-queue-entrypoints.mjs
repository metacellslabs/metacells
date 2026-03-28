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
  path.join(rootDir, 'imports/api/schedules/index.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/ai-service.js'),
  path.join(rootDir, 'imports/ui/metacell/runtime/app-methods-generated-results.js'),
]);

const patterns = [
  /\benqueueAIChatRequest\s*\(/g,
  /\brpc\s*\(\s*['"]ai\.requestChat['"]/g,
  /\bqueueMeta:\s*\{/g,
  /\bformulaKind:\s*['"]/g,
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
  'AI formula queue entrypoints found outside approved AI queue files',
  violations,
  'No AI formula queue entrypoints found outside approved AI queue files.',
);
