import { defineChannelConnector } from './definition.js';

export default defineChannelConnector({
  id: 'instagram',
  type: 'instagram',
  name: 'Instagram',
  description:
    'Publish outbound photo posts to an Instagram professional account through the Graph API.',
  packageName: 'Instagram Graph API',
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
    actions: ['test', 'publish'],
    entities: ['account', 'media', 'container'],
  },
  settingsFields: [
    {
      key: 'label',
      label: 'Channel label',
      type: 'text',
      placeholder: 'ig',
      defaultValue: 'ig',
    },
    { key: 'enabled', label: 'Enabled', type: 'checkbox', defaultValue: true },
    {
      key: 'accessToken',
      label: 'Access token',
      type: 'password',
      placeholder: 'Instagram Graph access token',
      defaultValue: '',
    },
    {
      key: 'instagramUserId',
      label: 'Instagram user ID',
      type: 'text',
      placeholder: '1784...',
      defaultValue: '',
    },
    {
      key: 'defaultImageUrl',
      label: 'Default image URL',
      type: 'text',
      placeholder: 'https://example.com/post-image.jpg',
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
  sendParams: ['imageUrl', 'caption'],
  mentioningFormulas: [
    '/ig:send:{"imageUrl":"https://example.com/post-image.jpg","caption":"Launch update"}',
    '/ig:send:{"caption":"Uses defaultImageUrl from channel settings"}',
  ],
  help: [
    'Configure an Instagram Graph access token and Instagram professional account user ID.',
    'This first version publishes photo posts using the standard Graph API container + media_publish flow.',
    'Text-only posts are not supported in this connector because Instagram publishing normally requires media.',
    'Stories, reels, comments, inbound events, and media upload from workbook attachments are not included yet.',
  ],
});
