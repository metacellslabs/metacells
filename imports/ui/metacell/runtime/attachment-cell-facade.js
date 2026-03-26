import {
  applyDocumentCellSource,
  buildCellHistoryKey,
} from './document-cell-facade.js';

function getVisibleSheetId(app) {
  return typeof app.getVisibleSheetId === 'function'
    ? String(app.getVisibleSheetId() || '')
    : String(app.activeSheetId || '');
}

export function resolveCellAttachment(app, sheetId, cellId) {
  if (!app || !cellId) return null;
  var targetSheetId = String(sheetId || getVisibleSheetId(app) || '');
  var targetCellId = String(cellId || '').toUpperCase();
  if (!targetSheetId || !targetCellId) return null;
  return (
    app.parseAttachmentSource(app.storage.getCellValue(targetSheetId, targetCellId)) ||
    app.parseAttachmentSource(
      app.storage.getCellComputedValue(targetSheetId, targetCellId),
    ) ||
    app.parseAttachmentSource(
      app.storage.getCellDisplayValue(targetSheetId, targetCellId),
    )
  );
}

export function setPendingAttachmentCell(app, options) {
  var opts = options && typeof options === 'object' ? options : {};
  if (!app) return false;
  var sheetId = String(opts.sheetId || getVisibleSheetId(app) || '');
  var cellId = String(opts.cellId || '').toUpperCase();
  if (!sheetId || !cellId) return false;
  var payload =
    opts.payload && typeof opts.payload === 'object' ? opts.payload : {};
  return applyDocumentCellSource(app, {
    sheetId: sheetId,
    cellId: cellId,
    rawValue: app.buildAttachmentSource(payload),
    historyKey: opts.withHistory
      ? buildCellHistoryKey('attachment', sheetId, cellId)
      : '',
    clearComputed: opts.clearComputed === true,
    renderMode: opts.renderMode || 'none',
  });
}

export function setResolvedAttachmentCell(app, options) {
  var opts = options && typeof options === 'object' ? options : {};
  if (!app) return false;
  var sheetId = String(opts.sheetId || getVisibleSheetId(app) || '');
  var cellId = String(opts.cellId || '').toUpperCase();
  if (!sheetId || !cellId) return false;
  var payload =
    opts.payload && typeof opts.payload === 'object' ? opts.payload : {};
  return applyDocumentCellSource(app, {
    sheetId: sheetId,
    cellId: cellId,
    rawValue: app.buildAttachmentSource(payload),
    historyKey:
      opts.withHistory === false
        ? ''
        : buildCellHistoryKey('attachment', sheetId, cellId),
    clearComputed: opts.clearComputed === true,
    renderMode: opts.renderMode || 'none',
  });
}

export function restoreAttachmentCellSource(app, options) {
  var opts = options && typeof options === 'object' ? options : {};
  if (!app) return false;
  return applyDocumentCellSource(app, {
    sheetId: opts.sheetId,
    cellId: opts.cellId,
    rawValue: String(opts.rawValue == null ? '' : opts.rawValue),
    clearComputed: opts.clearComputed === true,
    renderMode: opts.renderMode || 'none',
  });
}
