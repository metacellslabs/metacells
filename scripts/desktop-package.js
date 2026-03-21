const path = require('path');
const { spawn } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: process.env,
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
  const builderCli = require.resolve('electron-builder/out/cli/cli.js');
  const builderArgs = process.argv.slice(2);

  await run(process.execPath, [path.join(projectRoot, 'scripts', 'desktop-prepare.js')]);
  await run(process.execPath, [builderCli, ...builderArgs]);
}

main().catch((error) => {
  console.error('[desktop:package] failed');
  console.error(error);
  process.exit(1);
});
