import { focusCellProxy as focusCellProxyRuntime } from './grid-focus-runtime.js';
import {
  applyDependencyHighlight,
  clearDependencyHighlight,
} from './dependency-visual-runtime.js';
import {
  applyActiveCellVisualState,
  applySpillSelectionHighlight,
  clearSelectionVisualState,
  clearSpillSelectionHighlight,
  highlightSelectionRange,
  updateAxisHeaderHighlight,
} from './selection-visual-runtime.js';

function getActiveCellId(app) {
  return typeof app.getSelectionActiveCellId === 'function'
    ? app.getSelectionActiveCellId()
    : String(app.activeCellId || '').toUpperCase();
}

function getAnchorCellId(app) {
  return typeof app.getSelectionAnchorCellId === 'function'
    ? app.getSelectionAnchorCellId()
    : String(app.selectionAnchorId || '').toUpperCase();
}

function getSelectionRangeState(app) {
  return typeof app.getSelectionRange === 'function'
    ? app.getSelectionRange()
    : app.selectionRange;
}

function setSelectionRangeState(app, range) {
  if (typeof app.setSelectionRangeState === 'function') {
    app.setSelectionRangeState(range);
    return;
  }
  app.selectionRange = range || null;
}

export function isEditingCell(app, input) {
  if (!input) return false;
  if (app.editingSession && app.editingSession.cellId) {
    return !!(
      app.editingSession.sheetId === String(app.activeSheetId || '') &&
      app.editingSession.cellId === String(input.id || '').toUpperCase()
    );
  }
  return !!(input.classList && input.classList.contains('editing'));
}

export function isDirectTypeKey(app, event) {
  if (!event) return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (!event.key || event.key.length !== 1) return false;
  return true;
}

export function getDirectTypeValue(app, event) {
  if (!isDirectTypeKey(app, event)) return '';
  if (event && event.key === ' ' && event.code && event.code !== 'Space') {
    var fallbackByCode = {
      Equal: event.shiftKey ? '+' : '=',
      Minus: event.shiftKey ? '_' : '-',
      Digit0: event.shiftKey ? '=' : '0',
    };
    if (Object.prototype.hasOwnProperty.call(fallbackByCode, event.code)) {
      return fallbackByCode[event.code];
    }
  }
  if (event && event.key === ' ' && event.code === 'Equal') {
    return event.shiftKey ? '+' : '=';
  }
  return String(event.key || '');
}

export function startEditingCell(app, input) {
  if (!input) return;
  if (typeof app.enterCellEditing === 'function') {
    app.enterCellEditing(input, { origin: 'cell' });
  }
}

export function setActiveInput(app, input) {
  app.activeInput = input;
  if (typeof app.setSelectionActiveCellId === 'function') {
    app.setSelectionActiveCellId(input.id);
  } else {
    app.activeCellId = String(input.id || '').toUpperCase();
  }
  var rawValue = app.getRawCellValue(input.id);
  var attachment = app.parseAttachmentSource(rawValue);
  var editingDraft = app.getEditingSessionDraft(input.id);
  var displayValue =
    editingDraft != null
      ? editingDraft
      : attachment
        ? String(attachment.name || '')
        : rawValue;
  if (typeof app.syncActiveEditorValue === 'function') {
    app.syncActiveEditorValue(displayValue, { syncOverlay: false });
  } else {
    app.formulaInput.value = displayValue;
  }
  if (!app.extendSelectionNav) {
    setSelectionAnchor(app, input.id);
    clearSelectionRange(app);
  }
  applyActiveCellVisualState(app);
  updateAxisHeaderHighlight(app);
  applyDependencyHighlight(app);
  applySpillSelectionHighlight(app);
  app.syncCellNameInput();
  app.syncCellFormatControl();
  app.syncCellPresentationControls();
  app.syncAIDraftLock();
  app.syncAttachButtonState();
  if (typeof app.syncEditorOverlay === 'function') app.syncEditorOverlay();
}

export function clearActiveInput(app) {
  if (app.activeInput) {
    app.grid.setEditing(app.activeInput, false);
    app.clearEditingSession(app.activeInput.id);
  }
  app.activeInput = null;
  if (typeof app.setSelectionActiveCellId === 'function') {
    app.setSelectionActiveCellId('');
  } else {
    app.activeCellId = '';
  }
  if (app.formulaInput) app.formulaInput.value = '';
  if (app.editorOverlayInput) app.editorOverlayInput.value = '';
  clearSelectionVisualState(app);
  clearSelectionRange(app);
  updateAxisHeaderHighlight(app);
  clearDependencyHighlight(app);
  clearSpillSelectionHighlight(app);
  app.syncCellNameInput();
  app.syncCellFormatControl();
  app.syncCellPresentationControls();
  app.syncAIDraftLock();
  app.syncAttachButtonState();
  if (typeof app.hideEditorOverlay === 'function') app.hideEditorOverlay();
}

export function ensureActiveCell(app) {
  if (app.isReportActive()) return;
  if (app.getActiveCellInput && app.getActiveCellInput()) return;
  var activeCellId = getActiveCellId(app);
  var fallback =
    (activeCellId && app.inputById[activeCellId]) ||
    (app.activeCellId && app.inputById[app.activeCellId]) ||
    app.inputById['A1'] ||
    app.inputs[0];
  if (!fallback) return;
  setActiveInput(app, fallback);
  focusCellProxyRuntime(app, fallback);
}

export function setSelectionAnchor(app, cellId) {
  if (typeof app.setSelectionAnchorCellId === 'function') {
    app.setSelectionAnchorCellId(cellId);
    return;
  }
  app.selectionAnchorId = String(cellId || '').toUpperCase();
}

export function clearSelectionRange(app) {
  if (typeof app.clearSelectionRangeState === 'function') {
    app.clearSelectionRangeState();
  } else {
    app.selectionRange = null;
  }
  clearSelectionVisualState(app);
  app.syncAttachButtonState();
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

  var nextRange = {
    startCol: Math.min(source.col, target.col),
    endCol: Math.max(source.col, target.col),
    startRow: Math.min(source.row, target.row),
    endRow: Math.max(source.row, target.row),
  };
  setSelectionRangeState(app, nextRange);
  highlightSelectionRange(app);
  app.syncAttachButtonState();
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
  var nextRange = {
    startCol: 1,
    endCol: maxCol,
    startRow: from,
    endRow: to,
  };
  setSelectionRangeState(app, nextRange);
  highlightSelectionRange(app);
  var target = app.inputById[app.formatCellId(1, from)];
  if (target) {
    app.extendSelectionNav = true;
    setActiveInput(app, target);
    app.extendSelectionNav = false;
    focusCellProxyRuntime(app, target);
  }
}

export function selectEntireColumn(app, startCol, endCol) {
  var maxRow = app.table.rows.length - 1;
  var from = Math.max(1, Math.min(startCol, endCol));
  var to = Math.max(1, Math.max(startCol, endCol));
  var anchorId = app.formatCellId(from, 1);
  setSelectionAnchor(app, anchorId);
  var nextRange = {
    startCol: from,
    endCol: to,
    startRow: 1,
    endRow: maxRow,
  };
  setSelectionRangeState(app, nextRange);
  highlightSelectionRange(app);
  var target = app.inputById[app.formatCellId(from, 1)];
  if (target) {
    app.extendSelectionNav = true;
    setActiveInput(app, target);
    app.extendSelectionNav = false;
    focusCellProxyRuntime(app, target);
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

  var anchor = getAnchorCellId(app) || currentInput.id;
  app.extendSelectionNav = true;
  focusCellProxyRuntime(app, nextInput);
  app.extendSelectionNav = false;
  setSelectionRange(app, anchor, nextInput.id);
}

export function moveToNextFilledCell(app, currentInput, key) {
  if (!currentInput) return false;
  var targetCellId = findJumpTargetCellId(app, currentInput.id, key);
  if (!targetCellId) return null;
  var target = app.inputById[targetCellId];
  if (!target) return null;
  focusCellProxyRuntime(app, target);
  return target;
}

export function getSelectionEdgeInputForDirection(app, currentInput, key) {
  var selectionRange = getSelectionRangeState(app);
  if (!currentInput || !selectionRange) return currentInput;
  var active = app.parseCellId(currentInput.id);
  if (!active) return currentInput;

  var range = selectionRange;
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
  var selectionRange = getSelectionRangeState(app);
  if (!selectionRange) return;
  var target = app.parseCellId(targetCellId);
  if (!target) return;

  var next = {
    startCol: selectionRange.startCol,
    endCol: selectionRange.endCol,
    startRow: selectionRange.startRow,
    endRow: selectionRange.endRow,
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

  setSelectionRangeState(app, next);
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
