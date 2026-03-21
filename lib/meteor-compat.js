const isServer = typeof window === 'undefined';

class MeteorError extends Error {
  constructor(type, message, details) {
    super(message || type);
    this.error = type;
    this.reason = message;
    this.details = details;
    this.name = 'Meteor.Error';
  }

  get statusCode() {
    return 400;
  }
}

export const Meteor = {
  isServer,
  isClient: !isServer,
  isDevelopment: typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : true,
  isProduction: typeof process !== 'undefined' ? process.env.NODE_ENV === 'production' : false,

  Error: MeteorError,

  defer(fn) {
    setTimeout(fn, 0);
  },

  setTimeout(fn, ms) {
    return setTimeout(fn, ms);
  },

  setInterval(fn, ms) {
    return setInterval(fn, ms);
  },

  clearTimeout(id) {
    clearTimeout(id);
  },

  clearInterval(id) {
    clearInterval(id);
  },

  absoluteUrl(path) {
    const rootUrl = (typeof process !== 'undefined' && process.env.ROOT_URL) || 'http://localhost:3400';
    return rootUrl.replace(/\/+$/, '') + '/' + String(path || '').replace(/^\/+/, '');
  },

  startup(fn) {
    if (typeof fn === 'function') {
      Meteor._startupQueue.push(fn);
    }
  },

  _startupQueue: [],

  async _runStartupHooks() {
    for (const fn of Meteor._startupQueue) {
      await fn();
    }
    Meteor._startupQueue = [];
  },
};
