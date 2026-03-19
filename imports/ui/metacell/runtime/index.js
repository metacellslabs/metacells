// Description: Application controller that wires UI, storage, grid rendering, tabs, formulas, and AI updates.
import { Meteor } from 'meteor/meteor';
import {
  buildChannelSendAttachmentsFromPreparedPrompt,
  buildChannelSendBodyFromPreparedPrompt,
  parseChannelSendCommand,
  stripChannelSendFileAndImagePlaceholders,
} from '../../../api/channels/commands.js';
import {
  GRID_ROWS,
  GRID_COLS,
  DEFAULT_COL_WIDTH,
  DEFAULT_ROW_HEIGHT,
  AI_MODE,
} from './constants.js';
import { StorageService } from './storage-service.js';
import { AIService } from './ai-service.js';
import { FormulaEngine } from './formula-engine.js';
import { GridManager } from './grid-manager.js';
import {
  createCellUpdateTrace,
  shouldProfileCellUpdatesClient,
  traceCellUpdateClient,
} from '../../../lib/cell-update-profile.js';
import {
  applyWorkbookHistorySnapshot as applyWorkbookHistorySnapshotRuntime,
  captureHistorySnapshot as captureHistorySnapshotRuntime,
  createHistoryEntry as createHistoryEntryRuntime,
  redo as redoRuntime,
  resetHistoryGrouping as resetHistoryGroupingRuntime,
  undo as undoRuntime,
} from './history-runtime.js';
import {
  addReportTab as addReportTabRuntime,
  addTab as addTabRuntime,
  deleteActiveTab as deleteActiveTabRuntime,
  onTabDragEnd as onTabDragEndRuntime,
  onTabDragOver as onTabDragOverRuntime,
  onTabDragStart as onTabDragStartRuntime,
  onTabDrop as onTabDropRuntime,
  renameActiveTab as renameActiveTabRuntime,
  renameTabById as renameTabByIdRuntime,
  renderTabs as renderTabsRuntime,
  reorderTabs as reorderTabsRuntime,
  switchToSheet as switchToSheetRuntime,
} from './sheet-shell-runtime.js';
import {
  applyActiveCellName as applyActiveCellNameRuntime,
  bindFormulaBarEvents as bindFormulaBarEventsRuntime,
  commitFormulaBarValue as commitFormulaBarValueRuntime,
  ensureReportUI as ensureReportUIRuntime,
  navigateToNamedCell as navigateToNamedCellRuntime,
  refreshNamedCellJumpOptions as refreshNamedCellJumpOptionsRuntime,
  setupAIModeControls as setupAIModeControlsRuntime,
  setupCellFormatControls as setupCellFormatControlsRuntime,
  setupCellPresentationControls as setupCellPresentationControlsRuntime,
  setupCellNameControls as setupCellNameControlsRuntime,
  setupDisplayModeControls as setupDisplayModeControlsRuntime,
  syncAIModeUI as syncAIModeUIRuntime,
  syncCellFormatControl as syncCellFormatControlRuntime,
  syncCellPresentationControls as syncCellPresentationControlsRuntime,
  syncCellNameInput as syncCellNameInputRuntime,
} from './editor-controls-runtime.js';
import {
  activateReportTab as activateReportTabRuntime,
  applyLinkedReportInput as applyLinkedReportInputRuntime,
  createLinkedReportFileElement as createLinkedReportFileElementRuntime,
  createLinkedReportInputElement as createLinkedReportInputElementRuntime,
  createReportInternalLinkElement as createReportInternalLinkElementRuntime,
  createReportListElement as createReportListElementRuntime,
  createReportRegionTableElement as createReportRegionTableElementRuntime,
  createReportTabElement as createReportTabElementRuntime,
  decorateReportTabs as decorateReportTabsRuntime,
  followReportInternalLink as followReportInternalLinkRuntime,
  fragmentHasVisibleContent as fragmentHasVisibleContentRuntime,
  getReportTabStateStore as getReportTabStateStoreRuntime,
  handleReportFileShellAction as handleReportFileShellActionRuntime,
  injectLinkedInputsFromPlaceholders as injectLinkedInputsFromPlaceholdersRuntime,
  isListShortcutCell as isListShortcutCellRuntime,
  parseListItemsFromMentionValue as parseListItemsFromMentionValueRuntime,
  parseReportControlToken as parseReportControlTokenRuntime,
  readLinkedInputValue as readLinkedInputValueRuntime,
  readRegionRawValues as readRegionRawValuesRuntime,
  readRegionValues as readRegionValuesRuntime,
  refreshLinkedReportInputValue as refreshLinkedReportInputValueRuntime,
  renderReportMarkdownNodes as renderReportMarkdownNodesRuntime,
  replaceMentionInTextNode as replaceMentionInTextNodeRuntime,
  replaceMentionNodes as replaceMentionNodesRuntime,
  resolveNamedMention as resolveNamedMentionRuntime,
  resolveReportInputMention as resolveReportInputMentionRuntime,
  resolveReportInternalLink as resolveReportInternalLinkRuntime,
  resolveReportMention as resolveReportMentionRuntime,
  resolveReportReference as resolveReportReferenceRuntime,
  resolveSheetCellMention as resolveSheetCellMentionRuntime,
  resolveSheetRegionMention as resolveSheetRegionMentionRuntime,
  renderReportLiveValues as renderReportLiveValuesRuntime,
  setReportMode as setReportModeRuntime,
  setupReportControls as setupReportControlsRuntime,
} from './report-runtime.js';
import {
  applyFormulaMentionPreview as applyFormulaMentionPreviewRuntime,
  buildMentionTokenForSelection as buildMentionTokenForSelectionRuntime,
  canInsertFormulaMention as canInsertFormulaMentionRuntime,
  clearFormulaMentionPreview as clearFormulaMentionPreviewRuntime,
  ensureMentionAutocomplete as ensureMentionAutocompleteRuntime,
  findSheetIdByName as findSheetIdByNameRuntime,
  getMentionAutocompleteContext as getMentionAutocompleteContextRuntime,
  getMentionAutocompleteItems as getMentionAutocompleteItemsRuntime,
  getMentionSheetPrefix as getMentionSheetPrefixRuntime,
  handleMentionAutocompleteKeydown as handleMentionAutocompleteKeydownRuntime,
  hideMentionAutocomplete as hideMentionAutocompleteRuntime,
  hideMentionAutocompleteSoon as hideMentionAutocompleteSoonRuntime,
  insertTextIntoInputAtCursor as insertTextIntoInputAtCursorRuntime,
  positionMentionAutocomplete as positionMentionAutocompleteRuntime,
  renderMentionAutocompleteList as renderMentionAutocompleteListRuntime,
  setAvailableChannels as setAvailableChannelsRuntime,
  setupMentionAutocomplete as setupMentionAutocompleteRuntime,
  updateMentionAutocomplete as updateMentionAutocompleteRuntime,
  applyMentionAutocompleteSelection as applyMentionAutocompleteSelectionRuntime,
} from './mention-runtime.js';
import {
  applyViewMode as applyViewModeRuntime,
  applyActiveSheetLayout as applyActiveSheetLayoutRuntime,
  ensureGridCapacityForStorage as ensureGridCapacityForStorageRuntime,
  getStorageGridBounds as getStorageGridBoundsRuntime,
  refreshGridReferences as refreshGridReferencesRuntime,
} from './grid-dom-runtime.js';
import {
  applyAutoResort as applyAutoResortRuntime,
  compareSortValues as compareSortValuesRuntime,
  deleteColumnsAtContext as deleteColumnsAtContextRuntime,
  deleteRowsAtContext as deleteRowsAtContextRuntime,
  getSelectedColumnBounds as getSelectedColumnBoundsRuntime,
  getSelectedRowBounds as getSelectedRowBoundsRuntime,
  getSortState as getSortStateRuntime,
  insertColumnsAtContext as insertColumnsAtContextRuntime,
  insertRowsAtContext as insertRowsAtContextRuntime,
  normalizeSortValue as normalizeSortValueRuntime,
  setupColumnSort as setupColumnSortRuntime,
  setupGridResizing as setupGridResizingRuntime,
  sortRowsByColumn as sortRowsByColumnRuntime,
  toggleSortByColumn as toggleSortByColumnRuntime,
  updateSortIcons as updateSortIconsRuntime,
} from './structure-runtime.js';
import {
  arrayBufferToBase64 as arrayBufferToBase64Runtime,
  ensureFloatingAttachmentPreview as ensureFloatingAttachmentPreviewRuntime,
  hideFloatingAttachmentPreview as hideFloatingAttachmentPreviewRuntime,
  positionFloatingAttachmentPreview as positionFloatingAttachmentPreviewRuntime,
  readAttachedFileContent as readAttachedFileContentRuntime,
  setupAttachmentControls as setupAttachmentControlsRuntime,
  setupAttachmentLinkPreview as setupAttachmentLinkPreviewRuntime,
  showFloatingAttachmentPreview as showFloatingAttachmentPreviewRuntime,
} from './attachment-runtime.js';
import {
  applyRightOverflowText as applyRightOverflowTextRuntime,
  computeAll as computeAllRuntime,
  getRenderTargetsForComputeResult as getRenderTargetsForComputeResultRuntime,
  hasUncomputedCells as hasUncomputedCellsRuntime,
  measureOutputRequiredWidth as measureOutputRequiredWidthRuntime,
  startUncomputedMonitor as startUncomputedMonitorRuntime,
  renderCurrentSheetFromStorage as renderCurrentSheetFromStorageRuntime,
} from './compute-runtime.js';
import {
  applyPastedText as applyPastedTextRuntime,
  clearFillRangeHighlight as clearFillRangeHighlightRuntime,
  clearSelectedCells as clearSelectedCellsRuntime,
  copySelectedRangeToClipboard as copySelectedRangeToClipboardRuntime,
  copyTextFallback as copyTextFallbackRuntime,
  finishFillDrag as finishFillDragRuntime,
  finishSelectionDrag as finishSelectionDragRuntime,
  getSelectedCellIds as getSelectedCellIdsRuntime,
  getSelectedRangeText as getSelectedRangeTextRuntime,
  getSelectionStartCellId as getSelectionStartCellIdRuntime,
  highlightFillRange as highlightFillRangeRuntime,
  onFillDragMove as onFillDragMoveRuntime,
  onSelectionDragMove as onSelectionDragMoveRuntime,
  pasteFromClipboard as pasteFromClipboardRuntime,
  startFillDrag as startFillDragRuntime,
  startSelectionDrag as startSelectionDragRuntime,
  syncMentionPreviewToUi as syncMentionPreviewToUiRuntime,
} from './drag-clipboard-runtime.js';
import {
  finishCrossTabMentionAndReturnToSource as finishCrossTabMentionAndReturnToSourceRuntime,
  isCrossTabMentionProxyActive as isCrossTabMentionProxyActiveRuntime,
  onTabButtonClick as onTabButtonClickRuntime,
  restoreCrossTabMentionEditor as restoreCrossTabMentionEditorRuntime,
  shouldStartCrossTabMention as shouldStartCrossTabMentionRuntime,
  startCrossTabMention as startCrossTabMentionRuntime,
  syncCrossTabMentionSourceValue as syncCrossTabMentionSourceValueRuntime,
} from './tab-mention-runtime.js';
import {
  buildPublishedReportUrl as buildPublishedReportUrlRuntime,
  closeFullscreenCell as closeFullscreenCellRuntime,
  copyCellValue as copyCellValueRuntime,
  exportCurrentReportPdf as exportCurrentReportPdfRuntime,
  openFullscreenCell as openFullscreenCellRuntime,
  publishCurrentReport as publishCurrentReportRuntime,
  runFormulaForCell as runFormulaForCellRuntime,
  setupFullscreenOverlay as setupFullscreenOverlayRuntime,
} from './fullscreen-runtime.js';
import {
  bindGridInputEvents as bindGridInputEventsRuntime,
  ensureAddTabMenu as ensureAddTabMenuRuntime,
  ensureContextMenu as ensureContextMenuRuntime,
  hideAddTabMenu as hideAddTabMenuRuntime,
  hideContextMenu as hideContextMenuRuntime,
  openContextMenu as openContextMenuRuntime,
  prepareContextFromCell as prepareContextFromCellRuntime,
  setupButtons as setupButtonsRuntime,
  setupContextMenu as setupContextMenuRuntime,
  toggleAddTabMenu as toggleAddTabMenuRuntime,
} from './keyboard-runtime.js';
import {
  hideScheduleDialog as hideScheduleDialogRuntime,
  setupScheduleDialog as setupScheduleDialogRuntime,
  showScheduleDialogForCell as showScheduleDialogForCellRuntime,
  showScheduleDialogForContextCell as showScheduleDialogForContextCellRuntime,
} from './schedule-runtime.js';
import {
  hideAssistantPanel as hideAssistantPanelRuntime,
  setupAssistantPanel as setupAssistantPanelRuntime,
  toggleAssistantPanel as toggleAssistantPanelRuntime,
} from './assistant-runtime.js';
import {
  hideFormulaTrackerPanel as hideFormulaTrackerPanelRuntime,
  refreshFormulaTrackerPanel as refreshFormulaTrackerPanelRuntime,
  setupFormulaTrackerPanel as setupFormulaTrackerPanelRuntime,
  toggleFormulaTrackerPanel as toggleFormulaTrackerPanelRuntime,
} from './formula-tracker-runtime.js';
import {
  applyDependencyHighlight as applyDependencyHighlightRuntime,
  applyHeaderSelectionRange as applyHeaderSelectionRangeRuntime,
  bindHeaderSelectionEvents as bindHeaderSelectionEventsRuntime,
  cellHasAnyRawValue as cellHasAnyRawValueRuntime,
  clearActiveInput as clearActiveInputRuntime,
  clearDependencyHighlight as clearDependencyHighlightRuntime,
  clearHeaderSelectionHighlight as clearHeaderSelectionHighlightRuntime,
  clearSelectionHighlight as clearSelectionHighlightRuntime,
  clearSelectionRange as clearSelectionRangeRuntime,
  collectDependencyHintsFromRaw as collectDependencyHintsFromRawRuntime,
  ensureActiveCell as ensureActiveCellRuntime,
  extendSelectionRangeTowardCell as extendSelectionRangeTowardCellRuntime,
  findAdjacentCellId as findAdjacentCellIdRuntime,
  findJumpTargetCellId as findJumpTargetCellIdRuntime,
  getSelectionEdgeInputForDirection as getSelectionEdgeInputForDirectionRuntime,
  highlightSelectionRange as highlightSelectionRangeRuntime,
  isDirectTypeKey as isDirectTypeKeyRuntime,
  isEditingCell as isEditingCellRuntime,
  moveSelectionByArrow as moveSelectionByArrowRuntime,
  moveToNextFilledCell as moveToNextFilledCellRuntime,
  onHeaderSelectionDragMove as onHeaderSelectionDragMoveRuntime,
  selectEntireColumn as selectEntireColumnRuntime,
  selectEntireRow as selectEntireRowRuntime,
  selectNearestValueRegionFromActive as selectNearestValueRegionFromActiveRuntime,
  selectWholeSheetRegion as selectWholeSheetRegionRuntime,
  setActiveInput as setActiveInputRuntime,
  setSelectionAnchor as setSelectionAnchorRuntime,
  setSelectionRange as setSelectionRangeRuntime,
  startEditingCell as startEditingCellRuntime,
  startHeaderSelectionDrag as startHeaderSelectionDragRuntime,
  updateAxisHeaderHighlight as updateAxisHeaderHighlightRuntime,
} from './selection-runtime.js';
import {
  downloadRegionRecording as downloadRegionRecordingRuntime,
  setupRegionRecordingControls as setupRegionRecordingControlsRuntime,
  startRegionRecording as startRegionRecordingRuntime,
  stopRegionRecording as stopRegionRecordingRuntime,
  syncRegionRecordingControls as syncRegionRecordingControlsRuntime,
} from './region-recording-runtime.js';

var REPORT_TAB_ID = 'report';

function normalizeChannelSendRecipients(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item == null ? '' : item).trim())
      .filter(Boolean);
  }
  var raw = String(value == null ? '' : value).trim();
  if (!raw) return [];
  return raw
    .split(/[,\n;]/)
    .map(function (item) {
      return String(item || '').trim();
    })
    .filter(Boolean);
}

function parseStructuredChannelSendMessage(message) {
  var raw = String(message == null ? '' : message).trim();
  if (!raw || raw.charAt(0) !== '{') return null;
  try {
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch (e) {
    return null;
  }
}

function parseChannelCommandCellInput(rawValue) {
  var raw = String(rawValue == null ? '' : rawValue).trim();
  if (!raw) return null;
  var spill = false;
  if (raw.charAt(0) === '>') {
    spill = true;
    raw = raw.substring(1).trim();
  }
  var command = parseChannelSendCommand(raw);
  if (!command) return null;
  return {
    spill: spill,
    label: String(command.label || '').trim().toLowerCase(),
    message: String(command.message || ''),
  };
}

function getChannelCommandResultText(result, fallbackLabel) {
  var source = result && typeof result === 'object' ? result : {};
  var stdout = String(source.stdout || '').trim();
  if (stdout) return stdout;
  var body = String(source.body || source.text || source.value || '').trim();
  if (body) return body;
  var stderr = String(source.stderr || '').trim();
  if (stderr) return stderr;
  var message = String(source.message || '').trim();
  if (message) return message;
  return `Sent to /${String(fallbackLabel || '').trim()}`;
}

function splitChannelCommandResultLines(text) {
  return String(text == null ? '' : text)
    .split(/\r?\n/)
    .map(function (line) {
      return String(line || '').trim();
    })
    .filter(Boolean);
}

export class SpreadsheetApp {
  constructor(options) {
    var opts = options || {};
    if (!opts.storage) {
      throw new Error('SpreadsheetApp requires a storage adapter');
    }
    this.sheetDocumentId = String(opts.sheetDocumentId || '');
    this.initialSheetId = String(opts.initialSheetId || '');
    this.onActiveSheetChange =
      typeof opts.onActiveSheetChange === 'function'
        ? opts.onActiveSheetChange
        : null;
    this.availableChannels = Array.isArray(opts.availableChannels)
      ? opts.availableChannels
          .map(function (channel) {
            return channel && typeof channel === 'object'
              ? {
                  id: String(channel.id || ''),
                  label: String(channel.label || '').trim(),
                }
              : null;
          })
          .filter(Boolean)
      : [];
    if (!this.sheetDocumentId) {
      throw new Error('SpreadsheetApp requires sheetDocumentId');
    }
    this.table = document.querySelector('table');
    this.tableWrap = document.querySelector('.table-wrap');
    this.reportWrap = document.querySelector('.report-wrap');
    this.reportEditor = document.querySelector('#report-editor');
    this.reportLive = document.querySelector('#report-live');
    this.formulaInput = document.querySelector('#formula-input');
    this.calcProgress = document.querySelector('#calc-progress');
    this.formulaBar = document.querySelector('.formula-bar');
    this.nameBar = document.querySelector('.name-bar');
    this.cellNameInput = document.querySelector('#cell-name-input');
    this.namedCellJump = document.querySelector('#named-cell-jump');
    this.namedCellJumpPopover = document.querySelector(
      '#named-cell-jump-popover',
    );
    this.attachFileButton = document.querySelector('#attach-file');
    this.attachFileInput = document.querySelector('#attach-file-input');
    this.aiModeButton = document.querySelector('#ai-mode');
    this.aiModePopover = document.querySelector('#ai-mode-popover');
    this.aiModeOptions = Array.prototype.slice.call(
      document.querySelectorAll('.ai-mode-option'),
    );
    this.displayModeButton = document.querySelector('#display-mode');
    this.displayModePopover = document.querySelector('#display-mode-popover');
    this.displayModeOptions = Array.prototype.slice.call(
      document.querySelectorAll('.display-mode-option'),
    );
    this.cellFormatButton = document.querySelector('#cell-format');
    this.cellFormatPopover = document.querySelector('#cell-format-popover');
    this.cellFormatOptions = Array.prototype.slice.call(
      document.querySelectorAll('.cell-format-option'),
    );
    this.cellAlignGroup = document.querySelector('#cell-align');
    this.cellAlignButtons = Array.prototype.slice.call(
      document.querySelectorAll('.cell-align-button'),
    );
    this.cellBordersButton = document.querySelector('#cell-borders');
    this.cellBordersPopover = document.querySelector('#cell-borders-popover');
    this.cellBordersOptions = Array.prototype.slice.call(
      document.querySelectorAll('.cell-borders-option'),
    );
    this.cellBgColorButton = document.querySelector('#cell-bg-color');
    this.cellBgColorSwatch = document.querySelector('#cell-bg-color-swatch');
    this.cellBgColorPopover = document.querySelector('#cell-bg-color-popover');
    this.cellBgColorRecent = document.querySelector('#cell-bg-color-recent');
    this.cellBgColorCustomInput = document.querySelector(
      '#cell-bg-color-custom',
    );
    this.cellFontFamilyButton = document.querySelector('#cell-font-family');
    this.cellFontFamilyPopover = document.querySelector(
      '#cell-font-family-popover',
    );
    this.cellFontFamilyOptions = Array.prototype.slice.call(
      document.querySelectorAll('.cell-font-family-option'),
    );
    this.cellWrapButton = document.querySelector('#cell-wrap');
    this.cellDecimalsDecreaseButton = document.querySelector(
      '#cell-decimals-decrease',
    );
    this.cellDecimalsIncreaseButton = document.querySelector(
      '#cell-decimals-increase',
    );
    this.cellFontSizeDecreaseButton = document.querySelector(
      '#cell-font-size-decrease',
    );
    this.cellFontSizeIncreaseButton = document.querySelector(
      '#cell-font-size-increase',
    );
    this.cellBoldButton = document.querySelector('#cell-bold');
    this.cellItalicButton = document.querySelector('#cell-italic');
    this.regionRecordingCluster = document.querySelector(
      '#region-recording-controls',
    );
    this.recordRegionButton = document.querySelector('#record-region');
    this.regionRecordingButtonLabel = document.querySelector(
      '#record-region-label',
    );
    this.downloadRegionRecordingButton = document.querySelector(
      '#download-region-recording',
    );
    this.undoButton = document.querySelector('#undo-action');
    this.redoButton = document.querySelector('#redo-action');
    this.updateAIButton = document.querySelector('#update-ai');
    this.assistantChatButton = document.querySelector('#assistant-chat-button');
    this.formulaTrackerButton = document.querySelector(
      '#formula-tracker-button',
    );
    this.tabsContainer = document.querySelector('#tabs');
    this.addTabButton = document.querySelector('#add-tab');
    this.deleteTabButton = document.querySelector('#delete-tab');
    this.ensureReportUI();

    this.storage = new StorageService(opts.storage);
    this.tabs = this.storage.readTabs();
    this.ensureReportTabExists();
    this.activeSheetId = this.initializeActiveSheetId();
    this.activeInput = null;
    this.fillDrag = null;
    this.selectionDrag = null;
    this.selectionDragJustFinished = false;
    this.sortStateBySheet = {};
    this.isResorting = false;
    this.dragTabId = null;
    this.editStartRawByCell = {};

    this.gridRows = GRID_ROWS;
    this.gridCols = GRID_COLS;
    this.grid = new GridManager(
      this.table,
      this.gridRows,
      this.gridCols,
      DEFAULT_COL_WIDTH,
      DEFAULT_ROW_HEIGHT,
    );
    this.refreshGridReferences();
    this.selectionAnchorId = null;
    this.selectionRange = null;
    this.extendSelectionNav = false;
    this.lastSelectAllShortcutTs = 0;
    this.formulaRefCursorId = null;
    this.formulaMentionPreview = null;

    this.aiService = new AIService(this.storage, () => this.computeAll(), {
      sheetDocumentId: this.sheetDocumentId,
      getActiveSheetId: () => this.activeSheetId,
    });
    this.formulaEngine = new FormulaEngine(
      this.storage,
      this.aiService,
      () => this.tabs,
      this.cellIds,
    );
    this.uncomputedMonitorMs = 2000;
    this.uncomputedMonitorId = null;
    this.backgroundComputeEnabled = false;
    this.fullscreenOverlay = null;
    this.fullscreenOverlayContent = null;
    this.reportMode = 'edit';
    this.calcProgressHideTimer = null;
    this.lastReportLiveHtml = '';
    this.addTabMenu = null;
    this.contextMenu = null;
    this.contextMenuState = null;
    this.headerSelectionDrag = null;
    this.mentionAutocomplete = null;
    this.mentionAutocompleteState = null;
    this.crossTabMentionContext = null;
    this.suppressBlurCommitOnce = false;
    this.suppressFormulaBarBlurCommitOnce = false;
    this.computedValuesBySheet = {};
    this.computeRequestToken = 0;
    this.manualUpdateRequestToken = 0;
    this.isManualAIUpdating = false;
    this.currentServerEditLockKey = '';
    this.displayMode =
      this.displayModeButton &&
      String(
        this.displayModeButton.getAttribute('data-display-mode-current') || '',
      ).trim().toLowerCase() === 'formulas'
        ? 'formulas'
        : 'values';
    this.editLockOwnerId =
      'lock-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    this.editLockSequence = 0;
    this.pendingAttachmentContext = null;
    this.floatingAttachmentPreview = null;
    this.attachmentPreviewTimer = null;
    this.attachmentPreviewAnchor = null;
    this.handleAttachmentPreviewMouseOver = null;
    this.handleAttachmentPreviewMouseOut = null;
    this.handleAttachmentPreviewScroll = null;
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistoryEntries = 100;
    this.historyGroupKey = '';
    this.historyGroupAt = 0;
    this.historyGroupWindowMs = 1200;
    this.isApplyingHistory = false;
    this.regionRecordingState = null;
    this.regionRecordingGifUrl = '';
    this.regionRecordingFilename = '';
    this.regionRecordingDownloadReady = false;
    this.regionRecordingResultSelectionKey = '';
    this.regionRecordingLastSelectionKey = '';
    this.regionRecordingStatus = '';
    this.regionRecordingTimerId = null;

    this.setupColumnSort();
    this.setupGridResizing();
    this.setupButtons();
    this.setupAIModeControls();
    this.setupDisplayModeControls();
    this.setupCellFormatControls();
    this.setupCellPresentationControls();
    this.setupRegionRecordingControls();
    this.setupCellNameControls();
    this.setupAttachmentControls();
    this.setupReportControls();
    this.bindGridInputEvents();
    this.bindHeaderSelectionEvents();
    this.bindFormulaBarEvents();
    this.setupMentionAutocomplete();
    this.setupFullscreenOverlay();
    this.setupContextMenu();
    this.setupScheduleDialog();
    this.setupAssistantPanel();
    this.setupFormulaTrackerPanel();
    this.setupAttachmentLinkPreview();
    this.startUncomputedMonitor();

    this.renderTabs();
    this.applyViewMode();
    this.applyActiveSheetLayout();
    this.renderCurrentSheetFromStorage();
    this.ensureActiveCell();
  }

  captureRenderedRowHeights() {
    if (!this.table || !this.table.rows || !this.table.rows.length) return [];
    var heights = [];
    for (var rowIndex = 0; rowIndex < this.table.rows.length; rowIndex++) {
      var row = this.table.rows[rowIndex];
      heights[rowIndex] = row ? Math.max(0, Math.round(row.offsetHeight || 0)) : 0;
    }
    return heights;
  }

  applyRenderedRowHeights(heights) {
    if (
      !Array.isArray(heights) ||
      !heights.length ||
      !this.table ||
      !this.table.rows ||
      !this.table.rows.length
    ) {
      return;
    }

    var headerHeight = Math.max(24, Number(heights[0] || 24));
    var headerRow = this.table.rows[0];
    if (headerRow) {
      headerRow.style.height = headerHeight + 'px';
      headerRow.style.minHeight = headerHeight + 'px';
      headerRow.style.maxHeight = headerHeight + 'px';
      for (var headerColIndex = 0; headerColIndex < headerRow.cells.length; headerColIndex++) {
        var headerCell = headerRow.cells[headerColIndex];
        if (!headerCell) continue;
        headerCell.style.height = headerHeight + 'px';
        headerCell.style.minHeight = headerHeight + 'px';
        headerCell.style.maxHeight = headerHeight + 'px';
        headerCell.style.lineHeight = headerHeight + 'px';
      }
    }

    for (var rowIndex = 1; rowIndex < this.table.rows.length; rowIndex++) {
      var nextHeight = Math.max(
        DEFAULT_ROW_HEIGHT,
        Number(heights[rowIndex] || DEFAULT_ROW_HEIGHT),
      );
      if (this.grid && typeof this.grid.setRowHeight === 'function') {
        this.grid.setRowHeight(rowIndex, nextHeight);
      }
    }

    if (this.grid && typeof this.grid.updateTableSize === 'function') {
      this.grid.updateTableSize();
    }
  }

  setDisplayMode(mode) {
    var previousMode = this.displayMode === 'formulas' ? 'formulas' : 'values';
    var preservedHeights =
      previousMode === 'values' && mode === 'formulas'
        ? this.captureRenderedRowHeights()
        : null;
    this.displayMode = mode === 'formulas' ? 'formulas' : 'values';
    if (this.displayModeButton) {
      this.displayModeButton.setAttribute(
        'data-display-mode-current',
        this.displayMode,
      );
    }
    this.renderCurrentSheetFromStorage();
    if (preservedHeights) {
      this.applyRenderedRowHeights(preservedHeights);
    }
  }

  setupDisplayModeControls() {
    setupDisplayModeControlsRuntime(this);
  }
  setupCellFormatControls() {
    setupCellFormatControlsRuntime(this);
  }
  setupCellPresentationControls() {
    setupCellPresentationControlsRuntime(this);
  }
  setupRegionRecordingControls() {
    setupRegionRecordingControlsRuntime(this);
  }

  hasPendingLocalEdit() {
    if (this.activeInput && this.isEditingCell(this.activeInput)) return true;
    if (!this.activeInput || !this.formulaInput) return false;
    if (document.activeElement !== this.formulaInput) return false;

    var currentFormulaValue = String(
      this.formulaInput.value == null ? '' : this.formulaInput.value,
    );
    var storedRawValue = String(
      this.getRawCellValue(this.activeInput.id) || '',
    );
    return currentFormulaValue !== storedRawValue;
  }

  syncAIDraftLock() {
    if (
      !this.aiService ||
      typeof this.aiService.setEditDraftLock !== 'function'
    )
      return;
    var locked = this.hasPendingLocalEdit();
    this.aiService.setEditDraftLock(locked);
    this.syncServerEditLock(locked);
  }

  hasSingleSelectedCell() {
    if (!this.activeInput) return false;
    if (!this.selectionRange) return true;
    return (
      this.selectionRange.startCol === this.selectionRange.endCol &&
      this.selectionRange.startRow === this.selectionRange.endRow
    );
  }

  hasRegionSelection() {
    if (!this.activeInput || !this.selectionRange) return false;
    return !this.hasSingleSelectedCell();
  }

  syncAttachButtonState() {
    if (!this.attachFileButton) return;
    this.attachFileButton.disabled =
      this.isReportActive() || !this.hasSingleSelectedCell();
  }

  syncRegionRecordingControls() {
    syncRegionRecordingControlsRuntime(this);
  }

  startRegionRecording() {
    startRegionRecordingRuntime(this);
  }

  stopRegionRecording(shouldDownload) {
    stopRegionRecordingRuntime(this, shouldDownload);
  }

  downloadRegionRecording() {
    downloadRegionRecordingRuntime(this);
  }

  parseAttachmentSource(rawValue) {
    var raw = String(rawValue == null ? '' : rawValue);
    if (raw.indexOf('__ATTACHMENT__:') !== 0) return null;
    try {
      var parsed = JSON.parse(raw.substring('__ATTACHMENT__:'.length));
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  buildAttachmentSource(payload) {
    return (
      '__ATTACHMENT__:' +
      JSON.stringify({
        name: String((payload && payload.name) || ''),
        type: String((payload && payload.type) || ''),
        content: String((payload && payload.content) || ''),
        contentArtifactId: String((payload && payload.contentArtifactId) || ''),
        binaryArtifactId: String((payload && payload.binaryArtifactId) || ''),
        downloadUrl: String((payload && payload.downloadUrl) || ''),
        previewUrl: String((payload && payload.previewUrl) || ''),
        pending: !!(payload && payload.pending),
        converting: !!(payload && payload.converting),
      })
    );
  }

  syncServerEditLock(locked) {
    var nextKey = '';
    if (
      locked &&
      this.sheetDocumentId &&
      this.activeSheetId &&
      this.activeInput &&
      this.activeInput.id
    ) {
      nextKey = [
        String(this.sheetDocumentId || ''),
        String(this.activeSheetId || ''),
        String(this.activeInput.id || '').toUpperCase(),
      ].join(':');
    }

    if (nextKey === this.currentServerEditLockKey) return;

    var releaseKey = this.currentServerEditLockKey;
    this.currentServerEditLockKey = nextKey;

    if (releaseKey) {
      var releaseParts = releaseKey.split(':');
      this.editLockSequence += 1;
      Meteor.callAsync(
        'ai.setSourceEditLock',
        releaseParts[0],
        releaseParts[1],
        releaseParts.slice(2).join(':'),
        false,
        this.editLockOwnerId,
        this.editLockSequence,
      ).catch(() => {});
    }

    if (nextKey) {
      var lockParts = nextKey.split(':');
      this.editLockSequence += 1;
      Meteor.callAsync(
        'ai.setSourceEditLock',
        lockParts[0],
        lockParts[1],
        lockParts.slice(2).join(':'),
        true,
        this.editLockOwnerId,
        this.editLockSequence,
      ).catch(() => {});
    }
  }

  initializeActiveSheetId() {
    var active = this.storage.getActiveSheetId(this.tabs[0].id);
    if (this.initialSheetId && this.findTabById(this.initialSheetId)) {
      active = this.initialSheetId;
      this.storage.setActiveSheetId(active);
    }
    if (!this.findTabById(active)) {
      active = this.tabs[0].id;
      this.storage.setActiveSheetId(active);
    }
    return active;
  }

  ensureReportTabExists() {
    for (var i = 0; i < this.tabs.length; i++) {
      if (this.tabs[i] && this.tabs[i].type === 'report') return;
      if (this.tabs[i] && this.tabs[i].id === REPORT_TAB_ID) {
        this.tabs[i].type = 'report';
        this.storage.saveTabs(this.tabs);
        return;
      }
    }
    this.tabs.push({ id: REPORT_TAB_ID, name: 'Report', type: 'report' });
    this.storage.saveTabs(this.tabs);
  }

  ensureReportUI() {
    ensureReportUIRuntime(this);
  }

  isReportTab(tabId) {
    var tab = this.findTabById(tabId);
    if (!tab) return false;
    return tab.type === 'report' || tab.id === REPORT_TAB_ID;
  }

  isReportActive() {
    return this.isReportTab(this.activeSheetId);
  }

  findTabById(tabId) {
    for (var i = 0; i < this.tabs.length; i++) {
      if (this.tabs[i].id === tabId) return this.tabs[i];
    }
  }

  applyViewMode() {
    var report = this.isReportActive();
    document.body.classList.toggle('report-active', report);
    if (this.tableWrap)
      this.tableWrap.style.display = report ? 'none' : 'block';
    if (this.reportWrap)
      this.reportWrap.style.display = report ? 'block' : 'none';
    if (this.formulaBar) this.formulaBar.style.display = 'flex';
    if (this.nameBar) this.nameBar.style.display = 'flex';
    this.deleteTabButton.disabled = report;
    if (report && this.regionRecordingState && this.regionRecordingState.isRecording) {
      this.stopRegionRecording(true);
    }
    this.syncRegionRecordingControls();
  }

  getRawCellValue(cellId) {
    return this.storage.getCellValue(this.activeSheetId, cellId);
  }

  getCellFormat(cellId) {
    return this.storage.getCellFormat(this.activeSheetId, cellId);
  }

  getCellPresentation(cellId) {
    return this.storage.getCellPresentation(this.activeSheetId, cellId);
  }

   setRawCellValue(cellId, value, meta) {
    var normalizedCellId = String(cellId || '').toUpperCase();
    var nextRaw = String(value == null ? '' : value);
    var previousRaw = String(
      this.storage.getCellValue(this.activeSheetId, normalizedCellId) || '',
    );

    if (
      this.isGeneratedAIResultSourceRaw(previousRaw) &&
      previousRaw !== nextRaw
    ) {
      this.clearGeneratedResultCellsForSource(
        this.activeSheetId,
        normalizedCellId,
        previousRaw,
      );
    }

    this.storage.setCellValue(
      this.activeSheetId,
      normalizedCellId,
      nextRaw,
      meta,
    );
  }

  getCellSchedule(cellId) {
    return this.storage.getCellSchedule(this.activeSheetId, cellId);
  }

  setCellFormat(cellId, format) {
    this.storage.setCellFormat(this.activeSheetId, cellId, format);
    this.syncCellFormatControl();
  }

  setCellPresentation(cellId, presentation) {
    this.storage.setCellPresentation(this.activeSheetId, cellId, presentation);
    this.syncCellPresentationControls();
  }

  setCellSchedule(cellId, schedule) {
    this.storage.setCellSchedule(this.activeSheetId, cellId, schedule);
  }

  getWorkbookAdapter() {
    return this.storage && this.storage.storage ? this.storage.storage : null;
  }

  getWorkbookSnapshot() {
    var adapter = this.getWorkbookAdapter();
    if (!adapter || typeof adapter.snapshot !== 'function') return null;
    return adapter.snapshot();
  }

  createHistoryEntry() {
    return createHistoryEntryRuntime(this);
  }

  captureHistorySnapshot(groupKey) {
    captureHistorySnapshotRuntime(this, groupKey);
  }

  resetHistoryGrouping() {
    resetHistoryGroupingRuntime(this);
  }

  applyWorkbookHistorySnapshot(serialized) {
    applyWorkbookHistorySnapshotRuntime(this, serialized);
  }

  undo() {
    undoRuntime(this);
  }

  redo() {
    redoRuntime(this);
  }

  hasRawCellChanged(cellId, nextRawValue) {
    var next = String(nextRawValue == null ? '' : nextRawValue);
    var start = Object.prototype.hasOwnProperty.call(
      this.editStartRawByCell,
      cellId,
    )
      ? this.editStartRawByCell[cellId]
      : this.getRawCellValue(cellId);
    return start !== next;
  }

  isFormulaLikeRawValue(rawValue) {
    var raw = String(rawValue == null ? '' : rawValue);
    return (
      !!raw &&
      (raw.charAt(0) === '=' ||
        raw.charAt(0) === '>' ||
        raw.charAt(0) === '#' ||
        raw.charAt(0) === "'")
    );
  }

  runChannelSendCommandForCell(cellId, rawValue) {
    var normalizedCellId = String(cellId || '').toUpperCase();
    var raw = String(rawValue == null ? '' : rawValue);
    var command = parseChannelSendCommand(raw);
    if (!command || !command.label || !command.message) return false;
    var structuredPayload = parseStructuredChannelSendMessage(command.message);
    var messageTemplate = structuredPayload
      ? String(structuredPayload.body || '')
      : command.message;
    var prepared = this.formulaEngine.prepareAIPrompt(
      this.activeSheetId,
      messageTemplate,
      {},
      {},
    );
    var outboundAttachments =
      buildChannelSendAttachmentsFromPreparedPrompt(prepared);
    var outboundBody = outboundAttachments.length
      ? stripChannelSendFileAndImagePlaceholders(prepared.userPrompt || '')
      : buildChannelSendBodyFromPreparedPrompt(prepared);
    var outboundPayload = structuredPayload
      ? {
          to: normalizeChannelSendRecipients(structuredPayload.to),
          subj: String(structuredPayload.subj || ''),
          body: outboundBody,
          attachments: outboundAttachments,
        }
      : {
          body: outboundBody,
          attachments: outboundAttachments,
        };

    this.setRawCellValue(normalizedCellId, raw);
    this.storage.setCellRuntimeState(this.activeSheetId, normalizedCellId, {
      value: `Sending to /${command.label}...`,
      state: 'pending',
      error: '',
    });
    this.renderCurrentSheetFromStorage();
    if (this.activeInput && this.activeInput.id === normalizedCellId) {
      this.formulaInput.value = raw;
    }

    Meteor.callAsync('channels.sendByLabel', command.label, outboundPayload)
      .then(() => {
        this.storage.setCellRuntimeState(this.activeSheetId, normalizedCellId, {
          value: `Sent to /${command.label}`,
          state: 'resolved',
          error: '',
        });
        this.renderCurrentSheetFromStorage();
      })
      .catch((error) => {
        var message = String(
          (error && (error.reason || error.message)) ||
            'Failed to send channel message',
        ).trim();
        this.storage.setCellRuntimeState(this.activeSheetId, normalizedCellId, {
          value: '#ERROR',
          state: 'error',
          error: message,
        });
        this.renderCurrentSheetFromStorage();
      });
    return true;
  }

  beginCellUpdateTrace(cellId, rawValue) {
    if (!shouldProfileCellUpdatesClient()) return null;
    var trace = createCellUpdateTrace({
      sheetId: this.activeSheetId,
      cellId: String(cellId || '').toUpperCase(),
      rawKind: this.isFormulaLikeRawValue(rawValue) ? 'formula' : 'value',
    });
    traceCellUpdateClient(trace, 'edit.commit.start');
    return trace;
  }

  getDependentSourceKeysForActiveCell(cellId) {
    var graph = this.storage.getDependencyGraph();
    var key =
      String(this.activeSheetId || '') +
      ':' +
      String(cellId || '').toUpperCase();
    var results = [];
    var seen = Object.create(null);
    var addKeys = function (keys) {
      var list = Array.isArray(keys) ? keys : [];
      for (var i = 0; i < list.length; i++) {
        var item = String(list[i] || '');
        if (!item || seen[item]) continue;
        seen[item] = true;
        results.push(item);
      }
    };

    addKeys(graph && graph.dependentsByCell ? graph.dependentsByCell[key] : []);

    var namedCells = this.storage.readNamedCells();
    for (var name in namedCells) {
      if (!Object.prototype.hasOwnProperty.call(namedCells, name)) continue;
      var ref = namedCells[name];
      if (!ref || ref.sheetId !== this.activeSheetId) continue;
      if (
        String(ref.cellId || '').toUpperCase() !==
        String(cellId || '').toUpperCase()
      )
        continue;
      addKeys(
        graph && graph.dependentsByNamedRef
          ? graph.dependentsByNamedRef[String(name)]
          : [],
      );
    }

    var scanned = this.scanDependentSourceKeys(key);
    addKeys(scanned);

    return results;
  }

  hasDownstreamDependents(cellId) {
    return this.getDependentSourceKeysForActiveCell(cellId).length > 0;
  }

  hasDownstreamDependentsForCell(sheetId, cellId) {
    return this.getTransitiveDependentSourceKeysForCell(sheetId, cellId).length > 0;
  }

  parseDependencySourceKey(sourceKey) {
    var normalized = String(sourceKey || '');
    var separatorIndex = normalized.indexOf(':');
    if (separatorIndex === -1) return null;
    return {
      sheetId: normalized.slice(0, separatorIndex),
      cellId: normalized.slice(separatorIndex + 1).toUpperCase(),
    };
  }

  getTransitiveDependentSourceKeys(cellId) {
    return this.getTransitiveDependentSourceKeysForCell(
      this.activeSheetId,
      cellId,
    );
  }

  getTransitiveDependentSourceKeysForCell(sheetId, cellId) {
    var graph = this.storage.getDependencyGraph();
    var startKey =
      String(sheetId || '') +
      ':' +
      String(cellId || '').toUpperCase();
    var queue = [];
    var seen = Object.create(null);
    var result = [];
    var enqueue = function (key) {
      var normalized = String(key || '');
      if (!normalized || seen[normalized]) return;
      seen[normalized] = true;
      queue.push(normalized);
      result.push(normalized);
    };

    var direct =
      graph && graph.dependentsByCell ? graph.dependentsByCell[startKey] : [];
    direct = Array.isArray(direct) ? direct : [];
    for (var i = 0; i < direct.length; i++) enqueue(direct[i]);
    var scannedDirect = this.scanDependentSourceKeys(startKey);
    for (var s = 0; s < scannedDirect.length; s++) enqueue(scannedDirect[s]);

    var namedCells = this.storage.readNamedCells();
    for (var name in namedCells) {
      if (!Object.prototype.hasOwnProperty.call(namedCells, name)) continue;
      var ref = namedCells[name];
      if (!ref || ref.sheetId !== String(sheetId || '')) continue;
      if (
        String(ref.cellId || '').toUpperCase() !==
        String(cellId || '').toUpperCase()
      )
        continue;
      var namedDependents =
        graph && graph.dependentsByNamedRef
          ? graph.dependentsByNamedRef[String(name)]
          : [];
      namedDependents = Array.isArray(namedDependents) ? namedDependents : [];
      for (var j = 0; j < namedDependents.length; j++)
        enqueue(namedDependents[j]);
    }

    while (queue.length) {
      var current = queue.shift();
      var downstream =
        graph && graph.dependentsByCell ? graph.dependentsByCell[current] : [];
      downstream = Array.isArray(downstream) ? downstream : [];
      for (var d = 0; d < downstream.length; d++) enqueue(downstream[d]);
      var scannedDownstream = this.scanDependentSourceKeys(current);
      for (var sd = 0; sd < scannedDownstream.length; sd++)
        enqueue(scannedDownstream[sd]);
    }

    return result;
  }

  scanDependentSourceKeys(sourceKey) {
    var normalizedSourceKey = String(sourceKey || '');
    if (!normalizedSourceKey) return [];
    var separatorIndex = normalizedSourceKey.indexOf(':');
    if (separatorIndex === -1) return [];
    var targetSheetId = normalizedSourceKey.slice(0, separatorIndex);
    var targetCellId = normalizedSourceKey
      .slice(separatorIndex + 1)
      .toUpperCase();
    var results = [];
    var seen = Object.create(null);
    var escapeRegExp = function (value) {
      return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };
    var sourceNames = [];
    var namedCells = this.storage.readNamedCells();
    for (var name in namedCells) {
      if (!Object.prototype.hasOwnProperty.call(namedCells, name)) continue;
      var ref = namedCells[name];
      if (!ref || String(ref.sheetId || '') !== targetSheetId) continue;
      if (String(ref.cellId || '').toUpperCase() !== targetCellId) continue;
      sourceNames.push(String(name));
    }
    var allCells =
      this.storage && typeof this.storage.listAllCellIds === 'function'
        ? this.storage.listAllCellIds()
        : [];

    for (var i = 0; i < allCells.length; i++) {
      var entry = allCells[i];
      if (!entry || !entry.sheetId || !entry.cellId) continue;
      var sourceSheetId = String(entry.sheetId || '');
      var sourceCellId = String(entry.cellId || '').toUpperCase();
      var raw = String(
        this.storage.getCellValue(sourceSheetId, sourceCellId) || '',
      );
      if (!this.isFormulaLikeRawValue(raw)) continue;
      var dependencies = [];
      try {
        dependencies = this.formulaEngine.collectCellDependencies(
          sourceSheetId,
          sourceCellId,
        );
      } catch (error) {
        dependencies = [];
      }
      var matches = false;
      for (var d = 0; d < dependencies.length; d++) {
        var dependency = dependencies[d];
        if (!dependency || dependency.kind !== 'cell') continue;
        if (String(dependency.sheetId || '') !== targetSheetId) continue;
        if (String(dependency.cellId || '').toUpperCase() !== targetCellId)
          continue;
        matches = true;
        break;
      }
      if (!matches) {
        var body =
          raw.charAt(0) === '=' ||
          raw.charAt(0) === "'" ||
          raw.charAt(0) === '>' ||
          raw.charAt(0) === '#'
            ? raw.substring(1)
            : raw;
        if (sourceSheetId === targetSheetId) {
          var cellPattern = new RegExp(
            '(^|[^A-Za-z0-9_!])@?' + escapeRegExp(targetCellId) + '\\b',
            'i',
          );
          matches = cellPattern.test(body);
        }
        if (!matches && sourceNames.length) {
          for (var n = 0; n < sourceNames.length; n++) {
            var namedPattern = new RegExp(
              '(^|[^A-Za-z0-9_])@?' + escapeRegExp(sourceNames[n]) + '\\b',
              'i',
            );
            if (namedPattern.test(body)) {
              matches = true;
              break;
            }
          }
        }
      }
      if (!matches) continue;
      var key = sourceSheetId + ':' + sourceCellId;
      if (seen[key]) continue;
      seen[key] = true;
      results.push(key);
    }

    return results;
  }

  isExplicitAsyncFormulaRaw(rawValue) {
    var raw = String(rawValue == null ? '' : rawValue);
    if (!raw) return false;
    if (raw.charAt(0) === "'" || raw.charAt(0) === '>' || raw.charAt(0) === '#')
      return true;
    if (raw.charAt(0) !== '=') return false;
    var expression = raw.substring(1);
    if (/(^|[^A-Za-z0-9_])(askAI|listAI|recalc|update)\s*\(/i.test(expression))
      return true;
    return false;
  }

  isGeneratedAIResultSourceRaw(rawValue) {
    var raw = String(rawValue == null ? '' : rawValue);
    if (!raw) return false;
    if (raw.charAt(0) === '>' || raw.charAt(0) === '#') return true;
    if (raw.charAt(0) !== '=') return false;
    return /(^|[^A-Za-z0-9_])(listAI|tableAI)\s*\(/i.test(raw.substring(1));
  }

  canLocallyResolveSyncSourceKey(sourceKey, trace) {
    var parsed = this.parseDependencySourceKey(sourceKey);
    if (!parsed) return false;
    var visiting = trace || Object.create(null);
    var normalizedKey = parsed.sheetId + ':' + parsed.cellId;
    if (visiting[normalizedKey]) return true;
    visiting[normalizedKey] = true;

    try {
      var raw = String(
        this.storage.getCellValue(parsed.sheetId, parsed.cellId) || '',
      );
      if (!raw || raw.charAt(0) !== '=') return false;
      if (this.isExplicitAsyncFormulaRaw(raw)) return false;
      if (this.parseAttachmentSource(raw)) return false;

      var deps =
        this.storage.getCellDependencies(parsed.sheetId, parsed.cellId) || {};
      if (Array.isArray(deps.channelLabels) && deps.channelLabels.length)
        return false;
      if (Array.isArray(deps.attachments) && deps.attachments.length)
        return false;

      var namedRefs = Array.isArray(deps.namedRefs) ? deps.namedRefs : [];
      for (var n = 0; n < namedRefs.length; n++) {
        var ref = this.storage.resolveNamedCell(namedRefs[n]);
        if (!ref || !ref.sheetId) return false;
        if (ref.cellId) {
          var namedRaw = String(
            this.storage.getCellValue(ref.sheetId, ref.cellId) || '',
          );
          if (this.isFormulaLikeRawValue(namedRaw)) {
            if (
              !this.canLocallyResolveSyncSourceKey(
                ref.sheetId + ':' + String(ref.cellId).toUpperCase(),
                visiting,
              )
            ) {
              return false;
            }
          }
        } else {
          return false;
        }
      }

      var cells = Array.isArray(deps.cells) ? deps.cells : [];
      for (var i = 0; i < cells.length; i++) {
        var entry = cells[i];
        if (!entry || typeof entry !== 'object') continue;
        var depSheetId = String(entry.sheetId || '');
        var depCellId = String(entry.cellId || '').toUpperCase();
        var depRaw = String(
          this.storage.getCellValue(depSheetId, depCellId) || '',
        );
        if (this.isFormulaLikeRawValue(depRaw)) {
          if (
            !this.canLocallyResolveSyncSourceKey(
              depSheetId + ':' + depCellId,
              visiting,
            )
          ) {
            return false;
          }
        }
      }

      return true;
    } finally {
      delete visiting[normalizedKey];
    }
  }

  collectLocalSyncRecomputePlan(cellId, rawValue) {
    return this.collectLocalSyncRecomputePlanForCell(
      this.activeSheetId,
      cellId,
      rawValue,
    );
  }

  collectLocalSyncRecomputePlanForCell(sheetId, cellId, rawValue) {
    var normalizedCellId = String(cellId || '').toUpperCase();
    var raw = String(rawValue == null ? '' : rawValue);
    var targets = [];
    var seen = Object.create(null);
    var needsServer = false;
    var serverTargets = [];
    var add = function (key) {
      var normalized = String(key || '');
      if (!normalized || seen[normalized]) return;
      seen[normalized] = true;
      targets.push(normalized);
    };

    if (raw && raw.charAt(0) === '=') {
      add(String(sheetId || '') + ':' + normalizedCellId);
    }

    var downstream = this.getTransitiveDependentSourceKeysForCell(
      sheetId,
      normalizedCellId,
    );
    for (var i = 0; i < downstream.length; i++) add(downstream[i]);

    if (!targets.length) {
      return {
        localTargets: [],
        serverTargets: [],
        needsServer: false,
      };
    }
    for (var t = 0; t < targets.length; t++) {
      if (
        !this.canLocallyResolveSyncSourceKey(targets[t], Object.create(null))
      ) {
        needsServer = true;
        serverTargets.push(targets[t]);
        targets.splice(t, 1);
        t -= 1;
      }
    }
    return {
      localTargets: targets,
      serverTargets: serverTargets,
      needsServer: needsServer,
    };
  }

  markServerRecomputeTargetsStale(sourceKeys) {
    var targets = Array.isArray(sourceKeys) ? sourceKeys : [];
    for (var i = 0; i < targets.length; i++) {
      var parsed = this.parseDependencySourceKey(targets[i]);
      if (!parsed) continue;
      var raw = String(
        this.storage.getCellValue(parsed.sheetId, parsed.cellId) || '',
      );
      if (!this.isFormulaLikeRawValue(raw)) continue;
      if (this.isGeneratedAIResultSourceRaw(raw)) {
        this.storage.clearGeneratedCellsBySource(parsed.sheetId, parsed.cellId);
      }
      var nextState = {
        state: 'stale',
        error: '',
      };
      if (this.isExplicitAsyncFormulaRaw(raw)) nextState.value = '';
      this.storage.setCellRuntimeState(parsed.sheetId, parsed.cellId, nextState);
    }
  }

  recomputeLocalSyncTargets(sourceKeys) {
    var targets = Array.isArray(sourceKeys) ? sourceKeys : [];
    if (!targets.length) return false;

    for (var i = 0; i < targets.length; i++) {
      var parsed = this.parseDependencySourceKey(targets[i]);
      if (!parsed) continue;
      try {
        var runtimeMeta = {};
        var value = this.formulaEngine.evaluateCell(
          parsed.sheetId,
          parsed.cellId,
          {},
          { forceRefreshAI: false, runtimeMeta: runtimeMeta },
        );
        var nextValue = String(value == null ? '' : value);
        var nextState = nextValue === '...' ? 'pending' : 'resolved';
        this.storage.setCellRuntimeState(parsed.sheetId, parsed.cellId, {
          value: nextValue,
          displayValue: String(runtimeMeta.displayValue || nextValue),
          state: nextState,
          error: '',
        });
        if (!this.computedValuesBySheet[parsed.sheetId])
          this.computedValuesBySheet[parsed.sheetId] = {};
        this.computedValuesBySheet[parsed.sheetId][parsed.cellId] = nextValue;
      } catch (error) {
        var message = String(
          error && error.message ? error.message : error || '',
        );
        var displayValue =
          message === '#SELECT_FILE'
            ? '#SELECT_FILE'
            : message.indexOf('#REF!') === 0
              ? '#REF!'
              : '#ERROR';
        this.storage.setCellRuntimeState(parsed.sheetId, parsed.cellId, {
          value: displayValue,
          state: 'error',
          error: message || displayValue,
        });
        if (!this.computedValuesBySheet[parsed.sheetId])
          this.computedValuesBySheet[parsed.sheetId] = {};
        this.computedValuesBySheet[parsed.sheetId][parsed.cellId] =
          displayValue;
      }
    }
    return true;
  }

  applyRawCellUpdate(sheetId, cellId, rawValue, meta) {
    var targetSheetId = String(sheetId || '');
    var normalizedCellId = String(cellId || '').toUpperCase();
    var raw = String(rawValue == null ? '' : rawValue);
    this.storage.setCellValue(targetSheetId, normalizedCellId, raw, meta);
    this.aiService.notifyActiveCellChanged();
    var recomputePlan = this.collectLocalSyncRecomputePlanForCell(
      targetSheetId,
      normalizedCellId,
      raw,
    );
    var localTargets =
      recomputePlan && Array.isArray(recomputePlan.localTargets)
        ? recomputePlan.localTargets
        : [];
    var serverTargets =
      recomputePlan && Array.isArray(recomputePlan.serverTargets)
        ? recomputePlan.serverTargets
        : [];
    var needsServer = !!(recomputePlan && recomputePlan.needsServer);
    if (localTargets.length) {
      this.recomputeLocalSyncTargets(localTargets);
    }
    if (serverTargets.length) {
      this.markServerRecomputeTargetsStale(serverTargets);
    }
    if (
      needsServer ||
      this.isFormulaLikeRawValue(raw) ||
      (this.hasDownstreamDependentsForCell(targetSheetId, normalizedCellId) &&
        !localTargets.length)
    ) {
      this.computeAll({ bypassPendingEdit: true });
    }
  }

  commitRawCellEdit(cellId, rawValue, trace) {
    var normalizedCellId = String(cellId || '').toUpperCase();
    var raw = String(rawValue == null ? '' : rawValue);
    this.captureHistorySnapshot(
      'cell:' + this.activeSheetId + ':' + normalizedCellId,
    );
    if (this.runChannelSendCommandForCell(normalizedCellId, raw)) {
      traceCellUpdateClient(trace, 'channel_send.dispatched', {
        cellId: normalizedCellId,
      });
      return;
    }
    this.setRawCellValue(normalizedCellId, raw);
    this.aiService.notifyActiveCellChanged();
    if (this.activeInput && this.activeInput.id === normalizedCellId) {
      this.formulaInput.value = raw;
    }
    var recomputePlan = this.collectLocalSyncRecomputePlan(
      normalizedCellId,
      raw,
    );
    var localTargets =
      recomputePlan && Array.isArray(recomputePlan.localTargets)
        ? recomputePlan.localTargets
        : [];
    var serverTargets =
      recomputePlan && Array.isArray(recomputePlan.serverTargets)
        ? recomputePlan.serverTargets
        : [];
    var needsServer = !!(recomputePlan && recomputePlan.needsServer);
    if (localTargets.length) {
      this.recomputeLocalSyncTargets(localTargets);
      traceCellUpdateClient(trace, 'local_sync_recompute.done', {
        targets: localTargets.length,
      });
    }
    if (serverTargets.length) {
      this.markServerRecomputeTargetsStale(serverTargets);
    }
    this.renderCurrentSheetFromStorage();
    traceCellUpdateClient(trace, 'edit.local_render.done', {
      hasDownstreamDependents: this.hasDownstreamDependents(normalizedCellId),
      localTargets: localTargets.length,
      serverTargets: serverTargets.length,
      needsServer: needsServer,
    });
    if (
      needsServer ||
      this.isFormulaLikeRawValue(raw) ||
      (this.hasDownstreamDependents(normalizedCellId) && !localTargets.length)
    ) {
      this.computeAll({ trace: trace, bypassPendingEdit: true });
      return;
    }
    traceCellUpdateClient(trace, 'edit.complete.no_server');
  }

  runQuotedPromptForCell(cellId, rawValue, inputElement) {
    var raw = String(rawValue == null ? '' : rawValue);
    if (!raw || raw.charAt(0) !== "'") return false;
    this.captureHistorySnapshot(
      'cell:' + this.activeSheetId + ':' + String(cellId || '').toUpperCase(),
    );

    var prompt = raw.substring(1).trim();
    var updateFormulaBar = () => {
      if (this.activeInput && this.activeInput.id === cellId) {
        this.formulaInput.value = this.getRawCellValue(cellId);
      }
    };

    if (!prompt) {
      this.setRawCellValue(cellId, '');
      if (inputElement) inputElement.value = '';
      updateFormulaBar();
      this.computeAll();
      return true;
    }

    this.setRawCellValue(cellId, raw);
    if (inputElement) inputElement.value = raw;
    updateFormulaBar();
    this.aiService.withManualTrigger(() => this.computeAll());
    return true;
  }

  parseTablePromptSpec(rawValue) {
    var raw = String(rawValue == null ? '' : rawValue);
    if (!raw) return null;
    var marker = raw.charAt(0);
    if (marker !== '#') return null;

    var payload = raw.substring(1).trim();
    if (!payload) return { prompt: '', cols: null, rows: null };

    var parts = payload.split(';');
    if (parts.length >= 3) {
      var maybeRows = parseInt(parts[parts.length - 1].trim(), 10);
      var maybeCols = parseInt(parts[parts.length - 2].trim(), 10);
      if (
        !isNaN(maybeCols) &&
        maybeCols > 0 &&
        !isNaN(maybeRows) &&
        maybeRows > 0
      ) {
        return {
          prompt: parts.slice(0, -2).join(';').trim(),
          cols: maybeCols,
          rows: maybeRows,
        };
      }
    }

    return { prompt: payload, cols: null, rows: null };
  }

  parseChannelFeedPromptSpec(rawValue) {
    var raw = String(rawValue == null ? '' : rawValue);
    if (!raw || raw.charAt(0) !== '#') return null;

    var payload = raw.substring(1).trim();
    if (!payload) return null;

    var match = /^(\+)?(\d+)?\s*(.+)$/.exec(payload);
    if (!match) return null;

    var includeAttachments = match[1] === '+';
    var dayToken = String(match[2] || '').trim();
    var prompt = String(match[3] || '').trim();
    if (!prompt) return null;
    if (!/(^|[^A-Za-z0-9_:/])\/([A-Za-z][A-Za-z0-9_-]*)\b/.test(prompt))
      return null;

    var days = dayToken ? parseInt(dayToken, 10) : 1;
    if (isNaN(days) || days < 1) return null;

    return { prompt: prompt, days: days, includeAttachments: includeAttachments };
  }

  runTablePromptForCell(cellId, rawValue, inputElement) {
    var channelSpec = this.parseChannelFeedPromptSpec(rawValue);
    if (channelSpec) {
      this.captureHistorySnapshot(
        'cell:' + this.activeSheetId + ':' + String(cellId || '').toUpperCase(),
      );
      this.setRawCellValue(cellId, String(rawValue));
      if (inputElement) inputElement.value = String(rawValue);
      if (this.activeInput && this.activeInput.id === cellId)
        this.formulaInput.value = String(rawValue);
      this.computeAll();
      return true;
    }
    var spec = this.parseTablePromptSpec(rawValue);
    if (!spec) return false;
    this.captureHistorySnapshot(
      'cell:' + this.activeSheetId + ':' + String(cellId || '').toUpperCase(),
    );
    var prompt = spec.prompt;
    if (!prompt) {
      this.setRawCellValue(cellId, '');
      if (inputElement) inputElement.value = '';
      if (this.activeInput && this.activeInput.id === cellId)
        this.formulaInput.value = '';
      this.computeAll();
      return true;
    }

    var sourceCellId = String(cellId || '').toUpperCase();
    var sourceRaw = String(rawValue == null ? '' : rawValue);

    this.setRawCellValue(cellId, sourceRaw);
    if (inputElement) inputElement.value = String(rawValue);
    if (this.activeInput && this.activeInput.id === cellId)
      this.formulaInput.value = String(rawValue);
    this.computeAll();

    var prepared = this.formulaEngine.prepareAIPrompt(
      this.activeSheetId,
      prompt,
      {},
      {},
    );
    var dependencies = this.formulaEngine.collectAIPromptDependencies(
      this.activeSheetId,
      prompt,
    );
    this.aiService
      .askTable(prepared.userPrompt, spec.cols, spec.rows, {
        onResult: (rows) => {
          if (
            String(this.getRawCellValue(sourceCellId) || '') !== sourceRaw
          ) {
            return;
          }
          this.placeTableAtCell(sourceCellId, rows, true);
        },
        systemPrompt: prepared.systemPrompt,
        userContent: prepared.userContent,
        queueMeta: {
          formulaKind: 'table',
          sourceCellId: sourceCellId,
          promptTemplate: prompt,
          colsLimit: spec.cols,
          rowsLimit: spec.rows,
          dependencies: dependencies,
        },
      })
      .then(() => {
        if (String(this.getRawCellValue(sourceCellId) || '') === sourceRaw) {
          this.computeAll();
        }
      })
      .catch((err) => {
        if (String(this.getRawCellValue(sourceCellId) || '') !== sourceRaw) {
          return;
        }
        var message =
          '#AI_ERROR: ' + (err && err.message ? err.message : String(err));
        this.setRawCellValue(sourceCellId, sourceRaw);
        var parsed = this.parseCellId(sourceCellId);
        if (parsed) {
          var errCellId = this.formatCellId(parsed.col, parsed.row + 1);
          if (this.inputById[errCellId])
            this.setRawCellValue(errCellId, message);
        }
        if (this.activeInput && this.activeInput.id === sourceCellId)
          this.formulaInput.value = sourceRaw;
        this.computeAll();
      });
    return true;
  }

  placeTableAtCell(cellId, rows, preserveSourceCell) {
    var start = this.parseCellId(cellId);
    if (!start) return;
    var sourceKey = String(cellId || '').toUpperCase();
    var matrix = Array.isArray(rows) ? rows : [];
    if (!matrix.length) {
      if (!preserveSourceCell) this.setRawCellValue(cellId, '');
      return;
    }

    var baseRow = start.row + (preserveSourceCell ? 1 : 0);
    var baseCol = start.col;

    for (var r = 0; r < matrix.length; r++) {
      var row = Array.isArray(matrix[r]) ? matrix[r] : [matrix[r]];
      for (var c = 0; c < row.length; c++) {
        var targetCellId = this.formatCellId(baseCol + c, baseRow + r);
        if (!this.inputById[targetCellId]) continue;
        this.setRawCellValue(
          targetCellId,
          String(row[c] == null ? '' : row[c]),
          { generatedBy: sourceKey },
        );
      }
    }
  }

  collectGeneratedResultCellIdsForSource(sheetId, sourceCellId, rawValue) {
    var sourceKey = String(sourceCellId || '').toUpperCase();
    var result = [];
    var seen = Object.create(null);
    var add = function (cellId) {
      var normalized = String(cellId || '').toUpperCase();
      if (!normalized || seen[normalized]) return;
      seen[normalized] = true;
      result.push(normalized);
    };

    var generatedIds =
      this.storage.listGeneratedCellsBySource(sheetId, sourceKey) || [];
    for (var i = 0; i < generatedIds.length; i++) add(generatedIds[i]);

    var raw = String(rawValue == null ? '' : rawValue);
    if (raw.charAt(0) !== '#') return result;
    if (this.parseChannelFeedPromptSpec(raw)) return result;
    if (
      !this.formulaEngine ||
      typeof this.formulaEngine.readTableShortcutMatrix !== 'function'
    ) {
      return result;
    }

    var source = this.parseCellId(sourceKey);
    if (!source) return result;
    var matrix = this.formulaEngine.readTableShortcutMatrix(
      sheetId,
      sourceKey,
      {},
      {},
    );
    var rows = Array.isArray(matrix) ? matrix : [];
    for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      var rowValues = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
      for (var colIndex = 0; colIndex < rowValues.length; colIndex++) {
        add(this.formatCellId(source.col + colIndex, source.row + 1 + rowIndex));
      }
    }
    return result;
  }

  clearGeneratedResultCellsForSource(sheetId, sourceCellId, rawValue) {
    var generatedIds = this.collectGeneratedResultCellIdsForSource(
      sheetId,
      sourceCellId,
      rawValue,
    );
    var computedCache = this.computedValuesBySheet[sheetId];
    for (var i = 0; i < generatedIds.length; i++) {
      var targetCellId = String(generatedIds[i] || '').toUpperCase();
      if (computedCache) delete computedCache[targetCellId];
      this.storage.setCellValue(sheetId, targetCellId, '', { generatedBy: '' });
    }
    return generatedIds.length;
  }

  setupGridResizing() {
    setupGridResizingRuntime(this);
  }

  setupColumnSort() {
    setupColumnSortRuntime(this);
  }

  getSortState() {
    return getSortStateRuntime(this);
  }

  cellIdFrom(colIndex, rowIndex) {
    return this.columnIndexToLabel(colIndex) + rowIndex;
  }

  normalizeSortValue(value) {
    return normalizeSortValueRuntime(this, value);
  }

  compareSortValues(a, b, direction) {
    return compareSortValuesRuntime(this, a, b, direction);
  }

  runWithAISuppressed(fn) {
    if (
      this.aiService &&
      typeof this.aiService.withRequestsSuppressed === 'function'
    ) {
      return this.aiService.withRequestsSuppressed(fn);
    }
    return fn();
  }

  updateCalcProgress(current, total) {
    if (!this.calcProgress) return;
    if (!total || total < 1) {
      this.calcProgress.textContent = '';
      this.calcProgress.classList.remove('active');
      return;
    }
    if (this.calcProgressHideTimer) {
      clearTimeout(this.calcProgressHideTimer);
      this.calcProgressHideTimer = null;
    }
    this.calcProgress.textContent = Math.min(current, total) + '/' + total;
    this.calcProgress.classList.add('active');
  }

  finishCalcProgress(total) {
    if (!this.calcProgress) return;
    if (!total || total < 1) {
      this.updateCalcProgress(0, 0);
      return;
    }
    this.updateCalcProgress(total, total);
    this.calcProgressHideTimer = setTimeout(() => {
      this.updateCalcProgress(0, 0);
    }, 800);
  }

  toggleSortByColumn(colIndex) {
    toggleSortByColumnRuntime(this, colIndex);
  }

  sortRowsByColumn(colIndex, direction, skipCompute) {
    sortRowsByColumnRuntime(this, colIndex, direction, skipCompute);
  }

  updateSortIcons() {
    updateSortIconsRuntime(this);
  }

  applyAutoResort() {
    return applyAutoResortRuntime(this);
  }

  applyActiveSheetLayout() {
    applyActiveSheetLayoutRuntime(this);
  }

  refreshGridReferences() {
    refreshGridReferencesRuntime(this);
  }

  getStorageGridBounds(workbookSnapshot) {
    return getStorageGridBoundsRuntime(this, workbookSnapshot);
  }

  ensureGridCapacityForStorage(workbookSnapshot) {
    ensureGridCapacityForStorageRuntime(this, workbookSnapshot);
  }

  setupButtons() {
    setupButtonsRuntime(this);
  }

  ensureAddTabMenu() {
    return ensureAddTabMenuRuntime(this);
  }

  toggleAddTabMenu() {
    toggleAddTabMenuRuntime(this);
  }

  hideAddTabMenu() {
    hideAddTabMenuRuntime(this);
  }

  onTabButtonClick(tabId) {
    onTabButtonClickRuntime(this, tabId);
  }

  shouldStartCrossTabMention(tabId) {
    return shouldStartCrossTabMentionRuntime(this, tabId);
  }

  startCrossTabMention(targetSheetId) {
    startCrossTabMentionRuntime(this, targetSheetId);
  }

  restoreCrossTabMentionEditor() {
    restoreCrossTabMentionEditorRuntime(this);
  }

  syncCrossTabMentionSourceValue(nextValue) {
    return syncCrossTabMentionSourceValueRuntime(this, nextValue);
  }

  isCrossTabMentionProxyActive() {
    return isCrossTabMentionProxyActiveRuntime(this);
  }

  finishCrossTabMentionAndReturnToSource() {
    return finishCrossTabMentionAndReturnToSourceRuntime(this);
  }

  ensureContextMenu() {
    return ensureContextMenuRuntime(this);
  }

  setupContextMenu() {
    setupContextMenuRuntime(this);
  }

  prepareContextFromCell(td) {
    prepareContextFromCellRuntime(this, td);
  }

  openContextMenu(clientX, clientY) {
    openContextMenuRuntime(this, clientX, clientY);
  }

  hideContextMenu() {
    hideContextMenuRuntime(this);
  }

  ensureMentionAutocomplete() {
    return ensureMentionAutocompleteRuntime(this);
  }

  setupMentionAutocomplete() {
    setupMentionAutocompleteRuntime(this);
  }

  hideMentionAutocompleteSoon() {
    hideMentionAutocompleteSoonRuntime(this);
  }

  hideMentionAutocomplete() {
    hideMentionAutocompleteRuntime(this);
  }

  updateMentionAutocomplete(input) {
    updateMentionAutocompleteRuntime(this, input);
  }

  getMentionAutocompleteContext(input) {
    return getMentionAutocompleteContextRuntime(this, input);
  }

  getMentionAutocompleteItems(query, marker) {
    return getMentionAutocompleteItemsRuntime(this, query, marker);
  }

  renderMentionAutocompleteList() {
    renderMentionAutocompleteListRuntime(this);
  }

  positionMentionAutocomplete(input) {
    positionMentionAutocompleteRuntime(this, input);
  }

  handleMentionAutocompleteKeydown(e, input) {
    if (
      !this.mentionAutocompleteState ||
      this.mentionAutocompleteState.input !== input
    )
      return false;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      var next = this.mentionAutocompleteState.activeIndex + 1;
      if (next >= this.mentionAutocompleteState.items.length) next = 0;
      this.mentionAutocompleteState.activeIndex = next;
      this.renderMentionAutocompleteList();
      return true;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      var prev = this.mentionAutocompleteState.activeIndex - 1;
      if (prev < 0) prev = this.mentionAutocompleteState.items.length - 1;
      this.mentionAutocompleteState.activeIndex = prev;
      this.renderMentionAutocompleteList();
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      this.applyMentionAutocompleteSelection(
        this.mentionAutocompleteState.activeIndex,
      );
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.hideMentionAutocomplete();
      return true;
    }
    return false;
  }

  applyMentionAutocompleteSelection(index) {
    applyMentionAutocompleteSelectionRuntime(this, index);
  }

  setAvailableChannels(channels) {
    setAvailableChannelsRuntime(this, channels);
  }

  runContextMenuAction(action) {
    if (!action || this.isReportActive()) return;
    if (action === 'recalc') {
      this.recalcContextCell();
      return;
    }
    if (action === 'copy') {
      this.copySelectedRangeToClipboard();
      return;
    }
    if (action === 'paste') {
      this.pasteFromClipboard();
      return;
    }
    if (action === 'schedule') {
      this.showScheduleDialogForContextCell();
      return;
    }

    if (action === 'insert-row-before') {
      this.insertRowsAtContext('before');
      return;
    }
    if (action === 'insert-row-after') {
      this.insertRowsAtContext('after');
      return;
    }
    if (action === 'delete-row') {
      this.deleteRowsAtContext();
      return;
    }
    if (action === 'insert-col-before') {
      this.insertColumnsAtContext('before');
      return;
    }
    if (action === 'insert-col-after') {
      this.insertColumnsAtContext('after');
      return;
    }
    if (action === 'delete-col') {
      this.deleteColumnsAtContext();
    }
  }

  recalcContextCell() {
    if (!this.contextMenuState || this.contextMenuState.type !== 'cell') return;
    var cellId = this.cellIdFrom(
      this.contextMenuState.col,
      this.contextMenuState.row,
    );
    var input = this.inputById[cellId];
    if (!input) return;
    var raw = String(this.getRawCellValue(cellId) || '');
    if (
      !raw ||
      (raw.charAt(0) !== '=' &&
        raw.charAt(0) !== '>' &&
        raw.charAt(0) !== '#' &&
        raw.charAt(0) !== "'")
    ) {
      return;
    }
    this.setActiveInput(input);
    input.focus();
    this.runManualAIUpdate({ forceRefreshAI: true });
  }

  runManualAIUpdate(options) {
    var opts = options && typeof options === 'object' ? options : {};
    if (!this.aiService || this.aiService.getMode() !== AI_MODE.manual) return;
    if (this.hasPendingLocalEdit()) {
      this.commitFormulaBarValue();
    }
    this.computeAll({
      bypassPendingEdit: true,
      manualTriggerAI: true,
      forceRefreshAI: !!opts.forceRefreshAI,
    });
  }

  setupAIModeControls() {
    setupAIModeControlsRuntime(this);
  }

  setupScheduleDialog() {
    setupScheduleDialogRuntime(this);
  }

  setupAssistantPanel() {
    setupAssistantPanelRuntime(this);
  }

  setupFormulaTrackerPanel() {
    setupFormulaTrackerPanelRuntime(this);
  }

  toggleAssistantPanel() {
    toggleAssistantPanelRuntime(this);
    this.refreshFormulaTrackerPanel();
  }

  hideAssistantPanel() {
    hideAssistantPanelRuntime(this);
    this.refreshFormulaTrackerPanel();
  }

  toggleFormulaTrackerPanel() {
    toggleFormulaTrackerPanelRuntime(this);
  }

  hideFormulaTrackerPanel() {
    hideFormulaTrackerPanelRuntime(this);
  }

  refreshFormulaTrackerPanel() {
    refreshFormulaTrackerPanelRuntime(this);
  }

  showScheduleDialogForCell(cellId) {
    showScheduleDialogForCellRuntime(this, cellId);
  }

  showScheduleDialogForContextCell() {
    showScheduleDialogForContextCellRuntime(this);
  }

  hideScheduleDialog() {
    hideScheduleDialogRuntime(this);
  }

  setupAttachmentControls() {
    setupAttachmentControlsRuntime(this);
  }

  readAttachedFileContent(file, preparedBase64) {
    return readAttachedFileContentRuntime(this, file, preparedBase64);
  }

  arrayBufferToBase64(buffer) {
    return arrayBufferToBase64Runtime(this, buffer);
  }

  syncAIModeUI() {
    syncAIModeUIRuntime(this);
  }

  commitFormulaBarValue() {
    commitFormulaBarValueRuntime(this);
  }

  bindFormulaBarEvents() {
    bindFormulaBarEventsRuntime(this);
  }

  bindGridInputEvents() {
    bindGridInputEventsRuntime(this);
  }

  isEditingCell(input) {
    return isEditingCellRuntime(this, input);
  }

  isDirectTypeKey(event) {
    return isDirectTypeKeyRuntime(this, event);
  }

  startEditingCell(input) {
    startEditingCellRuntime(this, input);
  }

  setActiveInput(input) {
    setActiveInputRuntime(this, input);
  }

  clearActiveInput() {
    clearActiveInputRuntime(this);
  }

  destroy() {
    this.syncServerEditLock(false);
    this.hideFloatingAttachmentPreview();
    if (this.attachmentPreviewTimer) {
      clearTimeout(this.attachmentPreviewTimer);
      this.attachmentPreviewTimer = null;
    }
    if (this.handleAttachmentPreviewMouseOver) {
      document.removeEventListener(
        'mouseover',
        this.handleAttachmentPreviewMouseOver,
        true,
      );
    }
    if (this.handleAttachmentPreviewMouseOut) {
      document.removeEventListener(
        'mouseout',
        this.handleAttachmentPreviewMouseOut,
        true,
      );
    }
    if (this.handleAttachmentPreviewScroll) {
      window.removeEventListener(
        'scroll',
        this.handleAttachmentPreviewScroll,
        true,
      );
      window.removeEventListener(
        'resize',
        this.handleAttachmentPreviewScroll,
        true,
      );
    }
    if (
      this.floatingAttachmentPreview &&
      this.floatingAttachmentPreview.parentNode
    ) {
      this.floatingAttachmentPreview.parentNode.removeChild(
        this.floatingAttachmentPreview,
      );
    }
    this.floatingAttachmentPreview = null;
  }

  ensureFloatingAttachmentPreview() {
    return ensureFloatingAttachmentPreviewRuntime(this);
  }

  setupAttachmentLinkPreview() {
    setupAttachmentLinkPreviewRuntime(this);
  }

  showFloatingAttachmentPreview(anchor) {
    showFloatingAttachmentPreviewRuntime(this, anchor);
  }

  positionFloatingAttachmentPreview(anchor) {
    positionFloatingAttachmentPreviewRuntime(this, anchor);
  }

  hideFloatingAttachmentPreview() {
    hideFloatingAttachmentPreviewRuntime(this);
  }

  ensureActiveCell() {
    ensureActiveCellRuntime(this);
  }

  setSelectionAnchor(cellId) {
    setSelectionAnchorRuntime(this, cellId);
  }

  clearSelectionRange() {
    clearSelectionRangeRuntime(this);
  }

  clearSelectionHighlight() {
    clearSelectionHighlightRuntime(this);
  }

  clearHeaderSelectionHighlight() {
    clearHeaderSelectionHighlightRuntime(this);
  }

  clearDependencyHighlight() {
    clearDependencyHighlightRuntime(this);
  }

  applyDependencyHighlight() {
    applyDependencyHighlightRuntime(this);
  }

  collectDependencyHintsFromRaw(rawValue) {
    return collectDependencyHintsFromRawRuntime(this, rawValue);
  }

  setSelectionRange(anchorId, targetId) {
    setSelectionRangeRuntime(this, anchorId, targetId);
  }

  highlightSelectionRange() {
    highlightSelectionRangeRuntime(this);
  }

  updateAxisHeaderHighlight() {
    updateAxisHeaderHighlightRuntime(this);
  }

  bindHeaderSelectionEvents() {
    bindHeaderSelectionEventsRuntime(this);
  }

  startHeaderSelectionDrag(mode, anchorIndex) {
    startHeaderSelectionDragRuntime(this, mode, anchorIndex);
  }

  onHeaderSelectionDragMove(event) {
    onHeaderSelectionDragMoveRuntime(this, event);
  }

  applyHeaderSelectionRange(mode, fromIndex, toIndex) {
    applyHeaderSelectionRangeRuntime(this, mode, fromIndex, toIndex);
  }

  selectEntireRow(startRow, endRow) {
    selectEntireRowRuntime(this, startRow, endRow);
  }

  selectEntireColumn(startCol, endCol) {
    selectEntireColumnRuntime(this, startCol, endCol);
  }

  moveSelectionByArrow(currentInput, key) {
    moveSelectionByArrowRuntime(this, currentInput, key);
  }

  moveToNextFilledCell(currentInput, key) {
    return moveToNextFilledCellRuntime(this, currentInput, key);
  }

  getSelectionEdgeInputForDirection(currentInput, key) {
    return getSelectionEdgeInputForDirectionRuntime(this, currentInput, key);
  }

  extendSelectionRangeTowardCell(targetCellId, key) {
    extendSelectionRangeTowardCellRuntime(this, targetCellId, key);
  }

  findJumpTargetCellId(startCellId, key) {
    return findJumpTargetCellIdRuntime(this, startCellId, key);
  }

  findAdjacentCellId(startCellId, key) {
    return findAdjacentCellIdRuntime(this, startCellId, key);
  }

  canInsertFormulaMention(raw) {
    return canInsertFormulaMentionRuntime(this, raw);
  }

  getFormulaMentionBaseCellId(fallbackCellId, key) {
    if (!this.selectionRange) return this.formulaRefCursorId || fallbackCellId;
    var baseInput =
      this.inputById[this.formulaRefCursorId || fallbackCellId] ||
      this.inputById[fallbackCellId];
    var edgeInput = this.getSelectionEdgeInputForDirection(
      baseInput || this.inputById[fallbackCellId],
      key,
    );
    return edgeInput ? edgeInput.id : this.formulaRefCursorId || fallbackCellId;
  }

  buildMentionTokenForSelection(fallbackCellId, isRangeMode) {
    return buildMentionTokenForSelectionRuntime(
      this,
      fallbackCellId,
      isRangeMode,
    );
  }

  getMentionSheetPrefix() {
    return getMentionSheetPrefixRuntime(this);
  }

  insertTextIntoInputAtCursor(input, text) {
    insertTextIntoInputAtCursorRuntime(this, input, text);
  }

  applyFormulaMentionPreview(input, token) {
    applyFormulaMentionPreviewRuntime(this, input, token);
  }

  getPreferredMentionLabel(cellId) {
    var name = this.storage.getCellNameFor(
      this.activeSheetId,
      String(cellId).toUpperCase(),
    );
    return name ? name : String(cellId).toUpperCase();
  }

  selectNearestValueRegionFromActive(input) {
    selectNearestValueRegionFromActiveRuntime(this, input);
  }

  selectWholeSheetRegion() {
    selectWholeSheetRegionRuntime(this);
  }

  cellHasAnyRawValue(cellId) {
    return cellHasAnyRawValueRuntime(this, cellId);
  }

  getSelectionStartCellId() {
    return getSelectionStartCellIdRuntime(this);
  }

  getSelectedCellIds() {
    return getSelectedCellIdsRuntime(this);
  }

  copySelectedRangeToClipboard() {
    copySelectedRangeToClipboardRuntime(this);
  }

  pasteFromClipboard() {
    pasteFromClipboardRuntime(this);
  }

  getSelectedRangeText() {
    return getSelectedRangeTextRuntime(this);
  }

  copyTextFallback(text, previouslyFocused) {
    copyTextFallbackRuntime(this, text, previouslyFocused);
  }

  applyPastedText(text) {
    applyPastedTextRuntime(this, text);
  }

  clearSelectedCells() {
    clearSelectedCellsRuntime(this);
  }

  getSelectedRowBounds() {
    return getSelectedRowBoundsRuntime(this);
  }

  getSelectedColumnBounds() {
    return getSelectedColumnBoundsRuntime(this);
  }

  insertRowsAtContext(position) {
    insertRowsAtContextRuntime(this, position);
  }

  deleteRowsAtContext() {
    deleteRowsAtContextRuntime(this);
  }

  insertColumnsAtContext(position) {
    insertColumnsAtContextRuntime(this, position);
  }

  deleteColumnsAtContext() {
    deleteColumnsAtContextRuntime(this);
  }

  parseCellId(cellId) {
    var match = /^([A-Za-z]+)([0-9]+)$/.exec(String(cellId || ''));
    if (!match) return null;
    return {
      col: this.columnLabelToIndex(match[1].toUpperCase()),
      row: parseInt(match[2], 10),
    };
  }

  columnLabelToIndex(label) {
    var result = 0;
    for (var i = 0; i < label.length; i++) {
      result = result * 26 + (label.charCodeAt(i) - 64);
    }
    return result;
  }

  columnIndexToLabel(index) {
    var n = Math.max(1, index);
    var label = '';
    while (n > 0) {
      var rem = (n - 1) % 26;
      label = String.fromCharCode(65 + rem) + label;
      n = Math.floor((n - 1) / 26);
    }
    return label;
  }

  formatCellId(col, row) {
    return this.columnIndexToLabel(col) + row;
  }

  shiftFormulaReferences(rawValue, dRow, dCol) {
    if (!rawValue) return rawValue;
    var prefix = rawValue.charAt(0);
    if (prefix !== '=' && prefix !== "'" && prefix !== '>' && prefix !== '#')
      return rawValue;
    var body = prefix === '=' ? rawValue.substring(1) : rawValue;
    var replaced = body.replace(
      /((?:'[^']+'|[A-Za-z][A-Za-z0-9 _-]*)!)?(\$?)([A-Za-z]+)(\$?)([0-9]+)(:(\$?)([A-Za-z]+)(\$?)([0-9]+))?/g,
      (
        _,
        qualifier,
        colDollar1,
        col1,
        rowDollar1,
        row1,
        rangePart,
        colDollar2,
        col2,
        rowDollar2,
        row2,
      ) => {
        var shiftRef = (colDollar, col, rowDollar, row) => {
          var parsed = this.parseCellId(col + row);
          if (!parsed) return colDollar + col + rowDollar + row;
          var nextCol = colDollar
            ? parsed.col
            : Math.max(1, parsed.col + dCol);
          var nextRow = rowDollar
            ? parsed.row
            : Math.max(1, parsed.row + dRow);
          return (
            colDollar +
            this.columnIndexToLabel(nextCol) +
            rowDollar +
            nextRow
          );
        };

        var left = shiftRef(colDollar1, col1, rowDollar1, row1);
        if (rangePart && col2) {
          return (
            (qualifier || '') +
            left +
            ':' +
            shiftRef(colDollar2, col2, rowDollar2, row2)
          );
        }
        return (qualifier || '') + left;
      },
    );
    return prefix === '=' ? '=' + replaced : replaced;
  }

  clearFillRangeHighlight() {
    clearFillRangeHighlightRuntime(this);
  }

  highlightFillRange(sourceId, targetId) {
    highlightFillRangeRuntime(this, sourceId, targetId);
  }

  startFillDrag(sourceInput, event) {
    startFillDragRuntime(this, sourceInput, event);
  }

  startSelectionDrag(sourceInput, event) {
    startSelectionDragRuntime(this, sourceInput, event);
  }

  onSelectionDragMove(event) {
    onSelectionDragMoveRuntime(this, event);
  }

  finishSelectionDrag() {
    finishSelectionDragRuntime(this);
  }

  syncMentionPreviewToUi(mentionInput) {
    syncMentionPreviewToUiRuntime(this, mentionInput);
  }

  onFillDragMove(event) {
    onFillDragMoveRuntime(this, event);
  }

  finishFillDrag() {
    finishFillDragRuntime(this);
  }

  setupFullscreenOverlay() {
    setupFullscreenOverlayRuntime(this);
  }

  copyCellValue(input) {
    copyCellValueRuntime(this, input);
  }

  runFormulaForCell(input) {
    runFormulaForCellRuntime(this, input);
  }

  openFullscreenCell(input) {
    openFullscreenCellRuntime(this, input);
  }

  closeFullscreenCell() {
    closeFullscreenCellRuntime(this);
  }

  buildPublishedReportUrl() {
    return buildPublishedReportUrlRuntime(this);
  }

  publishCurrentReport() {
    return publishCurrentReportRuntime(this);
  }

  exportCurrentReportPdf() {
    exportCurrentReportPdfRuntime(this);
  }

  setupCellNameControls() {
    setupCellNameControlsRuntime(this);
  }

  setupReportControls() {
    setupReportControlsRuntime(this);
  }

  setReportMode(mode) {
    setReportModeRuntime(this, mode);
  }

  renderReportLiveValues(forceRender) {
    renderReportLiveValuesRuntime(this, forceRender);
  }

  replaceMentionNodes(root) {
    replaceMentionNodesRuntime(this, root);
  }
  renderReportMarkdownNodes(root) {
    renderReportMarkdownNodesRuntime(this, root);
  }
  replaceMentionInTextNode(textNode) {
    replaceMentionInTextNodeRuntime(this, textNode);
  }
  createReportTabElement(token) {
    return createReportTabElementRuntime(this, token);
  }
  fragmentHasVisibleContent(fragment) {
    return fragmentHasVisibleContentRuntime(this, fragment);
  }
  getReportTabStateStore() {
    return getReportTabStateStoreRuntime(this);
  }
  activateReportTab(tabKey) {
    activateReportTabRuntime(this, tabKey);
  }
  decorateReportTabs(root) {
    decorateReportTabsRuntime(this, root);
  }
  parseReportControlToken(token, prefix) {
    return parseReportControlTokenRuntime(this, token, prefix);
  }
  resolveReportInternalLink(token) {
    return resolveReportInternalLinkRuntime(this, token);
  }
  createReportInternalLinkElement(token, target) {
    return createReportInternalLinkElementRuntime(this, token, target);
  }
  followReportInternalLink(link) {
    followReportInternalLinkRuntime(this, link);
  }
  injectLinkedInputsFromPlaceholders(root) {
    injectLinkedInputsFromPlaceholdersRuntime(this, root);
  }
  createLinkedReportInputElement(inputResolved) {
    return createLinkedReportInputElementRuntime(this, inputResolved);
  }
  createLinkedReportFileElement(inputResolved) {
    return createLinkedReportFileElementRuntime(this, inputResolved);
  }
  handleReportFileShellAction(shell, removeOnly) {
    handleReportFileShellActionRuntime(this, shell, removeOnly);
  }
  applyLinkedReportInput(input) {
    applyLinkedReportInputRuntime(this, input);
  }
  refreshLinkedReportInputValue(input) {
    refreshLinkedReportInputValueRuntime(this, input);
  }
  resolveReportInputMention(payload) {
    return resolveReportInputMentionRuntime(this, payload);
  }
  resolveReportMention(token) {
    return resolveReportMentionRuntime(this, token);
  }
  resolveReportReference(token) {
    return resolveReportReferenceRuntime(this, token);
  }
  resolveNamedMention(name, rawMode) {
    return resolveNamedMentionRuntime(this, name, rawMode);
  }
  resolveSheetCellMention(token, rawMode) {
    return resolveSheetCellMentionRuntime(this, token, rawMode);
  }
  resolveSheetRegionMention(token, rawMode) {
    return resolveSheetRegionMentionRuntime(this, token, rawMode);
  }
  readRegionValues(sheetId, startCellId, endCellId) {
    return readRegionValuesRuntime(this, sheetId, startCellId, endCellId);
  }
  readRegionRawValues(sheetId, startCellId, endCellId) {
    return readRegionRawValuesRuntime(this, sheetId, startCellId, endCellId);
  }
  createReportRegionTableElement(rows) {
    return createReportRegionTableElementRuntime(this, rows);
  }
  createReportListElement(items) {
    return createReportListElementRuntime(this, items);
  }
  isListShortcutCell(sheetId, cellId) {
    return isListShortcutCellRuntime(this, sheetId, cellId);
  }
  parseListItemsFromMentionValue(value) {
    return parseListItemsFromMentionValueRuntime(this, value);
  }

  findSheetIdByName(sheetName) {
    return findSheetIdByNameRuntime(this, sheetName);
  }

  readCellComputedValue(sheetId, cellId) {
    var normalizedId = String(cellId).toUpperCase();
    var raw = this.storage.getCellValue(sheetId, normalizedId);
    if (
      raw &&
      raw.charAt(0) !== '=' &&
      raw.charAt(0) !== '>' &&
      raw.charAt(0) !== '#' &&
      raw.charAt(0) !== "'"
    ) {
      return String(raw);
    }
    var cache = this.computedValuesBySheet[sheetId];
    if (cache && Object.prototype.hasOwnProperty.call(cache, normalizedId)) {
      return String(cache[normalizedId] == null ? '' : cache[normalizedId]);
    }
    try {
      var value = this.formulaEngine.evaluateCell(sheetId, normalizedId, {});
      return String(value == null ? '' : value);
    } catch (e) {
      return String(raw == null ? '' : raw);
    }
  }

  readCellMentionValue(sheetId, cellId) {
    try {
      var value = this.formulaEngine.getMentionValue(
        sheetId,
        String(cellId).toUpperCase(),
        {},
      );
      return String(value == null ? '' : value);
    } catch (e) {
      return this.readCellComputedValue(sheetId, cellId);
    }
  }

  readLinkedInputValue(sheetId, cellId) {
    return readLinkedInputValueRuntime(this, sheetId, cellId);
  }

  syncCellNameInput() {
    syncCellNameInputRuntime(this);
  }
  syncCellFormatControl() {
    syncCellFormatControlRuntime(this);
  }
  syncCellPresentationControls() {
    syncCellPresentationControlsRuntime(this);
  }

  applyActiveCellName() {
    applyActiveCellNameRuntime(this);
  }

  refreshNamedCellJumpOptions() {
    refreshNamedCellJumpOptionsRuntime(this);
  }

  navigateToNamedCell(name) {
    navigateToNamedCellRuntime(this, name);
  }

  renderTabs() {
    renderTabsRuntime(this);
  }

  onTabDragStart(event, tabId) {
    onTabDragStartRuntime(this, event, tabId);
  }

  onTabDragEnd() {
    onTabDragEndRuntime(this);
  }

  onTabDragOver(event, targetTabId) {
    onTabDragOverRuntime(this, event, targetTabId);
  }

  onTabDrop(event, targetTabId) {
    onTabDropRuntime(this, event, targetTabId);
  }

  reorderTabs(dragId, targetId) {
    reorderTabsRuntime(this, dragId, targetId);
  }

  addTab() {
    addTabRuntime(this);
  }

  addReportTab() {
    addReportTabRuntime(this);
  }

  renameActiveTab() {
    renameActiveTabRuntime(this);
  }

  renameTabById(tabId) {
    renameTabByIdRuntime(this, tabId);
  }

  deleteActiveTab() {
    deleteActiveTabRuntime(this);
  }

  switchToSheet(sheetId) {
    switchToSheetRuntime(this, sheetId);
  }

  renderCurrentSheetFromStorage() {
    renderCurrentSheetFromStorageRuntime(this);
  }

  getRenderTargetsForComputeResult(computedValues, didResort) {
    return getRenderTargetsForComputeResultRuntime(
      this,
      computedValues,
      didResort,
    );
  }

  computeAll() {
    return computeAllRuntime(this, arguments.length > 0 ? arguments[0] : {});
  }

  applyRightOverflowText() {
    applyRightOverflowTextRuntime(this);
  }

  measureOutputRequiredWidth(output) {
    return measureOutputRequiredWidthRuntime(this, output);
  }
  hasUncomputedCells() {
    return hasUncomputedCellsRuntime(this);
  }
  startUncomputedMonitor() {
    startUncomputedMonitorRuntime(this);
  }
}

export function mountSpreadsheetApp() {
  var options = arguments.length > 0 ? arguments[0] : {};
  return new SpreadsheetApp(options);
}
