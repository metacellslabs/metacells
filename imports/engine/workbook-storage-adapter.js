import { AI_MODE } from './constants.js';

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function normalizeTabs(tabs) {
  if (!Array.isArray(tabs)) return [];
  return tabs
    .filter(function (tab) {
      return tab && typeof tab.id === 'string' && typeof tab.name === 'string';
    })
    .map(function (tab) {
      return {
        id: String(tab.id),
        name: String(tab.name),
        type: tab.type === 'report' ? 'report' : 'sheet',
      };
    });
}

function normalizeWorkbook(input) {
  var workbook = isPlainObject(input) ? input : {};
  return {
    version: 1,
    tabs: normalizeTabs(workbook.tabs),
    activeTabId:
      typeof workbook.activeTabId === 'string' ? workbook.activeTabId : '',
    aiMode: workbook.aiMode === AI_MODE.manual ? AI_MODE.manual : AI_MODE.auto,
    namedCells: isPlainObject(workbook.namedCells)
      ? deepClone(workbook.namedCells)
      : {},
    sheets: isPlainObject(workbook.sheets) ? deepClone(workbook.sheets) : {},
    dependencyGraph: isPlainObject(workbook.dependencyGraph)
      ? deepClone(workbook.dependencyGraph)
      : {
          byCell: {},
          dependentsByCell: {},
          dependentsByNamedRef: {},
          dependentsByChannel: {},
          dependentsByAttachment: {},
          meta: {
            authoritative: false,
            version: 1,
            repairedAt: '',
          },
        },
    caches: isPlainObject(workbook.caches) ? deepClone(workbook.caches) : {},
    globals: isPlainObject(workbook.globals) ? deepClone(workbook.globals) : {},
  };
}

function makeDependencyGraphKey(sheetId, cellId) {
  return String(sheetId || '') + ':' + String(cellId || '').toUpperCase();
}

function normalizeCellRecord(source, previousCell) {
  var nextSource = String(source == null ? '' : source);
  var prev = isPlainObject(previousCell) ? previousCell : {};
  var sourceType = /^[='>#]/.test(nextSource) ? 'formula' : 'raw';
  var sourceChanged = String(prev.source || '') !== nextSource;
  var sourceVersion = Number(prev.sourceVersion) || Number(prev.version) || 0;
  if (sourceChanged) sourceVersion += 1;
  if (sourceVersion < 1) sourceVersion = 1;
  var computedVersion =
    sourceType === 'formula'
      ? sourceChanged
        ? 0
        : Number(prev.computedVersion) || 0
      : sourceVersion;
  var dependencyVersion =
    sourceType === 'formula'
      ? sourceChanged
        ? 0
        : Number(prev.dependencyVersion) || 0
      : sourceVersion;

  return {
    source: nextSource,
    sourceType: sourceType,
    format: String(prev.format || 'text'),
    align: String(prev.align || 'left'),
    wrapText: prev.wrapText === true,
    bold: prev.bold === true,
    italic: prev.italic === true,
    decimalPlaces: Number.isInteger(prev.decimalPlaces)
      ? Math.max(0, Math.min(6, prev.decimalPlaces))
      : null,
    backgroundColor:
      typeof prev.backgroundColor === 'string'
        ? String(prev.backgroundColor)
        : '',
    fontFamily:
      typeof prev.fontFamily === 'string' ? String(prev.fontFamily) : 'default',
    fontSize: Number.isFinite(prev.fontSize)
      ? Math.max(10, Math.min(28, Number(prev.fontSize)))
      : 14,
    borders: isPlainObject(prev.borders)
      ? {
          top: prev.borders.top === true,
          right: prev.borders.right === true,
          bottom: prev.borders.bottom === true,
          left: prev.borders.left === true,
        }
      : {
          top: false,
          right: false,
          bottom: false,
          left: false,
        },
    value: sourceType === 'formula' ? String(prev.value || '') : nextSource,
    state:
      sourceType === 'formula'
        ? String(prev.source || '') !== nextSource
          ? 'stale'
          : String(prev.state || 'stale')
        : 'resolved',
    error: sourceType === 'formula' ? String(prev.error || '') : '',
    generatedBy: String(prev.generatedBy || ''),
    lastProcessedChannelEventIds: isPlainObject(
      prev.lastProcessedChannelEventIds,
    )
      ? deepClone(prev.lastProcessedChannelEventIds)
      : {},
    sourceVersion: sourceVersion,
    computedVersion: computedVersion,
    dependencyVersion: dependencyVersion,
    dependencySignature:
      sourceType === 'formula' && !sourceChanged
        ? String(prev.dependencySignature || '')
        : '',
    version: sourceVersion,
  };
}

export class WorkbookStorageAdapter {
  constructor(workbook) {
    this.workbook = normalizeWorkbook(workbook);
  }

  snapshot() {
    return deepClone(this.workbook);
  }

  replaceAll(nextWorkbook) {
    this.workbook = normalizeWorkbook(nextWorkbook);
  }

  ensureSheet(sheetId) {
    var id = String(sheetId || '');
    if (!id) return null;
    if (!isPlainObject(this.workbook.sheets[id])) {
      this.workbook.sheets[id] = {
        cells: {},
        columnWidths: {},
        rowHeights: {},
        reportContent: '',
      };
    }
    var sheet = this.workbook.sheets[id];
    if (!isPlainObject(sheet.cells)) sheet.cells = {};
    if (!isPlainObject(sheet.columnWidths)) sheet.columnWidths = {};
    if (!isPlainObject(sheet.rowHeights)) sheet.rowHeights = {};
    if (typeof sheet.reportContent !== 'string')
      sheet.reportContent = String(sheet.reportContent || '');
    return sheet;
  }

  ensureDependencyGraph() {
    if (!isPlainObject(this.workbook.dependencyGraph)) {
      this.workbook.dependencyGraph = {
        byCell: {},
        dependentsByCell: {},
        dependentsByNamedRef: {},
        dependentsByChannel: {},
        dependentsByAttachment: {},
        meta: {
          authoritative: false,
          version: 1,
          repairedAt: '',
        },
      };
    }
    if (!isPlainObject(this.workbook.dependencyGraph.byCell)) {
      this.workbook.dependencyGraph.byCell = {};
    }
    if (!isPlainObject(this.workbook.dependencyGraph.dependentsByCell)) {
      this.workbook.dependencyGraph.dependentsByCell = {};
    }
    if (!isPlainObject(this.workbook.dependencyGraph.dependentsByNamedRef)) {
      this.workbook.dependencyGraph.dependentsByNamedRef = {};
    }
    if (!isPlainObject(this.workbook.dependencyGraph.dependentsByChannel)) {
      this.workbook.dependencyGraph.dependentsByChannel = {};
    }
    if (!isPlainObject(this.workbook.dependencyGraph.dependentsByAttachment)) {
      this.workbook.dependencyGraph.dependentsByAttachment = {};
    }
    if (!isPlainObject(this.workbook.dependencyGraph.meta)) {
      this.workbook.dependencyGraph.meta = {
        authoritative: false,
        version: 1,
        repairedAt: '',
      };
    }
    return this.workbook.dependencyGraph;
  }

  markDependencyGraphAuthoritative(authoritative, reason) {
    var graph = this.ensureDependencyGraph();
    graph.meta = {
      authoritative: authoritative !== false,
      version: Number(graph.meta && graph.meta.version) || 1,
      repairedAt:
        authoritative !== false
          ? new Date().toISOString()
          : String((graph.meta && graph.meta.repairedAt) || ''),
      reason: String(reason || ''),
    };
  }

  rebuildReverseDependencyGraph() {
    var graph = this.ensureDependencyGraph();
    var dependentsByCell = {};
    var dependentsByNamedRef = {};
    var dependentsByChannel = {};
    var dependentsByAttachment = {};
    var register = function (bucket, key, sourceKey) {
      var normalizedKey = String(key || '');
      var normalizedSourceKey = String(sourceKey || '');
      if (!normalizedKey || !normalizedSourceKey) return;
      if (!Array.isArray(bucket[normalizedKey])) bucket[normalizedKey] = [];
      if (bucket[normalizedKey].indexOf(normalizedSourceKey) === -1) {
        bucket[normalizedKey].push(normalizedSourceKey);
      }
    };

    Object.keys(graph.byCell).forEach(function (sourceKey) {
      var entry = isPlainObject(graph.byCell[sourceKey])
        ? graph.byCell[sourceKey]
        : {};

      (Array.isArray(entry.cells) ? entry.cells : []).forEach(function (item) {
        if (!item || typeof item !== 'object') return;
        register(
          dependentsByCell,
          makeDependencyGraphKey(item.sheetId, item.cellId),
          sourceKey,
        );
      });

      (Array.isArray(entry.namedRefs) ? entry.namedRefs : []).forEach(
        function (name) {
          register(dependentsByNamedRef, String(name || '').trim(), sourceKey);
        },
      );

      (Array.isArray(entry.channelLabels) ? entry.channelLabels : []).forEach(
        function (label) {
          register(dependentsByChannel, String(label || '').trim(), sourceKey);
        },
      );

      (Array.isArray(entry.attachments) ? entry.attachments : []).forEach(
        function (item) {
          if (!item || typeof item !== 'object') return;
          register(
            dependentsByAttachment,
            makeDependencyGraphKey(item.sheetId, item.cellId),
            sourceKey,
          );
        },
      );
    });

    graph.dependentsByCell = dependentsByCell;
    graph.dependentsByNamedRef = dependentsByNamedRef;
    graph.dependentsByChannel = dependentsByChannel;
    graph.dependentsByAttachment = dependentsByAttachment;
    return graph;
  }

  listSheetIds() {
    return Object.keys(this.workbook.sheets || {});
  }

  listCellIds(sheetId) {
    var sheet = this.ensureSheet(sheetId);
    return sheet ? Object.keys(sheet.cells || {}) : [];
  }

  getCellRecord(sheetId, cellId) {
    var sheet = this.ensureSheet(sheetId);
    if (!sheet) return null;
    var id = String(cellId || '').toUpperCase();
    return isPlainObject(sheet.cells[id]) ? sheet.cells[id] : null;
  }

  getCellDisplayValue(sheetId, cellId) {
    var cell = this.getCellRecord(sheetId, cellId);
    if (!cell) return '';
    return String(cell.value == null ? '' : cell.value);
  }

  getCellState(sheetId, cellId) {
    var cell = this.getCellRecord(sheetId, cellId);
    if (!cell) return '';
    return String(cell.state || '');
  }

  getCellError(sheetId, cellId) {
    var cell = this.getCellRecord(sheetId, cellId);
    if (!cell) return '';
    return String(cell.error || '');
  }

  getCellProcessedChannelEventIds(sheetId, cellId) {
    var cell = this.getCellRecord(sheetId, cellId);
    if (!cell) return {};
    return isPlainObject(cell.lastProcessedChannelEventIds)
      ? deepClone(cell.lastProcessedChannelEventIds)
      : {};
  }

  getCellVersionInfo(sheetId, cellId) {
    var cell = this.getCellRecord(sheetId, cellId);
    if (!cell) {
      return {
        sourceVersion: 0,
        computedVersion: 0,
        dependencyVersion: 0,
        dependencySignature: '',
      };
    }
    return {
      sourceVersion: Number(cell.sourceVersion) || Number(cell.version) || 0,
      computedVersion: Number(cell.computedVersion) || 0,
      dependencyVersion: Number(cell.dependencyVersion) || 0,
      dependencySignature: String(cell.dependencySignature || ''),
    };
  }

  getCellSource(sheetId, cellId) {
    var cell = this.getCellRecord(sheetId, cellId);
    return cell ? String(cell.source || '') : '';
  }

  getCellFormat(sheetId, cellId) {
    var cell = this.getCellRecord(sheetId, cellId);
    return cell ? String(cell.format || 'text') : 'text';
  }

  getCellPresentation(sheetId, cellId) {
    var cell = this.getCellRecord(sheetId, cellId);
    return {
      format: cell ? String(cell.format || 'text') : 'text',
      align: cell ? String(cell.align || 'left') : 'left',
      wrapText: !!(cell && cell.wrapText === true),
      bold: !!(cell && cell.bold === true),
      italic: !!(cell && cell.italic === true),
      decimalPlaces:
        cell && Number.isInteger(cell.decimalPlaces)
          ? Math.max(0, Math.min(6, cell.decimalPlaces))
          : null,
      backgroundColor: cell ? String(cell.backgroundColor || '') : '',
      fontFamily: cell ? String(cell.fontFamily || 'default') : 'default',
      fontSize:
        cell && Number.isFinite(cell.fontSize)
          ? Math.max(10, Math.min(28, Number(cell.fontSize)))
          : 14,
      borders:
        cell && isPlainObject(cell.borders)
          ? {
              top: cell.borders.top === true,
              right: cell.borders.right === true,
              bottom: cell.borders.bottom === true,
              left: cell.borders.left === true,
            }
          : {
              top: false,
              right: false,
              bottom: false,
              left: false,
            },
    };
  }

  setCellSource(sheetId, cellId, value, meta) {
    var sheet = this.ensureSheet(sheetId);
    if (!sheet) return;
    var id = String(cellId || '').toUpperCase();
    var previous = this.getCellRecord(sheetId, id);
    var next = normalizeCellRecord(value, previous);
    var generatedBy =
      meta && meta.generatedBy ? String(meta.generatedBy).toUpperCase() : '';
    next.generatedBy =
      generatedBy || String((previous && previous.generatedBy) || '');
    if (
      !generatedBy &&
      previous &&
      previous.generatedBy &&
      String(value || '') === ''
    ) {
      next.generatedBy = '';
    }

    if (
      !next.source &&
      !next.generatedBy &&
      String(next.format || 'text') === 'text' &&
      String(next.align || 'left') === 'left' &&
      next.wrapText !== true &&
      next.bold !== true &&
      next.italic !== true &&
      next.decimalPlaces == null &&
      String(next.backgroundColor || '') === '' &&
      String(next.fontFamily || 'default') === 'default' &&
      Number(next.fontSize || 14) === 14 &&
      (!next.borders ||
        (next.borders.top !== true &&
          next.borders.right !== true &&
          next.borders.bottom !== true &&
          next.borders.left !== true))
    ) {
      delete sheet.cells[id];
      return;
    }

    next.error = '';
    sheet.cells[id] = next;
    if (
      !previous ||
      String(previous.source || '') !== String(next.source || '')
    ) {
      this.clearCellDependencies(sheetId, id);
    }
  }

  setCellFormat(sheetId, cellId, format) {
    var sheet = this.ensureSheet(sheetId);
    if (!sheet) return;
    var id = String(cellId || '').toUpperCase();
    var nextFormat =
      [
        'text',
        'number',
        'number_0',
        'number_2',
        'percent',
        'percent_2',
        'date',
        'currency_usd',
        'currency_eur',
        'currency_gbp',
      ].indexOf(String(format || '')) >= 0
        ? String(format)
        : 'text';
    var cell = this.getCellRecord(sheetId, id);
    if (!cell) {
      if (nextFormat === 'text') return;
      cell = normalizeCellRecord('', null);
    }
    cell.format = nextFormat;
    if (
      !cell.source &&
      !cell.generatedBy &&
      nextFormat === 'text' &&
      String(cell.align || 'left') === 'left' &&
      cell.wrapText !== true &&
      cell.bold !== true &&
      cell.italic !== true
    ) {
      delete sheet.cells[id];
      return;
    }
    sheet.cells[id] = cell;
  }

  setCellPresentation(sheetId, cellId, presentation) {
    var sheet = this.ensureSheet(sheetId);
    if (!sheet) return;
    var id = String(cellId || '').toUpperCase();
    var nextPresentation = isPlainObject(presentation) ? presentation : {};
    var cell = this.getCellRecord(sheetId, id);
    if (!cell) {
      var hasMeaningfulPresentation =
        String(nextPresentation.align || 'left') !== 'left' ||
        nextPresentation.wrapText === true ||
        nextPresentation.bold === true ||
        nextPresentation.italic === true ||
        nextPresentation.decimalPlaces != null ||
        String(nextPresentation.backgroundColor || '') !== '' ||
        String(nextPresentation.fontFamily || 'default') !== 'default' ||
        (Number.isFinite(nextPresentation.fontSize) &&
          Number(nextPresentation.fontSize) !== 14) ||
        (isPlainObject(nextPresentation.borders) &&
          (nextPresentation.borders.top === true ||
            nextPresentation.borders.right === true ||
            nextPresentation.borders.bottom === true ||
            nextPresentation.borders.left === true));
      if (!hasMeaningfulPresentation) return;
      cell = normalizeCellRecord('', null);
    }
    if (Object.prototype.hasOwnProperty.call(nextPresentation, 'align')) {
      var nextAlign = String(nextPresentation.align || 'left');
      cell.align =
        nextAlign === 'center' || nextAlign === 'right' ? nextAlign : 'left';
    }
    if (Object.prototype.hasOwnProperty.call(nextPresentation, 'wrapText')) {
      cell.wrapText = nextPresentation.wrapText === true;
    }
    if (Object.prototype.hasOwnProperty.call(nextPresentation, 'bold')) {
      cell.bold = nextPresentation.bold === true;
    }
    if (Object.prototype.hasOwnProperty.call(nextPresentation, 'italic')) {
      cell.italic = nextPresentation.italic === true;
    }
    if (
      Object.prototype.hasOwnProperty.call(nextPresentation, 'decimalPlaces')
    ) {
      cell.decimalPlaces = Number.isInteger(nextPresentation.decimalPlaces)
        ? Math.max(0, Math.min(6, Number(nextPresentation.decimalPlaces)))
        : null;
    }
    if (
      Object.prototype.hasOwnProperty.call(nextPresentation, 'backgroundColor')
    ) {
      cell.backgroundColor =
        typeof nextPresentation.backgroundColor === 'string'
          ? String(nextPresentation.backgroundColor)
          : '';
    }
    if (Object.prototype.hasOwnProperty.call(nextPresentation, 'fontFamily')) {
      var nextFontFamily = String(nextPresentation.fontFamily || 'default');
      cell.fontFamily =
        ['default', 'serif', 'sans', 'mono', 'display'].indexOf(
          nextFontFamily,
        ) >= 0
          ? nextFontFamily
          : 'default';
    }
    if (Object.prototype.hasOwnProperty.call(nextPresentation, 'fontSize')) {
      cell.fontSize = Number.isFinite(nextPresentation.fontSize)
        ? Math.max(10, Math.min(28, Number(nextPresentation.fontSize)))
        : 14;
    }
    if (Object.prototype.hasOwnProperty.call(nextPresentation, 'borders')) {
      var nextBorders = isPlainObject(nextPresentation.borders)
        ? nextPresentation.borders
        : {};
      cell.borders = {
        top: nextBorders.top === true,
        right: nextBorders.right === true,
        bottom: nextBorders.bottom === true,
        left: nextBorders.left === true,
      };
    }
    if (
      !cell.source &&
      !cell.generatedBy &&
      String(cell.format || 'text') === 'text' &&
      String(cell.align || 'left') === 'left' &&
      cell.wrapText !== true &&
      cell.bold !== true &&
      cell.italic !== true &&
      cell.decimalPlaces == null &&
      String(cell.backgroundColor || '') === '' &&
      String(cell.fontFamily || 'default') === 'default' &&
      Number(cell.fontSize || 14) === 14 &&
      (!cell.borders ||
        (cell.borders.top !== true &&
          cell.borders.right !== true &&
          cell.borders.bottom !== true &&
          cell.borders.left !== true))
    ) {
      delete sheet.cells[id];
      return;
    }
    sheet.cells[id] = cell;
  }

  setComputedCellValue(sheetId, cellId, value, state, errorMessage, meta) {
    var sheet = this.ensureSheet(sheetId);
    if (!sheet) return;
    var id = String(cellId || '').toUpperCase();
    var cell = this.getCellRecord(sheetId, id);
    if (!cell) return;
    var details = isPlainObject(meta) ? meta : {};
    cell.value = String(value == null ? '' : value);
    cell.state = String(state || 'resolved');
    cell.error = String(errorMessage || '');
    cell.computedVersion = Math.max(1, (Number(cell.computedVersion) || 0) + 1);
    if (Object.prototype.hasOwnProperty.call(details, 'dependencySignature')) {
      var nextSignature = String(details.dependencySignature || '');
      if (cell.dependencySignature !== nextSignature) {
        cell.dependencyVersion = Math.max(
          1,
          (Number(cell.dependencyVersion) || 0) + 1,
        );
        cell.dependencySignature = nextSignature;
      }
    }
    sheet.cells[id] = cell;
  }

  setCellRuntimeState(sheetId, cellId, updates) {
    var sheet = this.ensureSheet(sheetId);
    if (!sheet) return;
    var id = String(cellId || '').toUpperCase();
    var cell = this.getCellRecord(sheetId, id);
    if (!cell) return;
    var next = isPlainObject(updates) ? updates : {};
    if (Object.prototype.hasOwnProperty.call(next, 'value')) {
      cell.value = String(next.value == null ? '' : next.value);
    }
    if (Object.prototype.hasOwnProperty.call(next, 'state')) {
      cell.state = String(next.state || '');
    }
    if (Object.prototype.hasOwnProperty.call(next, 'error')) {
      cell.error = String(next.error || '');
    }
    if (
      Object.prototype.hasOwnProperty.call(next, 'lastProcessedChannelEventIds')
    ) {
      cell.lastProcessedChannelEventIds = isPlainObject(
        next.lastProcessedChannelEventIds,
      )
        ? deepClone(next.lastProcessedChannelEventIds)
        : {};
    }
    if (Object.prototype.hasOwnProperty.call(next, 'computedVersion')) {
      cell.computedVersion = Number(next.computedVersion) || 0;
    }
    if (Object.prototype.hasOwnProperty.call(next, 'dependencyVersion')) {
      cell.dependencyVersion = Number(next.dependencyVersion) || 0;
    }
    if (Object.prototype.hasOwnProperty.call(next, 'dependencySignature')) {
      cell.dependencySignature = String(next.dependencySignature || '');
    }
    sheet.cells[id] = cell;
  }

  getCellDependencies(sheetId, cellId) {
    var graph = this.ensureDependencyGraph();
    var key = makeDependencyGraphKey(sheetId, cellId);
    var entry = isPlainObject(graph.byCell[key]) ? graph.byCell[key] : null;
    if (!entry) {
      return {
        cells: [],
        namedRefs: [],
        channelLabels: [],
        attachments: [],
      };
    }
    return deepClone(entry);
  }

  setCellDependencies(sheetId, cellId, dependencies) {
    var graph = this.ensureDependencyGraph();
    var key = makeDependencyGraphKey(sheetId, cellId);
    var entry = isPlainObject(dependencies) ? deepClone(dependencies) : {};
    graph.byCell[key] = {
      cells: Array.isArray(entry.cells) ? entry.cells : [],
      namedRefs: Array.isArray(entry.namedRefs) ? entry.namedRefs : [],
      channelLabels: Array.isArray(entry.channelLabels)
        ? entry.channelLabels
        : [],
      attachments: Array.isArray(entry.attachments) ? entry.attachments : [],
    };
    this.rebuildReverseDependencyGraph();
  }

  clearCellDependencies(sheetId, cellId) {
    var graph = this.ensureDependencyGraph();
    delete graph.byCell[makeDependencyGraphKey(sheetId, cellId)];
    this.rebuildReverseDependencyGraph();
    this.markDependencyGraphAuthoritative(false, 'source-changed');
  }

  getDependencyGraph() {
    return deepClone(this.ensureDependencyGraph());
  }

  isDependencyGraphAuthoritative() {
    var graph = this.ensureDependencyGraph();
    return !!(graph.meta && graph.meta.authoritative === true);
  }

  getGeneratedCellSource(sheetId, cellId) {
    var cell = this.getCellRecord(sheetId, cellId);
    return cell ? String(cell.generatedBy || '') : '';
  }

  listGeneratedCellsBySource(sheetId, sourceCellId) {
    var source = String(sourceCellId || '').toUpperCase();
    if (!source) return [];
    var ids = this.listCellIds(sheetId);
    var result = [];
    for (var i = 0; i < ids.length; i++) {
      var cell = this.getCellRecord(sheetId, ids[i]);
      if (!cell) continue;
      if (String(cell.generatedBy || '').toUpperCase() === source)
        result.push(ids[i]);
    }
    return result;
  }

  clearGeneratedCellsBySource(sheetId, sourceCellId) {
    var ids = this.listGeneratedCellsBySource(sheetId, sourceCellId);
    for (var i = 0; i < ids.length; i++) {
      this.setCellSource(sheetId, ids[i], '', { generatedBy: '' });
    }
    return ids.length;
  }

  getColumnWidth(sheetId, colIndex) {
    var sheet = this.ensureSheet(sheetId);
    var value = sheet ? parseFloat(sheet.columnWidths[String(colIndex)]) : NaN;
    return isNaN(value) ? null : value;
  }

  setColumnWidth(sheetId, colIndex, width) {
    var sheet = this.ensureSheet(sheetId);
    if (!sheet) return;
    sheet.columnWidths[String(colIndex)] = String(width);
  }

  clearColumnWidth(sheetId, colIndex) {
    var sheet = this.ensureSheet(sheetId);
    if (!sheet) return;
    delete sheet.columnWidths[String(colIndex)];
  }

  getRowHeight(sheetId, rowIndex) {
    var sheet = this.ensureSheet(sheetId);
    var value = sheet ? parseFloat(sheet.rowHeights[String(rowIndex)]) : NaN;
    return isNaN(value) ? null : value;
  }

  setRowHeight(sheetId, rowIndex, height) {
    var sheet = this.ensureSheet(sheetId);
    if (!sheet) return;
    sheet.rowHeights[String(rowIndex)] = String(height);
  }

  getTabs() {
    return normalizeTabs(this.workbook.tabs);
  }

  setTabs(tabs) {
    this.workbook.tabs = normalizeTabs(tabs);
  }

  getActiveTabId(defaultSheetId) {
    return String(this.workbook.activeTabId || defaultSheetId || '');
  }

  setActiveTabId(sheetId) {
    this.workbook.activeTabId = String(sheetId || '');
  }

  getAIMode() {
    return this.workbook.aiMode === AI_MODE.manual
      ? AI_MODE.manual
      : AI_MODE.auto;
  }

  setAIMode(mode) {
    this.workbook.aiMode =
      mode === AI_MODE.manual ? AI_MODE.manual : AI_MODE.auto;
  }

  getReportContent(tabId) {
    var id = String(tabId || '');
    if (!id) id = 'report';
    var sheet = this.ensureSheet(id);
    return sheet ? String(sheet.reportContent || '') : '';
  }

  setReportContent(tabId, content) {
    var id = String(tabId || '');
    if (!id) id = 'report';
    var sheet = this.ensureSheet(id);
    if (!sheet) return;
    sheet.reportContent = String(content == null ? '' : content);
  }

  getNamedCells() {
    return deepClone(this.workbook.namedCells || {});
  }

  setNamedCells(namedCells) {
    this.workbook.namedCells = isPlainObject(namedCells)
      ? deepClone(namedCells)
      : {};
  }

  getCacheValue(key) {
    return Object.prototype.hasOwnProperty.call(this.workbook.caches, key)
      ? this.workbook.caches[key]
      : undefined;
  }

  setCacheValue(key, value) {
    this.workbook.caches[String(key)] = String(value == null ? '' : value);
  }

  removeCacheValue(key) {
    delete this.workbook.caches[String(key)];
  }

  clearSheet(sheetId) {
    delete this.workbook.sheets[String(sheetId || '')];
  }
}

export function createEmptyWorkbook() {
  return normalizeWorkbook({});
}
