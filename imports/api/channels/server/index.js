import { AppError } from '../../../../lib/app-error.js';
import { registerStartupHook } from '../../../../lib/startup-hooks.js';
import { check, Match } from '../../../../lib/check.js';
import { registerMethods } from '../../../../lib/rpc.js';
import { getRegisteredChannelConnectorById } from '../connectors/index.js';
import {
  AppSettings,
  DEFAULT_SETTINGS_ID,
  ensureDefaultSettings,
} from '../../settings/index.js';
import { registerAIQueueSheetRuntimeHooks } from '../../ai/index.js';
import {
  normalizeChannelLabel,
  CHANNEL_POLL_INTERVAL_MS,
} from '../mentioning.js';
import { getActiveChannelPayloadMap } from '../runtime-state.js';
import {
  insertChannelEvent,
  buildChannelEventPreview,
  ChannelEvents,
} from '../events.js';
import { getRegisteredChannelHandlerById } from './handlers/index.js';
import { publishServerEvent } from '../../../../server/ws-events.js';

const activeChannelPolls = new Set();
const activeChannelSubscriptions = new Map();
let channelPollingWorkerStarted = false;

function logChannelRuntime(event, payload) {
  console.log(`[channels] ${event}`, payload);
}

function publishChannelEvent(type, channel, payload = {}) {
  const source = channel && typeof channel === 'object' ? channel : {};
  return publishServerEvent({
    type,
    scope: 'channels',
    channelId: String(source.id || payload.channelId || ''),
    channelLabel: String(source.label || payload.channelLabel || ''),
    payload: {
      connectorId: String(source.connectorId || source.type || ''),
      status: String(source.status || payload.status || ''),
      ...payload,
    },
  });
}

function normalizeChannelSettings(connector, currentSettings) {
  const source =
    currentSettings && typeof currentSettings === 'object'
      ? currentSettings
      : {};
  const next = {};
  const fields = Array.isArray(connector && connector.settingsFields)
    ? connector.settingsFields
    : [];
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i];
    const key = String(field.key || '');
    const defaultValue = field.defaultValue == null ? '' : field.defaultValue;
    next[key] = Object.prototype.hasOwnProperty.call(source, key)
      ? source[key]
      : defaultValue;
  }
  return next;
}

function normalizeSearchOptions(options) {
  const source = options && typeof options === 'object' ? options : {};
  return {
    limit: Math.max(1, Math.min(100, parseInt(source.limit, 10) || 20)),
  };
}

function flattenSearchableText(value, parts) {
  const bucket = Array.isArray(parts) ? parts : [];
  if (value == null) return bucket;
  if (Array.isArray(value)) {
    value.forEach((item) => flattenSearchableText(item, bucket));
    return bucket;
  }
  if (typeof value === 'object') {
    Object.keys(value).forEach((key) => {
      flattenSearchableText(value[key], bucket);
    });
    return bucket;
  }
  const text = String(value).trim();
  if (text) bucket.push(text);
  return bucket;
}

function buildChannelEventSearchResult(doc) {
  const source = doc && typeof doc === 'object' ? doc : {};
  const data =
    source.data && typeof source.data === 'object' ? source.data : {};
  const title = String(
    data.title ||
      data.name ||
      source.subject ||
      data.summary ||
      source.event ||
      'Channel event',
  ).trim();
  const summary = String(
    data.summary ||
      source.text ||
      data.text ||
      data.url ||
      source.subject ||
      '',
  ).trim();
  const url = String(
    data.url ||
      data.webViewLink ||
      data.webContentLink ||
      data.htmlUrl ||
      '',
  ).trim();
  return {
    id: String(source._id || ''),
    title,
    summary,
    url,
    createdAt:
      source.createdAt instanceof Date
        ? source.createdAt.toISOString()
        : String(source.createdAt || ''),
    connectorId: String(source.connectorId || ''),
    label: String(source.label || ''),
    event: String(source.event || ''),
    raw: {
      subject: String(source.subject || ''),
      text: String(source.text || ''),
      data,
    },
  };
}

async function searchChannelEventHistory(channel, query, options) {
  const source = channel && typeof channel === 'object' ? channel : {};
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const searchOptions = normalizeSearchOptions(options);
  const recent = await ChannelEvents.find(
    {
      $or: [
        { channelId: String(source.id || '') },
        { label: String(source.label || '') },
      ],
    },
    {
      sort: { createdAt: -1, _id: -1 },
      limit: Math.max(50, searchOptions.limit * 10),
    },
  ).fetchAsync();

  const filtered = recent.filter((doc) => {
    if (!normalizedQuery) return true;
    const haystack = flattenSearchableText(doc, []).join('\n').toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  return {
    ok: true,
    query: String(query || ''),
    source: 'channel_events',
    total: filtered.length,
    items: filtered
      .slice(0, searchOptions.limit)
      .map((doc) => buildChannelEventSearchResult(doc)),
  };
}

function getChannelHandler(connectorId) {
  const handler = getRegisteredChannelHandlerById(connectorId);
  if (handler) return handler;
  throw new AppError(
    'channel-connector-not-supported',
    `Unsupported channel connector: ${connectorId}`,
  );
}

function buildNormalizedChannels(current) {
  return Array.isArray(current && current.communicationChannels)
    ? [...current.communicationChannels]
    : [];
}

function findConfiguredChannelById(channels, channelId) {
  const target = String(channelId || '').trim();
  return (
    (Array.isArray(channels) ? channels : []).find(
      (item) => item && String(item.id || '') === target,
    ) || null
  );
}

function findConfiguredChannelByLabel(channels, label) {
  const target = normalizeChannelLabel(label);
  if (!target) return null;
  return (
    (Array.isArray(channels) ? channels : []).find(
      (item) =>
        item &&
        item.enabled !== false &&
        normalizeChannelLabel(item.label) === target,
    ) || null
  );
}

async function saveChannelRuntimeState(channelId, updates) {
  const source = updates && typeof updates === 'object' ? updates : {};
  await AppSettings.updateAsync(
    { _id: DEFAULT_SETTINGS_ID, 'communicationChannels.id': channelId },
    {
      $set: {
        ...Object.fromEntries(
          Object.keys(source).map((key) => [
            `communicationChannels.$.${key}`,
            source[key],
          ]),
        ),
        updatedAt: new Date(),
      },
    },
  );
  publishChannelEvent('channels.state', { id: channelId }, source);
}

async function migrateLegacyChannelEvents() {
  await ensureDefaultSettings();
  const current = await AppSettings.findOneAsync(DEFAULT_SETTINGS_ID);
  const channels = Array.isArray(current && current.communicationChannels)
    ? current.communicationChannels
    : [];
  let changed = false;
  const nextChannels = [];

  for (let i = 0; i < channels.length; i += 1) {
    const channel =
      channels[i] && typeof channels[i] === 'object'
        ? { ...channels[i] }
        : null;
    if (!channel) continue;
    if (
      !channel.lastEventId &&
      channel.lastEvent &&
      typeof channel.lastEvent === 'object'
    ) {
      const savedEvent = await insertChannelEvent({
        ...channel.lastEvent,
        label: String(channel.label || ''),
        channelId: String(channel.id || ''),
        connectorId: String(channel.connectorId || channel.type || ''),
      });
      channel.lastEventId = String((savedEvent && savedEvent._id) || '');
      channel.lastEventPreview = buildChannelEventPreview(savedEvent);
      delete channel.lastEvent;
      changed = true;
    }
    nextChannels.push(channel);
  }

  if (!changed) return;

  await AppSettings.updateAsync(
    { _id: DEFAULT_SETTINGS_ID },
    {
      $set: {
        communicationChannels: nextChannels,
        updatedAt: new Date(),
      },
    },
  );

  logChannelRuntime('legacy.events.migrated', { count: nextChannels.length });
}

async function triggerChannelMentionRecompute(channelLabel) {
  const label = normalizeChannelLabel(channelLabel);
  if (!label) return;
  const { recomputeSheetsMentioningChannel } =
    await import('../../sheets/index.js');
  await recomputeSheetsMentioningChannel(label);
}

async function applyChannelEvent(channel, payload, nextUid) {
  const handler = getChannelHandler(channel.connectorId);
  const handled = await handler.normalizeEvent({
    channel,
    eventType: payload && payload.event,
    payload,
  });
  const normalizedMessage =
    handled && handled.message && typeof handled.message === 'object'
      ? {
          ...handled.message,
          event: String(
            handled.event || (payload && payload.event) || 'message.new',
          ),
          label: String(channel.label || ''),
        }
      : {
          event: String((payload && payload.event) || 'message.new'),
          label: String(channel.label || ''),
        };

  const savedEvent = await insertChannelEvent(normalizedMessage);
  await saveChannelRuntimeState(channel.id, {
    status: 'connected',
    watchError: '',
    lastEventId: String((savedEvent && savedEvent._id) || ''),
    lastEventPreview: buildChannelEventPreview(savedEvent),
    lastEventAt: new Date(),
    lastSeenUid: Number(nextUid) || 0,
    lastPolledAt: new Date(),
  });

  publishChannelEvent('channels.event.received', channel, {
    eventId: String((savedEvent && savedEvent._id) || ''),
    eventType: String(normalizedMessage.event || ''),
    preview: buildChannelEventPreview(savedEvent),
    nextUid: Number(nextUid) || 0,
  });

  await triggerChannelMentionRecompute(channel.label);
}

async function pollSingleChannel(channel) {
  const channelId = String((channel && channel.id) || '');
  if (!channelId) {
    logChannelRuntime('poll.skip', { reason: 'missing-id' });
    return {
      channelId: '',
      label: '',
      skipped: true,
      reason: 'missing-id',
      events: 0,
    };
  }
  if (activeChannelPolls.has(channelId)) {
    logChannelRuntime('poll.skip', {
      channelId,
      label: String((channel && channel.label) || ''),
      reason: 'already-polling',
    });
    return {
      channelId,
      label: String((channel && channel.label) || ''),
      skipped: true,
      reason: 'already-polling',
      events: 0,
    };
  }

  activeChannelPolls.add(channelId);
  try {
    const connector = getRegisteredChannelConnectorById(channel.connectorId);
    if (!connector || connector.supportsReceive === false) {
      logChannelRuntime('poll.skip', {
        channelId,
        label: String((channel && channel.label) || ''),
        reason: 'receive-not-supported',
      });
      return {
        channelId,
        label: String((channel && channel.label) || ''),
        skipped: true,
        reason: 'receive-not-supported',
        events: 0,
      };
    }
    if (
      !connector.capabilities ||
      connector.capabilities.poll !== true
    ) {
      logChannelRuntime('poll.skip', {
        channelId,
        label: String((channel && channel.label) || ''),
        reason: 'poll-disabled',
      });
      return {
        channelId,
        label: String((channel && channel.label) || ''),
        skipped: true,
        reason: 'poll-disabled',
        events: 0,
      };
    }
    const handler = getChannelHandler(connector.id);
    if (
      !handler ||
      !handler.capabilities ||
      handler.capabilities.poll !== true ||
      typeof handler.poll !== 'function'
    ) {
      logChannelRuntime('poll.skip', {
        channelId,
        label: String((channel && channel.label) || ''),
        reason: 'missing-poll-handler',
      });
      return {
        channelId,
        label: String((channel && channel.label) || ''),
        skipped: true,
        reason: 'missing-poll-handler',
        events: 0,
      };
    }

    const result = await handler.poll({
      channel,
      settings: normalizeChannelSettings(connector, channel.settings),
    });

    const events = Array.isArray(result && result.events) ? result.events : [];
    const lastSeenUid =
      Number(result && result.lastSeenUid) || Number(channel.lastSeenUid) || 0;

    if (!events.length) {
      logChannelRuntime('poll.channel.complete', {
        channelId,
        label: String((channel && channel.label) || ''),
        events: 0,
        lastSeenUid,
      });
      await saveChannelRuntimeState(channelId, {
        status: 'connected',
        watchError: '',
        lastSeenUid,
        lastPolledAt: new Date(),
      });
      publishChannelEvent('channels.poll.complete', channel, {
        ok: true,
        events: 0,
        lastSeenUid,
      });
      return {
        channelId,
        label: String((channel && channel.label) || ''),
        ok: true,
        events: 0,
        lastSeenUid,
      };
    }

    for (let i = 0; i < events.length; i += 1) {
      const event = events[i];
      const eventUid = Number(event && event.uid) || lastSeenUid;
      await applyChannelEvent(channel, event, eventUid);
    }
    logChannelRuntime('poll.channel.complete', {
      channelId,
      label: String((channel && channel.label) || ''),
      events: events.length,
      lastSeenUid,
    });
    publishChannelEvent('channels.poll.complete', channel, {
      ok: true,
      events: events.length,
      lastSeenUid,
    });
    return {
      channelId,
      label: String((channel && channel.label) || ''),
      ok: true,
      events: events.length,
      lastSeenUid,
    };
  } catch (error) {
    const message = String(
      (error && (error.reason || error.message)) ||
        error ||
        'Channel poll failed',
    ).trim();
    logChannelRuntime('poll.failed', {
      channelId,
      label: String((channel && channel.label) || ''),
      message,
    });
    await saveChannelRuntimeState(channelId, {
      status: 'error',
      watchError: message,
      lastPolledAt: new Date(),
    });
    publishChannelEvent('channels.poll.failed', channel, {
      ok: false,
      message,
    });
    return {
      channelId,
      label: String((channel && channel.label) || ''),
      ok: false,
      events: 0,
      error: message,
    };
  } finally {
    activeChannelPolls.delete(channelId);
  }
}

async function pollEnabledChannels() {
  await ensureDefaultSettings();
  const current = await AppSettings.findOneAsync(DEFAULT_SETTINGS_ID);
  const channels = buildNormalizedChannels(current)
    .filter((channel) => channel && channel.enabled !== false)
    .filter((channel) => {
      const label = normalizeChannelLabel(channel.label);
      return !!label;
    });

  logChannelRuntime('poll.scan.start', {
    totalConfigured: Array.isArray(current && current.communicationChannels)
      ? current.communicationChannels.length
      : 0,
    enabledWithLabels: channels.length,
    labels: channels.map((channel) => String((channel && channel.label) || '')),
  });

  const results = [];
  for (let i = 0; i < channels.length; i += 1) {
    results.push(await pollSingleChannel(channels[i]));
  }

  const summary = {
    total: channels.length,
    polled: results.filter((item) => item && item.ok).length,
    skipped: results.filter((item) => item && item.skipped).length,
    failed: results.filter((item) => item && item.ok === false).length,
    events: results.reduce(
      (sum, item) => sum + (Number(item && item.events) || 0),
      0,
    ),
    results,
  };
  logChannelRuntime('poll.scan.complete', summary);
  publishServerEvent({
    type: 'channels.poll.summary',
    scope: 'channels',
    payload: summary,
  });
  return summary;
}

async function stopChannelSubscription(channelId) {
  const key = String(channelId || '').trim();
  if (!key || !activeChannelSubscriptions.has(key)) return;
  const cleanup = activeChannelSubscriptions.get(key);
  activeChannelSubscriptions.delete(key);
  try {
    if (typeof cleanup === 'function') {
      await cleanup();
    } else if (cleanup && typeof cleanup.unsubscribe === 'function') {
      await cleanup.unsubscribe();
    }
  } catch (error) {
    logChannelRuntime('subscribe.stop.failed', {
      channelId: key,
      message: error && error.message ? error.message : String(error),
    });
  }
}

async function ensureChannelSubscription(channel) {
  const channelId = String((channel && channel.id) || '').trim();
  if (!channelId) return;
  const connector = getRegisteredChannelConnectorById(channel.connectorId);
  const handler = connector ? getChannelHandler(connector.id) : null;
  if (
    !channel ||
    channel.enabled === false ||
    !connector ||
    connector.supportsReceive === false ||
    !handler ||
    typeof handler.subscribe !== 'function'
  ) {
    await stopChannelSubscription(channelId);
    return;
  }
  if (activeChannelSubscriptions.has(channelId)) return;

  const settings = normalizeChannelSettings(connector, channel.settings);
  try {
    const cleanup = await handler.subscribe({
      channel,
      settings,
      onEvent: async ({ payload, nextUid }) => {
        await applyChannelEvent(channel, payload, nextUid);
      },
      onError: async (error) => {
        const message = String(
          (error && (error.reason || error.message)) ||
            error ||
            'Channel subscription failed',
        ).trim();
        logChannelRuntime('subscribe.failed', {
          channelId,
          label: String((channel && channel.label) || ''),
          message,
        });
        await saveChannelRuntimeState(channelId, {
          status: 'error',
          watchError: message,
          lastPolledAt: new Date(),
        });
        await stopChannelSubscription(channelId);
      },
      onState: async (state) => {
        const source = state && typeof state === 'object' ? state : {};
        await saveChannelRuntimeState(channelId, {
          status: 'connected',
          watchError: '',
          ...(Object.prototype.hasOwnProperty.call(source, 'lastSeenUid')
            ? { lastSeenUid: Number(source.lastSeenUid) || 0 }
            : {}),
          lastPolledAt: new Date(),
        });
      },
    });
    activeChannelSubscriptions.set(channelId, cleanup || true);
    logChannelRuntime('subscribe.started', {
      channelId,
      label: String((channel && channel.label) || ''),
      connectorId: String((channel && channel.connectorId) || ''),
    });
    publishChannelEvent('channels.subscription.started', channel, {
      connectorId: String((channel && channel.connectorId) || ''),
    });
  } catch (error) {
    logChannelRuntime('subscribe.start_failed', {
      channelId,
      label: String((channel && channel.label) || ''),
      message: error && error.message ? error.message : String(error),
    });
    publishChannelEvent('channels.subscription.failed', channel, {
      message: error && error.message ? error.message : String(error),
    });
  }
}

async function reconcileChannelSubscriptions() {
  await ensureDefaultSettings();
  const current = await AppSettings.findOneAsync(DEFAULT_SETTINGS_ID);
  const channels = buildNormalizedChannels(current);
  const activeIds = new Set();

  for (let i = 0; i < channels.length; i += 1) {
    const channel = channels[i];
    if (!channel) continue;
    const channelId = String(channel.id || '').trim();
    if (channelId) activeIds.add(channelId);
    await ensureChannelSubscription(channel);
  }

  const subscribedIds = Array.from(activeChannelSubscriptions.keys());
  for (let i = 0; i < subscribedIds.length; i += 1) {
    const channelId = subscribedIds[i];
    if (!activeIds.has(channelId)) {
      await stopChannelSubscription(channelId);
    }
  }
}

export function startChannelPollingWorker() {
  if (channelPollingWorkerStarted) return;
  channelPollingWorkerStarted = true;
  logChannelRuntime('worker.started', { intervalMs: CHANNEL_POLL_INTERVAL_MS });
  setTimeout(() => {
    setTimeout(() => {
      reconcileChannelSubscriptions().catch((error) => {
        logChannelRuntime('subscribe.startup.failed', {
          message: error && error.message ? error.message : String(error),
        });
      });
      pollEnabledChannels().catch((error) => {
        logChannelRuntime('poll.startup.failed', {
          message: error && error.message ? error.message : String(error),
        });
      });
    }, 5000);
    setInterval(() => {
      reconcileChannelSubscriptions().catch((error) => {
        logChannelRuntime('subscribe.interval.failed', {
          message: error && error.message ? error.message : String(error),
        });
      });
      pollEnabledChannels().catch((error) => {
        logChannelRuntime('poll.interval.failed', {
          message: error && error.message ? error.message : String(error),
        });
      });
    }, CHANNEL_POLL_INTERVAL_MS);
  });
}

export function isChannelPollingWorkerStarted() {
  return channelPollingWorkerStarted;
}

registerAIQueueSheetRuntimeHooks({
    loadChannelPayloads: async () => getActiveChannelPayloadMap(),
  });

  registerStartupHook(() => {
    migrateLegacyChannelEvents().catch((error) => {
      logChannelRuntime('legacy.events.migration_failed', {
        message: error && error.message ? error.message : String(error),
      });
    });
  });

  registerMethods({
    async 'settings.upsertCommunicationChannel'(channel) {
      check(channel, {
        id: String,
        connectorId: String,
        label: String,
        enabled: Boolean,
        settings: Match.Maybe(Object),
      });

      await ensureDefaultSettings();

      const connector = getRegisteredChannelConnectorById(channel.connectorId);
      if (!connector) {
        throw new AppError(
          'channel-connector-not-found',
          'Channel connector not found',
        );
      }

      const current = await AppSettings.findOneAsync(DEFAULT_SETTINGS_ID);
      const nextChannels = Array.isArray(
        current && current.communicationChannels,
      )
        ? [...current.communicationChannels]
        : [];
      const existingChannel =
        nextChannels.find((item) => item && item.id === channel.id) || null;

      const normalizedChannel = {
        id: String(channel.id || ''),
        connectorId: connector.id,
        type: connector.type,
        label: String(channel.label || connector.name).trim(),
        enabled: channel.enabled !== false,
        status:
          existingChannel && existingChannel.status
            ? existingChannel.status
            : 'saved',
        settings: normalizeChannelSettings(connector, channel.settings),
        lastTestMessage: String(
          (existingChannel && existingChannel.lastTestMessage) || '',
        ),
        lastTestAt:
          existingChannel && existingChannel.lastTestAt
            ? existingChannel.lastTestAt
            : null,
        lastSeenUid:
          Number(existingChannel && existingChannel.lastSeenUid) || 0,
        lastEventId: String(
          (existingChannel && existingChannel.lastEventId) || '',
        ),
        lastEventPreview:
          existingChannel &&
          existingChannel.lastEventPreview &&
          typeof existingChannel.lastEventPreview === 'object'
            ? { ...existingChannel.lastEventPreview }
            : null,
        lastEventAt:
          existingChannel && existingChannel.lastEventAt
            ? existingChannel.lastEventAt
            : null,
        lastPolledAt:
          existingChannel && existingChannel.lastPolledAt
            ? existingChannel.lastPolledAt
            : null,
        watchError: String(
          (existingChannel && existingChannel.watchError) || '',
        ),
        createdAt:
          existingChannel && existingChannel.createdAt
            ? existingChannel.createdAt
            : new Date(),
        updatedAt: new Date(),
      };

      const index = nextChannels.findIndex(
        (item) => item && item.id === normalizedChannel.id,
      );
      if (index === -1) nextChannels.push(normalizedChannel);
      else
        nextChannels[index] = { ...nextChannels[index], ...normalizedChannel };

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

    async 'channels.pollNow'() {
      logChannelRuntime('pollNow.called', { userId: this.userId || null });
      return pollEnabledChannels();
    },

    async 'settings.testCommunicationChannel'(channelId) {
      check(channelId, String);

      await ensureDefaultSettings();
      const current = await AppSettings.findOneAsync(DEFAULT_SETTINGS_ID);
      const channels = Array.isArray(current && current.communicationChannels)
        ? current.communicationChannels
        : [];
      const channel = channels.find((item) => item && item.id === channelId);
      if (!channel) {
        throw new AppError(
          'channel-not-found',
          'Communication channel not found',
        );
      }

      const connector = getRegisteredChannelConnectorById(channel.connectorId);
      if (!connector) {
        throw new AppError(
          'channel-connector-not-found',
          'Channel connector not found',
        );
      }

      const handler = getChannelHandler(connector.id);
      try {
        const result = await handler.testConnection({
          channel,
          settings: normalizeChannelSettings(connector, channel.settings),
        });

        await AppSettings.updateAsync(
          { _id: DEFAULT_SETTINGS_ID, 'communicationChannels.id': channelId },
          {
            $set: {
              'communicationChannels.$.status':
                result && result.ok ? 'connected' : 'error',
              'communicationChannels.$.lastTestAt': new Date(),
              'communicationChannels.$.lastTestMessage': String(
                (result && result.message) || '',
              ),
              updatedAt: new Date(),
            },
          },
        );

        return result;
      } catch (error) {
        const message = String(
          (error && (error.reason || error.message)) ||
            'Failed to connect to communication channel',
        ).trim();

        await AppSettings.updateAsync(
          { _id: DEFAULT_SETTINGS_ID, 'communicationChannels.id': channelId },
          {
            $set: {
              'communicationChannels.$.status': 'error',
              'communicationChannels.$.lastTestAt': new Date(),
              'communicationChannels.$.lastTestMessage': message,
              updatedAt: new Date(),
            },
          },
        );

        throw new AppError('channel-test-failed', message);
      }
    },

    async 'channels.send'(channelId, payload) {
      check(channelId, String);
      check(
        payload,
        Match.Where(
          (value) =>
            !!value && typeof value === 'object' && !Array.isArray(value),
        ),
      );

      await ensureDefaultSettings();
      const current = await AppSettings.findOneAsync(DEFAULT_SETTINGS_ID);
      const channels = Array.isArray(current && current.communicationChannels)
        ? current.communicationChannels
        : [];
      const channel = findConfiguredChannelById(channels, channelId);
      if (!channel) {
        throw new AppError(
          'channel-not-found',
          'Communication channel not found',
        );
      }

      const connector = getRegisteredChannelConnectorById(channel.connectorId);
      if (!connector) {
        throw new AppError(
          'channel-connector-not-found',
          'Channel connector not found',
        );
      }

      const handler = getChannelHandler(channel.connectorId);
      if (typeof handler.send !== 'function') {
        throw new AppError(
          'channel-send-not-supported',
          `Channel ${String(channel.connectorId || '')} does not support send actions`,
        );
      }
      return handler.send({
        channel,
        settings: normalizeChannelSettings(connector, channel.settings),
        payload: {
          ...payload,
          to: Array.isArray(payload.to) ? payload.to : [],
          subj: String(payload.subj || ''),
          body: String(payload.body || ''),
          attachments: Array.isArray(payload.attachments)
            ? payload.attachments
            : [],
        },
      });
    },

    async 'channels.sendByLabel'(label, payload) {
      check(label, String);
      check(
        payload,
        Match.Where(
          (value) =>
            !!value && typeof value === 'object' && !Array.isArray(value),
        ),
      );

      await ensureDefaultSettings();
      const current = await AppSettings.findOneAsync(DEFAULT_SETTINGS_ID);
      const channels = Array.isArray(current && current.communicationChannels)
        ? current.communicationChannels
        : [];
      const channel = findConfiguredChannelByLabel(channels, label);
      if (!channel) {
        throw new AppError(
          'channel-not-found',
          `Communication channel "/${normalizeChannelLabel(label)}" not found`,
        );
      }

      const connector = getRegisteredChannelConnectorById(channel.connectorId);
      if (!connector) {
        throw new AppError(
          'channel-connector-not-found',
          'Channel connector not found',
        );
      }

      const handler = getChannelHandler(channel.connectorId);
      if (typeof handler.send !== 'function') {
        throw new AppError(
          'channel-send-not-supported',
          `Channel ${String(channel.connectorId || '')} does not support send actions`,
        );
      }
      return handler.send({
        channel,
        settings: normalizeChannelSettings(connector, channel.settings),
        payload: {
          ...payload,
          to: Array.isArray(payload.to) ? payload.to : [],
          subj: String(payload.subj || ''),
          body: String(payload.body || ''),
          attachments: Array.isArray(payload.attachments)
            ? payload.attachments
            : [],
        },
      });
    },

    async 'channels.search'(channelId, query, options) {
      check(channelId, String);
      check(query, Match.Maybe(String));
      check(options, Match.Maybe(Object));

      await ensureDefaultSettings();
      const current = await AppSettings.findOneAsync(DEFAULT_SETTINGS_ID);
      const channels = Array.isArray(current && current.communicationChannels)
        ? current.communicationChannels
        : [];
      const channel = findConfiguredChannelById(channels, channelId);
      if (!channel) {
        throw new AppError(
          'channel-not-found',
          'Communication channel not found',
        );
      }
      const connector = getRegisteredChannelConnectorById(channel.connectorId);
      if (!connector) {
        throw new AppError(
          'channel-connector-not-found',
          'Channel connector not found',
        );
      }
      const handler = getChannelHandler(channel.connectorId);
      if (handler && typeof handler.search === 'function') {
        const result = await handler.search({
          channel,
          settings: normalizeChannelSettings(connector, channel.settings),
          query: String(query || ''),
          options: normalizeSearchOptions(options),
        });
        if (result && result.source && result.source !== 'none') {
          return result;
        }
      }
      if (connector.supportsReceive !== false) {
        return searchChannelEventHistory(channel, query, options);
      }
      return {
        ok: true,
        query: String(query || ''),
        source: 'none',
        total: 0,
        items: [],
      };
    },

    async 'channels.searchByLabel'(label, query, options) {
      check(label, String);
      check(query, Match.Maybe(String));
      check(options, Match.Maybe(Object));

      await ensureDefaultSettings();
      const current = await AppSettings.findOneAsync(DEFAULT_SETTINGS_ID);
      const channels = Array.isArray(current && current.communicationChannels)
        ? current.communicationChannels
        : [];
      const channel = findConfiguredChannelByLabel(channels, label);
      if (!channel) {
        throw new AppError(
          'channel-not-found',
          `Communication channel "/${normalizeChannelLabel(label)}" not found`,
        );
      }
      const connector = getRegisteredChannelConnectorById(channel.connectorId);
      if (!connector) {
        throw new AppError(
          'channel-connector-not-found',
          'Channel connector not found',
        );
      }
      const handler = getChannelHandler(channel.connectorId);
      if (handler && typeof handler.search === 'function') {
        const result = await handler.search({
          channel,
          settings: normalizeChannelSettings(connector, channel.settings),
          query: String(query || ''),
          options: normalizeSearchOptions(options),
        });
        if (result && result.source && result.source !== 'none') {
          return result;
        }
      }
      if (connector.supportsReceive !== false) {
        return searchChannelEventHistory(channel, query, options);
      }
      return {
        ok: true,
        query: String(query || ''),
        source: 'none',
        total: 0,
        items: [],
      };
    },
  });
