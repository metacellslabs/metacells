const startupQueue = [];

export function registerStartupHook(fn) {
  if (typeof fn === 'function') {
    startupQueue.push(fn);
  }
}

export async function runStartupHooks() {
  for (const fn of startupQueue.splice(0, startupQueue.length)) {
    await fn();
  }
}
