import {
  GRID_ROWS,
  GRID_COLS,
  DEFAULT_COL_WIDTH,
  DEFAULT_ROW_HEIGHT,
} from './constants.js';
import { StorageService } from './storage-service.js';
import { AIService } from './ai-service.js';
import { FormulaEngine } from './formula-engine.js';
import { GridManager } from './grid-manager.js';
import { ensureEditingSession } from './editing-session-runtime.js';
import { ensureSelectionModel } from './selection-model.js';

export function initializeSpreadsheetAppState(app, opts) {
  app.useReactShellControls = true;
  app.storage = new StorageService(opts.storage);
  app.tabs = app.storage.readTabs();
  app.ensureReportTabExists();
  app.activeSheetId = app.initializeActiveSheetId();
  app.activeInput = null;
  app.activeCellId = '';
  app.selectionModel = ensureSelectionModel(app);
  app.fillDrag = null;
  app.selectionDrag = null;
  app.selectionDragJustFinished = false;
  app.sortStateBySheet = {};
  app.isResorting = false;
  app.dragTabId = null;
  app.editStartRawByCell = {};

  app.gridRows = GRID_ROWS;
  app.gridCols = GRID_COLS;
  app.grid = new GridManager(
    app.table,
    app.gridRows,
    app.gridCols,
    DEFAULT_COL_WIDTH,
    DEFAULT_ROW_HEIGHT,
  );
  app.cellContentStore = opts.cellContentStore || null;
  app.grid.cellContentStore = app.cellContentStore || null;
  app.grid.resolveInputByCoords = function (rowIndex, colIndex) {
    if (typeof app.getCellInputByCoords === 'function') {
      return app.getCellInputByCoords(rowIndex, colIndex);
    }
    return null;
  };
  app.grid.resolveGridBounds = function () {
    if (typeof app.getGridBounds === 'function') {
      return app.getGridBounds();
    }
    return null;
  };
  app.refreshGridReferences();
  app.selectionAnchorId = null;
  app.selectionRange = null;
  app.editingSession = ensureEditingSession(app);
  app.extendSelectionNav = false;
  app.lastSelectAllShortcutTs = 0;
  app.formulaRefCursorId = null;
  app.formulaMentionPreview = null;

  app.aiService = new AIService(app.storage, function () {
    return app.computeAll();
  }, {
    sheetDocumentId: app.sheetDocumentId,
    getActiveSheetId: function () {
      return app.activeSheetId;
    },
  });
  app.formulaEngine = new FormulaEngine(
    app.storage,
    app.aiService,
    function () {
      return app.tabs;
    },
    app.cellIds,
  );
  app.uncomputedMonitorMs = 2000;
  app.uncomputedMonitorId = null;
  app.backgroundComputeEnabled = false;
  app.fullscreenOverlay = null;
  app.fullscreenOverlayContent = null;
  app.reportMode = 'edit';
  app.calcProgressHideTimer = null;
  app.lastReportLiveHtml = '';
  app.addTabMenu = null;
  app.contextMenu = null;
  app.contextMenuState = null;
  app.headerSelectionDrag = null;
  app.mentionAutocomplete = null;
  app.mentionAutocompleteState = null;
  app.crossTabMentionContext = null;
  app.suppressBlurCommitOnce = false;
  app.suppressFormulaBarBlurCommitOnce = false;
  app.computedValuesBySheet = {};
  app.computeRequestToken = 0;
  app.refreshVisibleSheetRequest = null;
  app.manualUpdateRequestToken = 0;
  app.isManualAIUpdating = false;
  app.currentServerEditLockKey = '';
  app.displayMode =
    app.displayModeButton &&
    String(
      app.displayModeButton.getAttribute('data-display-mode-current') || '',
    )
      .trim()
      .toLowerCase() === 'formulas'
      ? 'formulas'
      : 'values';
  app.editLockOwnerId =
    'lock-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  app.editLockSequence = 0;
  app.pendingAttachmentContext = null;
  app.serverPushEventsEnabled = false;
  app.serverPushConnectionState = 'disconnected';
  app.serverWorkbookRevision = String(opts.initialWorkbookRevision || '');
  app.floatingAttachmentPreview = null;
  app.floatingAttachmentPreviewUiState = null;
  app.attachmentContentUiState = null;
  app.attachmentPreviewTimer = null;
  app.attachmentPreviewAnchor = null;
  app.handleAttachmentPreviewMouseOver = null;
  app.handleAttachmentPreviewMouseOut = null;
  app.handleAttachmentPreviewScroll = null;
  app.handleAttachmentContentOverlayKeydown = null;
  app.undoStack = [];
  app.redoStack = [];
  app.maxHistoryEntries = 100;
  app.historyGroupKey = '';
  app.historyGroupAt = 0;
  app.historyGroupWindowMs = 1200;
  app.isApplyingHistory = false;
  app.regionRecordingState = null;
  app.regionRecordingGifUrl = '';
  app.regionRecordingFilename = '';
  app.regionRecordingDownloadReady = false;
  app.regionRecordingResultSelectionKey = '';
  app.regionRecordingLastSelectionKey = '';
  app.regionRecordingStatus = '';
  app.regionRecordingTimerId = null;
}
