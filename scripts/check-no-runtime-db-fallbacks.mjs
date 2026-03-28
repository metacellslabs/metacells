import {
  printViolationsAndExit,
  readLines,
  relativeFile,
  resolveFiles,
} from './guard-utils.mjs';

const scanRoots = ['imports/api/ai', 'imports/api/sheets/server', 'imports/ui/metacell/runtime'];
const patterns = [/\bSheets\.findOneAsync\s*\(/g, /\bSheets\.find\s*\(/g];
const violations = [];

for (const file of resolveFiles(scanRoots)) {
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
  'Runtime/AI compute paths with direct sheet DB fallback found',
  violations,
  'No runtime/AI compute paths with direct sheet DB fallback found.',
);
