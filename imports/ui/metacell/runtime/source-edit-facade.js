import { buildCellHistoryKey } from './document-cell-facade.js';
import { runWithHistorySnapshot } from './history-mutation-facade.js';

function syncSourceCellUi(app, cellId, rawValue, inputElement) {
  if (!app) return;
  var normalizedCellId = String(cellId || '').toUpperCase();
  var nextRaw = String(rawValue == null ? '' : rawValue);
  if (inputElement) inputElement.value = nextRaw;
  if (app.activeInput && app.activeInput.id === normalizedCellId && app.formulaInput) {
    app.formulaInput.value = nextRaw;
  }
}

export function applyActiveSourceCellEdit(app, options) {
  var opts = options && typeof options === 'object' ? options : {};
  if (!app || typeof app.setRawCellValue !== 'function') return false;
  var cellId = String(opts.cellId || '').toUpperCase();
  if (!cellId) return false;
  var rawValue = String(opts.rawValue == null ? '' : opts.rawValue);
  var historyKey = String(opts.historyKey || '').trim();
  if (!historyKey && opts.withHistory) {
    historyKey = buildCellHistoryKey(
      String(opts.historyPrefix || 'cell'),
      String(app.activeSheetId || ''),
      cellId,
    );
  }
  runWithHistorySnapshot(app, historyKey, function () {
    app.setRawCellValue(cellId, rawValue, opts.meta);
  });
  syncSourceCellUi(app, cellId, rawValue, opts.inputElement);
  return true;
}

export function resetSheetComputedValueCache(app, sheetId, cellId) {
  var targetSheetId = String(sheetId || '');
  var targetCellId = String(cellId || '').toUpperCase();
  if (!app || !targetSheetId || !targetCellId) return;
  if (!app.computedValuesBySheet || !app.computedValuesBySheet[targetSheetId]) return;
  delete app.computedValuesBySheet[targetSheetId][targetCellId];
}
