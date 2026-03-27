import { defineChannelHandler } from '../handler-definition.js';

export default defineChannelHandler({
  id: 'sharepoint',
  name: 'SharePoint',
  summary: 'Placeholder handler for SharePoint document library integrations.',
  capabilities: {
    test: true,
    send: true,
    receive: true,
    poll: true,
    search: true,
    attachments: true,
    oauth: true,
    actions: ['test', 'upload', 'poll', 'search'],
    entities: ['site', 'library', 'listItem', 'file'],
  },
});
