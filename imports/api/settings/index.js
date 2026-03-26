import { defineModel } from '../../../lib/orm.js';
import { AppError } from '../../../lib/app-error.js';
import { check, Match } from '../../../lib/check.js';
import { registerMethods } from '../../../lib/rpc.js';
import {
  getRegisteredAIProviderById,
} from './providers/index.js';
import {
  getRegisteredChannelConnectorById,
} from '../channels/connectors/index.js';
import {
  DEFAULT_AI_PROVIDERS,
  DEFAULT_CHANNEL_CONNECTORS,
  DEFAULT_JOB_SETTINGS,
} from './client-defaults.js';

export { DEFAULT_AI_PROVIDERS, DEFAULT_CHANNEL_CONNECTORS, DEFAULT_JOB_SETTINGS };

export const AppSettings = defineModel('app_settings');

export const DEFAULT_SETTINGS_ID = 'default';
export const DEFAULT_DEEPSEEK_PROVIDER =
  getRegisteredAIProviderById('deepseek');
export const DEFAULT_LM_STUDIO_PROVIDER =
  getRegisteredAIProviderById('lm-studio');
let cachedJobSettings = { ...DEFAULT_JOB_SETTINGS };
let cachedActiveAIProviderType = String(
  DEFAULT_DEEPSEEK_PROVIDER?.type || DEFAULT_AI_PROVIDERS[0]?.type || '',
);

function getContainerHostAlias() {
  return String(process.env.METACELLS_CONTAINER_HOST_ALIAS || '').trim();
}

function rewriteLoopbackBaseUrl(rawUrl) {
  const baseUrl = String(rawUrl || '').trim();
  const alias = getContainerHostAlias();
  if (!baseUrl || !alias) return baseUrl;

  try {
    const parsed = new URL(baseUrl);
    const host = String(parsed.hostname || '').trim().toLowerCase();
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]') {
      return baseUrl;
    }
    parsed.hostname = alias;
    return parsed.toString().replace(/\/$/, '');
  } catch (error) {
    return baseUrl;
  }
}

function getDefaultProviderByType(type) {
  const target = String(type || '');
  return (
    DEFAULT_AI_PROVIDERS.find(
      (provider) => provider && provider.type === target,
    ) ||
    DEFAULT_AI_PROVIDERS[0] ||
    null
  );
}

function normalizeProvider(provider, fallback) {
  const source = provider && typeof provider === 'object' ? provider : {};
  const base = fallback || DEFAULT_AI_PROVIDERS[0] || {};
  return {
    id: String(source.id || base.id || '').trim(),
    name: String(source.name || base.name || '').trim(),
    type: String(source.type || base.type || '').trim(),
    baseUrl: String(source.baseUrl || base.baseUrl || '').trim(),
    model: String(source.model || base.model || '').trim(),
    apiKey: String(source.apiKey || '').trim(),
    enabled: source.enabled !== false,
    availableModels: Array.isArray(base.availableModels)
      ? base.availableModels.slice()
      : [],
    fields: Array.isArray(base.fields) ? base.fields.slice() : [],
  };
}

function normalizeProviders(providers) {
  const input = Array.isArray(providers) ? providers : [];
  const byId = new Map();
  const byType = new Map();
  const typeCounts = DEFAULT_AI_PROVIDERS.reduce((acc, provider) => {
    const type = String(provider && provider.type ? provider.type : '');
    if (!type) return acc;
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  for (let i = 0; i < input.length; i += 1) {
    const provider = input[i];
    if (!provider || typeof provider !== 'object') continue;
    if (provider.id) byId.set(String(provider.id), provider);
    if (provider.type && typeCounts[String(provider.type)] === 1) {
      byType.set(String(provider.type), provider);
    }
  }

  return DEFAULT_AI_PROVIDERS.map((provider) => {
    const matched = byId.get(provider.id) || byType.get(provider.type) || null;
    return normalizeProvider(matched, provider);
  });
}

function createDefaultSettingsDoc() {
  const now = new Date();
  return {
    _id: DEFAULT_SETTINGS_ID,
    aiProviders: normalizeProviders(DEFAULT_AI_PROVIDERS),
    activeAIProviderId: String(
      DEFAULT_DEEPSEEK_PROVIDER?.id || DEFAULT_AI_PROVIDERS[0]?.id || '',
    ),
    communicationChannels: [],
    jobSettings: { ...DEFAULT_JOB_SETTINGS },
    createdAt: now,
    updatedAt: now,
  };
}

function getDefaultChannelConnectorById(connectorId) {
  const target = String(connectorId || '');
  return (
    DEFAULT_CHANNEL_CONNECTORS.find(
      (connector) => connector && connector.id === target,
    ) || null
  );
}

function normalizeChannelSettings(connector, settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const fields = Array.isArray(connector && connector.settingsFields)
    ? connector.settingsFields
    : [];
  const next = {};

  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i];
    const key = String(field.key || '');
    next[key] = Object.prototype.hasOwnProperty.call(source, key)
      ? source[key]
      : field.defaultValue == null
        ? ''
        : field.defaultValue;
  }

  return next;
}

function normalizeChannels(channels) {
  const input = Array.isArray(channels) ? channels : [];
  return input
    .filter((channel) => channel && typeof channel === 'object')
    .map((channel) => {
      const connector = getRegisteredChannelConnectorById(
        channel.connectorId || channel.type,
      );
      if (!connector) return null;
      return {
        id: String(channel.id || '').trim(),
        connectorId: connector.id,
        type: connector.type,
        label: String(channel.label || connector.name || '').trim(),
        enabled: channel.enabled !== false,
        status: String(channel.status || 'pending').trim(),
        settings: normalizeChannelSettings(connector, channel.settings),
        lastTestMessage: String(channel.lastTestMessage || '').trim(),
        lastTestAt: channel.lastTestAt || null,
        lastSeenUid: Number.isFinite(Number(channel.lastSeenUid))
          ? Number(channel.lastSeenUid)
          : 0,
        lastEventId: String(channel.lastEventId || '').trim(),
        lastEventPreview:
          channel.lastEventPreview &&
          typeof channel.lastEventPreview === 'object'
            ? { ...channel.lastEventPreview }
            : null,
        lastEventAt: channel.lastEventAt || null,
        lastPolledAt: channel.lastPolledAt || null,
        watchError: String(channel.watchError || '').trim(),
        createdAt: channel.createdAt || null,
        updatedAt: channel.updatedAt || null,
      };
    })
    .filter(Boolean);
}

function normalizeJobSettings(jobSettings) {
  const source =
    jobSettings && typeof jobSettings === 'object' ? jobSettings : {};
  return {
    workerEnabled: source.workerEnabled !== false,
    aiChatConcurrency: Math.max(
      1,
      parseInt(source.aiChatConcurrency, 10) ||
        DEFAULT_JOB_SETTINGS.aiChatConcurrency,
    ),
    aiChatMaxAttempts: Math.max(
      1,
      parseInt(source.aiChatMaxAttempts, 10) ||
        DEFAULT_JOB_SETTINGS.aiChatMaxAttempts,
    ),
    aiChatRetryDelayMs: Math.max(
      250,
      parseInt(source.aiChatRetryDelayMs, 10) ||
        DEFAULT_JOB_SETTINGS.aiChatRetryDelayMs,
    ),
    aiChatTimeoutMs: Math.max(
      1000,
      parseInt(source.aiChatTimeoutMs, 10) ||
        DEFAULT_JOB_SETTINGS.aiChatTimeoutMs,
    ),
    aiChatLeaseTimeoutMs: Math.max(
      1000,
      parseInt(source.aiChatLeaseTimeoutMs, 10) ||
        DEFAULT_JOB_SETTINGS.aiChatLeaseTimeoutMs,
    ),
    aiChatHeartbeatIntervalMs: Math.max(
      500,
      parseInt(source.aiChatHeartbeatIntervalMs, 10) ||
        DEFAULT_JOB_SETTINGS.aiChatHeartbeatIntervalMs,
    ),
    fileExtractConcurrency: Math.max(
      1,
      parseInt(source.fileExtractConcurrency, 10) ||
        DEFAULT_JOB_SETTINGS.fileExtractConcurrency,
    ),
    fileExtractMaxAttempts: Math.max(
      1,
      parseInt(source.fileExtractMaxAttempts, 10) ||
        DEFAULT_JOB_SETTINGS.fileExtractMaxAttempts,
    ),
    fileExtractRetryDelayMs: Math.max(
      250,
      parseInt(source.fileExtractRetryDelayMs, 10) ||
        DEFAULT_JOB_SETTINGS.fileExtractRetryDelayMs,
    ),
    fileExtractTimeoutMs: Math.max(
      1000,
      parseInt(source.fileExtractTimeoutMs, 10) ||
        DEFAULT_JOB_SETTINGS.fileExtractTimeoutMs,
    ),
    fileExtractLeaseTimeoutMs: Math.max(
      1000,
      parseInt(source.fileExtractLeaseTimeoutMs, 10) ||
        DEFAULT_JOB_SETTINGS.fileExtractLeaseTimeoutMs,
    ),
    fileExtractHeartbeatIntervalMs: Math.max(
      500,
      parseInt(source.fileExtractHeartbeatIntervalMs, 10) ||
        DEFAULT_JOB_SETTINGS.fileExtractHeartbeatIntervalMs,
    ),
  };
}

function updateCachedJobSettings(jobSettings) {
  cachedJobSettings = normalizeJobSettings(jobSettings);
  return cachedJobSettings;
}

function updateCachedActiveAIProviderType(settingsDoc) {
  const settings =
    settingsDoc && typeof settingsDoc === 'object' ? settingsDoc : {};
  const providers = normalizeProviders(settings.aiProviders);
  const fallbackActiveId = String(
    DEFAULT_DEEPSEEK_PROVIDER?.id || DEFAULT_AI_PROVIDERS[0]?.id || '',
  );
  const activeId = String(settings.activeAIProviderId || fallbackActiveId);
  const activeProvider =
    providers.find((item) => item && item.id === activeId && item.enabled !== false) ||
    providers.find((item) => item && item.enabled !== false) ||
    normalizeProvider(DEFAULT_AI_PROVIDERS[0], DEFAULT_AI_PROVIDERS[0]);
  cachedActiveAIProviderType = String(
    (activeProvider && activeProvider.type) || '',
  ).trim();
  return cachedActiveAIProviderType;
}

export async function ensureDefaultSettings() {
  const existing = await AppSettings.findOneAsync(DEFAULT_SETTINGS_ID);
  if (existing) {
    updateCachedJobSettings(existing.jobSettings);
    updateCachedActiveAIProviderType(existing);
    return existing;
  }

  const doc = createDefaultSettingsDoc();
  try {
    await AppSettings.insertAsync(doc);
    updateCachedJobSettings(doc.jobSettings);
    updateCachedActiveAIProviderType(doc);
    return doc;
  } catch (error) {
    if (!error || String(error.code || '') !== '11000') {
      throw error;
    }
    const current = await AppSettings.findOneAsync(DEFAULT_SETTINGS_ID);
    if (current) {
      updateCachedJobSettings(current.jobSettings);
      updateCachedActiveAIProviderType(current);
      return current;
    }
    throw error;
  }
}

export async function resetLMStudioBaseUrlInDb() {
  await ensureDefaultSettings();

  const current = await AppSettings.findOneAsync(DEFAULT_SETTINGS_ID);
  const providers = normalizeProviders(current && current.aiProviders);
  const lmStudioDefault = getDefaultProviderByType('lm_studio');
  const nextProviders = providers.map((provider) => {
    if (provider.type !== 'lm_studio' || !lmStudioDefault) return provider;
    return {
      ...provider,
      id: lmStudioDefault.id,
      name: lmStudioDefault.name,
      type: lmStudioDefault.type,
      baseUrl: lmStudioDefault.baseUrl,
      model: lmStudioDefault.model,
      availableModels: lmStudioDefault.availableModels || [],
      fields: lmStudioDefault.fields || [],
    };
  });

  const fallbackActiveId = String(
    DEFAULT_DEEPSEEK_PROVIDER?.id || DEFAULT_AI_PROVIDERS[0]?.id || '',
  );
  await AppSettings.updateAsync(
    { _id: DEFAULT_SETTINGS_ID },
    {
      $set: {
        aiProviders: nextProviders,
        activeAIProviderId:
          String((current && current.activeAIProviderId) || '') ||
          fallbackActiveId,
        updatedAt: new Date(),
      },
    },
  );

  return String(lmStudioDefault?.baseUrl || '');
}

export async function getLMStudioBaseUrl() {
  const settings = await ensureDefaultSettings();
  const providers = normalizeProviders(settings.aiProviders);
  const provider = providers.find(
    (item) => item && item.type === 'lm_studio' && item.enabled !== false,
  );
  return rewriteLoopbackBaseUrl(
    (provider && provider.baseUrl) ||
      String(DEFAULT_LM_STUDIO_PROVIDER?.baseUrl || ''),
  );
}

export async function getActiveAIProvider() {
  const settings = await ensureDefaultSettings();
  const providers = normalizeProviders(settings.aiProviders);
  const fallbackActiveId = String(
    DEFAULT_DEEPSEEK_PROVIDER?.id || DEFAULT_AI_PROVIDERS[0]?.id || '',
  );
  const activeId = String(
    (settings && settings.activeAIProviderId) || fallbackActiveId,
  );
  const activeProvider = providers.find(
    (item) => item && item.id === activeId && item.enabled !== false,
  );
  if (activeProvider) {
    return {
      ...activeProvider,
      baseUrl: rewriteLoopbackBaseUrl(activeProvider.baseUrl),
    };
  }
  const fallbackProvider =
    providers.find((item) => item && item.enabled !== false) ||
    normalizeProvider(DEFAULT_AI_PROVIDERS[0], DEFAULT_AI_PROVIDERS[0]);
  return {
    ...fallbackProvider,
    baseUrl: rewriteLoopbackBaseUrl(fallbackProvider.baseUrl),
  };
}

export async function getJobSettings() {
  const settings = await ensureDefaultSettings();
  return normalizeJobSettings(settings && settings.jobSettings);
}

export function getJobSettingsSync() {
  return normalizeJobSettings(cachedJobSettings);
}

export function getEffectiveAIChatConcurrencySync() {
  const providerType = String(cachedActiveAIProviderType || '')
    .trim()
    .toLowerCase();
  if (providerType === 'openai' || providerType === 'gemini') {
    return 10;
  }
  return normalizeJobSettings(cachedJobSettings).aiChatConcurrency;
}

export async function initSettings() {
  const settings = await ensureDefaultSettings();
  updateCachedJobSettings(settings && settings.jobSettings);
  updateCachedActiveAIProviderType(settings);
  const resetUrl = await resetLMStudioBaseUrlInDb();
  console.log('[settings] lmStudioBaseUrl.reset', { baseUrl: resetUrl });
}


registerMethods({
  async 'settings.get'() {
    return AppSettings.findOneAsync(
      DEFAULT_SETTINGS_ID,
      {
        fields: {
          aiProviders: 1,
          activeAIProviderId: 1,
          communicationChannels: 1,
          jobSettings: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    );
  },

  async 'settings.resetLMStudioBaseUrl'() {
    return resetLMStudioBaseUrlInDb();
  },

  async 'settings.upsertAIProvider'(provider) {
    check(provider, {
      id: String,
      name: String,
      type: String,
      baseUrl: String,
      model: Match.Maybe(String),
      apiKey: Match.Maybe(String),
      enabled: Boolean,
    });

    await ensureDefaultSettings();

    const current = await AppSettings.findOneAsync(DEFAULT_SETTINGS_ID);
    const nextProviders = normalizeProviders(current && current.aiProviders);
    const fallback =
      getRegisteredAIProviderById(provider.id) ||
      getDefaultProviderByType(provider.type);
    const nextProvider = normalizeProvider(provider, fallback);

    const index = nextProviders.findIndex(
      (item) => item && item.id === nextProvider.id,
    );
    if (index === -1) {
      nextProviders.push(nextProvider);
    } else {
      nextProviders[index] = nextProvider;
    }

    await AppSettings.updateAsync(
      { _id: DEFAULT_SETTINGS_ID },
      {
        $set: {
          aiProviders: nextProviders,
          updatedAt: new Date(),
        },
      },
    );
    updateCachedActiveAIProviderType({
      ...(current || {}),
      aiProviders: nextProviders,
    });
  },

  async 'settings.setActiveAIProvider'(providerId) {
    check(providerId, String);

    await ensureDefaultSettings();
    const current = await AppSettings.findOneAsync(DEFAULT_SETTINGS_ID);
    const providers = normalizeProviders(current && current.aiProviders);
    const exists = providers.some((item) => item && item.id === providerId);
    if (!exists) {
      throw new AppError('provider-not-found', 'AI provider not found');
    }

    await AppSettings.updateAsync(
      { _id: DEFAULT_SETTINGS_ID },
      {
        $set: {
          activeAIProviderId: String(providerId),
          updatedAt: new Date(),
        },
      },
    );
    updateCachedActiveAIProviderType({
      ...(current || {}),
      activeAIProviderId: String(providerId),
      aiProviders: providers,
    });
  },

  async 'settings.updateJobSettings'(jobSettings) {
    check(jobSettings, {
      workerEnabled: Boolean,
      aiChatConcurrency: Number,
      aiChatMaxAttempts: Number,
      aiChatRetryDelayMs: Number,
      aiChatTimeoutMs: Number,
      aiChatLeaseTimeoutMs: Number,
      aiChatHeartbeatIntervalMs: Number,
      fileExtractConcurrency: Number,
      fileExtractMaxAttempts: Number,
      fileExtractRetryDelayMs: Number,
      fileExtractTimeoutMs: Number,
      fileExtractLeaseTimeoutMs: Number,
      fileExtractHeartbeatIntervalMs: Number,
    });

    await ensureDefaultSettings();
    const nextJobSettings = normalizeJobSettings(jobSettings);

    await AppSettings.updateAsync(
      { _id: DEFAULT_SETTINGS_ID },
      {
        $set: {
          jobSettings: nextJobSettings,
          updatedAt: new Date(),
        },
      },
    );

    updateCachedJobSettings(nextJobSettings);
    import('../jobs/index.js')
      .then((module) => {
        if (module && typeof module.pokeJobsWorker === 'function') {
          module.pokeJobsWorker();
        }
      })
      .catch(() => {});
    return nextJobSettings;
  },

  async 'settings.addCommunicationChannel'(connectorId) {
    check(connectorId, String);

    await ensureDefaultSettings();
    const connector = getDefaultChannelConnectorById(connectorId);
    if (!connector) {
      throw new AppError(
        'channel-connector-not-found',
        'Communication channel connector not found',
      );
    }

    const current = await AppSettings.findOneAsync(DEFAULT_SETTINGS_ID);
    const nextChannels = normalizeChannels(
      current && current.communicationChannels,
    );
    const existing = nextChannels.find(
      (item) => item && item.connectorId === connector.id,
    );
    if (!existing) {
      nextChannels.push({
        id: `${connector.id}-${Date.now()}`,
        connectorId: connector.id,
        type: connector.type,
        label: String(
          connector.settingsFields.find((field) => field.key === 'label')
            ?.defaultValue || connector.name,
        ),
        enabled: true,
        status: 'pending',
        settings: normalizeChannelSettings(connector, {}),
        createdAt: new Date(),
        updatedAt: new Date(),
        lastTestMessage: '',
        lastTestAt: null,
        lastSeenUid: 0,
        lastEventId: '',
        lastEventPreview: null,
        lastEventAt: null,
        lastPolledAt: null,
        watchError: '',
      });
    }

    await AppSettings.updateAsync(
      { _id: DEFAULT_SETTINGS_ID },
      {
        $set: {
          communicationChannels: nextChannels,
          updatedAt: new Date(),
        },
      },
    );
  },
});
