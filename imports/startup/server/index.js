import { validateDiscoveredFormulasOnServer } from './validate-formulas.js';
import { validateDiscoveredAIProvidersOnServer } from './validate-ai-providers.js';
import { validateDiscoveredChannelConnectorsOnServer } from './validate-channel-connectors.js';
import { registerArtifactRoute } from '../../api/artifacts/server.js';
import { registerChannelEventAttachmentRoute } from '../../api/channels/events-server.js';
import {
  registerJobsRuntimeHooks,
  startJobsWorker,
} from '../../api/jobs/index.js';
import { getJobSettingsSync } from '../../api/settings/index.js';
import { getRuntimeRole, isWorkerRuntime } from './runtime-role.js';
import '../../api/artifacts/index.js';
import '../../api/ai/index.js';
import { startChannelPollingWorker } from '../../api/channels/server/index.js';
import '../../api/files/index.js';
import '../../api/jobs/index.js';
import '../../api/settings/index.js';
import '../../api/sheets/index.js';

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
registerArtifactRoute();
registerChannelEventAttachmentRoute();
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
