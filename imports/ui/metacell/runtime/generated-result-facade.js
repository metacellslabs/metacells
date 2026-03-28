import { resetSheetComputedValueCache } from './source-edit-facade.js';

export function writeGeneratedResultCell(app, options) {
  var opts = options && typeof options === 'object' ? options : {};
  if (!app || !app.storage || typeof app.storage.setCellValue !== 'function') {
    return false;
  }
  var sheetId = String(opts.sheetId || '');
  var cellId = String(opts.cellId || '').toUpperCase();
  if (!sheetId || !cellId) return false;
  resetSheetComputedValueCache(app, sheetId, cellId);
  app.storage.setCellValue(
    sheetId,
    cellId,
    String(opts.rawValue == null ? '' : opts.rawValue),
    {
      generatedBy: String(opts.generatedBy || '').toUpperCase(),
    },
  );
  return true;
}

export function clearGeneratedResultCell(app, options) {
  var opts = options && typeof options === 'object' ? options : {};
  if (!app || !app.storage || typeof app.storage.setCellValue !== 'function') {
    return false;
  }
  var sheetId = String(opts.sheetId || '');
  var cellId = String(opts.cellId || '').toUpperCase();
  if (!sheetId || !cellId) return false;
  resetSheetComputedValueCache(app, sheetId, cellId);
  app.storage.setCellValue(sheetId, cellId, '', { generatedBy: '' });
  return true;
}
