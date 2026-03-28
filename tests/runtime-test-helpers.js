import { invokeMethod } from '../lib/rpc.js';
import { delay, isClient, isServer } from '../lib/runtime-env.js';

export { isClient, isServer };

export function invokeRpc(name, ...args) {
  return invokeMethod(name, ...args);
}

export function tick() {
  return new Promise((resolve) => delay(resolve, 0));
}
