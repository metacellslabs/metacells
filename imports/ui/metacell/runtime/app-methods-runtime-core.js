import {
  ensureFloatingAttachmentPreview as ensureFloatingAttachmentPreviewRuntime,
  hideAttachmentContentOverlay as hideAttachmentContentOverlayRuntime,
  hideFloatingAttachmentPreview as hideFloatingAttachmentPreviewRuntime,
  openAttachmentContentPreview as openAttachmentContentPreviewRuntime,
  positionFloatingAttachmentPreview as positionFloatingAttachmentPreviewRuntime,
  setupAttachmentLinkPreview as setupAttachmentLinkPreviewRuntime,
  showFloatingAttachmentPreview as showFloatingAttachmentPreviewRuntime,
} from './attachment-preview-runtime.js';
import {
  applyRightOverflowText as applyRightOverflowTextRuntime,
  computeAll as computeAllRuntime,
  getRenderTargetsForComputeResult as getRenderTargetsForComputeResultRuntime,
  hasUncomputedCells as hasUncomputedCellsRuntime,
  measureOutputRequiredWidth as measureOutputRequiredWidthRuntime,
  refreshVisibleSheetFromServer as refreshVisibleSheetFromServerRuntime,
  startUncomputedMonitor as startUncomputedMonitorRuntime,
  renderCurrentSheetFromStorage as renderCurrentSheetFromStorageRuntime,
} from './compute-runtime.js';
import {
  clearActiveInput as clearActiveInputRuntime,
  setActiveInput as setActiveInputRuntime,
} from './selection-runtime.js';
import { readLinkedInputValue as readLinkedInputValueRuntime } from './report-runtime.js';
import { findSheetIdByName as findSheetIdByNameRuntime } from './formula-mention-runtime.js';

export function installRuntimeCoreMethods(SpreadsheetApp) {
  SpreadsheetApp.prototype.setActiveInput = function (input) {
    setActiveInputRuntime(this, input);
  };

  SpreadsheetApp.prototype.clearActiveInput = function () {
    clearActiveInputRuntime(this);
  };

  SpreadsheetApp.prototype.ensureFloatingAttachmentPreview = function () {
    return ensureFloatingAttachmentPreviewRuntime(this);
  };

  SpreadsheetApp.prototype.openAttachmentContentPreview = function (
    sheetId,
    cellId,
  ) {
    return openAttachmentContentPreviewRuntime(this, sheetId, cellId);
  };

  SpreadsheetApp.prototype.hideAttachmentContentOverlay = function () {
    hideAttachmentContentOverlayRuntime(this);
  };

  SpreadsheetApp.prototype.setupAttachmentLinkPreview = function () {
    setupAttachmentLinkPreviewRuntime(this);
  };

  SpreadsheetApp.prototype.showFloatingAttachmentPreview = function (anchor) {
    showFloatingAttachmentPreviewRuntime(this, anchor);
  };

  SpreadsheetApp.prototype.positionFloatingAttachmentPreview = function (anchor) {
    positionFloatingAttachmentPreviewRuntime(this, anchor);
  };

  SpreadsheetApp.prototype.hideFloatingAttachmentPreview = function () {
    hideFloatingAttachmentPreviewRuntime(this);
  };

  SpreadsheetApp.prototype.findSheetIdByName = function (sheetName) {
    return findSheetIdByNameRuntime(this, sheetName);
  };

  SpreadsheetApp.prototype.readLinkedInputValue = function (sheetId, cellId) {
    return readLinkedInputValueRuntime(this, sheetId, cellId);
  };

  SpreadsheetApp.prototype.renderCurrentSheetFromStorage = function () {
    renderCurrentSheetFromStorageRuntime(this);
  };

  SpreadsheetApp.prototype.getRenderTargetsForComputeResult = function (
    computedValues,
    didResort,
  ) {
    return getRenderTargetsForComputeResultRuntime(
      this,
      computedValues,
      didResort,
    );
  };

  SpreadsheetApp.prototype.computeAll = function () {
    return computeAllRuntime(this, arguments.length > 0 ? arguments[0] : {});
  };

  SpreadsheetApp.prototype.refreshVisibleSheetFromServer = function () {
    return refreshVisibleSheetFromServerRuntime(
      this,
      arguments.length > 0 ? arguments[0] : {},
    );
  };

  SpreadsheetApp.prototype.applyRightOverflowText = function () {
    applyRightOverflowTextRuntime(this);
  };

  SpreadsheetApp.prototype.measureOutputRequiredWidth = function (output) {
    return measureOutputRequiredWidthRuntime(this, output);
  };

  SpreadsheetApp.prototype.hasUncomputedCells = function () {
    return hasUncomputedCellsRuntime(this);
  };

  SpreadsheetApp.prototype.startUncomputedMonitor = function () {
    startUncomputedMonitorRuntime(this);
  };
}
