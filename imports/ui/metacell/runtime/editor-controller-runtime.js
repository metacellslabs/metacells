function ensureEditStartSnapshot(app, input) {
  if (!input) return;
  if (
    !Object.prototype.hasOwnProperty.call(app.editStartRawByCell, input.id)
  ) {
    app.editStartRawByCell[input.id] = app.getRawCellValue(input.id);
  }
}

export function restoreFocusAfterEditingExit(app, options) {
  if (!app || typeof app.focusActiveEditor !== 'function') return;
  var opts = options || {};
  var defer = opts.defer !== false;
  if (defer) {
    requestAnimationFrame(() => app.focusActiveEditor());
    return;
  }
  app.focusActiveEditor();
}

export function enterCellEditing(app, input, options) {
  if (!app || !input) return { status: 'noop', draftRaw: '' };
  var opts = options || {};
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
    origin: String(opts.origin || 'cell'),
  });
  if (typeof app.syncActiveEditorValue === 'function') {
    app.syncActiveEditorValue(draftRaw, { syncOverlay: false });
  }
  if (typeof app.syncEditorOverlay === 'function') {
    app.syncEditorOverlay();
  }
  app.editorOverlayPendingFocus = true;
  if (typeof app.focusEditorOverlayInput === 'function') {
    requestAnimationFrame(() => app.focusEditorOverlayInput());
  }
  app.syncAIDraftLock();
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

export function ensureCellEditing(app, input, options) {
  if (!input) return;
  var opts = options || {};
  if (!app.isEditingCell(input)) {
    enterCellEditing(app, input, {
      draftRaw:
        opts.draftRaw != null ? String(opts.draftRaw) : String(input.value || ''),
      origin: String(opts.origin || 'cell'),
    });
    return;
  }
  ensureEditStartSnapshot(app, input);
  app.beginEditingSession(input, {
    draftRaw:
      opts.draftRaw != null ? String(opts.draftRaw) : String(input.value || ''),
    origin: String(opts.origin || 'cell'),
  });
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
}

export function cancelCellEditing(app, input, options) {
  if (!input) return '';
  var opts = options || {};
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
  app.clearEditingSession(input.id);
  delete app.editStartRawByCell[input.id];
  app.formulaRefCursorId = null;
  app.formulaMentionPreview = null;
  app.syncAIDraftLock();
  return restoreValue;
}

export function commitCellEditing(app, input, options) {
  if (!input) return { status: 'noop' };
  var opts = options || {};
  var raw =
    opts.rawValue != null
      ? String(opts.rawValue)
      : String(input.value == null ? '' : input.value);
  var origin = String(opts.origin || 'cell');
  app.updateEditingSessionDraft(raw, { origin: origin });

  var existingRaw = String(app.getRawCellValue(input.id) || '');
  var existingAttachment = app.parseAttachmentSource(existingRaw);
  if (existingAttachment && raw === String(existingAttachment.name || '')) {
    if (input.parentElement) {
      input.parentElement.classList.remove('formula-bar-editing');
    }
    app.clearEditingSession(input.id);
    delete app.editStartRawByCell[input.id];
    return { status: 'attachment-name' };
  }

  if (app.aiService && typeof app.aiService.setEditDraftLock === 'function') {
    app.aiService.setEditDraftLock(false);
  }
  app.syncServerEditLock(false);

  if (app.runTablePromptForCell(input.id, raw, input)) {
    delete app.editStartRawByCell[input.id];
    return { status: 'table-prompt' };
  }
  if (app.runQuotedPromptForCell(input.id, raw, input)) {
    delete app.editStartRawByCell[input.id];
    return { status: 'quoted-prompt' };
  }

  input.value = raw;
  if (input.parentElement) {
    input.parentElement.classList.remove('formula-bar-editing');
  }
  app.commitRawCellEdit(input.id, raw, app.beginCellUpdateTrace(input.id, raw));
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
  if (opts.restoreFocus) {
    restoreFocusAfterEditingExit(app);
  }
  return result;
}

export function handleCellEditingBlur(app, input, options) {
  if (!input) return { status: 'noop' };
  var opts = options || {};
  var raw = String(input.value == null ? '' : input.value);
  var wasEditing =
    opts.wasEditing != null ? !!opts.wasEditing : app.isEditingCell(input);

  return resolveCellEditingExit(app, input, {
    wasEditing: wasEditing,
    rawValue: raw,
    origin: String(opts.origin || 'cell'),
    reason: 'blur',
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
  if (typeof app.setEditorSelectionRange === 'function') {
    requestAnimationFrame(() => {
      app.setEditorSelectionRange(nextRaw.length, nextRaw.length);
    });
  }
  return { status: 'started', raw: nextRaw };
}

export function handleCellEditingEscape(app, input, options) {
  if (!input) return { status: 'noop' };
  return resolveCellEditingExit(app, input, {
    reason: 'cancel',
    origin: String((options && options.origin) || 'cell'),
  });
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

  var hasChanged = app.hasRawCellChanged(input.id, raw);
  if (hasChanged && app.runTablePromptForCell(input.id, raw, input)) {
    return { status: 'table-prompt' };
  }
  if (hasChanged && app.runQuotedPromptForCell(input.id, raw, input)) {
    return { status: 'quoted-prompt' };
  }
  if (hasChanged) {
    app.formulaRefCursorId = null;
    app.formulaMentionPreview = null;
    commitCellEditing(app, input, {
      rawValue: raw,
      origin: String(opts.origin || 'cell'),
    });
    app.grid.setEditing(input, false);
    app.syncAIDraftLock();
    return { status: 'committed', raw: raw };
  }
  return { status: 'unchanged' };
}

export function moveAfterCellEditingEnter(app, input, options) {
  if (!app || !input || !app.grid || typeof app.grid.focusCellByArrow !== 'function') {
    return;
  }
  var opts = options || {};
  app.clearSelectionRange();
  app.grid.focusCellByArrow(input, opts.reverse ? 'ArrowUp' : 'ArrowDown');
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
  app.clearEditingSession(input.id);
  app.syncAIDraftLock();

  if (!wasEditing) return { status: 'not-editing' };

  if (app.suppressBlurCommitOnce) {
    app.suppressBlurCommitOnce = false;
    delete app.editStartRawByCell[input.id];
    restoreFocusAfterEditingExit(app);
    return { status: 'suppressed' };
  }
  if (
    app.crossTabMentionContext &&
    app.activeSheetId !== app.crossTabMentionContext.sourceSheetId
  ) {
    if (app.activeInput === input && app.formulaInput) {
      app.formulaInput.value = app.crossTabMentionContext.value;
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
  });
  restoreFocusAfterEditingExit(app);
  return result;
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
    if (!app.selectionRange) {
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
  app.updateMentionAutocomplete(input);
  return { status: 'synced', raw: String(input.value || '') };
}
