// Description: Application controller that wires UI, storage, grid rendering, tabs, formulas, and AI updates.
import { rpc } from '../../../../lib/rpc-client.js';
import { collectAppUiStateSnapshot as collectAppUiStateSnapshotRuntime } from './ui-snapshot-runtime.js';
import {
  initializeSpreadsheetAppState as initializeSpreadsheetAppRuntimeRuntime,
} from './app-bootstrap-init-runtime.js';
import {
  setupSpreadsheetAppBehavior as setupSpreadsheetAppRuntimeRuntime,
} from './app-bootstrap-setup-runtime.js';
import { destroySpreadsheetAppRuntime as destroySpreadsheetAppRuntimeRuntime } from './app-cleanup-runtime.js';
import { cacheSpreadsheetAttachmentDomRefs as cacheSpreadsheetAttachmentDomRefsRuntime } from './app-dom-attachment-runtime.js';
import { cacheSpreadsheetGridDomRefs as cacheSpreadsheetGridDomRefsRuntime } from './app-dom-grid-runtime.js';
import { cacheSpreadsheetToolbarDomRefs as cacheSpreadsheetToolbarDomRefsRuntime } from './app-dom-toolbar-runtime.js';
import { cacheSpreadsheetWorkbookDomRefs as cacheSpreadsheetWorkbookDomRefsRuntime } from './app-dom-workbook-runtime.js';
import { installAttachmentMethods } from './app-methods-attachment.js';
import { installCellUpdateMethods } from './app-methods-cell-update.js';
import { installClipboardMethods } from './app-methods-clipboard.js';
import { installDependencyGraphMethods } from './app-methods-dependency-graph.js';
import { installEditorMethods } from './app-methods-editor.js';
import { installFullscreenMethods } from './app-methods-fullscreen.js';
import { installGeneratedResultMethods } from './app-methods-generated-results.js';
import { installGridStructureMethods } from './app-methods-grid-structure.js';
import { installLocalComputeMethods } from './app-methods-local-compute.js';
import { installMentionSpillMethods } from './app-methods-mention-spill.js';
import { installPanelMethods } from './app-methods-panels.js';
import { installReportMethods } from './app-methods-report.js';
import { installRegionMentionMethods } from './app-methods-region-mention.js';
import { installRuntimeCoreMethods } from './app-methods-runtime-core.js';
import { installSelectionMethods } from './app-methods-selection.js';
import { installStorageHistoryMethods } from './app-methods-storage-history.js';
import { installToolbarMethods } from './app-methods-toolbar.js';
import { installWorkbookUiMethods } from './app-methods-workbook-ui.js';
import {
  getSelectionRangeState,
  hasSelectionRange,
} from './selection-range-facade.js';
import {
  buildChannelSendAttachmentsFromPreparedPrompt,
  buildChannelSendBodyFromPreparedPrompt,
  parseChannelSendCommand,
  stripChannelSendFileAndImagePlaceholders,
} from '../../../api/channels/commands.js';
import {
  DEFAULT_ROW_HEIGHT,
  AI_MODE,
} from './constants.js';
import { ensureReportUI as ensureReportUIRuntime } from './report-shell-runtime.js';
import {
  deleteColumnsAtContext as deleteColumnsAtContextRuntime,
  deleteRowsAtContext as deleteRowsAtContextRuntime,
  getSelectedColumnBounds as getSelectedColumnBoundsRuntime,
  getSelectedRowBounds as getSelectedRowBoundsRuntime,
  insertColumnsAtContext as insertColumnsAtContextRuntime,
  insertRowsAtContext as insertRowsAtContextRuntime,
} from './structure-runtime.js';

function cacheSpreadsheetAppDomRefsRuntime(app) {
  cacheSpreadsheetGridDomRefsRuntime(app);
  cacheSpreadsheetAttachmentDomRefsRuntime(app);
  cacheSpreadsheetToolbarDomRefsRuntime(app);
  cacheSpreadsheetWorkbookDomRefsRuntime(app);
}

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
    this.onUiStateChange =
      typeof opts.onUiStateChange === 'function' ? opts.onUiStateChange : null;
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
    cacheSpreadsheetAppDomRefsRuntime(this);
    this.ensureReportUI();
    initializeSpreadsheetAppRuntimeRuntime(this, opts);
    setupSpreadsheetAppRuntimeRuntime(this);
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

  hasSingleSelectedCell() {
    if (!this.activeInput) return false;
    var selectionRange = getSelectionRangeState(this);
    if (!selectionRange) return true;
    return (
      selectionRange.startCol === selectionRange.endCol &&
      selectionRange.startRow === selectionRange.endRow
    );
  }

  hasRegionSelection() {
    if (!this.activeInput || !hasSelectionRange(this)) return false;
    return !this.hasSingleSelectedCell();
  }

  syncAttachButtonState() {
    if (!this.attachFileButton) return;
    this.attachFileButton.disabled =
      this.isReportActive() || !this.hasSingleSelectedCell();
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

  getWorkbookTabs() {
    var tabs = Array.isArray(this.tabs) ? this.tabs : [];
    return tabs.map(function (tab) {
      return tab && typeof tab === 'object' ? { ...tab } : tab;
    });
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

    rpc('channels.sendByLabel', command.label, outboundPayload)
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

  collectUiStateSnapshot() {
    return collectAppUiStateSnapshotRuntime(this);
  }

  publishUiState() {
    if (typeof this.onUiStateChange !== 'function') return null;
    return this.onUiStateChange(this.collectUiStateSnapshot());
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
    var input =
      typeof this.getCellInput === 'function'
        ? this.getCellInput(cellId)
        : this.inputById[cellId];
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

  destroy() {
    destroySpreadsheetAppRuntimeRuntime(this);
  }

  getFormulaMentionBaseCellId(fallbackCellId, key) {
    if (!hasSelectionRange(this)) return this.formulaRefCursorId || fallbackCellId;
    var baseInput =
      this.inputById[this.formulaRefCursorId || fallbackCellId] ||
      this.inputById[fallbackCellId];
    var edgeInput = this.getSelectionEdgeInputForDirection(
      baseInput || this.inputById[fallbackCellId],
      key,
    );
    return edgeInput ? edgeInput.id : this.formulaRefCursorId || fallbackCellId;
  }

  getPreferredMentionLabel(cellId) {
    var name = this.storage.getCellNameFor(
      this.activeSheetId,
      String(cellId).toUpperCase(),
    );
    return name ? name : String(cellId).toUpperCase();
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

}

installAttachmentMethods(SpreadsheetApp);
installCellUpdateMethods(SpreadsheetApp);
installClipboardMethods(SpreadsheetApp);
installDependencyGraphMethods(SpreadsheetApp);
installEditorMethods(SpreadsheetApp);
installFullscreenMethods(SpreadsheetApp);
installGeneratedResultMethods(SpreadsheetApp);
installGridStructureMethods(SpreadsheetApp);
installLocalComputeMethods(SpreadsheetApp);
installMentionSpillMethods(SpreadsheetApp);
installPanelMethods(SpreadsheetApp);
installRegionMentionMethods(SpreadsheetApp);
installReportMethods(SpreadsheetApp);
installRuntimeCoreMethods(SpreadsheetApp);
installSelectionMethods(SpreadsheetApp);
installStorageHistoryMethods(SpreadsheetApp);
installToolbarMethods(SpreadsheetApp);
installWorkbookUiMethods(SpreadsheetApp);

export function mountSpreadsheetApp() {
  var options = arguments.length > 0 ? arguments[0] : {};
  return new SpreadsheetApp(options);
}
