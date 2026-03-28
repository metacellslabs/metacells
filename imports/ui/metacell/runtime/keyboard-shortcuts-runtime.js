import { applyPresentationToSelection } from './toolbar-actions-runtime.js';
import { getActiveSourceCellId } from './selection-source-runtime.js';

export function handleWorkbookGlobalClick(app, e) {
  if (!app.addTabMenu || app.addTabMenu.style.display === 'none') return;
  if (e.target === app.addTabButton) return;
  if (
    app.addTabButton &&
    app.addTabButton.contains &&
    app.addTabButton.contains(e.target)
  ) {
    return;
  }
  if (app.addTabMenu.contains && app.addTabMenu.contains(e.target)) return;
  app.hideAddTabMenu();
}

export function handleWorkbookGlobalPaste(app, e) {
  var activeEl = document.activeElement;
  var isEditableTarget = !!(
    activeEl &&
    ((activeEl.tagName === 'INPUT' && !activeEl.readOnly && !activeEl.disabled) ||
      activeEl === app.formulaInput ||
      activeEl === app.cellNameInput ||
      activeEl === app.reportEditor ||
      (activeEl.tagName === 'TEXTAREA' &&
        activeEl !== app.activeInput &&
        activeEl !== app.formulaInput) ||
      (activeEl.tagName === 'INPUT' &&
        activeEl !== app.activeInput &&
        activeEl !== app.formulaInput &&
        activeEl !== app.cellNameInput) ||
      activeEl.isContentEditable)
  );
  if (isEditableTarget || app.isReportActive() || !app.activeInput) return false;
  var clipboardData = e.clipboardData || null;
  if (typeof app.handleAttachmentPaste === 'function') {
    var handledAttachment = app.handleAttachmentPaste(app.activeInput, clipboardData);
    if (handledAttachment) {
      e.preventDefault();
      return true;
    }
  }
  var text =
    clipboardData && typeof clipboardData.getData === 'function'
      ? String(clipboardData.getData('text/plain') || '')
      : '';
  if (!text) return false;
  e.preventDefault();
  app.applyPastedText(text);
  return true;
}

export function handleWorkbookGlobalKeydown(app, e) {
  var activeEl = document.activeElement;
  if (
    app.mentionAutocompleteState &&
    (e.key === 'ArrowDown' ||
      e.key === 'ArrowUp' ||
      e.key === 'Enter' ||
      e.key === 'Tab' ||
      e.key === 'Escape')
  ) {
    var mentionInput = app.formulaInput || app.activeInput;
    if (mentionInput && app.handleMentionAutocompleteKeydown(e, mentionInput)) {
      return true;
    }
  }
  var isEditableTarget = !!(
    activeEl &&
    ((activeEl.tagName === 'INPUT' && !activeEl.readOnly && !activeEl.disabled) ||
      activeEl === app.formulaInput ||
      activeEl === app.cellNameInput ||
      activeEl === app.reportEditor ||
      (activeEl.tagName === 'TEXTAREA' &&
        activeEl !== app.activeInput &&
        activeEl !== app.formulaInput) ||
      (activeEl.tagName === 'INPUT' &&
        activeEl !== app.activeInput &&
        activeEl !== app.formulaInput &&
        activeEl !== app.cellNameInput) ||
      activeEl.isContentEditable)
  );
  if (
    !e.metaKey &&
    !e.ctrlKey &&
    (e.key === 'Delete' || e.key === 'Backspace') &&
    !isEditableTarget &&
    !app.isReportActive() &&
    app.activeInput
  ) {
    e.preventDefault();
    app.clearSelectedCells();
    return true;
  }

  if ((e.metaKey || e.ctrlKey) && !e.altKey) {
    var key = String(e.key || '').toLowerCase();
    var isReportEditing = !!(
      activeEl &&
      app.reportEditor &&
      activeEl === app.reportEditor &&
      app.reportMode === 'edit'
    );
    var shouldUseWorkbookHistory = !app.hasPendingLocalEdit() && !isReportEditing;
    var isDisplayModeShortcut =
      key === '/' ||
      key === '?' ||
      e.code === 'Slash' ||
      e.code === 'NumpadDivide';
    if (!isEditableTarget && !app.isReportActive() && key === 'c' && app.activeInput) {
      e.preventDefault();
      app.copySelectedRangeToClipboard();
      return true;
    }
    if (shouldUseWorkbookHistory && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) app.redo();
      else app.undo();
      return true;
    }
    if (shouldUseWorkbookHistory && key === 'y') {
      e.preventDefault();
      app.redo();
      return true;
    }
    if (!isReportEditing && isDisplayModeShortcut) {
      e.preventDefault();
      app.setDisplayMode(app.displayMode === 'formulas' ? 'values' : 'formulas');
      return true;
    }
    if (!isReportEditing && key === 'k' && !app.isReportActive()) {
      e.preventDefault();
      if (typeof app.runManualAIUpdate === 'function') {
        app.runManualAIUpdate();
      }
      return true;
    }
    if (!isReportEditing && key === '7' && !app.isReportActive()) {
      e.preventDefault();
      if (e.shiftKey) {
        if (typeof app.runManualAIUpdate === 'function') {
          app.runManualAIUpdate({ forceRefreshAI: true });
        }
        return true;
      }
      if (typeof app.copySelectedRangeDebugToClipboard === 'function') {
        app.copySelectedRangeDebugToClipboard();
      }
      return true;
    }
    if (!isReportEditing && key === '8' && !app.isReportActive()) {
      e.preventDefault();
      if (e.shiftKey) {
        if (typeof app.copySelectedRangeDebugToClipboard === 'function') {
          app.copySelectedRangeDebugToClipboard();
        }
        return true;
      }
      if (typeof app.runManualAIUpdate === 'function') {
        app.runManualAIUpdate({ forceRefreshAI: true });
      }
      return true;
    }
    if (!isReportEditing && key === 'b' && app.activeInput && !app.isReportActive()) {
      e.preventDefault();
      var boldCellId = getActiveSourceCellId(app);
      if (!boldCellId) return true;
      var currentBold = app.storage.getCellPresentation(
        app.activeSheetId,
        boldCellId,
      );
      applyPresentationToSelection(app, { bold: !currentBold.bold }, 'cell-bold');
      return true;
    }
    if (!isReportEditing && key === 'i' && app.activeInput && !app.isReportActive()) {
      e.preventDefault();
      var italicCellId = getActiveSourceCellId(app);
      if (!italicCellId) return true;
      var currentItalic = app.storage.getCellPresentation(
        app.activeSheetId,
        italicCellId,
      );
      applyPresentationToSelection(app, { italic: !currentItalic.italic }, 'cell-italic');
      return true;
    }
  }
  if (e.key !== 'Escape') return false;
  app.hideAddTabMenu();
  app.hideFormulaTrackerPanel();
  return false;
}
