import { defineAIProvider } from './definition.js';

export default defineAIProvider({
  id: 'aws-bedrock',
  name: 'AWS Bedrock',
  type: 'bedrock',
  baseUrl: 'https://bedrock-runtime.example.internal/v1',
  model: 'anthropic.claude-3-7-sonnet-20250219-v1:0',
  apiKey: '',
  enabled: true,
  availableModels: [
    'anthropic.claude-3-7-sonnet-20250219-v1:0',
    'anthropic.claude-3-5-sonnet-20241022-v2:0',
    'amazon.nova-pro-v1:0',
  ],
  credentialLinks: [
    {
      label: 'Amazon Bedrock',
      url: 'https://aws.amazon.com/bedrock/',
    },
  ],
  credentialSteps: [
    'Expose Bedrock through your company gateway or OpenAI-compatible proxy endpoint.',
    'Paste the gateway base URL here.',
    'Set the target Bedrock model id.',
    'If your gateway requires a bearer token, paste it into API key.',
  ],
  fields: [
    {
      key: 'baseUrl',
      label: 'Gateway base URL',
      type: 'text',
      placeholder: 'https://bedrock-runtime.example.internal/v1',
    },
    {
      key: 'model',
      label: 'Model',
      type: 'text',
      placeholder: 'anthropic.claude-3-7-sonnet-20250219-v1:0',
    },
    {
      key: 'apiKey',
      label: 'Gateway token',
      type: 'password',
      placeholder: 'Optional bearer token',
    },
  ],
});
