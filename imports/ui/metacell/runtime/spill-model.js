function normalizeCellId(cellId) {
  return String(cellId || '').toUpperCase();
}

function normalizeRange(range) {
  if (!range || typeof range !== 'object') return null;
  if (
    !Number.isFinite(range.startCol) ||
    !Number.isFinite(range.endCol) ||
    !Number.isFinite(range.startRow) ||
    !Number.isFinite(range.endRow)
  ) {
    return null;
  }
  return {
    startCol: Number(range.startCol),
    endCol: Number(range.endCol),
    startRow: Number(range.startRow),
    endRow: Number(range.endRow),
  };
}

function ensureSheetState(model, sheetId) {
  var normalizedSheetId = String(sheetId || '');
  if (!normalizedSheetId) return null;
  if (!model.bySheet[normalizedSheetId]) {
    model.bySheet[normalizedSheetId] = {
      bySource: {},
      coveredToSource: {},
    };
  }
  return model.bySheet[normalizedSheetId];
}

export function ensureSpillModel(app) {
  if (app && app.spillModel) return app.spillModel;
  var model = {
    bySheet: {},
  };
  if (app) app.spillModel = model;
  return model;
}

export function clearSpillSheetState(app, sheetId) {
  var model = ensureSpillModel(app);
  var normalizedSheetId = String(sheetId || '');
  if (!normalizedSheetId) return;
  model.bySheet[normalizedSheetId] = {
    bySource: {},
    coveredToSource: {},
  };
}

export function clearSpillEntriesForRows(app, sheetId, rowIndexes) {
  var model = ensureSpillModel(app);
  var sheetState = ensureSheetState(model, sheetId);
  var rows = Array.isArray(rowIndexes) ? rowIndexes : [];
  if (!sheetState || !rows.length) return;

  var rowsMap = {};
  for (var i = 0; i < rows.length; i++) {
    var rowIndex = Number(rows[i]);
    if (!Number.isFinite(rowIndex) || rowIndex < 1) continue;
    rowsMap[rowIndex] = true;
  }

  var sourceIds = Object.keys(sheetState.bySource);
  for (var sourceIndex = 0; sourceIndex < sourceIds.length; sourceIndex++) {
    var sourceCellId = sourceIds[sourceIndex];
    var entry = sheetState.bySource[sourceCellId];
    var range = entry && entry.range ? entry.range : null;
    if (!range) continue;
    var overlapsDirtyRows = false;
    for (var row = range.startRow; row <= range.endRow; row++) {
      if (rowsMap[row]) {
        overlapsDirtyRows = true;
        break;
      }
    }
    if (!overlapsDirtyRows) continue;
    if (entry && Array.isArray(entry.coveredCellIds)) {
      for (
        var coveredIndex = 0;
        coveredIndex < entry.coveredCellIds.length;
        coveredIndex++
      ) {
        delete sheetState.coveredToSource[entry.coveredCellIds[coveredIndex]];
      }
    }
    delete sheetState.bySource[sourceCellId];
  }
}

export function setSpillEntry(app, sheetId, sourceCellId, payload) {
  var model = ensureSpillModel(app);
  var sheetState = ensureSheetState(model, sheetId);
  var normalizedSourceCellId = normalizeCellId(sourceCellId);
  if (!sheetState || !normalizedSourceCellId) return null;

  var existing = sheetState.bySource[normalizedSourceCellId];
  if (existing && Array.isArray(existing.coveredCellIds)) {
    for (var i = 0; i < existing.coveredCellIds.length; i++) {
      delete sheetState.coveredToSource[existing.coveredCellIds[i]];
    }
  }

  var coveredCellIds = Array.isArray(payload && payload.coveredCellIds)
    ? payload.coveredCellIds.map(normalizeCellId).filter(Boolean)
    : [];
  var entry = {
    kind: String((payload && payload.kind) || 'spill'),
    sourceCellId: normalizedSourceCellId,
    coveredCellIds: coveredCellIds,
    range: normalizeRange(payload && payload.range),
    requiredWidth: Number((payload && payload.requiredWidth) || 0),
    appliedWidth: Number((payload && payload.appliedWidth) || 0),
  };
  sheetState.bySource[normalizedSourceCellId] = entry;
  for (var c = 0; c < coveredCellIds.length; c++) {
    sheetState.coveredToSource[coveredCellIds[c]] = normalizedSourceCellId;
  }
  return entry;
}

export function getSpillEntry(app, sheetId, sourceCellId) {
  var model = ensureSpillModel(app);
  var sheetState = ensureSheetState(model, sheetId);
  var normalizedSourceCellId = normalizeCellId(sourceCellId);
  if (!sheetState || !normalizedSourceCellId) return null;
  return sheetState.bySource[normalizedSourceCellId] || null;
}

export function getSpillSourceForCell(app, sheetId, cellId) {
  var model = ensureSpillModel(app);
  var sheetState = ensureSheetState(model, sheetId);
  var normalizedCellId = normalizeCellId(cellId);
  if (!sheetState || !normalizedCellId) return '';
  if (sheetState.bySource[normalizedCellId]) return normalizedCellId;
  return String(sheetState.coveredToSource[normalizedCellId] || '');
}

export function listSpillEntries(app, sheetId) {
  var model = ensureSpillModel(app);
  var sheetState = ensureSheetState(model, sheetId);
  if (!sheetState) return [];
  return Object.keys(sheetState.bySource).map(function (sourceCellId) {
    return sheetState.bySource[sourceCellId];
  });
}
