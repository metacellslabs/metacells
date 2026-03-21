import { defineAIProvider } from './definition.js';

export default defineAIProvider({
  id: 'groq',
  name: 'Groq',
  type: 'openai',
  baseUrl: 'https://api.groq.com/openai/v1',
  model: 'llama-3.3-70b-versatile',
  apiKey: '',
  enabled: true,
  availableModels: [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768',
  ],
  credentialLinks: [
    { label: 'Docs', url: 'https://console.groq.com/docs/openai' },
    { label: 'API Keys', url: 'https://console.groq.com/keys' },
  ],
  credentialSteps: [
    'Sign in to the Groq console.',
    'Open API Keys and generate a key.',
    'Paste the key here.',
    'Use https://api.groq.com/openai/v1 as the base URL and select a Groq-supported model.',
  ],
  fields: [
    {
      key: 'baseUrl',
      label: 'Base URL',
      type: 'text',
      placeholder: 'https://api.groq.com/openai/v1',
    },
    {
      key: 'model',
      label: 'Model',
      type: 'text',
      placeholder: 'llama-3.3-70b-versatile',
    },
    {
      key: 'apiKey',
      label: 'API key',
      type: 'password',
      placeholder: 'gsk_...',
    },
  ],
});
