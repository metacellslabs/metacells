import { defineAIProvider } from './definition.js';

export default defineAIProvider({
  id: 'fireworks',
  name: 'Fireworks AI',
  type: 'openai',
  baseUrl: 'https://api.fireworks.ai/inference/v1',
  model: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
  apiKey: '',
  enabled: true,
  availableModels: [
    'accounts/fireworks/models/llama-v3p1-8b-instruct',
    'accounts/fireworks/models/llama-v3p1-70b-instruct',
    'accounts/fireworks/models/qwen3-235b-a22b',
  ],
  credentialLinks: [
    {
      label: 'Docs',
      url: 'https://readme.fireworks.ai/docs/openai-compatibility',
    },
    { label: 'Console', url: 'https://app.fireworks.ai/' },
  ],
  credentialSteps: [
    'Sign in to the Fireworks AI console.',
    'Create an API key from your account or developer settings.',
    'Paste that key here.',
    'Use https://api.fireworks.ai/inference/v1 as the base URL and choose a Fireworks model id.',
  ],
  fields: [
    {
      key: 'baseUrl',
      label: 'Base URL',
      type: 'text',
      placeholder: 'https://api.fireworks.ai/inference/v1',
    },
    {
      key: 'model',
      label: 'Model',
      type: 'text',
      placeholder: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
    },
    {
      key: 'apiKey',
      label: 'API key',
      type: 'password',
      placeholder: 'fw_...',
    },
  ],
});
