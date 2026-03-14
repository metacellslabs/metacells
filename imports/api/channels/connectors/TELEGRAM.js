import { defineChannelConnector } from './definition.js';

export default defineChannelConnector({
  id: 'telegram',
  type: 'telegram',
  name: 'Telegram',
  description:
    'Send outbound Telegram bot messages and workbook attachments to one configured chat.',
  packageName: 'Telegram Bot API',
  supportsReceive: false,
  supportsSend: true,
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
  settingsFields: [
    {
      key: 'label',
      label: 'Channel label',
      type: 'text',
      placeholder: 'tg',
      defaultValue: 'tg',
    },
    { key: 'enabled', label: 'Enabled', type: 'checkbox', defaultValue: true },
    {
      key: 'token',
      label: 'Bot token',
      type: 'password',
      placeholder: '123456:ABCDEF...',
      defaultValue: '',
    },
    {
      key: 'chatId',
      label: 'Chat ID',
      type: 'text',
      placeholder: '123456789',
      defaultValue: '',
    },
  ],
  sendParams: ['body'],
  mentioningFormulas: [
    '/tg hello from Metacells',
    '/tg:send:hello from Metacells',
    '/tg @policy uploaded',
  ],
  help: [
    'Configure a Telegram bot token and target chat id, then use `/tg hello` or `/tg:send:hello` in a cell to send once on commit.',
    'If the message references workbook attachment cells, Telegram sends the real files and uses the remaining text as the caption/message.',
    'Telegram bots can only message chats that already started the bot or explicitly allowed the bot.',
  ],
});
