import imapHandler from './imap.js';
import telegramHandler from './telegram.js';
import twitterHandler from './twitter.js';
import linkedinHandler from './linkedin.js';
import redditHandler from './reddit.js';
import whatsappHandler from './whatsapp.js';
import githubHandler from './github.js';
import facebookHandler from './facebook.js';
import instagramHandler from './instagram.js';
import hackerNewsHandler from './hackernews.js';
import shellHandler from './shell.js';
import googleDriveHandler from './googledrive.js';

const CHANNEL_HANDLERS = [
  imapHandler,
  telegramHandler,
  twitterHandler,
  linkedinHandler,
  redditHandler,
  whatsappHandler,
  githubHandler,
  facebookHandler,
  instagramHandler,
  hackerNewsHandler,
  shellHandler,
  googleDriveHandler,
];

const CHANNEL_HANDLER_ALIASES = {
  gmail: 'imap-email',
};

function buildHandlerMap() {
  const map = new Map();
  CHANNEL_HANDLERS.forEach((handler) => {
    if (!handler || !handler.id) return;
    map.set(String(handler.id), handler);
  });
  Object.keys(CHANNEL_HANDLER_ALIASES).forEach((alias) => {
    const target = String(CHANNEL_HANDLER_ALIASES[alias] || '');
    if (!map.has(target)) return;
    map.set(String(alias), map.get(target));
  });
  return map;
}

const HANDLER_MAP = buildHandlerMap();

export function getRegisteredChannelHandlers() {
  return CHANNEL_HANDLERS.slice();
}

export function getRegisteredChannelHandlerById(connectorId) {
  return HANDLER_MAP.get(String(connectorId || '')) || null;
}
