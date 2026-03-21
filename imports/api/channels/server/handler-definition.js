function noopResult() {
  return { ok: true };
}

async function noopNormalizeEvent() {
  return { event: '', message: null };
}

async function noopSearch({ query }) {
  return {
    ok: true,
    query: String(query || ''),
    source: 'none',
    total: 0,
    items: [],
  };
}

function normalizeCapabilities(source) {
  const capabilities = source && typeof source === 'object' ? source : {};
  return {
    test: capabilities.test !== false,
    send: !!capabilities.send,
    receive: !!capabilities.receive,
    subscribe: !!capabilities.subscribe,
    poll: !!capabilities.poll,
    normalizeEvent: !!capabilities.normalizeEvent,
    search: capabilities.search !== false,
    attachments: !!capabilities.attachments,
    oauth: !!capabilities.oauth,
    actions: Array.isArray(capabilities.actions)
      ? capabilities.actions.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    entities: Array.isArray(capabilities.entities)
      ? capabilities.entities.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
  };
}

export function defineChannelHandler(definition) {
  const source = definition && typeof definition === 'object' ? definition : {};
  const id = String(source.id || '').trim();
  if (!id) {
    throw new Error('Channel handler definition requires an id');
  }

  return {
    id,
    name: String(source.name || id).trim(),
    summary: String(source.summary || '').trim(),
    docs: Array.isArray(source.docs)
      ? source.docs.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    popularMethods: Array.isArray(source.popularMethods)
      ? source.popularMethods
          .map((item) => String(item || '').trim())
          .filter(Boolean)
      : [],
    capabilities: normalizeCapabilities(source.capabilities),
    testConnection:
      typeof source.testConnection === 'function'
        ? source.testConnection
        : noopResult,
    send: typeof source.send === 'function' ? source.send : null,
    poll: typeof source.poll === 'function' ? source.poll : null,
    subscribe: typeof source.subscribe === 'function' ? source.subscribe : null,
    normalizeEvent:
      typeof source.normalizeEvent === 'function'
        ? source.normalizeEvent
        : noopNormalizeEvent,
    search: typeof source.search === 'function' ? source.search : noopSearch,
  };
}
