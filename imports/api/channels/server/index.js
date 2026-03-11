import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
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
import { insertChannelEvent, buildChannelEventPreview } from '../events.js';
import {
  testImapConnection,
  sendImapMessage,
  handleImapEvent,
  pollImapMessages,
} from './handlers/imap.js';

const activeChannelPolls = new Set();
let channelPollingWorkerStarted = false;

function logChannelRuntime(event, payload) {
  console.log(`[channels] ${event}`, payload);
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

function getChannelHandler(connectorId) {
  if (connectorId === 'imap-email') {
    return {
      testConnection: testImapConnection,
      send: sendImapMessage,
      eventHandler: handleImapEvent,
      poll: pollImapMessages,
    };
  }
  throw new Meteor.Error(
    'channel-connector-not-supported',
    `Unsupported channel connector: ${connectorId}`,
  );
}

function buildNormalizedChannels(current) {
  return Array.isArray(current && current.communicationChannels)
    ? [...current.communicationChannels]
    : [];
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
  const handled = await handler.eventHandler(payload && payload.event, payload);
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
    const handler = getChannelHandler(connector.id);
    if (typeof handler.poll !== 'function') {
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

    const result = await handler.poll(
      normalizeChannelSettings(connector, channel.settings),
      channel,
    );

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
  return summary;
}

export function startChannelPollingWorker() {
  if (!Meteor.isServer || channelPollingWorkerStarted) return;
  channelPollingWorkerStarted = true;
  logChannelRuntime('worker.started', { intervalMs: CHANNEL_POLL_INTERVAL_MS });
  Meteor.startup(() => {
    Meteor.setTimeout(() => {
      pollEnabledChannels().catch((error) => {
        logChannelRuntime('poll.startup.failed', {
          message: error && error.message ? error.message : String(error),
        });
      });
    }, 5000);
    Meteor.setInterval(() => {
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

if (Meteor.isServer) {
  registerAIQueueSheetRuntimeHooks({
    loadChannelPayloads: async () => getActiveChannelPayloadMap(),
  });

  Meteor.startup(() => {
    migrateLegacyChannelEvents().catch((error) => {
      logChannelRuntime('legacy.events.migration_failed', {
        message: error && error.message ? error.message : String(error),
      });
    });
  });

  Meteor.methods({
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
        throw new Meteor.Error(
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
        throw new Meteor.Error(
          'channel-not-found',
          'Communication channel not found',
        );
      }

      const connector = getRegisteredChannelConnectorById(channel.connectorId);
      if (!connector) {
        throw new Meteor.Error(
          'channel-connector-not-found',
          'Channel connector not found',
        );
      }

      const handler = getChannelHandler(connector.id);
      try {
        const result = await handler.testConnection(
          normalizeChannelSettings(connector, channel.settings),
        );

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

        throw new Meteor.Error('channel-test-failed', message);
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
      const channel = channels.find((item) => item && item.id === channelId);
      if (!channel) {
        throw new Meteor.Error(
          'channel-not-found',
          'Communication channel not found',
        );
      }

      const handler = getChannelHandler(channel.connectorId);
      return handler.send({
        settings: channel.settings || {},
        to: Array.isArray(payload.to) ? payload.to : [],
        subj: String(payload.subj || ''),
        body: String(payload.body || ''),
        attachments: Array.isArray(payload.attachments)
          ? payload.attachments
          : [],
      });
    },
  });
}
