import { defineChannelConnector } from './definition.js';

export default defineChannelConnector({
  id: 'claude-code',
  type: 'claude-code',
  name: 'Claude Code',
  description:
    'Connect a local Claude Code CLI workflow or broker service to review, edit, and summarize repository work.',
  packageName: 'Claude Code CLI / broker',
  supportsReceive: false,
  supportsSend: true,
  capabilities: {
    test: true,
    send: true,
    receive: false,
    poll: false,
    normalizeEvent: false,
    search: false,
    attachments: true,
    oauth: false,
    actions: ['test', 'run'],
    entities: ['session', 'prompt', 'artifact'],
  },
  settingsFields: [
    { key: 'label', label: 'Channel label', type: 'text', placeholder: 'claude', defaultValue: 'claude' },
    { key: 'enabled', label: 'Enabled', type: 'checkbox', defaultValue: true },
    { key: 'command', label: 'Command', type: 'text', placeholder: 'claude', defaultValue: 'claude' },
    { key: 'workingDirectory', label: 'Working directory', type: 'text', placeholder: '/absolute/path', defaultValue: '' },
  ],
  sendParams: ['prompt', 'cwd', 'attachments'],
  mentioningFormulas: [
    '/claude:send:{"prompt":"Review the last diff and summarize risks."}',
  ],
  help: [
    'Use this connector to route prompts into a local Claude Code CLI or an internal wrapper service.',
    'This catalog entry defines the integration surface; the runtime handler is a lightweight placeholder until a local execution bridge is configured.',
  ],
});
