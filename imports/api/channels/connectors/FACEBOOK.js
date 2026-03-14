import { defineChannelConnector } from './definition.js';

export default defineChannelConnector({
  id: 'facebook',
  type: 'facebook',
  name: 'Facebook',
  description:
    'Publish outbound text posts to a Facebook Page through the Graph API.',
  packageName: 'Facebook Graph API',
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
    entities: ['page', 'post'],
  },
  settingsFields: [
    {
      key: 'label',
      label: 'Channel label',
      type: 'text',
      placeholder: 'fb',
      defaultValue: 'fb',
    },
    { key: 'enabled', label: 'Enabled', type: 'checkbox', defaultValue: true },
    {
      key: 'pageAccessToken',
      label: 'Page access token',
      type: 'password',
      placeholder: 'Facebook Page access token',
      defaultValue: '',
    },
    {
      key: 'pageId',
      label: 'Page ID',
      type: 'text',
      placeholder: '1234567890',
      defaultValue: '',
    },
    {
      key: 'apiBaseUrl',
      label: 'API base URL',
      type: 'text',
      placeholder: 'https://graph.facebook.com/v23.0',
      defaultValue: 'https://graph.facebook.com/v23.0',
    },
  ],
  sendParams: ['body'],
  mentioningFormulas: [
    '/fb hello from MetaCells',
    '/fb:send:shipping update is live',
  ],
  help: [
    'Configure a Facebook Page access token and Page ID to publish text posts to a Page.',
    'This first version posts plain text through the Graph API Page feed endpoint.',
    'Media upload, comments, reactions, and inbound event polling are not included yet.',
  ],
});
