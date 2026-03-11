import { extractFileContentWithConverter } from '../../../files/index.js';
import { randomUUID } from 'node:crypto';
import {
  createBinaryArtifact,
  createTextArtifact,
} from '../../../artifacts/index.js';

function formatNestedError(error) {
  if (!error) return '';
  if (Array.isArray(error.errors) && error.errors.length) {
    return error.errors
      .map((item) => formatNestedError(item))
      .filter(Boolean)
      .join('; ');
  }
  if (error.cause) {
    const causeMessage = formatNestedError(error.cause);
    if (causeMessage) return causeMessage;
  }
  return String(error.message || error.code || error || '').trim();
}

function logChannelTest(event, payload) {
  console.log(`[channels.imap] ${event}`, payload);
}

function normalizeAddressList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => String((item && (item.address || item.name)) || '').trim())
    .filter(Boolean);
}

function htmlToText(value) {
  return String(value == null ? '' : value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeMessageSource(sourceBuffer) {
  const raw = Buffer.isBuffer(sourceBuffer)
    ? sourceBuffer.toString('utf8')
    : String(sourceBuffer || '');
  if (!raw) return '';

  const separatorMatch = /\r?\n\r?\n/.exec(raw);
  const body = separatorMatch
    ? raw.slice(separatorMatch.index + separatorMatch[0].length)
    : raw;
  const normalized = body
    .replace(/=\r?\n/g, '')
    .replace(/=\s*([A-Fa-f0-9]{2})/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch (error) {
        return '';
      }
    });

  const text = /<html[\s>]/i.test(normalized)
    ? htmlToText(normalized)
    : normalized.replace(/\s+/g, ' ').trim();
  return text.slice(0, 12000);
}

function streamToBuffer(stream, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    const limit = Number(maxBytes) > 0 ? Number(maxBytes) : Infinity;

    stream.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > limit) {
        stream.destroy(new Error(`Attachment exceeds ${limit} bytes`));
        return;
      }
      chunks.push(buffer);
    });
    stream.once('error', reject);
    stream.once('end', () => resolve(Buffer.concat(chunks)));
  });
}

function collectAttachmentParts(node, result) {
  const target = Array.isArray(result) ? result : [];
  const source = node && typeof node === 'object' ? node : null;
  if (!source) return target;

  const disposition = String(source.disposition || '')
    .trim()
    .toLowerCase();
  const filename = String(
    (source.dispositionParameters && source.dispositionParameters.filename) ||
      (source.parameters && source.parameters.name) ||
      '',
  ).trim();
  const type = String(source.type || '')
    .trim()
    .toLowerCase();
  const subtype = String(source.subtype || '')
    .trim()
    .toLowerCase();
  const isAttachment =
    !!String(source.part || '').trim() &&
    (disposition === 'attachment' ||
      (disposition === 'inline' && filename) ||
      (!!filename && type !== 'multipart'));

  if (isAttachment) {
    target.push({
      part: String(source.part || '').trim(),
      filename: filename || `attachment-${target.length + 1}`,
      type:
        [type, subtype].filter(Boolean).join('/') || 'application/octet-stream',
      size: Number(source.size) || 0,
      disposition: disposition || 'attachment',
    });
  }

  if (Array.isArray(source.childNodes)) {
    source.childNodes.forEach((child) => collectAttachmentParts(child, target));
  }

  return target;
}

async function fetchMessageAttachments(client, uid, bodyStructure) {
  const parts = collectAttachmentParts(bodyStructure, []);
  if (!parts.length) return [];

  const attachments = [];
  for (let i = 0; i < parts.length; i += 1) {
    const item = parts[i];
    try {
      const download = await client.download(String(uid), item.part, {
        uid: true,
      });
      const content = await streamToBuffer(download.content, 2 * 1024 * 1024);
      const base64 = content.toString('base64');
      let extractedContent = '';
      try {
        extractedContent = await extractFileContentWithConverter({
          fileName: item.filename,
          mimeType: item.type,
          base64Data: base64,
        });
      } catch (error) {
        extractedContent = '';
      }
      const owner = {
        ownerType: 'channel-event-attachment',
        ownerId: `${String(uid)}:${String(item.part || '')}`,
      };
      const binaryArtifact = await createBinaryArtifact({
        base64Data: base64,
        mimeType: item.type,
        fileName: item.filename,
        owner,
      });
      const contentArtifact = extractedContent
        ? await createTextArtifact({
            text: String(extractedContent || ''),
            mimeType: 'text/plain; charset=utf-8',
            fileName: `${String(item.filename || 'attachment')}.txt`,
            owner,
          })
        : null;
      attachments.push({
        id: randomUUID(),
        name: item.filename,
        type: item.type,
        size: content.length || item.size,
        disposition: item.disposition,
        binaryArtifactId: String((binaryArtifact && binaryArtifact._id) || ''),
        contentArtifactId: String(
          (contentArtifact && contentArtifact._id) || '',
        ),
      });
    } catch (error) {
      attachments.push({
        id: randomUUID(),
        name: item.filename,
        type: item.type,
        size: item.size,
        disposition: item.disposition,
        error: formatNestedError(error) || 'Failed to download attachment',
      });
    }
  }

  return attachments;
}

function validateImapSettings(settings) {
  const host = String(settings.host || '').trim();
  const username = String(settings.username || '').trim();
  const password = String(settings.password || '');
  const mailbox = String(settings.mailbox || 'INBOX').trim() || 'INBOX';

  if (!host) {
    throw new Error('IMAP host is required');
  }
  if (!username) {
    throw new Error('IMAP username is required');
  }
  if (!password) {
    throw new Error('IMAP password is required');
  }

  return { host, username, password, mailbox };
}

function validateSmtpSettings(settings) {
  const host = String(settings.smtpHost || '').trim();
  const username = String(settings.smtpUsername || '').trim();
  const password = String(settings.smtpPassword || '');
  const from = String(settings.from || '').trim();

  if (!host) {
    throw new Error('SMTP host is required');
  }
  if (!username) {
    throw new Error('SMTP username is required');
  }
  if (!password) {
    throw new Error('SMTP password is required');
  }
  if (!from) {
    throw new Error('SMTP from address is required');
  }

  return { host, username, password, from };
}

export async function testImapConnection(settings) {
  const { host, username, password, mailbox } = validateImapSettings(settings);
  const smtp = validateSmtpSettings(settings);

  const { ImapFlow } = await import('imapflow');
  const nodemailer = await import('nodemailer');
  const client = new ImapFlow({
    host,
    port: Number(settings.port || 993) || 993,
    secure: settings.secure !== false,
    auth: {
      user: username,
      pass: password,
    },
    logger: false,
  });

  try {
    try {
      logChannelTest('imap.connect.start', {
        host,
        port: Number(settings.port || 993) || 993,
        secure: settings.secure !== false,
        username,
      });
      await client.connect();
      logChannelTest('imap.connect.success', {
        host,
        port: Number(settings.port || 993) || 993,
      });

      logChannelTest('imap.mailbox.open.start', {
        host,
        mailbox,
      });
      await client.mailboxOpen(mailbox);
      logChannelTest('imap.mailbox.open.success', {
        host,
        mailbox,
      });

      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: Number(settings.smtpPort || 465) || 465,
        secure: settings.smtpSecure !== false,
        auth: {
          user: smtp.username,
          pass: smtp.password,
        },
      });
      logChannelTest('smtp.verify.start', {
        host: smtp.host,
        port: Number(settings.smtpPort || 465) || 465,
        secure: settings.smtpSecure !== false,
        username: smtp.username,
        from: smtp.from,
      });
      await transporter.verify();
      logChannelTest('smtp.verify.success', {
        host: smtp.host,
        port: Number(settings.smtpPort || 465) || 465,
      });
    } catch (error) {
      const message =
        formatNestedError(error) || 'Failed to connect to email channel';
      logChannelTest('test.failed', {
        message,
        imap: {
          host,
          port: Number(settings.port || 993) || 993,
          secure: settings.secure !== false,
          mailbox,
          username,
        },
        smtp: {
          host: smtp.host,
          port: Number(settings.smtpPort || 465) || 465,
          secure: settings.smtpSecure !== false,
          username: smtp.username,
          from: smtp.from,
        },
      });
      throw new Error(message);
    }
    logChannelTest('test.success', {
      imapHost: host,
      mailbox,
      smtpHost: smtp.host,
    });
    return {
      ok: true,
      message: `Connected to IMAP ${host}/${mailbox} and SMTP ${String(settings.smtpHost || '').trim()}`,
    };
  } finally {
    try {
      await client.logout();
    } catch (error) {}
  }
}

export async function sendImapMessage(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const settings =
    source.settings && typeof source.settings === 'object'
      ? source.settings
      : {};
  const smtp = validateSmtpSettings(settings);
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: Number(settings.smtpPort || 465) || 465,
    secure: settings.smtpSecure !== false,
    auth: {
      user: smtp.username,
      pass: smtp.password,
    },
  });

  const to = Array.isArray(source.to) ? source.to.filter(Boolean) : [];
  if (!to.length) {
    throw new Error('Email send requires at least one recipient');
  }

  const attachments = Array.isArray(source.attachments)
    ? source.attachments
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
          filename: String(item.name || 'attachment'),
          content: String(item.content || ''),
          contentType: String(item.type || 'text/plain'),
        }))
    : [];

  const info = await transporter.sendMail({
    from: smtp.from,
    to,
    subject: String(source.subj || ''),
    text: String(source.body || ''),
    attachments,
  });

  return {
    ok: true,
    messageId: String((info && info.messageId) || ''),
    accepted: Array.isArray(info && info.accepted) ? info.accepted : [],
  };
}

export async function handleImapEvent(event, message) {
  return {
    event: String(event || ''),
    message: message && typeof message === 'object' ? message : {},
  };
}

export async function pollImapMessages(settings, channel) {
  const { host, username, password, mailbox } = validateImapSettings(settings);
  const { ImapFlow } = await import('imapflow');
  const client = new ImapFlow({
    host,
    port: Number(settings.port || 993) || 993,
    secure: settings.secure !== false,
    auth: {
      user: username,
      pass: password,
    },
    logger: false,
  });

  const lastSeenUid = Number(channel && channel.lastSeenUid) || 0;
  const events = [];

  try {
    logChannelTest('poll.start', {
      channelId: String((channel && channel.id) || ''),
      label: String((channel && channel.label) || ''),
      host,
      mailbox,
      lastSeenUid,
    });

    await client.connect();
    const lock = await client.mailboxOpen(mailbox);
    const nextUid = Number(lock && lock.uidNext) || 0;
    const rangeStart = Math.max(1, lastSeenUid + 1);
    logChannelTest('poll.mailbox.opened', {
      mailbox,
      exists: Number(lock && lock.exists) || 0,
      uidNext: nextUid,
      rangeStart,
    });

    if (!lastSeenUid && nextUid > 1) {
      const baselineUid = Math.max(0, nextUid - 1);
      logChannelTest('poll.baseline_set', {
        mailbox,
        baselineUid,
        reason: 'no-lastSeenUid',
      });
      return {
        ok: true,
        lastSeenUid: baselineUid,
        events,
      };
    }

    if (nextUid && rangeStart >= nextUid) {
      logChannelTest('poll.no_new_mail', {
        mailbox,
        lastSeenUid,
        uidNext: nextUid,
      });
      return {
        ok: true,
        lastSeenUid,
        events,
      };
    }

    let uids = [];
    try {
      const searchResult = await client.search(
        { uid: `${rangeStart}:*` },
        { uid: true },
      );
      uids = Array.isArray(searchResult)
        ? searchResult.map((value) => Number(value) || 0).filter(Boolean)
        : [];
      logChannelTest('poll.search.result', {
        mailbox,
        range: `${rangeStart}:*`,
        count: uids.length,
        uids,
      });
    } catch (error) {
      logChannelTest('poll.search_failed', {
        message: formatNestedError(error),
        mailbox,
        rangeStart,
      });
      throw error;
    }

    uids.sort((left, right) => left - right);

    for (let i = 0; i < uids.length; i += 1) {
      const uid = uids[i];
      const message = await client.fetchOne(
        String(uid),
        {
          uid: true,
          envelope: true,
          internalDate: true,
          bodyStructure: true,
          source: { start: 0, maxLength: 128000 },
        },
        { uid: true },
      );
      if (!message) continue;

      const attachments = await fetchMessageAttachments(
        client,
        uid,
        message.bodyStructure,
      );

      const payload = {
        channelId: String((channel && channel.id) || ''),
        label: String((channel && channel.label) || ''),
        connectorId: String((channel && channel.connectorId) || 'imap-email'),
        event: 'message.new',
        mailbox,
        uid: Number(message.uid || uid) || uid,
        subject: String(
          (message.envelope && message.envelope.subject) || '',
        ).trim(),
        from: normalizeAddressList(message.envelope && message.envelope.from),
        to: normalizeAddressList(message.envelope && message.envelope.to),
        date:
          message.internalDate instanceof Date
            ? message.internalDate.toISOString()
            : '',
        text: decodeMessageSource(message.source),
        attachments,
      };
      events.push(payload);
      logChannelTest('poll.event', {
        mailbox,
        uid: payload.uid,
        subject: payload.subject,
        from: payload.from,
        date: payload.date,
        textPreview: String(payload.text || '').slice(0, 240),
        attachments: attachments.map((item) => ({
          name: item.name,
          type: item.type,
          size: item.size,
          hasDownloadUrl: !!item.downloadUrl,
          hasContent: !!item.content,
          error: item.error || '',
        })),
      });
    }

    logChannelTest('poll.success', {
      mailbox,
      count: events.length,
      lastSeenUid: uids.length ? uids[uids.length - 1] : lastSeenUid,
      subjects: events.map((event) => String(event.subject || '')).slice(0, 10),
    });

    return {
      ok: true,
      lastSeenUid: uids.length ? uids[uids.length - 1] : lastSeenUid,
      events,
    };
  } finally {
    try {
      await client.logout();
    } catch (error) {}
  }
}
