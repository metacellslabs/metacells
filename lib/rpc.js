const methods = {};

export function registerMethods(defs) {
  Object.assign(methods, defs);
}

export function getMethodHandler(name) {
  return methods[name] || null;
}

export function getRegisteredMethodNames() {
  return Object.keys(methods);
}

export function getRegisteredMethods() {
  return { ...methods };
}

export async function invokeMethod(name, ...args) {
  const handler = getMethodHandler(name);
  if (!handler) {
    throw new Error(`Unknown method: ${String(name || '')}`);
  }
  return handler(...args);
}
