import { setPendingAttachmentCell } from './attachment-cell-facade.js';
import { ensureAttachFileInputBinding } from './attachment-picker-facade.js';

function normalizeRenderMode(renderMode) {
  var mode = String(renderMode || '').toLowerCase();
  return mode === 'report' ? 'report' : 'sheet';
}

export function clearAttachmentToPlaceholder(app, options) {
  var opts = options && typeof options === 'object' ? options : {};
  if (!app) return false;
  var sheetId = String(opts.sheetId || '').trim();
  var cellId = String(opts.cellId || '').toUpperCase();
  if (!sheetId || !cellId) return false;
  setPendingAttachmentCell(app, {
    sheetId: sheetId,
    cellId: cellId,
    payload: {
      name: '',
      type: '',
      content: '',
      contentArtifactId: '',
      binaryArtifactId: '',
      downloadUrl: '',
      previewUrl: '',
      pending: true,
      converting: false,
    },
    withHistory: opts.withHistory === true,
    clearComputed: opts.clearComputed === true,
    renderMode: normalizeRenderMode(opts.renderMode),
  });
  return true;
}

export function startAttachmentSelectionFromSource(app, options) {
  var opts = options && typeof options === 'object' ? options : {};
  if (!app) return false;
  if (app.pendingAttachmentContext) return false;
  var sheetId = String(opts.sheetId || '').trim();
  var cellId = String(opts.cellId || '').toUpperCase();
  if (!sheetId || !cellId) return false;
  var renderMode = normalizeRenderMode(opts.renderMode);
  var attachFileInput = ensureAttachFileInputBinding(app);
  if (!attachFileInput) return false;

  var previousValue = String(
    Object.prototype.hasOwnProperty.call(opts, 'previousValue')
      ? opts.previousValue
      : app.storage.getCellValue(sheetId, cellId) || '',
  );

  var pickerToken = String(Date.now()) + ':' + Math.random().toString(36).slice(2);
  app.pendingAttachmentContext = {
    sheetId: sheetId,
    cellId: cellId,
    previousValue: previousValue,
    renderMode: renderMode,
    pickerToken: pickerToken,
  };
  app.pendingAttachmentPickerState = {
    token: pickerToken,
    changeSeen: false,
  };

  if (opts.showPendingPlaceholder !== false) {
    setPendingAttachmentCell(app, {
      sheetId: sheetId,
      cellId: cellId,
      payload: { pending: true },
      renderMode: renderMode,
      withHistory: opts.withHistory === true,
      clearComputed: opts.clearComputed === true,
    });
  }

  attachFileInput.value = '';
  attachFileInput.click();
  return true;
}
