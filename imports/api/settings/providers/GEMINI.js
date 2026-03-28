import { defineAIProvider } from './definition.js';

export default defineAIProvider({
  id: 'gemini',
  name: 'Google Gemini',
  type: 'gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  model: 'gemini-flash-latest',
  apiKey: '',
  enabled: true,
  availableModels: [
    'gemini-flash-latest',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ],
  credentialLinks: [
    { label: 'Docs', url: 'https://ai.google.dev/gemini-api/docs' },
    { label: 'API Keys', url: 'https://aistudio.google.com/app/apikey' },
  ],
  credentialSteps: [
    'Open Google AI Studio and create an API key.',
    'Paste the key here.',
    'Keep the base URL as https://generativelanguage.googleapis.com/v1beta unless you use a proxy.',
    'Use a Gemini model such as gemini-flash-latest.',
  ],
  fields: [
    {
      key: 'baseUrl',
      label: 'Base URL',
      type: 'text',
      placeholder: 'https://generativelanguage.googleapis.com/v1beta',
    },
    {
      key: 'model',
      label: 'Model',
      type: 'text',
      placeholder: 'gemini-flash-latest',
    },
    {
      key: 'apiKey',
      label: 'API key',
      type: 'password',
      placeholder: 'AIza...',
    },
  ],
});
