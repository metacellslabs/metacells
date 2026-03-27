import { defineChannelConnector } from './definition.js';

export default defineChannelConnector({
  id: 'deepseek',
  type: 'deepseek',
  name: 'DeepSeek',
  description:
    'Route prompts to a DeepSeek API endpoint or enterprise DeepSeek proxy for model-assisted channel workflows.',
  packageName: 'DeepSeek API / proxy',
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
    entities: ['prompt', 'response', 'attachment'],
  },
  settingsFields: [
    {
      key: 'label',
      label: 'Channel label',
      type: 'text',
      placeholder: 'deepseek',
      defaultValue: 'deepseek',
    },
    { key: 'enabled', label: 'Enabled', type: 'checkbox', defaultValue: true },
    {
      key: 'apiKey',
      label: 'API key',
      type: 'password',
      placeholder: 'DeepSeek or proxy bearer token',
      defaultValue: '',
    },
    {
      key: 'baseUrl',
      label: 'API base URL',
      type: 'text',
      placeholder: 'https://api.deepseek.com',
      defaultValue: 'https://api.deepseek.com',
    },
    {
      key: 'model',
      label: 'Model',
      type: 'text',
      placeholder: 'deepseek-chat',
      defaultValue: 'deepseek-chat',
    },
  ],
  sendParams: ['prompt', 'model', 'attachments'],
  mentioningFormulas: [
    '/deepseek:send:{"prompt":"Summarize this workbook tab."}',
  ],
  help: [
    'Use this connector to route prompts to DeepSeek or an internal gateway exposing DeepSeek models.',
    'This catalog entry currently provides the settings surface and a lightweight runtime stub.',
  ],
});
