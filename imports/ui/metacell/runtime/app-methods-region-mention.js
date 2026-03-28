import {
  applyFormulaMentionPreview as applyFormulaMentionPreviewRuntime,
  buildMentionTokenForSelection as buildMentionTokenForSelectionRuntime,
  canInsertFormulaMention as canInsertFormulaMentionRuntime,
  getMentionSheetPrefix as getMentionSheetPrefixRuntime,
  insertTextIntoInputAtCursor as insertTextIntoInputAtCursorRuntime,
} from './formula-mention-runtime.js';

let regionRecordingRuntimePromise = null;
let regionRecordingRuntimeLoaded = null;

function loadRegionRecordingRuntime() {
  if (!regionRecordingRuntimePromise) {
    regionRecordingRuntimePromise = import('./region-recording-runtime.js').then(
      (module) => {
        regionRecordingRuntimeLoaded = module;
        return module;
      },
    );
  }
  return regionRecordingRuntimePromise;
}

export function installRegionMentionMethods(SpreadsheetApp) {
  SpreadsheetApp.prototype.setupRegionRecordingControls = function () {
    if (this._regionRecordingSetupRequested) return;
    this._regionRecordingSetupRequested = true;
    loadRegionRecordingRuntime().then((runtime) => {
      runtime.setupRegionRecordingControls(this);
    });
  };

  SpreadsheetApp.prototype.syncRegionRecordingControls = function () {
    if (!regionRecordingRuntimeLoaded) return;
    regionRecordingRuntimeLoaded.syncRegionRecordingControls(this);
  };

  SpreadsheetApp.prototype.startRegionRecording = function () {
    return loadRegionRecordingRuntime().then((runtime) => {
      runtime.startRegionRecording(this);
    });
  };

  SpreadsheetApp.prototype.stopRegionRecording = function (shouldDownload) {
    if (!regionRecordingRuntimeLoaded) return;
    regionRecordingRuntimeLoaded.stopRegionRecording(this, shouldDownload);
  };

  SpreadsheetApp.prototype.downloadRegionRecording = function () {
    if (!regionRecordingRuntimeLoaded) return;
    regionRecordingRuntimeLoaded.downloadRegionRecording(this);
  };

  SpreadsheetApp.prototype.toggleRegionRecordingControl = function () {
    return loadRegionRecordingRuntime().then((runtime) => {
      runtime.toggleRegionRecordingControl(this);
    });
  };

  SpreadsheetApp.prototype.canInsertFormulaMention = function (raw) {
    return canInsertFormulaMentionRuntime(this, raw);
  };

  SpreadsheetApp.prototype.buildMentionTokenForSelection = function (
    fallbackCellId,
    isRangeMode,
  ) {
    return buildMentionTokenForSelectionRuntime(
      this,
      fallbackCellId,
      isRangeMode,
    );
  };

  SpreadsheetApp.prototype.getMentionSheetPrefix = function () {
    return getMentionSheetPrefixRuntime(this);
  };

  SpreadsheetApp.prototype.insertTextIntoInputAtCursor = function (input, text) {
    insertTextIntoInputAtCursorRuntime(this, input, text);
  };

  SpreadsheetApp.prototype.applyFormulaMentionPreview = function (input, token) {
    applyFormulaMentionPreviewRuntime(this, input, token);
  };
}
