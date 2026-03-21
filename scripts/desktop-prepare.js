const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { MongoBinary } = require('mongodb-memory-server-core');

const projectRoot = path.resolve(__dirname, '..');
const targetPlatform = process.env.METACELLS_TARGET_PLATFORM || process.platform;
const targetArch = process.env.METACELLS_TARGET_ARCH || process.arch;
const targetKey = `${targetPlatform}-${targetArch}`;
const runtimeRoot =
  process.env.METACELLS_RUNTIME_ROOT ||
  path.join(projectRoot, '.desktop-runtime', targetKey);
const cacheRoot =
  process.env.METACELLS_CACHE_ROOT ||
  path.join(projectRoot, '.desktop-cache', targetKey);
const stagedBackendRoot = path.join(runtimeRoot, 'backend');
const stagedMongoRoot = path.join(runtimeRoot, 'mongo', 'bin');
const mongoVersion = process.env.METACELLS_MONGO_VERSION || '8.2.1';

function getMongoTargetArch() {
  if (targetPlatform === 'win32' && targetArch === 'arm64') {
    return 'x64';
  }
  return targetArch;
}

function getSpawnEnv() {
  const env = { ...process.env };
  delete env.NO_COLOR;
  delete env.FORCE_COLOR;
  return env;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: getSpawnEnv(),
      ...options,
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`));
    });
    child.on('error', reject);
  });
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function removeDirRobust(dirPath) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (error && error.code === 'ENOTEMPTY' && attempt < 4) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
        continue;
      }
      throw error;
    }
  }
}

function copyExecutable(fromPath, toPath) {
  ensureDir(path.dirname(toPath));
  fs.copyFileSync(fromPath, toPath);
  fs.chmodSync(toPath, 0o755);
}

function normalizePermissionsRecursively(rootDir) {
  if (!fs.existsSync(rootDir)) return;

  const stack = [rootDir];
  while (stack.length) {
    const currentPath = stack.pop();
    let stats;

    try {
      stats = fs.lstatSync(currentPath);
    } catch (_error) {
      continue;
    }

    if (stats.isSymbolicLink()) {
      continue;
    }

    if (stats.isDirectory()) {
      fs.chmodSync(currentPath, 0o755);
      const entries = fs.readdirSync(currentPath);
      for (const entry of entries) {
        stack.push(path.join(currentPath, entry));
      }
      continue;
    }

    const isExecutable = (stats.mode & 0o111) !== 0;
    fs.chmodSync(currentPath, isExecutable ? 0o755 : 0o644);
  }
}

function collectPackageDirs(nodeModulesDir) {
  if (!fs.existsSync(nodeModulesDir)) return [];

  const packageDirs = [];
  const entries = fs.readdirSync(nodeModulesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === '.bin') continue;

    const entryPath = path.join(nodeModulesDir, entry.name);
    if (entry.name.startsWith('@')) {
      const scopedEntries = fs.readdirSync(entryPath, { withFileTypes: true });
      for (const scopedEntry of scopedEntries) {
        if (!scopedEntry.isDirectory()) continue;
        packageDirs.push(path.join(entryPath, scopedEntry.name));
      }
      continue;
    }

    packageDirs.push(entryPath);
  }

  return packageDirs;
}

function resolveBinTarget(packageDir, binValue, binName) {
  if (typeof binValue === 'string') {
    return binName === path.basename(binName) ? path.join(packageDir, binValue) : null;
  }
  if (!binValue || typeof binValue !== 'object') {
    return null;
  }
  const relativeTarget = binValue[binName];
  if (typeof relativeTarget !== 'string' || !relativeTarget) {
    return null;
  }
  return path.join(packageDir, relativeTarget);
}

function materializeBinLinks(nodeModulesDir) {
  const binDir = path.join(nodeModulesDir, '.bin');
  if (!fs.existsSync(binDir)) return;

  const packageDirs = collectPackageDirs(nodeModulesDir);
  const binEntries = fs.readdirSync(binDir);

  for (const binName of binEntries) {
    const binPath = path.join(binDir, binName);
    let stats;

    try {
      stats = fs.lstatSync(binPath);
    } catch (_error) {
      continue;
    }

    if (!stats.isSymbolicLink()) {
      continue;
    }

    let sourceTarget = null;

    for (const packageDir of packageDirs) {
      const packageJsonPath = path.join(packageDir, 'package.json');
      if (!fs.existsSync(packageJsonPath)) continue;

      let packageJson;
      try {
        packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      } catch (_error) {
        continue;
      }

      const resolvedTarget = resolveBinTarget(packageDir, packageJson.bin, binName);
      if (!resolvedTarget || !fs.existsSync(resolvedTarget)) {
        continue;
      }

      sourceTarget = resolvedTarget;
      break;
    }

    if (sourceTarget) {
      fs.rmSync(binPath, { force: true });
      fs.copyFileSync(sourceTarget, binPath);
      fs.chmodSync(binPath, 0o755);
      continue;
    }

    console.warn('[desktop:prepare] leaving unresolved bin symlink', binPath);
  }
}

function materializeBinLinksRecursively(rootDir) {
  if (!fs.existsSync(rootDir)) return;

  const stack = [rootDir];
  while (stack.length) {
    const currentDir = stack.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    if (path.basename(currentDir) === 'node_modules') {
      materializeBinLinks(currentDir);
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === '.bin') continue;
      stack.push(path.join(currentDir, entry.name));
    }
  }
}

function pruneBundleArtifacts(rootDir) {
  if (!fs.existsSync(rootDir)) return;

  const removableDirs = new Set([
    '__tests__',
    'doc',
    'docs',
    'example',
    'examples',
    'man',
    'test',
    'tests',
  ]);
  const removableFiles = new Set([
    '.npm-shrinkwrap.json',
    '.package-lock.json',
  ]);
  const removableSuffixes = ['.map', '.md'];
  const stack = [rootDir];

  while (stack.length) {
    const currentDir = stack.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (removableDirs.has(entry.name)) {
          removeDirRobust(entryPath);
          continue;
        }
        stack.push(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (
        removableFiles.has(entry.name) ||
        removableSuffixes.some((suffix) => entry.name.endsWith(suffix))
      ) {
        fs.rmSync(entryPath, { force: true });
      }
    }
  }
}

async function stageMeteorBundle(tempRoot) {
  const buildOutput = path.join(tempRoot, 'meteor-build');
  await run('meteor', ['build', buildOutput, '--directory', '--server-only']);

  const sourceBundleRoot = path.join(buildOutput, 'bundle');
  ensureDir(stagedBackendRoot);
  fs.cpSync(sourceBundleRoot, path.join(stagedBackendRoot, 'bundle'), {
    recursive: true,
  });

  const serverDir = path.join(stagedBackendRoot, 'bundle', 'programs', 'server');
  await run('meteor', ['npm', 'install', '--omit=dev'], { cwd: serverDir });
  materializeBinLinksRecursively(serverDir);
  pruneBundleArtifacts(path.join(stagedBackendRoot, 'bundle'));
}

async function stageMongoBinary() {
  const downloadDir = path.join(cacheRoot, 'mongo-download');
  ensureDir(downloadDir);
  const mongoTargetArch = getMongoTargetArch();
  const previousMongoArch = process.env.MONGOMS_ARCH;
  const previousMongoPlatform = process.env.MONGOMS_PLATFORM;
  process.env.MONGOMS_ARCH = mongoTargetArch;
  process.env.MONGOMS_PLATFORM = targetPlatform;

  console.log('[desktop:prepare] resolving mongo binary', {
    downloadDir,
    mongoTargetArch,
    targetArch,
    targetPlatform,
    version: mongoVersion,
  });

  let binaryPath;
  try {
    binaryPath = await MongoBinary.getPath({
      platform: targetPlatform,
      arch: mongoTargetArch,
      version: mongoVersion,
      downloadDir,
    });
  } finally {
    if (previousMongoArch == null) {
      delete process.env.MONGOMS_ARCH;
    } else {
      process.env.MONGOMS_ARCH = previousMongoArch;
    }

    if (previousMongoPlatform == null) {
      delete process.env.MONGOMS_PLATFORM;
    } else {
      process.env.MONGOMS_PLATFORM = previousMongoPlatform;
    }
  }
  const stagedMongoPath = path.join(
    stagedMongoRoot,
    targetPlatform === 'win32' ? 'mongod.exe' : 'mongod',
  );
  copyExecutable(binaryPath, stagedMongoPath);
  return {
    arch: mongoTargetArch,
    binary: path.relative(runtimeRoot, stagedMongoPath),
    requestedArch: targetArch,
    platform: targetPlatform,
    source: binaryPath,
    version: mongoVersion,
  };
}

function writeManifest(mongoInfo) {
  const manifestPath = path.join(runtimeRoot, 'manifest.json');
  const manifest = {
    createdAt: new Date().toISOString(),
    backend: {
      main: 'backend/bundle/main.js',
    },
    mongo: mongoInfo,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metacells-desktop-'));
  removeDirRobust(runtimeRoot);
  ensureDir(runtimeRoot);

  try {
    await stageMeteorBundle(tempRoot);
    const mongoInfo = await stageMongoBinary();
    writeManifest(mongoInfo);
    normalizePermissionsRecursively(runtimeRoot);
    console.log('[desktop:prepare] ready', {
      mongoTargetArch: getMongoTargetArch(),
      targetArch,
      targetPlatform,
      runtimeRoot,
      mongoVersion,
    });
  } finally {
    removeDirRobust(tempRoot);
  }
}

main().catch((error) => {
  console.error('[desktop:prepare] failed');
  console.error(error);
  process.exit(1);
});
