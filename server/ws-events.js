const wsEventListeners = new Set();
let wsEventSequence = 0;

function nextWsEventSequence() {
  wsEventSequence += 1;
  return wsEventSequence;
}

function normalizeWsEvent(event) {
  const source = event && typeof event === 'object' ? event : {};
  const payload =
    source.payload && typeof source.payload === 'object' ? source.payload : {};
  return {
    type: String(source.type || ''),
    scope: String(source.scope || 'global'),
    sequence: Number.isFinite(source.sequence)
      ? Number(source.sequence)
      : nextWsEventSequence(),
    timestamp: Number.isFinite(source.timestamp)
      ? Number(source.timestamp)
      : Date.now(),
    jobId: String(source.jobId || ''),
    jobType: String(source.jobType || ''),
    jobStatus: String(source.jobStatus || ''),
    channelId: String(source.channelId || ''),
    channelLabel: String(source.channelLabel || ''),
    sheetId: String(source.sheetId || payload.sheetId || ''),
    payload,
  };
}

export function subscribeServerEvents(listener) {
  if (typeof listener !== 'function') return function () {};
  wsEventListeners.add(listener);
  return function () {
    wsEventListeners.delete(listener);
  };
}

export function publishServerEvent(event) {
  const normalized = normalizeWsEvent(event);
  if (!normalized.type) return normalized;
  wsEventListeners.forEach((listener) => {
    try {
      listener(normalized);
    } catch (_error) {}
  });
  return normalized;
}
