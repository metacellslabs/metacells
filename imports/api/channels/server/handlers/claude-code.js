import { defineChannelHandler } from '../handler-definition.js';

export default defineChannelHandler({
  id: 'claude-code',
  name: 'Claude Code',
  summary: 'Placeholder handler for Claude Code CLI style integrations.',
  capabilities: {
    test: true,
    send: true,
    receive: false,
    search: false,
    attachments: true,
    actions: ['test', 'run'],
    entities: ['session', 'prompt', 'artifact'],
  },
});
