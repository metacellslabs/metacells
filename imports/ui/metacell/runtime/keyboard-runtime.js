import { applyPresentationToSelection } from './editor-controls-runtime.js';

export function setupButtons(app) {
  app.addTabButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    app.toggleAddTabMenu();
  });
  app.deleteTabButton.addEventListener('click', () => app.deleteActiveTab());
  if (app.undoButton)
    app.undoButton.addEventListener('click', () => app.undo());
  if (app.redoButton)
    app.redoButton.addEventListener('click', () => app.redo());

  document.addEventListener('click', (e) => {
    if (!app.addTabMenu || app.addTabMenu.style.display === 'none') return;
    if (e.target === app.addTabButton) return;
    if (
      app.addTabButton &&
      app.addTabButton.contains &&
      app.addTabButton.contains(e.target)
    )
      return;
    if (app.addTabMenu.contains && app.addTabMenu.contains(e.target)) return;
    app.hideAddTabMenu();
  });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      var key = String(e.key || '').toLowerCase();
      var activeEl = document.activeElement;
      var isReportEditing = !!(
        activeEl &&
        app.reportEditor &&
        activeEl === app.reportEditor &&
        app.reportMode === 'edit'
      );
      var shouldUseWorkbookHistory =
        !app.hasPendingLocalEdit() && !isReportEditing;
      if (shouldUseWorkbookHistory && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) app.redo();
        else app.undo();
        return;
      }
      if (shouldUseWorkbookHistory && key === 'y') {
        e.preventDefault();
        app.redo();
        return;
      }
      if (
        shouldUseWorkbookHistory &&
        (key === '/' || key === '?' || e.code === 'Slash')
      ) {
        e.preventDefault();
        app.setDisplayMode(
          app.displayMode === 'formulas' ? 'values' : 'formulas',
        );
        return;
      }
      if (
        !isReportEditing &&
        key === 'b' &&
        app.activeInput &&
        !app.isReportActive()
      ) {
        e.preventDefault();
        var currentBold = app.storage.getCellPresentation(
          app.activeSheetId,
          app.activeInput.id,
        );
        applyPresentationToSelection(
          app,
          {
            bold: !currentBold.bold,
          },
          'cell-bold',
        );
        return;
      }
      if (
        !isReportEditing &&
        key === 'i' &&
        app.activeInput &&
        !app.isReportActive()
      ) {
        e.preventDefault();
        var currentItalic = app.storage.getCellPresentation(
          app.activeSheetId,
          app.activeInput.id,
        );
        applyPresentationToSelection(
          app,
          {
            italic: !currentItalic.italic,
          },
          'cell-italic',
        );
        return;
      }
    }
    if (e.key !== 'Escape') return;
    app.hideAddTabMenu();
  });
  window.addEventListener('resize', () => app.hideAddTabMenu());
}

export function ensureAddTabMenu(app) {
  if (app.addTabMenu) return app.addTabMenu;
  var menu = document.createElement('div');
  menu.className = 'add-tab-menu';
  menu.style.display = 'none';
  menu.innerHTML =
    '' +
    "<button type='button' class='add-tab-option' data-kind='sheet'>Sheet</button>" +
    "<button type='button' class='add-tab-option' data-kind='report'>Report</button>";
  document.body.appendChild(menu);
  menu.addEventListener('click', (e) => {
    var option =
      e.target && e.target.closest ? e.target.closest('.add-tab-option') : null;
    if (!option) return;
    var kind = option.dataset.kind;
    hideAddTabMenu(app);
    if (kind === 'report') {
      app.addReportTab();
    } else {
      app.addTab();
    }
  });
  app.addTabMenu = menu;
  return menu;
}

export function toggleAddTabMenu(app) {
  var menu = ensureAddTabMenu(app);
  if (menu.style.display !== 'none') {
    hideAddTabMenu(app);
    return;
  }
  var rect = app.addTabButton.getBoundingClientRect();
  menu.style.display = 'flex';
  menu.style.visibility = 'hidden';

  var gap = 6;
  var menuWidth = menu.offsetWidth || 120;
  var menuHeight = menu.offsetHeight || 72;
  var viewportWidth =
    window.innerWidth || document.documentElement.clientWidth || 0;
  var viewportHeight =
    window.innerHeight || document.documentElement.clientHeight || 0;

  var left = rect.left;
  if (left + menuWidth > viewportWidth - 8)
    left = viewportWidth - menuWidth - 8;
  if (left < 8) left = 8;

  var top = rect.bottom + gap;
  if (top + menuHeight > viewportHeight - 8) {
    top = rect.top - menuHeight - gap;
  }
  if (top < 8) top = 8;

  menu.style.left = Math.round(left) + 'px';
  menu.style.top = Math.round(top) + 'px';
  menu.style.visibility = 'visible';
  menu.style.display = 'flex';
}

export function hideAddTabMenu(app) {
  if (!app.addTabMenu) return;
  app.addTabMenu.style.display = 'none';
}

export function ensureContextMenu(app) {
  if (app.contextMenu) return app.contextMenu;
  var menu = document.createElement('div');
  menu.className = 'sheet-context-menu';
  menu.style.display = 'none';
  menu.innerHTML =
    '' +
    "<button type='button' class='sheet-context-item' data-action='insert-row'>Insert row</button>" +
    "<button type='button' class='sheet-context-item' data-action='insert-col'>Insert column</button>" +
    "<button type='button' class='sheet-context-item' data-action='delete-row'>Delete row</button>" +
    "<button type='button' class='sheet-context-item' data-action='delete-col'>Delete column</button>" +
    "<div class='sheet-context-sep'></div>" +
    "<button type='button' class='sheet-context-item' data-action='recalc'>Re-calc</button>" +
    "<button type='button' class='sheet-context-item' data-action='copy'>Copy</button>" +
    "<button type='button' class='sheet-context-item' data-action='paste'>Paste</button>";
  document.body.appendChild(menu);
  menu.addEventListener('click', (e) => {
    var item =
      e.target && e.target.closest
        ? e.target.closest('.sheet-context-item')
        : null;
    if (!item) return;
    var action = item.dataset.action;
    hideContextMenu(app);
    app.runContextMenuAction(action);
  });
  app.contextMenu = menu;
  return menu;
}

export function setupContextMenu(app) {
  ensureContextMenu(app);
  app.table.addEventListener('contextmenu', (e) => {
    if (app.isReportActive()) return;
    var td = e.target && e.target.closest ? e.target.closest('td') : null;
    if (!td) return;
    e.preventDefault();
    prepareContextFromCell(app, td);
    openContextMenu(app, e.clientX, e.clientY);
  });

  document.addEventListener('click', () => hideContextMenu(app));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideContextMenu(app);
  });
  window.addEventListener('resize', () => hideContextMenu(app));
}

export function prepareContextFromCell(app, td) {
  if (!td) return;
  var rowIndex = td.parentElement ? td.parentElement.rowIndex : -1;
  var colIndex = td.cellIndex;
  var maxRow = app.table.rows.length - 1;
  var maxCol = app.table.rows[0].cells.length - 1;
  if (rowIndex < 0 || colIndex < 0) return;

  if (rowIndex === 0 && colIndex > 0) {
    app.selectEntireColumn(colIndex, colIndex);
    app.contextMenuState = { type: 'col', index: colIndex };
    return;
  }
  if (colIndex === 0 && rowIndex > 0) {
    app.selectEntireRow(rowIndex, rowIndex);
    app.contextMenuState = { type: 'row', index: rowIndex };
    return;
  }
  if (
    rowIndex >= 1 &&
    rowIndex <= maxRow &&
    colIndex >= 1 &&
    colIndex <= maxCol
  ) {
    var cellId = app.cellIdFrom(colIndex, rowIndex);
    var input = app.inputById[cellId];
    if (input) {
      app.setActiveInput(input);
      app.setSelectionAnchor(cellId);
      app.clearSelectionRange();
      input.focus();
    }
    app.contextMenuState = { type: 'cell', row: rowIndex, col: colIndex };
  }
}

export function openContextMenu(app, clientX, clientY) {
  var menu = ensureContextMenu(app);
  var recalcItem = menu.querySelector("[data-action='recalc']");
  if (recalcItem) {
    recalcItem.style.display =
      app.contextMenuState && app.contextMenuState.type === 'cell'
        ? 'block'
        : 'none';
  }
  menu.style.display = 'flex';
  menu.style.visibility = 'hidden';

  var menuWidth = menu.offsetWidth || 180;
  var menuHeight = menu.offsetHeight || 220;
  var viewportWidth =
    window.innerWidth || document.documentElement.clientWidth || 0;
  var viewportHeight =
    window.innerHeight || document.documentElement.clientHeight || 0;
  var left = clientX;
  var top = clientY;

  if (left + menuWidth > viewportWidth - 8)
    left = viewportWidth - menuWidth - 8;
  if (top + menuHeight > viewportHeight - 8)
    top = viewportHeight - menuHeight - 8;
  if (left < 8) left = 8;
  if (top < 8) top = 8;

  menu.style.left = Math.round(left) + 'px';
  menu.style.top = Math.round(top) + 'px';
  menu.style.visibility = 'visible';
  menu.style.display = 'flex';
}

export function hideContextMenu(app) {
  if (!app.contextMenu) return;
  app.contextMenu.style.display = 'none';
}

export function bindGridInputEvents(app) {
  app.inputs.forEach((input) => {
    input.addEventListener('focus', (e) => {
      app.setActiveInput(e.target);
      app.syncAIDraftLock();
    });

    input.addEventListener('blur', (e) => {
      var wasEditing = app.isEditingCell(e.target);
      app.grid.setEditing(e.target, false);
      app.syncAIDraftLock();
      if (!wasEditing) return;
      if (app.suppressBlurCommitOnce) {
        app.suppressBlurCommitOnce = false;
        delete app.editStartRawByCell[e.target.id];
        return;
      }
      if (
        app.crossTabMentionContext &&
        app.activeSheetId !== app.crossTabMentionContext.sourceSheetId
      ) {
        if (app.activeInput === e.target) {
          app.formulaInput.value = app.crossTabMentionContext.value;
        }
        delete app.editStartRawByCell[e.target.id];
        return;
      }
      app.formulaRefCursorId = null;
      app.formulaMentionPreview = null;
      var raw = String(e.target.value == null ? '' : e.target.value);
      var existingRaw = String(app.getRawCellValue(e.target.id) || '');
      var existingAttachment = app.parseAttachmentSource(existingRaw);
      if (existingAttachment && raw === String(existingAttachment.name || '')) {
        delete app.editStartRawByCell[e.target.id];
        if (app.activeInput === e.target) {
          app.formulaInput.value = String(existingAttachment.name || '');
        }
        return;
      }
      var hasChanged = app.hasRawCellChanged(e.target.id, raw);
      if (!hasChanged) {
        if (app.activeInput === e.target) {
          app.formulaInput.value = raw;
        }
        delete app.editStartRawByCell[e.target.id];
        return;
      }
      if (app.runTablePromptForCell(e.target.id, raw, e.target)) {
        delete app.editStartRawByCell[e.target.id];
        return;
      }
      if (app.runQuotedPromptForCell(e.target.id, raw, e.target)) {
        delete app.editStartRawByCell[e.target.id];
        return;
      }
      app.commitRawCellEdit(
        e.target.id,
        raw,
        app.beginCellUpdateTrace(e.target.id, raw),
      );
      delete app.editStartRawByCell[e.target.id];
    });

    input.addEventListener('keydown', (e) => {
      if (app.handleMentionAutocompleteKeydown(e, input)) return;
      if (
        app.isEditingCell(input) &&
        (e.key === 'ArrowUp' ||
          e.key === 'ArrowDown' ||
          e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight') &&
        app.canInsertFormulaMention(input.value)
      ) {
        e.preventDefault();
        var baseCellId = app.getFormulaMentionBaseCellId(input.id, e.key);
        var targetCellId =
          e.metaKey || e.ctrlKey
            ? app.findJumpTargetCellId(baseCellId, e.key)
            : app.findAdjacentCellId(baseCellId, e.key);
        if (!targetCellId) return;

        if (e.shiftKey) {
          if (!app.selectionRange) {
            app.setSelectionAnchor(baseCellId);
            app.setSelectionRange(baseCellId, targetCellId);
          } else {
            app.extendSelectionRangeTowardCell(targetCellId, e.key);
          }
        } else {
          app.setSelectionAnchor(targetCellId);
          app.setSelectionRange(targetCellId, targetCellId);
        }

        app.formulaRefCursorId = targetCellId;
        var mentionToken = app.buildMentionTokenForSelection(
          targetCellId,
          !!e.shiftKey,
        );
        app.applyFormulaMentionPreview(input, mentionToken);
        if (app.activeInput === input) app.formulaInput.value = input.value;
        return;
      }
      if (!app.isEditingCell(input) && app.isDirectTypeKey(e)) {
        e.preventDefault();
        app.clearSelectionRange();
        app.startEditingCell(input);
        input.value = e.key;
        if (app.activeInput === input) app.formulaInput.value = input.value;
        return;
      }
      if (!e.metaKey && !e.ctrlKey && e.key === 'Enter') {
        if (app.finishCrossTabMentionAndReturnToSource()) {
          e.preventDefault();
          return;
        }
        if (!app.isEditingCell(input)) {
          e.preventDefault();
          app.startEditingCell(input);
          return;
        }
        var hasChanged = app.hasRawCellChanged(input.id, input.value);
        if (
          hasChanged &&
          app.runTablePromptForCell(input.id, input.value, input)
        ) {
          e.preventDefault();
          app.clearSelectionRange();
          app.grid.focusCellByArrow(
            input,
            e.shiftKey ? 'ArrowRight' : 'ArrowDown',
          );
          return;
        }
        if (
          hasChanged &&
          app.runQuotedPromptForCell(input.id, input.value, input)
        ) {
          e.preventDefault();
          app.clearSelectionRange();
          app.grid.focusCellByArrow(
            input,
            e.shiftKey ? 'ArrowRight' : 'ArrowDown',
          );
          return;
        }
        if (hasChanged) {
          e.preventDefault();
          app.formulaRefCursorId = null;
          app.formulaMentionPreview = null;
          app.commitRawCellEdit(
            input.id,
            input.value,
            app.beginCellUpdateTrace(input.id, input.value),
          );
          delete app.editStartRawByCell[input.id];
          app.grid.setEditing(input, false);
          app.syncAIDraftLock();
          app.clearSelectionRange();
          app.grid.focusCellByArrow(
            input,
            e.shiftKey ? 'ArrowRight' : 'ArrowDown',
          );
          return;
        }
        e.preventDefault();
        app.clearSelectionRange();
        app.grid.focusCellByArrow(
          input,
          e.shiftKey ? 'ArrowRight' : 'ArrowDown',
        );
        return;
      }
      if (
        !e.metaKey &&
        !e.ctrlKey &&
        e.key === 'Escape' &&
        app.isEditingCell(input)
      ) {
        e.preventDefault();
        var restoreValue = Object.prototype.hasOwnProperty.call(
          app.editStartRawByCell,
          input.id,
        )
          ? app.editStartRawByCell[input.id]
          : app.getRawCellValue(input.id);
        input.value = restoreValue;
        app.grid.setEditing(input, false);
        if (app.activeInput === input) {
          app.formulaInput.value = restoreValue;
        }
        delete app.editStartRawByCell[input.id];
        app.formulaRefCursorId = null;
        app.formulaMentionPreview = null;
        app.syncAIDraftLock();
        return;
      }
      if (
        !e.metaKey &&
        !e.ctrlKey &&
        (e.key === 'Delete' || e.key === 'Backspace')
      ) {
        var target = e.target;
        var isEditing = !!(
          target &&
          target.classList &&
          target.classList.contains('editing')
        );
        var hasTextSelection =
          target &&
          typeof target.selectionStart === 'number' &&
          typeof target.selectionEnd === 'number' &&
          target.selectionStart !== target.selectionEnd;
        var hasMultiCellSelection = !!(
          app.selectionRange &&
          (app.selectionRange.startCol !== app.selectionRange.endCol ||
            app.selectionRange.startRow !== app.selectionRange.endRow)
        );
        if (!isEditing && !hasTextSelection) {
          e.preventDefault();
          app.clearSelectedCells();
          return;
        }
        if (isEditing && hasMultiCellSelection) {
          e.preventDefault();
          app.clearSelectedCells();
          return;
        }
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        var now = Date.now();
        var isDoublePress = now - app.lastSelectAllShortcutTs < 500;
        app.lastSelectAllShortcutTs = now;
        if (isDoublePress) {
          app.selectWholeSheetRegion();
        } else {
          app.selectNearestValueRegionFromActive(input);
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        app.copySelectedRangeToClipboard();
        return;
      }
      if (
        !app.isEditingCell(input) &&
        (e.metaKey || e.ctrlKey) &&
        (e.key === 'ArrowUp' ||
          e.key === 'ArrowDown' ||
          e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight')
      ) {
        e.preventDefault();
        if (e.shiftKey) {
          var hadSelection = !!app.selectionRange;
          var jumpSource = app.getSelectionEdgeInputForDirection(input, e.key);
          app.extendSelectionNav = true;
          var targetInput = app.moveToNextFilledCell(
            jumpSource || input,
            e.key,
          );
          app.extendSelectionNav = false;
          if (targetInput) {
            if (hadSelection && app.selectionRange) {
              app.extendSelectionRangeTowardCell(targetInput.id, e.key);
            } else {
              var anchor = app.selectionAnchorId || input.id;
              app.setSelectionRange(anchor, targetInput.id);
            }
          }
        } else {
          app.clearSelectionRange();
          app.moveToNextFilledCell(input, e.key);
        }
        return;
      }
      if (
        e.shiftKey &&
        (e.key === 'ArrowUp' ||
          e.key === 'ArrowDown' ||
          e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight')
      ) {
        e.preventDefault();
        app.moveSelectionByArrow(input, e.key);
        return;
      }
      if (
        !e.shiftKey &&
        (e.key === 'ArrowUp' ||
          e.key === 'ArrowDown' ||
          e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight')
      ) {
        app.clearSelectionRange();
      }
      if (!e.shiftKey && (e.key === 'Tab' || e.key === 'Enter')) {
        app.clearSelectionRange();
      }
      if (app.grid.focusCellByArrow(input, e.key)) {
        e.preventDefault();
      }
    });

    input.addEventListener('input', () => {
      if (!app.isEditingCell(input)) return;
      app.syncAIDraftLock();
      app.updateMentionAutocomplete(input);
      if (app.activeInput === input) app.formulaInput.value = input.value;
    });
    input.addEventListener('blur', () => {
      app.syncAIDraftLock();
      app.hideMentionAutocompleteSoon();
    });

    input.addEventListener('click', (e) => {
      if (e.shiftKey) {
        var anchor = app.selectionAnchorId || input.id;
        app.setSelectionRange(anchor, input.id);
        return;
      }
      app.setSelectionAnchor(input.id);
      app.clearSelectionRange();
    });

    input.addEventListener('paste', (e) => {
      var text =
        e.clipboardData && e.clipboardData.getData
          ? e.clipboardData.getData('text/plain')
          : '';
      if (typeof text !== 'string') return;
      e.preventDefault();
      app.applyPastedText(text);
    });

    input.addEventListener('copy', (e) => {
      var text = app.getSelectedRangeText();
      if (!text) return;
      if (e.clipboardData && e.clipboardData.setData) {
        e.preventDefault();
        e.clipboardData.setData('text/plain', text);
      }
    });

    input.parentElement.addEventListener('click', (e) => {
      if (app.selectionDragJustFinished) {
        app.selectionDragJustFinished = false;
        return;
      }
      if (e.target === input) return;
      if (e.target.closest && e.target.closest('.fill-handle')) return;
      if (e.target.closest && e.target.closest('.cell-actions')) return;
      var output = e.target.closest && e.target.closest('.cell-output');
      if (output) {
        var canScroll =
          output.scrollHeight > output.clientHeight ||
          output.scrollWidth > output.clientWidth;
        if (canScroll) return;
      }
      app.setActiveInput(input);
      if (e.shiftKey) {
        var rangeAnchor = app.selectionAnchorId || input.id;
        app.setSelectionRange(rangeAnchor, input.id);
      } else {
        app.setSelectionAnchor(input.id);
        app.clearSelectionRange();
      }
      input.focus();
    });

    input.parentElement.addEventListener('dblclick', (e) => {
      if (e.target.closest && e.target.closest('.fill-handle')) return;
      if (e.target.closest && e.target.closest('.cell-actions')) return;
      app.setActiveInput(input);
      app.startEditingCell(input);
    });

    input.parentElement.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest && e.target.closest('.fill-handle')) return;
      if (e.target.closest && e.target.closest('.cell-actions')) return;
      app.startSelectionDrag(input, e);
    });

    var actions = input.parentElement.querySelector('.cell-actions');
    if (actions) {
      actions.addEventListener('click', (e) => {
        var btn = e.target.closest && e.target.closest('.cell-action');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        var action = btn.dataset.action;
        if (action === 'copy') app.copyCellValue(input);
        if (action === 'fullscreen') app.openFullscreenCell(input);
        if (action === 'run') app.runFormulaForCell(input);
      });
    }

    var fillHandle = input.parentElement.querySelector('.fill-handle');
    if (fillHandle) {
      fillHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        app.startFillDrag(input, e);
      });
    }
  });
}
