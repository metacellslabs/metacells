function ensureComputedCache(app, sheetId) {
  if (!app || !sheetId) return null;
  if (!app.computedValuesBySheet[sheetId]) {
    app.computedValuesBySheet[sheetId] = {};
  }
  return app.computedValuesBySheet[sheetId];
}

export function applyPendingRuntimeState(app, options) {
  var opts = options && typeof options === 'object' ? options : {};
  if (!app || !app.storage) return false;
  var sheetId = String(opts.sheetId || app.activeSheetId || '');
  var cellId = String(opts.cellId || '').toUpperCase();
  if (!sheetId || !cellId) return false;
  var placeholder = String(opts.placeholder == null ? '...' : opts.placeholder);
  app.storage.setCellRuntimeState(sheetId, cellId, {
    value: placeholder,
    displayValue: placeholder,
    state: String(opts.state || 'pending'),
    error: String(opts.error || ''),
  });
  var cache = ensureComputedCache(app, sheetId);
  if (cache) cache[cellId] = placeholder;
  return true;
}

export function applyResolvedRuntimeState(app, options) {
  var opts = options && typeof options === 'object' ? options : {};
  if (!app || !app.storage) return false;
  var sheetId = String(opts.sheetId || app.activeSheetId || '');
  var cellId = String(opts.cellId || '').toUpperCase();
  if (!sheetId || !cellId) return false;
  var value = String(opts.value == null ? '' : opts.value);
  var displayValue = Object.prototype.hasOwnProperty.call(opts, 'displayValue')
    ? String(opts.displayValue == null ? '' : opts.displayValue)
    : value;
  app.storage.setCellRuntimeState(sheetId, cellId, {
    value: value,
    displayValue: displayValue,
    state: String(opts.state || 'resolved'),
    error: String(opts.error || ''),
  });
  var cache = ensureComputedCache(app, sheetId);
  if (cache) cache[cellId] = value;
  return true;
}

export function applyErrorRuntimeState(app, options) {
  var opts = options && typeof options === 'object' ? options : {};
  if (!app || !app.storage) return false;
  var sheetId = String(opts.sheetId || app.activeSheetId || '');
  var cellId = String(opts.cellId || '').toUpperCase();
  if (!sheetId || !cellId) return false;
  var value = String(opts.value == null ? '#ERROR' : opts.value);
  var displayValue = Object.prototype.hasOwnProperty.call(opts, 'displayValue')
    ? String(opts.displayValue == null ? '' : opts.displayValue)
    : value;
  app.storage.setCellRuntimeState(sheetId, cellId, {
    value: value,
    displayValue: displayValue,
    state: 'error',
    error: String(opts.error || value),
  });
  var cache = ensureComputedCache(app, sheetId);
  if (cache) cache[cellId] = value;
  return true;
}

export function restoreRuntimeStateSnapshot(app, entry) {
  var source = entry && typeof entry === 'object' ? entry : null;
  if (!app || !source || !source.sheetId || !source.cellId) return false;
  app.storage.setCellRuntimeState(source.sheetId, source.cellId, {
    value: source.value,
    displayValue: source.displayValue,
    state: source.state,
    error: source.error,
  });
  return true;
}
