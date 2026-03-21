import { defineAIProvider } from './definition.js';

export default defineAIProvider({
  id: 'lm-studio',
  name: 'LM Studio',
  type: 'lm_studio',
  baseUrl: 'http://localhost:1234/v1',
  model: '',
  apiKey: '',
  enabled: true,
  availableModels: [],
  credentialLinks: [
    {
      label: 'Docs',
      url: 'https://lmstudio.ai/docs/app/api/endpoints/openai',
    },
    { label: 'Download', url: 'https://lmstudio.ai/' },
  ],
  credentialSteps: [
    'Install LM Studio and load a local model.',
    'Start the local server and enable the OpenAI-compatible API endpoint.',
    'Use http://localhost:1234/v1 as the base URL, or replace localhost with a host reachable from Docker if needed.',
    'Leave API key empty unless your LM Studio setup explicitly requires one.',
  ],
  fields: [
    {
      key: 'baseUrl',
      label: 'Base URL',
      type: 'text',
      placeholder: 'http://localhost:1234/v1',
    },
    {
      key: 'model',
      label: 'Model override',
      type: 'text',
      placeholder: 'Leave empty to auto-detect',
    },
  ],
});
