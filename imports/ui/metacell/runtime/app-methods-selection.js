import {
  ensureActiveCell as ensureActiveCellRuntime,
  clearSelectionRange as clearSelectionRangeRuntime,
  clearSelectionHighlight as clearSelectionHighlightRuntime,
  clearHeaderSelectionHighlight as clearHeaderSelectionHighlightRuntime,
  clearDependencyHighlight as clearDependencyHighlightRuntime,
  applyDependencyHighlight as applyDependencyHighlightRuntime,
  collectDependencyHintsFromRaw as collectDependencyHintsFromRawRuntime,
  setSelectionAnchor as setSelectionAnchorRuntime,
  setSelectionRange as setSelectionRangeRuntime,
  highlightSelectionRange as highlightSelectionRangeRuntime,
  updateAxisHeaderHighlight as updateAxisHeaderHighlightRuntime,
  bindHeaderSelectionEvents as bindHeaderSelectionEventsRuntime,
  startHeaderSelectionDrag as startHeaderSelectionDragRuntime,
  onHeaderSelectionDragMove as onHeaderSelectionDragMoveRuntime,
  applyHeaderSelectionRange as applyHeaderSelectionRangeRuntime,
  selectEntireRow as selectEntireRowRuntime,
  selectEntireColumn as selectEntireColumnRuntime,
  moveSelectionByArrow as moveSelectionByArrowRuntime,
  moveToNextFilledCell as moveToNextFilledCellRuntime,
  getSelectionEdgeInputForDirection as getSelectionEdgeInputForDirectionRuntime,
  extendSelectionRangeTowardCell as extendSelectionRangeTowardCellRuntime,
  findJumpTargetCellId as findJumpTargetCellIdRuntime,
  findAdjacentCellId as findAdjacentCellIdRuntime,
  selectNearestValueRegionFromActive as selectNearestValueRegionFromActiveRuntime,
  selectWholeSheetRegion as selectWholeSheetRegionRuntime,
  cellHasAnyRawValue as cellHasAnyRawValueRuntime,
} from './selection-runtime.js';
import {
  getSelectionStartCellId as getSelectionStartCellIdRuntime,
  getSelectedCellIds as getSelectedCellIdsRuntime,
} from './drag-clipboard-runtime.js';
import { bindDelegatedCellShellEvents as bindDelegatedCellShellEventsRuntime } from './keyboard-cell-shell-runtime.js';
import {
  clearSelectionRangeModel as clearSelectionRangeModelRuntime,
  getSelectionActiveCellId as getSelectionActiveCellIdRuntime,
  getSelectionAnchorCellId as getSelectionAnchorCellIdRuntime,
  getSelectionFillRange as getSelectionFillRangeRuntime,
  getSelectionRangeModel as getSelectionRangeModelRuntime,
  setSelectionActiveCellId as setSelectionActiveCellIdRuntime,
  setSelectionAnchorCellId as setSelectionAnchorCellIdRuntime,
  setSelectionFillRange as setSelectionFillRangeRuntime,
  setSelectionRangeModel as setSelectionRangeModelRuntime,
} from './selection-model.js';

export function installSelectionMethods(SpreadsheetApp) {
  SpreadsheetApp.prototype.setSelectionActiveCellId = function (cellId) {
    return setSelectionActiveCellIdRuntime(this, cellId);
  };

  SpreadsheetApp.prototype.getSelectionActiveCellId = function () {
    return getSelectionActiveCellIdRuntime(this);
  };

  SpreadsheetApp.prototype.setSelectionAnchorCellId = function (cellId) {
    return setSelectionAnchorCellIdRuntime(this, cellId);
  };

  SpreadsheetApp.prototype.getSelectionAnchorCellId = function () {
    return getSelectionAnchorCellIdRuntime(this);
  };

  SpreadsheetApp.prototype.setSelectionRangeState = function (range) {
    return setSelectionRangeModelRuntime(this, range);
  };

  SpreadsheetApp.prototype.getSelectionRange = function () {
    return getSelectionRangeModelRuntime(this);
  };

  SpreadsheetApp.prototype.clearSelectionRangeState = function () {
    return clearSelectionRangeModelRuntime(this);
  };

  SpreadsheetApp.prototype.setSelectionFillRange = function (range) {
    return setSelectionFillRangeRuntime(this, range);
  };

  SpreadsheetApp.prototype.getSelectionFillRange = function () {
    return getSelectionFillRangeRuntime(this);
  };

  SpreadsheetApp.prototype.bindDelegatedCellShellEvents = function () {
    bindDelegatedCellShellEventsRuntime(this);
  };

  SpreadsheetApp.prototype.ensureActiveCell = function () {
    ensureActiveCellRuntime(this);
  };

  SpreadsheetApp.prototype.setSelectionAnchor = function (cellId) {
    setSelectionAnchorRuntime(this, cellId);
  };

  SpreadsheetApp.prototype.clearSelectionRange = function () {
    clearSelectionRangeRuntime(this);
  };

  SpreadsheetApp.prototype.clearSelectionHighlight = function () {
    clearSelectionHighlightRuntime(this);
  };

  SpreadsheetApp.prototype.clearHeaderSelectionHighlight = function () {
    clearHeaderSelectionHighlightRuntime(this);
  };

  SpreadsheetApp.prototype.clearDependencyHighlight = function () {
    clearDependencyHighlightRuntime(this);
  };

  SpreadsheetApp.prototype.applyDependencyHighlight = function () {
    applyDependencyHighlightRuntime(this);
  };

  SpreadsheetApp.prototype.collectDependencyHintsFromRaw = function (rawValue) {
    return collectDependencyHintsFromRawRuntime(this, rawValue);
  };

  SpreadsheetApp.prototype.setSelectionRange = function (anchorId, targetId) {
    setSelectionRangeRuntime(this, anchorId, targetId);
  };

  SpreadsheetApp.prototype.highlightSelectionRange = function () {
    highlightSelectionRangeRuntime(this);
  };

  SpreadsheetApp.prototype.updateAxisHeaderHighlight = function () {
    updateAxisHeaderHighlightRuntime(this);
  };

  SpreadsheetApp.prototype.bindHeaderSelectionEvents = function () {
    bindHeaderSelectionEventsRuntime(this);
  };

  SpreadsheetApp.prototype.startHeaderSelectionDrag = function (mode, anchorIndex) {
    startHeaderSelectionDragRuntime(this, mode, anchorIndex);
  };

  SpreadsheetApp.prototype.onHeaderSelectionDragMove = function (event) {
    onHeaderSelectionDragMoveRuntime(this, event);
  };

  SpreadsheetApp.prototype.applyHeaderSelectionRange = function (
    mode,
    fromIndex,
    toIndex,
  ) {
    applyHeaderSelectionRangeRuntime(this, mode, fromIndex, toIndex);
  };

  SpreadsheetApp.prototype.selectEntireRow = function (startRow, endRow) {
    selectEntireRowRuntime(this, startRow, endRow);
  };

  SpreadsheetApp.prototype.selectEntireColumn = function (startCol, endCol) {
    selectEntireColumnRuntime(this, startCol, endCol);
  };

  SpreadsheetApp.prototype.moveSelectionByArrow = function (currentInput, key) {
    moveSelectionByArrowRuntime(this, currentInput, key);
  };

  SpreadsheetApp.prototype.moveToNextFilledCell = function (currentInput, key) {
    return moveToNextFilledCellRuntime(this, currentInput, key);
  };

  SpreadsheetApp.prototype.getSelectionEdgeInputForDirection = function (
    currentInput,
    key,
  ) {
    return getSelectionEdgeInputForDirectionRuntime(this, currentInput, key);
  };

  SpreadsheetApp.prototype.extendSelectionRangeTowardCell = function (
    targetCellId,
    key,
  ) {
    extendSelectionRangeTowardCellRuntime(this, targetCellId, key);
  };

  SpreadsheetApp.prototype.findJumpTargetCellId = function (startCellId, key) {
    return findJumpTargetCellIdRuntime(this, startCellId, key);
  };

  SpreadsheetApp.prototype.findAdjacentCellId = function (startCellId, key) {
    return findAdjacentCellIdRuntime(this, startCellId, key);
  };

  SpreadsheetApp.prototype.selectNearestValueRegionFromActive = function (input) {
    selectNearestValueRegionFromActiveRuntime(this, input);
  };

  SpreadsheetApp.prototype.selectWholeSheetRegion = function () {
    selectWholeSheetRegionRuntime(this);
  };

  SpreadsheetApp.prototype.cellHasAnyRawValue = function (cellId) {
    return cellHasAnyRawValueRuntime(this, cellId);
  };

  SpreadsheetApp.prototype.getSelectionStartCellId = function () {
    return getSelectionStartCellIdRuntime(this);
  };

  SpreadsheetApp.prototype.getSelectedCellIds = function () {
    return getSelectedCellIdsRuntime(this);
  };
}
