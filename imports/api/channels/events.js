import { Mongo } from 'meteor/mongo';
import { randomUUID } from 'node:crypto';

export const ChannelEvents = new Mongo.Collection('channel_events');

export function buildChannelAttachmentPath(eventId, attachmentId) {
  const safeEventId = encodeURIComponent(String(eventId || ''));
  const safeAttachmentId = encodeURIComponent(String(attachmentId || ''));
  return `/channel-events/${safeEventId}/attachments/${safeAttachmentId}`;
}

export function buildChannelEventPreview(eventPayload) {
  const source =
    eventPayload && typeof eventPayload === 'object' ? eventPayload : {};
  const attachments = Array.isArray(source.attachments)
    ? source.attachments
    : [];
  return {
    event: String(source.event || ''),
    mailbox: String(source.mailbox || ''),
    uid: Number(source.uid) || 0,
    subject: String(source.subject || ''),
    from: Array.isArray(source.from) ? source.from.slice(0, 5) : [],
    to: Array.isArray(source.to) ? source.to.slice(0, 5) : [],
    date: String(source.date || ''),
    textPreview: String(source.text || '').slice(0, 500),
    attachmentCount: attachments.length,
    attachmentNames: attachments
      .map((item) => String((item && item.name) || ''))
      .filter(Boolean)
      .slice(0, 20),
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
        id: String((item && (item.id || item.attachmentId)) || randomUUID()),
      }))
    : [];
  const doc = {
    channelId: String(payload.channelId || ''),
    label: String(payload.label || ''),
    connectorId: String(payload.connectorId || ''),
    event: String(payload.event || 'message.new'),
    mailbox: String(payload.mailbox || ''),
    uid: Number(payload.uid) || 0,
    subject: String(payload.subject || ''),
    from: Array.isArray(payload.from) ? payload.from.slice() : [],
    to: Array.isArray(payload.to) ? payload.to.slice() : [],
    date: String(payload.date || ''),
    text: String(payload.text || ''),
    attachments,
    createdAt: now,
  };

  const _id = await ChannelEvents.insertAsync(doc);
  return {
    _id,
    ...doc,
  };
}
