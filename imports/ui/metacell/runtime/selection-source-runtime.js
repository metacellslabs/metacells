function getActiveCellId(app) {
  return typeof app.getSelectionActiveCellId === 'function'
    ? app.getSelectionActiveCellId()
    : String(app.activeCellId || '').toUpperCase();
}

export function resolveSelectionSourceCellId(app, cellId) {
  var normalizedCellId = String(cellId || '').toUpperCase();
  if (!app || !normalizedCellId) return '';
  if (typeof app.getSpillSourceForCell === 'function') {
    var spillSourceCellId = String(
      app.getSpillSourceForCell(app.activeSheetId, normalizedCellId) || '',
    ).toUpperCase();
    if (spillSourceCellId) return spillSourceCellId;
  }
  if (
    app.storage &&
    typeof app.storage.getGeneratedCellSource === 'function'
  ) {
    var generatedSourceCellId = String(
      app.storage.getGeneratedCellSource(app.activeSheetId, normalizedCellId) || '',
    ).toUpperCase();
    if (generatedSourceCellId) return generatedSourceCellId;
  }
  return normalizedCellId;
}

export function resolveSelectionSourceCellIds(app, cellIds) {
  var ids = Array.isArray(cellIds) ? cellIds : [];
  var result = [];
  var seen = Object.create(null);
  for (var i = 0; i < ids.length; i++) {
    var sourceCellId = resolveSelectionSourceCellId(app, ids[i]);
    if (!sourceCellId || seen[sourceCellId]) continue;
    seen[sourceCellId] = true;
    result.push(sourceCellId);
  }
  return result;
}

export function getSelectedSourceCellIds(app) {
  var cellIds =
    app && typeof app.getSelectedCellIds === 'function'
      ? app.getSelectedCellIds()
      : [];
  if (!Array.isArray(cellIds) || !cellIds.length) {
    var activeCellId = getActiveCellId(app);
    if (activeCellId) cellIds = [activeCellId];
    else if (app && app.activeInput && app.activeInput.id) {
      cellIds = [app.activeInput.id];
    }
  }
  return resolveSelectionSourceCellIds(app, cellIds);
}

export function getActiveSourceCellId(app) {
  var activeCellId = getActiveCellId(app);
  if (!activeCellId && app && app.activeInput && app.activeInput.id) {
    activeCellId = String(app.activeInput.id || '').toUpperCase();
  }
  return resolveSelectionSourceCellId(app, activeCellId);
}
