import { defineAIProvider } from './definition.js';

export default defineAIProvider({
  id: 'xai',
  name: 'xAI',
  type: 'openai',
  baseUrl: 'https://api.x.ai/v1',
  model: 'grok-2-latest',
  apiKey: '',
  enabled: true,
  availableModels: ['grok-2-latest', 'grok-2-vision-latest', 'grok-beta'],
  credentialLinks: [
    { label: 'Docs', url: 'https://docs.x.ai/developers/quickstart' },
    { label: 'xAI API', url: 'https://x.ai/api' },
    { label: 'Sign in', url: 'https://accounts.x.ai/' },
  ],
  credentialSteps: [
    'Create or sign in to your xAI account.',
    'Open the xAI Console API keys page and generate a key.',
    'Add credits to the account if required for the models you want to use.',
    'Paste the key here and keep the base URL as https://api.x.ai/v1.',
  ],
  fields: [
    {
      key: 'baseUrl',
      label: 'Base URL',
      type: 'text',
      placeholder: 'https://api.x.ai/v1',
    },
    {
      key: 'model',
      label: 'Model',
      type: 'text',
      placeholder: 'grok-2-latest',
    },
    {
      key: 'apiKey',
      label: 'API key',
      type: 'password',
      placeholder: 'xai-...',
    },
  ],
});
