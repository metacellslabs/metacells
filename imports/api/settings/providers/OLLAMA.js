import { defineAIProvider } from './definition.js';

export default defineAIProvider({
  id: 'ollama',
  name: 'Ollama',
  type: 'openai',
  baseUrl: 'http://localhost:11434/v1',
  model: 'llama3.2',
  apiKey: '',
  enabled: true,
  availableModels: ['llama3.2', 'qwen2.5', 'mistral', 'phi4'],
  credentialLinks: [
    { label: 'OpenAI compatibility docs', url: 'https://docs.ollama.com/openai' },
    { label: 'Download', url: 'https://ollama.com/download' },
  ],
  credentialSteps: [
    'Install Ollama and start the local server.',
    'Pull at least one model, for example with ollama pull llama3.2.',
    'Use http://localhost:11434/v1 as the base URL, or replace localhost with a host reachable from Docker if needed.',
    'Leave API key empty because local Ollama does not require one by default.',
  ],
  fields: [
    {
      key: 'baseUrl',
      label: 'Base URL',
      type: 'text',
      placeholder: 'http://localhost:11434/v1',
    },
    {
      key: 'model',
      label: 'Model',
      type: 'text',
      placeholder: 'llama3.2',
    },
    {
      key: 'apiKey',
      label: 'API key',
      type: 'password',
      placeholder: 'Leave empty for local Ollama',
    },
  ],
});
