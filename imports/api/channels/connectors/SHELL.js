import { defineChannelConnector } from './definition.js';

export default defineChannelConnector({
  id: 'shell',
  type: 'shell',
  name: 'Shell',
  description:
    'Run local shell commands on the server host and return stdout/stderr.',
  packageName: 'system shell',
  supportsReceive: false,
  supportsSend: true,
  capabilities: {
    test: true,
    send: true,
    receive: false,
    poll: false,
    normalizeEvent: false,
    search: false,
    attachments: false,
    oauth: false,
    actions: ['test', 'exec'],
    entities: ['command', 'stdout', 'stderr'],
  },
  settingsFields: [
    {
      key: 'label',
      label: 'Channel label',
      type: 'text',
      placeholder: 'sh',
      defaultValue: 'sh',
    },
    { key: 'enabled', label: 'Enabled', type: 'checkbox', defaultValue: true },
    {
      key: 'shellPath',
      label: 'Shell path',
      type: 'text',
      placeholder: '/bin/zsh',
      defaultValue: '/bin/zsh',
    },
    {
      key: 'workingDirectory',
      label: 'Working directory',
      type: 'text',
      placeholder: '/absolute/path',
      defaultValue: '',
    },
    {
      key: 'defaultCommand',
      label: 'Default command',
      type: 'text',
      placeholder: 'pwd',
      defaultValue: '',
    },
    {
      key: 'timeoutMs',
      label: 'Timeout (ms)',
      type: 'number',
      placeholder: '30000',
      defaultValue: 30000,
    },
  ],
  sendParams: ['command'],
  mentioningFormulas: [
    '/sh:send:{"command":"pwd"}',
    '/sh:send:{"command":"git status --short"}',
  ],
  help: [
    'Runs local shell commands on the MetaCells server host.',
    'Set `workingDirectory` if commands should run in a specific repository or folder.',
    'Use `/sh:send:{"command":"..."}` to run a command and return stdout/stderr.',
    'This connector is powerful and unsafe by design. It should only be enabled in trusted local environments.',
  ],
});
