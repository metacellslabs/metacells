import { defineAIProvider } from './definition.js';

export default defineAIProvider({
  id: 'custom',
  name: 'Custom API',
  type: 'openai',
  baseUrl: '',
  model: '',
  apiKey: '',
  enabled: true,
  availableModels: [],
  credentialLinks: [],
  credentialSteps: [
    'Enter the base URL of any OpenAI-compatible API endpoint.',
    'Add an API key if the endpoint requires authentication.',
    'Click "Load models" to fetch available models from the API.',
    'Select a model and save.',
  ],
  fields: [
    {
      key: 'baseUrl',
      label: 'Base URL',
      type: 'text',
      placeholder: 'https://your-api.example.com/v1',
    },
    {
      key: 'model',
      label: 'Model',
      type: 'text',
      placeholder: 'Model ID',
    },
    {
      key: 'apiKey',
      label: 'API key',
      type: 'password',
      placeholder: 'sk-...',
    },
  ],
});
