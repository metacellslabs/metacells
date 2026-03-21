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
