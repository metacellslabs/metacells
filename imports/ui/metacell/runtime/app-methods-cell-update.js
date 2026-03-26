import { rpc } from '../../../../lib/rpc-client.js';
import {
  createCellUpdateTrace,
  shouldProfileCellUpdatesClient,
  traceCellUpdateClient,
} from '../../../lib/cell-update-profile.js';

export function installCellUpdateMethods(SpreadsheetApp) {
  if (!SpreadsheetApp || !SpreadsheetApp.prototype) return;

  SpreadsheetApp.prototype.hasPendingLocalEdit = function hasPendingLocalEdit() {
    if (this.activeInput && this.isEditingCell(this.activeInput)) return true;
    if (!this.activeInput || !this.formulaInput) return false;
    if (document.activeElement !== this.formulaInput) return false;

    var currentFormulaValue = String(
      this.formulaInput.value == null ? '' : this.formulaInput.value,
    );
    var storedRawValue = String(this.getRawCellValue(this.activeInput.id) || '');
    return currentFormulaValue !== storedRawValue;
  };

  SpreadsheetApp.prototype.syncAIDraftLock = function syncAIDraftLock() {
    if (!this.aiService || typeof this.aiService.setEditDraftLock !== 'function')
      return;
    var locked = this.hasPendingLocalEdit();
    this.aiService.setEditDraftLock(locked);
    this.syncServerEditLock(locked);
  };

  SpreadsheetApp.prototype.syncServerEditLock = function syncServerEditLock(locked) {
    var nextKey = '';
    if (
      locked &&
      this.sheetDocumentId &&
      this.activeSheetId &&
      this.activeInput &&
      this.activeInput.id
    ) {
      nextKey = [
        String(this.sheetDocumentId || ''),
        String(this.activeSheetId || ''),
        String(this.activeInput.id || '').toUpperCase(),
      ].join(':');
    }

    if (nextKey === this.currentServerEditLockKey) return;

    var releaseKey = this.currentServerEditLockKey;
    this.currentServerEditLockKey = nextKey;

    if (releaseKey) {
      var releaseParts = releaseKey.split(':');
      this.editLockSequence += 1;
      rpc(
        'ai.setSourceEditLock',
        releaseParts[0],
        releaseParts[1],
        releaseParts.slice(2).join(':'),
        false,
        String(this.editLockOwnerId || ''),
        this.editLockSequence,
      ).catch(function () {});
    }

    if (nextKey) {
      var acquireParts = nextKey.split(':');
      this.editLockSequence += 1;
      rpc(
        'ai.setSourceEditLock',
        acquireParts[0],
        acquireParts[1],
        acquireParts.slice(2).join(':'),
        true,
        String(this.editLockOwnerId || ''),
        this.editLockSequence,
      ).catch(function () {});
    }
  };

  SpreadsheetApp.prototype.setRawCellValue = function setRawCellValue(cellId, value, meta) {
    var normalizedCellId = String(cellId || '').toUpperCase();
    var nextRaw = String(value == null ? '' : value);
    var previousRaw = String(
      this.storage.getCellValue(this.activeSheetId, normalizedCellId) || '',
    );

    if (this.isGeneratedAIResultSourceRaw(previousRaw) && previousRaw !== nextRaw) {
      this.clearGeneratedResultCellsForSource(
        this.activeSheetId,
        normalizedCellId,
        previousRaw,
      );
    }

    this.storage.setCellValue(this.activeSheetId, normalizedCellId, nextRaw, meta);
  };

  SpreadsheetApp.prototype.hasRawCellChanged = function hasRawCellChanged(
    cellId,
    nextRawValue,
  ) {
    var next = String(nextRawValue == null ? '' : nextRawValue);
    var start = Object.prototype.hasOwnProperty.call(this.editStartRawByCell, cellId)
      ? this.editStartRawByCell[cellId]
      : this.getRawCellValue(cellId);
    return start !== next;
  };

  SpreadsheetApp.prototype.isFormulaLikeRawValue = function isFormulaLikeRawValue(rawValue) {
    var raw = String(rawValue == null ? '' : rawValue);
    return (
      !!raw &&
      (raw.charAt(0) === '=' ||
        raw.charAt(0) === '>' ||
        raw.charAt(0) === '#' ||
        raw.charAt(0) === "'")
    );
  };

  SpreadsheetApp.prototype.beginCellUpdateTrace = function beginCellUpdateTrace(
    cellId,
    rawValue,
  ) {
    if (!shouldProfileCellUpdatesClient()) return null;
    var trace = createCellUpdateTrace({
      sheetId: this.activeSheetId,
      cellId: String(cellId || '').toUpperCase(),
      rawKind: this.isFormulaLikeRawValue(rawValue) ? 'formula' : 'value',
    });
    traceCellUpdateClient(trace, 'edit.commit.start');
    return trace;
  };
}
