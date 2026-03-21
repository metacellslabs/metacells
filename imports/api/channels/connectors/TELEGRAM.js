import { defineChannelConnector } from './definition.js';

export default defineChannelConnector({
  id: 'telegram',
  type: 'telegram',
  name: 'Telegram',
  description:
    'Send outbound Telegram bot messages and workbook attachments, and receive inbound updates from one configured chat.',
  packageName: 'Telegram Bot API',
  supportsReceive: true,
  supportsSend: true,
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
    '/tg',
    "' /tg summarize the latest incoming event",
    '# /tg summarise each incoming event in one line',
    '/tg:send:hello from Metacells',
    '/tg:send:@policy uploaded',
  ],
  help: [
    'Use `/tg` for the raw inbound event stream, `\' /tg ...` for one AI note, and `# /tg ...` for one AI row per message.',
    'Configure a Telegram bot token and target chat id, then use `/tg:send:hello` in a cell to send once on commit.',
    'If the message references workbook attachment cells, Telegram sends the real files and uses the remaining text as the caption/message.',
    'Telegram bots can only message chats that already started the bot or explicitly allowed the bot.',
    'Inbound receive uses Telegram `getUpdates` polling and only accepts messages from the configured chat id.',
  ],
});
