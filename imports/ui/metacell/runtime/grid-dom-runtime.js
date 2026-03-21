import {
  DEFAULT_COL_WIDTH,
  DEFAULT_ROW_HEIGHT,
  GRID_COLS,
  GRID_ROWS,
} from './constants.js';
import { GridManager } from './grid-manager.js';

export function applyViewMode(app) {
  var isReport = app.isReportActive();
  app.tableWrap.style.display = isReport ? 'none' : '';
  app.reportWrap.style.display = isReport ? '' : 'none';
}

export function applyActiveSheetLayout(app) {
  if (app.isReportActive()) return;
  app.grid.applySavedSizes(
    (colIndex) => app.storage.getColumnWidth(app.activeSheetId, colIndex),
    (rowIndex) => app.storage.getRowHeight(app.activeSheetId, rowIndex),
  );
}

export function refreshGridReferences(app) {
  app.inputs = app.grid.getInputs();
  app.cellIds = app.inputs.map(function (elm) {
    return elm.id;
  });
  app.inputById = {};
  app.inputs.forEach((input) => {
    app.inputById[input.id] = input;
  });
  if (app.formulaEngine) app.formulaEngine.cellIds = app.cellIds;
}

export function getStorageGridBounds(app, workbookSnapshot) {
  var maxRow = app.gridRows || GRID_ROWS;
  var maxCol = app.gridCols || GRID_COLS;
  var workbook = workbookSnapshot || {};
  var sheets =
    workbook &&
    typeof workbook === 'object' &&
    workbook.sheets &&
    typeof workbook.sheets === 'object'
      ? workbook.sheets
      : {};
  for (var sheetId in sheets) {
    if (!Object.prototype.hasOwnProperty.call(sheets, sheetId)) continue;
    var cells =
      sheets[sheetId] &&
      sheets[sheetId].cells &&
      typeof sheets[sheetId].cells === 'object'
        ? sheets[sheetId].cells
        : {};
    for (var cellId in cells) {
      if (!Object.prototype.hasOwnProperty.call(cells, cellId)) continue;
      var match = /^([A-Za-z]+)([0-9]+)$/.exec(String(cellId).toUpperCase());
      if (!match) continue;
      var col = app.formulaEngine.columnLabelToIndex(
        String(match[1]).toUpperCase(),
      );
      var row = parseInt(match[2], 10);
      if (!isNaN(col) && col > maxCol) maxCol = col;
      if (!isNaN(row) && row > maxRow) maxRow = row;
    }
  }
  return { maxRow: maxRow, maxCol: maxCol };
}

export function ensureGridCapacityForStorage(app, workbookSnapshot) {
  var bounds = getStorageGridBounds(app, workbookSnapshot);
  if (bounds.maxRow <= app.gridRows && bounds.maxCol <= app.gridCols) return;

  var nextRows = Math.max(app.gridRows, bounds.maxRow);
  var nextCols = Math.max(app.gridCols, bounds.maxCol);
  var activeId =
    String(app.activeCellId || '') ||
    (app.activeInput ? app.activeInput.id : '') ||
    'A1';

  app.gridRows = nextRows;
  app.gridCols = nextCols;
  app.table.innerHTML = '';
  app.grid = new GridManager(
    app.table,
    app.gridRows,
    app.gridCols,
    DEFAULT_COL_WIDTH,
    DEFAULT_ROW_HEIGHT,
  );
  if (typeof app.handleGridEditingStateChange === 'function') {
    app.grid.onEditingStateChange = function (input, editing) {
      app.handleGridEditingStateChange(input, editing);
    };
  }
  refreshGridReferences(app);
  app.setupColumnSort();
  app.setupGridResizing();
  app.bindGridInputEvents();
  app.bindHeaderSelectionEvents();
  applyActiveSheetLayout(app);
  app.updateSortIcons();

  var nextActive =
    app.inputById[activeId] || app.inputById['A1'] || app.inputs[0];
  if (nextActive) app.setActiveInput(nextActive);

  if (typeof app.renderCurrentSheetFromStorage === 'function') {
    app.renderCurrentSheetFromStorage();
  }
}
