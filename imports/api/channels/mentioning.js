export const CHANNEL_POLL_INTERVAL_MS = 30000;
const MAX_ATTACHMENT_CONTENT_CHARS = 12000;

function normalizeWhitespace(value) {
  return String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeChannelLabel(label) {
  return normalizeWhitespace(label).toLowerCase();
}

export function extractChannelMentionLabels(text) {
  const source = String(text == null ? '' : text);
  if (!source) return [];

  const labels = [];
  const seen = new Set();
  const pattern = /(^|[^A-Za-z0-9_:/])\/([A-Za-z][A-Za-z0-9_-]*)\b/g;
  let match;

  while ((match = pattern.exec(source))) {
    const label = normalizeChannelLabel(match[2]);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }

  return labels;
}

export function formatChannelEventForPrompt(payload) {
  const source = payload && typeof payload === 'object' ? payload : null;
  if (!source) return '';

  const lines = [];
  const event = normalizeWhitespace(
    source.event || source.type || 'message.new',
  );
  const channelLabel = normalizeWhitespace(source.label || '');
  const mailbox = normalizeWhitespace(source.mailbox || '');
  const subject = normalizeWhitespace(source.subject || '');
  const from = Array.isArray(source.from)
    ? source.from.map(normalizeWhitespace).filter(Boolean)
    : [];
  const to = Array.isArray(source.to)
    ? source.to.map(normalizeWhitespace).filter(Boolean)
    : [];
  const date = normalizeWhitespace(source.date || source.receivedAt || '');
  const text = String(source.text == null ? '' : source.text).trim();
  const attachments = Array.isArray(source.attachments)
    ? source.attachments
        .map((item) => ({
          name: normalizeWhitespace(item && item.name),
          type: normalizeWhitespace(item && item.type),
          size: Number(item && item.size) || 0,
          downloadUrl: String((item && item.downloadUrl) || '').trim(),
          content: String((item && item.content) || '').trim(),
        }))
        .filter(
          (item) => item.name || item.type || item.downloadUrl || item.content,
        )
    : [];

  if (event) lines.push(`Event: ${event}`);
  if (channelLabel) lines.push(`Channel: ${channelLabel}`);
  if (mailbox) lines.push(`Mailbox: ${mailbox}`);
  if (subject) lines.push(`Subject: ${subject}`);
  if (from.length) lines.push(`From: ${from.join(', ')}`);
  if (to.length) lines.push(`To: ${to.join(', ')}`);
  if (date) lines.push(`Date: ${date}`);
  if (attachments.length) {
    lines.push('Attachments:');
    attachments.forEach((item) => {
      const title =
        [item.name, item.type ? `(${item.type})` : '']
          .filter(Boolean)
          .join(' ')
          .trim() || 'Attachment';
      lines.push(`- Name: ${title}`);
      if (item.size > 0) lines.push(`  Size: ${item.size} bytes`);
      if (item.downloadUrl)
        lines.push(
          `  Link: [${item.name || 'attachment'}](${item.downloadUrl})`,
        );
      if (item.content) {
        lines.push('  Content:');
        lines.push(String(item.content).slice(0, MAX_ATTACHMENT_CONTENT_CHARS));
      }
    });
  }
  if (text) {
    lines.push('Message:');
    lines.push(text);
  }

  return lines.join('\n').trim();
}

export function buildChannelAttachmentLinkSystemPrompt(payload) {
  const source = payload && typeof payload === 'object' ? payload : null;
  const attachments = Array.isArray(source && source.attachments)
    ? source.attachments.filter((item) => item && item.downloadUrl && item.name)
    : [];
  if (!attachments.length) return '';

  return [
    'If you reference any provided channel attachments in your answer, preserve their markdown links exactly.',
    'Use standard markdown links in the form [attachment name](provided-url).',
    'Do not rewrite, shorten, or invent attachment URLs.',
  ].join(' ');
}

export function getChannelAttachmentLinkEntries(payload) {
  const source = payload && typeof payload === 'object' ? payload : null;
  return Array.isArray(source && source.attachments)
    ? source.attachments
        .map((item) => ({
          name: normalizeWhitespace(item && item.name) || 'attachment',
          url: String((item && item.downloadUrl) || '').trim(),
        }))
        .filter((item) => item.url)
    : [];
}

export function buildAttachmentLinksMarkdown(entries) {
  const source = Array.isArray(entries) ? entries : [];
  const lines = source
    .filter((item) => item && item.url)
    .map(
      (item) =>
        `- [${String(item.name || 'attachment')}](${String(item.url || '')})`,
    );
  if (!lines.length) return '';
  return ['Attachments:', ...lines].join('\n');
}
