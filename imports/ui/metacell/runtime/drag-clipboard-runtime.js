function getSelectionRangeState(app) {
  return typeof app.getSelectionRange === 'function'
    ? app.getSelectionRange()
    : app.selectionRange;
}

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
  return (app.inputById && app.inputById[sourceCellId]) || input;
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
  var focusedElement = document.activeElement;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {
      copyTextFallback(app, text, focusedElement);
    });
    return;
  }
  copyTextFallback(app, text, focusedElement);
}

export function pasteFromClipboard(app) {
  if (!navigator.clipboard || !navigator.clipboard.readText) return;
  navigator.clipboard
    .readText()
    .then((text) => applyPastedText(app, String(text || '')))
    .catch(() => {});
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
        if (app.inputById[cellId]) {
          app.setRawCellValue(cellId, matrix[0][0]);
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
        if (!app.inputById[targetCellId]) continue;
        app.setRawCellValue(targetCellId, matrix[rowIndex][colIndex]);
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
  app.captureHistorySnapshot('clear:' + app.activeSheetId);

  for (var i = 0; i < ids.length; i++) {
    var sourceCellId = String(ids[i] || '').toUpperCase();
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
    app.setRawCellValue(ids[i], '');
  }

  if (activeCellId && ids.indexOf(activeCellId) !== -1) {
    app.syncActiveEditorValue('');
  }

  app.aiService.notifyActiveCellChanged();
  app.renderCurrentSheetFromStorage();
  app.computeAll();
}

export function clearFillRangeHighlight(app) {
  if (typeof app.setSelectionFillRange === 'function') {
    app.setSelectionFillRange(null);
  } else {
    app.fillRange = null;
  }
  app.inputs.forEach((input) => {
    input.parentElement.classList.remove('fill-range');
  });
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
  if (typeof app.setSelectionFillRange === 'function') {
    app.setSelectionFillRange(nextRange);
  } else {
    app.fillRange = nextRange;
  }

  app.inputs.forEach((input) => {
    var parsed = app.parseCellId(input.id);
    if (!parsed) return;
    if (parsed.col < minCol || parsed.col > maxCol) return;
    if (parsed.row < minRow || parsed.row > maxRow) return;
    if (input.id === sourceId) return;
    input.parentElement.classList.add('fill-range');
  });
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

  if (!mentionInput) {
    app.setActiveInput(sourceInput);
  }
  app.setSelectionAnchor(sourceInput.id);
  app.setSelectionRange(sourceInput.id, sourceInput.id);
  app.selectionDrag = {
    anchorId: sourceInput.id,
    targetId: sourceInput.id,
    moved: false,
    mentionMode: !!mentionInput,
    mentionInput: mentionInput,
  };

  if (mentionInput) {
    app.formulaRefCursorId = sourceInput.id;
    var firstToken = app.buildMentionTokenForSelection(sourceInput.id, true);
    app.applyFormulaMentionPreview(mentionInput, firstToken);
    syncMentionPreviewToUi(app, mentionInput);
  }

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
  var el = document.elementFromPoint(event.clientX, event.clientY);
  if (!el || !el.closest) return;
  var td = el.closest('td');
  if (!td) return;
  var input = resolveSpillSourceInput(
    app,
    td.querySelector('.cell-anchor-input'),
  );
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
  var moved = !!app.selectionDrag.moved;
  var mentionMode = !!app.selectionDrag.mentionMode;
  var mentionInput = app.selectionDrag.mentionInput;
  app.selectionDrag = null;
  app.selectionDragJustFinished = moved || mentionMode;

  if (mentionMode && mentionInput) {
    syncMentionPreviewToUi(app, mentionInput);
    if (typeof mentionInput.focus === 'function') mentionInput.focus();
    return;
  }

  var targetInput = app.inputById[targetId];
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
    app.setRawCellValue(activeCellId, mentionInput.value);
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
  var el = document.elementFromPoint(event.clientX, event.clientY);
  if (!el || !el.closest) return;
  var td = el.closest('td');
  if (!td) return;
  var input = resolveSpillSourceInput(
    app,
    td.querySelector('.cell-anchor-input'),
  );
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
        app.setRawCellValue(cellId, nextValue);
      }
    }
  }

  app.fillDrag = null;
  clearFillRangeHighlight(app);
  app.aiService.notifyActiveCellChanged();
  app.computeAll();
}
