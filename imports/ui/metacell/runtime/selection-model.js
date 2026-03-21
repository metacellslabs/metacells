export function ensureSelectionModel(app) {
  if (app && app.selectionModel) return app.selectionModel;
  var model = {
    activeCellId: '',
    anchorCellId: '',
    range: null,
    fillRange: null,
  };
  if (app) {
    app.selectionModel = model;
  }
  return model;
}

export function setSelectionActiveCellId(app, cellId) {
  var model = ensureSelectionModel(app);
  var normalized = String(cellId || '').toUpperCase();
  model.activeCellId = normalized;
  if (app) app.activeCellId = normalized;
  return normalized;
}

export function getSelectionActiveCellId(app) {
  var model = ensureSelectionModel(app);
  if (model.activeCellId) return String(model.activeCellId || '').toUpperCase();
  return String((app && app.activeCellId) || '').toUpperCase();
}

export function setSelectionAnchorCellId(app, cellId) {
  var model = ensureSelectionModel(app);
  var normalized = String(cellId || '').toUpperCase();
  model.anchorCellId = normalized;
  if (app) app.selectionAnchorId = normalized || null;
  return normalized;
}

export function getSelectionAnchorCellId(app) {
  var model = ensureSelectionModel(app);
  if (model.anchorCellId) return String(model.anchorCellId || '').toUpperCase();
  return String((app && app.selectionAnchorId) || '').toUpperCase();
}

export function setSelectionRangeModel(app, range) {
  var model = ensureSelectionModel(app);
  var normalized =
    range &&
    typeof range === 'object' &&
    Number.isFinite(range.startCol) &&
    Number.isFinite(range.endCol) &&
    Number.isFinite(range.startRow) &&
    Number.isFinite(range.endRow)
      ? {
          startCol: Number(range.startCol),
          endCol: Number(range.endCol),
          startRow: Number(range.startRow),
          endRow: Number(range.endRow),
        }
      : null;
  model.range = normalized;
  if (app) app.selectionRange = normalized;
  return normalized;
}

export function getSelectionRangeModel(app) {
  var model = ensureSelectionModel(app);
  if (model.range) return model.range;
  return (app && app.selectionRange) || null;
}

export function clearSelectionRangeModel(app) {
  return setSelectionRangeModel(app, null);
}

export function setSelectionFillRange(app, range) {
  var model = ensureSelectionModel(app);
  model.fillRange = range || null;
  if (app) app.fillRange = model.fillRange;
  return model.fillRange;
}

export function getSelectionFillRange(app) {
  var model = ensureSelectionModel(app);
  return model.fillRange || (app && app.fillRange) || null;
}
