import {
  dismissEditorOverlay as dismissEditorOverlayRuntime,
  focusEditorOverlayInput as focusEditorOverlayInputRuntime,
  hideEditorOverlay as hideEditorOverlayRuntime,
  setupEditorOverlay as setupEditorOverlayRuntime,
  syncEditorOverlay as syncEditorOverlayRuntime,
} from './editor-overlay-runtime.js';
import {
  getEditorSelectionRange as getEditorSelectionRangeRuntime,
  setEditorSelectionRange as setEditorSelectionRangeRuntime,
} from './editor-selection-runtime.js';
import {
  bindFormulaBarEvents as bindFormulaBarEventsRuntime,
  commitFormulaBarValue as commitFormulaBarValueRuntime,
} from './formula-bar-runtime.js';
import {
  beginEditingSession as beginEditingSessionRuntime,
  clearEditingSession as clearEditingSessionRuntime,
  getEditingSessionDraft as getEditingSessionDraftRuntime,
  isEditingCell as isEditingCellRuntime,
  updateEditingSessionDraft as updateEditingSessionDraftRuntime,
} from './editing-session-runtime.js';
import {
  cancelCellEditing as cancelCellEditingRuntime,
  commitFormulaBarEditing as commitFormulaBarEditingRuntime,
  enterCellEditing as enterCellEditingRuntime,
  enterFormulaBarEditing as enterFormulaBarEditingRuntime,
  handleCellEditingBlur as handleCellEditingBlurRuntime,
  handleCellDirectType as handleCellDirectTypeRuntime,
  handleCellEditingEnter as handleCellEditingEnterRuntime,
  handleCellEditingEscape as handleCellEditingEscapeRuntime,
  handleCellInputDraft as handleCellInputDraftRuntime,
  handleCellMentionNavigation as handleCellMentionNavigationRuntime,
  restoreFocusAfterEditingExit as restoreFocusAfterEditingExitRuntime,
  syncCellDraft as syncCellDraftRuntime,
} from './editor-controller-runtime.js';
import {
  focusActiveEditor as focusActiveEditorRuntime,
  focusCellProxy as focusCellProxyRuntime,
} from './grid-focus-runtime.js';
import { bindGridInputEvents as bindGridInputEventsModernRuntime } from './keyboard-grid-runtime.js';
import {
  getDirectTypeValue as getDirectTypeValueRuntime,
  isDirectTypeKey as isDirectTypeKeyRuntime,
  startEditingCell as startEditingCellRuntime,
} from './selection-runtime.js';
export function installEditorMethods(SpreadsheetApp) {
  SpreadsheetApp.prototype.getActiveCellInput = function () {
    return this.activeInput || null;
  };

  SpreadsheetApp.prototype.getVisibleSheetId = function () {
    return String(this.activeSheetId || '');
  };

  SpreadsheetApp.prototype.getEditingOwnerSheetId = function () {
    return this.getVisibleSheetId();
  };

  SpreadsheetApp.prototype.getCrossSheetPickContext = function () {
    return this.crossTabMentionContext || null;
  };

  SpreadsheetApp.prototype.isEditorElementFocused = function (target) {
    return document.activeElement === target;
  };

  SpreadsheetApp.prototype.isFormulaBarFocused = function () {
    return this.isEditorElementFocused(this.formulaInput);
  };

  SpreadsheetApp.prototype.isOverlayEditorFocused = function () {
    return this.isEditorElementFocused(this.editorOverlayInput);
  };

  SpreadsheetApp.prototype.getActiveEditorInput = function () {
    var activeInput = this.getActiveCellInput();
    if (this.editorOverlayInput && this.isOverlayEditorFocused()) {
      return this.editorOverlayInput;
    }
    if (this.formulaInput && this.isFormulaBarFocused()) {
      return this.formulaInput;
    }
    if (activeInput && this.isEditingCell(activeInput)) {
      return activeInput;
    }
    return activeInput || null;
  };

  SpreadsheetApp.prototype.syncActiveEditorValue = function (value, options) {
    var opts = options || {};
    var next = String(value == null ? '' : value);
    if (this.activeInput) {
      this.activeInput.value = next;
    }
    if (opts.syncFormula !== false && this.formulaInput) {
      this.formulaInput.value = next;
    }
    if (
      opts.syncOverlay !== false &&
      this.editorOverlayInput &&
      (this.isEditingCell(this.activeInput) || this.isOverlayEditorFocused())
    ) {
      this.editorOverlayInput.value = next;
    }
  };

  SpreadsheetApp.prototype.setEditorSelectionRange = function (start, end, input) {
    setEditorSelectionRangeRuntime(
      this,
      Number(start) || 0,
      Number(end) || 0,
      input,
    );
  };

  SpreadsheetApp.prototype.getEditorSelectionRange = function (input) {
    return getEditorSelectionRangeRuntime(this, input);
  };

  SpreadsheetApp.prototype.beginEditingSession = function (input, options) {
    beginEditingSessionRuntime(this, input, options);
    if (!options || options.publish !== false) this.publishUiState();
  };

  SpreadsheetApp.prototype.updateEditingSessionDraft = function (value, options) {
    updateEditingSessionDraftRuntime(this, value, options);
    if (!options || options.publish !== false) this.publishUiState();
  };

  SpreadsheetApp.prototype.getEditingSessionDraft = function (cellId) {
    return getEditingSessionDraftRuntime(this, cellId);
  };

  SpreadsheetApp.prototype.clearEditingSession = function (options) {
    clearEditingSessionRuntime(this, options);
    this.publishUiState();
  };

  SpreadsheetApp.prototype.enterCellEditing = function (input, options) {
    return enterCellEditingRuntime(this, input, options);
  };

  SpreadsheetApp.prototype.enterFormulaBarEditing = function (input, options) {
    return enterFormulaBarEditingRuntime(this, input, options);
  };

  SpreadsheetApp.prototype.syncCellDraft = function (input, rawValue, options) {
    syncCellDraftRuntime(this, input, rawValue, options);
  };

  SpreadsheetApp.prototype.cancelCellEditing = function (input, options) {
    return cancelCellEditingRuntime(this, input, options);
  };

  SpreadsheetApp.prototype.commitFormulaBarEditing = function (input, options) {
    return commitFormulaBarEditingRuntime(this, input, options);
  };

  SpreadsheetApp.prototype.handleCellEditingBlur = function (input, options) {
    return handleCellEditingBlurRuntime(this, input, options);
  };

  SpreadsheetApp.prototype.handleCellEditingEnter = function (input, options) {
    return handleCellEditingEnterRuntime(this, input, options);
  };

  SpreadsheetApp.prototype.handleCellEditingEscape = function (input, options) {
    return handleCellEditingEscapeRuntime(this, input, options);
  };

  SpreadsheetApp.prototype.handleCellMentionNavigation = function (
    input,
    key,
    options,
  ) {
    return handleCellMentionNavigationRuntime(this, input, key, options);
  };

  SpreadsheetApp.prototype.handleCellInputDraft = function (input, options) {
    return handleCellInputDraftRuntime(this, input, options);
  };

  SpreadsheetApp.prototype.restoreFocusAfterEditingExit = function (options) {
    restoreFocusAfterEditingExitRuntime(this, options);
  };

  SpreadsheetApp.prototype.setupEditorOverlay = function () {
    setupEditorOverlayRuntime(this);
  };

  SpreadsheetApp.prototype.syncEditorOverlay = function () {
    syncEditorOverlayRuntime(this);
  };

  SpreadsheetApp.prototype.hideEditorOverlay = function () {
    hideEditorOverlayRuntime(this);
  };

  SpreadsheetApp.prototype.focusEditorOverlayInput = function () {
    focusEditorOverlayInputRuntime(this);
  };

  SpreadsheetApp.prototype.dismissEditorOverlay = function () {
    dismissEditorOverlayRuntime(this);
  };

  SpreadsheetApp.prototype.commitEditorOverlay = function () {
    var activeInput = this.getActiveCellInput ? this.getActiveCellInput() : null;
    if (!activeInput || !this.isEditingCell(activeInput)) return;
    var raw = String(
      this.editorOverlayInput && this.editorOverlayInput.value != null
        ? this.editorOverlayInput.value
        : activeInput.value == null
          ? ''
          : activeInput.value,
    );
    this.syncActiveEditorValue(raw, { syncOverlay: false });
    if (this.editorOverlayReturnTarget === 'formula' && this.formulaInput) {
      this.commitFormulaBarEditing(activeInput, {
        rawValue: raw,
        origin: 'formula-bar',
        restoreFocus: true,
      });
      this.dismissEditorOverlay();
      return;
    }
    this.handleCellEditingBlur(activeInput, {
      wasEditing: true,
      rawValue: raw,
      origin: 'cell',
    });
    this.dismissEditorOverlay();
    this.restoreFocusAfterEditingExit({ defer: false });
  };

  SpreadsheetApp.prototype.commitFormulaBarValue = function () {
    commitFormulaBarValueRuntime(this, arguments.length > 0 ? arguments[0] : {});
  };

  SpreadsheetApp.prototype.bindFormulaBarEvents = function () {
    bindFormulaBarEventsRuntime(this);
  };

  SpreadsheetApp.prototype.bindGridInputEvents = function () {
    bindGridInputEventsModernRuntime(this);
  };

  SpreadsheetApp.prototype.isEditingCell = function (input) {
    return isEditingCellRuntime(this, input);
  };

  SpreadsheetApp.prototype.isDirectTypeKey = function (event) {
    return isDirectTypeKeyRuntime(this, event);
  };

  SpreadsheetApp.prototype.getDirectTypeValue = function (event) {
    return getDirectTypeValueRuntime(this, event);
  };

  SpreadsheetApp.prototype.startEditingCell = function (input) {
    startEditingCellRuntime(this, input);
  };

  SpreadsheetApp.prototype.handleCellDirectType = function (input, key, options) {
    return handleCellDirectTypeRuntime(this, input, key, options);
  };

  SpreadsheetApp.prototype.focusActiveEditor = function () {
    return focusActiveEditorRuntime(this);
  };

  SpreadsheetApp.prototype.focusCellProxy = function (input) {
    return focusCellProxyRuntime(this, input);
  };
}
