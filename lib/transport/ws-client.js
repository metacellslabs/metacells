let sharedSocket = null;
let reconnectTimer = null;
let listeners = new Set();
let statusListeners = new Set();
let subscriptions = new Set();
let explicitlyClosed = false;
let socketState = 'disconnected';
let lastServerMessageAt = 0;
let heartbeatWatchdogTimer = null;
let lastEventSequenceByDocument = new Map();
let serverEventListeners = new Set();

function buildStatusPayload() {
  return {
    state: socketState,
    connected: socketState === 'connected',
    lastServerMessageAt,
  };
}

function notifyStatusListeners() {
  const payload = buildStatusPayload();
  statusListeners.forEach((listener) => {
    try {
      listener(payload);
    } catch (error) {}
  });
}

function setSocketState(nextState) {
  const normalized = String(nextState || 'disconnected');
  if (
    normalized === socketState &&
    !(normalized === 'connected' && !lastServerMessageAt)
  ) {
    return;
  }
  socketState = normalized;
  notifyStatusListeners();
}

function getSocketUrl() {
  if (typeof window === 'undefined' || !window.location) return '';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return protocol + '//' + window.location.host + '/ws';
}

function notifyListeners(message) {
  listeners.forEach((listener) => {
    try {
      listener(message);
    } catch (error) {}
  });
}

function notifyServerEventListeners(message) {
  serverEventListeners.forEach((listener) => {
    try {
      listener(message);
    } catch (error) {}
  });
}

function shouldDeliverMessage(message) {
  const payload = message && typeof message === 'object' ? message : {};
  if (String(payload.type || '') !== 'workbook.event') return true;
  const sheetDocumentId = String(payload.sheetDocumentId || '');
  const sequence = Number(
    payload.sequence || (payload.event && payload.event.sequence) || 0,
  );
  if (!sheetDocumentId || !Number.isFinite(sequence) || sequence <= 0) {
    return true;
  }
  const lastSequence = Number(lastEventSequenceByDocument.get(sheetDocumentId) || 0);
  if (sequence <= lastSequence) return false;
  lastEventSequenceByDocument.set(sheetDocumentId, sequence);
  return true;
}

function markServerMessageReceived() {
  lastServerMessageAt = Date.now();
  if (socketState !== 'connected') {
    setSocketState('connected');
    return;
  }
  notifyStatusListeners();
}

function sendJson(payload) {
  if (!sharedSocket || sharedSocket.readyState !== WebSocket.OPEN) return false;
  try {
    sharedSocket.send(JSON.stringify(payload));
    return true;
  } catch (error) {
    return false;
  }
}

function resubscribeAll() {
  subscriptions.forEach((sheetDocumentId) => {
    sendJson({
      type: 'workbook.subscribe',
      sheetDocumentId,
    });
  });
}

function scheduleReconnect() {
  if (explicitlyClosed || reconnectTimer || typeof window === 'undefined') return;
  setSocketState('reconnecting');
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    ensureWorkbookEventSocket();
  }, 1000);
}

function clearHeartbeatWatchdog() {
  if (heartbeatWatchdogTimer && typeof window !== 'undefined') {
    window.clearInterval(heartbeatWatchdogTimer);
    heartbeatWatchdogTimer = null;
  }
}

function ensureHeartbeatWatchdog() {
  if (heartbeatWatchdogTimer || typeof window === 'undefined') return;
  heartbeatWatchdogTimer = window.setInterval(() => {
    if (!sharedSocket || sharedSocket.readyState !== WebSocket.OPEN) return;
    if (!lastServerMessageAt) return;
    if (Date.now() - lastServerMessageAt <= 30000) return;
    try {
      sharedSocket.close();
    } catch (error) {}
  }, 5000);
}

export function ensureWorkbookEventSocket() {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
    return null;
  }
  if (
    sharedSocket &&
    (sharedSocket.readyState === WebSocket.OPEN ||
      sharedSocket.readyState === WebSocket.CONNECTING)
  ) {
    return sharedSocket;
  }

  explicitlyClosed = false;
  setSocketState('connecting');
  sharedSocket = new WebSocket(getSocketUrl());
  sharedSocket.addEventListener('open', () => {
    lastServerMessageAt = Date.now();
    setSocketState('connected');
    resubscribeAll();
    ensureHeartbeatWatchdog();
  });
  sharedSocket.addEventListener('message', (event) => {
    const data = event && typeof event.data === 'string' ? event.data : '';
    if (!data) return;
    try {
      const parsed = JSON.parse(data);
      if (parsed && (parsed.type === 'ws.ready' || parsed.type === 'ws.heartbeat')) {
        markServerMessageReceived();
        return;
      }
      markServerMessageReceived();
      if (parsed && parsed.type === 'server.event') {
        notifyServerEventListeners(parsed);
        return;
      }
      if (!shouldDeliverMessage(parsed)) return;
      notifyListeners(parsed);
    } catch (error) {}
  });
  sharedSocket.addEventListener('close', () => {
    sharedSocket = null;
    lastServerMessageAt = 0;
    clearHeartbeatWatchdog();
    scheduleReconnect();
  });
  sharedSocket.addEventListener('error', () => {
    if (socketState === 'connecting') {
      setSocketState('reconnecting');
    }
  });
  return sharedSocket;
}

export function subscribeWorkbookEvents(listener) {
  if (typeof listener !== 'function') return function () {};
  listeners.add(listener);
  ensureWorkbookEventSocket();
  return function () {
    listeners.delete(listener);
  };
}

export function subscribeWorkbookSocketStatus(listener) {
  if (typeof listener !== 'function') return function () {};
  statusListeners.add(listener);
  listener(buildStatusPayload());
  ensureWorkbookEventSocket();
  return function () {
    statusListeners.delete(listener);
  };
}

export function subscribeServerEvents(listener) {
  if (typeof listener !== 'function') return function () {};
  serverEventListeners.add(listener);
  ensureWorkbookEventSocket();
  return function () {
    serverEventListeners.delete(listener);
  };
}

export function subscribeWorkbookDocument(sheetDocumentId) {
  const normalized = String(sheetDocumentId || '');
  if (!normalized) return function () {};
  subscriptions.add(normalized);
  ensureWorkbookEventSocket();
  sendJson({
    type: 'workbook.subscribe',
    sheetDocumentId: normalized,
  });
  return function () {
    subscriptions.delete(normalized);
    sendJson({
      type: 'workbook.unsubscribe',
      sheetDocumentId: normalized,
    });
  };
}

export function closeWorkbookEventSocket() {
  explicitlyClosed = true;
  if (reconnectTimer && typeof window !== 'undefined') {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  clearHeartbeatWatchdog();
  if (sharedSocket) {
    try {
      sharedSocket.close();
    } catch (error) {}
    sharedSocket = null;
  }
  lastServerMessageAt = 0;
  lastEventSequenceByDocument = new Map();
  serverEventListeners = new Set();
  setSocketState('disconnected');
}
