const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const cargoTargetDir = path.join(projectRoot, 'src-tauri', 'target');

function listFilesRecursive(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const stack = [rootDir];
  const files = [];
  while (stack.length) {
    const currentPath = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch (_error) {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      files.push(entryPath);
    }
  }
  return files;
}

function hasStaleCargoTarget() {
  const buildRoot = path.join(cargoTargetDir, 'debug', 'build');
  const releaseBuildRoot = path.join(cargoTargetDir, 'release', 'build');
  const rootOutputFiles = [
    ...listFilesRecursive(buildRoot),
    ...listFilesRecursive(releaseBuildRoot),
  ].filter((filePath) => path.basename(filePath) === 'root-output');

  for (const filePath of rootOutputFiles) {
    let content = '';
    try {
      content = String(fs.readFileSync(filePath, 'utf8')).trim();
    } catch (_error) {
      continue;
    }
    if (!content) continue;
    const normalized = path.normalize(content);
    if (!normalized.startsWith(cargoTargetDir + path.sep)) {
      return true;
    }
  }
  return false;
}

function ensureCleanCargoTarget() {
  if (!hasStaleCargoTarget()) return;
  fs.rmSync(cargoTargetDir, { recursive: true, force: true });
}

module.exports = {
  cargoTargetDir,
  ensureCleanCargoTarget,
  projectRoot,
};
