import { defineAIProvider } from './definition.js';

export default defineAIProvider({
  id: 'openrouter',
  name: 'OpenRouter',
  type: 'openai',
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'openai/gpt-4o-mini',
  apiKey: '',
  enabled: true,
  availableModels: [
    'openai/gpt-4o-mini',
    'openai/gpt-4.1-mini',
    'anthropic/claude-3.7-sonnet',
    'google/gemini-2.0-flash-001',
  ],
  credentialLinks: [
    { label: 'Docs', url: 'https://openrouter.ai/docs/quickstart' },
    { label: 'API Keys', url: 'https://openrouter.ai/settings/keys' },
  ],
  credentialSteps: [
    'Create or sign in to your OpenRouter account.',
    'Open the API Keys page and generate a key.',
    'Make sure your account has credits or an enabled payment method for the models you want.',
    'Paste the key here and use https://openrouter.ai/api/v1 as the base URL.',
  ],
  fields: [
    {
      key: 'baseUrl',
      label: 'Base URL',
      type: 'text',
      placeholder: 'https://openrouter.ai/api/v1',
    },
    {
      key: 'model',
      label: 'Model',
      type: 'text',
      placeholder: 'openai/gpt-4o-mini',
    },
    {
      key: 'apiKey',
      label: 'API key',
      type: 'password',
      placeholder: 'sk-or-...',
    },
  ],
});
