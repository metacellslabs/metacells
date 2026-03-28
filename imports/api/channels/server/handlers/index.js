import claudeCodeHandler from './claude-code.js';
import deepseekHandler from './deepseek.js';
import imapHandler from './imap.js';
import telegramHandler from './telegram.js';
import twitterHandler from './twitter.js';
import linkedinHandler from './linkedin.js';
import redditHandler from './reddit.js';
import githubHandler from './github.js';
import facebookHandler from './facebook.js';
import onedriveHandler from './onedrive.js';
import sasInstituteHandler from './sas-institute.js';
import shellHandler from './shell.js';
import googleDriveHandler from './googledrive.js';
import sharePointHandler from './sharepoint.js';

const CHANNEL_HANDLERS = [
  claudeCodeHandler,
  deepseekHandler,
  imapHandler,
  telegramHandler,
  twitterHandler,
  linkedinHandler,
  redditHandler,
  githubHandler,
  facebookHandler,
  onedriveHandler,
  sasInstituteHandler,
  shellHandler,
  googleDriveHandler,
  sharePointHandler,
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
