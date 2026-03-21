import { defineAIProvider } from './definition.js';

export default defineAIProvider({
  id: 'openai',
  name: 'OpenAI',
  type: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4.1-mini',
  apiKey: '',
  enabled: true,
  availableModels: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'],
  credentialLinks: [
    { label: 'Docs', url: 'https://platform.openai.com/docs/quickstart' },
    {
      label: 'API Keys',
      url: 'https://platform.openai.com/settings/organization/api-keys',
    },
  ],
  credentialSteps: [
    'Sign in to the OpenAI platform.',
    'Open API Keys and create a new secret key.',
    'Ensure your account has billing or credits enabled for the models you want to use.',
    'Paste the key here and keep the base URL as https://api.openai.com/v1.',
  ],
  fields: [
    {
      key: 'baseUrl',
      label: 'Base URL',
      type: 'text',
      placeholder: 'https://api.openai.com/v1',
    },
    { key: 'model', label: 'Model', type: 'text', placeholder: 'gpt-4.1-mini' },
    {
      key: 'apiKey',
      label: 'API key',
      type: 'password',
      placeholder: 'sk-...',
    },
  ],
});
