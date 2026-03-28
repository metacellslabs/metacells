export const isServer = typeof window === 'undefined';
export const isClient = !isServer;
export const isDevelopment =
  typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : true;
export const isProduction =
  typeof process !== 'undefined' ? process.env.NODE_ENV === 'production' : false;

export function defer(fn) {
  setTimeout(fn, 0);
}

export function delay(fn, ms) {
  return setTimeout(fn, ms);
}

export function interval(fn, ms) {
  return setInterval(fn, ms);
}

export function clearDelay(id) {
  clearTimeout(id);
}

export function clearIntervalTimer(id) {
  clearInterval(id);
}

export function absoluteUrl(pathname) {
  const rootUrl =
    (typeof process !== 'undefined' && process.env.ROOT_URL) || 'http://localhost:3400';
  return rootUrl.replace(/\/+$/, '') + '/' + String(pathname || '').replace(/^\/+/, '');
}
