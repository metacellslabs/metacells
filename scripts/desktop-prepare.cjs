const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const runtimeRoot = path.join(projectRoot, '.desktop-runtime');
const cacheRoot = path.join(projectRoot, '.desktop-cache');
const desktopToolsRoot = path.join(projectRoot, '.desktop-tools');
const backendRuntimeDependenciesPath = path.join(
  projectRoot,
  'scripts',
  'desktop-backend-runtime-dependencies.json',
);
const stagedBackendRoot = path.join(runtimeRoot, 'backend');
const stagedNodeRoot = path.join(runtimeRoot, 'node');
const targetPlatform = process.env.METACELLS_DESKTOP_TARGET_PLATFORM || process.platform;
const targetArch = process.env.METACELLS_DESKTOP_TARGET_ARCH || process.arch;
const desktopMode = String(process.env.METACELLS_DESKTOP_MODE || 'build').trim().toLowerCase();
const NODE_MODULES_PRUNE_DIR_NAMES = new Set([
  'test',
  'tests',
  'docs',
  'doc',
  'example',
  'examples',
  '.github',
  '.husky',
  'benchmarks',
]);

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

function pruneNodeModulesJunk(nodeModulesRoot) {
  if (!fs.existsSync(nodeModulesRoot)) return;

  const stack = [nodeModulesRoot];
  while (stack.length) {
    const currentPath = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch (_error) {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const entryPath = path.join(currentPath, entry.name);
      if (NODE_MODULES_PRUNE_DIR_NAMES.has(entry.name)) {
        fs.rmSync(entryPath, { recursive: true, force: true });
        continue;
      }
      stack.push(entryPath);
    }
  }
}

function getBundledNodeFilename() {
  return targetPlatform === 'win32' ? 'node.exe' : 'node';
}

function getDesktopToolsTargetSuffix() {
  return `${targetPlatform}-${targetArch}`;
}

function listDynamicLibraries(binaryPath) {
  if (process.platform !== 'darwin') return [];
  const output = execFileSync('otool', ['-L', binaryPath], {
    cwd: projectRoot,
    env: getSpawnEnv(),
    encoding: 'utf8',
  });
  return String(output)
    .split('\n')
    .slice(1)
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .map((line) => line.split(' (')[0].trim())
    .filter(Boolean);
}

function assertPortableMacNodeBinary(binaryPath) {
  if (targetPlatform !== 'darwin') return;
  const dylibs = listDynamicLibraries(binaryPath);
  const externalDeps = dylibs.filter((libPath) => {
    return !(
      libPath.startsWith('/System/') ||
      libPath.startsWith('/usr/lib/') ||
      libPath.startsWith('@executable_path/') ||
      libPath.startsWith('@loader_path/') ||
      libPath.startsWith('@rpath/')
    );
  });
  if (!externalDeps.length) return;
  throw new Error(
    [
      `Bundled Node binary is not portable: ${binaryPath}`,
      'It links against non-system dynamic libraries:',
      ...externalDeps.map((libPath) => `- ${libPath}`),
      'Use METACELLS_DESKTOP_NODE_BINARY with a standalone Node build that does not depend on Homebrew dylibs.',
    ].join('\n'),
  );
}

function isPortableMacNodeBinary(binaryPath) {
  try {
    assertPortableMacNodeBinary(binaryPath);
    return true;
  } catch (_error) {
    return false;
  }
}

function resolveManagedNodeBinarySource() {
  if (!fs.existsSync(desktopToolsRoot)) return '';

  const nodeFilename = getBundledNodeFilename();
  const targetSuffix = getDesktopToolsTargetSuffix();
  const candidates = fs
    .readdirSync(desktopToolsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.includes(targetSuffix))
    .map((entry) => path.join(desktopToolsRoot, entry.name, 'bin', nodeFilename))
    .filter((candidatePath) => fs.existsSync(candidatePath))
    .sort()
    .reverse();

  for (const candidatePath of candidates) {
    if (targetPlatform === 'darwin' && !isPortableMacNodeBinary(candidatePath)) {
      continue;
    }
    return candidatePath;
  }

  return '';
}

function resolveNodeBinarySource() {
  const explicitPath = String(process.env.METACELLS_DESKTOP_NODE_BINARY || '').trim();
  if (explicitPath) {
    const resolved = path.resolve(projectRoot, explicitPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(
        `METACELLS_DESKTOP_NODE_BINARY does not exist: ${resolved}`,
      );
    }
    return resolved;
  }

  const managedNodeBinary = resolveManagedNodeBinarySource();
  if (managedNodeBinary) {
    return managedNodeBinary;
  }

  if (desktopMode === 'dev' && !isCrossTargetBuild()) {
    if (targetPlatform !== 'darwin' || isPortableMacNodeBinary(process.execPath)) {
      return process.execPath;
    }
    throw new Error(
      [
        `Bundled Node binary is not portable: ${process.execPath}`,
        'A managed standalone runtime was not found under .desktop-tools.',
        'Use METACELLS_DESKTOP_NODE_BINARY with a standalone Node build that does not depend on Homebrew dylibs.',
      ].join('\n'),
    );
  }

  throw new Error(
    [
      `No portable bundled Node runtime was found for ${targetPlatform}/${targetArch}.`,
      'Desktop build mode does not allow falling back to the builder machine Node binary.',
      'Provide METACELLS_DESKTOP_NODE_BINARY or stage a standalone runtime under .desktop-tools.',
    ].join('\n'),
  );
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

function copyRootNodeModules(bundleRoot) {
  const rootNodeModules = path.join(projectRoot, 'node_modules');
  const bundleNodeModules = path.join(bundleRoot, 'node_modules');
  if (!fs.existsSync(rootNodeModules)) {
    throw new Error('Cannot stage runtime dependencies: root node_modules is missing');
  }
  fs.cpSync(rootNodeModules, bundleNodeModules, { recursive: true });
}

function isCrossTargetBuild() {
  return targetPlatform !== process.platform || targetArch !== process.arch;
}

function readProjectPackageJson() {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
}

function readBackendRuntimeDependencies() {
  const source = JSON.parse(
    fs.readFileSync(backendRuntimeDependenciesPath, 'utf8'),
  );
  if (!Array.isArray(source) || !source.length) {
    throw new Error(
      `Backend runtime dependency list is empty: ${backendRuntimeDependenciesPath}`,
    );
  }
  return source.map((value) => String(value || '').trim()).filter(Boolean);
}

function readInstalledPackageVersion(name) {
  const packageJsonPath = path.join(projectRoot, 'node_modules', name, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return '';
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return String(packageJson.version || '').trim();
}

function resolveRuntimeDependencyVersion(name, rootDependencies) {
  if (rootDependencies[name]) return rootDependencies[name];
  const installedVersion = readInstalledPackageVersion(name);
  if (installedVersion) return `^${installedVersion}`;
  throw new Error(`Missing runtime dependency "${name}" in package.json and node_modules`);
}

function buildDesktopRuntimePackageJson() {
  const rootPackageJson = readProjectPackageJson();
  const rootDependencies = rootPackageJson.dependencies || {};
  const runtimeDependencyNames = readBackendRuntimeDependencies();
  const dependencies = {};

  runtimeDependencyNames.forEach((name) => {
    dependencies[name] = resolveRuntimeDependencyVersion(name, rootDependencies);
  });

  return {
    name: `${rootPackageJson.name || 'metacells'}-desktop-runtime`,
    private: true,
    type: 'module',
    version: rootPackageJson.version || '0.0.0',
    main: 'server.js',
    dependencies,
  };
}

async function stageServerBundle() {
  ensureDir(stagedBackendRoot);
  const bundleRoot = path.join(stagedBackendRoot, 'bundle');
  ensureDir(bundleRoot);

  const filesToCopy = ['server.js'];
  for (const file of filesToCopy) {
    const src = path.join(projectRoot, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(bundleRoot, file));
    }
  }

  const runtimePackageJson = buildDesktopRuntimePackageJson();
  fs.writeFileSync(
    path.join(bundleRoot, 'package.json'),
    JSON.stringify(runtimePackageJson, null, 2),
  );

  const directoriesToCopy = ['server', 'lib'];
  for (const directory of directoriesToCopy) {
    const sourceDir = path.join(projectRoot, directory);
    if (fs.existsSync(sourceDir)) {
      fs.cpSync(sourceDir, path.join(bundleRoot, directory), { recursive: true });
    }
  }

  const importsRoot = path.join(projectRoot, 'imports');
  const stagedImportsRoot = path.join(bundleRoot, 'imports');
  ensureDir(stagedImportsRoot);
  const importSubtreesToCopy = ['api', 'engine', 'lib', 'startup/server'];
  for (const relativePath of importSubtreesToCopy) {
    const sourceDir = path.join(importsRoot, relativePath);
    if (fs.existsSync(sourceDir)) {
      fs.cpSync(sourceDir, path.join(stagedImportsRoot, relativePath), {
        recursive: true,
      });
    }
  }
  const importFilesToCopy = [
    'ui/metacell/runtime/ai-service.js',
    'ui/metacell/runtime/ai-prompts.js',
    'ui/metacell/runtime/constants.js',
  ];
  for (const relativePath of importFilesToCopy) {
    const sourceFile = path.join(importsRoot, relativePath);
    if (!fs.existsSync(sourceFile)) continue;
    const targetFile = path.join(stagedImportsRoot, relativePath);
    ensureDir(path.dirname(targetFile));
    fs.copyFileSync(sourceFile, targetFile);
  }

  const clientDistSrc = path.join(projectRoot, 'dist', 'client');
  if (!fs.existsSync(clientDistSrc)) {
    await run('npm', ['run', 'build'], { cwd: projectRoot });
  }
  if (!fs.existsSync(clientDistSrc)) {
    throw new Error('Missing dist/client after build; cannot stage desktop frontend');
  }
  fs.cpSync(clientDistSrc, path.join(bundleRoot, 'dist', 'client'), { recursive: true });

  const npmCacheDir = path.join(cacheRoot, 'npm-cache');
  ensureDir(npmCacheDir);
  const installArgs = ['install', '--omit=dev', '--cache', npmCacheDir];
  if (isCrossTargetBuild()) {
    installArgs.push('--ignore-scripts');
  }

  try {
    await run('npm', installArgs, { cwd: bundleRoot });
  } catch (error) {
    if (desktopMode === 'dev' && !isCrossTargetBuild()) {
      console.warn('[desktop:prepare] npm install failed, falling back to copied workspace node_modules');
      console.warn(error.message);
      copyRootNodeModules(bundleRoot);
      pruneNodeModulesJunk(path.join(bundleRoot, 'node_modules'));
      return;
    }
    throw new Error(
      [
        `Desktop dependency staging failed for ${targetPlatform}/${targetArch}: ${error.message}`,
        'Build mode does not allow falling back to workspace node_modules.',
      ].join('\n'),
    );
  }

  pruneNodeModulesJunk(path.join(bundleRoot, 'node_modules'));
}

function stageNodeBinary() {
  ensureDir(stagedNodeRoot);
  const sourceBinary = resolveNodeBinarySource();
  assertPortableMacNodeBinary(sourceBinary);
  const targetBinary = path.join(stagedNodeRoot, getBundledNodeFilename());
  fs.copyFileSync(sourceBinary, targetBinary);
  if (targetPlatform !== 'win32') {
    fs.chmodSync(targetBinary, 0o755);
  }
  return {
    sourceBinary,
    targetBinary,
  };
}

function writeManifest(nodeInfo) {
  const manifestPath = path.join(runtimeRoot, 'manifest.json');
  const manifest = {
    createdAt: new Date().toISOString(),
    backend: {
      main: 'backend/bundle/server.js',
    },
    node: {
      binary: `node/${path.basename(nodeInfo.targetBinary)}`,
      targetPlatform,
      targetArch,
    },
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

async function main() {
  removeDirRobust(runtimeRoot);
  ensureDir(runtimeRoot);

  await stageServerBundle();
  const nodeInfo = stageNodeBinary();
  writeManifest(nodeInfo);
  console.log('[desktop:prepare] ready', {
    runtimeRoot,
    targetPlatform,
    targetArch,
    nodeBinary: nodeInfo.targetBinary,
  });
}

main().catch((error) => {
  console.error('[desktop:prepare] failed');
  console.error(error);
  process.exit(1);
});
