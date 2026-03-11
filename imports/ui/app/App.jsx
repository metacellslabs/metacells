import { useEffect, useRef, useState } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { mountSpreadsheetApp } from '../metacell/runtime/index.js';
import { HelpOverlay } from '../help/HelpOverlay.jsx';
import {
  AppSettings,
  DEFAULT_AI_PROVIDERS,
  DEFAULT_CHANNEL_CONNECTORS,
  DEFAULT_JOB_SETTINGS,
  DEFAULT_SETTINGS_ID,
} from '../../api/settings/index.js';
import { decodeWorkbookDocument } from '../../api/sheets/workbook-codec.js';
import { Sheets } from '../../api/sheets/index.js';
import { createSheetDocStorage } from '../metacell/sheetDocStorage.js';

function LucideIcon({ size = 18, stroke = 2, children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function buildProviderDrafts(providers, savedProviders) {
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

function buildChannelDrafts(connectors, savedChannels) {
  const registered = Array.isArray(connectors) ? connectors : [];
  const saved = Array.isArray(savedChannels) ? savedChannels : [];

  return saved.reduce((acc, channel) => {
    if (!channel || typeof channel !== 'object' || !channel.id) return acc;
    const connector =
      registered.find((item) => item && item.id === channel.connectorId) ||
      null;
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

function buildJobSettingsDraft(jobSettings) {
  const source =
    jobSettings && typeof jobSettings === 'object' ? jobSettings : {};
  return {
    workerEnabled: source.workerEnabled !== false,
    aiChatConcurrency:
      Number(source.aiChatConcurrency) ||
      DEFAULT_JOB_SETTINGS.aiChatConcurrency,
    aiChatMaxAttempts:
      Number(source.aiChatMaxAttempts) ||
      DEFAULT_JOB_SETTINGS.aiChatMaxAttempts,
    aiChatRetryDelayMs:
      Number(source.aiChatRetryDelayMs) ||
      DEFAULT_JOB_SETTINGS.aiChatRetryDelayMs,
    aiChatTimeoutMs:
      Number(source.aiChatTimeoutMs) || DEFAULT_JOB_SETTINGS.aiChatTimeoutMs,
    aiChatLeaseTimeoutMs:
      Number(source.aiChatLeaseTimeoutMs) ||
      DEFAULT_JOB_SETTINGS.aiChatLeaseTimeoutMs,
    aiChatHeartbeatIntervalMs:
      Number(source.aiChatHeartbeatIntervalMs) ||
      DEFAULT_JOB_SETTINGS.aiChatHeartbeatIntervalMs,
    fileExtractConcurrency:
      Number(source.fileExtractConcurrency) ||
      DEFAULT_JOB_SETTINGS.fileExtractConcurrency,
    fileExtractMaxAttempts:
      Number(source.fileExtractMaxAttempts) ||
      DEFAULT_JOB_SETTINGS.fileExtractMaxAttempts,
    fileExtractRetryDelayMs:
      Number(source.fileExtractRetryDelayMs) ||
      DEFAULT_JOB_SETTINGS.fileExtractRetryDelayMs,
    fileExtractTimeoutMs:
      Number(source.fileExtractTimeoutMs) ||
      DEFAULT_JOB_SETTINGS.fileExtractTimeoutMs,
    fileExtractLeaseTimeoutMs:
      Number(source.fileExtractLeaseTimeoutMs) ||
      DEFAULT_JOB_SETTINGS.fileExtractLeaseTimeoutMs,
    fileExtractHeartbeatIntervalMs:
      Number(source.fileExtractHeartbeatIntervalMs) ||
      DEFAULT_JOB_SETTINGS.fileExtractHeartbeatIntervalMs,
  };
}

function HomePage() {
  useEffect(() => {
    document.body.classList.add('route-home');
    document.body.classList.remove('route-sheet');

    return () => {
      document.body.classList.remove('route-home');
    };
  }, []);

  const { isLoading, sheets } = useTracker(() => {
    const handle = Meteor.subscribe('sheets.list');

    return {
      isLoading: !handle.ready(),
      sheets: Sheets.find(
        {},
        { sort: { updatedAt: -1, createdAt: -1 } },
      ).fetch(),
    };
  });

  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingFormulaTest, setIsCreatingFormulaTest] = useState(false);
  const [isCreatingFinancialModel, setIsCreatingFinancialModel] =
    useState(false);
  const [deletingSheetId, setDeletingSheetId] = useState('');

  const handleCreateSheet = () => {
    if (isCreating) return;
    setIsCreating(true);

    Meteor.callAsync('sheets.create')
      .then((sheetId) => {
        setIsCreating(false);
        window.location.assign(`/metacell/${sheetId}`);
      })
      .catch((error) => {
        setIsCreating(false);
        window.alert(
          error.reason || error.message || 'Failed to create metacell',
        );
      });
  };

  const handleDeleteSheet = (sheetId, sheetName) => {
    if (deletingSheetId) return;
    const confirmed = window.confirm(`Delete metacell "${sheetName}"?`);
    if (!confirmed) return;

    setDeletingSheetId(sheetId);
    Meteor.callAsync('sheets.remove', sheetId)
      .then(() => setDeletingSheetId(''))
      .catch((error) => {
        setDeletingSheetId('');
        window.alert(
          error.reason || error.message || 'Failed to delete metacell',
        );
      });
  };

  const handleCreateFormulaTestSheet = () => {
    if (isCreatingFormulaTest) return;
    setIsCreatingFormulaTest(true);

    Meteor.callAsync('sheets.createFormulaTestWorkbook')
      .then((sheetId) => {
        setIsCreatingFormulaTest(false);
        window.location.assign(`/metacell/${sheetId}`);
      })
      .catch((error) => {
        setIsCreatingFormulaTest(false);
        window.alert(
          error.reason ||
            error.message ||
            'Failed to create formula test metacell',
        );
      });
  };

  const handleCreateFinancialModelSheet = () => {
    if (isCreatingFinancialModel) return;
    setIsCreatingFinancialModel(true);

    Meteor.callAsync('sheets.createFinancialModelWorkbook')
      .then((sheetId) => {
        setIsCreatingFinancialModel(false);
        window.location.assign(`/metacell/${sheetId}`);
      })
      .catch((error) => {
        setIsCreatingFinancialModel(false);
        window.alert(
          error.reason ||
            error.message ||
            'Failed to create financial model metacell',
        );
      });
  };

  return (
    <main className="home-page">
      <section className="home-hero">
        <div className="home-hero-copy">
          <div className="home-brand">
            <img className="home-brand-logo" src="/logo.png" alt="MetaCells" />
          </div>
          <h1>Cells that work for you.</h1>
          <p className="home-subtitle">
            Create smart spreadsheets where cells can think, calculate, and help
            complete tasks automatically. Built-in AI agents can analyze data,
            generate content, and perform tasks right inside your sheet.
          </p>
          <div className="home-actions">
            <button
              type="button"
              className="home-create-button"
              onClick={handleCreateSheet}
              disabled={isCreating}
            >
              {isCreating ? 'Creating...' : 'Add metacell'}
            </button>
            <button
              type="button"
              className="home-secondary-button"
              onClick={handleCreateFormulaTestSheet}
              disabled={isCreatingFormulaTest}
            >
              {isCreatingFormulaTest
                ? 'Building test sheet...'
                : 'Create formula test'}
            </button>
            <button
              type="button"
              className="home-secondary-button"
              onClick={handleCreateFinancialModelSheet}
              disabled={isCreatingFinancialModel}
            >
              {isCreatingFinancialModel
                ? 'Building model...'
                : 'Create financial model'}
            </button>
            <a className="home-secondary-link" href="/settings">
              Settings
            </a>
            <span className="home-meta">
              {isLoading
                ? 'Loading metacells...'
                : `${sheets.length} metacell${sheets.length === 1 ? '' : 's'}`}
            </span>
          </div>
        </div>
      </section>

      <section className="home-card">
        <div className="home-section-head">
          <h2>Your metacells</h2>
        </div>

        {!isLoading && !sheets.length ? (
          <div className="home-empty-card">
            <p className="home-empty">No metacells yet.</p>
            <p className="home-empty-note">
              Start with a blank metacell and the app will create a persistent
              document for it.
            </p>
          </div>
        ) : null}

        {!isLoading && sheets.length ? (
          <div className="sheet-list">
            {sheets.map((sheet) => (
              <div key={sheet._id} className="sheet-list-item">
                <a className="sheet-list-link" href={`/metacell/${sheet._id}`}>
                  <div className="sheet-list-copy">
                    <span className="sheet-list-name">{sheet.name}</span>
                  </div>
                  <div className="sheet-list-meta">
                    <span className="sheet-list-date">
                      {sheet.updatedAt
                        ? new Date(sheet.updatedAt).toLocaleString()
                        : ''}
                    </span>
                    <span className="sheet-list-arrow">Open</span>
                  </div>
                </a>
                <button
                  type="button"
                  className="sheet-list-delete"
                  onClick={() => handleDeleteSheet(sheet._id, sheet.name)}
                  disabled={deletingSheetId === sheet._id}
                  aria-label={`Delete ${sheet.name}`}
                >
                  {deletingSheetId === sheet._id ? '...' : '×'}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}

function readSettingsTabFromUrl(validTabs) {
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

function SettingsPage() {
  const SETTINGS_TABS = [
    { id: 'ai', label: '🤖 AI Providers' },
    { id: 'channels', label: '📨 Channels' },
    { id: 'jobs', label: '🧱 Jobs' },
    { id: 'general', label: '⚙️ General' },
    { id: 'advanced', label: '🛠️ Advanced' },
  ];
  const SETTINGS_TAB_IDS = SETTINGS_TABS.map((tab) => tab.id);
  const registeredProviders = DEFAULT_AI_PROVIDERS;
  const registeredChannelConnectors = DEFAULT_CHANNEL_CONNECTORS;
  const defaultProviderId = String(
    (registeredProviders[0] && registeredProviders[0].id) || '',
  );
  const [activeSettingsTab, setActiveSettingsTab] = useState(() =>
    readSettingsTabFromUrl(SETTINGS_TAB_IDS),
  );
  const [activeProviderId, setActiveProviderId] = useState(defaultProviderId);
  const [openProviderHelpId, setOpenProviderHelpId] = useState('');
  const [providerDrafts, setProviderDrafts] = useState(() =>
    buildProviderDrafts(registeredProviders),
  );
  const [savingProviderId, setSavingProviderId] = useState('');
  const [isSavingActiveProvider, setIsSavingActiveProvider] = useState(false);
  const [addingChannel, setAddingChannel] = useState('');
  const [channelDrafts, setChannelDrafts] = useState({});
  const [savingChannelId, setSavingChannelId] = useState('');
  const [testingChannelId, setTestingChannelId] = useState('');
  const [pollingNow, setPollingNow] = useState(false);
  const [jobSettingsDraft, setJobSettingsDraft] = useState(() =>
    buildJobSettingsDraft(DEFAULT_JOB_SETTINGS),
  );
  const [savingJobSettings, setSavingJobSettings] = useState(false);

  useEffect(() => {
    document.body.classList.add('route-home');
    document.body.classList.remove('route-sheet');

    return () => {
      document.body.classList.remove('route-home');
    };
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setActiveSettingsTab(readSettingsTabFromUrl(SETTINGS_TAB_IDS));
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    const nextTab = SETTINGS_TAB_IDS.includes(activeSettingsTab)
      ? activeSettingsTab
      : SETTINGS_TAB_IDS[0];
    const params = new URLSearchParams(window.location.search || '');
    if (params.get('tab') === nextTab) return;
    params.set('tab', nextTab);
    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', nextUrl);
  }, [activeSettingsTab]);

  const { isLoading, settings } = useTracker(() => {
    const handle = Meteor.subscribe('settings.default');

    return {
      isLoading: !handle.ready(),
      settings: AppSettings.findOne(DEFAULT_SETTINGS_ID),
    };
  }, []);

  useEffect(() => {
    const providers = Array.isArray(settings && settings.aiProviders)
      ? settings.aiProviders
      : [];
    const channels = Array.isArray(settings && settings.communicationChannels)
      ? settings.communicationChannels
      : [];
    setActiveProviderId(
      (settings && settings.activeAIProviderId) || defaultProviderId,
    );
    setProviderDrafts(buildProviderDrafts(registeredProviders, providers));
    setChannelDrafts(buildChannelDrafts(registeredChannelConnectors, channels));
    setJobSettingsDraft(
      buildJobSettingsDraft(settings && settings.jobSettings),
    );
  }, [
    settings && settings.updatedAt ? new Date(settings.updatedAt).getTime() : 0,
  ]);

  const handleProviderDraftChange = (providerId, fieldKey, value) => {
    setProviderDrafts((current) => ({
      ...current,
      [providerId]: {
        ...(current[providerId] || {}),
        [fieldKey]: value,
      },
    }));
  };

  const handleSaveProvider = (providerId) => {
    if (savingProviderId) return;
    const draft = providerDrafts[providerId];
    if (!draft) return;

    setSavingProviderId(providerId);
    Meteor.callAsync('settings.upsertAIProvider', {
      id: String(draft.id || '').trim(),
      name: String(draft.name || '').trim(),
      type: String(draft.type || '').trim(),
      baseUrl: String(draft.baseUrl || '').trim(),
      model: String(draft.model || '').trim(),
      apiKey: String(draft.apiKey || '').trim(),
      enabled: draft.enabled !== false,
    })
      .then(() => setSavingProviderId(''))
      .catch((error) => {
        setSavingProviderId('');
        window.alert(
          error.reason || error.message || 'Failed to save AI provider',
        );
      });
  };

  const handleSaveActiveProvider = () => {
    if (isSavingActiveProvider || !activeProviderId) return;
    setIsSavingActiveProvider(true);
    Meteor.callAsync('settings.setActiveAIProvider', activeProviderId)
      .then(() => setIsSavingActiveProvider(false))
      .catch((error) => {
        setIsSavingActiveProvider(false);
        window.alert(
          error.reason || error.message || 'Failed to set active AI provider',
        );
      });
  };

  const handleAddChannel = (connectorId) => {
    if (addingChannel) return;
    setAddingChannel(connectorId);
    Meteor.callAsync('settings.addCommunicationChannel', connectorId)
      .then(() => setAddingChannel(''))
      .catch((error) => {
        setAddingChannel('');
        window.alert(
          error.reason ||
            error.message ||
            'Failed to add communication channel',
        );
      });
  };

  const handleChannelDraftChange = (channelId, fieldKey, value, nestedKey) => {
    setChannelDrafts((current) => ({
      ...current,
      [channelId]: {
        ...(current[channelId] || {}),
        ...(nestedKey
          ? {
              [fieldKey]: {
                ...((current[channelId] && current[channelId][fieldKey]) || {}),
                [nestedKey]: value,
              },
            }
          : { [fieldKey]: value }),
      },
    }));
  };

  const handleSaveChannel = (channelId) => {
    if (savingChannelId) return;
    const draft = channelDrafts[channelId];
    if (!draft) return;
    setSavingChannelId(channelId);
    Meteor.callAsync('settings.upsertCommunicationChannel', {
      id: String(draft.id || ''),
      connectorId: String(draft.connectorId || ''),
      label: String(draft.label || '').trim(),
      enabled: draft.enabled !== false,
      settings: draft.settings || {},
    })
      .then(() => setSavingChannelId(''))
      .catch((error) => {
        setSavingChannelId('');
        window.alert(
          error.reason ||
            error.message ||
            'Failed to save communication channel',
        );
      });
  };

  const handleTestChannel = (channelId) => {
    if (testingChannelId) return;
    setTestingChannelId(channelId);
    Meteor.callAsync('settings.testCommunicationChannel', channelId)
      .then((result) => {
        setTestingChannelId('');
        if (result && result.message) window.alert(result.message);
      })
      .catch((error) => {
        setTestingChannelId('');
        window.alert(
          error.reason ||
            error.message ||
            'Failed to test communication channel',
        );
      });
  };

  const handlePollNow = () => {
    if (pollingNow) return;
    setPollingNow(true);
    Meteor.callAsync('channels.pollNow')
      .then((result) => {
        setPollingNow(false);
        const summary = result && typeof result === 'object' ? result : {};
        const total = Number(summary.total) || 0;
        const events = Number(summary.events) || 0;
        const failed = Number(summary.failed) || 0;
        const polled = Number(summary.polled) || 0;
        const details = Array.isArray(summary.results)
          ? summary.results
              .map((item) => {
                if (!item) return '';
                const label = String(item.label || item.channelId || 'channel');
                if (item.error) return `${label}: ${item.error}`;
                if (item.skipped)
                  return `${label}: ${String(item.reason || 'skipped')}`;
                return `${label}: ${Number(item.events) || 0} event(s)`;
              })
              .filter(Boolean)
              .join('\n')
          : '';
        window.alert(
          `Poll complete.\nChannels: ${total}\nPolled: ${polled}\nNew events: ${events}\nFailed: ${failed}` +
            (details ? `\n\n${details}` : ''),
        );
      })
      .catch((error) => {
        setPollingNow(false);
        window.alert(
          error.reason || error.message || 'Failed to poll channels',
        );
      });
  };

  const handleJobSettingsDraftChange = (fieldKey, value) => {
    setJobSettingsDraft((current) => ({
      ...current,
      [fieldKey]: value,
    }));
  };

  const handleSaveJobSettings = () => {
    if (savingJobSettings) return;
    setSavingJobSettings(true);
    Meteor.callAsync('settings.updateJobSettings', {
      workerEnabled: jobSettingsDraft.workerEnabled !== false,
      aiChatConcurrency:
        Number(jobSettingsDraft.aiChatConcurrency) ||
        DEFAULT_JOB_SETTINGS.aiChatConcurrency,
      aiChatMaxAttempts:
        Number(jobSettingsDraft.aiChatMaxAttempts) ||
        DEFAULT_JOB_SETTINGS.aiChatMaxAttempts,
      aiChatRetryDelayMs:
        Number(jobSettingsDraft.aiChatRetryDelayMs) ||
        DEFAULT_JOB_SETTINGS.aiChatRetryDelayMs,
      aiChatTimeoutMs:
        Number(jobSettingsDraft.aiChatTimeoutMs) ||
        DEFAULT_JOB_SETTINGS.aiChatTimeoutMs,
      aiChatLeaseTimeoutMs:
        Number(jobSettingsDraft.aiChatLeaseTimeoutMs) ||
        DEFAULT_JOB_SETTINGS.aiChatLeaseTimeoutMs,
      aiChatHeartbeatIntervalMs:
        Number(jobSettingsDraft.aiChatHeartbeatIntervalMs) ||
        DEFAULT_JOB_SETTINGS.aiChatHeartbeatIntervalMs,
      fileExtractConcurrency:
        Number(jobSettingsDraft.fileExtractConcurrency) ||
        DEFAULT_JOB_SETTINGS.fileExtractConcurrency,
      fileExtractMaxAttempts:
        Number(jobSettingsDraft.fileExtractMaxAttempts) ||
        DEFAULT_JOB_SETTINGS.fileExtractMaxAttempts,
      fileExtractRetryDelayMs:
        Number(jobSettingsDraft.fileExtractRetryDelayMs) ||
        DEFAULT_JOB_SETTINGS.fileExtractRetryDelayMs,
      fileExtractTimeoutMs:
        Number(jobSettingsDraft.fileExtractTimeoutMs) ||
        DEFAULT_JOB_SETTINGS.fileExtractTimeoutMs,
      fileExtractLeaseTimeoutMs:
        Number(jobSettingsDraft.fileExtractLeaseTimeoutMs) ||
        DEFAULT_JOB_SETTINGS.fileExtractLeaseTimeoutMs,
      fileExtractHeartbeatIntervalMs:
        Number(jobSettingsDraft.fileExtractHeartbeatIntervalMs) ||
        DEFAULT_JOB_SETTINGS.fileExtractHeartbeatIntervalMs,
    })
      .then(() => setSavingJobSettings(false))
      .catch((error) => {
        setSavingJobSettings(false);
        window.alert(
          error.reason || error.message || 'Failed to save job settings',
        );
      });
  };

  const aiProviders = Array.isArray(settings && settings.aiProviders)
    ? settings.aiProviders
    : [];
  const communicationChannels = Array.isArray(
    settings && settings.communicationChannels,
  )
    ? settings.communicationChannels
    : [];
  const activeProviderLabel = (
    aiProviders.find(
      (provider) => provider && provider.id === activeProviderId,
    ) ||
    registeredProviders.find(
      (provider) => provider && provider.id === activeProviderId,
    ) ||
    registeredProviders[0] || { name: 'None' }
  ).name;
  const configuredChannelsCount = communicationChannels.length;
  const configuredSecretsCount = Object.values(providerDrafts).filter(
    (provider) => String((provider && provider.apiKey) || '').trim(),
  ).length;
  const renderSettingsPanel = () => {
    if (activeSettingsTab === 'channels') {
      return (
        <>
          <div className="home-section-head">
            <h2>Communication Channels</h2>
          </div>
          <div className="settings-section-copy">
            <p>
              Connector files define settings schema, test/send behavior, event
              hooks, and formula mention patterns for each channel type.
            </p>
          </div>
          <div className="settings-channel-actions">
            <button
              type="button"
              onClick={handlePollNow}
              disabled={pollingNow || !communicationChannels.length}
            >
              {pollingNow ? 'Polling...' : 'Poll now'}
            </button>
            {registeredChannelConnectors.map((connector) => (
              <button
                key={connector.id}
                type="button"
                onClick={() => handleAddChannel(connector.id)}
                disabled={addingChannel === connector.id}
              >
                {addingChannel === connector.id
                  ? 'Adding...'
                  : `Add ${connector.name}`}
              </button>
            ))}
          </div>

          {!communicationChannels.length ? (
            <p className="home-empty-note">
              No communication channels added yet.
            </p>
          ) : (
            <div className="settings-channel-list">
              {communicationChannels.map((channel) => {
                const connector = registeredChannelConnectors.find(
                  (item) => item.id === channel.connectorId,
                );
                const draft = channelDrafts[channel.id] || {};
                const draftSettings = draft.settings || {};

                return (
                  <div key={channel.id} className="settings-provider-card">
                    <div className="settings-provider-head">
                      <strong>{draft.label || channel.label}</strong>
                      <span className="settings-status">{channel.status}</span>
                    </div>
                    <div className="settings-checkbox-row">
                      <label
                        className="settings-checkbox-label"
                        htmlFor={`channel-${channel.id}-enabled`}
                      >
                        <input
                          id={`channel-${channel.id}-enabled`}
                          type="checkbox"
                          checked={draft.enabled !== false}
                          onChange={(event) =>
                            handleChannelDraftChange(
                              channel.id,
                              'enabled',
                              event.target.checked,
                            )
                          }
                        />
                        <span>Enabled</span>
                      </label>
                    </div>
                    <div className="settings-field">
                      <label
                        className="settings-label"
                        htmlFor={`channel-${channel.id}-label`}
                      >
                        Channel label
                      </label>
                      <input
                        id={`channel-${channel.id}-label`}
                        className="settings-input"
                        type="text"
                        value={String(draft.label || channel.label || '')}
                        onChange={(event) =>
                          handleChannelDraftChange(
                            channel.id,
                            'label',
                            event.target.value,
                          )
                        }
                        placeholder="Channel label"
                      />
                    </div>
                    {(connector?.settingsFields || []).map((field) =>
                      field.key === 'label' ? null : (
                        <div key={field.key} className="settings-field">
                          <label
                            className="settings-label"
                            htmlFor={`channel-${channel.id}-${field.key}`}
                          >
                            {field.label}
                          </label>
                          {field.type === 'checkbox' ? (
                            <input
                              id={`channel-${channel.id}-${field.key}`}
                              type="checkbox"
                              checked={Boolean(draftSettings[field.key])}
                              onChange={(event) =>
                                handleChannelDraftChange(
                                  channel.id,
                                  'settings',
                                  event.target.checked,
                                  field.key,
                                )
                              }
                            />
                          ) : (
                            <input
                              id={`channel-${channel.id}-${field.key}`}
                              className="settings-input"
                              type={
                                field.type === 'password' ? 'password' : 'text'
                              }
                              value={String(draftSettings[field.key] ?? '')}
                              onChange={(event) =>
                                handleChannelDraftChange(
                                  channel.id,
                                  'settings',
                                  event.target.value,
                                  field.key,
                                )
                              }
                              placeholder={field.placeholder || ''}
                            />
                          )}
                        </div>
                      ),
                    )}
                    {connector ? (
                      <p className="settings-provider-note">
                        Mentioning: {connector.mentioningFormulas.join(' | ')}
                      </p>
                    ) : null}
                    <div className="settings-kv-list settings-kv-list-compact">
                      <div className="settings-kv-item">
                        <span className="settings-label">Last seen UID</span>
                        <strong>{draft.lastSeenUid || 0}</strong>
                      </div>
                      <div className="settings-kv-item">
                        <span className="settings-label">Last event at</span>
                        <strong>
                          {draft.lastEventAt
                            ? new Date(draft.lastEventAt).toLocaleString()
                            : 'Never'}
                        </strong>
                      </div>
                      <div className="settings-kv-item">
                        <span className="settings-label">Last polled at</span>
                        <strong>
                          {draft.lastPolledAt
                            ? new Date(draft.lastPolledAt).toLocaleString()
                            : 'Never'}
                        </strong>
                      </div>
                    </div>
                    {draft.lastEventPreview ? (
                      <div className="settings-channel-event">
                        <div className="settings-channel-event-head">
                          Latest event
                        </div>
                        {draft.lastEventId ? (
                          <p className="settings-provider-note">
                            Event ID: {draft.lastEventId}
                          </p>
                        ) : null}
                        <pre className="settings-channel-event-body">
                          {JSON.stringify(draft.lastEventPreview, null, 2)}
                        </pre>
                      </div>
                    ) : (
                      <p className="settings-provider-note">
                        No event received yet.
                      </p>
                    )}
                    {draft.lastTestMessage ? (
                      <p className="settings-provider-note">
                        {draft.lastTestMessage}
                      </p>
                    ) : null}
                    {draft.watchError ? (
                      <p className="settings-provider-note settings-provider-note-error">
                        {draft.watchError}
                      </p>
                    ) : null}
                    <div className="settings-actions">
                      <button
                        type="button"
                        onClick={() => handleSaveChannel(channel.id)}
                        disabled={savingChannelId === channel.id}
                      >
                        {savingChannelId === channel.id
                          ? 'Saving...'
                          : 'Save channel'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTestChannel(channel.id)}
                        disabled={testingChannelId === channel.id}
                      >
                        {testingChannelId === channel.id
                          ? 'Testing...'
                          : 'Test connection'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      );
    }

    if (activeSettingsTab === 'general') {
      return (
        <>
          <div className="home-section-head">
            <h2>General</h2>
          </div>
          <div className="settings-section-copy">
            <p>
              Overview of the current AI and communication setup stored in
              Mongo.
            </p>
          </div>
          <div className="settings-kv-list">
            <div className="settings-kv-item">
              <span className="settings-label">Default AI provider</span>
              <strong>{activeProviderLabel}</strong>
            </div>
            <div className="settings-kv-item">
              <span className="settings-label">Configured providers</span>
              <strong>{registeredProviders.length}</strong>
            </div>
            <div className="settings-kv-item">
              <span className="settings-label">Connected channels</span>
              <strong>{configuredChannelsCount}</strong>
            </div>
            <div className="settings-kv-item">
              <span className="settings-label">Providers with API keys</span>
              <strong>{configuredSecretsCount}</strong>
            </div>
          </div>
        </>
      );
    }

    if (activeSettingsTab === 'jobs') {
      return (
        <>
          <div className="home-section-head">
            <h2>Jobs</h2>
          </div>
          <div className="settings-section-copy">
            <p>
              Durable server jobs back AI calls and file conversion. These
              settings are stored in Mongo and are designed to map cleanly to a
              future external broker.
            </p>
          </div>
          <div className="settings-provider-card">
            <div className="settings-provider-head">
              <strong>Worker control</strong>
              <span className="settings-status">
                {jobSettingsDraft.workerEnabled ? 'Enabled' : 'Paused'}
              </span>
            </div>
            <div className="settings-checkbox-row">
              <label
                className="settings-checkbox-label"
                htmlFor="job-settings-worker-enabled"
              >
                <input
                  id="job-settings-worker-enabled"
                  type="checkbox"
                  checked={jobSettingsDraft.workerEnabled !== false}
                  onChange={(event) =>
                    handleJobSettingsDraftChange(
                      'workerEnabled',
                      event.target.checked,
                    )
                  }
                />
                <span>Enable durable job worker</span>
              </label>
            </div>
            <p className="settings-provider-note">
              If disabled, queued jobs stay persisted in Mongo and will resume
              when the worker is re-enabled.
            </p>
          </div>

          <div className="settings-provider-card">
            <div className="settings-provider-head">
              <strong>AI jobs</strong>
              <span className="settings-status">
                applies to server AI queue
              </span>
            </div>
            <div className="settings-field-grid">
              <div className="settings-field">
                <label
                  className="settings-label"
                  htmlFor="job-settings-ai-concurrency"
                >
                  Concurrency
                </label>
                <input
                  id="job-settings-ai-concurrency"
                  className="settings-input"
                  type="number"
                  min="1"
                  value={String(jobSettingsDraft.aiChatConcurrency)}
                  onChange={(event) =>
                    handleJobSettingsDraftChange(
                      'aiChatConcurrency',
                      event.target.value,
                    )
                  }
                />
              </div>
              <div className="settings-field">
                <label
                  className="settings-label"
                  htmlFor="job-settings-ai-attempts"
                >
                  Max attempts
                </label>
                <input
                  id="job-settings-ai-attempts"
                  className="settings-input"
                  type="number"
                  min="1"
                  value={String(jobSettingsDraft.aiChatMaxAttempts)}
                  onChange={(event) =>
                    handleJobSettingsDraftChange(
                      'aiChatMaxAttempts',
                      event.target.value,
                    )
                  }
                />
              </div>
              <div className="settings-field">
                <label
                  className="settings-label"
                  htmlFor="job-settings-ai-delay"
                >
                  Retry delay ms
                </label>
                <input
                  id="job-settings-ai-delay"
                  className="settings-input"
                  type="number"
                  min="250"
                  step="250"
                  value={String(jobSettingsDraft.aiChatRetryDelayMs)}
                  onChange={(event) =>
                    handleJobSettingsDraftChange(
                      'aiChatRetryDelayMs',
                      event.target.value,
                    )
                  }
                />
              </div>
              <div className="settings-field">
                <label
                  className="settings-label"
                  htmlFor="job-settings-ai-timeout"
                >
                  Timeout ms
                </label>
                <input
                  id="job-settings-ai-timeout"
                  className="settings-input"
                  type="number"
                  min="1000"
                  step="1000"
                  value={String(jobSettingsDraft.aiChatTimeoutMs)}
                  onChange={(event) =>
                    handleJobSettingsDraftChange(
                      'aiChatTimeoutMs',
                      event.target.value,
                    )
                  }
                />
              </div>
              <div className="settings-field">
                <label
                  className="settings-label"
                  htmlFor="job-settings-ai-lease"
                >
                  Lease timeout ms
                </label>
                <input
                  id="job-settings-ai-lease"
                  className="settings-input"
                  type="number"
                  min="1000"
                  step="1000"
                  value={String(jobSettingsDraft.aiChatLeaseTimeoutMs)}
                  onChange={(event) =>
                    handleJobSettingsDraftChange(
                      'aiChatLeaseTimeoutMs',
                      event.target.value,
                    )
                  }
                />
              </div>
              <div className="settings-field">
                <label
                  className="settings-label"
                  htmlFor="job-settings-ai-heartbeat"
                >
                  Heartbeat ms
                </label>
                <input
                  id="job-settings-ai-heartbeat"
                  className="settings-input"
                  type="number"
                  min="500"
                  step="500"
                  value={String(jobSettingsDraft.aiChatHeartbeatIntervalMs)}
                  onChange={(event) =>
                    handleJobSettingsDraftChange(
                      'aiChatHeartbeatIntervalMs',
                      event.target.value,
                    )
                  }
                />
              </div>
            </div>
          </div>

          <div className="settings-provider-card">
            <div className="settings-provider-head">
              <strong>File extraction jobs</strong>
              <span className="settings-status">applies to converter jobs</span>
            </div>
            <div className="settings-field-grid">
              <div className="settings-field">
                <label
                  className="settings-label"
                  htmlFor="job-settings-file-concurrency"
                >
                  Concurrency
                </label>
                <input
                  id="job-settings-file-concurrency"
                  className="settings-input"
                  type="number"
                  min="1"
                  value={String(jobSettingsDraft.fileExtractConcurrency)}
                  onChange={(event) =>
                    handleJobSettingsDraftChange(
                      'fileExtractConcurrency',
                      event.target.value,
                    )
                  }
                />
              </div>
              <div className="settings-field">
                <label
                  className="settings-label"
                  htmlFor="job-settings-file-attempts"
                >
                  Max attempts
                </label>
                <input
                  id="job-settings-file-attempts"
                  className="settings-input"
                  type="number"
                  min="1"
                  value={String(jobSettingsDraft.fileExtractMaxAttempts)}
                  onChange={(event) =>
                    handleJobSettingsDraftChange(
                      'fileExtractMaxAttempts',
                      event.target.value,
                    )
                  }
                />
              </div>
              <div className="settings-field">
                <label
                  className="settings-label"
                  htmlFor="job-settings-file-delay"
                >
                  Retry delay ms
                </label>
                <input
                  id="job-settings-file-delay"
                  className="settings-input"
                  type="number"
                  min="250"
                  step="250"
                  value={String(jobSettingsDraft.fileExtractRetryDelayMs)}
                  onChange={(event) =>
                    handleJobSettingsDraftChange(
                      'fileExtractRetryDelayMs',
                      event.target.value,
                    )
                  }
                />
              </div>
              <div className="settings-field">
                <label
                  className="settings-label"
                  htmlFor="job-settings-file-timeout"
                >
                  Timeout ms
                </label>
                <input
                  id="job-settings-file-timeout"
                  className="settings-input"
                  type="number"
                  min="1000"
                  step="1000"
                  value={String(jobSettingsDraft.fileExtractTimeoutMs)}
                  onChange={(event) =>
                    handleJobSettingsDraftChange(
                      'fileExtractTimeoutMs',
                      event.target.value,
                    )
                  }
                />
              </div>
              <div className="settings-field">
                <label
                  className="settings-label"
                  htmlFor="job-settings-file-lease"
                >
                  Lease timeout ms
                </label>
                <input
                  id="job-settings-file-lease"
                  className="settings-input"
                  type="number"
                  min="1000"
                  step="1000"
                  value={String(jobSettingsDraft.fileExtractLeaseTimeoutMs)}
                  onChange={(event) =>
                    handleJobSettingsDraftChange(
                      'fileExtractLeaseTimeoutMs',
                      event.target.value,
                    )
                  }
                />
              </div>
              <div className="settings-field">
                <label
                  className="settings-label"
                  htmlFor="job-settings-file-heartbeat"
                >
                  Heartbeat ms
                </label>
                <input
                  id="job-settings-file-heartbeat"
                  className="settings-input"
                  type="number"
                  min="500"
                  step="500"
                  value={String(
                    jobSettingsDraft.fileExtractHeartbeatIntervalMs,
                  )}
                  onChange={(event) =>
                    handleJobSettingsDraftChange(
                      'fileExtractHeartbeatIntervalMs',
                      event.target.value,
                    )
                  }
                />
              </div>
            </div>
            <div className="settings-actions">
              <button
                type="button"
                onClick={handleSaveJobSettings}
                disabled={savingJobSettings}
              >
                {savingJobSettings ? 'Saving...' : 'Save job settings'}
              </button>
            </div>
          </div>
        </>
      );
    }

    if (activeSettingsTab === 'advanced') {
      return (
        <>
          <div className="home-section-head">
            <h2>Advanced</h2>
          </div>
          <div className="settings-section-copy">
            <p>
              Raw provider diagnostics and saved endpoints for debugging
              server-side AI calls.
            </p>
          </div>
          <div className="settings-kv-list">
            {registeredProviders.map((provider) => {
              const draft = providerDrafts[provider.id] || provider;
              return (
                <div key={provider.id} className="settings-kv-item">
                  <span className="settings-label">{provider.name}</span>
                  <strong>
                    {draft.baseUrl || draft.model || 'Not configured'}
                  </strong>
                </div>
              );
            })}
          </div>
        </>
      );
    }

    return (
      <>
        <div className="home-section-head">
          <h2>AI Providers</h2>
        </div>
        <div className="settings-section-copy">
          <p>
            Current provider configuration is stored in Mongo and used by
            server-side AI requests.
          </p>
        </div>

        <div className="settings-provider-card">
          <div className="settings-provider-head">
            <strong>Default provider</strong>
            <span className="settings-status">
              {isLoading ? 'Loading...' : 'Saved in DB'}
            </span>
          </div>
          <label className="settings-label" htmlFor="active-provider-id">
            Active AI provider
          </label>
          <select
            id="active-provider-id"
            className="settings-input"
            value={activeProviderId}
            onChange={(event) => setActiveProviderId(event.target.value)}
          >
            {registeredProviders.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
          <div className="settings-actions">
            <button
              type="button"
              onClick={handleSaveActiveProvider}
              disabled={isSavingActiveProvider || isLoading}
            >
              {isSavingActiveProvider ? 'Saving...' : 'Set default provider'}
            </button>
            <span className="settings-meta">
              Current: {activeProviderLabel}
            </span>
          </div>
        </div>

        {registeredProviders.map((provider) => {
          const draft = providerDrafts[provider.id] || provider;
          const isActive = activeProviderId === provider.id;
          const hasCredentialHelp =
            (Array.isArray(provider.credentialSteps) &&
              provider.credentialSteps.length > 0) ||
            (Array.isArray(provider.credentialLinks) &&
              provider.credentialLinks.length > 0);
          const isHelpOpen = openProviderHelpId === provider.id;
          return (
            <div key={provider.id} className="settings-provider-card">
              <div className="settings-provider-head">
                <div className="settings-provider-title">
                  <strong>{provider.name}</strong>
                  {hasCredentialHelp ? (
                    <button
                      type="button"
                      className="settings-help-toggle"
                      aria-label={`Credential help for ${provider.name}`}
                      aria-expanded={isHelpOpen}
                      onClick={() =>
                        setOpenProviderHelpId((current) =>
                          current === provider.id ? '' : provider.id,
                        )
                      }
                    >
                      ?
                    </button>
                  ) : null}
                </div>
                <span className="settings-status">
                  {isActive
                    ? 'Default'
                    : isLoading
                      ? 'Loading...'
                      : 'Available'}
                </span>
              </div>
              {isHelpOpen ? (
                <div className="settings-help-panel">
                  {provider.credentialSteps && provider.credentialSteps.length ? (
                    <ol className="settings-help-steps">
                      {provider.credentialSteps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  ) : null}
                  {provider.credentialLinks && provider.credentialLinks.length ? (
                    <div className="settings-help-links">
                      {provider.credentialLinks.map((link) => (
                        <a
                          key={`${provider.id}-${link.url}`}
                          className="settings-help-link"
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {link.label}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {Array.isArray(provider.fields) &&
                provider.fields.map((field) => (
                  <div key={field.key} className="settings-field">
                    <label
                      className="settings-label"
                      htmlFor={`${provider.id}-${field.key}`}
                    >
                      {field.label}
                    </label>
                    <input
                      id={`${provider.id}-${field.key}`}
                      className="settings-input"
                      type={field.type || 'text'}
                      value={String(draft[field.key] || '')}
                      onChange={(event) =>
                        handleProviderDraftChange(
                          provider.id,
                          field.key,
                          event.target.value,
                        )
                      }
                      placeholder={field.placeholder || ''}
                    />
                  </div>
                ))}
              {provider.availableModels && provider.availableModels.length ? (
                <p className="settings-provider-note">
                  Models: {provider.availableModels.join(', ')}
                </p>
              ) : null}
              <div className="settings-actions">
                <button
                  type="button"
                  onClick={() => handleSaveProvider(provider.id)}
                  disabled={Boolean(savingProviderId) || isLoading}
                >
                  {savingProviderId === provider.id
                    ? 'Saving...'
                    : 'Save provider'}
                </button>
              </div>
            </div>
          );
        })}
      </>
    );
  };

  return (
    <main className="home-page settings-page">
      <section className="home-hero settings-hero">
        <div className="home-hero-copy">
          <div className="home-brand">
            <img className="home-brand-logo" src="/logo.png" alt="Settings" />
          </div>
          <h1>Settings</h1>
          <p className="home-subtitle">
            Manage AI providers and communication channel connections.
          </p>
          <div className="home-actions">
            <a className="home-secondary-link" href="/">
              ← Back
            </a>
          </div>
        </div>
      </section>

      <section className="home-card settings-card settings-layout">
        <div
          className="settings-tabs"
          role="tablist"
          aria-label="Settings sections"
        >
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeSettingsTab === tab.id}
              className={`settings-tab-button${activeSettingsTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveSettingsTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="settings-panel" role="tabpanel">
          {renderSettingsPanel()}
        </div>
      </section>
    </main>
  );
}

function SheetPage({
  sheetId,
  initialTabId,
  onOpenHelp,
  publishedMode = false,
}) {
  const appRef = useRef(null);
  const storageRef = useRef(null);
  const lastWorkbookDocumentRef = useRef(null);
  const lastWorkbookSyncKeyRef = useRef('');
  const [workbookName, setWorkbookName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  useEffect(() => {
    document.body.classList.add(
      publishedMode ? 'route-published-report' : 'route-sheet',
    );
    document.body.classList.remove('route-home');
    document.body.classList.remove('route-settings');

    return () => {
      document.body.classList.remove('route-sheet');
      document.body.classList.remove('route-published-report');
    };
  }, [publishedMode]);

  const { isLoading, sheet, settings } = useTracker(() => {
    const handle = Meteor.subscribe('sheets.one', sheetId);
    const settingsHandle = Meteor.subscribe('settings.default');

    return {
      isLoading: !handle.ready() || !settingsHandle.ready(),
      sheet: Sheets.findOne(sheetId),
      settings: AppSettings.findOne(DEFAULT_SETTINGS_ID),
    };
  }, [sheetId]);
  const availableChannels = Array.isArray(
    settings && settings.communicationChannels,
  )
    ? settings.communicationChannels
        .filter((channel) => channel && channel.enabled !== false)
        .map((channel) => ({
          id: String(channel.id || ''),
          label: String(channel.label || '').trim(),
        }))
        .filter((channel) => channel.label)
    : [];

  useEffect(() => {
    if (!sheet) return;
    setWorkbookName(String(sheet.name || ''));
  }, [sheet && sheet.name]);

  const commitWorkbookRename = () => {
    if (!sheet || isRenaming) return;
    const nextName = String(workbookName || '').trim();
    const currentName = String(sheet.name || '');

    if (!nextName) {
      setWorkbookName(currentName);
      return;
    }

    if (nextName === currentName) return;

    setIsRenaming(true);
    Meteor.callAsync('sheets.rename', sheetId, nextName)
      .then(() => {
        setIsRenaming(false);
      })
      .catch((error) => {
        setIsRenaming(false);
        setWorkbookName(currentName);
        window.alert(
          error.reason || error.message || 'Failed to rename metacell',
        );
      });
  };

  useEffect(() => {
    if (isLoading || !sheet || appRef.current) return;

    const workbookDocument = sheet.workbook || {};
    const workbook = decodeWorkbookDocument(workbookDocument);
    storageRef.current = createSheetDocStorage(sheetId, workbook);
    lastWorkbookDocumentRef.current = workbookDocument;
    lastWorkbookSyncKeyRef.current = String(
      sheet && sheet.updatedAt && typeof sheet.updatedAt.getTime === 'function'
        ? sheet.updatedAt.getTime()
        : sheet && sheet.updatedAt
          ? sheet.updatedAt
          : '',
    );
    appRef.current = mountSpreadsheetApp({
      storage: storageRef.current,
      sheetDocumentId: sheetId,
      initialSheetId: initialTabId,
      availableChannels,
      onActiveSheetChange: (nextTabId) => {
        const nextPath = publishedMode
          ? `/report/${encodeURIComponent(sheetId)}/${encodeURIComponent(nextTabId || initialTabId || '')}`
          : nextTabId
            ? `/metacell/${encodeURIComponent(sheetId)}/${encodeURIComponent(nextTabId)}`
            : `/metacell/${encodeURIComponent(sheetId)}`;
        if (window.location.pathname !== nextPath) {
          window.history.replaceState({}, '', nextPath);
        }
      },
    });

    return () => {
      if (appRef.current && typeof appRef.current.destroy === 'function') {
        appRef.current.destroy();
      }
      appRef.current = null;
      storageRef.current = null;
      lastWorkbookDocumentRef.current = null;
      lastWorkbookSyncKeyRef.current = '';
    };
  }, [isLoading, sheetId, initialTabId, publishedMode]);

  useEffect(() => {
    if (
      !appRef.current ||
      typeof appRef.current.setAvailableChannels !== 'function'
    )
      return;
    appRef.current.setAvailableChannels(availableChannels);
  }, [JSON.stringify(availableChannels)]);

  useEffect(() => {
    if (!appRef.current || !initialTabId) return;
    if (typeof appRef.current.switchToSheet !== 'function') return;
    if (
      !(
        typeof appRef.current.activeSheetId === 'string' &&
        appRef.current.activeSheetId === initialTabId
      )
    ) {
      appRef.current.switchToSheet(initialTabId);
    }
    if (publishedMode && typeof appRef.current.setReportMode === 'function') {
      appRef.current.setReportMode('view');
    }
  }, [initialTabId, publishedMode]);

  useEffect(() => {
    if (isLoading || !sheet || !appRef.current || !storageRef.current) return;

    const nextWorkbookDocument = sheet.workbook || {};
    const nextWorkbookSyncKey = String(
      sheet && sheet.updatedAt && typeof sheet.updatedAt.getTime === 'function'
        ? sheet.updatedAt.getTime()
        : sheet && sheet.updatedAt
          ? sheet.updatedAt
          : '',
    );
    if (
      nextWorkbookDocument === lastWorkbookDocumentRef.current &&
      nextWorkbookSyncKey === lastWorkbookSyncKeyRef.current
    ) {
      return;
    }
    if (
      typeof appRef.current.hasPendingLocalEdit === 'function' &&
      appRef.current.hasPendingLocalEdit()
    )
      return;
    if (
      storageRef.current &&
      typeof storageRef.current.hasPendingPersistence === 'function' &&
      storageRef.current.hasPendingPersistence()
    ) {
      return;
    }

    lastWorkbookDocumentRef.current = nextWorkbookDocument;
    lastWorkbookSyncKeyRef.current = nextWorkbookSyncKey;
    storageRef.current.replaceAll(decodeWorkbookDocument(nextWorkbookDocument));
    if (typeof appRef.current.renderCurrentSheetFromStorage === 'function') {
      appRef.current.renderCurrentSheetFromStorage();
    } else {
      appRef.current.computeAll();
    }
  }, [isLoading, sheet]);

  if (isLoading) {
    return <main className="sheet-loading">Loading metacell...</main>;
  }

  if (!sheet) {
    return (
      <main className="sheet-loading">
        <p>Metacell not found.</p>
        <a href="/">← Back</a>
      </main>
    );
  }

  const handlePublishReport = () => {
    if (
      !appRef.current ||
      typeof appRef.current.publishCurrentReport !== 'function'
    )
      return;
    appRef.current.publishCurrentReport();
  };

  const handleUpdateAI = () => {
    if (!appRef.current || typeof appRef.current.runManualAIUpdate !== 'function')
      return;
    appRef.current.runManualAIUpdate();
  };

  const handleExportPdf = () => {
    if (
      !appRef.current ||
      typeof appRef.current.exportCurrentReportPdf !== 'function'
    )
      return;
    appRef.current.exportCurrentReportPdf();
  };

  return (
    <div
      className={`sheet-page-shell${publishedMode ? ' is-published-report' : ''}`}
    >
      <div className="formula-bar">
        <div className="formula-bar-row formula-bar-row-main">
          <div className="formula-cluster formula-cluster-brand">
            <div className="workbook-name-combo">
              <a className="formula-home-link" href="/" aria-label="Home">
                <LucideIcon>
                  <path d="M3 9.5 12 3l9 6.5" />
                  <path d="M5 10v10a1 1 0 0 0 1 1h4v-6a2 2 0 0 1 2 -2h0a2 2 0 0 1 2 2v6h4a1 1 0 0 0 1 -1V10" />
                </LucideIcon>
              </a>
              <input
                id="workbook-name-input"
                type="text"
                value={workbookName}
                onChange={(event) => setWorkbookName(event.target.value)}
                onBlur={commitWorkbookRename}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                  if (event.key === 'Escape') {
                    setWorkbookName(String(sheet.name || ''));
                    event.currentTarget.blur();
                  }
                }}
                placeholder="Metacell name"
                disabled={isRenaming}
              />
            </div>
          </div>
          <div className="formula-cluster formula-cluster-address">
            <div className="cell-name-combo">
              <input
                id="cell-name-input"
                type="text"
                placeholder="A1 or @name"
              />
              <div className="named-cell-jump-picker">
                <button
                  id="named-cell-jump"
                  type="button"
                  aria-label="Jump to named cell"
                  title="Jump to named cell"
                  aria-haspopup="menu"
                  aria-expanded="false"
                >
                  <LucideIcon size={14}>
                    <path d="M6 9l6 6 6-6" />
                  </LucideIcon>
                </button>
                <div
                  id="named-cell-jump-popover"
                  className="named-cell-jump-popover"
                  hidden
                ></div>
              </div>
            </div>
          </div>
          <div className="formula-cluster formula-cluster-editor">
            <div className="formula-input-combo">
              <span className="formula-input-prefix" aria-hidden="true">
                Fx
              </span>
              <input
                id="formula-input"
                type="text"
                placeholder="edit active cell formula/value"
              />
            </div>
            <input id="attach-file-input" type="file" hidden />
            <span
              id="calc-progress"
              className="calc-progress"
              aria-live="polite"
            ></span>
          </div>
          <div className="formula-cluster formula-cluster-modes">
            <div className="formula-icon-select">
              <div className="ai-mode-picker">
                <button
                  id="ai-mode"
                  type="button"
                  aria-label="AI mode"
                  title="AI mode"
                  aria-haspopup="menu"
                  aria-expanded="false"
                >
                  Manual AI
                </button>
                <div id="ai-mode-popover" className="ai-mode-popover" hidden>
                  <button
                    type="button"
                    className="ai-mode-option"
                    data-ai-mode="auto"
                  >
                    Auto AI
                  </button>
                  <button
                    type="button"
                    className="ai-mode-option"
                    data-ai-mode="manual"
                  >
                    Manual AI
                  </button>
                </div>
              </div>
            </div>
            <div className="formula-icon-select">
              <div className="display-mode-picker">
                <button
                  id="display-mode"
                  type="button"
                  aria-label="Display mode"
                  title="Display mode"
                  aria-haspopup="menu"
                  aria-expanded="false"
                >
                  Values
                </button>
                <div
                  id="display-mode-popover"
                  className="display-mode-popover"
                  hidden
                >
                  <button
                    type="button"
                    className="display-mode-option"
                    data-display-mode="values"
                  >
                    Values
                  </button>
                  <button
                    type="button"
                    className="display-mode-option"
                    data-display-mode="formulas"
                  >
                    Formulas
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="formula-cluster formula-cluster-actions">
            <button id="update-ai" type="button" onClick={handleUpdateAI}>
              Update
            </button>
            <button type="button" className="help-button" onClick={onOpenHelp}>
              ?
            </button>
          </div>
        </div>
        <div className="formula-bar-row formula-bar-row-format">
          <div className="formula-cluster formula-cluster-format">
            <button
              id="undo-action"
              type="button"
              aria-label="Undo"
              title="Undo"
            >
              <LucideIcon size={18}>
                <path d="m9 14-5-5 5-5" />
                <path d="M4 9h11a4 4 0 1 1 0 8h-1" />
              </LucideIcon>
            </button>
            <button
              id="redo-action"
              type="button"
              aria-label="Redo"
              title="Redo"
            >
              <LucideIcon size={18}>
                <path d="m15 14 5-5-5-5" />
                <path d="M20 9H9a4 4 0 1 0 0 8h1" />
              </LucideIcon>
            </button>
          </div>
          <div className="formula-cluster formula-cluster-format">
            <div className="formula-icon-select">
              <div className="cell-format-picker">
                <button
                  id="cell-format"
                  type="button"
                  aria-label="Cell format"
                  title="Cell format"
                  aria-haspopup="dialog"
                  aria-expanded="false"
                >
                  123
                </button>
                <div
                  id="cell-format-popover"
                  className="cell-format-popover"
                  hidden
                >
                  <button type="button" className="cell-format-option" data-format="text">Text</button>
                  <button type="button" className="cell-format-option" data-format="number">Number</button>
                  <button type="button" className="cell-format-option" data-format="number_0">Number 0</button>
                  <button type="button" className="cell-format-option" data-format="number_2">Number 0.00</button>
                  <button type="button" className="cell-format-option" data-format="percent">Percent</button>
                  <button type="button" className="cell-format-option" data-format="percent_2">Percent 0.00%</button>
                  <button type="button" className="cell-format-option" data-format="date">Date</button>
                  <button type="button" className="cell-format-option" data-format="currency_usd">USD</button>
                  <button type="button" className="cell-format-option" data-format="currency_eur">EUR</button>
                  <button type="button" className="cell-format-option" data-format="currency_gbp">GBP</button>
                </div>
              </div>
            </div>
            <button
              id="cell-decimals-decrease"
              type="button"
              aria-label="Decrease decimals"
              title="Decrease decimals"
            >
              <LucideIcon size={16}>
                <path d="M4.5 8h8" />
                <path d="M4.5 16h5" />
                <path d="M13.5 9.5v7" />
                <path d="M16.5 12.5v4" />
                <path d="M19 14.5h-5" />
              </LucideIcon>
            </button>
            <button
              id="cell-decimals-increase"
              type="button"
              aria-label="Increase decimals"
              title="Increase decimals"
            >
              <LucideIcon size={16}>
                <path d="M4.5 8h8" />
                <path d="M4.5 16h5" />
                <path d="M13.5 9.5v7" />
                <path d="M16.5 12.5v4" />
                <path d="M19 14.5h-5" />
                <path d="M16.5 17.5v-6" />
              </LucideIcon>
            </button>
          </div>
          <div className="formula-cluster formula-cluster-format">
            <div className="formula-icon-select">
              <div
                id="cell-align"
                className="cell-align-group"
                role="group"
                aria-label="Cell align"
              >
                <button
                  type="button"
                  className="cell-align-button"
                  data-align="left"
                  aria-label="Align left"
                  title="Align left"
                >
                  <LucideIcon size={16}>
                    <path d="M5 7h14" />
                    <path d="M5 12h10" />
                    <path d="M5 17h14" />
                  </LucideIcon>
                </button>
                <button
                  type="button"
                  className="cell-align-button"
                  data-align="center"
                  aria-label="Align center"
                  title="Align center"
                >
                  <LucideIcon size={16}>
                    <path d="M5 7h14" />
                    <path d="M7 12h10" />
                    <path d="M5 17h14" />
                  </LucideIcon>
                </button>
                <button
                  type="button"
                  className="cell-align-button"
                  data-align="right"
                  aria-label="Align right"
                  title="Align right"
                >
                  <LucideIcon size={16}>
                    <path d="M5 7h14" />
                    <path d="M9 12h10" />
                    <path d="M5 17h14" />
                  </LucideIcon>
                </button>
              </div>
            </div>
            <div className="formula-icon-select">
              <div className="cell-borders-picker">
                <button
                  id="cell-borders"
                  type="button"
                  aria-label="Cell borders"
                  title="Cell borders"
                  aria-haspopup="menu"
                  aria-expanded="false"
                >
                  <LucideIcon size={18}>
                    <rect x="5" y="5" width="14" height="14" rx="1.5" />
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </LucideIcon>
                </button>
                <div
                  id="cell-borders-popover"
                  className="cell-borders-popover"
                  hidden
                >
                  <button
                    type="button"
                    className="cell-borders-option"
                    data-preset="none"
                    aria-label="No borders"
                    title="No borders"
                  >
                    <LucideIcon size={16}>
                      <rect x="5" y="5" width="14" height="14" rx="1.5" />
                      <path d="M7 17L17 7" />
                    </LucideIcon>
                  </button>
                  <button
                    type="button"
                    className="cell-borders-option"
                    data-preset="all"
                    aria-label="All borders"
                    title="All borders"
                  >
                    <LucideIcon size={16}>
                      <rect x="5" y="5" width="14" height="14" rx="1.5" />
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </LucideIcon>
                  </button>
                  <button
                    type="button"
                    className="cell-borders-option"
                    data-preset="outer"
                    aria-label="Outer borders"
                    title="Outer borders"
                  >
                    <LucideIcon size={16}>
                      <rect x="5" y="5" width="14" height="14" rx="1.5" />
                    </LucideIcon>
                  </button>
                  <button
                    type="button"
                    className="cell-borders-option"
                    data-preset="inner"
                    aria-label="Inner borders"
                    title="Inner borders"
                  >
                    <LucideIcon size={16}>
                      <rect x="5" y="5" width="14" height="14" rx="1.5" opacity="0.28" />
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </LucideIcon>
                  </button>
                  <button
                    type="button"
                    className="cell-borders-option"
                    data-preset="top"
                    aria-label="Top border"
                    title="Top border"
                  >
                    <LucideIcon size={16}>
                      <path d="M5 7h14" />
                      <rect x="5" y="5" width="14" height="14" rx="1.5" opacity="0.18" />
                    </LucideIcon>
                  </button>
                  <button
                    type="button"
                    className="cell-borders-option"
                    data-preset="bottom"
                    aria-label="Bottom border"
                    title="Bottom border"
                  >
                    <LucideIcon size={16}>
                      <path d="M5 17h14" />
                      <rect x="5" y="5" width="14" height="14" rx="1.5" opacity="0.18" />
                    </LucideIcon>
                  </button>
                  <button
                    type="button"
                    className="cell-borders-option"
                    data-preset="left"
                    aria-label="Left border"
                    title="Left border"
                  >
                    <LucideIcon size={16}>
                      <path d="M7 5v14" />
                      <rect x="5" y="5" width="14" height="14" rx="1.5" opacity="0.18" />
                    </LucideIcon>
                  </button>
                  <button
                    type="button"
                    className="cell-borders-option"
                    data-preset="right"
                    aria-label="Right border"
                    title="Right border"
                  >
                    <LucideIcon size={16}>
                      <path d="M17 5v14" />
                      <rect x="5" y="5" width="14" height="14" rx="1.5" opacity="0.18" />
                    </LucideIcon>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="formula-cluster formula-cluster-format">
            <div className="formula-icon-select">
              <div className="cell-bg-color-picker">
                <button
                  id="cell-bg-color"
                  type="button"
                  aria-label="Cell background color"
                  title="Cell background color"
                  aria-haspopup="dialog"
                  aria-expanded="false"
                >
                  <span
                    id="cell-bg-color-swatch"
                    className="cell-bg-color-swatch"
                  aria-hidden="true"
                  ></span>
                </button>
                <div
                  id="cell-bg-color-popover"
                  className="cell-bg-color-popover"
                  hidden
                >
                  <div className="cell-bg-color-section">
                    <span className="cell-bg-color-heading">Standard</span>
                    <div className="cell-bg-color-grid">
                      <button
                        type="button"
                        className="cell-bg-color-chip is-none"
                        data-color=""
                        title="No fill"
                      >
                        <span className="cell-bg-color-chip-label">None</span>
                      </button>
                      <button
                        type="button"
                        className="cell-bg-color-chip"
                        data-color="#fff7cc"
                        title="Soft yellow"
                        style={{ '--chip-color': '#fff7cc' }}
                      ></button>
                      <button
                        type="button"
                        className="cell-bg-color-chip"
                        data-color="#e6f4f1"
                        title="Mint"
                        style={{ '--chip-color': '#e6f4f1' }}
                      ></button>
                      <button
                        type="button"
                        className="cell-bg-color-chip"
                        data-color="#dce9ff"
                        title="Blue"
                        style={{ '--chip-color': '#dce9ff' }}
                      ></button>
                      <button
                        type="button"
                        className="cell-bg-color-chip"
                        data-color="#fde2e4"
                        title="Rose"
                        style={{ '--chip-color': '#fde2e4' }}
                      ></button>
                      <button
                        type="button"
                        className="cell-bg-color-chip"
                        data-color="#f1e7ff"
                        title="Lavender"
                        style={{ '--chip-color': '#f1e7ff' }}
                      ></button>
                      <button
                        type="button"
                        className="cell-bg-color-chip"
                        data-color="#f4f1ea"
                        title="Sand"
                        style={{ '--chip-color': '#f4f1ea' }}
                      ></button>
                      <button
                        type="button"
                        className="cell-bg-color-chip"
                        data-color="#ffd9b8"
                        title="Peach"
                        style={{ '--chip-color': '#ffd9b8' }}
                      ></button>
                      <button
                        type="button"
                        className="cell-bg-color-chip"
                        data-color="#d9f0d2"
                        title="Green"
                        style={{ '--chip-color': '#d9f0d2' }}
                      ></button>
                      <button
                        type="button"
                        className="cell-bg-color-chip"
                        data-color="#d7ebff"
                        title="Sky"
                        style={{ '--chip-color': '#d7ebff' }}
                      ></button>
                    </div>
                  </div>
                  <div className="cell-bg-color-section">
                    <span className="cell-bg-color-heading">Recent</span>
                    <div
                      id="cell-bg-color-recent"
                      className="cell-bg-color-grid cell-bg-color-grid-recent"
                    ></div>
                  </div>
                  <label
                    className="cell-bg-color-custom"
                    htmlFor="cell-bg-color-custom"
                  >
                    <span className="cell-bg-color-heading">Custom</span>
                    <input
                      id="cell-bg-color-custom"
                      type="color"
                      defaultValue="#fff7cc"
                    />
                  </label>
                </div>
              </div>
            </div>
            <div className="formula-icon-select">
              <button
                id="cell-font-size-decrease"
                type="button"
                aria-label="Decrease font size"
                title="Decrease font size"
              >
                <LucideIcon size={16}>
                  <path d="M6 12h12" />
                </LucideIcon>
              </button>
              <div className="cell-font-family-picker">
                <button
                  id="cell-font-family"
                  type="button"
                  aria-label="Cell font family"
                  title="Cell font family"
                  aria-haspopup="menu"
                  aria-expanded="false"
                >
                  System UI
                </button>
                <div
                  id="cell-font-family-popover"
                  className="cell-font-family-popover"
                  hidden
                >
                  <button
                    type="button"
                    className="cell-font-family-option"
                    data-font-family="default"
                    style={{ fontFamily: 'inherit' }}
                  >
                    System UI
                  </button>
                  <button
                    type="button"
                    className="cell-font-family-option"
                    data-font-family="sans"
                    style={{ fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif' }}
                  >
                    Trebuchet MS
                  </button>
                  <button
                    type="button"
                    className="cell-font-family-option"
                    data-font-family="serif"
                    style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
                  >
                    Georgia
                  </button>
                  <button
                    type="button"
                    className="cell-font-family-option"
                    data-font-family="mono"
                    style={{
                      fontFamily:
                        '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
                    }}
                  >
                    SF Mono
                  </button>
                  <button
                    type="button"
                    className="cell-font-family-option"
                    data-font-family="display"
                    style={{
                      fontFamily:
                        '"Avenir Next", "Gill Sans", "Trebuchet MS", sans-serif',
                    }}
                  >
                    Avenir Next
                  </button>
                </div>
              </div>
              <button
                id="cell-font-size-increase"
                type="button"
                aria-label="Increase font size"
                title="Increase font size"
              >
                <LucideIcon size={16}>
                  <path d="M6 12h12" />
                  <path d="M12 6v12" />
                </LucideIcon>
              </button>
            </div>
            <button
              id="cell-wrap"
              type="button"
              aria-label="Wrap content"
              title="Wrap content"
            >
              <LucideIcon size={16}>
                <path d="M4 6v6a4 4 0 0 0 4 4h11" />
                <path d="m15 14 4 4-4 4" />
                <path d="M4 10h8" />
              </LucideIcon>
            </button>
            <button id="cell-bold" type="button" aria-label="Bold" title="Bold">
              <LucideIcon size={18}>
                <path d="M8 6h5a3 3 0 0 1 0 6H8z" />
                <path d="M8 12h6a3 3 0 0 1 0 6H8z" />
              </LucideIcon>
            </button>
            <button
              id="cell-italic"
              type="button"
              aria-label="Italic"
              title="Italic"
            >
              <LucideIcon size={18}>
                <path d="M14 6h-4" />
                <path d="M14 18h-4" />
                <path d="M14 6 10 18" />
              </LucideIcon>
            </button>
          </div>
          <div className="formula-cluster formula-cluster-format">
            <button
              id="attach-file"
              type="button"
              aria-label="Attach file"
              title="Attach file"
            >
              <LucideIcon size={16}>
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L8.76 18.07a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </LucideIcon>
            </button>
          </div>
        </div>
      </div>
      <div className="table-wrap">
        <table></table>
      </div>
      <div className="report-wrap" style={{ display: 'none' }}>
        <div className="report-toolbar">
          <button
            type="button"
            className="report-mode active"
            data-report-mode="edit"
          >
            Edit
          </button>
          <button type="button" className="report-mode" data-report-mode="view">
            View
          </button>
          <button
            type="button"
            className="report-action"
            onClick={handlePublishReport}
          >
            Publish
          </button>
          <button
            type="button"
            className="report-action"
            onClick={handleExportPdf}
          >
            PDF
          </button>
          <button type="button" className="report-cmd" data-cmd="bold">
            <b>B</b>
          </button>
          <button type="button" className="report-cmd" data-cmd="italic">
            <i>I</i>
          </button>
          <button type="button" className="report-cmd" data-cmd="underline">
            <u>U</u>
          </button>
          <button
            type="button"
            className="report-cmd"
            data-cmd="insertUnorderedList"
          >
            • List
          </button>
          <span className="report-hint">
            Mentions: <code>Sheet 1:A1</code>, <code>@named_cell</code>, region{' '}
            <code>@Sheet 1!A1:B10</code>. Inputs: <code>Input:Sheet 1!A1</code>{' '}
            or <code>Input:@named_cell</code>
          </span>
        </div>
        <div
          id="report-editor"
          className="report-editor"
          contentEditable
          suppressContentEditableWarning
        />
        <div id="report-live" className="report-live"></div>
      </div>
      <div className="tabs-bar">
        <button id="add-tab" type="button">
          {' '}
          +{' '}
        </button>
        <div id="tabs"></div>
        <button id="delete-tab" type="button">
          delete
        </button>
      </div>
    </div>
  );
}

export const App = () => {
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [path, setPath] = useState(() => window.location.pathname || '/');

  useEffect(() => {
    const handleLocationChange = () => {
      setPath(window.location.pathname || '/');
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  const metacellMatch = path.match(/^\/metacell\/([^/]+)(?:\/([^/]+))?$/);
  const legacySheetMatch = path.match(/^\/sheet\/([^/]+)(?:\/([^/]+))?$/);
  const reportMatch = path.match(/^\/report\/([^/]+)\/([^/]+)$/);
  const sheetMatch = metacellMatch || legacySheetMatch;

  let page = <HomePage />;
  if (reportMatch) {
    page = (
      <SheetPage
        sheetId={decodeURIComponent(reportMatch[1])}
        initialTabId={decodeURIComponent(reportMatch[2])}
        onOpenHelp={() => setIsHelpOpen(true)}
        publishedMode={true}
      />
    );
  } else if (sheetMatch) {
    page = (
      <SheetPage
        sheetId={decodeURIComponent(sheetMatch[1])}
        initialTabId={sheetMatch[2] ? decodeURIComponent(sheetMatch[2]) : ''}
        onOpenHelp={() => setIsHelpOpen(true)}
      />
    );
  } else if (path === '/settings') {
    page = <SettingsPage />;
  }

  return (
    <>
      <HelpOverlay isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      {page}
    </>
  );
};
