import { defineChannelConnector } from './definition.js';

export default defineChannelConnector({
  id: 'twitter',
  type: 'twitter',
  name: 'Twitter / X',
  description:
    'Send outbound X posts from one configured user access token.',
  packageName: 'X API v2',
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
    oauth: true,
    actions: ['test', 'post'],
    entities: ['tweet', 'user'],
  },
  settingsFields: [
    {
      key: 'label',
      label: 'Channel label',
      type: 'text',
      placeholder: 'x',
      defaultValue: 'x',
    },
    { key: 'enabled', label: 'Enabled', type: 'checkbox', defaultValue: true },
    {
      key: 'accessToken',
      label: 'Access token',
      type: 'password',
      placeholder: 'OAuth access token with tweet.write',
      defaultValue: '',
    },
    {
      key: 'apiBaseUrl',
      label: 'API base URL',
      type: 'text',
      placeholder: 'https://api.x.com',
      defaultValue: 'https://api.x.com',
    },
  ],
  sendParams: ['body'],
  mentioningFormulas: [
    '/x:send:shipping update is live',
    '/x:send:hello from Metacells',
  ],
  help: [
    'Configure an X user access token with write access, then use `/x:send:hello` in a cell to publish a post once on commit.',
    'This first version sends text-only posts. Workbook attachments are not uploaded to X yet.',
    'The API base URL defaults to `https://api.x.com` and should usually be left unchanged.',
  ],
});
