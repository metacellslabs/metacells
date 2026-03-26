import { getSelectionRangeState } from './selection-range-facade.js';

export function bindCellFocusProxyEvents(app, input) {
  var proxy =
    app.grid && typeof app.grid.getFocusProxy === 'function'
      ? app.grid.getFocusProxy(input)
      : input.parentElement.querySelector('.cell-focus-proxy');
  if (!proxy || proxy.dataset.bound === 'true') return;
  proxy.dataset.bound = 'true';

  proxy.addEventListener('focus', function () {
    app.setActiveInput(input);
    app.syncAIDraftLock();
  });

  proxy.addEventListener('click', function (e) {
    var targetInput = input;
    e.preventDefault();
    app.setActiveInput(targetInput);
    if (e.shiftKey) {
      var anchor = app.selectionAnchorId || targetInput.id;
      app.setSelectionRange(anchor, targetInput.id);
    } else {
      app.setSelectionAnchor(targetInput.id);
      app.clearSelectionRange();
    }
  });

  proxy.addEventListener('dblclick', function (e) {
    var targetInput = input;
    e.preventDefault();
    app.setActiveInput(targetInput);
    app.startEditingCell(targetInput);
  });

  proxy.addEventListener('keydown', function (e) {
    var targetInput = input;
    if (app.isEditingCell(targetInput) && app.isDirectTypeKey(e)) {
      var editorInput =
        (typeof app.getActiveEditorInput === 'function'
          ? app.getActiveEditorInput()
          : null) ||
        app.formulaInput ||
        targetInput;
      var currentValue =
        typeof app.getEditingSessionDraft === 'function'
          ? app.getEditingSessionDraft(targetInput.id)
          : targetInput.value;
      var raw = String(
        currentValue == null ? '' : currentValue,
      );
      var insertText =
        typeof app.getDirectTypeValue === 'function'
          ? app.getDirectTypeValue(e)
          : String(e.key || '');
      var start =
        editorInput &&
        typeof editorInput.selectionStart === 'number' &&
        document.activeElement === editorInput
          ? editorInput.selectionStart
          : raw.length;
      var end =
        editorInput &&
        typeof editorInput.selectionEnd === 'number' &&
        document.activeElement === editorInput
          ? editorInput.selectionEnd
          : raw.length;
      var nextRaw =
        raw.slice(0, start) + insertText + raw.slice(end);
      e.preventDefault();
      if (typeof app.syncActiveEditorValue === 'function') {
        app.syncActiveEditorValue(nextRaw);
      } else {
        targetInput.value = nextRaw;
      }
      if (typeof app.syncCellDraft === 'function') {
        app.syncCellDraft(targetInput, nextRaw, {
          origin: 'cell',
        });
      }
      if (app.formulaInput && typeof app.formulaInput.focus === 'function') {
        app.formulaInput.focus();
        if (typeof app.setEditorSelectionRange === 'function') {
          var nextCaret = start + insertText.length;
          app.setEditorSelectionRange(
            nextCaret,
            nextCaret,
            app.formulaInput,
          );
        }
      }
      return;
    }
    if (!app.isEditingCell(targetInput) && app.isDirectTypeKey(e)) {
      var directTypeValue =
        typeof app.getDirectTypeValue === 'function'
          ? app.getDirectTypeValue(e)
          : String(e.key || '');
      e.preventDefault();
      app.handleCellDirectType(targetInput, directTypeValue, {
        clearSelection: true,
        origin: 'cell',
      });
      return;
    }
    if (!e.metaKey && !e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      app.handleCellEditingEnter(targetInput, { origin: 'cell' });
      app.clearSelectionRange();
      return;
    }
    if (!e.metaKey && !e.ctrlKey && e.key === 'Tab') {
      e.preventDefault();
      app.clearSelectionRange();
      app.grid.focusCellByArrow(targetInput, e.shiftKey ? 'ArrowLeft' : 'ArrowRight');
      return;
    }
    if (
      !e.metaKey &&
      !e.ctrlKey &&
      (e.key === 'Delete' || e.key === 'Backspace')
    ) {
      e.preventDefault();
      app.clearSelectedCells();
      return;
    }
    if (
      !app.isEditingCell(targetInput) &&
      (e.metaKey || e.ctrlKey) &&
      (e.key === 'a' || e.key === 'A')
    ) {
      e.preventDefault();
      var now = Date.now();
      var isDoublePress = now - app.lastSelectAllShortcutTs < 500;
      app.lastSelectAllShortcutTs = now;
      if (isDoublePress) app.selectWholeSheetRegion();
      else app.selectNearestValueRegionFromActive(input);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      app.copySelectedRangeToClipboard();
      return;
    }
    if (
      !app.isEditingCell(targetInput) &&
      (e.metaKey || e.ctrlKey) &&
      (e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight')
    ) {
      e.preventDefault();
      if (e.shiftKey) {
        var currentSelectionRange = getSelectionRangeState(app);
        var hadSelection = !!currentSelectionRange;
        var jumpSource = app.getSelectionEdgeInputForDirection(
          targetInput,
          e.key,
        );
        app.extendSelectionNav = true;
        var jumpTargetInput = app.moveToNextFilledCell(
          jumpSource || targetInput,
          e.key,
        );
        app.extendSelectionNav = false;
        if (jumpTargetInput) {
          if (
            hadSelection && getSelectionRangeState(app)
          ) {
            app.extendSelectionRangeTowardCell(jumpTargetInput.id, e.key);
          } else {
            var anchor =
              (typeof app.getSelectionAnchorCellId === 'function'
                ? app.getSelectionAnchorCellId()
                : app.selectionAnchorId) || targetInput.id;
            app.setSelectionRange(anchor, jumpTargetInput.id);
          }
        }
      } else {
        app.clearSelectionRange();
        app.moveToNextFilledCell(targetInput, e.key);
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
      app.moveSelectionByArrow(targetInput, e.key);
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
    if (!e.shiftKey && e.key === 'Enter') {
      app.clearSelectionRange();
    }
    if (app.grid.focusCellByArrow(targetInput, e.key)) {
      e.preventDefault();
    }
  });
}
