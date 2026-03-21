export function onTabButtonClick(app, tabId) {
  if (!app.findTabById(tabId)) return;
  if (shouldStartCrossTabMention(app, tabId)) {
    startCrossTabMention(app, tabId);
    return;
  }
  app.crossTabMentionContext = null;
  app.switchToSheet(tabId);
}

export function shouldStartCrossTabMention(app, tabId) {
  if (app.isReportTab(tabId)) return false;
  if (tabId === app.activeSheetId) return false;
  if (!app.activeInput) return false;
  var formulaRaw = String(app.formulaInput ? app.formulaInput.value : '');
  if (app.canInsertFormulaMention(formulaRaw)) return true;
  var editingTarget =
    typeof app.getActiveEditorInput === 'function'
      ? app.getActiveEditorInput()
      : app.activeInput;
  var editingRaw = String(
    editingTarget && editingTarget.value != null ? editingTarget.value : '',
  );
  if (
    app.isEditingCell(app.activeInput) &&
    app.canInsertFormulaMention(editingRaw)
  )
    return true;
  return false;
}

export function startCrossTabMention(app, targetSheetId) {
  if (!app.activeInput) return app.switchToSheet(targetSheetId);
  var sourceCellId = app.activeInput.id;
  var activeEditor =
    typeof app.getActiveEditorInput === 'function'
      ? app.getActiveEditorInput()
      : null;
  var sourceValue = String(
    activeEditor && activeEditor.value != null
      ? activeEditor.value
      : app.getRawCellValue(sourceCellId) || '',
  );

  app.crossTabMentionContext = {
    sourceSheetId: app.activeSheetId,
    sourceCellId: sourceCellId,
    value: sourceValue,
  };

  app.storage.setCellValue(
    app.crossTabMentionContext.sourceSheetId,
    app.crossTabMentionContext.sourceCellId,
    sourceValue,
  );
  app.suppressBlurCommitOnce = true;
  app.switchToSheet(targetSheetId);
  restoreCrossTabMentionEditor(app);
}

export function restoreCrossTabMentionEditor(app) {
  if (!app.crossTabMentionContext) return;
  if (app.activeSheetId === app.crossTabMentionContext.sourceSheetId) return;
  if (app.isReportActive()) return;

  var targetInput =
    app.inputById[app.crossTabMentionContext.sourceCellId] ||
    app.activeInput ||
    app.inputById['A1'];
  if (!targetInput) return;
  app.setActiveInput(targetInput);
  app.startEditingCell(targetInput);
  app.editStartRawByCell[targetInput.id] = app.crossTabMentionContext.value;
  app.syncActiveEditorValue(app.crossTabMentionContext.value);
}

export function syncCrossTabMentionSourceValue(app, nextValue) {
  if (!app.crossTabMentionContext) return false;
  var value = String(nextValue == null ? '' : nextValue);
  app.crossTabMentionContext.value = value;
  return true;
}

export function isCrossTabMentionProxyActive(app) {
  return !!(
    app.crossTabMentionContext &&
    app.activeSheetId !== app.crossTabMentionContext.sourceSheetId
  );
}

export function finishCrossTabMentionAndReturnToSource(app) {
  if (!app.crossTabMentionContext) return false;
  if (!isCrossTabMentionProxyActive(app)) return false;

  var ctx = app.crossTabMentionContext;
  var finalValue = String(ctx.value == null ? '' : ctx.value);
  app.storage.setCellValue(ctx.sourceSheetId, ctx.sourceCellId, finalValue);

  app.crossTabMentionContext = null;
  app.switchToSheet(ctx.sourceSheetId);
  var sourceInput = app.inputById[ctx.sourceCellId];
  if (!sourceInput) return true;

  app.setActiveInput(sourceInput);
  app.startEditingCell(sourceInput);
  app.editStartRawByCell[sourceInput.id] = finalValue;
  app.syncActiveEditorValue(finalValue);
  var caret = finalValue.length;
  if (typeof app.setEditorSelectionRange === 'function') {
    app.setEditorSelectionRange(caret, caret);
  } else if (typeof sourceInput.setSelectionRange === 'function') {
    sourceInput.setSelectionRange(caret, caret);
  }
  app.focusActiveEditor();
  return true;
}
