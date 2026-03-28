import {
  DEFAULT_COL_WIDTH,
  DEFAULT_ROW_HEIGHT,
  GRID_COLS,
  GRID_ROWS,
} from './constants.js';
import { GridManager } from './grid-manager.js';

export function refreshGridReferences(app) {
  var detachedRows =
    app && app.detachedRowsByIndex && typeof app.detachedRowsByIndex === 'object'
      ? app.detachedRowsByIndex
      : null;
  var inputs = [];
  var rowCount = Math.max(
    0,
    Number(app.gridRows || (app.grid && app.grid.rows) || 0),
  );
  for (var rowIndex = 1; rowIndex <= rowCount; rowIndex++) {
    var row =
      detachedRows && detachedRows[rowIndex]
        ? detachedRows[rowIndex]
        : app.table && app.table.rows
          ? app.table.rows[rowIndex]
          : null;
    if (!row || typeof row.querySelectorAll !== 'function') continue;
    inputs = inputs.concat(
      [].slice.call(row.querySelectorAll('.cell-anchor-input')),
    );
  }
  app.inputs = inputs;
  app.cellIds = app.inputs.map(function (elm) {
    return elm.id;
  });
  app.inputById = {};
  app.inputs.forEach(function (input) {
    app.inputById[input.id] = input;
  });
  if (app.formulaEngine) app.formulaEngine.cellIds = app.cellIds;
}

export function getMountedInputs(app) {
  if (!app || !app.table || !app.table.rows) return [];
  var inputs = [];
  var rowCount = Math.max(
    0,
    Number(app.gridRows || (app.grid && app.grid.rows) || 0),
  );
  for (var rowIndex = 1; rowIndex <= rowCount; rowIndex++) {
    var row = app.table.rows[rowIndex];
    if (!row || row.dataset.rowPlaceholder === 'true') continue;
    inputs = inputs.concat(
      [].slice.call(row.querySelectorAll('.cell-anchor-input')),
    );
  }
  return inputs;
}

export function forEachInput(app, callback, options) {
  if (!app || typeof callback !== 'function') return;
  var opts = options && typeof options === 'object' ? options : {};
  var inputs = opts.includeDetached ? app.inputs || [] : getMountedInputs(app);
  for (var i = 0; i < inputs.length; i++) callback(inputs[i], i);
}

export function getFirstAvailableInput(app, options) {
  if (!app) return null;
  var opts = options && typeof options === 'object' ? options : {};
  var preferredCellId = String(opts.preferredCellId || '').toUpperCase();
  if (preferredCellId) {
    var preferredInput =
      typeof app.getCellInput === 'function'
        ? app.getCellInput(preferredCellId)
        : app.inputById
          ? app.inputById[preferredCellId]
          : null;
    if (preferredInput) return preferredInput;
  }
  var a1Input =
    typeof app.getCellInput === 'function'
      ? app.getCellInput('A1')
      : app.inputById
        ? app.inputById['A1']
        : null;
  if (a1Input) return a1Input;
  var mountedInputs = getMountedInputs(app);
  if (mountedInputs.length) return mountedInputs[0];
  var allInputs = Array.isArray(app.inputs) ? app.inputs : [];
  return allInputs.length ? allInputs[0] : null;
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
    var sheetEntry = sheets[sheetId] && typeof sheets[sheetId] === 'object' ? sheets[sheetId] : {};
    var sheetRows = Number(sheetEntry.rows && sheetEntry.rows.count) || 0;
    var sheetCols = Number(sheetEntry.cols && sheetEntry.cols.count) || 0;
    if (sheetRows > maxRow) maxRow = sheetRows;
    if (sheetCols > maxCol) maxCol = sheetCols;
    var cells =
      sheetEntry.cells && typeof sheetEntry.cells === 'object'
        ? sheetEntry.cells
        : {};
    for (var cellId in cells) {
      if (!Object.prototype.hasOwnProperty.call(cells, cellId)) continue;
      var match = /^([A-Za-z]+)([0-9]+)$/.exec(String(cellId).toUpperCase());
      if (!match) continue;
      var col = app.formulaEngine.columnLabelToIndex(String(match[1]).toUpperCase());
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
  ensureGridCapacityForBounds(app, bounds.maxRow, bounds.maxCol);
}

export function ensureGridCapacityForCellIds(app, cellIds) {
  var items = Array.isArray(cellIds) ? cellIds : [];
  if (!items.length) return;
  var maxRow = app.gridRows || GRID_ROWS;
  var maxCol = app.gridCols || GRID_COLS;
  for (var i = 0; i < items.length; i++) {
    var match = /^([A-Za-z]+)([0-9]+)$/.exec(String(items[i] || '').toUpperCase());
    if (!match) continue;
    var col = app.formulaEngine.columnLabelToIndex(String(match[1]).toUpperCase());
    var row = parseInt(match[2], 10);
    if (!isNaN(col) && col > maxCol) maxCol = col;
    if (!isNaN(row) && row > maxRow) maxRow = row;
  }
  if (maxRow <= app.gridRows && maxCol <= app.gridCols) return;
  ensureGridCapacityForBounds(app, maxRow, maxCol);
}

function ensureGridCapacityForBounds(app, maxRow, maxCol) {
  if (typeof app.remountAllViewportRows === 'function') {
    app.remountAllViewportRows();
  }

  var previousRows = app.gridRows;
  var previousCols = app.gridCols;
  var nextRows = Math.max(app.gridRows, maxRow);
  var nextCols = Math.max(app.gridCols, maxCol);
  var activeId = String(app.activeCellId || '') || (app.activeInput ? app.activeInput.id : '') || 'A1';

  if (nextCols > previousCols) {
    app.grid.cols = nextCols;
    app.grid.appendColumns(previousCols + 1, nextCols);
  }
  if (nextRows > previousRows) {
    app.grid.rows = nextRows;
    app.grid.appendRows(previousRows + 1, nextRows);
  }
  app.gridRows = nextRows;
  app.gridCols = nextCols;
  app.grid.rows = nextRows;
  app.grid.cols = nextCols;
  app.grid.fitRowHeaderColumnWidth();
  app.grid.stabilizeHeaderMetrics();
  refreshGridReferences(app);
  app.setupColumnSort();
  app.setupGridResizing({
    startColumnIndex: previousCols + 1,
    startRowIndex: previousRows + 1,
  });
  app.bindGridInputEvents();
  app.bindHeaderSelectionEvents();
  app.applyActiveSheetLayout();
  app.updateSortIcons();

  var nextActive = getFirstAvailableInput(app, { preferredCellId: activeId });
  if (nextActive) app.setActiveInput(nextActive);

  if (typeof app.renderCurrentSheetFromStorage === 'function') {
    app.renderCurrentSheetFromStorage();
  }
}
