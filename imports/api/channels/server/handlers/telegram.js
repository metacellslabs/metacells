import { Meteor } from '../../../../../lib/meteor-compat.js';
import { getArtifactBinary } from '../../../artifacts/index.js';
import { defineChannelHandler } from '../handler-definition.js';

const TELEGRAM_CAPTION_MAX_CHARS = 1024;

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
  const response = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body || {}),
    },
  );

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

async function callTelegramMultipartApi(token, method, formData) {
  const response = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`,
    {
      method: 'POST',
      body: formData,
    },
  );

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

const TELEGRAM_HANDLER = defineChannelHandler({
  id: 'telegram',
  name: 'Telegram',
  summary: 'Telegram Bot API channel for outbound messages and attachments.',
  docs: ['https://core.telegram.org/bots/api'],
  popularMethods: ['getMe', 'sendMessage', 'sendPhoto', 'sendDocument', 'getUpdates'],
  capabilities: {
    test: true,
    send: true,
    receive: false,
    poll: false,
    normalizeEvent: false,
    search: false,
    attachments: true,
    oauth: false,
    actions: ['test', 'send'],
    entities: ['chat', 'message', 'photo', 'document'],
  },
  testConnection: async ({ settings }) => testTelegramConnection(settings),
  send: async ({ settings, payload }) =>
    sendTelegramMessage({ ...(payload || {}), settings }),
});

export default TELEGRAM_HANDLER;
