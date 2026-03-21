import { defineChannelConnector } from './definition.js';

export default defineChannelConnector({
  id: 'whatsapp',
  type: 'whatsapp',
  name: 'WhatsApp Web',
  description:
    'Send outbound WhatsApp messages through a Baileys Web session.',
  packageName: '@whiskeysockets/baileys',
  supportsReceive: false,
  supportsSend: true,
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
  settingsFields: [
    {
      key: 'label',
      label: 'Channel label',
      type: 'text',
      placeholder: 'wa',
      defaultValue: 'wa',
    },
    { key: 'enabled', label: 'Enabled', type: 'checkbox', defaultValue: true },
    {
      key: 'sessionId',
      label: 'Session ID',
      type: 'text',
      placeholder: 'default',
      defaultValue: 'default',
    },
    {
      key: 'pairingPhoneNumber',
      label: 'Pairing phone number',
      type: 'text',
      placeholder: '15551234567',
      defaultValue: '',
    },
    {
      key: 'defaultJid',
      label: 'Default recipient JID',
      type: 'text',
      placeholder: '15551234567@s.whatsapp.net',
      defaultValue: '',
    },
    {
      key: 'browserName',
      label: 'Browser name',
      type: 'text',
      placeholder: 'MetaCells',
      defaultValue: 'MetaCells',
    },
  ],
  sendParams: ['to', 'body'],
  mentioningFormulas: [
    '/wa:send:{"to":"15551234567@s.whatsapp.net","body":"hello from MetaCells"}',
    '/wa:send:{"body":"this uses the defaultJid from channel settings"}',
  ],
  help: [
    'This connector uses `@whiskeysockets/baileys` and a persisted WhatsApp Web multi-device session.',
    'Press `Test` to check the session. If the session is not paired yet and `Pairing phone number` is set, MetaCells will request a pairing code and show it in the test message.',
    'Use `/wa:send:{...}` to send a text message. Set `defaultJid` in channel settings if you want formulas to omit the `to` field.',
    'This first version sends text messages only. Incoming message receive and attachment/media send are not included yet.',
  ],
});
