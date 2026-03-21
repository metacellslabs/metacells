const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const desktopUrl = process.env.METACELLS_DESKTOP_URL || 'http://127.0.0.1:3400';
const shouldStartServer = process.env.METACELLS_DESKTOP_NO_SERVER !== '1';

let serverProcess = null;
let electronProcess = null;
let shuttingDown = false;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ping(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(response.statusCode && response.statusCode < 500);
    });

    request.on('error', () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (await ping(url)) {
      return;
    }
    await wait(1000);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function terminate(child) {
  if (!child || child.killed) return;

  if (process.platform === 'win32') {
    child.kill();
    return;
  }

  child.kill('SIGTERM');
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;

  terminate(electronProcess);
  terminate(serverProcess);

  setTimeout(() => process.exit(code), 250);
}

function startServer() {
  serverProcess = spawn(
    'node',
    ['server.js'],
    {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        METACELLS_ROLE: 'web',
      },
    },
  );

  serverProcess.on('exit', (code) => {
    if (!shuttingDown && code !== 0) {
      shutdown(code || 1);
    }
  });
}

function startElectron() {
  const electronBinary = require('electron');
  electronProcess = spawn(electronBinary, [projectRoot], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      METACELLS_DESKTOP_URL: desktopUrl,
    },
  });

  electronProcess.on('exit', (code) => {
    shutdown(code || 0);
  });
}

async function main() {
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  if (shouldStartServer) {
    startServer();
    await waitForServer(desktopUrl);
  }

  startElectron();
}

main().catch((error) => {
  console.error('[desktop:dev] failed', error);
  shutdown(1);
});
