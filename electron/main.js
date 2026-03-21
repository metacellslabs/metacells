const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_URL = 'http://127.0.0.1:3400';

let backendState = null;
let mainWindow = null;

function getBootstrapLogPath() {
  let userDataRoot = null;

  try {
    if (app && typeof app.getPath === 'function') {
      userDataRoot = app.getPath('userData');
    }
  } catch (_error) {
    userDataRoot = null;
  }

  if (!userDataRoot) {
    const appDataRoot =
      process.env.APPDATA ||
      process.env.LOCALAPPDATA ||
      path.join(os.homedir(), 'AppData', 'Roaming');
    userDataRoot = path.join(appDataRoot, 'metacells');
  }

  const logDir = path.join(userDataRoot, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  return path.join(logDir, 'desktop-bootstrap.log');
}

function writeBootstrapLog(message, error = null) {
  try {
    const timestamp = new Date().toISOString();
    const suffix = error
      ? `\n${error && error.stack ? error.stack : String(error)}`
      : '';
    fs.appendFileSync(getBootstrapLogPath(), `[${timestamp}] ${message}${suffix}\n`);
  } catch (_error) {
    // Ignore bootstrap log failures because this path is only for debugging startup.
  }
}

function showFatalStartupError(title, error) {
  const detail = error && error.stack ? error.stack : String(error);
  writeBootstrapLog(title, error);
  try {
    dialog.showErrorBox(title, detail);
  } catch (_error) {
    // Ignore dialog failures; the bootstrap log already captured the issue.
  }
}

function getBaseAppUrl() {
  return backendState?.appUrl || getDesktopUrl();
}

function getAppIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar', 'public', 'logo.png')
    : path.join(__dirname, '..', 'public', 'logo.png');
}

function getBundledNodeLaunchBinary() {
  return process.execPath;
}

function getDesktopUrl() {
  return process.env.METACELLS_DESKTOP_URL || DEFAULT_URL;
}

function getBundledRuntimeRoot() {
  const runtimeRoot = path.join(process.resourcesPath, 'desktop-runtime');
  const manifestPath = path.join(runtimeRoot, 'manifest.json');

  if (!app.isPackaged || !fs.existsSync(manifestPath)) {
    return null;
  }

  return runtimeRoot;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STARTUP_SLIDES = [
  {
    eyebrow: 'AI-native spreadsheet',
    title: 'Everything lives in cells',
    text:
      'MetaCells turns prompts, formulas, files, reports, connectors, and actions into one visible spreadsheet runtime.',
    example: "Input:@idea:[Describe your startup idea]\n'Summarize the idea in one sentence: @idea",
  },
  {
    eyebrow: 'Formula patterns',
    title: 'Ask for one answer, a list, or a table',
    text:
      'Single-quote formulas return one answer, > spills lists downward, and # generates structured tables.',
    example: "'Write 3 launch taglines for @idea\n>top 10 problems that @idea solves\n#compare @idea with competitors;4;6",
  },
  {
    eyebrow: 'Mentioning',
    title: 'Reference cells, ranges, files, and hidden context',
    text:
      'Use @idea for named cells, @@brief for hidden AI context, and @policy to feed extracted file contents into prompts.',
    example: "'Write with @@brief and @idea\n'Summarise @policy\n'Summarise A1:B5",
  },
  {
    eyebrow: 'Reports and files',
    title: 'Collect input directly in the workbook',
    text:
      'Report inputs and file pickers write back into cells, so AI and formulas can work with the latest user-provided context.',
    example: 'Input:@case:[Enter your business case]\nFile:@policy:[Upload policy PDF]',
  },
  {
    eyebrow: 'Actions and automation',
    title: 'Cells can trigger real work',
    text:
      'Use channels and workflow formulas to send messages, generate reports, and update downstream cells.',
    example:
      '/tg Launch update is live\n/sf:send:{"to":"team@example.com","subj":"Status","body":"See @report"}\n=update(@target, "#new prompt;4;6")',
  },
];

const STARTUP_STAGES = {
  preparing: {
    progress: 12,
    label: 'Preparing workspace',
    detail: 'Loading the desktop shell and getting the workbook runtime ready.',
  },
  database: {
    progress: 38,
    label: 'Loading local data',
    detail: 'Opening the embedded database for workbooks, files, and settings.',
  },
  backend: {
    progress: 72,
    label: 'Starting workbook engine',
    detail: 'Launching the bundled app server so formulas, AI flows, and reports are ready.',
  },
  finalizing: {
    progress: 92,
    label: 'Opening MetaCells',
    detail: 'Finishing the local startup checks and switching to your workbook.',
  },
};

function buildPage(title, body, footer = '') {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: linear-gradient(180deg, #f7f7f5 0%, #ece9e0 100%);
        color: #1f2937;
      }
      main {
        width: min(700px, calc(100vw - 48px));
        padding: 28px 30px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.94);
        box-shadow: 0 18px 50px rgba(0, 0, 0, 0.12);
      }
      h1 {
        margin: 0 0 10px;
        font-size: 28px;
      }
      p {
        margin: 0 0 14px;
        line-height: 1.45;
      }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 13px;
        background: #f3f4f6;
        padding: 2px 6px;
        border-radius: 6px;
      }
      pre {
        margin: 14px 0 0;
        padding: 14px;
        overflow: auto;
        border-radius: 12px;
        background: #111827;
        color: #f9fafb;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 13px;
        white-space: pre-wrap;
      }
      .muted {
        color: #6b7280;
        font-size: 14px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      ${body}
      ${footer ? `<pre>${escapeHtml(footer)}</pre>` : ''}
    </main>
  </body>
</html>`;
}

function buildStartupPage(stage) {
  const stageConfig = STARTUP_STAGES[stage] || STARTUP_STAGES.preparing;
  const slidesMarkup = STARTUP_SLIDES.map(
    (slide, index) => `
      <article class="slide${index === 0 ? ' is-active' : ''}">
        <p class="eyebrow">${escapeHtml(slide.eyebrow)}</p>
        <h2>${escapeHtml(slide.title)}</h2>
        <p class="slide-copy">${escapeHtml(slide.text)}</p>
        <pre>${escapeHtml(slide.example)}</pre>
      </article>`,
  ).join('');

  const dotsMarkup = STARTUP_SLIDES.map(
    (_slide, index) => `<button class="dot${index === 0 ? ' is-active' : ''}" type="button" aria-label="Show slide ${index + 1}"></button>`,
  ).join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Starting MetaCells</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Georgia, "Iowan Old Style", "Palatino Linotype", serif;
        --ink: #15231d;
        --muted: #5d6d66;
        --panel: rgba(255, 252, 245, 0.9);
        --line: rgba(21, 35, 29, 0.12);
        --accent: #1f7a59;
        --accent-soft: rgba(31, 122, 89, 0.14);
        --warm: #f6efe1;
        --gold: #d5b26f;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(213, 178, 111, 0.35), transparent 30%),
          radial-gradient(circle at right 20%, rgba(31, 122, 89, 0.2), transparent 26%),
          linear-gradient(160deg, #f3eddf 0%, #ebe6d8 45%, #e2ebdf 100%);
      }
      .shell {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 32px;
      }
      .frame {
        width: min(1080px, 100%);
        display: grid;
        grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
        gap: 24px;
      }
      .hero,
      .carousel {
        border: 1px solid var(--line);
        border-radius: 28px;
        background: var(--panel);
        backdrop-filter: blur(16px);
        box-shadow: 0 24px 80px rgba(39, 42, 33, 0.14);
      }
      .hero {
        padding: 28px;
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-family: "Segoe UI", sans-serif;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .brand-mark {
        width: 12px;
        height: 12px;
        border-radius: 999px;
        background: linear-gradient(135deg, var(--accent), var(--gold));
        box-shadow: 0 0 0 6px var(--accent-soft);
      }
      h1 {
        margin: 0;
        font-size: clamp(36px, 5vw, 58px);
        line-height: 0.94;
        letter-spacing: -0.04em;
      }
      .intro,
      .stage-detail,
      .caption,
      .slide-copy {
        margin: 0;
        font-size: 16px;
        line-height: 1.55;
        color: var(--muted);
      }
      .progress-meta {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 16px;
        font-family: "Segoe UI", sans-serif;
      }
      .progress-meta strong {
        font-size: 15px;
      }
      .progress-meta span {
        font-size: 13px;
        color: var(--muted);
      }
      .progress-track {
        position: relative;
        overflow: hidden;
        height: 14px;
        border-radius: 999px;
        background: rgba(21, 35, 29, 0.08);
      }
      .progress-bar {
        position: absolute;
        inset: 0 auto 0 0;
        width: ${stageConfig.progress}%;
        border-radius: inherit;
        background:
          linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,255,255,0)) ,
          linear-gradient(90deg, #1f7a59, #2aa16f 65%, #d5b26f 100%);
        transition: width 280ms ease;
      }
      .progress-bar::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(120deg, transparent 20%, rgba(255,255,255,0.35) 40%, transparent 60%);
        animation: shimmer 1.8s linear infinite;
      }
      .caption {
        font-size: 14px;
      }
      .carousel {
        position: relative;
        min-height: 540px;
        padding: 28px;
        overflow: hidden;
      }
      .eyebrow {
        margin: 0 0 12px;
        font-family: "Segoe UI", sans-serif;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--accent);
      }
      .slide {
        position: absolute;
        inset: 28px;
        opacity: 0;
        transform: translateX(24px);
        transition: opacity 320ms ease, transform 320ms ease;
        pointer-events: none;
      }
      .slide.is-active {
        opacity: 1;
        transform: translateX(0);
      }
      .slide h2 {
        margin: 0 0 12px;
        font-size: clamp(28px, 4vw, 40px);
        line-height: 1.04;
        letter-spacing: -0.03em;
      }
      pre {
        margin: 22px 0 0;
        padding: 18px;
        border-radius: 18px;
        background: #16201b;
        color: #f5f3eb;
        overflow: auto;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 13px;
        line-height: 1.55;
        white-space: pre-wrap;
      }
      .dots {
        position: absolute;
        left: 28px;
        right: 28px;
        bottom: 24px;
        display: flex;
        gap: 10px;
      }
      .dot {
        border: 0;
        width: 12px;
        height: 12px;
        border-radius: 999px;
        background: rgba(21, 35, 29, 0.14);
        padding: 0;
      }
      .dot.is-active {
        background: var(--accent);
        box-shadow: 0 0 0 4px var(--accent-soft);
      }
      @keyframes shimmer {
        from { transform: translateX(-100%); }
        to { transform: translateX(220%); }
      }
      @media (max-width: 920px) {
        .frame {
          grid-template-columns: 1fr;
        }
        .carousel {
          min-height: 500px;
        }
      }
      @media (max-width: 640px) {
        .shell {
          padding: 18px;
        }
        .hero,
        .carousel {
          border-radius: 22px;
          padding: 22px;
        }
        .slide {
          inset: 22px 22px 54px;
        }
        .dots {
          left: 22px;
          right: 22px;
          bottom: 18px;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <main class="frame">
        <section class="hero">
          <div class="brand"><span class="brand-mark" aria-hidden="true"></span> MetaCells</div>
          <h1>Opening your local AI workbook runtime</h1>
          <p class="intro">Spreadsheets + AI agents + automations, in one open system.</p>
          <div class="progress-meta">
            <strong>${escapeHtml(stageConfig.label)}</strong>
            <span>${stageConfig.progress}%</span>
          </div>
          <div class="progress-track" aria-hidden="true">
            <div class="progress-bar"></div>
          </div>
          <p class="stage-detail">${escapeHtml(stageConfig.detail)}</p>
          <p class="caption">While the local app starts, you can preview the formula patterns, report controls, and mentioning syntax used across MetaCells.</p>
        </section>
        <section class="carousel" aria-label="MetaCells feature highlights">
          ${slidesMarkup}
          <div class="dots" aria-hidden="true">${dotsMarkup}</div>
        </section>
      </main>
    </div>
    <script>
      const slides = Array.from(document.querySelectorAll('.slide'));
      const dots = Array.from(document.querySelectorAll('.dot'));
      let index = 0;
      function render(nextIndex) {
        index = nextIndex;
        slides.forEach((slide, slideIndex) => {
          slide.classList.toggle('is-active', slideIndex === index);
        });
        dots.forEach((dot, dotIndex) => {
          dot.classList.toggle('is-active', dotIndex === index);
        });
      }
      dots.forEach((dot, dotIndex) => {
        dot.addEventListener('click', () => render(dotIndex));
      });
      setInterval(() => render((index + 1) % slides.length), 3600);
    </script>
  </body>
</html>`;
}

function showPage(window, title, body, footer = '') {
  if (!window || window.isDestroyed()) return;
  window.loadURL(
    `data:text/html;charset=UTF-8,${encodeURIComponent(buildPage(title, body, footer))}`,
  );
}

function showStartupStatus(window, stage) {
  if (!window || window.isDestroyed()) return;
  window.loadURL(
    `data:text/html;charset=UTF-8,${encodeURIComponent(buildStartupPage(stage))}`,
  );
}

function showBackendError(window, url, errorText) {
  showPage(
    window,
    'MetaCells backend is not reachable',
    `<p>The desktop shell is trying to open <code>${escapeHtml(url)}</code>, but that server is not responding.</p>
<p>For this build, start the Meteor app first with <code>npm start</code>, launch Electron in development with <code>npm run desktop:dev</code>, or package a self-contained app with <code>npm run desktop:dist</code> or the matching platform target.</p>`,
    errorText,
  );
}

function navigateMainWindow(pathname = '/') {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const targetUrl = new URL(pathname, `${getBaseAppUrl()}/`).toString();
  mainWindow.loadURL(targetUrl);
}

function installApplicationMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              {
                label: 'Settings…',
                accelerator: 'Cmd+,',
                click: () => navigateMainWindow('/settings'),
              },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Home',
          accelerator: isMac ? 'Cmd+Shift+H' : 'Ctrl+Shift+H',
          click: () => navigateMainWindow('/'),
        },
        {
          label: 'Settings…',
          accelerator: isMac ? 'Cmd+,' : 'Ctrl+,',
          click: () => navigateMainWindow('/settings'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: isMac
        ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
        : [{ role: 'minimize' }, { role: 'close' }],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      showBackendError(window, validatedURL || getDesktopUrl(), `${errorCode} ${errorDescription}`.trim());
    },
  );

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  return window;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate a free port')));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on('error', reject);
  });
}

function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for tcp://127.0.0.1:${port}`));
          return;
        }
        setTimeout(tryConnect, 500);
      });
    };

    tryConnect();
  });
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const reachable = await new Promise((resolve) => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve(Boolean(response.statusCode && response.statusCode < 500));
      });
      request.on('error', () => resolve(false));
      request.setTimeout(1000, () => {
        request.destroy();
        resolve(false);
      });
    });
    if (reachable) return;
    await wait(750);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function pipeLogs(logPath, child, name) {
  const stream = fs.createWriteStream(logPath, { flags: 'a' });
  if (child.stdout) child.stdout.pipe(stream);
  if (child.stderr) child.stderr.pipe(stream);
  child.on('error', (error) => {
    stream.write(`\n[${name}] spawn error\n${error && error.stack ? error.stack : String(error)}\n`);
    writeBootstrapLog(`${name} spawn error`, error);
  });
  child.on('exit', (code, signal) => {
    stream.write(`\n[${name}] exited code=${code} signal=${signal}\n`);
    stream.end();
  });
}

async function startBundledBackend(window, runtimeRoot) {
  const manifestPath = path.join(runtimeRoot, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const userDataRoot = app.getPath('userData');
  const logsDir = path.join(userDataRoot, 'logs');
  const mongoDataDir = path.join(userDataRoot, 'mongo-data');

  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(mongoDataDir, { recursive: true });

  const mongoPort = await getFreePort();
  const appPort = await getFreePort();
  const mongoUrl = `mongodb://127.0.0.1:${mongoPort}/metacells`;
  const appUrl = `http://127.0.0.1:${appPort}`;

  showStartupStatus(window, 'database');
  const mongoBinary = path.join(runtimeRoot, manifest.mongo.binary);
  writeBootstrapLog(`Starting MongoDB from ${mongoBinary}`);
  const mongoProcess = spawn(
    mongoBinary,
    ['--dbpath', mongoDataDir, '--port', String(mongoPort), '--bind_ip', '127.0.0.1', '--nounixsocket'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  pipeLogs(path.join(logsDir, 'mongodb.log'), mongoProcess, 'mongod');
  await waitForPort(mongoPort, 30000);

  showStartupStatus(window, 'backend');
  const serverEntry = path.join(runtimeRoot, manifest.backend.main);
  writeBootstrapLog(`Starting backend from ${serverEntry}`);
  const serverProcess = spawn(getBundledNodeLaunchBinary(), [serverEntry], {
    cwd: path.dirname(serverEntry),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(appPort),
      ROOT_URL: appUrl,
      MONGO_URL: mongoUrl,
      BIND_IP: '127.0.0.1',
      METACELLS_ROLE: 'web',
      NODE_ENV: 'production',
    },
  });
  pipeLogs(path.join(logsDir, 'server.log'), serverProcess, 'meteor');

  backendState = {
    appUrl,
    mongoProcess,
    serverProcess,
  };

  await waitForHttp(appUrl, 60000);
  return appUrl;
}

function stopBundledBackend() {
  if (!backendState) return;
  const { serverProcess, mongoProcess } = backendState;
  backendState = null;

  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill('SIGTERM');
  }
  if (mongoProcess && !mongoProcess.killed) {
    mongoProcess.kill('SIGTERM');
  }
}

async function resolveLaunchUrl(window) {
  const runtimeRoot = getBundledRuntimeRoot();
  if (runtimeRoot) {
    writeBootstrapLog(`Using bundled runtime ${runtimeRoot}`);
    return startBundledBackend(window, runtimeRoot);
  }
  writeBootstrapLog(`Using external desktop URL ${getDesktopUrl()}`);
  return getDesktopUrl();
}

process.on('uncaughtException', (error) => {
  showFatalStartupError('MetaCells desktop crashed during startup', error);
});

process.on('unhandledRejection', (error) => {
  showFatalStartupError('MetaCells desktop failed during startup', error);
});

writeBootstrapLog(`Main process module loaded (platform=${process.platform}, packaged=${app.isPackaged})`);

app.whenReady().then(async () => {
  writeBootstrapLog(`Electron app ready (packaged=${app.isPackaged}, platform=${process.platform})`);
  installApplicationMenu();
  mainWindow = createWindow();
  showStartupStatus(mainWindow, 'preparing');

  try {
    const targetUrl = await resolveLaunchUrl(mainWindow);
    showStartupStatus(mainWindow, 'finalizing');
    if (!mainWindow || mainWindow.isDestroyed()) return;
    await mainWindow.loadURL(targetUrl);
    if (!app.isPackaged) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } catch (error) {
    showBackendError(
      mainWindow,
      getDesktopUrl(),
      error && error.stack ? error.stack : String(error),
    );
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
      try {
        const targetUrl = backendState?.appUrl || (await resolveLaunchUrl(mainWindow));
        if (!mainWindow || mainWindow.isDestroyed()) return;
        await mainWindow.loadURL(targetUrl);
      } catch (error) {
        showBackendError(
          mainWindow,
          getDesktopUrl(),
          error && error.stack ? error.stack : String(error),
        );
      }
    }
  });
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopBundledBackend();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
