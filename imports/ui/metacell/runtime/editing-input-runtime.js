import { moveAfterCellEditingEnter } from './editor-controller-runtime.js';

export function bindCellInputEditingEvents(app, input) {
  input.addEventListener('focus', (e) => {
    app.setActiveInput(e.target);
    app.syncAIDraftLock();
    if (
      app.isEditingCell(e.target) &&
      typeof app.focusEditorOverlayInput === 'function'
    ) {
      app.editorOverlayPendingFocus = true;
      requestAnimationFrame(() => app.focusEditorOverlayInput());
    }
  });

  input.addEventListener('blur', (e) => {
    if (
      app.editorOverlayPendingFocus ||
      app.editorOverlayInput &&
      (e.relatedTarget === app.editorOverlayInput ||
        document.activeElement === app.editorOverlayInput)
    ) {
      return;
    }
    app.handleCellEditingBlur(e.target, {
      wasEditing: app.isEditingCell(e.target),
      origin: 'cell',
    });
  });

  input.addEventListener('keydown', (e) => {
    if (!app.isEditingCell(input)) return;
    if (app.handleMentionAutocompleteKeydown(e, input)) return;
    if (
      (e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight') &&
      app.canInsertFormulaMention(input.value)
    ) {
      e.preventDefault();
      app.handleCellMentionNavigation(input, e.key, {
        jump: !!(e.metaKey || e.ctrlKey),
        extendRange: !!e.shiftKey,
        origin: 'cell',
      });
      return;
    }
    if (!e.metaKey && !e.ctrlKey && e.key === 'Enter') {
      if (app.finishCrossTabMentionAndReturnToSource()) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      app.handleCellEditingEnter(input, { origin: 'cell' });
      moveAfterCellEditingEnter(app, input, { reverse: !!e.shiftKey });
      return;
    }
    if (
      !e.metaKey &&
      !e.ctrlKey &&
      e.key === 'Escape' &&
      app.isEditingCell(input)
    ) {
      e.preventDefault();
      app.handleCellEditingEscape(input);
      return;
    }
  });

  input.addEventListener('input', () => {
    if (!app.isEditingCell(input)) return;
    app.handleCellInputDraft(input, { origin: 'cell' });
  });

  input.addEventListener('blur', () => {
    app.syncAIDraftLock();
    app.hideMentionAutocompleteSoon();
  });

  input.addEventListener('paste', (e) => {
    if (!app.isEditingCell(input)) return;
    var text =
      e.clipboardData && e.clipboardData.getData
        ? e.clipboardData.getData('text/plain')
        : '';
    if (typeof text !== 'string') return;
    e.preventDefault();
    app.applyPastedText(text);
  });

  input.addEventListener('copy', (e) => {
    if (!app.isEditingCell(input)) return;
    var text = app.getSelectedRangeText();
    if (!text) return;
    if (e.clipboardData && e.clipboardData.setData) {
      e.preventDefault();
      e.clipboardData.setData('text/plain', text);
    }
  });
}

export function bindOverlayEditingInputEvents(app) {
  if (!app || !app.editorOverlayInput || app.editorOverlayInputBound) return;
  var overlayInput = app.editorOverlayInput;
  app.editorOverlayInputBound = true;

  var getSourceInput = () => app.activeInput || null;

  overlayInput.addEventListener('focus', () => {
    app.editorOverlayPendingFocus = false;
    app.syncAIDraftLock();
  });

  overlayInput.addEventListener('blur', () => {
    var sourceInput = getSourceInput();
    if (!sourceInput) return;
    sourceInput.value = overlayInput.value;
    app.handleCellEditingBlur(sourceInput, {
      wasEditing: app.isEditingCell(sourceInput),
      origin: 'cell',
    });
    app.syncAIDraftLock();
    app.hideMentionAutocompleteSoon();
  });

  overlayInput.addEventListener('keydown', (e) => {
    var sourceInput = getSourceInput();
    if (!sourceInput) return;
    sourceInput.value = overlayInput.value;
    if (app.handleMentionAutocompleteKeydown(e, overlayInput)) {
      sourceInput.value = overlayInput.value;
      return;
    }
    if (
      app.isEditingCell(sourceInput) &&
      (e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight') &&
      app.canInsertFormulaMention(overlayInput.value)
    ) {
      e.preventDefault();
      app.handleCellMentionNavigation(sourceInput, e.key, {
        jump: !!(e.metaKey || e.ctrlKey),
        extendRange: !!e.shiftKey,
        origin: 'cell',
      });
      overlayInput.value = sourceInput.value;
      return;
    }
    if (!e.metaKey && !e.ctrlKey && e.key === 'Enter') {
      if (app.finishCrossTabMentionAndReturnToSource()) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      sourceInput.value = overlayInput.value;
      app.handleCellEditingEnter(sourceInput, { origin: 'cell' });
      moveAfterCellEditingEnter(app, sourceInput, { reverse: !!e.shiftKey });
      return;
    }
    if (
      !e.metaKey &&
      !e.ctrlKey &&
      e.key === 'Escape' &&
      app.isEditingCell(sourceInput)
    ) {
      e.preventDefault();
      app.handleCellEditingEscape(sourceInput);
      overlayInput.value = sourceInput.value;
      return;
    }
  });

  overlayInput.addEventListener('input', () => {
    var sourceInput = getSourceInput();
    if (!sourceInput) return;
    sourceInput.value = overlayInput.value;
    app.handleCellInputDraft(sourceInput, { origin: 'cell' });
    overlayInput.value = sourceInput.value;
  });

  overlayInput.addEventListener('paste', (e) => {
    var text =
      e.clipboardData && e.clipboardData.getData
        ? e.clipboardData.getData('text/plain')
        : '';
    if (typeof text !== 'string') return;
    e.preventDefault();
    app.applyPastedText(text);
    var sourceInput = getSourceInput();
    if (!sourceInput) return;
    overlayInput.value = sourceInput.value;
  });

  overlayInput.addEventListener('copy', (e) => {
    var text = app.getSelectedRangeText();
    if (!text) return;
    if (e.clipboardData && e.clipboardData.setData) {
      e.preventDefault();
      e.clipboardData.setData('text/plain', text);
    }
  });
}
