import {
  handleCellEditingArrowNavigate,
  moveAfterCellEditingEnter,
} from './editor-controller-runtime.js';

function getCurrentEditingRaw(app, input) {
  if (!app || !input) return '';
  var editorInput =
    typeof app.getActiveEditorInput === 'function'
      ? app.getActiveEditorInput()
      : null;
  if (editorInput && editorInput.value != null) {
    return String(editorInput.value);
  }
  if (typeof app.getEditingSessionDraft === 'function') {
    var draft = app.getEditingSessionDraft(input.id);
    if (draft != null) return String(draft);
  }
  return String(input.value == null ? '' : input.value);
}

export function bindCellInputEditingEvents(app, input) {
  if (!input || input.dataset.boundEditing === 'true') return;
  input.dataset.boundEditing = 'true';

  input.addEventListener('focus', function (e) {
    app.setActiveInput(e.target);
    app.syncAIDraftLock();
  });

  input.addEventListener('blur', function (e) {
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

  input.addEventListener('keydown', function (e) {
    if (!app.isEditingCell(input)) return;
    if (app.handleMentionAutocompleteKeydown(e, input)) {
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
      }
      return;
    }
    if (
      (e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight') &&
      app.canInsertFormulaMention(getCurrentEditingRaw(app, input))
    ) {
      e.preventDefault();
      app.handleCellMentionNavigation(input, e.key, {
        jump: !!(e.metaKey || e.ctrlKey),
        extendRange: !!e.shiftKey,
        origin: 'cell',
      });
      return;
    }
    if (
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.shiftKey &&
      (e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight')
    ) {
      e.preventDefault();
      handleCellEditingArrowNavigate(app, input, e.key, { origin: 'cell' });
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

  input.addEventListener('input', function () {
    if (!app.isEditingCell(input)) return;
    app.handleCellInputDraft(input, { origin: 'cell' });
  });

  input.addEventListener('blur', function () {
    app.syncAIDraftLock();
    app.hideMentionAutocompleteSoon();
  });

  input.addEventListener('paste', function (e) {
    if (!app.isEditingCell(input)) return;
    if (typeof app.handleAttachmentPaste === 'function') {
      var handledAttachmentPaste = app.handleAttachmentPaste(
        input,
        e.clipboardData || null,
      );
      if (handledAttachmentPaste) {
        e.preventDefault();
        return;
      }
    }
    var text =
      e.clipboardData && e.clipboardData.getData
        ? e.clipboardData.getData('text/plain')
        : '';
    if (typeof text !== 'string') return;
    e.preventDefault();
    app.applyPastedText(text);
  });

  input.addEventListener('copy', function (e) {
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

  var getSourceInput = function () {
    return app.activeInput || null;
  };

  overlayInput.addEventListener('focus', function () {
    app.editorOverlayPendingFocus = false;
    app.syncAIDraftLock();
  });

  overlayInput.addEventListener('blur', function () {
    var sourceInput = getSourceInput();
    if (!sourceInput) return;
    if (app.editorOverlayClosing) {
      app.syncAIDraftLock();
      app.hideMentionAutocompleteSoon();
      return;
    }
    app.handleCellEditingBlur(sourceInput, {
      wasEditing: app.isEditingCell(sourceInput),
      origin: 'cell',
      rawValue: overlayInput.value,
    });
    app.syncAIDraftLock();
    app.hideMentionAutocompleteSoon();
  });

  overlayInput.addEventListener('keydown', function (e) {
    var sourceInput = getSourceInput();
    if (!sourceInput) return;
    app.syncActiveEditorValue(overlayInput.value, { syncOverlay: false });
    if (
      !e.metaKey &&
      !e.ctrlKey &&
      e.key === 'Escape' &&
      app.isEditingCell(sourceInput)
    ) {
      e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
      }
      if (typeof app.dismissEditorOverlay === 'function') {
        app.dismissEditorOverlay();
      }
      return;
    }
    if (app.handleMentionAutocompleteKeydown(e, overlayInput)) {
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
      }
      return;
    }
    if (
      app.isEditingCell(sourceInput) &&
      (e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight') &&
      app.canInsertFormulaMention(getCurrentEditingRaw(app, sourceInput))
    ) {
      e.preventDefault();
      app.handleCellMentionNavigation(sourceInput, e.key, {
        jump: !!(e.metaKey || e.ctrlKey),
        extendRange: !!e.shiftKey,
        origin: 'cell',
      });
      app.syncActiveEditorValue(sourceInput.value);
      return;
    }
    if (
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.shiftKey &&
      app.isEditingCell(sourceInput) &&
      (e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight')
    ) {
      e.preventDefault();
      app.syncActiveEditorValue(overlayInput.value, { syncOverlay: false });
      handleCellEditingArrowNavigate(app, sourceInput, e.key, {
        origin: 'cell',
      });
      return;
    }
    if (!e.metaKey && !e.ctrlKey && e.key === 'Enter') {
      if (app.finishCrossTabMentionAndReturnToSource()) {
        e.preventDefault();
        return;
      }
      return;
    }
  });

  overlayInput.addEventListener('input', function () {
    var sourceInput = getSourceInput();
    if (!sourceInput || !app.isEditingCell(sourceInput)) return;
    app.syncActiveEditorValue(overlayInput.value, { syncOverlay: false });
    app.handleCellInputDraft(sourceInput, {
      origin: 'cell',
      mentionInput: overlayInput,
    });
  });

  overlayInput.addEventListener('paste', function (e) {
    var sourceInput = getSourceInput();
    if (!sourceInput || !app.isEditingCell(sourceInput)) return;
    if (typeof app.handleAttachmentPaste === 'function') {
      var handledAttachmentPaste = app.handleAttachmentPaste(
        sourceInput,
        e.clipboardData || null,
      );
      if (handledAttachmentPaste) {
        e.preventDefault();
        return;
      }
    }
    var text =
      e.clipboardData && e.clipboardData.getData
        ? e.clipboardData.getData('text/plain')
        : '';
    if (typeof text !== 'string') return;
    e.preventDefault();
    app.syncActiveEditorValue(overlayInput.value, { syncOverlay: false });
    app.applyPastedText(text);
  });

  overlayInput.addEventListener('copy', function (e) {
    var sourceInput = getSourceInput();
    if (!sourceInput || !app.isEditingCell(sourceInput)) return;
    var text = app.getSelectedRangeText();
    if (!text) return;
    if (e.clipboardData && e.clipboardData.setData) {
      e.preventDefault();
      e.clipboardData.setData('text/plain', text);
    }
  });
}
