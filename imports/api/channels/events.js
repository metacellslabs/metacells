import { defineModel } from '../../../lib/orm.js';
import { randomUUID } from 'node:crypto';

export const ChannelEvents = defineModel('channel_events');

function firstNonEmptyString(...values) {
  for (let i = 0; i < values.length; i += 1) {
    const text = String(values[i] == null ? '' : values[i]).trim();
    if (text) return text;
  }
  return '';
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeChannelEventData(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeChannelEventData(item));
  }

  if (!isPlainObject(value)) {
    return value == null ? '' : value;
  }

  const result = {};
  Object.keys(value).forEach((key) => {
    if (key === 'attachments') return;
    result[String(key)] = sanitizeChannelEventData(value[key]);
  });

  return result;
}

export function buildChannelAttachmentPath(eventId, attachmentId) {
  const safeEventId = encodeURIComponent(String(eventId || ''));
  const safeAttachmentId = encodeURIComponent(String(attachmentId || ''));
  return `/channel-events/${safeEventId}/attachments/${safeAttachmentId}`;
}

export function buildChannelEventViewPath(eventId) {
  const safeEventId = encodeURIComponent(String(eventId || ''));
  return `/channel-events/${safeEventId}`;
}

export function buildChannelNativeMessageLink(eventPayload) {
  const source =
    eventPayload && typeof eventPayload === 'object' ? eventPayload : {};
  const data = isPlainObject(source.data) ? source.data : {};

  return firstNonEmptyString(
    source.nativeUrl,
    source.messageUrl,
    source.permalink,
    source.htmlUrl,
    source.webViewLink,
    source.webContentLink,
    source.url,
    data.nativeUrl,
    data.messageUrl,
    data.permalink,
    data.htmlUrl,
    data.webViewLink,
    data.webContentLink,
    data.url,
  );
}

export function buildChannelAttachmentDescriptor(eventId, attachment, index) {
  const source = attachment && typeof attachment === 'object' ? attachment : {};
  const attachmentId = String(
    source.id || source.attachmentId || `legacy-${Number(index) || 0}`,
  ).trim();
  const downloadUrl = buildChannelAttachmentPath(eventId, attachmentId);

  return {
    id: attachmentId,
    name: String(source.name || '').trim(),
    type: String(source.type || '').trim(),
    size: Number(source.size) || 0,
    disposition: String(source.disposition || '').trim(),
    error: String(source.error || '').trim(),
    binaryArtifactId: String(source.binaryArtifactId || '').trim(),
    contentArtifactId: String(source.contentArtifactId || '').trim(),
    downloadUrl,
    previewUrl: String(source.previewUrl || downloadUrl).trim(),
  };
}

export function buildUnifiedChannelEvent(eventPayload, options = {}) {
  const source =
    eventPayload && typeof eventPayload === 'object' ? eventPayload : {};
  const eventId = firstNonEmptyString(source._id, options.eventId);

  const attachments = Array.isArray(source.attachments)
    ? source.attachments.map((item, index) =>
        buildChannelAttachmentDescriptor(eventId, item, index),
      )
    : [];

  const nativeUrl = buildChannelNativeMessageLink(source);

  const subchannel = firstNonEmptyString(
    source.subchannel,
    source.mailbox,
    source.chatId,
    source.feed,
    source.repo,
    source.folderId,
    source.pageId,
    source.instagramUserId,
  );

  const messageId = firstNonEmptyString(
    source.messageId,
    source.sourceId,
    source.externalId,
    source.uid,
  );

  const threadId = firstNonEmptyString(
    source.threadId,
    source.conversationId,
    source.chatId,
  );

  return {
    eventId,
    event: String(source.event || 'message.new').trim(),
    channel: {
      channelId: String(source.channelId || '').trim(),
      label: String(source.label || '').trim(),
      connectorId: String(source.connectorId || '').trim(),
      subchannel,
    },
    message: {
      messageId,
      threadId,
      subject: String(source.subject || '').trim(),
      summary: firstNonEmptyString(
        source.summary,
        source.title,
        source.name,
        source.data && source.data.summary,
      ),
      text: String(source.text || '').trim(),
      from: Array.isArray(source.from) ? source.from.slice() : [],
      to: Array.isArray(source.to) ? source.to.slice() : [],
      date: firstNonEmptyString(source.date, source.receivedAt),
      nativeUrl,
      viewUrl: eventId ? buildChannelEventViewPath(eventId) : '',
    },
    data: isPlainObject(source.data) ? source.data : {},
    attachments,
  };
}

export function buildChannelEventPreview(eventPayload) {
  const source = buildUnifiedChannelEvent(eventPayload, {
    eventId: eventPayload && eventPayload._id,
  });

  const attachments = Array.isArray(source.attachments)
    ? source.attachments
    : [];

  return {
    event: String(source.event || ''),
    mailbox: String((source.channel && source.channel.subchannel) || ''),
    uid: Number((source.message && source.message.messageId) || 0) || 0,
    subject: String((source.message && source.message.subject) || ''),
    from:
      source.message && Array.isArray(source.message.from)
        ? source.message.from.slice(0, 5)
        : [],
    to:
      source.message && Array.isArray(source.message.to)
        ? source.message.to.slice(0, 5)
        : [],
    date: String((source.message && source.message.date) || ''),
    textPreview: String((source.message && source.message.text) || '').slice(
      0,
      500,
    ),
    summary: String((source.message && source.message.summary) || '').slice(
      0,
      500,
    ),
    attachmentCount: attachments.length,
    attachmentNames: attachments
      .map((item) => String((item && item.name) || ''))
      .filter(Boolean)
      .slice(0, 20),
    nativeUrl: String((source.message && source.message.nativeUrl) || ''),
  };
}

export async function insertChannelEvent(eventPayload) {
  const payload =
    eventPayload && typeof eventPayload === 'object' ? eventPayload : {};
  const now = new Date();

  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments.map((item) => ({
        name: String((item && item.name) || ''),
        type: String((item && item.type) || ''),
        size: Number(item && item.size) || 0,
        disposition: String((item && item.disposition) || ''),
        error: String((item && item.error) || ''),
        binaryArtifactId: String((item && item.binaryArtifactId) || ''),
        contentArtifactId: String((item && item.contentArtifactId) || ''),
        previewUrl: String((item && item.previewUrl) || ''),
        id: String((item && (item.id || item.attachmentId)) || randomUUID()),
      }))
    : [];

  const doc = {
    channelId: String(payload.channelId || ''),
    label: String(payload.label || ''),
    connectorId: String(payload.connectorId || ''),
    event: String(payload.event || 'message.new'),
    subchannel: firstNonEmptyString(
      payload.subchannel,
      payload.mailbox,
      payload.chatId,
      payload.feed,
      payload.repo,
      payload.folderId,
      payload.pageId,
      payload.instagramUserId,
    ),
    messageId: firstNonEmptyString(
      payload.messageId,
      payload.sourceId,
      payload.externalId,
      payload.uid,
    ),
    threadId: firstNonEmptyString(
      payload.threadId,
      payload.conversationId,
      payload.chatId,
    ),
    nativeUrl: buildChannelNativeMessageLink(payload),
    mailbox: String(payload.mailbox || ''),
    uid: Number(payload.uid) || 0,
    subject: String(payload.subject || ''),
    from: Array.isArray(payload.from) ? payload.from.slice() : [],
    to: Array.isArray(payload.to) ? payload.to.slice() : [],
    date: String(payload.date || ''),
    text: String(payload.text || ''),
    data: sanitizeChannelEventData(
      isPlainObject(payload.data) ? payload.data : payload,
    ),
    attachments,
    createdAt: now,
  };

  const _id = await ChannelEvents.insertAsync(doc);

  return {
    _id,
    ...doc,
  };
}
