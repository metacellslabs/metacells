import {
  getRegisteredAIProviders,
} from './providers/index.js';
import {
  getRegisteredChannelConnectors,
} from '../channels/connectors/index.js';

export const DEFAULT_AI_PROVIDERS = getRegisteredAIProviders();
export const DEFAULT_CHANNEL_CONNECTORS = getRegisteredChannelConnectors();
export const DEFAULT_JOB_SETTINGS = {
  workerEnabled: true,
  aiChatConcurrency: 3,
  aiChatMaxAttempts: 3,
  aiChatRetryDelayMs: 750,
  aiChatTimeoutMs: 180000,
  aiChatLeaseTimeoutMs: 60000,
  aiChatHeartbeatIntervalMs: 15000,
  fileExtractConcurrency: 1,
  fileExtractMaxAttempts: 3,
  fileExtractRetryDelayMs: 1000,
  fileExtractTimeoutMs: 120000,
  fileExtractLeaseTimeoutMs: 60000,
  fileExtractHeartbeatIntervalMs: 15000,
};
