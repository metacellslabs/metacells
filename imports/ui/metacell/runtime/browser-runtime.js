export function getWindowOrigin() {
  try {
    return String(window.location.origin || '');
  } catch (e) {
    return '';
  }
}

export function writeClipboardText(text) {
  try {
    if (
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      return navigator.clipboard
        .writeText(String(text == null ? '' : text))
        .catch(function () {});
    }
  } catch (e) {}
  return Promise.resolve();
}

export function openExternalWindow(url) {
  try {
    window.open(String(url || ''), '_blank', 'noopener,noreferrer');
  } catch (e) {}
}

export function printWindow() {
  try {
    window.print();
  } catch (e) {}
}
