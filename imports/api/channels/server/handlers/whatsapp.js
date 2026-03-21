import fs from 'node:fs/promises';
import path from 'node:path';
import { defineChannelHandler } from '../handler-definition.js';

const SESSION_ROOT = path.join(process.cwd(), '.channel-runtime', 'whatsapp');
const CONNECT_TIMEOUT_MS = 30000;

const socketCache = new Map();

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

function logWhatsApp(event, payload) {
  console.log(`[channels.whatsapp] ${event}`, payload);
}

function normalizePhoneDigits(value) {
  return String(value == null ? '' : value).replace(/[^\d]/g, '');
}

function normalizeSessionId(value) {
  return String(value || 'default')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'default';
}

function normalizeRecipientJid(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  if (/@(s\.whatsapp\.net|g\.us)$/i.test(raw)) return raw;
  const digits = normalizePhoneDigits(raw);
  return digits ? `${digits}@s.whatsapp.net` : raw;
}

function validateWhatsAppSettings(settings) {
  const source = settings && typeof settings === 'object' ? settings : {};
  return {
    sessionId: normalizeSessionId(source.sessionId),
    pairingPhoneNumber: normalizePhoneDigits(source.pairingPhoneNumber),
    defaultJid: normalizeRecipientJid(source.defaultJid),
    browserName: String(source.browserName || 'MetaCells').trim() || 'MetaCells',
  };
}

async function ensureSessionDir(sessionId) {
  const dir = path.join(SESSION_ROOT, normalizeSessionId(sessionId));
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function loadBaileysModule() {
  const mod = await import('@whiskeysockets/baileys');
  return mod.default && typeof mod.default === 'object'
    ? { ...mod.default, ...mod }
    : mod;
}

async function createSocketBundle(settings) {
  const validated = validateWhatsAppSettings(settings);
  const sessionDir = await ensureSessionDir(validated.sessionId);
  const baileys = await loadBaileysModule();
  const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
  } = baileys;
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const versionInfo =
    typeof fetchLatestBaileysVersion === 'function'
      ? await fetchLatestBaileysVersion()
      : { version: undefined };
  const version = Array.isArray(versionInfo && versionInfo.version)
    ? versionInfo.version
    : undefined;
  const socket = makeWASocket({
    auth: state,
    browser: [validated.browserName, 'Desktop', '1.0'],
    markOnlineOnConnect: false,
    syncFullHistory: false,
    version,
    printQRInTerminal: false,
  });

  socket.ev.on('creds.update', saveCreds);

  const bundle = {
    key: validated.sessionId,
    settings: validated,
    socket,
    DisconnectReason,
    readyPromise: null,
  };
  socketCache.set(validated.sessionId, bundle);
  return bundle;
}

async function getSocketBundle(settings) {
  const validated = validateWhatsAppSettings(settings);
  const existing = socketCache.get(validated.sessionId);
  if (existing) {
    existing.settings = validated;
    return existing;
  }
  return createSocketBundle(validated);
}

function waitForConnection(bundle) {
  if (bundle.readyPromise) return bundle.readyPromise;
  bundle.readyPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for WhatsApp connection'));
    }, CONNECT_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeout);
      if (bundle.socket && bundle.socket.ev) {
        bundle.socket.ev.off('connection.update', handleUpdate);
      }
    };

    const handleUpdate = (update) => {
      const status = String((update && update.connection) || '');
      if (status === 'open') {
        cleanup();
        resolve(bundle.socket);
        return;
      }
      if (status === 'close') {
        const error =
          update && update.lastDisconnect && update.lastDisconnect.error;
        cleanup();
        reject(
          new Error(
            formatNestedError(error) || 'WhatsApp connection closed before ready',
          ),
        );
      }
    };

    bundle.socket.ev.on('connection.update', handleUpdate);
  }).finally(() => {
    bundle.readyPromise = null;
  });
  return bundle.readyPromise;
}

async function ensureConnectedSocket(settings) {
  const bundle = await getSocketBundle(settings);
  if (
    bundle.socket &&
    bundle.socket.user &&
    bundle.socket.ws &&
    bundle.socket.ws.readyState === 1
  ) {
    return bundle.socket;
  }
  return waitForConnection(bundle);
}

export async function testWhatsAppConnection(settings) {
  const validated = validateWhatsAppSettings(settings);
  const bundle = await getSocketBundle(validated);
  const socket = bundle.socket;

  if (socket.user && socket.ws && socket.ws.readyState === 1) {
    return {
      ok: true,
      message: `Connected WhatsApp session ${validated.sessionId} as ${String((socket.user && socket.user.id) || '').trim()}`,
    };
  }

  if (validated.pairingPhoneNumber) {
    try {
      const code = await socket.requestPairingCode(validated.pairingPhoneNumber);
      logWhatsApp('pairing.code', {
        sessionId: validated.sessionId,
        phone: validated.pairingPhoneNumber,
      });
      return {
        ok: true,
        message: `WhatsApp pairing code for ${validated.pairingPhoneNumber}: ${String(code || '').trim()}`,
      };
    } catch (error) {
      const message =
        formatNestedError(error) || 'Failed to request WhatsApp pairing code';
      logWhatsApp('test.failed', { sessionId: validated.sessionId, message });
      throw new Error(message);
    }
  }

  try {
    await ensureConnectedSocket(validated);
    return {
      ok: true,
      message: `Connected WhatsApp session ${validated.sessionId}`,
    };
  } catch (error) {
    const message =
      formatNestedError(error) ||
      'WhatsApp session is not connected. Add a pairing phone number and press Test to request a pairing code.';
    logWhatsApp('test.failed', { sessionId: validated.sessionId, message });
    throw new Error(message);
  }
}

export async function sendWhatsAppMessage(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const settings =
    source.settings && typeof source.settings === 'object'
      ? source.settings
      : {};
  const validated = validateWhatsAppSettings(settings);
  const to = normalizeRecipientJid(source.to || validated.defaultJid);
  const body = String(source.body == null ? '' : source.body).trim();
  const attachments = Array.isArray(source.attachments)
    ? source.attachments.filter((item) => item && typeof item === 'object')
    : [];

  if (!to) {
    throw new Error('WhatsApp send requires a recipient JID or defaultJid');
  }
  if (!body) {
    throw new Error('WhatsApp send requires a message body');
  }
  if (attachments.length) {
    throw new Error('WhatsApp send does not support attachments yet');
  }

  const socket = await ensureConnectedSocket(validated);
  const result = await socket.sendMessage(to, { text: body });
  return {
    ok: true,
    to,
    messageId: String((result && result.key && result.key.id) || ''),
  };
}

const WHATSAPP_HANDLER = defineChannelHandler({
  id: 'whatsapp',
  name: 'WhatsApp Web',
  summary: 'WhatsApp Web channel via Baileys for paired-session messaging.',
  docs: ['https://baileys.wiki/'],
  popularMethods: ['connect', 'requestPairingCode', 'sendMessage', 'loadMessages'],
  capabilities: {
    test: true,
    send: true,
    receive: false,
    poll: false,
    normalizeEvent: false,
    search: false,
    attachments: false,
    oauth: false,
    actions: ['test', 'pair', 'send'],
    entities: ['session', 'chat', 'message'],
  },
  testConnection: async ({ settings }) => testWhatsAppConnection(settings),
  send: async ({ settings, payload }) =>
    sendWhatsAppMessage({ ...(payload || {}), settings }),
});

export default WHATSAPP_HANDLER;
