import { WebSocketServer } from 'ws';
import { subscribeWorkbookEvents } from '../imports/api/sheets/events/events-bus.js';
import { subscribeServerEvents } from './ws-events.js';

function safeJsonParse(text) {
  try {
    return JSON.parse(String(text || ''));
  } catch (error) {
    return null;
  }
}

function buildEnvelope(event) {
  return JSON.stringify({
    type: 'workbook.event',
    sheetDocumentId: String(event.sheetDocumentId || ''),
    sequence: Number(event.sequence || 0),
    event,
  });
}

function buildServerEventEnvelope(event) {
  return JSON.stringify({
    type: 'server.event',
    event,
  });
}

export function setupWorkbookWebSocketServer(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((client) => {
      if (!client || client.readyState !== 1) return;
      try {
        client.send(
          JSON.stringify({
            type: 'ws.heartbeat',
            timestamp: Date.now(),
          }),
        );
      } catch (error) {}
    });
  }, 15000);

  const unsubscribe = subscribeWorkbookEvents((event) => {
    const payload = buildEnvelope(event);
    wss.clients.forEach((client) => {
      if (!client || client.readyState !== 1) return;
      const subscriptions = client.__metacellsSubscriptions;
      if (
        subscriptions &&
        subscriptions.size > 0 &&
        !subscriptions.has(String(event.sheetDocumentId || ''))
      ) {
        return;
      }
      try {
        client.send(payload);
      } catch (error) {}
    });
  });
  const unsubscribeServerEvents = subscribeServerEvents((event) => {
    const payload = buildServerEventEnvelope(event);
    wss.clients.forEach((client) => {
      if (!client || client.readyState !== 1) return;
      try {
        client.send(payload);
      } catch (_error) {}
    });
  });

  wss.on('connection', (socket) => {
    socket.__metacellsSubscriptions = new Set();
    try {
      socket.send(
        JSON.stringify({
          type: 'ws.ready',
        }),
      );
    } catch (error) {}

    socket.on('message', (message) => {
      const payload = safeJsonParse(message);
      if (!payload || typeof payload !== 'object') return;
      const action = String(payload.type || '');
      const sheetDocumentId = String(payload.sheetDocumentId || '');
      if (!sheetDocumentId) return;
      if (action === 'workbook.subscribe') {
        socket.__metacellsSubscriptions.add(sheetDocumentId);
        return;
      }
      if (action === 'workbook.unsubscribe') {
        socket.__metacellsSubscriptions.delete(sheetDocumentId);
      }
    });
  });

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
    unsubscribe();
    unsubscribeServerEvents();
  });

  return wss;
}
