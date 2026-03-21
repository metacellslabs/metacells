export function createHistoryEntry(app) {
  var workbook = app.getWorkbookSnapshot();
  if (!workbook) return null;
  return {
    workbook: workbook,
    activeSheetId: String(app.activeSheetId || ''),
    activeCellId:
      app.activeCellId
        ? String(app.activeCellId).toUpperCase()
        : app.activeInput && app.activeInput.id
          ? String(app.activeInput.id).toUpperCase()
          : 'A1',
  };
}

export function captureHistorySnapshot(app, groupKey) {
  if (app.isApplyingHistory) return;
  var entry = createHistoryEntry(app);
  if (!entry) return;
  var serialized = JSON.stringify(entry);
  var now = Date.now();

  if (
    groupKey &&
    app.historyGroupKey === groupKey &&
    now - app.historyGroupAt < app.historyGroupWindowMs
  ) {
    return;
  }

  var last = app.undoStack.length
    ? app.undoStack[app.undoStack.length - 1]
    : '';
  if (last === serialized) {
    app.historyGroupKey = groupKey || '';
    app.historyGroupAt = now;
    return;
  }

  app.undoStack.push(serialized);
  if (app.undoStack.length > app.maxHistoryEntries) {
    app.undoStack.shift();
  }
  app.redoStack = [];
  app.historyGroupKey = groupKey || '';
  app.historyGroupAt = now;
}

export function resetHistoryGrouping(app) {
  app.historyGroupKey = '';
  app.historyGroupAt = 0;
}

export function applyWorkbookHistorySnapshot(app, serialized) {
  if (!serialized) return;
  var adapter = app.getWorkbookAdapter();
  if (!adapter || typeof adapter.replaceAll !== 'function') return;

  var entry = JSON.parse(serialized);
  var snapshot = entry && entry.workbook ? entry.workbook : entry;
  var previousCellId =
    entry && entry.activeCellId
      ? String(entry.activeCellId).toUpperCase()
      : app.activeCellId
        ? String(app.activeCellId).toUpperCase()
      : app.activeInput && app.activeInput.id
        ? app.activeInput.id
        : 'A1';
  app.isApplyingHistory = true;
  app.computeRequestToken += 1;
  app.clearSelectionRange();
  app.crossTabMentionContext = null;
  app.pendingAttachmentContext = null;
  app.hideMentionAutocomplete();
  app.hideAddTabMenu();
  app.hideContextMenu();
  app.syncServerEditLock(false);
  if (app.aiService && typeof app.aiService.setEditDraftLock === 'function') {
    app.aiService.setEditDraftLock(false);
  }

  adapter.replaceAll(snapshot);
  if (typeof adapter.scheduleFlush === 'function') {
    adapter.scheduleFlush();
  }

  app.tabs = app.storage.readTabs();
  var nextActiveSheetId =
    entry && entry.activeSheetId && app.findTabById(entry.activeSheetId)
      ? String(entry.activeSheetId)
      : app.storage.getActiveSheetId(app.activeSheetId) ||
        (app.tabs[0] && app.tabs[0].id) ||
        'sheet-1';
  app.activeSheetId = nextActiveSheetId;
  if (app.onActiveSheetChange) app.onActiveSheetChange(nextActiveSheetId);

  app.ensureGridCapacityForStorage(snapshot);
  app.renderTabs();
  app.applyViewMode();
  if (app.reportEditor) {
    app.reportEditor.innerHTML =
      app.storage.getReportContent(app.activeSheetId) || '<p></p>';
  }
  if (app.isReportActive()) {
    app.setReportMode('view');
  }
  app.applyActiveSheetLayout();
  app.updateSortIcons();
  app.refreshNamedCellJumpOptions();

  var nextInput =
    app.inputById[previousCellId] || app.inputById['A1'] || app.inputs[0];
  if (!app.isReportActive() && nextInput) {
    app.setActiveInput(nextInput);
  } else {
    app.clearActiveInput();
  }

  app.computedValuesBySheet = {};
  resetHistoryGrouping(app);
  app.isApplyingHistory = false;
  app.computeAll();
  if (app.isReportActive()) {
    app.renderReportLiveValues(true);
  } else {
    app.ensureActiveCell();
  }
}

export function undo(app) {
  if (!app.undoStack.length) return;
  var current = createHistoryEntry(app);
  if (!current) return;
  app.redoStack.push(JSON.stringify(current));
  var previous = app.undoStack.pop();
  applyWorkbookHistorySnapshot(app, previous);
}

export function redo(app) {
  if (!app.redoStack.length) return;
  var current = createHistoryEntry(app);
  if (!current) return;
  app.undoStack.push(JSON.stringify(current));
  var next = app.redoStack.pop();
  applyWorkbookHistorySnapshot(app, next);
}
