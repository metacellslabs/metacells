import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import http from 'http';
import { connectToDatabase } from './lib/db.js';
import { getMethodHandler, getRegisteredMethodNames } from './lib/rpc.js';
import { runStartupHooks } from './lib/startup-hooks.js';
import { setupWorkbookWebSocketServer } from './server/ws.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Import all API modules (triggers registerMethods calls) ---
import './imports/api/settings/index.js';
import './imports/api/sheets/index.js';
import './imports/api/ai/index.js';
import './imports/api/jobs/index.js';
import './imports/api/files/index.js';
import './imports/api/hub/index.js';
import './imports/api/artifacts/index.js';
import './imports/api/assistant/index.js';
import './imports/api/schedules/index.js';
import './imports/api/testing/index.js';

// --- Import channel system ---
import { startChannelPollingWorker } from './imports/api/channels/server/index.js';

// --- Import startup validation ---
import { validateDiscoveredFormulasOnServer } from './imports/startup/server/validate-formulas.js';
import { validateDiscoveredAIProvidersOnServer } from './imports/startup/server/validate-ai-providers.js';
import { validateDiscoveredChannelConnectorsOnServer } from './imports/startup/server/validate-channel-connectors.js';

// --- Import route handlers ---
import { createArtifactMiddleware } from './imports/api/artifacts/server.js';
import { createChannelEventAttachmentMiddleware } from './imports/api/channels/events-server.js';

// --- Import init functions ---
import { initSettings, getJobSettingsSync } from './imports/api/settings/index.js';
import { initSheets } from './imports/api/sheets/index.js';
import {
  registerJobsRuntimeHooks,
  startJobsWorker,
} from './imports/api/jobs/index.js';

// --- Import runtime role ---
import { getRuntimeRole, isWorkerRuntime } from './imports/startup/server/runtime-role.js';

// --- Build Express app ---
const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- RPC endpoint ---
app.post('/api/rpc', async (req, res) => {
  const { method, params } = req.body;

  if (!method || typeof method !== 'string') {
    return res.status(400).json({ error: 'Missing "method" field' });
  }

  const handler = getMethodHandler(method);

  if (!handler) {
    return res.status(404).json({ error: `Unknown method: ${method}` });
  }

  try {
    const result = await handler(...(Array.isArray(params) ? params : []));
    res.json({ result: result !== undefined ? result : null });
  } catch (err) {
    const statusCode = err.statusCode || (err.error ? 400 : 500);
    res.status(statusCode).json({
      error: err.reason || err.message || 'Internal server error',
      errorType: err.error || undefined,
      details:
        err && err.details && typeof err.details === 'object'
          ? err.details
          : undefined,
      statusCode,
    });
  }
});

// --- Static asset routes ---
app.use(createArtifactMiddleware());
app.use(createChannelEventAttachmentMiddleware());

// --- Serve frontend (Vite dev middleware or production static files) ---
async function setupFrontend() {
  const clientDir = path.join(__dirname, 'dist', 'client');
  app.use(express.static(clientDir));
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

// --- Start server ---
const PORT = parseInt(process.env.PORT || '3400', 10);

function getDatabasePath() {
  if (process.env.SQLITE_PATH) {
    return process.env.SQLITE_PATH;
  }

  const dataDir = path.join(__dirname, '.data', 'sqlite');
  fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, 'metacells.db');
}

async function main() {
  // 1. Connect to MongoDB
  const databasePath = getDatabasePath();
  await connectToDatabase(databasePath);

  // 2. Run startup validation
  const formulaHashes = validateDiscoveredFormulasOnServer();
  console.log('[formulas] registry.validated', {
    count: formulaHashes.length,
    files: formulaHashes,
  });

  const providerHashes = validateDiscoveredAIProvidersOnServer();
  console.log('[providers] registry.validated', {
    count: providerHashes.length,
    files: providerHashes,
  });

  const channelConnectorHashes = validateDiscoveredChannelConnectorsOnServer();
  console.log('[channels] registry.validated', {
    count: channelConnectorHashes.length,
    files: channelConnectorHashes,
  });

  // 3. Initialize data
  await initSettings();
  await initSheets();

  // 4. Run startup hooks registered by server modules
  await runStartupHooks();

  // 5. Set up job system
  console.log('[runtime] role', { role: getRuntimeRole() });
  registerJobsRuntimeHooks({
    isWorkerEnabled: () => getJobSettingsSync().workerEnabled,
  });

  if (isWorkerRuntime()) {
    startJobsWorker();
    startChannelPollingWorker();
  } else {
    console.log(
      '[runtime] web mode active; background workers are disabled in this process',
    );
  }

  // 6. Log registered methods
  const methodNames = getRegisteredMethodNames();
  console.log('[rpc] registered methods', { count: methodNames.length, methods: methodNames });

  // 7. Set up frontend serving (Vite dev or production static)
  await setupFrontend();

  // 8. Start listening
  setupWorkbookWebSocketServer(server);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] listening on http://0.0.0.0:${PORT}`);
  });
}

main().catch((err) => {
  console.error('[server] fatal startup error', err);
  process.exit(1);
});
