export function clearDependencyHighlight(app) {
  if (!app || !Array.isArray(app.inputs) || !app.table || !app.table.rows.length) {
    return;
  }
  app.inputs.forEach((input) => {
    if (!input || !input.parentElement) return;
    input.parentElement.classList.remove('dependency-ref');
  });

  var maxRow = app.table.rows.length - 1;
  var maxCol = app.table.rows[0].cells.length - 1;
  for (var col = 1; col <= maxCol; col++) {
    app.table.rows[0].cells[col].classList.remove('dependency-col-header');
  }
  for (var row = 1; row <= maxRow; row++) {
    app.table.rows[row].cells[0].classList.remove('dependency-row-header');
  }
}

export function applyDependencyHighlight(app) {
  clearDependencyHighlight(app);
  if (!app || !app.activeInput) return;

  var deps =
    app.storage.getCellDependencies(app.activeSheetId, app.activeInput.id) || {};
  var raw = String(app.getRawCellValue(app.activeInput.id) || '');
  if (
    (!Array.isArray(deps.cells) || !deps.cells.length) &&
    (!Array.isArray(deps.namedRefs) || !deps.namedRefs.length) &&
    (!Array.isArray(deps.attachments) || !deps.attachments.length) &&
    raw &&
    typeof app.collectDependencyHintsFromRaw === 'function'
  ) {
    deps = app.collectDependencyHintsFromRaw(raw);
  }

  var seen = {};
  var addCell = function (sheetId, cellId) {
    var targetSheetId = String(sheetId || '');
    var targetCellId = String(cellId || '').toUpperCase();
    if (!targetSheetId || !targetCellId || targetSheetId !== app.activeSheetId) {
      return;
    }
    var key = targetSheetId + ':' + targetCellId;
    if (seen[key]) return;
    seen[key] = true;
    var input = app.inputById[targetCellId];
    if (!input || !input.parentElement) return;
    input.parentElement.classList.add('dependency-ref');
    var parsed = app.parseCellId(targetCellId);
    if (!parsed) return;
    if (parsed.col >= 1 && parsed.col < app.table.rows[0].cells.length) {
      app.table.rows[0].cells[parsed.col].classList.add(
        'dependency-col-header',
      );
    }
    if (parsed.row >= 1 && parsed.row < app.table.rows.length) {
      app.table.rows[parsed.row].cells[0].classList.add(
        'dependency-row-header',
      );
    }
  };

  (Array.isArray(deps.cells) ? deps.cells : []).forEach(function (entry) {
    if (!entry || typeof entry !== 'object') return;
    addCell(entry.sheetId, entry.cellId);
  });

  (Array.isArray(deps.attachments) ? deps.attachments : []).forEach(function (
    entry,
  ) {
    if (!entry || typeof entry !== 'object') return;
    addCell(entry.sheetId, entry.cellId);
  });

  (Array.isArray(deps.namedRefs) ? deps.namedRefs : []).forEach(function (name) {
    var ref = app.storage.resolveNamedCell(name);
    if (!ref || !ref.sheetId) return;
    if (ref.cellId) {
      addCell(ref.sheetId, ref.cellId);
      return;
    }
    if (!ref.startCellId || !ref.endCellId) return;
    var start = app.parseCellId(ref.startCellId);
    var end = app.parseCellId(ref.endCellId);
    if (!start || !end) return;
    for (
      var row = Math.min(start.row, end.row);
      row <= Math.max(start.row, end.row);
      row++
    ) {
      for (
        var col = Math.min(start.col, end.col);
        col <= Math.max(start.col, end.col);
        col++
      ) {
        addCell(ref.sheetId, app.columnIndexToLabel(col) + row);
      }
    }
  });
}
