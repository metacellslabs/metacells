import {
  forEachInput as forEachInputRuntime,
  getFirstAvailableInput as getFirstAvailableInputRuntime,
  getMountedInputs as getMountedInputsRuntime,
  applyActiveSheetLayout as applyActiveSheetLayoutRuntime,
  ensureGridCapacityForCellIds as ensureGridCapacityForCellIdsRuntime,
  ensureGridCapacityForStorage as ensureGridCapacityForStorageRuntime,
  getStorageGridBounds as getStorageGridBoundsRuntime,
  refreshGridReferences as refreshGridReferencesRuntime,
} from './grid-dom-runtime.js';
import {
  getCellElementByCoords as getCellElementByCoordsRuntime,
  getCellElementById as getCellElementByIdRuntime,
  getCellInputByCoords as getCellInputByCoordsRuntime,
  getCellInputById as getCellInputByIdRuntime,
  getGridBounds as getGridBoundsRuntime,
  getHeaderCellByIndex as getHeaderCellByIndexRuntime,
  getRowHeaderCellByIndex as getRowHeaderCellByIndexRuntime,
  getTableRowElement as getTableRowElementRuntime,
} from './dom-cell-resolver-runtime.js';
import {
  applyAutoResort as applyAutoResortRuntime,
  compareSortValues as compareSortValuesRuntime,
  getSortState as getSortStateRuntime,
  normalizeSortValue as normalizeSortValueRuntime,
  setupColumnSort as setupColumnSortRuntime,
  setupGridResizing as setupGridResizingRuntime,
  sortRowsByColumn as sortRowsByColumnRuntime,
  toggleSortByColumn as toggleSortByColumnRuntime,
  updateSortIcons as updateSortIconsRuntime,
} from './structure-runtime.js';

export function installGridStructureMethods(SpreadsheetApp) {
  SpreadsheetApp.prototype.setupGridResizing = function () {
    setupGridResizingRuntime(this);
  };

  SpreadsheetApp.prototype.setupColumnSort = function () {
    setupColumnSortRuntime(this);
  };

  SpreadsheetApp.prototype.getSortState = function () {
    return getSortStateRuntime(this);
  };

  SpreadsheetApp.prototype.cellIdFrom = function (colIndex, rowIndex) {
    return this.formatCellId(colIndex, rowIndex);
  };

  SpreadsheetApp.prototype.normalizeSortValue = function (value) {
    return normalizeSortValueRuntime(this, value);
  };

  SpreadsheetApp.prototype.compareSortValues = function (a, b, direction) {
    return compareSortValuesRuntime(this, a, b, direction);
  };

  SpreadsheetApp.prototype.toggleSortByColumn = function (colIndex) {
    toggleSortByColumnRuntime(this, colIndex);
  };

  SpreadsheetApp.prototype.sortRowsByColumn = function (
    colIndex,
    direction,
    skipCompute,
  ) {
    sortRowsByColumnRuntime(this, colIndex, direction, skipCompute);
  };

  SpreadsheetApp.prototype.updateSortIcons = function () {
    updateSortIconsRuntime(this);
  };

  SpreadsheetApp.prototype.applyAutoResort = function () {
    return applyAutoResortRuntime(this);
  };

  SpreadsheetApp.prototype.applyActiveSheetLayout = function () {
    applyActiveSheetLayoutRuntime(this);
  };

  SpreadsheetApp.prototype.refreshGridReferences = function () {
    refreshGridReferencesRuntime(this);
  };

  SpreadsheetApp.prototype.getMountedInputs = function () {
    return getMountedInputsRuntime(this);
  };

  SpreadsheetApp.prototype.forEachInput = function (callback, options) {
    return forEachInputRuntime(this, callback, options);
  };

  SpreadsheetApp.prototype.getFirstAvailableInput = function (options) {
    return getFirstAvailableInputRuntime(this, options);
  };

  SpreadsheetApp.prototype.getStorageGridBounds = function (workbookSnapshot) {
    return getStorageGridBoundsRuntime(this, workbookSnapshot);
  };

  SpreadsheetApp.prototype.ensureGridCapacityForStorage = function (
    workbookSnapshot,
  ) {
    ensureGridCapacityForStorageRuntime(this, workbookSnapshot);
  };

  SpreadsheetApp.prototype.ensureGridCapacityForCellIds = function (cellIds) {
    ensureGridCapacityForCellIdsRuntime(this, cellIds);
  };

  SpreadsheetApp.prototype.getCellInput = function (cellId) {
    return getCellInputByIdRuntime(this, cellId);
  };

  SpreadsheetApp.prototype.getCellElement = function (cellId) {
    return getCellElementByIdRuntime(this, cellId);
  };

  SpreadsheetApp.prototype.getCellInputByCoords = function (rowIndex, colIndex) {
    return getCellInputByCoordsRuntime(this, rowIndex, colIndex);
  };

  SpreadsheetApp.prototype.getCellElementByCoords = function (
    rowIndex,
    colIndex,
  ) {
    return getCellElementByCoordsRuntime(this, rowIndex, colIndex);
  };

  SpreadsheetApp.prototype.getGridBounds = function () {
    return getGridBoundsRuntime(this);
  };

  SpreadsheetApp.prototype.getTableRowElement = function (rowIndex) {
    return getTableRowElementRuntime(this, rowIndex);
  };

  SpreadsheetApp.prototype.getHeaderCell = function (colIndex) {
    return getHeaderCellByIndexRuntime(this, colIndex);
  };

  SpreadsheetApp.prototype.getRowHeaderCell = function (rowIndex) {
    return getRowHeaderCellByIndexRuntime(this, rowIndex);
  };
}
