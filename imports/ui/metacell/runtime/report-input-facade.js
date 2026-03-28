import {
  applyDocumentCellSource,
  buildCellHistoryKey,
} from './document-cell-facade.js';

export function readLinkedReportInputValue(app, sheetId, cellId) {
  if (!app) return '';
  var targetCellId = String(cellId || '').toUpperCase();
  var raw = app.storage.getCellValue(sheetId, targetCellId);
  if (raw && raw.charAt(0) !== '=' && raw.charAt(0) !== '>') return String(raw);
  return String(app.readCellComputedValue(sheetId, targetCellId) || '');
}

export function applyLinkedReportInputValue(app, options) {
  var opts = options && typeof options === 'object' ? options : {};
  if (!app) return false;
  var sheetId = String(opts.sheetId || '');
  var cellId = String(opts.cellId || '').toUpperCase();
  if (!sheetId || !cellId) return false;
  applyDocumentCellSource(app, {
    sheetId: sheetId,
    cellId: cellId,
    rawValue: String(opts.value == null ? '' : opts.value),
    historyKey: buildCellHistoryKey('report-input', sheetId, cellId),
    clearComputed: true,
    renderMode: 'report',
  });
  return true;
}

export function refreshLinkedReportInputElementValue(app, input) {
  if (!input) return false;
  var sheetId = String(input.dataset.sheetId || '');
  var cellId = String(input.dataset.cellId || '').toUpperCase();
  if (!sheetId || !cellId) return false;
  input.value = readLinkedReportInputValue(app, sheetId, cellId);
  return true;
}
