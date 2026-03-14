export function getSelectionStartCellId(app) {
  if (app.selectionRange) {
    return app.formatCellId(
      app.selectionRange.startCol,
      app.selectionRange.startRow,
    );
  }
  return app.activeInput ? app.activeInput.id : null;
}

export function getSelectedCellIds(app) {
  if (!app.selectionRange) {
    return app.activeInput ? [app.activeInput.id] : [];
  }
  var ids = [];
  for (
    var row = app.selectionRange.startRow;
    row <= app.selectionRange.endRow;
    row++
  ) {
    for (
      var col = app.selectionRange.startCol;
      col <= app.selectionRange.endCol;
      col++
    ) {
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
  if (app.selectionRange) {
    for (
      var row = app.selectionRange.startRow;
      row <= app.selectionRange.endRow;
      row++
    ) {
      var cols = [];
      for (
        var col = app.selectionRange.startCol;
        col <= app.selectionRange.endCol;
        col++
      ) {
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
  } else if (app.activeInput && typeof app.activeInput.focus === 'function') {
    app.activeInput.focus();
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

  if (app.selectionRange && matrix.length === 1 && matrix[0].length === 1) {
    for (
      var r = app.selectionRange.startRow;
      r <= app.selectionRange.endRow;
      r++
    ) {
      for (
        var c = app.selectionRange.startCol;
        c <= app.selectionRange.endCol;
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

  if (app.activeInput && changed[app.activeInput.id]) {
    app.activeInput.value = app.getRawCellValue(app.activeInput.id);
    app.formulaInput.value = app.activeInput.value;
  }

  app.aiService.notifyActiveCellChanged();
  app.computeAll();
}

export function clearSelectedCells(app) {
  var ids = getSelectedCellIds(app);
  if (!ids.length && app.activeInput) {
    ids = [app.activeInput.id];
  }
  if (!ids.length) return;
  app.captureHistorySnapshot('clear:' + app.activeSheetId);

  for (var i = 0; i < ids.length; i++) {
    app.setCellSchedule(ids[i], null);
    app.setRawCellValue(ids[i], '');
  }

  if (app.activeInput && ids.indexOf(app.activeInput.id) !== -1) {
    app.activeInput.value = '';
    app.formulaInput.value = '';
  }

  app.aiService.notifyActiveCellChanged();
  app.computeAll();
}

export function clearFillRangeHighlight(app) {
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
  if (
    app.activeInput &&
    app.isEditingCell(app.activeInput) &&
    app.canInsertFormulaMention(app.activeInput.value)
  ) {
    mentionInput = app.activeInput;
  } else if (
    document.activeElement === app.formulaInput &&
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
  var input = td.querySelector('input');
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
  targetInput.focus();
  app.extendSelectionNav = false;
}

export function syncMentionPreviewToUi(app, mentionInput) {
  if (!mentionInput) return;
  if (app.syncCrossTabMentionSourceValue(mentionInput.value)) {
    if (mentionInput !== app.formulaInput)
      app.formulaInput.value = mentionInput.value;
    return;
  }
  if (mentionInput === app.formulaInput) {
    if (!app.activeInput) return;
    app.activeInput.value = mentionInput.value;
    app.setRawCellValue(app.activeInput.id, mentionInput.value);
    return;
  }
  if (app.activeInput === mentionInput) {
    app.formulaInput.value = mentionInput.value;
  }
}

export function onFillDragMove(app, event) {
  if (!app.fillDrag) return;
  var el = document.elementFromPoint(event.clientX, event.clientY);
  if (!el || !el.closest) return;
  var td = el.closest('td');
  if (!td) return;
  var input = td.querySelector('input');
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
