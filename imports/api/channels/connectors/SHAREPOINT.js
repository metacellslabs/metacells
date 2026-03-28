import { defineChannelConnector } from './definition.js';

export default defineChannelConnector({
  id: 'sharepoint',
  type: 'sharepoint',
  name: 'SharePoint',
  description:
    'Poll document libraries, search files, and upload documents through Microsoft Graph for SharePoint.',
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
    entities: ['site', 'library', 'listItem', 'file'],
  },
  settingsFields: [
    { key: 'label', label: 'Channel label', type: 'text', placeholder: 'sharepoint', defaultValue: 'sharepoint' },
    { key: 'enabled', label: 'Enabled', type: 'checkbox', defaultValue: true },
    { key: 'accessToken', label: 'Access token', type: 'password', placeholder: 'Microsoft Graph token', defaultValue: '' },
    { key: 'siteId', label: 'Site ID', type: 'text', placeholder: 'contoso.sharepoint.com,site-id,web-id', defaultValue: '' },
    { key: 'driveId', label: 'Document library drive ID', type: 'text', placeholder: 'Optional drive id', defaultValue: '' },
    { key: 'apiBaseUrl', label: 'API base URL', type: 'text', placeholder: 'https://graph.microsoft.com/v1.0', defaultValue: 'https://graph.microsoft.com/v1.0' },
  ],
  sendParams: ['name', 'body', 'siteId', 'driveId', 'attachments'],
  mentioningFormulas: [
    '# /sharepoint summarize new library documents',
    '/sharepoint:send:{"name":"brief.txt","body":"hello from MetaCells"}',
  ],
  help: [
    'Targets SharePoint document libraries via Microsoft Graph.',
    'Suitable for enterprise file ingestion and outbound document publishing workflows.',
  ],
});
