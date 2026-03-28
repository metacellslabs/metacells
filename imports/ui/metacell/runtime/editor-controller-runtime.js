import { hasSelectionRange } from './selection-range-facade.js';

function ensureEditStartSnapshot(app, input) {
  if (!input) return;
  if (!Object.prototype.hasOwnProperty.call(app.editStartRawByCell, input.id)) {
    app.editStartRawByCell[input.id] = app.getRawCellValue(input.id);
  }
}

export function restoreFocusAfterEditingExit(app, options) {
  if (!app || typeof app.focusActiveEditor !== 'function') return;
  var opts = options || {};
  var defer = opts.defer !== false;
  if (defer) {
    requestAnimationFrame(function () {
      app.focusActiveEditor();
    });
    return;
  }
  app.focusActiveEditor();
}

function getEditingOwnerSheetId(app) {
  return typeof app.getEditingOwnerSheetId === 'function'
    ? String(app.getEditingOwnerSheetId() || '')
    : String(app.activeSheetId || '');
}

export function enterCellEditing(app, input, options) {
  if (!app || !input) return { status: 'noop', draftRaw: '' };
  var opts = options || {};
  var origin = String(opts.origin || 'cell');
  app.editorOverlayDismissedCellId = '';
  if (!app.isEditingCell(input)) {
    app.grid.setEditing(input, true);
  }
  ensureEditStartSnapshot(app, input);
  app.formulaRefCursorId = input.id;
  app.formulaMentionPreview = null;

  var rawValue = app.getRawCellValue(input.id);
  var attachment = app.parseAttachmentSource(rawValue);
  var draftRaw =
    opts.draftRaw != null
      ? String(opts.draftRaw)
      : attachment
        ? String(attachment.name || '')
        : String(rawValue == null ? '' : rawValue);

  input.value = draftRaw;
  app.beginEditingSession(input, {
    draftRaw: draftRaw,
    origin: origin,
  });
  if (typeof app.syncActiveEditorValue === 'function') {
    app.syncActiveEditorValue(draftRaw, { syncOverlay: false });
  }
  if (typeof app.syncEditorOverlay === 'function') {
    app.syncEditorOverlay();
  }
  app.syncAIDraftLock();
  if (typeof app.publishUiState === 'function') app.publishUiState();
  return { status: 'started', draftRaw: draftRaw };
}

export function enterFormulaBarEditing(app, input, options) {
  if (!app || !input) return { status: 'noop', draftRaw: '' };
  var opts = options || {};
  var result = enterCellEditing(app, input, {
    draftRaw: opts.draftRaw,
    origin: String(opts.origin || 'formula-bar'),
  });
  if (input.parentElement) {
    input.parentElement.classList.add('formula-bar-editing');
  }
  return result;
}

export function syncCellDraft(app, input, rawValue, options) {
  if (!input) return;
  var opts = options || {};
  var raw = String(rawValue == null ? '' : rawValue);
  input.value = raw;
  app.updateEditingSessionDraft(raw, {
    origin: String(opts.origin || 'cell'),
  });
  if (app.activeInput === input && app.formulaInput && opts.syncFormula !== false) {
    app.formulaInput.value = raw;
  }
  if (typeof app.syncEditorOverlay === 'function') {
    app.syncEditorOverlay();
  }
  if (typeof app.publishUiState === 'function') app.publishUiState();
}

export function cancelCellEditing(app, input, options) {
  if (!input) return '';
  var opts = options || {};
  app.editorOverlayDismissedCellId = '';
  var restoreValue = Object.prototype.hasOwnProperty.call(
    app.editStartRawByCell,
    input.id,
  )
    ? app.editStartRawByCell[input.id]
    : app.getRawCellValue(input.id);
  input.value = restoreValue;
  if (app.activeInput === input && app.formulaInput && opts.syncFormula !== false) {
    app.formulaInput.value = restoreValue;
  }
  if (input.parentElement) {
    input.parentElement.classList.remove('formula-bar-editing');
  }
  app.grid.setEditing(input, false);
  app.clearEditingSession({ cellId: input.id });
  delete app.editStartRawByCell[input.id];
  app.formulaRefCursorId = null;
  app.formulaMentionPreview = null;
  app.syncAIDraftLock();
  if (typeof app.publishUiState === 'function') app.publishUiState();
  return restoreValue;
}

export function commitCellEditing(app, input, options) {
  if (!input) return { status: 'noop' };
  var opts = options || {};
  app.editorOverlayDismissedCellId = '';
  var raw =
    opts.rawValue != null
      ? String(opts.rawValue)
      : String(input.value == null ? '' : input.value);
  var origin = String(opts.origin || 'cell');
  var deferRender = opts.deferRender === true;
  app.updateEditingSessionDraft(raw, { origin: origin });

  var existingRaw = String(app.getRawCellValue(input.id) || '');
  var existingAttachment = app.parseAttachmentSource(existingRaw);
  if (existingAttachment && raw === String(existingAttachment.name || '')) {
    if (input.parentElement) {
      input.parentElement.classList.remove('formula-bar-editing');
    }
    app.grid.setEditing(input, false);
    app.clearEditingSession({ cellId: input.id });
    delete app.editStartRawByCell[input.id];
    return { status: 'attachment-name' };
  }

  if (app.aiService && typeof app.aiService.setEditDraftLock === 'function') {
    app.aiService.setEditDraftLock(false);
  }
  app.syncServerEditLock(false);

  if (app.runTablePromptForCell(input.id, raw, input)) {
    if (input.parentElement) {
      input.parentElement.classList.remove('formula-bar-editing');
    }
    app.grid.setEditing(input, false);
    app.clearEditingSession({ cellId: input.id });
    delete app.editStartRawByCell[input.id];
    return { status: 'table-prompt' };
  }
  if (app.runQuotedPromptForCell(input.id, raw, input)) {
    if (input.parentElement) {
      input.parentElement.classList.remove('formula-bar-editing');
    }
    app.grid.setEditing(input, false);
    app.clearEditingSession({ cellId: input.id });
    delete app.editStartRawByCell[input.id];
    return { status: 'quoted-prompt' };
  }

  input.value = raw;
  if (input.parentElement) {
    input.parentElement.classList.remove('formula-bar-editing');
  }
  app.commitRawCellEdit(
    input.id,
    raw,
    app.beginCellUpdateTrace(input.id, raw),
    { deferRender: deferRender },
  );
  app.grid.setEditing(input, false);
  app.clearEditingSession({ cellId: input.id });
  delete app.editStartRawByCell[input.id];
  return { status: 'committed', raw: raw };
}

export function commitFormulaBarEditing(app, input, options) {
  if (!app || !input) return { status: 'noop' };
  var opts = options || {};
  var result = commitCellEditing(app, input, {
    rawValue:
      opts.rawValue != null
        ? String(opts.rawValue)
        : String(input.value == null ? '' : input.value),
    origin: String(opts.origin || 'formula-bar'),
  });
  app.grid.setEditing(input, false);
  app.syncAIDraftLock();
  if (typeof app.publishUiState === 'function') app.publishUiState();
  if (opts.restoreFocus) {
    restoreFocusAfterEditingExit(app);
  }
  return result;
}

export function handleCellEditingBlur(app, input, options) {
  if (!input) return { status: 'noop' };
  var opts = options || {};
  var raw =
    opts.rawValue != null
      ? String(opts.rawValue)
      : String(input.value == null ? '' : input.value);
  var wasEditing =
    opts.wasEditing != null ? !!opts.wasEditing : app.isEditingCell(input);

  if (!wasEditing) return { status: 'not-editing' };
  return commitCellEditing(app, input, {
    rawValue: raw,
    origin: String(opts.origin || 'cell'),
  });
}

export function handleCellDirectType(app, input, key, options) {
  if (!input) return { status: 'noop' };
  var opts = options || {};
  var nextRaw = String(key == null ? '' : key);
  if (opts.clearSelection !== false) {
    app.clearSelectionRange();
  }
  enterCellEditing(app, input, {
    origin: String(opts.origin || 'cell'),
  });
  syncCellDraft(app, input, nextRaw, {
    origin: String(opts.origin || 'cell'),
  });
  if (typeof app.syncActiveEditorValue === 'function') {
    app.syncActiveEditorValue(nextRaw);
  }
  if (typeof app.syncEditorOverlay === 'function') {
    app.syncEditorOverlay();
  }
  if (input && typeof input.focus === 'function') {
    input.focus();
    if (typeof app.setEditorSelectionRange === 'function') {
      app.setEditorSelectionRange(nextRaw.length, nextRaw.length, input);
    }
  }
  return { status: 'started', raw: nextRaw };
}

export function handleCellEditingEscape(app, input) {
  if (!input) return { status: 'noop' };
  cancelCellEditing(app, input, { syncFormula: true });
  restoreFocusAfterEditingExit(app, { defer: false });
  return { status: 'cancelled' };
}

export function handleCellEditingEnter(app, input, options) {
  if (!input) return { status: 'noop' };
  var opts = options || {};
  var raw = String(input.value == null ? '' : input.value);
  if (!app.isEditingCell(input)) {
    enterCellEditing(app, input, {
      origin: String(opts.origin || 'cell'),
    });
    return { status: 'started' };
  }
  return commitCellEditing(app, input, {
    rawValue: raw,
    origin: String(opts.origin || 'cell'),
    deferRender: true,
  });
}

export function handleCellMentionNavigation(app, input, key, options) {
  if (!input) return { status: 'noop' };
  var opts = options || {};
  var editorInput =
    app && typeof app.getActiveEditorInput === 'function'
      ? app.getActiveEditorInput()
      : input;
  if (
    !app.isEditingCell(input) ||
    !app.canInsertFormulaMention(
      String(editorInput && editorInput.value != null ? editorInput.value : ''),
    ) ||
    !(
      key === 'ArrowUp' ||
      key === 'ArrowDown' ||
      key === 'ArrowLeft' ||
      key === 'ArrowRight'
    )
  ) {
    return { status: 'ignored' };
  }

  var baseCellId = app.getFormulaMentionBaseCellId(input.id, key);
  var targetCellId =
    opts.jump
      ? app.findJumpTargetCellId(baseCellId, key)
      : app.findAdjacentCellId(baseCellId, key);
  if (!targetCellId) return { status: 'no-target' };

  if (opts.extendRange) {
    if (!hasSelectionRange(app)) {
      app.setSelectionAnchor(baseCellId);
      app.setSelectionRange(baseCellId, targetCellId);
    } else {
      app.extendSelectionRangeTowardCell(targetCellId, key);
    }
  } else {
    app.setSelectionAnchor(targetCellId);
    app.setSelectionRange(targetCellId, targetCellId);
  }

  app.formulaRefCursorId = targetCellId;
  var mentionToken = app.buildMentionTokenForSelection(
    targetCellId,
    !!opts.extendRange,
  );
  app.applyFormulaMentionPreview(editorInput || input, mentionToken);
  var nextRaw = String(
    editorInput && editorInput.value != null ? editorInput.value : input.value,
  );
  if (editorInput && editorInput !== input) {
    input.value = nextRaw;
  }
  syncCellDraft(app, input, nextRaw, {
    origin: String(opts.origin || 'cell'),
  });
  return { status: 'applied', targetCellId: targetCellId };
}

export function handleCellInputDraft(app, input, options) {
  if (!input || !app.isEditingCell(input)) return { status: 'ignored' };
  var opts = options || {};
  syncCellDraft(app, input, input.value, {
    origin: String(opts.origin || 'cell'),
  });
  app.syncAIDraftLock();
  app.updateMentionAutocomplete(opts.mentionInput || input);
  return { status: 'synced', raw: String(input.value || '') };
}

export function moveAfterCellEditingEnter(app, input, options) {
  if (
    !app ||
    !input ||
    !app.grid ||
    typeof app.grid.focusCellByArrow !== 'function'
  ) {
    return;
  }
  var opts = options || {};
  app.clearSelectionRange();
  var moved = app.grid.focusCellByArrow(
    input,
    opts.reverse ? 'ArrowUp' : 'ArrowDown',
  );
  if (!moved) {
    restoreFocusAfterEditingExit(app, { defer: false });
  }
}

export function moveAfterCellEditingArrow(app, input, key) {
  if (
    !app ||
    !input ||
    !app.grid ||
    typeof app.grid.focusCellByArrow !== 'function'
  ) {
    return;
  }
  app.clearSelectionRange();
  var moved = app.grid.focusCellByArrow(input, key);
  if (!moved) {
    restoreFocusAfterEditingExit(app, { defer: false });
  }
}

export function handleCellEditingArrowNavigate(app, input, key, options) {
  if (!app || !input) return { status: 'noop' };
  var opts = options || {};
  var raw = String(input.value == null ? '' : input.value);
  var result = resolveCellEditingExit(app, input, {
    wasEditing: true,
    rawValue: raw,
    origin: String(opts.origin || 'cell'),
    reason: 'arrow',
  });
  moveAfterCellEditingArrow(app, input, key);
  return result;
}

export function resolveCellEditingExit(app, input, options) {
  if (!app || !input) return { status: 'noop' };
  var opts = options || {};
  var reason = String(opts.reason || 'blur');
  var raw =
    opts.rawValue != null
      ? String(opts.rawValue)
      : String(input.value == null ? '' : input.value);
  var wasEditing =
    opts.wasEditing != null ? !!opts.wasEditing : app.isEditingCell(input);
  var origin = String(opts.origin || 'cell');

  if (reason === 'cancel') {
    if (!wasEditing) return { status: 'not-editing' };
    cancelCellEditing(app, input, { syncFormula: true });
    restoreFocusAfterEditingExit(app);
    return { status: 'cancelled' };
  }

  app.grid.setEditing(input, false);
  app.clearEditingSession({ cellId: input.id });
  app.syncAIDraftLock();

  if (!wasEditing) return { status: 'not-editing' };

  if (app.suppressBlurCommitOnce) {
    app.suppressBlurCommitOnce = false;
    delete app.editStartRawByCell[input.id];
    restoreFocusAfterEditingExit(app);
    return { status: 'suppressed' };
  }
  var crossSheetPickContext = app.getCrossSheetPickContext();
  if (
    crossSheetPickContext &&
    getEditingOwnerSheetId(app) !== crossSheetPickContext.sourceSheetId
  ) {
    if (app.activeInput === input && app.formulaInput) {
      app.formulaInput.value = crossSheetPickContext.value;
    }
    delete app.editStartRawByCell[input.id];
    restoreFocusAfterEditingExit(app);
    return { status: 'cross-tab' };
  }

  app.formulaRefCursorId = null;
  app.formulaMentionPreview = null;

  var existingRaw = String(app.getRawCellValue(input.id) || '');
  var existingAttachment = app.parseAttachmentSource(existingRaw);
  if (existingAttachment && raw === String(existingAttachment.name || '')) {
    delete app.editStartRawByCell[input.id];
    if (app.activeInput === input && app.formulaInput) {
      app.formulaInput.value = String(existingAttachment.name || '');
    }
    restoreFocusAfterEditingExit(app);
    return { status: 'attachment-name' };
  }

  var hasChanged = app.hasRawCellChanged(input.id, raw);
  if (!hasChanged) {
    if (app.activeInput === input && app.formulaInput) {
      app.formulaInput.value = raw;
    }
    delete app.editStartRawByCell[input.id];
    restoreFocusAfterEditingExit(app);
    return { status: 'unchanged' };
  }
  var result = commitCellEditing(app, input, {
    rawValue: raw,
    origin: origin,
    deferRender: reason === 'arrow',
  });
  restoreFocusAfterEditingExit(app);
  return result;
}
