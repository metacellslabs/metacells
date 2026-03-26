export function buildProviderDrafts(providers, savedProviders) {
  const registered = Array.isArray(providers) ? providers : [];
  const saved = Array.isArray(savedProviders) ? savedProviders : [];
  const byId = new Map();
  const byType = new Map();
  const typeCounts = registered.reduce((acc, provider) => {
    const type = String(provider && provider.type ? provider.type : '');
    if (!type) return acc;
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  for (let i = 0; i < saved.length; i += 1) {
    const provider = saved[i];
    if (!provider || typeof provider !== 'object') continue;
    if (provider.id) byId.set(String(provider.id), provider);
    if (provider.type && typeCounts[String(provider.type)] === 1) {
      byType.set(String(provider.type), provider);
    }
  }

  return registered.reduce((acc, provider) => {
    const persisted = byId.get(provider.id) || byType.get(provider.type) || {};
    acc[provider.id] = {
      ...provider,
      ...persisted,
      id: String(persisted.id || provider.id || ''),
      name: String(persisted.name || provider.name || ''),
      type: String(persisted.type || provider.type || ''),
      baseUrl: String(persisted.baseUrl || provider.baseUrl || ''),
      model: String(persisted.model || provider.model || ''),
      apiKey: String(persisted.apiKey || ''),
      enabled: persisted.enabled !== false,
      availableModels: Array.isArray(provider.availableModels)
        ? provider.availableModels.slice()
        : [],
      fields: Array.isArray(provider.fields) ? provider.fields.slice() : [],
    };
    return acc;
  }, {});
}

export function buildChannelDrafts(connectors, savedChannels) {
  const registered = Array.isArray(connectors) ? connectors : [];
  const saved = Array.isArray(savedChannels) ? savedChannels : [];

  return saved.reduce((acc, channel) => {
    if (!channel || typeof channel !== 'object' || !channel.id) return acc;
    const connector =
      registered.find((item) => item && item.id === channel.connectorId) || null;
    const settings =
      channel.settings && typeof channel.settings === 'object'
        ? channel.settings
        : {};
    const nextSettings = { ...settings };

    if (connector && Array.isArray(connector.settingsFields)) {
      connector.settingsFields.forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(nextSettings, field.key)) {
          nextSettings[field.key] =
            field.defaultValue == null ? '' : field.defaultValue;
        }
      });
    }

    acc[channel.id] = {
      id: String(channel.id || ''),
      connectorId: String(channel.connectorId || ''),
      label: String(channel.label || connector?.name || ''),
      enabled: channel.enabled !== false,
      status: String(channel.status || 'pending'),
      lastTestMessage: String(channel.lastTestMessage || ''),
      lastSeenUid: Number(channel.lastSeenUid) || 0,
      lastEventId: String(channel.lastEventId || ''),
      lastEventPreview:
        channel.lastEventPreview && typeof channel.lastEventPreview === 'object'
          ? channel.lastEventPreview
          : null,
      lastEventAt: channel.lastEventAt || null,
      lastPolledAt: channel.lastPolledAt || null,
      watchError: String(channel.watchError || ''),
      settings: nextSettings,
    };
    return acc;
  }, {});
}

export function buildJobSettingsDraft(jobSettings, defaults) {
  const source = jobSettings && typeof jobSettings === 'object' ? jobSettings : {};
  return {
    workerEnabled: source.workerEnabled !== false,
    aiChatConcurrency:
      Number(source.aiChatConcurrency) || defaults.aiChatConcurrency,
    aiChatMaxAttempts:
      Number(source.aiChatMaxAttempts) || defaults.aiChatMaxAttempts,
    aiChatRetryDelayMs:
      Number(source.aiChatRetryDelayMs) || defaults.aiChatRetryDelayMs,
    aiChatTimeoutMs: Number(source.aiChatTimeoutMs) || defaults.aiChatTimeoutMs,
    aiChatLeaseTimeoutMs:
      Number(source.aiChatLeaseTimeoutMs) || defaults.aiChatLeaseTimeoutMs,
    aiChatHeartbeatIntervalMs:
      Number(source.aiChatHeartbeatIntervalMs) ||
      defaults.aiChatHeartbeatIntervalMs,
    fileExtractConcurrency:
      Number(source.fileExtractConcurrency) || defaults.fileExtractConcurrency,
    fileExtractMaxAttempts:
      Number(source.fileExtractMaxAttempts) || defaults.fileExtractMaxAttempts,
    fileExtractRetryDelayMs:
      Number(source.fileExtractRetryDelayMs) || defaults.fileExtractRetryDelayMs,
    fileExtractTimeoutMs:
      Number(source.fileExtractTimeoutMs) || defaults.fileExtractTimeoutMs,
    fileExtractLeaseTimeoutMs:
      Number(source.fileExtractLeaseTimeoutMs) ||
      defaults.fileExtractLeaseTimeoutMs,
    fileExtractHeartbeatIntervalMs:
      Number(source.fileExtractHeartbeatIntervalMs) ||
      defaults.fileExtractHeartbeatIntervalMs,
  };
}

export function readSettingsTabFromUrl(validTabs) {
  const allowed = Array.isArray(validTabs) ? validTabs : [];
  const fallback = allowed[0] || 'ai';
  try {
    const params = new URLSearchParams(window.location.search || '');
    const tab = String(params.get('tab') || '').trim();
    return allowed.includes(tab) ? tab : fallback;
  } catch (error) {
    return fallback;
  }
}
