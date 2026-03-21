import {
  AppSettings,
  DEFAULT_SETTINGS_ID,
  ensureDefaultSettings,
} from '../settings/index.js';
import {
  buildChannelAttachmentPath,
  buildUnifiedChannelEvent,
  ChannelEvents,
} from './events.js';
import { normalizeChannelLabel } from './mentioning.js';
import { getArtifactText } from '../artifacts/index.js';

async function buildChannelPayloadMapFromChannelsAndEvents(
  channels,
  eventDocsById,
) {
  const map = {};
  const source = Array.isArray(channels) ? channels : [];
  for (let i = 0; i < source.length; i += 1) {
    const channel = source[i];
    if (!channel || typeof channel !== 'object') continue;
    const label = normalizeChannelLabel(channel.label);
    const eventId = String(channel.lastEventId || '');
    const eventDoc = eventId ? eventDocsById[eventId] : null;
    if (!label || !eventDoc || typeof eventDoc !== 'object') continue;
    const attachments = Array.isArray(eventDoc.attachments)
      ? await Promise.all(
          eventDoc.attachments.map(async (item, index) => {
            const attachmentId = String(
              item && (item.id || item.attachmentId)
                ? item.id || item.attachmentId
                : `legacy-${index}`,
            );
            const content =
              item && item.contentArtifactId
                ? await getArtifactText(String(item.contentArtifactId || ''))
                : String((item && item.content) || '');
            return {
              ...(item && typeof item === 'object' ? item : {}),
              id: attachmentId,
              downloadUrl: buildChannelAttachmentPath(
                eventDoc._id || eventId,
                attachmentId,
              ),
              content: content,
            };
          }),
        )
      : [];
    const unified = buildUnifiedChannelEvent(
      {
        ...eventDoc,
        attachments,
      },
      { eventId: String(eventDoc._id || eventId) },
    );
    map[label] = {
      ...eventDoc,
      ...unified,
      attachments,
      eventId: String(eventDoc._id || eventId),
      label: String(channel.label || ''),
      channelId: String(channel.id || ''),
      connectorId: String(channel.connectorId || channel.type || ''),
      nativeUrl: String(
        (unified.message && unified.message.nativeUrl) || eventDoc.nativeUrl || '',
      ),
      viewUrl: String(
        (unified.message && unified.message.viewUrl) || '',
      ),
      messageId: String(
        (unified.message && unified.message.messageId) || eventDoc.messageId || '',
      ),
      threadId: String(
        (unified.message && unified.message.threadId) || eventDoc.threadId || '',
      ),
      subchannel: String(
        (unified.channel && unified.channel.subchannel) || eventDoc.subchannel || '',
      ),
    };
  }
  return map;
}

export async function getActiveChannelPayloadMap() {
  await ensureDefaultSettings();
  const current = await AppSettings.findOneAsync(DEFAULT_SETTINGS_ID);
  const channels = Array.isArray(current && current.communicationChannels)
    ? current.communicationChannels
    : [];
  const eventIds = channels
    .map((channel) => String((channel && channel.lastEventId) || ''))
    .filter(Boolean);
  const eventDocsById = {};
  if (eventIds.length) {
    const docs = await ChannelEvents.find({
      _id: { $in: eventIds },
    }).fetchAsync();
    docs.forEach((doc) => {
      if (!doc || !doc._id) return;
      eventDocsById[String(doc._id)] = doc;
    });
  }
  return buildChannelPayloadMapFromChannelsAndEvents(channels, eventDocsById);
}
