import { defineChannelConnector } from './definition.js';

export default defineChannelConnector({
  id: 'linkedin',
  type: 'linkedin',
  name: 'LinkedIn',
  description:
    'Publish outbound LinkedIn posts from a member access token.',
  packageName: 'LinkedIn API',
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
    entities: ['member', 'post'],
  },
  settingsFields: [
    {
      key: 'label',
      label: 'Channel label',
      type: 'text',
      placeholder: 'linkedin',
      defaultValue: 'linkedin',
    },
    { key: 'enabled', label: 'Enabled', type: 'checkbox', defaultValue: true },
    {
      key: 'accessToken',
      label: 'Access token',
      type: 'password',
      placeholder: 'OAuth access token with w_member_social',
      defaultValue: '',
    },
    {
      key: 'authorUrn',
      label: 'Author URN',
      type: 'text',
      placeholder: 'urn:li:person:... (optional if token supports /userinfo)',
      defaultValue: '',
    },
    {
      key: 'apiBaseUrl',
      label: 'API base URL',
      type: 'text',
      placeholder: 'https://api.linkedin.com',
      defaultValue: 'https://api.linkedin.com',
    },
  ],
  sendParams: ['body'],
  mentioningFormulas: [
    '/linkedin shipping update is live',
    '/linkedin:send:our new release is live',
  ],
  help: [
    'Configure a LinkedIn member access token with `w_member_social` to publish a text post.',
    'If the token also supports OpenID `/userinfo`, MetaCells can resolve the member author automatically from the token `sub` claim.',
    'If `/userinfo` is not available for the token, set `Author URN` manually as `urn:li:person:...`.',
    'This first version sends text-only posts. Media upload is not included yet.',
  ],
});
