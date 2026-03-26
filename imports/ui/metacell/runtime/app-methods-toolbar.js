import {
  getNamedCellJumpUiState as getNamedCellJumpUiStateRuntime,
  navigateToNamedCell as navigateToNamedCellRuntime,
  refreshNamedCellJumpOptions as refreshNamedCellJumpOptionsRuntime,
  setNamedCellJumpActiveIndex as setNamedCellJumpActiveIndexRuntime,
  setupCellNameControls as setupCellNameControlsRuntime,
  syncCellNameInput as syncCellNameInputRuntime,
  toggleNamedCellJumpPicker as toggleNamedCellJumpPickerRuntime,
} from './named-cell-jump-runtime.js';
import { applyActiveCellName as applyActiveCellNameToolbarRuntime } from './toolbar-actions-runtime.js';
import {
  collectFormulaBarUiState as collectFormulaBarUiStateRuntime,
  collectToolbarUiState as collectToolbarUiStateRuntime,
  getAIModeUiState as getAIModeUiStateRuntime,
  syncAIModeUI as syncAIModeUIRuntime,
  syncCellFormatControl as syncCellFormatControlRuntime,
  syncCellPresentationControls as syncCellPresentationControlsRuntime,
} from './toolbar-sync-runtime.js';
import {
  applyAIMode as applyAIModeRuntime,
  applyDisplayMode as applyDisplayModeRuntime,
  setupAIModeControls as setupAIModeControlsRuntime,
  setupDisplayModeControls as setupDisplayModeControlsRuntime,
  toggleAIModePicker as toggleAIModePickerRuntime,
  toggleDisplayModePicker as toggleDisplayModePickerRuntime,
} from './toolbar-mode-runtime.js';
import {
  applyCellAlign as applyCellAlignRuntime,
  applyCellBgColor as applyCellBgColorRuntime,
  applyCellFontFamily as applyCellFontFamilyRuntime,
  applyCellFormat as applyCellFormatRuntime,
  setupCellFormatControls as setupCellFormatControlsRuntime,
  setupCellPresentationControls as setupCellPresentationControlsRuntime,
  toggleBgColorPicker as toggleBgColorPickerRuntime,
  toggleCellBold as toggleCellBoldRuntime,
  toggleCellBordersPicker as toggleCellBordersPickerRuntime,
  toggleCellFontFamilyPicker as toggleCellFontFamilyPickerRuntime,
  toggleCellFormatPicker as toggleCellFormatPickerRuntime,
  toggleCellItalic as toggleCellItalicRuntime,
  toggleCellWrap as toggleCellWrapRuntime,
} from './toolbar-picker-runtime.js';
import {
  adjustDecimalPlaces as adjustDecimalPlacesRuntime,
  adjustFontSize as adjustFontSizeRuntime,
  applyBordersPresetToSelection as applyBordersPresetToSelectionRuntime,
} from './toolbar-actions-runtime.js';

export function installToolbarMethods(SpreadsheetApp) {
  SpreadsheetApp.prototype.setupDisplayModeControls = function () {
    setupDisplayModeControlsRuntime(this);
  };

  SpreadsheetApp.prototype.toggleDisplayModePicker = function () {
    toggleDisplayModePickerRuntime(this);
  };

  SpreadsheetApp.prototype.applyDisplayMode = function (mode) {
    applyDisplayModeRuntime(this, mode);
  };

  SpreadsheetApp.prototype.setupCellFormatControls = function () {
    setupCellFormatControlsRuntime(this);
  };

  SpreadsheetApp.prototype.toggleCellFormatPicker = function () {
    toggleCellFormatPickerRuntime(this);
  };

  SpreadsheetApp.prototype.applyCellFormat = function (format) {
    applyCellFormatRuntime(this, format);
  };

  SpreadsheetApp.prototype.setupCellPresentationControls = function () {
    setupCellPresentationControlsRuntime(this);
  };

  SpreadsheetApp.prototype.applyCellAlign = function (align) {
    applyCellAlignRuntime(this, align);
  };

  SpreadsheetApp.prototype.toggleCellBold = function () {
    toggleCellBoldRuntime(this);
  };

  SpreadsheetApp.prototype.toggleCellItalic = function () {
    toggleCellItalicRuntime(this);
  };

  SpreadsheetApp.prototype.toggleCellWrap = function () {
    toggleCellWrapRuntime(this);
  };

  SpreadsheetApp.prototype.toggleBgColorPicker = function () {
    toggleBgColorPickerRuntime(this);
  };

  SpreadsheetApp.prototype.applyCellBgColor = function (color) {
    applyCellBgColorRuntime(this, color);
  };

  SpreadsheetApp.prototype.toggleCellFontFamilyPicker = function () {
    toggleCellFontFamilyPickerRuntime(this);
  };

  SpreadsheetApp.prototype.applyCellFontFamily = function (fontFamily) {
    applyCellFontFamilyRuntime(this, fontFamily);
  };

  SpreadsheetApp.prototype.toggleCellBordersPicker = function () {
    toggleCellBordersPickerRuntime(this);
  };

  SpreadsheetApp.prototype.applyCellBordersPreset = function (preset) {
    applyBordersPresetToSelectionRuntime(this, preset);
  };

  SpreadsheetApp.prototype.adjustDecimalPlaces = function (delta) {
    adjustDecimalPlacesRuntime(this, delta);
  };

  SpreadsheetApp.prototype.adjustFontSize = function (delta) {
    adjustFontSizeRuntime(this, delta);
  };

  SpreadsheetApp.prototype.setupAIModeControls = function () {
    setupAIModeControlsRuntime(this);
  };

  SpreadsheetApp.prototype.toggleAIModePicker = function () {
    toggleAIModePickerRuntime(this);
  };

  SpreadsheetApp.prototype.applyAIMode = function (mode) {
    applyAIModeRuntime(this, mode);
  };

  SpreadsheetApp.prototype.syncAIModeUI = function () {
    syncAIModeUIRuntime(this);
  };

  SpreadsheetApp.prototype.getAIModeUiState = function () {
    return getAIModeUiStateRuntime(this);
  };

  SpreadsheetApp.prototype.collectFormulaBarUiState = function () {
    return collectFormulaBarUiStateRuntime(this);
  };

  SpreadsheetApp.prototype.collectToolbarUiState = function () {
    return collectToolbarUiStateRuntime(this);
  };

  SpreadsheetApp.prototype.setupCellNameControls = function () {
    setupCellNameControlsRuntime(this);
  };

  SpreadsheetApp.prototype.getNamedCellJumpUiState = function () {
    return getNamedCellJumpUiStateRuntime(this);
  };

  SpreadsheetApp.prototype.setNamedCellJumpActiveIndex = function (nextIndex) {
    return setNamedCellJumpActiveIndexRuntime(this, nextIndex);
  };

  SpreadsheetApp.prototype.toggleNamedCellJumpPicker = function () {
    return toggleNamedCellJumpPickerRuntime(this);
  };

  SpreadsheetApp.prototype.syncCellNameInput = function () {
    syncCellNameInputRuntime(this);
  };

  SpreadsheetApp.prototype.syncCellFormatControl = function () {
    syncCellFormatControlRuntime(this);
  };

  SpreadsheetApp.prototype.syncCellPresentationControls = function () {
    syncCellPresentationControlsRuntime(this);
  };

  SpreadsheetApp.prototype.applyActiveCellName = function () {
    applyActiveCellNameToolbarRuntime(this);
  };

  SpreadsheetApp.prototype.refreshNamedCellJumpOptions = function () {
    refreshNamedCellJumpOptionsRuntime(this);
  };

  SpreadsheetApp.prototype.navigateToNamedCell = function (name) {
    navigateToNamedCellRuntime(this, name);
  };
}
