import { defineAIProvider } from './definition.js';

export default defineAIProvider({
  id: 'together',
  name: 'Together AI',
  type: 'openai',
  baseUrl: 'https://api.together.xyz/v1',
  model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  apiKey: '',
  enabled: true,
  availableModels: [
    'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    'Qwen/Qwen2.5-72B-Instruct-Turbo',
  ],
  credentialLinks: [
    {
      label: 'Docs',
      url: 'https://docs.together.ai/docs/openai-api-compatibility',
    },
    { label: 'API Keys', url: 'https://api.together.xyz/settings/api-keys' },
  ],
  credentialSteps: [
    'Sign in to Together AI.',
    'Open the API Keys page in the Together settings area and create a key.',
    'Paste the key here.',
    'Use https://api.together.xyz/v1 as the base URL and choose a Together-supported model id.',
  ],
  fields: [
    {
      key: 'baseUrl',
      label: 'Base URL',
      type: 'text',
      placeholder: 'https://api.together.xyz/v1',
    },
    {
      key: 'model',
      label: 'Model',
      type: 'text',
      placeholder: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    },
    {
      key: 'apiKey',
      label: 'API key',
      type: 'password',
      placeholder: 'together_...',
    },
  ],
});
