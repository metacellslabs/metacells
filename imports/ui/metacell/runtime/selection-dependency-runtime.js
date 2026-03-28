export function clearDependencyHighlight(app) {
  app.inputs.forEach((input) => {
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
  if (!app.activeInput) return;

  var activeRaw = String(app.getRawCellValue(app.activeInput.id) || '');
  if (app.parseAttachmentSource(activeRaw)) return;

  var deps =
    app.storage.getCellDependencies(app.activeSheetId, app.activeInput.id) ||
    {};
  var raw = activeRaw;
  if (
    (!Array.isArray(deps.cells) || !deps.cells.length) &&
    (!Array.isArray(deps.namedRefs) || !deps.namedRefs.length) &&
    (!Array.isArray(deps.attachments) || !deps.attachments.length) &&
    raw
  ) {
    deps = collectDependencyHintsFromRaw(app, raw);
  }
  var seen = {};
  var addCell = (sheetId, cellId) => {
    var targetSheetId = String(sheetId || '');
    var targetCellId = String(cellId || '').toUpperCase();
    if (!targetSheetId || !targetCellId || targetSheetId !== app.activeSheetId)
      return;
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

  (Array.isArray(deps.cells) ? deps.cells : []).forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    addCell(entry.sheetId, entry.cellId);
  });

  (Array.isArray(deps.attachments) ? deps.attachments : []).forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    addCell(entry.sheetId, entry.cellId);
  });

  (Array.isArray(deps.namedRefs) ? deps.namedRefs : []).forEach((name) => {
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

export function collectDependencyHintsFromRaw(app, rawValue) {
  var raw = String(rawValue || '');
  var result = {
    cells: [],
    namedRefs: [],
    channelLabels: [],
    attachments: [],
  };
  var seenCells = {};
  var seenNames = {};
  var addCell = (sheetId, cellId) => {
    var targetSheetId = String(sheetId || '');
    var targetCellId = String(cellId || '').toUpperCase();
    if (!targetSheetId || !targetCellId) return;
    var key = targetSheetId + ':' + targetCellId;
    if (seenCells[key]) return;
    seenCells[key] = true;
    result.cells.push({ sheetId: targetSheetId, cellId: targetCellId });
  };
  var addName = (name) => {
    var key = String(name || '').trim();
    if (!key || seenNames[key]) return;
    seenNames[key] = true;
    result.namedRefs.push(key);
  };

  raw.replace(
    /@(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+):([A-Za-z]+[0-9]+)/g,
    (_, quoted, plain, startCellId, endCellId) => {
      var sheetId = app.findSheetIdByName(quoted || plain || '');
      if (!sheetId) return _;
      var start = app.parseCellId(startCellId);
      var end = app.parseCellId(endCellId);
      if (!start || !end) return _;
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
          addCell(sheetId, app.columnIndexToLabel(col) + row);
        }
      }
      return _;
    },
  );

  raw.replace(
    /@([A-Za-z]+[0-9]+):([A-Za-z]+[0-9]+)/g,
    (_, startCellId, endCellId) => {
      var start = app.parseCellId(startCellId);
      var end = app.parseCellId(endCellId);
      if (!start || !end) return _;
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
          addCell(app.activeSheetId, app.columnIndexToLabel(col) + row);
        }
      }
      return _;
    },
  );

  raw.replace(
    /(?:_?@)?(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+)/g,
    (_, quoted, plain, cellId) => {
      var sheetId = app.findSheetIdByName(quoted || plain || '');
      if (sheetId) addCell(sheetId, cellId);
      return _;
    },
  );

  raw.replace(/(?:_?@)?([A-Za-z]+[0-9]+)/g, (_, cellId) => {
    addCell(app.activeSheetId, cellId);
    return _;
  });

  raw.replace(/_?@([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
    var isCellId =
      app.formulaEngine &&
      typeof app.formulaEngine.isExistingCellId === 'function'
        ? app.formulaEngine.isExistingCellId(name)
        : /^[A-Za-z]+[0-9]+$/.test(String(name || ''));
    if (!isCellId) addName(name);
    return _;
  });

  return result;
}
