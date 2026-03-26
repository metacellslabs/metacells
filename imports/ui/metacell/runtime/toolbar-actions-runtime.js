import {
  getActiveSourceCellId,
  getSelectedSourceCellIds,
} from './selection-source-runtime.js';
import { getSelectionRangeState } from './selection-range-facade.js';
import { runCommandRecompute } from './command-recompute-facade.js';

function getVisibleSheetId(app) {
  return typeof app.getVisibleSheetId === 'function'
    ? String(app.getVisibleSheetId() || '')
    : String(app.activeSheetId || '');
}

function getSelectedRegionCellIds(app) {
  return getSelectedSourceCellIds(app);
}

function getSelectedRegionBounds(app) {
  var selectionRange = getSelectionRangeState(app);
  if (
    selectionRange &&
    (selectionRange.startCol !== selectionRange.endCol ||
      selectionRange.startRow !== selectionRange.endRow)
  ) {
    return {
      startCol: selectionRange.startCol,
      endCol: selectionRange.endCol,
      startRow: selectionRange.startRow,
      endRow: selectionRange.endRow,
    };
  }
  var activeCellId = String(app.activeCellId || '');
  if (!activeCellId) return null;
  var parsed = app.parseCellId(activeCellId);
  if (!parsed) return null;
  return {
    startCol: parsed.col,
    endCol: parsed.col,
    startRow: parsed.row,
    endRow: parsed.row,
  };
}

function buildBordersForPreset(preset, col, row, bounds) {
  switch (String(preset || 'none')) {
    case 'all':
      return { top: true, right: true, bottom: true, left: true };
    case 'outer':
      return {
        top: row === bounds.startRow,
        right: col === bounds.endCol,
        bottom: row === bounds.endRow,
        left: col === bounds.startCol,
      };
    case 'inner':
      return {
        top: row > bounds.startRow,
        right: col < bounds.endCol,
        bottom: row < bounds.endRow,
        left: col > bounds.startCol,
      };
    case 'top':
      return { top: true, right: false, bottom: false, left: false };
    case 'bottom':
      return { top: false, right: false, bottom: true, left: false };
    case 'left':
      return { top: false, right: false, bottom: false, left: true };
    case 'right':
      return { top: false, right: true, bottom: false, left: false };
    case 'none':
    case 'mixed':
    default:
      return { top: false, right: false, bottom: false, left: false };
  }
}

function normalizeBorders(borders) {
  var next = borders && typeof borders === 'object' ? borders : {};
  return {
    top: next.top === true,
    right: next.right === true,
    bottom: next.bottom === true,
    left: next.left === true,
  };
}

export function getBordersPresetValue(app, borders) {
  var selected = getSelectedRegionCellIds(app);
  if (!selected.length) return 'none';
  var first = normalizeBorders(borders);
  for (var i = 1; i < selected.length; i++) {
    var presentation = app.getCellPresentation(selected[i]);
    var next = normalizeBorders(presentation && presentation.borders);
    if (
      first.top !== next.top ||
      first.right !== next.right ||
      first.bottom !== next.bottom ||
      first.left !== next.left
    ) {
      return 'mixed';
    }
  }
  if (first.top && first.right && first.bottom && first.left) return 'all';
  if (first.top && !first.right && !first.bottom && !first.left) return 'top';
  if (!first.top && first.right && !first.bottom && !first.left) return 'right';
  if (!first.top && !first.right && first.bottom && !first.left)
    return 'bottom';
  if (!first.top && !first.right && !first.bottom && first.left) return 'left';
  if (!first.top && !first.right && !first.bottom && !first.left) return 'none';
  return 'mixed';
}

export function applyPresentationToSelection(app, updates, historyKey) {
  var cellIds = getSelectedRegionCellIds(app);
  if (!cellIds.length || app.isReportActive()) return;
  app.captureHistorySnapshot(historyKey);
  for (var i = 0; i < cellIds.length; i++) {
    app.setCellPresentation(cellIds[i], updates);
  }
  app.renderCurrentSheetFromStorage();
  app.syncCellPresentationControls();
}

export function applyBordersPresetToSelection(app, preset) {
  if (!app.activeCellId || app.isReportActive()) return;
  var bounds = getSelectedRegionBounds(app);
  if (!bounds) return;
  app.captureHistorySnapshot('cell-borders');
  for (var row = bounds.startRow; row <= bounds.endRow; row++) {
    for (var col = bounds.startCol; col <= bounds.endCol; col++) {
      var cellId = app.formatCellId(col, row);
      app.setCellPresentation(cellId, {
        borders: buildBordersForPreset(preset, col, row, bounds),
      });
    }
  }
  app.renderCurrentSheetFromStorage();
  app.syncCellPresentationControls();
}

function getDefaultDecimalPlaces(format) {
  switch (String(format || 'text')) {
    case 'number_2':
    case 'percent_2':
      return 2;
    case 'number_0':
      return 0;
    case 'percent':
      return 0;
    case 'currency_usd':
    case 'currency_eur':
    case 'currency_gbp':
      return 2;
    default:
      return 0;
  }
}

export function adjustDecimalPlaces(app, delta) {
  var activeCellId = getActiveSourceCellId(app);
  if (!activeCellId || app.isReportActive()) return;
  var current = app.getCellPresentation(activeCellId);
  var next = Number.isInteger(current.decimalPlaces)
    ? current.decimalPlaces
    : getDefaultDecimalPlaces(app.getCellFormat(activeCellId));
  next = Math.max(0, Math.min(6, next + delta));
  applyPresentationToSelection(
    app,
    {
      decimalPlaces: next,
    },
    'cell-decimals',
  );
}

export function adjustFontSize(app, delta) {
  var activeCellId = getActiveSourceCellId(app);
  if (!activeCellId || app.isReportActive()) return;
  var current = app.getCellPresentation(activeCellId);
  var next = Math.max(10, Math.min(28, Number(current.fontSize || 14) + delta));
  applyPresentationToSelection(
    app,
    {
      fontSize: next,
    },
    'cell-font-size',
  );
}

function scheduleRecomputeAfterPersistence(app, remainingAttempts) {
  if (!app) return;
  var attempts = Number.isInteger(remainingAttempts) ? remainingAttempts : 20;
  setTimeout(function () {
    var hasPendingPersistence = !!(
      app.storage &&
      app.storage.storage &&
      typeof app.storage.storage.hasPendingPersistence === 'function' &&
      app.storage.storage.hasPendingPersistence()
    );
    if (hasPendingPersistence && attempts > 0) {
      scheduleRecomputeAfterPersistence(app, attempts - 1);
      return;
    }
    runCommandRecompute(app);
  }, 0);
}

export function applyActiveCellName(app) {
  var activeCellId = getActiveSourceCellId(app);
  if (!activeCellId) {
    alert('Select a cell first.');
    return;
  }

  var selectionRange = getSelectionRangeState(app);
  var rangeRef = null;
  if (
    selectionRange &&
    (selectionRange.startCol !== selectionRange.endCol ||
      selectionRange.startRow !== selectionRange.endRow)
  ) {
    rangeRef = {
      startCellId: app.formatCellId(
        selectionRange.startCol,
        selectionRange.startRow,
      ),
      endCellId: app.formatCellId(
        selectionRange.endCol,
        selectionRange.endRow,
      ),
    };
  }
  var visibleSheetId = getVisibleSheetId(app);
  app.captureHistorySnapshot('named-cell:' + visibleSheetId);
  var result = app.storage.setCellName(
    visibleSheetId,
    activeCellId,
    app.cellNameInput.value,
    rangeRef,
  );
  if (!result.ok) {
    alert(result.error);
  }
  app.syncCellNameInput();
  app.refreshNamedCellJumpOptions();
  if (result.ok) {
    scheduleRecomputeAfterPersistence(app);
  }
}
