import { getMethodHandler } from './rpc.js';

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

  const res = await fetch('/api/rpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });

  const data = await res.json();

  if (data.error) {
    const err = new Error(data.error);
    if (data.errorType) err.error = data.errorType;
    throw err;
  }

  return data.result;
}
