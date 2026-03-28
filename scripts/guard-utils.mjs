import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const rootDir = process.cwd();

export function listFiles(dir) {
  const results = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      results.push(...listFiles(fullPath));
      continue;
    }
    if (
      !fullPath.endsWith('.js') &&
      !fullPath.endsWith('.jsx') &&
      !fullPath.endsWith('.mjs')
    ) {
      continue;
    }
    results.push(fullPath);
  }
  return results;
}

export function resolveFiles(scanRoots) {
  const roots = Array.isArray(scanRoots) ? scanRoots : [];
  return roots.flatMap((relativeRoot) => listFiles(path.join(rootDir, relativeRoot)));
}

export function readLines(file) {
  return readFileSync(file, 'utf8').split('\n');
}

export function relativeFile(file) {
  return path.relative(rootDir, file);
}

export function printViolationsAndExit(title, violations, successMessage = 'No guard violations found.') {
  if (!violations.length) {
    console.log(successMessage);
    return;
  }
  console.error(`${title}:\n`);
  for (const violation of violations) {
    console.error(violation);
  }
  process.exit(1);
}
