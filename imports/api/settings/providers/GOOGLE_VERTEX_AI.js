import { defineAIProvider } from './definition.js';

export default defineAIProvider({
  id: 'google-vertex-ai',
  name: 'Google Vertex AI',
  type: 'vertex',
  baseUrl: 'https://vertex-gateway.example.internal/v1',
  model: 'gemini-2.5-pro',
  apiKey: '',
  enabled: true,
  availableModels: ['gemini-2.5-pro', 'gemini-2.5-flash', 'claude-sonnet-4@vertex'],
  credentialLinks: [
    {
      label: 'Vertex AI',
      url: 'https://cloud.google.com/vertex-ai',
    },
  ],
  credentialSteps: [
    'Use a company Vertex AI gateway or proxy endpoint that exposes chat-completions semantics.',
    'Set the deployed model name you want MetaCells to call.',
    'If your proxy requires a bearer token, paste it into API key.',
  ],
  fields: [
    {
      key: 'baseUrl',
      label: 'Gateway base URL',
      type: 'text',
      placeholder: 'https://vertex-gateway.example.internal/v1',
    },
    {
      key: 'model',
      label: 'Model',
      type: 'text',
      placeholder: 'gemini-2.5-pro',
    },
    {
      key: 'apiKey',
      label: 'Gateway token',
      type: 'password',
      placeholder: 'Optional bearer token',
    },
  ],
});
