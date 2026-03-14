import { defineChannelConnector } from './definition.js';

export default defineChannelConnector({
  id: 'reddit',
  type: 'reddit',
  name: 'Reddit',
  description:
    'Publish outbound self-posts to a subreddit using a Reddit OAuth access token.',
  packageName: 'Reddit Data API',
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
    actions: ['test', 'submit'],
    entities: ['subreddit', 'post', 'listing'],
  },
  settingsFields: [
    {
      key: 'label',
      label: 'Channel label',
      type: 'text',
      placeholder: 'reddit',
      defaultValue: 'reddit',
    },
    { key: 'enabled', label: 'Enabled', type: 'checkbox', defaultValue: true },
    {
      key: 'accessToken',
      label: 'Access token',
      type: 'password',
      placeholder: 'OAuth access token with identity and submit scopes',
      defaultValue: '',
    },
    {
      key: 'defaultSubreddit',
      label: 'Default subreddit',
      type: 'text',
      placeholder: 'mycommunity',
      defaultValue: '',
    },
    {
      key: 'apiBaseUrl',
      label: 'API base URL',
      type: 'text',
      placeholder: 'https://oauth.reddit.com',
      defaultValue: 'https://oauth.reddit.com',
    },
  ],
  sendParams: ['subreddit', 'title', 'body'],
  mentioningFormulas: [
    '/reddit:send:{"subreddit":"test","title":"Launch update","body":"We just shipped a new release."}',
    '/reddit:send:{"title":"Weekly status","body":"This uses the default subreddit from channel settings."}',
  ],
  help: [
    'Configure a Reddit OAuth access token with `identity` and `submit` scopes to publish self-posts.',
    'Posts are submitted as text/self posts via the official `POST /api/submit` endpoint.',
    'Set `Default subreddit` in the channel settings if you want formulas to omit the subreddit field.',
    'This first version creates text posts only. Link posts, media posts, flair selection, and comment actions are not included yet.',
  ],
});
