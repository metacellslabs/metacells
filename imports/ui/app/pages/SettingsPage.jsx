import { useEffect, useState } from 'react';
import { rpc } from '../../../../lib/rpc-client.js';
import { subscribeServerEvents } from '../../../../lib/transport/ws-client.js';
import {
  DEFAULT_AI_PROVIDERS,
  DEFAULT_CHANNEL_CONNECTORS,
  DEFAULT_JOB_SETTINGS,
} from '../../../api/settings/client-defaults.js';
import {
  SettingsAdvancedSection,
  SettingsAIProvidersSection,
  SettingsChannelsSection,
  SettingsGeneralSection,
  SettingsJobsSection,
  SettingsTabs,
} from '../components/settings/SettingsSections.jsx';
import {
  buildChannelDrafts,
  buildJobSettingsDraft,
  buildProviderDrafts,
} from './settings-page-utils.js';
import { Link, useSearchParam } from '../router.jsx';

const SETTINGS_TABS = [
  { id: 'ai', label: '🤖 AI Providers' },
  { id: 'channels', label: '📨 Channels' },
  { id: 'jobs', label: '🧱 Jobs' },
  { id: 'general', label: '⚙️ General' },
  { id: 'advanced', label: '🛠️ Advanced' },
];
const SETTINGS_TAB_IDS = SETTINGS_TABS.map((tab) => tab.id);

function normalizeProviderDraft(value) {
  return {
    id: String((value && value.id) || '').trim(),
    name: String((value && value.name) || '').trim(),
    type: String((value && value.type) || '').trim(),
    baseUrl: String((value && value.baseUrl) || '').trim(),
    model: String((value && value.model) || '').trim(),
    apiKey: String((value && value.apiKey) || '').trim(),
    enabled: value && value.enabled !== false,
  };
}

function upsertSavedProvider(providers, nextProvider) {
  const list = Array.isArray(providers) ? providers : [];
  const normalized = normalizeProviderDraft(nextProvider);
  const nextList = list.slice();
  const index = nextList.findIndex(
    (item) => String((item && item.id) || '') === normalized.id,
  );
  if (index === -1) {
    nextList.push(normalized);
  } else {
    nextList[index] = {
      ...(nextList[index] || {}),
      ...normalized,
    };
  }
  return nextList;
}

export function SettingsPage() {
  const [tabParam, setTabParam] = useSearchParam('tab');
  const registeredProviders = DEFAULT_AI_PROVIDERS;
  const registeredChannelConnectors = DEFAULT_CHANNEL_CONNECTORS;
  const defaultProviderId = String(
    (registeredProviders[0] && registeredProviders[0].id) || '',
  );
  const initialTab = String(tabParam || '').trim();
  const [activeSettingsTab, setActiveSettingsTab] = useState(
    SETTINGS_TAB_IDS.includes(initialTab) ? initialTab : SETTINGS_TAB_IDS[0],
  );
  const [activeProviderId, setActiveProviderId] = useState(defaultProviderId);
  const [selectedChipId, setSelectedChipId] = useState(() => defaultProviderId);
  const [fetchedModels, setFetchedModels] = useState({});
  const [fetchingModelsForId, setFetchingModelsForId] = useState('');
  const [providerDrafts, setProviderDrafts] = useState(() =>
    buildProviderDrafts(registeredProviders),
  );
  const [savingProviderId, setSavingProviderId] = useState('');
  const [testingProviderId, setTestingProviderId] = useState('');
  const [addingChannel, setAddingChannel] = useState('');
  const [channelDrafts, setChannelDrafts] = useState({});
  const [savingChannelId, setSavingChannelId] = useState('');
  const [testingChannelId, setTestingChannelId] = useState('');
  const [pollingNow, setPollingNow] = useState(false);
  const [jobSettingsDraft, setJobSettingsDraft] = useState(() =>
    buildJobSettingsDraft(DEFAULT_JOB_SETTINGS, DEFAULT_JOB_SETTINGS),
  );
  const [hubPublishDraft, setHubPublishDraft] = useState({
    apiBaseUrl: 'https://hub.metacells.dev',
    email: '',
    password: '',
    token: '',
  });
  const [workbookUiDraft, setWorkbookUiDraft] = useState({
    showDebugConsole: false,
  });
  const [savingHubPublishSettings, setSavingHubPublishSettings] = useState(false);
  const [savingWorkbookUiSettings, setSavingWorkbookUiSettings] = useState(false);
  const [savingJobSettings, setSavingJobSettings] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState(null);
  const [channelActivity, setChannelActivity] = useState([]);
  const [jobActivity, setJobActivity] = useState([]);
  const [jobStats, setJobStats] = useState({
    queued: 0,
    running: 0,
    retrying: 0,
    failed: 0,
    completed: 0,
  });

  useEffect(() => {
    document.body.classList.add('route-home');
    document.body.classList.remove('route-sheet');
    return () => {
      document.body.classList.remove('route-home');
    };
  }, []);

  useEffect(() => {
    const nextTab = String(tabParam || '').trim();
    setActiveSettingsTab(
      SETTINGS_TAB_IDS.includes(nextTab) ? nextTab : SETTINGS_TAB_IDS[0],
    );
  }, [tabParam]);

  useEffect(() => {
    const nextTab = SETTINGS_TAB_IDS.includes(activeSettingsTab)
      ? activeSettingsTab
      : SETTINGS_TAB_IDS[0];
    if (tabParam === nextTab) return;
    setTabParam(nextTab, { replace: true });
  }, [activeSettingsTab, setTabParam, tabParam]);

  useEffect(() => {
    rpc('settings.get')
      .then((data) => {
        setSettings(data);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load settings', err);
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeServerEvents((message) => {
      const event =
        message &&
        message.type === 'server.event' &&
        message.event &&
        typeof message.event === 'object'
          ? message.event
          : null;
      if (!event || String(event.scope || '') !== 'channels') return;

      const eventType = String(event.type || '');
      const channelId = String(event.channelId || '');
      const payload =
        event.payload && typeof event.payload === 'object' ? event.payload : {};
      const eventTimestamp = Number(event.timestamp) || Date.now();
      const isoTimestamp = new Date(eventTimestamp).toISOString();

      if (eventType === 'channels.poll.summary') {
        setPollingNow(false);
      }

      if (!channelId) return;

      setSettings((current) => {
        if (
          !current ||
          !Array.isArray(current.communicationChannels) ||
          !current.communicationChannels.length
        ) {
          return current;
        }
        let changed = false;
        const nextChannels = current.communicationChannels.map((channel) => {
          if (!channel || String(channel.id || '') !== channelId) return channel;
          const nextChannel = { ...channel };
          if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
            nextChannel.status = String(payload.status || nextChannel.status || '');
            changed = true;
          }
          if (Object.prototype.hasOwnProperty.call(payload, 'watchError')) {
            nextChannel.watchError = String(payload.watchError || '');
            changed = true;
          }
          if (Object.prototype.hasOwnProperty.call(payload, 'lastSeenUid')) {
            nextChannel.lastSeenUid = Number(payload.lastSeenUid) || 0;
            changed = true;
          }
          if (Object.prototype.hasOwnProperty.call(payload, 'lastPolledAt')) {
            nextChannel.lastPolledAt = payload.lastPolledAt || isoTimestamp;
            changed = true;
          }
          if (Object.prototype.hasOwnProperty.call(payload, 'lastEventId')) {
            nextChannel.lastEventId = String(payload.lastEventId || '');
            changed = true;
          }
          if (Object.prototype.hasOwnProperty.call(payload, 'lastEventAt')) {
            nextChannel.lastEventAt = payload.lastEventAt || isoTimestamp;
            changed = true;
          }
          if (Object.prototype.hasOwnProperty.call(payload, 'preview')) {
            nextChannel.lastEventPreview =
              payload.preview && typeof payload.preview === 'object'
                ? payload.preview
                : nextChannel.lastEventPreview || null;
            changed = true;
          }
          return nextChannel;
        });
        if (!changed) return current;
        return {
          ...current,
          communicationChannels: nextChannels,
        };
      });

      setChannelDrafts((current) => {
        if (!current || !current[channelId]) return current;
        const nextDraft = { ...current[channelId] };
        let changed = false;
        if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
          nextDraft.status = String(payload.status || nextDraft.status || '');
          changed = true;
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'watchError')) {
          nextDraft.watchError = String(payload.watchError || '');
          changed = true;
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'lastSeenUid')) {
          nextDraft.lastSeenUid = Number(payload.lastSeenUid) || 0;
          changed = true;
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'lastPolledAt')) {
          nextDraft.lastPolledAt = payload.lastPolledAt || isoTimestamp;
          changed = true;
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'lastEventId')) {
          nextDraft.lastEventId = String(payload.lastEventId || '');
          changed = true;
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'lastEventAt')) {
          nextDraft.lastEventAt = payload.lastEventAt || isoTimestamp;
          changed = true;
        }
        if (Object.prototype.hasOwnProperty.call(payload, 'preview')) {
          nextDraft.lastEventPreview =
            payload.preview && typeof payload.preview === 'object'
              ? payload.preview
              : nextDraft.lastEventPreview || null;
          changed = true;
        }
        if (!changed) return current;
        return {
          ...current,
          [channelId]: nextDraft,
        };
      });

      if (
        eventType === 'channels.state' ||
        eventType === 'channels.event.received' ||
        eventType === 'channels.poll.complete' ||
        eventType === 'channels.poll.failed' ||
        eventType === 'channels.subscription.started' ||
        eventType === 'channels.subscription.failed'
      ) {
        const label = String(event.channelLabel || channelId || 'channel');
        const text =
          eventType === 'channels.event.received'
            ? `Received ${String(payload.eventType || 'event')}`
            : eventType === 'channels.poll.failed'
              ? String(payload.message || 'Poll failed')
              : eventType === 'channels.subscription.failed'
                ? String(payload.message || 'Subscription failed')
                : eventType === 'channels.poll.complete'
                  ? `Poll complete, ${Number(payload.events) || 0} event(s)`
                  : eventType === 'channels.subscription.started'
                    ? 'Live subscription started'
                    : `State updated to ${String(payload.status || 'unknown')}`;
        setChannelActivity((current) =>
          [
            {
              id: `${eventTimestamp}:${event.sequence || 0}:${eventType}:${channelId}`,
              timestamp: eventTimestamp,
              label,
              type: eventType,
              text,
            },
            ...current,
          ].slice(0, 12),
        );
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeServerEvents((message) => {
      const event =
        message &&
        message.type === 'server.event' &&
        message.event &&
        typeof message.event === 'object'
          ? message.event
          : null;
      if (!event || String(event.scope || '') !== 'jobs') return;

      const eventType = String(event.type || '');
      const jobId = String(event.jobId || '');
      const jobType = String(event.jobType || '');
      const jobStatus = String(
        event.jobStatus ||
          (event.payload && event.payload.status) ||
          '',
      ).toLowerCase();
      const payload =
        event.payload && typeof event.payload === 'object' ? event.payload : {};
      const eventTimestamp = Number(event.timestamp) || Date.now();

      const text =
        eventType === 'jobs.failed'
          ? String(payload.message || 'Job failed')
          : eventType === 'jobs.completed'
            ? 'Completed'
            : eventType === 'jobs.running'
              ? 'Started running'
              : eventType === 'jobs.queued'
                ? 'Queued'
                : eventType === 'jobs.retrying'
                  ? `Retrying${payload.delayMs ? ` in ${payload.delayMs}ms` : ''}`
                  : eventType === 'jobs.deferred'
                    ? `Deferred${payload.delayMs ? ` for ${payload.delayMs}ms` : ''}`
                    : eventType === 'jobs.cancelled'
                      ? 'Cancelled'
                      : eventType === 'jobs.heartbeat'
                        ? 'Heartbeat'
                        : eventType === 'jobs.claimed'
                          ? 'Claimed by worker'
                          : `State: ${jobStatus || 'updated'}`;

      setJobActivity((current) =>
        [
          {
            id: `${eventTimestamp}:${event.sequence || 0}:${eventType}:${jobId}`,
            timestamp: eventTimestamp,
            label: jobType || 'job',
            jobId,
            type: eventType,
            status: jobStatus,
            text,
          },
          ...current,
        ].slice(0, 20),
      );

      if (
        eventType === 'jobs.state' ||
        eventType === 'jobs.queued' ||
        eventType === 'jobs.running' ||
        eventType === 'jobs.retrying' ||
        eventType === 'jobs.failed' ||
        eventType === 'jobs.completed' ||
        eventType === 'jobs.cancelled'
      ) {
        setJobStats((current) => {
          const next = { ...current };
          if (eventType === 'jobs.queued') next.queued += 1;
          if (eventType === 'jobs.running') next.running += 1;
          if (eventType === 'jobs.retrying') next.retrying += 1;
          if (eventType === 'jobs.failed') next.failed += 1;
          if (eventType === 'jobs.completed') next.completed += 1;
          if (eventType === 'jobs.cancelled') {
            next.running = Math.max(0, next.running - 1);
          }
          if (eventType === 'jobs.state') {
            if (jobStatus === 'queued') next.queued += 1;
            if (jobStatus === 'running') next.running += 1;
            if (jobStatus === 'retrying') next.retrying += 1;
            if (jobStatus === 'failed') next.failed += 1;
            if (jobStatus === 'completed') next.completed += 1;
          }
          return next;
        });
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const providers = Array.isArray(settings && settings.aiProviders)
      ? settings.aiProviders
      : [];
    const channels = Array.isArray(settings && settings.communicationChannels)
      ? settings.communicationChannels
      : [];
    const nextActiveId = (settings && settings.activeAIProviderId) || defaultProviderId;
    setActiveProviderId(nextActiveId);
    setSelectedChipId(nextActiveId);
    setProviderDrafts(buildProviderDrafts(registeredProviders, providers));
    setChannelDrafts(buildChannelDrafts(registeredChannelConnectors, channels));
    setJobSettingsDraft(
      buildJobSettingsDraft(settings && settings.jobSettings, DEFAULT_JOB_SETTINGS),
    );
    setHubPublishDraft({
      apiBaseUrl: String(
        (settings && settings.hubPublish && settings.hubPublish.apiBaseUrl) ||
          (window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1'
            ? 'http://localhost:4001'
            : 'https://hub.metacells.dev'),
      ),
      email: String(
        (settings && settings.hubPublish && settings.hubPublish.email) || '',
      ),
      password: String(
        (settings && settings.hubPublish && settings.hubPublish.password) || '',
      ),
      token: String(
        (settings && settings.hubPublish && settings.hubPublish.token) || '',
      ),
    });
    setWorkbookUiDraft({
      showDebugConsole:
        !!(
          settings &&
          settings.workbookUi &&
          settings.workbookUi.showDebugConsole
        ),
    });
  }, [settings && settings.updatedAt ? new Date(settings.updatedAt).getTime() : 0]);

  const handleProviderDraftChange = (providerId, fieldKey, value) => {
    setProviderDrafts((current) => ({
      ...current,
      [providerId]: {
        ...(current[providerId] || {}),
        [fieldKey]: value,
      },
    }));
  };

  const handleFetchModels = (providerId) => {
    if (fetchingModelsForId) return;
    const draft = providerDrafts[providerId];
    if (!draft || !String(draft.baseUrl || '').trim()) {
      window.alert('Please enter a Base URL first.');
      return;
    }
    setFetchingModelsForId(providerId);
    rpc(
      'ai.fetchProviderModels',
      String(draft.type || '').trim(),
      String(draft.baseUrl || '').trim(),
      String(draft.apiKey || '').trim() || null,
    )
      .then((models) => {
        setFetchingModelsForId('');
        setFetchedModels((current) => ({
          ...current,
          [providerId]: Array.isArray(models) ? models : [],
        }));
      })
      .catch((error) => {
        setFetchingModelsForId('');
        window.alert(error.reason || error.message || 'Failed to fetch models');
      });
  };

  const handleTestProvider = (providerId) => {
    if (testingProviderId) return;
    const draft = providerDrafts[providerId];
    if (!draft || !String(draft.baseUrl || '').trim()) {
      window.alert('Please enter a Base URL first.');
      return;
    }
    setTestingProviderId(providerId);
    rpc(
      'ai.testProviderConnection',
      String(draft.type || '').trim(),
      String(draft.baseUrl || '').trim(),
      String(draft.apiKey || '').trim() || null,
      String(draft.model || '').trim() || null,
    )
      .then(() => {
        setTestingProviderId('');
        window.alert('Provider connection OK');
      })
      .catch((error) => {
        setTestingProviderId('');
        window.alert(
          error.reason || error.message || 'Failed to test AI provider',
        );
      });
  };

  const handleSaveAndActivate = (providerId) => {
    if (savingProviderId) return;
    const draft = providerDrafts[providerId];
    if (!draft) return;
    const nextProvider = normalizeProviderDraft(draft);
    setSavingProviderId(providerId);
    rpc('settings.upsertAIProvider', nextProvider)
      .then(() => rpc('settings.setActiveAIProvider', providerId))
      .then(() => {
        setSavingProviderId('');
        setActiveProviderId(providerId);
        setSettings((current) => {
          if (!current || typeof current !== 'object') return current;
          return {
            ...current,
            activeAIProviderId: providerId,
            aiProviders: upsertSavedProvider(current.aiProviders, nextProvider),
          };
        });
      })
      .catch((error) => {
        setSavingProviderId('');
        window.alert(error.reason || error.message || 'Failed to save AI provider');
      });
  };

  const handleSaveProvider = (providerId) => {
    if (savingProviderId) return;
    const draft = providerDrafts[providerId];
    if (!draft) return;
    const nextProvider = normalizeProviderDraft(draft);
    setSavingProviderId(providerId);
    rpc('settings.upsertAIProvider', nextProvider)
      .then(() => {
        setSavingProviderId('');
        setSettings((current) => {
          if (!current || typeof current !== 'object') return current;
          return {
            ...current,
            aiProviders: upsertSavedProvider(current.aiProviders, nextProvider),
          };
        });
      })
      .catch((error) => {
        setSavingProviderId('');
        window.alert(error.reason || error.message || 'Failed to save AI provider');
      });
  };

  const savedProviders = Array.isArray(settings && settings.aiProviders)
    ? settings.aiProviders
    : [];
  const providerDraftDirtyById = Object.fromEntries(
    registeredProviders.map((provider) => {
      const providerId = String((provider && provider.id) || '');
      const draft = providerDrafts[providerId] || provider || {};
      const saved =
        savedProviders.find(
          (item) => String((item && item.id) || '') === providerId,
        ) || provider || {};
      return [
        providerId,
        JSON.stringify(normalizeProviderDraft(draft)) !==
          JSON.stringify(normalizeProviderDraft(saved)),
      ];
    }),
  );

  const handleAddChannel = (connectorId) => {
    if (addingChannel) return;
    setAddingChannel(connectorId);
    rpc('settings.addCommunicationChannel', connectorId)
      .then(() => setAddingChannel(''))
      .catch((error) => {
        setAddingChannel('');
        window.alert(
          error.reason || error.message || 'Failed to add communication channel',
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
    rpc('settings.upsertCommunicationChannel', {
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
          error.reason || error.message || 'Failed to save communication channel',
        );
      });
  };

  const handleTestChannel = (channelId) => {
    if (testingChannelId) return;
    setTestingChannelId(channelId);
    rpc('settings.testCommunicationChannel', channelId)
      .then((result) => {
        setTestingChannelId('');
        if (result && result.message) window.alert(result.message);
      })
      .catch((error) => {
        setTestingChannelId('');
        window.alert(
          error.reason || error.message || 'Failed to test communication channel',
        );
      });
  };

  const handlePollNow = () => {
    if (pollingNow) return;
    setPollingNow(true);
    rpc('channels.pollNow')
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
                if (item.skipped) return `${label}: ${String(item.reason || 'skipped')}`;
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
        window.alert(error.reason || error.message || 'Failed to poll channels');
      });
  };

  const handleJobSettingsDraftChange = (fieldKey, value) => {
    setJobSettingsDraft((current) => ({
      ...current,
      [fieldKey]: value,
    }));
  };

  const handleHubPublishDraftChange = (fieldKey, value) => {
    setHubPublishDraft((current) => ({
      ...current,
      [fieldKey]: value,
    }));
  };

  const handleSaveHubPublishSettings = () => {
    if (savingHubPublishSettings) return;
    setSavingHubPublishSettings(true);
    rpc('settings.updateHubPublishSettings', {
      apiBaseUrl: String(hubPublishDraft.apiBaseUrl || '').trim(),
      email: String(hubPublishDraft.email || '').trim(),
      password: String(hubPublishDraft.password || ''),
      token: String(hubPublishDraft.token || '').trim(),
    })
      .then((nextHubPublish) => {
        setSavingHubPublishSettings(false);
        setSettings((current) => ({
          ...(current || {}),
          hubPublish: nextHubPublish,
          updatedAt: new Date(),
        }));
      })
      .catch((error) => {
        setSavingHubPublishSettings(false);
        window.alert(
          error.reason || error.message || 'Failed to save hub settings',
        );
      });
  };

  const handleWorkbookUiDraftChange = (fieldKey, value) => {
    setWorkbookUiDraft((current) => ({
      ...current,
      [fieldKey]: value,
    }));
  };

  const handleSaveWorkbookUiSettings = () => {
    if (savingWorkbookUiSettings) return;
    setSavingWorkbookUiSettings(true);
    rpc('settings.updateWorkbookUiSettings', {
      showDebugConsole: workbookUiDraft.showDebugConsole === true,
    })
      .then((nextWorkbookUi) => {
        setSavingWorkbookUiSettings(false);
        setSettings((current) => ({
          ...(current || {}),
          workbookUi: nextWorkbookUi,
          updatedAt: new Date(),
        }));
      })
      .catch((error) => {
        setSavingWorkbookUiSettings(false);
        window.alert(
          error.reason || error.message || 'Failed to save workbook UI settings',
        );
      });
  };

  const handleSaveJobSettings = () => {
    if (savingJobSettings) return;
    setSavingJobSettings(true);
    rpc('settings.updateJobSettings', {
      workerEnabled: jobSettingsDraft.workerEnabled !== false,
      aiChatConcurrency:
        Number(jobSettingsDraft.aiChatConcurrency) || DEFAULT_JOB_SETTINGS.aiChatConcurrency,
      aiChatMaxAttempts:
        Number(jobSettingsDraft.aiChatMaxAttempts) || DEFAULT_JOB_SETTINGS.aiChatMaxAttempts,
      aiChatRetryDelayMs:
        Number(jobSettingsDraft.aiChatRetryDelayMs) || DEFAULT_JOB_SETTINGS.aiChatRetryDelayMs,
      aiChatTimeoutMs:
        Number(jobSettingsDraft.aiChatTimeoutMs) || DEFAULT_JOB_SETTINGS.aiChatTimeoutMs,
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
        window.alert(error.reason || error.message || 'Failed to save job settings');
      });
  };

  const aiProviders = Array.isArray(settings && settings.aiProviders)
    ? settings.aiProviders
    : [];
  const communicationChannels = Array.isArray(settings && settings.communicationChannels)
    ? settings.communicationChannels
    : [];
  const activeProviderLabel = (
    aiProviders.find((provider) => provider && provider.id === activeProviderId) ||
    registeredProviders.find((provider) => provider && provider.id === activeProviderId) ||
    registeredProviders[0] || { name: 'None' }
  ).name;
  const configuredChannelsCount = communicationChannels.length;
  const configuredSecretsCount = Object.values(providerDrafts).filter((provider) =>
    String((provider && provider.apiKey) || '').trim(),
  ).length;
  const savedHubPublish = {
    apiBaseUrl: String(
      (settings && settings.hubPublish && settings.hubPublish.apiBaseUrl) ||
        (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
          ? 'http://localhost:4001'
          : 'https://hub.metacells.dev'),
    ),
    email: String(
      (settings && settings.hubPublish && settings.hubPublish.email) || '',
    ),
    password: String(
      (settings && settings.hubPublish && settings.hubPublish.password) || '',
    ),
    token: String(
      (settings && settings.hubPublish && settings.hubPublish.token) || '',
    ),
  };
  const hubPublishDirty =
    JSON.stringify(savedHubPublish) !== JSON.stringify(hubPublishDraft);
  const savedWorkbookUi = {
    showDebugConsole:
      !!(
        settings &&
        settings.workbookUi &&
        settings.workbookUi.showDebugConsole
      ),
  };
  const workbookUiDirty =
    JSON.stringify(savedWorkbookUi) !== JSON.stringify(workbookUiDraft);

  const renderSettingsPanel = () => {
    if (activeSettingsTab === 'channels') {
      return (
        <SettingsChannelsSection
          communicationChannels={communicationChannels}
          registeredChannelConnectors={registeredChannelConnectors}
          pollingNow={pollingNow}
          handlePollNow={handlePollNow}
          addingChannel={addingChannel}
          handleAddChannel={handleAddChannel}
          channelDrafts={channelDrafts}
          handleChannelDraftChange={handleChannelDraftChange}
          handleSaveChannel={handleSaveChannel}
          savingChannelId={savingChannelId}
          handleTestChannel={handleTestChannel}
          testingChannelId={testingChannelId}
          channelActivity={channelActivity}
        />
      );
    }
    if (activeSettingsTab === 'general') {
      return (
        <SettingsGeneralSection
          activeProviderLabel={activeProviderLabel}
          registeredProviders={registeredProviders}
          configuredChannelsCount={configuredChannelsCount}
          configuredSecretsCount={configuredSecretsCount}
          hubPublishDraft={hubPublishDraft}
          onHubPublishDraftChange={handleHubPublishDraftChange}
          onSaveHubPublishSettings={handleSaveHubPublishSettings}
          savingHubPublishSettings={savingHubPublishSettings}
          hubPublishDirty={hubPublishDirty}
          workbookUiDraft={workbookUiDraft}
          onWorkbookUiDraftChange={handleWorkbookUiDraftChange}
          onSaveWorkbookUiSettings={handleSaveWorkbookUiSettings}
          savingWorkbookUiSettings={savingWorkbookUiSettings}
          workbookUiDirty={workbookUiDirty}
        />
      );
    }
    if (activeSettingsTab === 'jobs') {
      return (
        <SettingsJobsSection
          jobSettingsDraft={jobSettingsDraft}
          handleJobSettingsDraftChange={handleJobSettingsDraftChange}
          handleSaveJobSettings={handleSaveJobSettings}
          savingJobSettings={savingJobSettings}
          jobActivity={jobActivity}
          jobStats={jobStats}
        />
      );
    }
    if (activeSettingsTab === 'advanced') {
      return (
        <SettingsAdvancedSection
          registeredProviders={registeredProviders}
          providerDrafts={providerDrafts}
        />
      );
    }
    return (
      <SettingsAIProvidersSection
        registeredProviders={registeredProviders}
        selectedChipId={selectedChipId}
        setSelectedChipId={setSelectedChipId}
        providerDrafts={providerDrafts}
        providerDraftDirtyById={providerDraftDirtyById}
        fetchedModels={fetchedModels}
        fetchingModelsForId={fetchingModelsForId}
        activeProviderId={activeProviderId}
        handleProviderDraftChange={handleProviderDraftChange}
        handleFetchModels={handleFetchModels}
        handleTestProvider={handleTestProvider}
        handleSaveProvider={handleSaveProvider}
        handleSaveAndActivate={handleSaveAndActivate}
        savingProviderId={savingProviderId}
        testingProviderId={testingProviderId}
      />
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
            <Link className="home-secondary-link" to="/">
              ← Back
            </Link>
          </div>
        </div>
      </section>

      <section className="home-card settings-card settings-layout">
        <SettingsTabs
          tabs={SETTINGS_TABS}
          activeTab={activeSettingsTab}
          onSelect={setActiveSettingsTab}
        />
        <div className="settings-panel" role="tabpanel">
          {isLoading ? <p className="home-empty-note">Loading settings...</p> : renderSettingsPanel()}
        </div>
      </section>
    </main>
  );
}
