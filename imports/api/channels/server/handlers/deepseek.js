import { defineChannelHandler } from '../handler-definition.js';

export default defineChannelHandler({
  id: 'deepseek',
  name: 'DeepSeek',
  summary: 'Placeholder handler for DeepSeek channel integrations.',
  capabilities: {
    test: true,
    send: true,
    receive: false,
    search: false,
    attachments: true,
    actions: ['test', 'send'],
    entities: ['prompt', 'response', 'attachment'],
  },
});
