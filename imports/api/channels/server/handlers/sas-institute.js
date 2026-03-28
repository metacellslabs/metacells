import { defineChannelHandler } from '../handler-definition.js';

export default defineChannelHandler({
  id: 'sas-institute',
  name: 'SAS Institute',
  summary: 'Placeholder handler for SAS Viya or SAS integration services.',
  capabilities: {
    test: true,
    send: true,
    receive: true,
    poll: true,
    search: true,
    attachments: true,
    oauth: true,
    actions: ['test', 'submit-job', 'poll', 'search'],
    entities: ['job', 'report', 'dataset'],
  },
});
