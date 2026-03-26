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
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code || 0}`));
    });
    child.on('error', (error) => {
      reject(error);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: node scripts/tauri-run.cjs <tauri args...>');
    process.exit(1);
  }

  ensureCleanCargoTarget();

  if (args[0] === 'dev') {
    await run('node', ['scripts/desktop-prepare.cjs'], {
      env: {
        ...process.env,
        METACELLS_DESKTOP_MODE: 'dev',
      },
    });
  }

  const tauriCli = process.platform === 'win32' ? 'tauri.cmd' : 'tauri';
  const child = spawn(tauriCli, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR || cargoTargetDir,
    },
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
  child.on('error', (error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
