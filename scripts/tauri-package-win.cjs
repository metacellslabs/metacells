const { spawn } = require('child_process');
const { cargoTargetDir, ensureCleanCargoTarget, projectRoot } = require('./tauri-target.cjs');

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR || cargoTargetDir,
      },
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

async function main() {
  if (process.platform !== 'win32') {
    throw new Error(
      'Tauri Windows bundles (NSIS/MSI) must be built on Windows. Run this command on a Windows machine or in Windows CI.',
    );
  }

  ensureCleanCargoTarget();

  const tauriCli = process.platform === 'win32' ? 'tauri.cmd' : 'tauri';
  await run(tauriCli, [
    'build',
    '--config',
    'src-tauri/tauri.conf.json',
    '--bundles',
    'nsis,msi',
  ]);
}

main().catch((error) => {
  console.error('[desktop:dist:tauri:win] failed');
  console.error(error.message || error);
  process.exit(1);
});
