import {
  clearFillRangeHighlight,
  finishFillDrag,
  finishSelectionDrag,
  highlightFillRange,
  onFillDragMove,
  onSelectionDragMove,
  startFillDrag,
  startSelectionDrag,
  syncMentionPreviewToUi,
} from './drag-selection-runtime.js';
import {
  copySelectedRangeDebugToClipboard as copySelectedRangeDebugToClipboardRuntime,
  getSelectedRangeDebugText as getSelectedRangeDebugTextRuntime,
} from './drag-debug-runtime.js';
import {
  resolveSelectionSourceCellId,
  resolveSelectionSourceCellIds,
} from './selection-source-runtime.js';
import { getSelectionRangeState } from './selection-range-facade.js';
import { applyActiveSourceCellEdit } from './source-edit-facade.js';

export {
  clearFillRangeHighlight,
  finishFillDrag,
  finishSelectionDrag,
  highlightFillRange,
  onFillDragMove,
  onSelectionDragMove,
  startFillDrag,
  startSelectionDrag,
  syncMentionPreviewToUi,
};

function getActiveCellId(app) {
  return typeof app.getSelectionActiveCellId === 'function'
    ? app.getSelectionActiveCellId()
    : String(app.activeCellId || '').toUpperCase();
}

export function getSelectionStartCellId(app) {
  var selectionRange = getSelectionRangeState(app);
  if (selectionRange) {
    return app.formatCellId(
      selectionRange.startCol,
      selectionRange.startRow,
    );
  }
  return getActiveCellId(app) || (app.activeInput ? app.activeInput.id : null);
}

export function getSelectedCellIds(app) {
  var selectionRange = getSelectionRangeState(app);
  var activeCellId = getActiveCellId(app);
  if (!selectionRange) {
    return activeCellId
      ? [activeCellId]
      : app.activeInput
        ? [app.activeInput.id]
        : [];
  }
  var ids = [];
  for (var row = selectionRange.startRow; row <= selectionRange.endRow; row++) {
    for (var col = selectionRange.startCol; col <= selectionRange.endCol; col++) {
      ids.push(app.formatCellId(col, row));
    }
  }
  return ids;
}

export function copySelectedRangeToClipboard(app) {
  var text = getSelectedRangeText(app);
  if (!text) return;
  app.internalClipboardState = {
    text: text,
    sourceStartCellId: String(getSelectionStartCellId(app) || '').toUpperCase(),
  };
  var focusedElement = document.activeElement;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {
      copyTextFallback(app, text, focusedElement);
    });
    return;
  }
  copyTextFallback(app, text, focusedElement);
}

export function getSelectedRangeDebugText(app) {
  return getSelectedRangeDebugTextRuntime(app);
}

export function copySelectedRangeDebugToClipboard(app) {
  copySelectedRangeDebugToClipboardRuntime(app, copyTextFallback);
}

export function pasteFromClipboard(app) {
  var activeInput =
    typeof app.getActiveCellInput === 'function'
      ? app.getActiveCellInput()
      : app.activeInput || null;
  var tryTextPaste = function () {
    if (!navigator.clipboard || !navigator.clipboard.readText) return;
    navigator.clipboard
      .readText()
      .then((text) => applyPastedText(app, String(text || '')))
      .catch(() => {});
  };
  if (
    activeInput &&
    typeof app.pasteAttachmentFromSystemClipboard === 'function'
  ) {
    app
      .pasteAttachmentFromSystemClipboard(activeInput)
      .then(function (handled) {
        if (handled) return;
        tryTextPaste();
      })
      .catch(function () {
        tryTextPaste();
      });
    return;
  }
  tryTextPaste();
}

export function getSelectedRangeText(app) {
  var ids = getSelectedCellIds(app);
  if (!ids.length) return '';
  var rows = [];
  var selectionRange = getSelectionRangeState(app);
  if (selectionRange) {
    for (var row = selectionRange.startRow; row <= selectionRange.endRow; row++) {
      var cols = [];
      for (var col = selectionRange.startCol; col <= selectionRange.endCol; col++) {
        var cellId = app.formatCellId(col, row);
        cols.push(app.getRawCellValue(cellId));
      }
      rows.push(cols.join('\t'));
    }
  } else {
    rows.push(app.getRawCellValue(ids[0]));
  }
  return rows.join('\n');
}

export function copyTextFallback(app, text, previouslyFocused) {
  var fallback = document.createElement('textarea');
  fallback.value = text;
  document.body.appendChild(fallback);
  fallback.select();
  document.execCommand('copy');
  fallback.remove();
  if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
    previouslyFocused.focus();
  } else if (typeof app.focusActiveEditor === 'function') {
    app.focusActiveEditor();
  }
}

export function applyPastedText(app, text) {
  var startCellId = getSelectionStartCellId(app);
  if (!startCellId) return;
  var start = app.parseCellId(startCellId);
  if (!start) return;
  var clipboardState =
    app && app.internalClipboardState && typeof app.internalClipboardState === 'object'
      ? app.internalClipboardState
      : null;
  var sourceStartCellId =
    clipboardState && String(clipboardState.text || '') === String(text || '')
      ? String(clipboardState.sourceStartCellId || '').toUpperCase()
      : '';
  var sourceStart = sourceStartCellId ? app.parseCellId(sourceStartCellId) : null;
  var pasteOffsetRow =
    sourceStart && Number.isFinite(sourceStart.row) ? start.row - sourceStart.row : 0;
  var pasteOffsetCol =
    sourceStart && Number.isFinite(sourceStart.col) ? start.col - sourceStart.col : 0;
  var transformPastedValue = function (rawValue) {
    var raw = String(rawValue == null ? '' : rawValue);
    if (!raw || !sourceStart) return raw;
    var prefix = raw.charAt(0);
    if (prefix !== '=' && prefix !== "'" && prefix !== '>' && prefix !== '#') {
      return raw;
    }
    return app.shiftFormulaReferences(raw, pasteOffsetRow, pasteOffsetCol);
  };

  var rows = String(text || '')
    .replace(/\r/g, '')
    .split('\n');
  if (!rows.length) return;
  app.captureHistorySnapshot('paste:' + app.activeSheetId);
  var matrix = rows.map((row) => row.split('\t'));
  var changed = {};

  var selectionRange = getSelectionRangeState(app);
  if (selectionRange && matrix.length === 1 && matrix[0].length === 1) {
    for (
      var r = selectionRange.startRow;
      r <= selectionRange.endRow;
      r++
    ) {
      for (
        var c = selectionRange.startCol;
        c <= selectionRange.endCol;
        c++
      ) {
        var cellId = app.formatCellId(c, r);
        if (
          typeof app.getCellInput === 'function'
            ? app.getCellInput(cellId)
            : app.inputById[cellId]
        ) {
          applyActiveSourceCellEdit(app, {
            cellId: cellId,
            rawValue: transformPastedValue(matrix[0][0]),
          });
          changed[cellId] = true;
        }
      }
    }
  } else {
    for (var rowIndex = 0; rowIndex < matrix.length; rowIndex++) {
      for (var colIndex = 0; colIndex < matrix[rowIndex].length; colIndex++) {
        var targetCellId = app.formatCellId(
          start.col + colIndex,
          start.row + rowIndex,
        );
        if (
          !(
            typeof app.getCellInput === 'function'
              ? app.getCellInput(targetCellId)
              : app.inputById[targetCellId]
          )
        )
          continue;
        applyActiveSourceCellEdit(app, {
          cellId: targetCellId,
          rawValue: transformPastedValue(matrix[rowIndex][colIndex]),
        });
        changed[targetCellId] = true;
      }
    }
  }

  var activeCellId = String(getActiveCellId(app) || '');
  if (activeCellId && changed[activeCellId]) {
    app.syncActiveEditorValue(app.getRawCellValue(activeCellId));
  }

  app.aiService.notifyActiveCellChanged();
  app.computeAll();
}

export function clearSelectedCells(app) {
  var ids = getSelectedCellIds(app);
  var activeCellId = String(getActiveCellId(app) || '');
  if (!ids.length && activeCellId) {
    ids = [activeCellId];
  } else if (!ids.length && app.activeInput) {
    ids = [app.activeInput.id];
  }
  if (!ids.length) return;
  var sourceIds = resolveSelectionSourceCellIds(app, ids);
  if (!sourceIds.length) return;
  app.captureHistorySnapshot('clear:' + app.activeSheetId);

  for (var i = 0; i < sourceIds.length; i++) {
    var sourceCellId = String(sourceIds[i] || '').toUpperCase();
    var previousRaw = String(app.getRawCellValue(sourceCellId) || '');
    if (
      previousRaw &&
      typeof app.clearGeneratedResultCellsForSource === 'function' &&
      app.isGeneratedAIResultSourceRaw(previousRaw)
    ) {
      app.clearGeneratedResultCellsForSource(
        app.activeSheetId,
        sourceCellId,
        previousRaw,
      );
    }
    if (typeof app.setCellSchedule === 'function') {
      app.setCellSchedule(sourceCellId, null);
    }
    applyActiveSourceCellEdit(app, {
      cellId: sourceCellId,
      rawValue: '',
    });
  }

  var activeSourceCellId = resolveSelectionSourceCellId(app, activeCellId);
  if (activeSourceCellId && sourceIds.indexOf(activeSourceCellId) !== -1) {
    app.syncActiveEditorValue('');
  }

  app.aiService.notifyActiveCellChanged();
  app.renderCurrentSheetFromStorage();
  app.computeAll();
}
