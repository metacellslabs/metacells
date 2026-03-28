import { defineAIProvider } from './definition.js';

export default defineAIProvider({
  id: 'corporate-ai-model',
  name: 'Corporate AI model',
  type: 'corporate',
  baseUrl: 'https://ai-gateway.company.com/v1',
  model: 'corp-general-chat',
  apiKey: '',
  enabled: true,
  availableModels: ['corp-general-chat', 'corp-vision-chat', 'corp-reasoning'],
  credentialLinks: [
    {
      label: 'Internal gateway docs',
      url: 'https://company.example.com/ai-gateway',
    },
  ],
  credentialSteps: [
    'Use your organization AI gateway or inference proxy URL.',
    'Enter the default model name exposed by your internal platform.',
    'Paste the bearer token or service token if your gateway requires one.',
  ],
  fields: [
    {
      key: 'baseUrl',
      label: 'Gateway base URL',
      type: 'text',
      placeholder: 'https://ai-gateway.company.com/v1',
    },
    {
      key: 'model',
      label: 'Model',
      type: 'text',
      placeholder: 'corp-general-chat',
    },
    {
      key: 'apiKey',
      label: 'Access token',
      type: 'password',
      placeholder: 'Optional bearer token',
    },
  ],
});
