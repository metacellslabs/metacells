import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectToDatabase } from './lib/db.js';
import { getMethodHandler, getRegisteredMethodNames } from './lib/rpc.js';
import { Meteor } from './lib/meteor-compat.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Import all API modules (triggers registerMethods calls) ---
import './imports/api/settings/index.js';
import './imports/api/sheets/index.js';
import './imports/api/ai/index.js';
import './imports/api/jobs/index.js';
import './imports/api/files/index.js';
import './imports/api/artifacts/index.js';
import './imports/api/assistant/index.js';
import './imports/api/schedules/index.js';

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
    });
  }
});

// --- Static asset routes ---
app.use(createArtifactMiddleware());
app.use(createChannelEventAttachmentMiddleware());

// --- Serve frontend (Vite dev middleware or production static files) ---
async function setupFrontend() {
  if (process.env.NODE_ENV === 'production') {
    const clientDir = path.join(__dirname, 'dist', 'client');
    app.use(express.static(clientDir));
    app.get('*', (req, res) => {
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }
}

// --- Start server ---
const PORT = parseInt(process.env.PORT || '3400', 10);

async function getMongoUrl() {
  if (process.env.MONGO_URL) return process.env.MONGO_URL;

  // Dev mode: start an embedded MongoDB instance
  const { MongoMemoryServer } = await import('mongodb-memory-server-core');
  const dbPath = path.join(__dirname, '.data', 'mongodb');
  const { mkdirSync } = await import('fs');
  mkdirSync(dbPath, { recursive: true });

  const mongod = await MongoMemoryServer.create({
    instance: { dbPath, storageEngine: 'wiredTiger' },
  });
  const uri = mongod.getUri();
  console.log('[dev] embedded MongoDB started at', uri);

  // Graceful shutdown
  const stop = async () => { await mongod.stop(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  return uri + 'metacells';
}

async function main() {
  // 1. Connect to MongoDB
  const MONGO_URL = await getMongoUrl();
  await connectToDatabase(MONGO_URL);

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

  // 4. Run Meteor-compat startup hooks (from modules that use Meteor.startup)
  await Meteor._runStartupHooks();

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
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] listening on http://0.0.0.0:${PORT}`);
  });
}

main().catch((err) => {
  console.error('[server] fatal startup error', err);
  process.exit(1);
});
