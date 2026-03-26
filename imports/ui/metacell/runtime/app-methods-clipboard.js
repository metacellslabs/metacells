import {
  applyPastedText as applyPastedTextRuntime,
  clearFillRangeHighlight as clearFillRangeHighlightRuntime,
  clearSelectedCells as clearSelectedCellsRuntime,
  copySelectedRangeDebugToClipboard as copySelectedRangeDebugToClipboardRuntime,
  copySelectedRangeToClipboard as copySelectedRangeToClipboardRuntime,
  copyTextFallback as copyTextFallbackRuntime,
  finishFillDrag as finishFillDragRuntime,
  finishSelectionDrag as finishSelectionDragRuntime,
  getSelectedRangeText as getSelectedRangeTextRuntime,
  highlightFillRange as highlightFillRangeRuntime,
  onFillDragMove as onFillDragMoveRuntime,
  onSelectionDragMove as onSelectionDragMoveRuntime,
  pasteFromClipboard as pasteFromClipboardRuntime,
  startFillDrag as startFillDragRuntime,
  startSelectionDrag as startSelectionDragRuntime,
  syncMentionPreviewToUi as syncMentionPreviewToUiRuntime,
} from './drag-clipboard-runtime.js';

export function installClipboardMethods(SpreadsheetApp) {
  SpreadsheetApp.prototype.copySelectedRangeToClipboard = function () {
    copySelectedRangeToClipboardRuntime(this);
  };

  SpreadsheetApp.prototype.copySelectedRangeDebugToClipboard = function () {
    copySelectedRangeDebugToClipboardRuntime(this);
  };

  SpreadsheetApp.prototype.pasteFromClipboard = function () {
    pasteFromClipboardRuntime(this);
  };

  SpreadsheetApp.prototype.getSelectedRangeText = function () {
    return getSelectedRangeTextRuntime(this);
  };

  SpreadsheetApp.prototype.copyTextFallback = function (text, previouslyFocused) {
    copyTextFallbackRuntime(this, text, previouslyFocused);
  };

  SpreadsheetApp.prototype.applyPastedText = function (text) {
    applyPastedTextRuntime(this, text);
  };

  SpreadsheetApp.prototype.clearSelectedCells = function () {
    clearSelectedCellsRuntime(this);
  };

  SpreadsheetApp.prototype.clearFillRangeHighlight = function () {
    clearFillRangeHighlightRuntime(this);
  };

  SpreadsheetApp.prototype.highlightFillRange = function (sourceId, targetId) {
    highlightFillRangeRuntime(this, sourceId, targetId);
  };

  SpreadsheetApp.prototype.startFillDrag = function (sourceInput, event) {
    startFillDragRuntime(this, sourceInput, event);
  };

  SpreadsheetApp.prototype.startSelectionDrag = function (sourceInput, event) {
    startSelectionDragRuntime(this, sourceInput, event);
  };

  SpreadsheetApp.prototype.onSelectionDragMove = function (event) {
    onSelectionDragMoveRuntime(this, event);
  };

  SpreadsheetApp.prototype.finishSelectionDrag = function () {
    finishSelectionDragRuntime(this);
  };

  SpreadsheetApp.prototype.syncMentionPreviewToUi = function (mentionInput) {
    syncMentionPreviewToUiRuntime(this, mentionInput);
  };

  SpreadsheetApp.prototype.onFillDragMove = function (event) {
    onFillDragMoveRuntime(this, event);
  };

  SpreadsheetApp.prototype.finishFillDrag = function () {
    finishFillDragRuntime(this);
  };
}
