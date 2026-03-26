import {
  ensureMentionAutocomplete as ensureMentionAutocompleteRuntime,
  getMentionAutocompleteContext as getMentionAutocompleteContextRuntime,
  getMentionAutocompleteItems as getMentionAutocompleteItemsRuntime,
  hideMentionAutocomplete as hideMentionAutocompleteRuntime,
  hideMentionAutocompleteSoon as hideMentionAutocompleteSoonRuntime,
  positionMentionAutocomplete as positionMentionAutocompleteRuntime,
  renderMentionAutocompleteList as renderMentionAutocompleteListRuntime,
  setupMentionAutocomplete as setupMentionAutocompleteRuntime,
  updateMentionAutocomplete as updateMentionAutocompleteRuntime,
  applyMentionAutocompleteSelection as applyMentionAutocompleteSelectionRuntime,
} from './mention-runtime.js';
import {
  clearSpillSheetState as clearSpillSheetStateRuntime,
  getSpillEntry as getSpillEntryRuntime,
  getSpillSourceForCell as getSpillSourceForCellRuntime,
  listSpillEntries as listSpillEntriesRuntime,
  setSpillEntry as setSpillEntryRuntime,
} from './spill-model.js';

export function installMentionSpillMethods(SpreadsheetApp) {
  SpreadsheetApp.prototype.ensureMentionAutocomplete = function () {
    return ensureMentionAutocompleteRuntime(this);
  };

  SpreadsheetApp.prototype.setupMentionAutocomplete = function () {
    setupMentionAutocompleteRuntime(this);
  };

  SpreadsheetApp.prototype.hideMentionAutocompleteSoon = function () {
    hideMentionAutocompleteSoonRuntime(this);
  };

  SpreadsheetApp.prototype.hideMentionAutocomplete = function () {
    hideMentionAutocompleteRuntime(this);
  };

  SpreadsheetApp.prototype.updateMentionAutocomplete = function (input) {
    updateMentionAutocompleteRuntime(this, input);
  };

  SpreadsheetApp.prototype.getMentionAutocompleteContext = function (input) {
    return getMentionAutocompleteContextRuntime(this, input);
  };

  SpreadsheetApp.prototype.getMentionAutocompleteItems = function (query, marker) {
    return getMentionAutocompleteItemsRuntime(this, query, marker);
  };

  SpreadsheetApp.prototype.renderMentionAutocompleteList = function () {
    renderMentionAutocompleteListRuntime(this);
  };

  SpreadsheetApp.prototype.positionMentionAutocomplete = function (input) {
    positionMentionAutocompleteRuntime(this, input);
  };

  SpreadsheetApp.prototype.applyMentionAutocompleteSelection = function (index) {
    applyMentionAutocompleteSelectionRuntime(this, index);
  };

  SpreadsheetApp.prototype.clearSpillSheetState = function (sheetId) {
    return clearSpillSheetStateRuntime(this, sheetId);
  };

  SpreadsheetApp.prototype.getSpillEntry = function (sheetId, sourceCellId) {
    return getSpillEntryRuntime(this, sheetId, sourceCellId);
  };

  SpreadsheetApp.prototype.getSpillSourceForCell = function (sheetId, cellId) {
    return getSpillSourceForCellRuntime(this, sheetId, cellId);
  };

  SpreadsheetApp.prototype.listSpillEntries = function (sheetId) {
    return listSpillEntriesRuntime(this, sheetId);
  };

  SpreadsheetApp.prototype.setSpillEntry = function (
    sheetId,
    sourceCellId,
    payload,
  ) {
    return setSpillEntryRuntime(this, sheetId, sourceCellId, payload);
  };
}
