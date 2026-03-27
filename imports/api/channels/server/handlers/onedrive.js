import { defineChannelHandler } from '../handler-definition.js';

export default defineChannelHandler({
  id: 'onedrive',
  name: 'OneDrive',
  summary: 'Placeholder handler for Microsoft OneDrive integrations.',
  capabilities: {
    test: true,
    send: true,
    receive: true,
    poll: true,
    search: true,
    attachments: true,
    oauth: true,
    actions: ['test', 'upload', 'poll', 'search'],
    entities: ['file', 'folder', 'driveItem'],
  },
});
