function toBase64(value) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf8').toString('base64');
  }

  return btoa(unescape(encodeURIComponent(value)));
}

function fromBase64(value) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64').toString('utf8');
  }

  return decodeURIComponent(escape(atob(value)));
}

export function encodeStorageMap(storage) {
  const source = storage && typeof storage === 'object' ? storage : {};
  const encoded = {};

  Object.keys(source).forEach((key) => {
    encoded[`k:${toBase64(key)}`] = String(source[key] ?? '');
  });

  return encoded;
}

export function decodeStorageMap(storage) {
  const source = storage && typeof storage === 'object' ? storage : {};
  const decoded = {};

  Object.keys(source).forEach((key) => {
    if (key.startsWith('k:')) {
      decoded[fromBase64(key.slice(2))] = String(source[key] ?? '');
      return;
    }

    decoded[key] = String(source[key] ?? '');
  });

  return decoded;
}

export function hasLegacyStorageKeys(storage) {
  const source = storage && typeof storage === 'object' ? storage : {};
  return Object.keys(source).some((key) => !key.startsWith('k:'));
}
