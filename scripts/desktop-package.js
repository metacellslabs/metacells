const path = require('path');
const { spawn } = require('child_process');
const { build, Platform, Arch } = require('electron-builder');

const projectRoot = path.resolve(__dirname, '..');

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...(options.env || {}),
      },
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

function inferTargetPlatform(builderArgs) {
  if (builderArgs.includes('--win')) return 'win32';
  if (builderArgs.includes('--linux')) return 'linux';
  if (builderArgs.includes('--mac')) return 'darwin';
  return process.platform;
}

function inferTargetArch(builderArgs, targetPlatform) {
  if (builderArgs.includes('--x64')) return 'x64';
  if (builderArgs.includes('--arm64')) return 'arm64';
  if (targetPlatform === 'win32') return 'x64';
  return process.arch;
}

function inferDirTarget(builderArgs) {
  return builderArgs.includes('--dir');
}

function getTargetKey(targetPlatform, targetArch) {
  return `${targetPlatform}-${targetArch}`;
}

function getRuntimeRoot(targetKey) {
  return path.join(projectRoot, '.desktop-runtime', targetKey);
}

function getCacheRoot(targetKey) {
  return path.join(projectRoot, '.desktop-cache', targetKey);
}

function getOutputRoot(targetKey) {
  return path.join(projectRoot, 'dist', 'electron', targetKey);
}

function getPlatform(targetPlatform) {
  if (targetPlatform === 'win32') return Platform.WINDOWS;
  if (targetPlatform === 'linux') return Platform.LINUX;
  return Platform.MAC;
}

function getArch(targetArch) {
  if (targetArch === 'arm64') return Arch.arm64;
  return Arch.x64;
}

function createTargets(targetPlatform, targetArch, dirTarget) {
  const platform = getPlatform(targetPlatform);
  const arch = getArch(targetArch);
  return platform.createTarget(dirTarget ? ['dir'] : undefined, arch);
}

function buildConfig(runtimeRoot, outputRoot) {
  const packageJson = require(path.join(projectRoot, 'package.json'));
  const config = JSON.parse(JSON.stringify(packageJson.build || {}));
  config.directories = {
    ...(config.directories || {}),
    output: outputRoot,
  };
  config.extraResources = [
    {
      from: runtimeRoot,
      to: 'desktop-runtime',
    },
  ];
  return config;
}

async function main() {
  const builderArgs = process.argv.slice(2);
  const targetPlatform = inferTargetPlatform(builderArgs);
  const targetArch = inferTargetArch(builderArgs, targetPlatform);
  const dirTarget = inferDirTarget(builderArgs);
  const targetKey = getTargetKey(targetPlatform, targetArch);
  const runtimeRoot = getRuntimeRoot(targetKey);
  const cacheRoot = getCacheRoot(targetKey);
  const outputRoot = getOutputRoot(targetKey);

  await run(process.execPath, [path.join(projectRoot, 'scripts', 'desktop-prepare.js')], {
    env: {
      METACELLS_TARGET_ARCH: targetArch,
      METACELLS_TARGET_PLATFORM: targetPlatform,
      METACELLS_RUNTIME_ROOT: runtimeRoot,
      METACELLS_CACHE_ROOT: cacheRoot,
    },
  });

  await build({
    targets: createTargets(targetPlatform, targetArch, dirTarget),
    config: buildConfig(runtimeRoot, outputRoot),
  });
}

main().catch((error) => {
  console.error('[desktop:package] failed');
  console.error(error);
  process.exit(1);
});
