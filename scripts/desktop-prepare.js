const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { MongoBinary } = require('mongodb-memory-server-core');

const projectRoot = path.resolve(__dirname, '..');
const runtimeRoot = path.join(projectRoot, '.desktop-runtime');
const cacheRoot = path.join(projectRoot, '.desktop-cache');
const stagedBackendRoot = path.join(runtimeRoot, 'backend');
const stagedMongoRoot = path.join(runtimeRoot, 'mongo', 'bin');
const mongoVersion = process.env.METACELLS_MONGO_VERSION || '8.2.1';

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
}

async function stageMongoBinary() {
  const downloadDir = path.join(cacheRoot, 'mongo-download');
  ensureDir(downloadDir);

  const binaryPath = await MongoBinary.getPath({
    version: mongoVersion,
    downloadDir,
  });
  const stagedMongoPath = path.join(
    stagedMongoRoot,
    process.platform === 'win32' ? 'mongod.exe' : 'mongod',
  );
  copyExecutable(binaryPath, stagedMongoPath);
  return {
    binary: path.relative(runtimeRoot, stagedMongoPath),
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
    console.log('[desktop:prepare] ready', {
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
