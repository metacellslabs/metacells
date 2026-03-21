function getActiveCellId(app) {
  return typeof app.getSelectionActiveCellId === 'function'
    ? app.getSelectionActiveCellId()
    : String(app.activeCellId || '').toUpperCase();
}

function getSelectionRangeState(app) {
  return typeof app.getSelectionRange === 'function'
    ? app.getSelectionRange()
    : app.selectionRange;
}

export function clearHeaderSelectionHighlight(app) {
  if (!app || !app.table || !app.table.rows || !app.table.rows.length) return;
  var maxRow = app.table.rows.length - 1;
  var maxCol = app.table.rows[0].cells.length - 1;

  for (var col = 1; col <= maxCol; col++) {
    app.table.rows[0].cells[col].classList.remove(
      'selected-col-header',
      'active-col-header',
    );
  }
  for (var row = 1; row <= maxRow; row++) {
    app.table.rows[row].cells[0].classList.remove(
      'selected-row-header',
      'active-row-header',
    );
  }
  app.table.rows[0].cells[0].classList.remove('selected-corner-header');
}

function forEachSpillFootprintCell(app, sheetId, sourceCellId, callback) {
  if (!app || typeof callback !== 'function') return;
  var normalizedSheetId = String(sheetId || app.activeSheetId || '');
  var normalizedSourceCellId = String(sourceCellId || '').toUpperCase();
  if (!normalizedSheetId || !normalizedSourceCellId) return;
  var entry =
    typeof app.getSpillEntry === 'function'
      ? app.getSpillEntry(normalizedSheetId, normalizedSourceCellId)
      : null;
  if (!entry) return;
  var seen = {};
  var visitCell = function (cellId) {
    var normalizedCellId = String(cellId || '').toUpperCase();
    if (!normalizedCellId || seen[normalizedCellId]) return;
    seen[normalizedCellId] = true;
    var input = app.inputById ? app.inputById[normalizedCellId] : null;
    if (!input || !input.parentElement) return;
    callback(
      input.parentElement,
      normalizedCellId,
      normalizedCellId === normalizedSourceCellId,
    );
  };
  visitCell(normalizedSourceCellId);
  var coveredCellIds = Array.isArray(entry.coveredCellIds)
    ? entry.coveredCellIds
    : [];
  for (var i = 0; i < coveredCellIds.length; i++) {
    visitCell(coveredCellIds[i]);
  }
}

export function clearSpillSelectionHighlight(app) {
  if (!app || !Array.isArray(app.inputs)) return;
  app.inputs.forEach((input) => {
    if (!input || !input.parentElement) return;
    input.parentElement.classList.remove(
      'spill-active-source',
      'spill-active-covered',
      'spill-selected-source',
      'spill-selected-covered',
    );
  });
}

export function clearSelectionVisualState(app) {
  if (!app || !Array.isArray(app.inputs)) return;
  app.inputs.forEach((input) => {
    if (!input || !input.parentElement) return;
    input.parentElement.classList.remove('active-cell', 'selected-range');
  });
  clearSpillSelectionHighlight(app);
  clearHeaderSelectionHighlight(app);
}

export function clearSelectionHighlight(app) {
  clearSelectionVisualState(app);
}

export function applyActiveCellVisualState(app) {
  if (!app) return;
  var activeCellId = getActiveCellId(app);
  if (!activeCellId || !app.inputById) return;
  var input = app.inputById[activeCellId];
  if (!input || !input.parentElement) return;
  input.parentElement.classList.add('active-cell');
}

export function applySelectionRangeVisualState(app) {
  if (!app || !app.table || !app.table.rows || !app.table.rows.length) return;
  var selectionRange = getSelectionRangeState(app);
  if (!selectionRange) return;
  var maxRow = app.table.rows.length - 1;
  var maxCol = app.table.rows[0].cells.length - 1;

  app.inputs.forEach((input) => {
    var parsed = app.parseCellId(input.id);
    if (!parsed) return;
    if (parsed.col < selectionRange.startCol || parsed.col > selectionRange.endCol)
      return;
    if (parsed.row < selectionRange.startRow || parsed.row > selectionRange.endRow)
      return;
    input.parentElement.classList.add('selected-range');
  });

  if (selectionRange.startCol === 1 && selectionRange.endCol === maxCol) {
    for (var row = selectionRange.startRow; row <= selectionRange.endRow; row++) {
      if (row < 1 || row > maxRow) continue;
      app.table.rows[row].cells[0].classList.add('selected-row-header');
    }
  }
  if (selectionRange.startRow === 1 && selectionRange.endRow === maxRow) {
    for (var col = selectionRange.startCol; col <= selectionRange.endCol; col++) {
      if (col < 1 || col > maxCol) continue;
      app.table.rows[0].cells[col].classList.add('selected-col-header');
    }
  }
  if (
    selectionRange.startCol === 1 &&
    selectionRange.endCol === maxCol &&
    selectionRange.startRow === 1 &&
    selectionRange.endRow === maxRow
  ) {
    app.table.rows[0].cells[0].classList.add('selected-corner-header');
  }
}

export function highlightSelectionRange(app) {
  clearSelectionVisualState(app);
  applySelectionRangeVisualState(app);
  applySpillSelectionHighlight(app);
  updateAxisHeaderHighlight(app);
}

export function updateAxisHeaderHighlight(app) {
  if (!app || !app.table || !app.table.rows || !app.table.rows.length) return;
  var maxRow = app.table.rows.length - 1;
  var maxCol = app.table.rows[0].cells.length - 1;

  for (var col = 1; col <= maxCol; col++) {
    app.table.rows[0].cells[col].classList.remove('active-col-header');
  }
  for (var row = 1; row <= maxRow; row++) {
    app.table.rows[row].cells[0].classList.remove('active-row-header');
  }

  var selectionRange = getSelectionRangeState(app);
  if (selectionRange) {
    for (var c = selectionRange.startCol; c <= selectionRange.endCol; c++) {
      if (c < 1 || c > maxCol) continue;
      app.table.rows[0].cells[c].classList.add('active-col-header');
    }
    for (var r = selectionRange.startRow; r <= selectionRange.endRow; r++) {
      if (r < 1 || r > maxRow) continue;
      app.table.rows[r].cells[0].classList.add('active-row-header');
    }
    return;
  }

  var activeCellId = getActiveCellId(app);
  if (!activeCellId) return;
  var parsed = app.parseCellId(activeCellId);
  if (!parsed) return;
  if (parsed.col >= 1 && parsed.col <= maxCol) {
    app.table.rows[0].cells[parsed.col].classList.add('active-col-header');
  }
  if (parsed.row >= 1 && parsed.row <= maxRow) {
    app.table.rows[parsed.row].cells[0].classList.add('active-row-header');
  }
}

export function applySpillSelectionHighlight(app) {
  if (!app || typeof app.getSpillSourceForCell !== 'function') return;
  clearSpillSelectionHighlight(app);

  var activeCellId = getActiveCellId(app);
  if (activeCellId) {
    var activeSourceCellId = app.getSpillSourceForCell(
      app.activeSheetId,
      activeCellId,
    );
    if (activeSourceCellId) {
      forEachSpillFootprintCell(
        app,
        app.activeSheetId,
        activeSourceCellId,
        function (td, cellId, isSource) {
          td.classList.add(
            isSource ? 'spill-active-source' : 'spill-active-covered',
          );
        },
      );
    }
  }

  var selectionRange = getSelectionRangeState(app);
  if (!selectionRange || typeof app.listSpillEntries !== 'function') return;
  var entries = app.listSpillEntries(app.activeSheetId);
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (!entry || !entry.range || !entry.sourceCellId) continue;
    var range = entry.range;
    var intersects =
      range.startCol <= selectionRange.endCol &&
      range.endCol >= selectionRange.startCol &&
      range.startRow <= selectionRange.endRow &&
      range.endRow >= selectionRange.startRow;
    if (!intersects) continue;
    forEachSpillFootprintCell(
      app,
      app.activeSheetId,
      entry.sourceCellId,
      function (td, cellId, isSource) {
        td.classList.add(
          isSource ? 'spill-selected-source' : 'spill-selected-covered',
        );
      },
    );
  }
}
