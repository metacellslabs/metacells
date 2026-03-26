import { runWithHistorySnapshot } from './history-mutation-facade.js';

function getRenderMode(options) {
  var opts = options && typeof options === 'object' ? options : {};
  return String(opts.renderMode || 'none').toLowerCase();
}

export function buildCellHistoryKey(prefix, sheetId, cellId) {
  return (
    String(prefix || 'cell') +
    ':' +
    String(sheetId || '') +
    ':' +
    String(cellId || '').toUpperCase()
  );
}

export function applyDocumentCellSource(app, options) {
  var opts = options && typeof options === 'object' ? options : {};
  if (!app) return false;
  var sheetId = String(opts.sheetId || app.activeSheetId || '');
  var cellId = String(opts.cellId || '').toUpperCase();
  if (!sheetId || !cellId) return false;
  var rawValue = String(opts.rawValue == null ? '' : opts.rawValue);
  var meta =
    opts.meta && typeof opts.meta === 'object' ? opts.meta : opts.meta;
  var historyKey = String(opts.historyKey || '').trim();
  var clearComputed = opts.clearComputed === true;
  var renderMode = getRenderMode(opts);

  if (typeof app.applyRawCellUpdate !== 'function') return false;
  runWithHistorySnapshot(app, historyKey, function () {
    app.applyRawCellUpdate(sheetId, cellId, rawValue, meta);
  });

  if (clearComputed && app.computedValuesBySheet && app.computedValuesBySheet[sheetId]) {
    delete app.computedValuesBySheet[sheetId][cellId];
  }

  if (renderMode === 'sheet') {
    if (typeof app.renderCurrentSheetFromStorage === 'function') {
      app.renderCurrentSheetFromStorage();
    }
    return true;
  }
  if (renderMode === 'report') {
    if (typeof app.renderReportLiveValues === 'function') {
      app.renderReportLiveValues(true);
    }
  }
  return true;
}
