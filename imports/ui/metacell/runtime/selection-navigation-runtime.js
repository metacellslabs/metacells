import { focusGridCellInput } from './grid-cell-runtime.js';
import {
  getSelectionRangeState,
  setSelectionRangeState,
} from './selection-range-facade.js';

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
  focusGridCellInput(nextInput);
  app.extendSelectionNav = false;
  app.setSelectionRange(anchor, nextInput.id);
}

export function moveToNextFilledCell(app, currentInput, key) {
  if (!currentInput) return false;
  var targetCellId = findJumpTargetCellId(app, currentInput.id, key);
  if (!targetCellId) return null;
  var target = app.inputById[targetCellId];
  if (!target) return null;
  focusGridCellInput(target);
  return target;
}

export function getSelectionEdgeInputForDirection(app, currentInput, key) {
  var range = getSelectionRangeState(app);
  if (!currentInput || !range) return currentInput;
  var active = app.parseCellId(currentInput.id);
  if (!active) return currentInput;
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
  var currentRange = getSelectionRangeState(app);
  if (!currentRange) return;
  var target = app.parseCellId(targetCellId);
  if (!target) return;

  var next = {
    startCol: currentRange.startCol,
    endCol: currentRange.endCol,
    startRow: currentRange.startRow,
    endRow: currentRange.endRow,
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
  app.highlightSelectionRange();
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
  app.setSelectionAnchor(active.id);
  app.setSelectionRange(startId, endId);
}

export function selectWholeSheetRegion(app) {
  var maxRow = app.table.rows.length - 1;
  var maxCol = app.table.rows[0].cells.length - 1;
  if (maxRow < 1 || maxCol < 1) return;

  var startId = app.formatCellId(1, 1);
  var endId = app.formatCellId(maxCol, maxRow);
  var anchor =
    app.activeInput && app.activeInput.id ? app.activeInput.id : startId;
  app.setSelectionAnchor(anchor);
  app.setSelectionRange(startId, endId);
}

export function cellHasAnyRawValue(app, cellId) {
  var raw = app.getRawCellValue(cellId);
  return String(raw == null ? '' : raw).trim() !== '';
}
