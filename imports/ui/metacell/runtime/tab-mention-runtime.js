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
  if (app && typeof app.isReportActive === 'function' && app.isReportActive()) {
    return false;
  }
  if (app.isReportTab(tabId)) return false;
  if (tabId === app.activeSheetId) return false;
  if (!app.activeInput) return false;
  var formulaRaw = String(app.formulaInput ? app.formulaInput.value : '');
  if (app.canInsertFormulaMention(formulaRaw)) return true;
  if (
    app.isEditingCell(app.activeInput) &&
    app.canInsertFormulaMention(app.activeInput.value)
  )
    return true;
  return false;
}

export function startCrossTabMention(app, targetSheetId) {
  if (!app.activeInput) return app.switchToSheet(targetSheetId);
  var sourceCellId = app.activeInput.id;
  var sourceValue = String(
    app.formulaInput && document.activeElement === app.formulaInput
      ? app.formulaInput.value
      : app.activeInput.value == null
        ? ''
        : app.activeInput.value,
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
  targetInput.value = app.crossTabMentionContext.value;
  app.editStartRawByCell[targetInput.id] = app.crossTabMentionContext.value;
  app.formulaInput.value = app.crossTabMentionContext.value;
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
  sourceInput.value = finalValue;
  app.editStartRawByCell[sourceInput.id] = finalValue;
  app.formulaInput.value = finalValue;
  if (typeof sourceInput.setSelectionRange === 'function') {
    var caret = finalValue.length;
    sourceInput.setSelectionRange(caret, caret);
  }
  return true;
}
