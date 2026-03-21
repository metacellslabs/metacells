export function isEditingCell(app, input) {
  return !!(input && input.classList && input.classList.contains('editing'));
}

export function isDirectTypeKey(app, event) {
  if (!event) return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (!event.key || event.key.length !== 1) return false;
  return true;
}

export function startEditingCell(app, input) {
  if (!input) return;
  app.grid.setEditing(input, true);
  app.editStartRawByCell[input.id] = app.getRawCellValue(input.id);
  app.formulaRefCursorId = input.id;
  app.formulaMentionPreview = null;
  var rawValue = app.getRawCellValue(input.id);
  var attachment = app.parseAttachmentSource(rawValue);
  input.value = attachment ? String(attachment.name || '') : rawValue;
  if (document.activeElement !== input) input.focus();
  app.syncAIDraftLock();
}

export function setActiveInput(app, input) {
  if (app.activeInput && app.activeInput.parentElement) {
    app.activeInput.parentElement.classList.remove('active-cell');
  }
  app.activeInput = input;
  app.activeInput.parentElement.classList.add('active-cell');
  var rawValue = app.getRawCellValue(input.id);
  var attachment = app.parseAttachmentSource(rawValue);
  app.formulaInput.value = attachment
    ? String(attachment.name || '')
    : rawValue;
  if (!app.extendSelectionNav) {
    setSelectionAnchor(app, input.id);
    clearSelectionRange(app);
  }
  updateAxisHeaderHighlight(app);
  applyDependencyHighlight(app);
  app.syncCellNameInput();
  app.syncCellFormatControl();
  app.syncCellPresentationControls();
  app.syncAIDraftLock();
  app.syncAttachButtonState();
}

export function clearActiveInput(app) {
  if (app.activeInput) {
    app.grid.setEditing(app.activeInput, false);
    app.activeInput.parentElement.classList.remove('active-cell');
  }
  app.activeInput = null;
  app.formulaInput.value = '';
  clearSelectionRange(app);
  updateAxisHeaderHighlight(app);
  clearDependencyHighlight(app);
  app.syncCellNameInput();
  app.syncCellFormatControl();
  app.syncCellPresentationControls();
  app.syncAIDraftLock();
  app.syncAttachButtonState();
}

export function ensureActiveCell(app) {
  if (app.isReportActive()) return;
  if (app.activeInput) return;
  var fallback = app.inputById['A1'] || app.inputs[0];
  if (!fallback) return;
  setActiveInput(app, fallback);
  if (document.activeElement !== fallback) {
    fallback.focus();
  }
}

export function setSelectionAnchor(app, cellId) {
  app.selectionAnchorId = String(cellId || '').toUpperCase();
}

export function clearSelectionRange(app) {
  app.selectionRange = null;
  clearSelectionHighlight(app);
  app.syncAttachButtonState();
}

export function clearSelectionHighlight(app) {
  app.inputs.forEach((input) => {
    input.parentElement.classList.remove('selected-range');
  });
  clearHeaderSelectionHighlight(app);
}

export function clearHeaderSelectionHighlight(app) {
  var maxRow = app.table.rows.length - 1;
  var maxCol = app.table.rows[0].cells.length - 1;

  for (var col = 1; col <= maxCol; col++) {
    app.table.rows[0].cells[col].classList.remove('selected-col-header');
    app.table.rows[0].cells[col].classList.remove('active-col-header');
  }
  for (var row = 1; row <= maxRow; row++) {
    app.table.rows[row].cells[0].classList.remove('selected-row-header');
    app.table.rows[row].cells[0].classList.remove('active-row-header');
  }
  app.table.rows[0].cells[0].classList.remove('selected-corner-header');
}

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

  var deps =
    app.storage.getCellDependencies(app.activeSheetId, app.activeInput.id) ||
    {};
  var raw = String(app.getRawCellValue(app.activeInput.id) || '');
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

export function collectDependencyHintsFromRaw(app, rawValue, sheetIdOverride) {
  var raw = String(rawValue || '');
  var targetSheetId = String(sheetIdOverride || app.activeSheetId || '');
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
          addCell(targetSheetId, app.columnIndexToLabel(col) + row);
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
    addCell(targetSheetId, cellId);
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

export function setSelectionRange(app, anchorId, targetId) {
  var source = app.parseCellId(anchorId);
  var target = app.parseCellId(targetId);
  if (!source || !target) {
    clearSelectionRange(app);
    return;
  }

  app.selectionRange = {
    startCol: Math.min(source.col, target.col),
    endCol: Math.max(source.col, target.col),
    startRow: Math.min(source.row, target.row),
    endRow: Math.max(source.row, target.row),
  };
  highlightSelectionRange(app);
  app.syncAttachButtonState();
}

export function highlightSelectionRange(app) {
  clearSelectionHighlight(app);
  if (!app.selectionRange) return;
  var maxRow = app.table.rows.length - 1;
  var maxCol = app.table.rows[0].cells.length - 1;

  app.inputs.forEach((input) => {
    var parsed = app.parseCellId(input.id);
    if (!parsed) return;
    if (
      parsed.col < app.selectionRange.startCol ||
      parsed.col > app.selectionRange.endCol
    )
      return;
    if (
      parsed.row < app.selectionRange.startRow ||
      parsed.row > app.selectionRange.endRow
    )
      return;
    input.parentElement.classList.add('selected-range');
  });

  if (
    app.selectionRange.startCol === 1 &&
    app.selectionRange.endCol === maxCol
  ) {
    for (
      var row = app.selectionRange.startRow;
      row <= app.selectionRange.endRow;
      row++
    ) {
      if (row < 1 || row > maxRow) continue;
      app.table.rows[row].cells[0].classList.add('selected-row-header');
    }
  }
  if (
    app.selectionRange.startRow === 1 &&
    app.selectionRange.endRow === maxRow
  ) {
    for (
      var col = app.selectionRange.startCol;
      col <= app.selectionRange.endCol;
      col++
    ) {
      if (col < 1 || col > maxCol) continue;
      app.table.rows[0].cells[col].classList.add('selected-col-header');
    }
  }
  if (
    app.selectionRange.startCol === 1 &&
    app.selectionRange.endCol === maxCol &&
    app.selectionRange.startRow === 1 &&
    app.selectionRange.endRow === maxRow
  ) {
    app.table.rows[0].cells[0].classList.add('selected-corner-header');
  }
  updateAxisHeaderHighlight(app);
}

export function updateAxisHeaderHighlight(app) {
  var maxRow = app.table.rows.length - 1;
  var maxCol = app.table.rows[0].cells.length - 1;

  for (var col = 1; col <= maxCol; col++) {
    app.table.rows[0].cells[col].classList.remove('active-col-header');
  }
  for (var row = 1; row <= maxRow; row++) {
    app.table.rows[row].cells[0].classList.remove('active-row-header');
  }

  if (app.selectionRange) {
    for (
      var c = app.selectionRange.startCol;
      c <= app.selectionRange.endCol;
      c++
    ) {
      if (c < 1 || c > maxCol) continue;
      app.table.rows[0].cells[c].classList.add('active-col-header');
    }
    for (
      var r = app.selectionRange.startRow;
      r <= app.selectionRange.endRow;
      r++
    ) {
      if (r < 1 || r > maxRow) continue;
      app.table.rows[r].cells[0].classList.add('active-row-header');
    }
    return;
  }

  if (!app.activeInput) return;
  var parsed = app.parseCellId(app.activeInput.id);
  if (!parsed) return;
  if (parsed.col >= 1 && parsed.col <= maxCol)
    app.table.rows[0].cells[parsed.col].classList.add('active-col-header');
  if (parsed.row >= 1 && parsed.row <= maxRow)
    app.table.rows[parsed.row].cells[0].classList.add('active-row-header');
}

export function bindHeaderSelectionEvents(app) {
  var headerRow = app.table.rows[0];
  for (var colIndex = 1; colIndex < headerRow.cells.length; colIndex++) {
    var colHeader = headerRow.cells[colIndex];
    colHeader.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (
        e.target.closest &&
        (e.target.closest('.col-resize-handle') ||
          e.target.closest('.sort-button'))
      )
        return;
      e.preventDefault();
      startHeaderSelectionDrag(app, 'col', e.currentTarget.cellIndex);
    });
  }

  for (var rowIndex = 1; rowIndex < app.table.rows.length; rowIndex++) {
    var rowHeader = app.table.rows[rowIndex].cells[0];
    rowHeader.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest && e.target.closest('.row-resize-handle')) return;
      e.preventDefault();
      startHeaderSelectionDrag(
        app,
        'row',
        e.currentTarget.parentElement.rowIndex,
      );
    });
  }
}

export function startHeaderSelectionDrag(app, mode, anchorIndex) {
  if (mode !== 'row' && mode !== 'col') return;
  if (!anchorIndex || anchorIndex < 1) return;
  app.headerSelectionDrag = {
    mode: mode,
    anchorIndex: anchorIndex,
    targetIndex: anchorIndex,
  };

  applyHeaderSelectionRange(app, mode, anchorIndex, anchorIndex);

  var onMove = (e) => onHeaderSelectionDragMove(app, e);
  var onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    app.headerSelectionDrag = null;
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

export function onHeaderSelectionDragMove(app, event) {
  if (!app.headerSelectionDrag) return;
  var el = document.elementFromPoint(event.clientX, event.clientY);
  if (!el || !el.closest) return;
  var td = el.closest('td');
  if (!td) return;
  var mode = app.headerSelectionDrag.mode;
  var index =
    mode === 'row'
      ? td.parentElement
        ? td.parentElement.rowIndex
        : 0
      : td.cellIndex;
  if (mode === 'row' && td.cellIndex !== 0) return;
  if (mode === 'col' && (!td.parentElement || td.parentElement.rowIndex !== 0))
    return;
  if (index < 1 || index === app.headerSelectionDrag.targetIndex) return;

  app.headerSelectionDrag.targetIndex = index;
  applyHeaderSelectionRange(
    app,
    mode,
    app.headerSelectionDrag.anchorIndex,
    index,
  );
}

export function applyHeaderSelectionRange(app, mode, fromIndex, toIndex) {
  var start = Math.min(fromIndex, toIndex);
  var end = Math.max(fromIndex, toIndex);
  if (mode === 'row') {
    selectEntireRow(app, start, end);
  } else if (mode === 'col') {
    selectEntireColumn(app, start, end);
  }
}

export function selectEntireRow(app, startRow, endRow) {
  var maxCol = app.table.rows[0].cells.length - 1;
  var from = Math.max(1, Math.min(startRow, endRow));
  var to = Math.max(1, Math.max(startRow, endRow));
  var anchorId = app.formatCellId(1, from);
  setSelectionAnchor(app, anchorId);
  app.selectionRange = {
    startCol: 1,
    endCol: maxCol,
    startRow: from,
    endRow: to,
  };
  highlightSelectionRange(app);
  var target = app.inputById[app.formatCellId(1, from)];
  if (target) {
    app.extendSelectionNav = true;
    setActiveInput(app, target);
    app.extendSelectionNav = false;
    target.focus();
  }
}

export function selectEntireColumn(app, startCol, endCol) {
  var maxRow = app.table.rows.length - 1;
  var from = Math.max(1, Math.min(startCol, endCol));
  var to = Math.max(1, Math.max(startCol, endCol));
  var anchorId = app.formatCellId(from, 1);
  setSelectionAnchor(app, anchorId);
  app.selectionRange = {
    startCol: from,
    endCol: to,
    startRow: 1,
    endRow: maxRow,
  };
  highlightSelectionRange(app);
  var target = app.inputById[app.formatCellId(from, 1)];
  if (target) {
    app.extendSelectionNav = true;
    setActiveInput(app, target);
    app.extendSelectionNav = false;
    target.focus();
  }
}

export function moveSelectionByArrow(app, currentInput, key) {
  var parsed = app.parseCellId(currentInput.id);
  if (!parsed) return;
  var movement = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  }[key];
  if (!movement) return;

  var nextCellId = app.formatCellId(
    parsed.col + movement[1],
    parsed.row + movement[0],
  );
  var nextInput = app.inputById[nextCellId];
  if (!nextInput) return;

  var anchor = app.selectionAnchorId || currentInput.id;
  app.extendSelectionNav = true;
  nextInput.focus();
  app.extendSelectionNav = false;
  setSelectionRange(app, anchor, nextInput.id);
}

export function moveToNextFilledCell(app, currentInput, key) {
  if (!currentInput) return false;
  var targetCellId = findJumpTargetCellId(app, currentInput.id, key);
  if (!targetCellId) return null;
  var target = app.inputById[targetCellId];
  if (!target) return null;
  target.focus();
  return target;
}

export function getSelectionEdgeInputForDirection(app, currentInput, key) {
  if (!currentInput || !app.selectionRange) return currentInput;
  var active = app.parseCellId(currentInput.id);
  if (!active) return currentInput;

  var range = app.selectionRange;
  var row = active.row;
  var col = active.col;

  if (key === 'ArrowUp' || key === 'ArrowDown') {
    if (col < range.startCol || col > range.endCol) col = range.startCol;
    row = key === 'ArrowUp' ? range.startRow : range.endRow;
  } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
    if (row < range.startRow || row > range.endRow) row = range.startRow;
    col = key === 'ArrowLeft' ? range.startCol : range.endCol;
  } else {
    return currentInput;
  }

  var edgeCellId = app.formatCellId(col, row);
  return app.inputById[edgeCellId] || currentInput;
}

export function extendSelectionRangeTowardCell(app, targetCellId, key) {
  if (!app.selectionRange) return;
  var target = app.parseCellId(targetCellId);
  if (!target) return;

  var next = {
    startCol: app.selectionRange.startCol,
    endCol: app.selectionRange.endCol,
    startRow: app.selectionRange.startRow,
    endRow: app.selectionRange.endRow,
  };

  if (key === 'ArrowUp') {
    next.startRow = Math.min(next.startRow, target.row);
  } else if (key === 'ArrowDown') {
    next.endRow = Math.max(next.endRow, target.row);
  } else if (key === 'ArrowLeft') {
    next.startCol = Math.min(next.startCol, target.col);
  } else if (key === 'ArrowRight') {
    next.endCol = Math.max(next.endCol, target.col);
  } else {
    return;
  }

  app.selectionRange = next;
  highlightSelectionRange(app);
}

export function findJumpTargetCellId(app, startCellId, key) {
  var parsed = app.parseCellId(startCellId);
  if (!parsed) return null;
  var movement = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  }[key];
  if (!movement) return null;

  var maxRow = app.table.rows.length - 1;
  var maxCol = app.table.rows[0].cells.length - 1;
  var isWithin = (r, c) => r >= 1 && r <= maxRow && c >= 1 && c <= maxCol;
  var isFilled = (r, c) => cellHasAnyRawValue(app, app.formatCellId(c, r));

  var row = parsed.row;
  var col = parsed.col;
  var currentFilled = isFilled(row, col);
  var nextRow = row + movement[0];
  var nextCol = col + movement[1];

  if (
    currentFilled &&
    isWithin(nextRow, nextCol) &&
    isFilled(nextRow, nextCol)
  ) {
    var edgeRow = nextRow;
    var edgeCol = nextCol;
    while (
      isWithin(edgeRow + movement[0], edgeCol + movement[1]) &&
      isFilled(edgeRow + movement[0], edgeCol + movement[1])
    ) {
      edgeRow += movement[0];
      edgeCol += movement[1];
    }
    return app.formatCellId(edgeCol, edgeRow);
  }

  var scanRow = nextRow;
  var scanCol = nextCol;
  var lastWithin = null;
  while (isWithin(scanRow, scanCol)) {
    lastWithin = { row: scanRow, col: scanCol };
    if (isFilled(scanRow, scanCol)) {
      return app.formatCellId(scanCol, scanRow);
    }
    scanRow += movement[0];
    scanCol += movement[1];
  }
  if (lastWithin) {
    return app.formatCellId(lastWithin.col, lastWithin.row);
  }
  return null;
}

export function findAdjacentCellId(app, startCellId, key) {
  var parsed = app.parseCellId(startCellId);
  if (!parsed) return null;
  var movement = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  }[key];
  if (!movement) return null;

  var row = parsed.row + movement[0];
  var col = parsed.col + movement[1];
  var maxRow = app.table.rows.length - 1;
  var maxCol = app.table.rows[0].cells.length - 1;
  if (row < 1 || row > maxRow || col < 1 || col > maxCol) return null;
  return app.formatCellId(col, row);
}

export function selectNearestValueRegionFromActive(app, input) {
  var active = input || app.activeInput;
  if (!active) return;
  var parsed = app.parseCellId(active.id);
  if (!parsed) return;

  var maxRow = app.table.rows.length - 1;
  var maxCol = app.table.rows[0].cells.length - 1;
  var row = parsed.row;
  var col = parsed.col;

  var findNearestInRow = (startCol, step) => {
    for (var c = startCol; c >= 1 && c <= maxCol; c += step) {
      var cellId = app.formatCellId(c, row);
      if (cellHasAnyRawValue(app, cellId)) return c;
    }
    return col;
  };

  var findNearestInCol = (startRow, step) => {
    for (var r = startRow; r >= 1 && r <= maxRow; r += step) {
      var cellId = app.formatCellId(col, r);
      if (cellHasAnyRawValue(app, cellId)) return r;
    }
    return row;
  };

  var leftCol = findNearestInRow(col - 1, -1);
  var rightCol = findNearestInRow(col + 1, 1);
  var topRow = findNearestInCol(row - 1, -1);
  var bottomRow = findNearestInCol(row + 1, 1);

  var startId = app.formatCellId(Math.min(leftCol, col), Math.min(topRow, row));
  var endId = app.formatCellId(
    Math.max(rightCol, col),
    Math.max(bottomRow, row),
  );
  setSelectionAnchor(app, active.id);
  setSelectionRange(app, startId, endId);
}

export function selectWholeSheetRegion(app) {
  var maxRow = app.table.rows.length - 1;
  var maxCol = app.table.rows[0].cells.length - 1;
  if (maxRow < 1 || maxCol < 1) return;

  var startId = app.formatCellId(1, 1);
  var endId = app.formatCellId(maxCol, maxRow);
  var anchor =
    app.activeInput && app.activeInput.id ? app.activeInput.id : startId;
  setSelectionAnchor(app, anchor);
  setSelectionRange(app, startId, endId);
}

export function cellHasAnyRawValue(app, cellId) {
  var raw = app.getRawCellValue(cellId);
  return String(raw == null ? '' : raw).trim() !== '';
}
