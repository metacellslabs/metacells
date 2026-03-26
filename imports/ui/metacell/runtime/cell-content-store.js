import { useSyncExternalStore } from 'react';

function normalizeEntry(entry) {
  var source = entry && typeof entry === 'object' ? entry : {};
  return {
    cellId: String(source.cellId || ''),
    html: String(source.html || ''),
    cellClassNames: Array.isArray(source.cellClassNames)
      ? source.cellClassNames
          .map(function (name) {
            return String(name || '').trim();
          })
          .filter(Boolean)
      : [],
    cellBackgroundColor: String(source.cellBackgroundColor || ''),
    outputClassName: String(source.outputClassName || 'cell-output'),
    outputBackgroundColor: String(source.outputBackgroundColor || ''),
    outputFontSize: String(source.outputFontSize || ''),
    outputFontFamily: String(source.outputFontFamily || ''),
    statusHtml: String(source.statusHtml || ''),
    statusClassName: String(source.statusClassName || 'cell-status'),
    statusTitle: String(source.statusTitle || ''),
    scheduleHtml: String(source.scheduleHtml || ''),
    scheduleTitle: String(source.scheduleTitle || ''),
  };
}

function normalizeSnapshot(snapshot) {
  var source = snapshot && typeof snapshot === 'object' ? snapshot : {};
  var next = {};
  var keys = Object.keys(source);
  for (var i = 0; i < keys.length; i++) {
    var key = String(keys[i] || '');
    if (!key) continue;
    next[key] = normalizeEntry(source[key]);
  }
  return next;
}

function notifyListeners(listeners) {
  listeners.forEach(function (listener) {
    try {
      listener();
    } catch (error) {}
  });
}

export function createCellContentStore(initialSnapshot) {
  var currentSnapshot = normalizeSnapshot(initialSnapshot);
  var listeners = new Set();

  return {
    getSnapshot: function () {
      return currentSnapshot;
    },
    subscribe: function (listener) {
      if (typeof listener !== 'function') return function () {};
      listeners.add(listener);
      return function () {
        listeners.delete(listener);
      };
    },
    publishCell: function (cellId, entry) {
      var normalizedCellId = String(cellId || '').toUpperCase();
      if (!normalizedCellId) return currentSnapshot;
      currentSnapshot = {
        ...currentSnapshot,
        [normalizedCellId]: normalizeEntry({
          ...(entry && typeof entry === 'object' ? entry : null),
          cellId: normalizedCellId,
        }),
      };
      notifyListeners(listeners);
      return currentSnapshot;
    },
    resetCell: function (cellId) {
      var normalizedCellId = String(cellId || '').toUpperCase();
      if (!normalizedCellId) return currentSnapshot;
      if (!Object.prototype.hasOwnProperty.call(currentSnapshot, normalizedCellId)) {
        return currentSnapshot;
      }
      var nextSnapshot = { ...currentSnapshot };
      delete nextSnapshot[normalizedCellId];
      currentSnapshot = nextSnapshot;
      notifyListeners(listeners);
      return currentSnapshot;
    },
    clear: function () {
      currentSnapshot = {};
      notifyListeners(listeners);
      return currentSnapshot;
    },
  };
}

export function useCellContentState(store) {
  var fallbackStore = {
    getSnapshot: function () {
      return {};
    },
    subscribe: function () {
      return function () {};
    },
  };
  var targetStore = store || fallbackStore;
  return useSyncExternalStore(
    targetStore.subscribe,
    targetStore.getSnapshot,
    targetStore.getSnapshot,
  );
}
