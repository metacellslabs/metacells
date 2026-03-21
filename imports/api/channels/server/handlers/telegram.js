import { Meteor } from 'meteor/meteor';
import { Telegraf } from 'telegraf';
import { randomUUID } from 'node:crypto';
import {
  buildArtifactPath,
  createBinaryArtifact,
  createTextArtifact,
  getArtifactBinary,
} from '../../../artifacts/index.js';
import { extractFileContentWithConverter } from '../../../files/index.js';
import { defineChannelHandler } from '../handler-definition.js';

const TELEGRAM_CAPTION_MAX_CHARS = 1024;
const TELEGRAM_API_TIMEOUT_MS = 30000;
const TELEGRAM_FILE_TIMEOUT_MS = 60000;
const telegramPollingModeByToken = new Set();

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

function logTelegram(event, payload) {
  console.log(`[channels.telegram] ${event}`, payload);
}

function validateTelegramSettings(settings) {
  const token = String(settings && settings.token ? settings.token : '').trim();
  const chatId = String(
    settings && settings.chatId ? settings.chatId : '',
  ).trim();

  if (!token) {
    throw new Error('Telegram bot token is required');
  }
  if (!chatId) {
    throw new Error('Telegram chat id is required');
  }

  return { token, chatId };
}

async function callTelegramApi(token, method, body) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, TELEGRAM_API_TIMEOUT_MS);
  const response = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body || {}),
      signal: controller.signal,
    },
  ).finally(() => {
    clearTimeout(timeoutId);
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok || !payload || payload.ok !== true) {
    const description = String(
      (payload && payload.description) ||
        response.statusText ||
        'Telegram API request failed',
    ).trim();
    throw new Error(description);
  }

  return payload.result || null;
}

async function ensureTelegramPollingMode(token) {
  const cacheKey = String(token || '').trim();
  if (!cacheKey || telegramPollingModeByToken.has(cacheKey)) return;
  const webhookInfo = await callTelegramApi(token, 'getWebhookInfo', {});
  const webhookUrl = String((webhookInfo && webhookInfo.url) || '').trim();
  if (webhookUrl) {
    await callTelegramApi(token, 'deleteWebhook', {
      drop_pending_updates: false,
    });
    logTelegram('webhook.disabled', { webhookUrl });
  }
  telegramPollingModeByToken.add(cacheKey);
}

function buildTelegramParty(value) {
  const source = value && typeof value === 'object' ? value : {};
  const label = String(
    source.username ||
      [source.first_name, source.last_name].filter(Boolean).join(' ') ||
      source.title ||
      source.id ||
      '',
  ).trim();
  return label;
}

function extractTelegramAttachments(message) {
  const source = message && typeof message === 'object' ? message : {};
  const attachments = [];

  if (source.document) {
    attachments.push({
      name: String(
        (source.document && source.document.file_name) || 'document',
      ).trim(),
      type: String(
        (source.document && source.document.mime_type) ||
          'application/octet-stream',
      ).trim(),
    });
  }
  if (Array.isArray(source.photo) && source.photo.length) {
    attachments.push({
      name: 'photo.jpg',
      type: 'image/jpeg',
    });
  }
  if (source.audio) {
    attachments.push({
      name: String((source.audio && source.audio.file_name) || 'audio').trim(),
      type: String(
        (source.audio && source.audio.mime_type) || 'audio/mpeg',
      ).trim(),
    });
  }
  if (source.video) {
    attachments.push({
      name: String((source.video && source.video.file_name) || 'video').trim(),
      type: String(
        (source.video && source.video.mime_type) || 'video/mp4',
      ).trim(),
    });
  }
  if (source.voice) {
    attachments.push({
      name: 'voice.ogg',
      type: 'audio/ogg',
    });
  }
  return attachments;
}

function buildTelegramInboundAttachmentSpecs(message) {
  const source = message && typeof message === 'object' ? message : {};
  const specs = [];

  if (source.document && source.document.file_id) {
    specs.push({
      id: String(
        source.document.file_unique_id || source.document.file_id || randomUUID(),
      ),
      fileId: String(source.document.file_id || '').trim(),
      name: String(source.document.file_name || 'document').trim(),
      type: String(
        source.document.mime_type || 'application/octet-stream',
      ).trim(),
      size: Number(source.document.file_size) || 0,
      disposition: 'attachment',
    });
  }
  if (Array.isArray(source.photo) && source.photo.length) {
    const photo = source.photo[source.photo.length - 1];
    if (photo && photo.file_id) {
      specs.push({
        id: String(photo.file_unique_id || photo.file_id || randomUUID()),
        fileId: String(photo.file_id || '').trim(),
        name: 'photo.jpg',
        type: 'image/jpeg',
        size: Number(photo.file_size) || 0,
        disposition: 'inline',
      });
    }
  }
  if (source.audio && source.audio.file_id) {
    specs.push({
      id: String(source.audio.file_unique_id || source.audio.file_id || randomUUID()),
      fileId: String(source.audio.file_id || '').trim(),
      name: String(source.audio.file_name || 'audio').trim(),
      type: String(source.audio.mime_type || 'audio/mpeg').trim(),
      size: Number(source.audio.file_size) || 0,
      disposition: 'attachment',
    });
  }
  if (source.video && source.video.file_id) {
    specs.push({
      id: String(source.video.file_unique_id || source.video.file_id || randomUUID()),
      fileId: String(source.video.file_id || '').trim(),
      name: String(source.video.file_name || 'video').trim(),
      type: String(source.video.mime_type || 'video/mp4').trim(),
      size: Number(source.video.file_size) || 0,
      disposition: 'attachment',
    });
  }
  if (source.voice && source.voice.file_id) {
    specs.push({
      id: String(source.voice.file_unique_id || source.voice.file_id || randomUUID()),
      fileId: String(source.voice.file_id || '').trim(),
      name: 'voice.ogg',
      type: 'audio/ogg',
      size: Number(source.voice.file_size) || 0,
      disposition: 'attachment',
    });
  }

  return specs;
}

async function downloadTelegramFileBuffer(token, fileId) {
  const file = await callTelegramApi(token, 'getFile', {
    file_id: String(fileId || '').trim(),
  });
  const filePath = String((file && file.file_path) || '').trim();
  if (!filePath) {
    throw new Error('Telegram file path is missing');
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, TELEGRAM_FILE_TIMEOUT_MS);
  const response = await fetch(
    `https://api.telegram.org/file/bot${encodeURIComponent(token)}/${filePath}`,
    {
      signal: controller.signal,
    },
  ).finally(() => {
    clearTimeout(timeoutId);
  });
  if (!response.ok) {
    throw new Error(`Telegram file download failed with HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    filePath,
  };
}

async function materializeTelegramInboundAttachments(token, message, ownerId) {
  const specs = buildTelegramInboundAttachmentSpecs(message);
  if (!specs.length) return [];
  const attachments = [];

  for (let i = 0; i < specs.length; i += 1) {
    const spec = specs[i];
    try {
      const download = await downloadTelegramFileBuffer(token, spec.fileId);
      let extractedContent = '';
      try {
        extractedContent = await extractFileContentWithConverter({
          fileName: spec.name,
          mimeType: spec.type,
          buffer: download.buffer,
        });
      } catch (error) {
        extractedContent = '';
      }
      const owner = {
        ownerType: 'channel-event-attachment',
        ownerId: `${String(ownerId || '')}:${String(spec.id || '')}`,
      };
      const binaryArtifact = await createBinaryArtifact({
        base64Data: download.buffer.toString('base64'),
        mimeType: spec.type,
        fileName: spec.name,
        owner,
      });
      const contentArtifact = extractedContent
        ? await createTextArtifact({
            text: String(extractedContent || ''),
            mimeType: 'text/plain; charset=utf-8',
            fileName: `${String(spec.name || 'attachment')}.txt`,
            owner,
          })
        : null;
      attachments.push({
        id: spec.id,
        name: spec.name,
        type: spec.type,
        size: download.buffer.length || spec.size,
        disposition: spec.disposition,
        binaryArtifactId: String((binaryArtifact && binaryArtifact._id) || ''),
        contentArtifactId: String((contentArtifact && contentArtifact._id) || ''),
        downloadUrl: buildArtifactPath(binaryArtifact && binaryArtifact._id),
      });
    } catch (error) {
      attachments.push({
        id: spec.id,
        name: spec.name,
        type: spec.type,
        size: spec.size,
        disposition: spec.disposition,
        error: formatNestedError(error) || 'Failed to download Telegram attachment',
      });
    }
  }

  return attachments;
}

async function normalizeTelegramInboundMessage(update, configuredChatId, token) {
  const source = update && typeof update === 'object' ? update : {};
  const message =
    source.message ||
    source.edited_message ||
    source.channel_post ||
    source.edited_channel_post ||
    null;
  if (!message || typeof message !== 'object') return null;

  const chat =
    message.chat && typeof message.chat === 'object' ? message.chat : {};
  const normalizedChatId = String(configuredChatId || '').trim();
  if (normalizedChatId && String(chat.id || '') !== normalizedChatId) {
    return null;
  }

  const text = String(message.text || message.caption || '').trim();
  const fromLabel = buildTelegramParty(message.from || message.sender_chat);
  const chatLabel = buildTelegramParty(chat);
  const timestamp = Number(message.date) || 0;
  const attachments = token
    ? await materializeTelegramInboundAttachments(
        token,
        message,
        Number(source.update_id) || String(message.message_id || randomUUID()),
      )
    : extractTelegramAttachments(message);
  if (!text && !attachments.length) return null;

  return {
    uid: Number(source.update_id) || 0,
    event: 'message.new',
    messageId: String(message.message_id || '').trim(),
    threadId: String(message.message_thread_id || '').trim(),
    chatId: String(chat.id || '').trim(),
    date: timestamp ? new Date(timestamp * 1000).toISOString() : '',
    text,
    from: fromLabel ? [fromLabel] : [],
    to: chatLabel ? [chatLabel] : [],
    attachments,
    data: {
      updateId: Number(source.update_id) || 0,
      chatId: String(chat.id || '').trim(),
      chatType: String(chat.type || '').trim(),
      username: String(chat.username || '').trim(),
    },
  };
}

export async function handleTelegramEvent(eventType, payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  return {
    event: String(eventType || source.event || 'message.new').trim(),
    message: {
      event: String(source.event || eventType || 'message.new').trim(),
      sourceId: String(source.uid || source.messageId || '').trim(),
      messageId: String(source.messageId || '').trim(),
      threadId: String(source.threadId || '').trim(),
      chatId: String(source.chatId || '').trim(),
      date: String(source.date || '').trim(),
      text: String(source.text || '').trim(),
      from: Array.isArray(source.from) ? source.from.slice() : [],
      to: Array.isArray(source.to) ? source.to.slice() : [],
      attachments: Array.isArray(source.attachments) ? source.attachments : [],
      data:
        source.data && typeof source.data === 'object' ? source.data : {},
    },
  };
}

async function callTelegramMultipartApi(token, method, formData) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, TELEGRAM_FILE_TIMEOUT_MS);
  const response = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`,
    {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    },
  ).finally(() => {
    clearTimeout(timeoutId);
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok || !payload || payload.ok !== true) {
    const description = String(
      (payload && payload.description) ||
        response.statusText ||
        'Telegram API request failed',
    ).trim();
    throw new Error(description);
  }

  return payload.result || null;
}

async function sendTelegramAttachment(token, chatId, attachment, caption) {
  const source = attachment && typeof attachment === 'object' ? attachment : {};
  const type = String(source.type || '').toLowerCase();
  const binaryArtifactId = String(source.binaryArtifactId || '').trim();
  if (!binaryArtifactId) {
    throw new Error('Telegram attachment is missing binary artifact data');
  }
  const binary = await getArtifactBinary(binaryArtifactId);
  if (!binary || !binary.buffer) {
    throw new Error('Telegram attachment binary could not be loaded');
  }
  const fileName = String(
    source.name || binary.fileName || (type.indexOf('image/') === 0 ? 'image' : 'attachment'),
  ).trim();
  const mimeType = String(source.type || binary.mimeType || 'application/octet-stream').trim();
  const formData = new FormData();
  formData.set('chat_id', String(chatId || ''));
  if (caption) formData.set('caption', String(caption || ''));
  formData.set(
    type.indexOf('image/') === 0 ? 'photo' : 'document',
    new Blob([binary.buffer], { type: mimeType || 'application/octet-stream' }),
    fileName || 'attachment',
  );

  if (type.indexOf('image/') === 0) {
    return callTelegramMultipartApi(token, 'sendPhoto', formData);
  }

  return callTelegramMultipartApi(token, 'sendDocument', formData);
}

function splitTelegramCaption(body) {
  const text = String(body == null ? '' : body).trim();
  if (!text) return { caption: '', remainder: '' };
  if (text.length <= TELEGRAM_CAPTION_MAX_CHARS) {
    return { caption: text, remainder: '' };
  }

  let splitAt = text.lastIndexOf('\n', TELEGRAM_CAPTION_MAX_CHARS);
  if (splitAt < Math.floor(TELEGRAM_CAPTION_MAX_CHARS * 0.6)) {
    splitAt = text.lastIndexOf(' ', TELEGRAM_CAPTION_MAX_CHARS);
  }
  if (splitAt <= 0) splitAt = TELEGRAM_CAPTION_MAX_CHARS;

  return {
    caption: text.slice(0, splitAt).trim(),
    remainder: text.slice(splitAt).trim(),
  };
}

export async function testTelegramConnection(settings) {
  const { token, chatId } = validateTelegramSettings(settings);

  try {
    logTelegram('test.start', { chatId });
    const bot = await callTelegramApi(token, 'getMe', {});
    logTelegram('test.success', {
      chatId,
      username: String((bot && bot.username) || ''),
    });
    return {
      ok: true,
      message: `Connected Telegram bot ${String((bot && bot.username) || '').trim() || '(unnamed bot)'} for chat ${chatId}`,
    };
  } catch (error) {
    const message =
      formatNestedError(error) || 'Failed to connect to Telegram channel';
    logTelegram('test.failed', { chatId, message });
    throw new Error(message);
  }
}

export async function sendTelegramMessage(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const settings =
    source.settings && typeof source.settings === 'object'
      ? source.settings
      : {};
  const { token, chatId } = validateTelegramSettings(settings);
  const body = String(source.body == null ? '' : source.body).trim();
  const attachments = Array.isArray(source.attachments)
    ? source.attachments.filter((item) => item && typeof item === 'object')
    : [];

  if (!body && !attachments.length) {
    throw new Error('Telegram send requires a message body');
  }

  let result = null;
  if (attachments.length) {
    const split = splitTelegramCaption(body);
    for (let index = 0; index < attachments.length; index += 1) {
      const caption = index === 0 ? split.caption : '';
      result = await sendTelegramAttachment(
        token,
        chatId,
        attachments[index],
        caption,
      );
    }
    if (split.remainder) {
      result = await callTelegramApi(token, 'sendMessage', {
        chat_id: chatId,
        text: split.remainder,
      });
    } else if (!result && body) {
      result = await callTelegramApi(token, 'sendMessage', {
        chat_id: chatId,
        text: body,
      });
    }
  } else {
    result = await callTelegramApi(token, 'sendMessage', {
      chat_id: chatId,
      text: body,
    });
  }

  return {
    ok: true,
    messageId: String((result && result.message_id) || ''),
    chatId,
  };
}

export async function pollTelegramUpdates(settings, channel) {
  const { token, chatId } = validateTelegramSettings(settings);
  await ensureTelegramPollingMode(token);
  const offset = Math.max(0, Number(channel && channel.lastSeenUid) || 0) + 1;
  const updates = await callTelegramApi(token, 'getUpdates', {
    offset,
    timeout: 0,
    allowed_updates: [
      'message',
      'edited_message',
      'channel_post',
      'edited_channel_post',
    ],
  });
  const items = Array.isArray(updates) ? updates : [];
  const events = [];
  let lastSeenUid = Math.max(0, Number(channel && channel.lastSeenUid) || 0);
  const ignoredChatIds = new Set();

  for (let i = 0; i < items.length; i += 1) {
    const update = items[i];
    const updateId = Number(update && update.update_id) || 0;
    if (updateId > lastSeenUid) lastSeenUid = updateId;
    const message =
      (update && update.message) ||
      (update && update.edited_message) ||
      (update && update.channel_post) ||
      (update && update.edited_channel_post) ||
      null;
    const normalized = await normalizeTelegramInboundMessage(
      update,
      chatId,
      token,
    );
    if (!normalized) {
      const updateChatId = String(
        message &&
          message.chat &&
          typeof message.chat === 'object' &&
          message.chat.id != null
          ? message.chat.id
          : '',
      ).trim();
      if (updateChatId && updateChatId !== String(chatId || '').trim()) {
        ignoredChatIds.add(updateChatId);
      }
      continue;
    }
    events.push(normalized);
  }

  logTelegram('poll.complete', {
    chatId,
    updates: items.length,
    events: events.length,
    lastSeenUid,
    ignoredChatIds: Array.from(ignoredChatIds),
  });

  return {
    ok: true,
    events,
    lastSeenUid,
  };
}

export async function subscribeTelegramUpdates({
  settings,
  channel,
  onEvent,
  onError,
  onState,
}) {
  const { token, chatId } = validateTelegramSettings(settings);
  await ensureTelegramPollingMode(token);

  const bot = new Telegraf(token, {
    telegram: {
      apiRoot: 'https://api.telegram.org',
    },
    handlerTimeout: 30000,
  });

  const acceptUpdate = async (ctx, eventType) => {
    try {
      const normalized = await normalizeTelegramInboundMessage(
        ctx.update,
        chatId,
        token,
      );
      if (!normalized) {
        const message =
          ctx.update.message ||
          ctx.update.edited_message ||
          ctx.update.channel_post ||
          ctx.update.edited_channel_post ||
          null;
        const updateChatId = String(
          message &&
            message.chat &&
            typeof message.chat === 'object' &&
            message.chat.id != null
            ? message.chat.id
            : '',
        ).trim();
        if (updateChatId && updateChatId !== String(chatId || '').trim()) {
          logTelegram('subscribe.ignored_chat', {
            chatId,
            ignoredChatId: updateChatId,
          });
        }
        return;
      }
      logTelegram('subscribe.event', {
        chatId,
        eventType,
        updateId: Number(normalized.uid) || 0,
        messageId: String(normalized.messageId || ''),
      });
      if (typeof onEvent === 'function') {
        await onEvent({
          payload: normalized,
          nextUid: Number(normalized.uid) || 0,
        });
      }
      if (typeof onState === 'function') {
        await onState({
          lastSeenUid: Number(normalized.uid) || 0,
        });
      }
    } catch (error) {
      if (typeof onError === 'function') {
        await onError(error);
      }
    }
  };

  bot.catch(async (error) => {
    if (typeof onError === 'function') {
      await onError(error);
    }
  });

  bot.on('message', async (ctx) => acceptUpdate(ctx, 'message'));
  bot.on('edited_message', async (ctx) =>
    acceptUpdate(ctx, 'edited_message'),
  );
  bot.on('channel_post', async (ctx) => acceptUpdate(ctx, 'channel_post'));
  bot.on('edited_channel_post', async (ctx) =>
    acceptUpdate(ctx, 'edited_channel_post'),
  );

  await bot.launch({
    dropPendingUpdates: false,
  });
  logTelegram('subscribe.started', {
    chatId,
    channelId: String((channel && channel.id) || '').trim(),
  });

  return async () => {
    try {
      bot.stop('metacells-telegram-stop');
      logTelegram('subscribe.stopped', {
        chatId,
        channelId: String((channel && channel.id) || '').trim(),
      });
    } catch (error) {
      logTelegram('subscribe.stop_failed', {
        chatId,
        message: formatNestedError(error) || String(error || ''),
      });
    }
  };
}

const TELEGRAM_HANDLER = defineChannelHandler({
  id: 'telegram',
  name: 'Telegram',
  summary: 'Telegram Bot API channel for outbound messages and attachments.',
  docs: ['https://core.telegram.org/bots/api'],
  popularMethods: ['getMe', 'sendMessage', 'sendPhoto', 'sendDocument', 'getUpdates'],
  capabilities: {
    test: true,
    send: true,
    receive: true,
    subscribe: false,
    poll: true,
    normalizeEvent: true,
    search: false,
    attachments: true,
    oauth: false,
    actions: ['test', 'send'],
    entities: ['chat', 'message', 'photo', 'document'],
  },
  testConnection: async ({ settings }) => testTelegramConnection(settings),
  send: async ({ settings, payload }) =>
    sendTelegramMessage({ ...(payload || {}), settings }),
  poll: async ({ settings, channel }) => pollTelegramUpdates(settings, channel),
  normalizeEvent: async ({ eventType, payload }) =>
    handleTelegramEvent(eventType, payload),
});

export default TELEGRAM_HANDLER;
