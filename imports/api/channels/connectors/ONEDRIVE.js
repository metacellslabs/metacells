import { defineChannelConnector } from './definition.js';

export default defineChannelConnector({
  id: 'onedrive',
  type: 'onedrive',
  name: 'OneDrive',
  description:
    'Browse, search, and upload files through Microsoft Graph for OneDrive.',
  packageName: 'Microsoft Graph',
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
    actions: ['test', 'upload', 'poll', 'search'],
    entities: ['file', 'folder', 'driveItem'],
  },
  settingsFields: [
    { key: 'label', label: 'Channel label', type: 'text', placeholder: 'onedrive', defaultValue: 'onedrive' },
    { key: 'enabled', label: 'Enabled', type: 'checkbox', defaultValue: true },
    { key: 'accessToken', label: 'Access token', type: 'password', placeholder: 'Microsoft Graph token', defaultValue: '' },
    { key: 'driveId', label: 'Drive ID', type: 'text', placeholder: 'Optional drive id', defaultValue: '' },
    { key: 'folderPath', label: 'Folder path', type: 'text', placeholder: '/Shared Documents/Inbox', defaultValue: '' },
    { key: 'apiBaseUrl', label: 'API base URL', type: 'text', placeholder: 'https://graph.microsoft.com/v1.0', defaultValue: 'https://graph.microsoft.com/v1.0' },
  ],
  sendParams: ['name', 'body', 'folderPath', 'attachments'],
  mentioningFormulas: [
    '# /onedrive summarize newly arrived files',
    '/onedrive:send:{"name":"notes.txt","body":"hello from MetaCells"}',
  ],
  help: [
    'Targets Microsoft OneDrive through Microsoft Graph.',
    'Intended for enterprise document routing and file retrieval workflows.',
  ],
});
