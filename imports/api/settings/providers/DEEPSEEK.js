import { defineAIProvider } from './definition.js';

export default defineAIProvider({
  id: 'deepseek',
  name: 'DeepSeek',
  type: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  apiKey: '',
  enabled: true,
  availableModels: ['deepseek-chat', 'deepseek-reasoner'],
  credentialLinks: [
    { label: 'Docs', url: 'https://api-docs.deepseek.com/' },
    { label: 'API Keys', url: 'https://platform.deepseek.com/api_keys' },
  ],
  credentialSteps: [
    'Sign in to the DeepSeek platform.',
    'Open the API Keys page and create a key.',
    'If needed, add balance in the DeepSeek console before sending requests.',
    'Paste the key here and keep the base URL as https://api.deepseek.com.',
  ],
  fields: [
    {
      key: 'baseUrl',
      label: 'Base URL',
      type: 'text',
      placeholder: 'https://api.deepseek.com',
    },
    {
      key: 'model',
      label: 'Model',
      type: 'text',
      placeholder: 'deepseek-chat',
    },
    {
      key: 'apiKey',
      label: 'API key',
      type: 'password',
      placeholder: 'sk-...',
    },
  ],
});
