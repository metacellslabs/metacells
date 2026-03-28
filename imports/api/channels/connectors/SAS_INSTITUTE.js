import { defineChannelConnector } from './definition.js';

export default defineChannelConnector({
  id: 'sas-institute',
  type: 'sas-institute',
  name: 'SAS Institute',
  description:
    'Route jobs and search metadata against SAS Viya style APIs or an internal SAS integration service.',
  packageName: 'SAS Viya REST APIs / SDK',
  supportsReceive: true,
  supportsSend: true,
  capabilities: {
    test: true,
    send: true,
    receive: true,
    poll: true,
    normalizeEvent: true,
    search: true,
    attachments: true,
    oauth: true,
    actions: ['test', 'submit-job', 'poll', 'search'],
    entities: ['job', 'report', 'dataset'],
  },
  settingsFields: [
    { key: 'label', label: 'Channel label', type: 'text', placeholder: 'sas', defaultValue: 'sas' },
    { key: 'enabled', label: 'Enabled', type: 'checkbox', defaultValue: true },
    { key: 'accessToken', label: 'Access token', type: 'password', placeholder: 'SAS access token', defaultValue: '' },
    { key: 'apiBaseUrl', label: 'API base URL', type: 'text', placeholder: 'https://viya.example.com', defaultValue: 'https://viya.example.com' },
    { key: 'projectId', label: 'Project or folder id', type: 'text', placeholder: 'Optional SAS project id', defaultValue: '' },
  ],
  sendParams: ['action', 'body', 'attachments'],
  mentioningFormulas: [
    '/sas:send:{"action":"submit-job","body":"Run the configured scoring flow."}',
  ],
  help: [
    'Represents SAS-facing workflows backed by SAS Viya APIs or a company-owned SAS bridge.',
    'Use it for enterprise analytics jobs, report retrieval, and dataset-related automations.',
  ],
});
