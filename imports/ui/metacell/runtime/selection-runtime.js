import {
  applyHeaderSelectionRange,
  bindHeaderSelectionEvents,
  clearHeaderSelectionHighlight,
  onHeaderSelectionDragMove,
  selectEntireColumn,
  selectEntireRow,
  startHeaderSelectionDrag,
  updateAxisHeaderHighlight,
} from './selection-header-runtime.js';
import {
  applyDependencyHighlight,
  clearDependencyHighlight,
  collectDependencyHintsFromRaw,
} from './selection-dependency-runtime.js';
import {
  cellHasAnyRawValue,
  extendSelectionRangeTowardCell,
  findAdjacentCellId,
  findJumpTargetCellId,
  getSelectionEdgeInputForDirection,
  moveSelectionByArrow,
  moveToNextFilledCell,
  selectNearestValueRegionFromActive,
  selectWholeSheetRegion,
} from './selection-navigation-runtime.js';
import {
  clearSelectionRangeModel,
  getSelectionRangeModel,
  setSelectionRangeModel,
} from './selection-model.js';

export {
  applyHeaderSelectionRange,
  bindHeaderSelectionEvents,
  applyDependencyHighlight,
  cellHasAnyRawValue,
  clearHeaderSelectionHighlight,
  clearDependencyHighlight,
  collectDependencyHintsFromRaw,
  extendSelectionRangeTowardCell,
  findAdjacentCellId,
  findJumpTargetCellId,
  getSelectionEdgeInputForDirection,
  moveSelectionByArrow,
  moveToNextFilledCell,
  onHeaderSelectionDragMove,
  selectNearestValueRegionFromActive,
  selectEntireColumn,
  selectEntireRow,
  selectWholeSheetRegion,
  startHeaderSelectionDrag,
  updateAxisHeaderHighlight,
};

export function isEditingCell(app, input) {
  if (!input) return false;
  if (app.editingSession && app.editingSession.cellId) {
    return !!(
      app.editingSession.sheetId ===
        (typeof app.getEditingOwnerSheetId === 'function'
          ? app.getEditingOwnerSheetId()
          : String(app.activeSheetId || '')) &&
      app.editingSession.cellId === String(input.id || '').toUpperCase()
    );
  }
  return !!(input.classList && input.classList.contains('editing'));
}

export function isDirectTypeKey(app, event) {
  if (!event) return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (!event.key || event.key.length !== 1) return false;
  return true;
}

export function getDirectTypeValue(app, event) {
  if (!isDirectTypeKey(app, event)) return '';
  if (event && event.key === ' ' && event.code && event.code !== 'Space') {
    var fallbackByCode = {
      Equal: event.shiftKey ? '+' : '=',
      Minus: event.shiftKey ? '_' : '-',
      Digit0: event.shiftKey ? '=' : '0',
    };
    if (Object.prototype.hasOwnProperty.call(fallbackByCode, event.code)) {
      return fallbackByCode[event.code];
    }
  }
  if (event && event.key === ' ' && event.code === 'Equal') {
    return event.shiftKey ? '+' : '=';
  }
  return String(event.key || '');
}

export function startEditingCell(app, input) {
  if (!input) return;
  if (typeof app.enterCellEditing === 'function') {
    app.enterCellEditing(input, { origin: 'cell' });
    return;
  }
  app.grid.setEditing(input, true);
}

export function setActiveInput(app, input) {
  if (app.activeInput && app.activeInput.parentElement) {
    app.activeInput.parentElement.classList.remove('active-cell');
  }
  app.activeInput = input;
  if (typeof app.setSelectionActiveCellId === 'function') {
    app.setSelectionActiveCellId(input && input.id ? input.id : '');
  } else {
    app.activeCellId = input && input.id ? String(input.id).toUpperCase() : '';
  }
  app.activeInput.parentElement.classList.add('active-cell');
  var rawValue = app.getRawCellValue(input.id);
  var attachment = app.parseAttachmentSource(rawValue);
  var editingDraft =
    typeof app.getEditingSessionDraft === 'function'
      ? app.getEditingSessionDraft(input.id)
      : null;
  var displayValue =
    editingDraft != null
      ? editingDraft
      : attachment
        ? String(attachment.name || '')
        : rawValue;
  if (typeof app.syncActiveEditorValue === 'function') {
    app.syncActiveEditorValue(displayValue);
  } else {
    app.formulaInput.value = displayValue;
  }
  if (!app.extendSelectionNav) {
    setSelectionAnchor(app, input.id);
    clearSelectionRange(app);
  }
  updateAxisHeaderHighlight(app);
  applyDependencyHighlight(app);
  app.syncCellNameInput();
  app.syncCellFormatControl();
  app.syncCellPresentationControls();
  app.syncAIDraftLock();
  app.syncAttachButtonState();
  if (typeof app.syncChannelBindingControl === 'function') {
    app.syncChannelBindingControl();
  }
  if (typeof app.publishUiState === 'function') app.publishUiState();
}

export function clearActiveInput(app) {
  if (app.activeInput) {
    app.grid.setEditing(app.activeInput, false);
    app.activeInput.parentElement.classList.remove('active-cell');
    if (typeof app.clearEditingSession === 'function') {
      app.clearEditingSession({ cellId: app.activeInput.id });
    }
  }
  app.activeInput = null;
  if (typeof app.setSelectionActiveCellId === 'function') {
    app.setSelectionActiveCellId('');
  } else {
    app.activeCellId = '';
  }
  app.formulaInput.value = '';
  clearSelectionRange(app);
  updateAxisHeaderHighlight(app);
  clearDependencyHighlight(app);
  app.syncCellNameInput();
  app.syncCellFormatControl();
  app.syncCellPresentationControls();
  app.syncAIDraftLock();
  app.syncAttachButtonState();
  if (typeof app.syncChannelBindingControl === 'function') {
    app.syncChannelBindingControl();
  }
  if (typeof app.publishUiState === 'function') app.publishUiState();
}

export function ensureActiveCell(app) {
  if (app.isReportActive()) return;
  if (app.activeInput) return;
  var fallback =
    (typeof app.getCellInput === 'function' ? app.getCellInput('A1') : null) ||
    (typeof app.getFirstAvailableInput === 'function'
      ? app.getFirstAvailableInput()
      : null) ||
    app.inputById['A1'] ||
    app.inputs[0];
  if (!fallback) return;
  setActiveInput(app, fallback);
  if (typeof app.focusCellProxy === 'function') {
    app.focusCellProxy(fallback);
    return;
  }
  if (document.activeElement !== fallback) {
    fallback.focus();
  }
}

export function setSelectionAnchor(app, cellId) {
  app.selectionAnchorId = String(cellId || '').toUpperCase();
}

export function clearSelectionRange(app) {
  clearSelectionRangeModel(app);
  clearSelectionHighlight(app);
  app.syncAttachButtonState();
  if (typeof app.publishUiState === 'function') app.publishUiState();
}

export function clearSelectionHighlight(app) {
  app.inputs.forEach((input) => {
    input.parentElement.classList.remove('selected-range');
  });
  clearHeaderSelectionHighlight(app);
}

export function setSelectionRange(app, anchorId, targetId) {
  var source = app.parseCellId(anchorId);
  var target = app.parseCellId(targetId);
  if (!source || !target) {
    clearSelectionRange(app);
    return;
  }

  setSelectionRangeModel(app, {
    startCol: Math.min(source.col, target.col),
    endCol: Math.max(source.col, target.col),
    startRow: Math.min(source.row, target.row),
    endRow: Math.max(source.row, target.row),
  });
  highlightSelectionRange(app);
  app.syncAttachButtonState();
  if (typeof app.publishUiState === 'function') app.publishUiState();
}

export function highlightSelectionRange(app) {
  clearSelectionHighlight(app);
  var selectionRange = getSelectionRangeModel(app);
  if (!selectionRange) return;
  var maxRow = app.table.rows.length - 1;
  var maxCol = app.table.rows[0].cells.length - 1;

  app.inputs.forEach((input) => {
    var parsed = app.parseCellId(input.id);
    if (!parsed) return;
    if (
      parsed.col < selectionRange.startCol ||
      parsed.col > selectionRange.endCol
    )
      return;
    if (
      parsed.row < selectionRange.startRow ||
      parsed.row > selectionRange.endRow
    )
      return;
    input.parentElement.classList.add('selected-range');
  });

  if (
    selectionRange.startCol === 1 &&
    selectionRange.endCol === maxCol
  ) {
    for (var row = selectionRange.startRow; row <= selectionRange.endRow; row++) {
      if (row < 1 || row > maxRow) continue;
      app.table.rows[row].cells[0].classList.add('selected-row-header');
    }
  }
  if (
    selectionRange.startRow === 1 &&
    selectionRange.endRow === maxRow
  ) {
    for (var col = selectionRange.startCol; col <= selectionRange.endCol; col++) {
      if (col < 1 || col > maxCol) continue;
      app.table.rows[0].cells[col].classList.add('selected-col-header');
    }
  }
  if (
    selectionRange.startCol === 1 &&
    selectionRange.endCol === maxCol &&
    selectionRange.startRow === 1 &&
    selectionRange.endRow === maxRow
  ) {
    app.table.rows[0].cells[0].classList.add('selected-corner-header');
  }
  updateAxisHeaderHighlight(app);
}
