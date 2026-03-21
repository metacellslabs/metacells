import { defineChannelConnector } from './definition.js';

export default defineChannelConnector({
  id: 'hackernews',
  type: 'hackernews',
  name: 'Hacker News',
  description:
    'Poll public Hacker News stories from the official Firebase API.',
  packageName: 'Hacker News Firebase API',
  supportsReceive: true,
  supportsSend: false,
  capabilities: {
    test: true,
    send: false,
    receive: true,
    poll: true,
    normalizeEvent: true,
    search: true,
    attachments: false,
    oauth: false,
    actions: ['test', 'poll', 'search'],
    entities: ['story', 'job', 'comment'],
  },
  settingsFields: [
    {
      key: 'label',
      label: 'Channel label',
      type: 'text',
      placeholder: 'hn',
      defaultValue: 'hn',
    },
    { key: 'enabled', label: 'Enabled', type: 'checkbox', defaultValue: true },
    {
      key: 'feed',
      label: 'Feed',
      type: 'text',
      placeholder: 'newstories',
      defaultValue: 'newstories',
    },
    {
      key: 'limit',
      label: 'Items per poll',
      type: 'number',
      placeholder: '20',
      defaultValue: 20,
    },
    {
      key: 'apiBaseUrl',
      label: 'API base URL',
      type: 'text',
      placeholder: 'https://hacker-news.firebaseio.com/v0',
      defaultValue: 'https://hacker-news.firebaseio.com/v0',
    },
  ],
  sendParams: [],
  mentioningFormulas: [
    '# /hn summarise each new story in one line',
    '# /hn include only AI-related stories and extract startup ideas',
  ],
  help: [
    'Uses the official read-only Hacker News Firebase API.',
    'Supported feeds include `newstories`, `topstories`, `beststories`, `askstories`, `showstories`, and `jobstories`.',
    'This connector is receive-only because the official HN API is read-only.',
  ],
});
