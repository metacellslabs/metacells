import {
  getSelectionRangeState,
  setSelectionFillRangeState,
} from './selection-range-facade.js';
import { applyActiveSourceCellEdit } from './source-edit-facade.js';

function getActiveCellId(app) {
  return typeof app.getSelectionActiveCellId === 'function'
    ? app.getSelectionActiveCellId()
    : String(app.activeCellId || '').toUpperCase();
}

function resolveSpillSourceInput(app, input) {
  if (!app || !input) return input;
  if (typeof app.getSpillSourceForCell !== 'function') return input;
  var sourceCellId = app.getSpillSourceForCell(app.activeSheetId, input.id);
  if (!sourceCellId || sourceCellId === String(input.id || '').toUpperCase()) {
    return input;
  }
  return (typeof app.getCellInput === 'function'
    ? app.getCellInput(sourceCellId)
    : app.inputById && app.inputById[sourceCellId]) || input;
}

function getPointTargetElements(clientX, clientY) {
  if (
    typeof document !== 'undefined' &&
    document &&
    typeof document.elementsFromPoint === 'function'
  ) {
    return document.elementsFromPoint(clientX, clientY) || [];
  }
  if (
    typeof document !== 'undefined' &&
    document &&
    typeof document.elementFromPoint === 'function'
  ) {
    var single = document.elementFromPoint(clientX, clientY);
    return single ? [single] : [];
  }
  return [];
}

function getCellInputFromPoint(app, clientX, clientY, options) {
  var opts = options && typeof options === 'object' ? options : {};
  var resolveSpillSource = opts.resolveSpillSource !== false;
  var elements = getPointTargetElements(clientX, clientY);
  for (var index = 0; index < elements.length; index++) {
    var el = elements[index];
    if (!el || !el.closest) continue;
    var td = el.closest('td');
    if (!td) continue;
    if (app && app.table && td.closest('table') !== app.table) continue;
    var input = td.querySelector('.cell-anchor-input');
    if (!input) continue;
    return resolveSpillSource ? resolveSpillSourceInput(app, input) : input;
  }
  return null;
}

export function clearFillRangeHighlight(app) {
  setSelectionFillRangeState(app, null);
  var iterate =
    typeof app.forEachInput === 'function'
      ? app.forEachInput.bind(app)
      : function (callback) {
          (app.inputs || []).forEach(callback);
        };
  iterate((input) => {
    if (!input || !input.parentElement) return;
    input.parentElement.classList.remove('fill-range');
    input.parentElement.classList.remove('fill-range-overwrite');
  }, { includeDetached: false });
}

export function highlightFillRange(app, sourceId, targetId) {
  clearFillRangeHighlight(app);
  var source = app.parseCellId(sourceId);
  var target = app.parseCellId(targetId);
  if (!source || !target) return;

  var minCol = Math.min(source.col, target.col);
  var maxCol = Math.max(source.col, target.col);
  var minRow = Math.min(source.row, target.row);
  var maxRow = Math.max(source.row, target.row);
  var nextRange = {
    startCol: minCol,
    endCol: maxCol,
    startRow: minRow,
    endRow: maxRow,
    sourceId: String(sourceId || '').toUpperCase(),
    targetId: String(targetId || '').toUpperCase(),
  };
  setSelectionFillRangeState(app, nextRange);

  var iterate =
    typeof app.forEachInput === 'function'
      ? app.forEachInput.bind(app)
      : function (callback) {
          (app.inputs || []).forEach(callback);
        };
  iterate((input) => {
    var parsed = app.parseCellId(input.id);
    if (!parsed) return;
    if (parsed.col < minCol || parsed.col > maxCol) return;
    if (parsed.row < minRow || parsed.row > maxRow) return;
    if (input.id === sourceId) return;
    if (!input.parentElement) return;
    input.parentElement.classList.add('fill-range');
    var existingRaw = String(app.getRawCellValue(input.id) || '');
    var existingDisplay = String(
      app.storage.getCellDisplayValue(app.activeSheetId, input.id) || '',
    );
    var generatedBy = String(
      app.storage.getGeneratedCellSource(app.activeSheetId, input.id) || '',
    );
    if (existingRaw || existingDisplay || generatedBy) {
      input.parentElement.classList.add('fill-range-overwrite');
    }
  }, { includeDetached: false });
}

export function startFillDrag(app, sourceInput, event) {
  app.setActiveInput(sourceInput);
  app.fillDrag = {
    sourceId: sourceInput.id,
    sourceRaw: app.getRawCellValue(sourceInput.id),
    targetId: sourceInput.id,
  };

  var onMove = (moveEvent) => onFillDragMove(app, moveEvent);
  var onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    finishFillDrag(app);
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  onFillDragMove(app, event);
}

export function startSelectionDrag(app, sourceInput, event) {
  if (!sourceInput) return;
  event.preventDefault();
  var startX =
    event && typeof event.clientX === 'number' ? Number(event.clientX) : 0;
  var startY =
    event && typeof event.clientY === 'number' ? Number(event.clientY) : 0;
  var mentionInput = null;
  var activeEditor =
    typeof app.getActiveEditorInput === 'function'
      ? app.getActiveEditorInput()
      : app.activeInput;
  var activeInput = app.getActiveCellInput
    ? app.getActiveCellInput()
    : app.activeInput;
  if (
    activeInput &&
    app.isEditingCell(activeInput) &&
    app.canInsertFormulaMention(
      String(activeEditor && activeEditor.value != null ? activeEditor.value : ''),
    )
  ) {
    mentionInput =
      app.editorOverlayInput &&
      (typeof app.isEditorElementFocused === 'function'
        ? app.isEditorElementFocused(app.editorOverlayInput)
        : false)
        ? app.editorOverlayInput
        : activeInput;
  } else if (
    (typeof app.isEditorElementFocused === 'function'
      ? app.isEditorElementFocused(app.formulaInput)
      : false) &&
    app.canInsertFormulaMention(app.formulaInput.value)
  ) {
    mentionInput = app.formulaInput;
  }

  app.selectionDrag = {
    anchorId: sourceInput.id,
    targetId: sourceInput.id,
    sourceId: sourceInput.id,
    startX: startX,
    startY: startY,
    activated: false,
    moved: false,
    mentionMode: !!mentionInput,
    mentionInput: mentionInput,
  };

  var onMove = (moveEvent) => onSelectionDragMove(app, moveEvent);
  var onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    finishSelectionDrag(app);
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

export function onSelectionDragMove(app, event) {
  if (!app.selectionDrag) return;
  if (!app.selectionDrag.activated) {
    var moveX =
      event && typeof event.clientX === 'number' ? Number(event.clientX) : 0;
    var moveY =
      event && typeof event.clientY === 'number' ? Number(event.clientY) : 0;
    var deltaX = Math.abs(moveX - Number(app.selectionDrag.startX || 0));
    var deltaY = Math.abs(moveY - Number(app.selectionDrag.startY || 0));
    if (deltaX < 4 && deltaY < 4) return;
    app.selectionDrag.activated = true;
    if (!app.selectionDrag.mentionMode) {
      var sourceInput =
        typeof app.getCellInput === 'function'
          ? app.getCellInput(app.selectionDrag.sourceId)
          : app.inputById
            ? app.inputById[app.selectionDrag.sourceId]
            : null;
      if (sourceInput) app.setActiveInput(sourceInput);
    }
    app.setSelectionAnchor(app.selectionDrag.anchorId);
    app.setSelectionRange(app.selectionDrag.anchorId, app.selectionDrag.anchorId);
    if (app.selectionDrag.mentionMode && app.selectionDrag.mentionInput) {
      app.formulaRefCursorId = app.selectionDrag.anchorId;
      var firstToken = app.buildMentionTokenForSelection(
        app.selectionDrag.anchorId,
        true,
      );
      app.applyFormulaMentionPreview(app.selectionDrag.mentionInput, firstToken);
      syncMentionPreviewToUi(app, app.selectionDrag.mentionInput);
    }
  }
  var input = getCellInputFromPoint(app, event.clientX, event.clientY);
  if (!input) return;

  if (app.selectionDrag.targetId !== input.id) {
    app.selectionDrag.moved = true;
    app.selectionDrag.targetId = input.id;
    app.setSelectionRange(app.selectionDrag.anchorId, input.id);
    if (app.selectionDrag.mentionMode && app.selectionDrag.mentionInput) {
      app.formulaRefCursorId = input.id;
      var mentionToken = app.buildMentionTokenForSelection(input.id, true);
      app.applyFormulaMentionPreview(
        app.selectionDrag.mentionInput,
        mentionToken,
      );
      syncMentionPreviewToUi(app, app.selectionDrag.mentionInput);
    }
  }
}

export function finishSelectionDrag(app) {
  if (!app.selectionDrag) return;
  var targetId = app.selectionDrag.targetId;
  var activated = !!app.selectionDrag.activated;
  var moved = !!app.selectionDrag.moved;
  var mentionMode = !!app.selectionDrag.mentionMode;
  var mentionInput = app.selectionDrag.mentionInput;
  app.selectionDrag = null;
  app.selectionDragJustFinished = activated && (moved || mentionMode);

  if (!activated) return;

  if (mentionMode && mentionInput) {
    syncMentionPreviewToUi(app, mentionInput);
    if (typeof mentionInput.focus === 'function') mentionInput.focus();
    return;
  }

  var targetInput =
    typeof app.getCellInput === 'function'
      ? app.getCellInput(targetId)
      : app.inputById[targetId];
  if (!targetInput) return;
  app.extendSelectionNav = true;
  if (typeof app.focusCellProxy === 'function') {
    app.focusCellProxy(targetInput);
  } else {
    targetInput.focus();
  }
  app.extendSelectionNav = false;
}

export function syncMentionPreviewToUi(app, mentionInput) {
  if (!mentionInput) return;
  var activeCellId = String(getActiveCellId(app) || '');
  if (app.syncCrossTabMentionSourceValue(mentionInput.value)) {
    if (mentionInput !== app.formulaInput)
      app.syncActiveEditorValue(mentionInput.value, { syncOverlay: false });
    return;
  }
  if (mentionInput === app.formulaInput) {
    if (!activeCellId) return;
    app.syncActiveEditorValue(mentionInput.value, { syncOverlay: false });
    applyActiveSourceCellEdit(app, {
      cellId: activeCellId,
      rawValue: mentionInput.value,
    });
    return;
  }
  if (
    mentionInput &&
    activeCellId &&
    mentionInput.id &&
    String(mentionInput.id || '').toUpperCase() === activeCellId
  ) {
    app.syncActiveEditorValue(mentionInput.value, { syncOverlay: false });
  }
  if (mentionInput === app.editorOverlayInput && activeCellId) {
    app.syncActiveEditorValue(mentionInput.value);
  }
}

export function onFillDragMove(app, event) {
  if (!app.fillDrag) return;
  var input = getCellInputFromPoint(app, event.clientX, event.clientY, {
    resolveSpillSource: false,
  });
  if (!input) return;

  app.fillDrag.targetId = input.id;
  highlightFillRange(app, app.fillDrag.sourceId, app.fillDrag.targetId);
}

export function finishFillDrag(app) {
  if (!app.fillDrag) return;
  app.captureHistorySnapshot('fill:' + app.activeSheetId);

  var source = app.parseCellId(app.fillDrag.sourceId);
  var target = app.parseCellId(app.fillDrag.targetId);
  var sourceRaw = app.fillDrag.sourceRaw;

  if (source && target && sourceRaw !== '') {
    var minCol = Math.min(source.col, target.col);
    var maxCol = Math.max(source.col, target.col);
    var minRow = Math.min(source.row, target.row);
    var maxRow = Math.max(source.row, target.row);

    for (var row = minRow; row <= maxRow; row++) {
      for (var col = minCol; col <= maxCol; col++) {
        var cellId = app.formatCellId(col, row);
        if (cellId === app.fillDrag.sourceId) continue;
        var dRow = row - source.row;
        var dCol = col - source.col;
        var nextValue =
          sourceRaw.charAt(0) === '=' ||
          sourceRaw.charAt(0) === "'" ||
          sourceRaw.charAt(0) === '>' ||
          sourceRaw.charAt(0) === '#'
            ? app.shiftFormulaReferences(sourceRaw, dRow, dCol)
            : sourceRaw;
        applyActiveSourceCellEdit(app, {
          cellId: cellId,
          rawValue: nextValue,
        });
      }
    }
  }

  app.fillDrag = null;
  clearFillRangeHighlight(app);
  app.aiService.notifyActiveCellChanged();
  app.computeAll();
}
