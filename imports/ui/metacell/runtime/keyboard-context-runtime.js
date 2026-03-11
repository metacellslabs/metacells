export function setupContextMenu(app) {
  app.ensureContextMenu();
  app.table.addEventListener('contextmenu', (e) => {
    if (app.isReportActive()) return;
    var td = e.target && e.target.closest ? e.target.closest('td') : null;
    if (!td) return;
    e.preventDefault();
    app.prepareContextFromCell(td);
    app.openContextMenu(e.clientX, e.clientY);
  });

  document.addEventListener('click', () => app.hideContextMenu());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') app.hideContextMenu();
  });
  window.addEventListener('resize', () => app.hideContextMenu());
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
        var anchor = app.selectionAnchorId || input.id;
        app.setSelectionRange(anchor, input.id);
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
