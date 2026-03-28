let historyRuntimePromise = null;
let historyRuntimeLoaded = null;

function loadHistoryRuntime() {
  if (!historyRuntimePromise) {
    historyRuntimePromise = import('./history-runtime.js').then((module) => {
      historyRuntimeLoaded = module;
      return module;
    });
  }
  return historyRuntimePromise;
}

function createHistoryEntry(app) {
  var workbook = app.getWorkbookSnapshot();
  if (!workbook) return null;
  return {
    workbook: workbook,
    activeSheetId: String(app.activeSheetId || ''),
    activeCellId:
      app.activeInput && app.activeInput.id
        ? String(app.activeInput.id).toUpperCase()
        : 'A1',
  };
}

function captureHistorySnapshot(app, groupKey) {
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

  var last = app.undoStack.length ? app.undoStack[app.undoStack.length - 1] : '';
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

function resetHistoryGrouping(app) {
  app.historyGroupKey = '';
  app.historyGroupAt = 0;
}

export function installStorageHistoryMethods(SpreadsheetApp) {
  SpreadsheetApp.prototype.getRawCellValue = function (cellId) {
    return this.storage.getCellValue(this.activeSheetId, cellId);
  };

  SpreadsheetApp.prototype.getCellFormat = function (cellId) {
    return this.storage.getCellFormat(this.activeSheetId, cellId);
  };

  SpreadsheetApp.prototype.getCellPresentation = function (cellId) {
    return this.storage.getCellPresentation(this.activeSheetId, cellId);
  };

  SpreadsheetApp.prototype.getCellSchedule = function (cellId) {
    return this.storage.getCellSchedule(this.activeSheetId, cellId);
  };

  SpreadsheetApp.prototype.setCellFormat = function (cellId, format) {
    this.storage.setCellFormat(this.activeSheetId, cellId, format);
    this.syncCellFormatControl();
  };

  SpreadsheetApp.prototype.setCellPresentation = function (cellId, presentation) {
    this.storage.setCellPresentation(this.activeSheetId, cellId, presentation);
    this.syncCellPresentationControls();
  };

  SpreadsheetApp.prototype.setCellSchedule = function (cellId, schedule) {
    this.storage.setCellSchedule(this.activeSheetId, cellId, schedule);
  };

  SpreadsheetApp.prototype.getWorkbookAdapter = function () {
    return this.storage && this.storage.storage ? this.storage.storage : null;
  };

  SpreadsheetApp.prototype.getWorkbookSnapshot = function () {
    var adapter = this.getWorkbookAdapter();
    if (!adapter || typeof adapter.snapshot !== 'function') return null;
    return adapter.snapshot();
  };

  SpreadsheetApp.prototype.createHistoryEntry = function () {
    return createHistoryEntry(this);
  };

  SpreadsheetApp.prototype.captureHistorySnapshot = function (groupKey) {
    captureHistorySnapshot(this, groupKey);
  };

  SpreadsheetApp.prototype.resetHistoryGrouping = function () {
    resetHistoryGrouping(this);
  };

  SpreadsheetApp.prototype.applyWorkbookHistorySnapshot = function (serialized) {
    return loadHistoryRuntime().then((runtime) =>
      runtime.applyWorkbookHistorySnapshot(this, serialized),
    );
  };

  SpreadsheetApp.prototype.undo = function () {
    return loadHistoryRuntime().then((runtime) => runtime.undo(this));
  };

  SpreadsheetApp.prototype.redo = function () {
    return loadHistoryRuntime().then((runtime) => runtime.redo(this));
  };

  SpreadsheetApp.prototype.ensureHistoryRuntime = function () {
    return loadHistoryRuntime();
  };
}
