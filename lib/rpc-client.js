import { getMethodHandler } from './rpc.js';

function stringifyRpcErrorDetails(details) {
  if (!details || typeof details !== 'object') return '';
  try {
    return JSON.stringify(details);
  } catch (_error) {
    return '';
  }
}

function buildRpcErrorMessage(method, statusCode, payload, fallbackMessage) {
  const body = payload && typeof payload === 'object' ? payload : {};
  const errorType = String(body.errorType || '').trim();
  const errorMessage = String(body.error || fallbackMessage || 'RPC request failed');
  const detailsText = stringifyRpcErrorDetails(body.details);
  let message = `RPC ${String(method || '')} failed`;
  if (statusCode) {
    message += ` [${String(statusCode)}]`;
  }
  if (errorType) {
    message += ` ${errorType}`;
  }
  if (errorMessage) {
    message += `: ${errorMessage}`;
  }
  if (detailsText) {
    message += ` | details=${detailsText}`;
  }
  return message;
}

export async function rpc(method, ...params) {
  // On the server (Node.js), call the handler directly to avoid
  // fetch() failing with relative URLs (Node.js fetch requires absolute URLs)
  if (typeof window === 'undefined') {
    const handler = getMethodHandler(method);
    if (handler) {
      const result = await handler(...params);
      return result !== undefined ? result : null;
    }
  }

  if (String(method || '') === 'sheets.computeGrid') {
    console.log('[rpc trace] sheets.computeGrid params', params);
    try {
      console.trace('[rpc trace] sheets.computeGrid caller');
    } catch (_error) {}
  }

  const res = await fetch('/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });

  let data = null;
  try {
    data = await res.json();
  } catch (_error) {
    data = null;
  }

  if (!res.ok || (data && data.error)) {
    const payload = data && typeof data === 'object' ? data : {};
    const err = new Error(
      buildRpcErrorMessage(method, res.status, payload, res.statusText),
    );
    err.reason = payload.error || res.statusText || 'RPC request failed';
    if (payload.errorType) err.error = payload.errorType;
    if (payload.details && typeof payload.details === 'object') {
      err.details = payload.details;
    }
    if (payload.statusCode) {
      err.statusCode = payload.statusCode;
    } else {
      err.statusCode = res.status;
    }
    err.method = String(method || '');
    throw err;
  }

  return data ? data.result : null;
}
