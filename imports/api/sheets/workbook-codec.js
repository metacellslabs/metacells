import { AI_MODE, STORAGE_KEYS } from '../../engine/constants.js';
import { decodeStorageMap } from './storage-codec';

const FORMULA_PREFIXES = {
  '=': true,
  '>': true,
  '#': true,
  "'": true,
};

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isFormulaSource(value) {
  const source = String(value || '');
  return !!FORMULA_PREFIXES[source.charAt(0)];
}

function toBase64(value) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'utf8').toString('base64');
  }

  return btoa(unescape(encodeURIComponent(value)));
}

function fromBase64(value) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64').toString('utf8');
  }

  return decodeURIComponent(escape(atob(value)));
}

function encodeDynamicMapKeys(sourceValue) {
  const source = isPlainObject(sourceValue) ? sourceValue : {};
  const encoded = {};

  Object.keys(source).forEach((key) => {
    encoded[`k:${toBase64(String(key))}`] = String(source[key] ?? '');
  });

  return encoded;
}

function decodeDynamicMapKeys(sourceValue) {
  const source = isPlainObject(sourceValue) ? sourceValue : {};
  const decoded = {};

  Object.keys(source).forEach((key) => {
    if (String(key).startsWith('k:')) {
      decoded[fromBase64(String(key).slice(2))] = String(source[key] ?? '');
      return;
    }

    decoded[String(key)] = String(source[key] ?? '');
  });

  return decoded;
}

function cloneTabs(tabs) {
  if (!Array.isArray(tabs)) return [];

  return tabs
    .filter(
      (tab) =>
        tab && typeof tab.id === 'string' && typeof tab.name === 'string',
    )
    .map((tab) => ({
      id: String(tab.id),
      name: String(tab.name),
      type: tab.type === 'report' ? 'report' : 'sheet',
    }));
}

function parseJsonObject(rawValue, fallbackValue) {
  const fallback = isPlainObject(fallbackValue) ? fallbackValue : {};
  if (!rawValue) return { ...fallback };

  try {
    const parsed = JSON.parse(rawValue);
    return isPlainObject(parsed) ? parsed : { ...fallback };
  } catch (error) {
    return { ...fallback };
  }
}

function parseJsonTabs(rawValue, fallbackValue) {
  if (!rawValue) return cloneTabs(fallbackValue);

  try {
    return cloneTabs(JSON.parse(rawValue));
  } catch (error) {
    return cloneTabs(fallbackValue);
  }
}

function createEmptySheetEntry() {
  return {
    cells: {},
    columnWidths: {},
    rowHeights: {},
    reportContent: '',
  };
}

function normalizeDependencyRefList(items, mode) {
  if (!Array.isArray(items)) return [];
  const seen = {};
  const result = [];

  items.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const sheetId = String(item.sheetId || '');
    const cellId = String(item.cellId || '').toUpperCase();
    if (!sheetId || !cellId) return;
    const key = `${sheetId}:${cellId}`;
    if (seen[key]) return;
    seen[key] = true;
    result.push(
      mode === 'attachment' ? { sheetId, cellId } : { sheetId, cellId },
    );
  });

  return result;
}

function normalizeStringList(items) {
  if (!Array.isArray(items)) return [];
  const seen = {};
  const result = [];

  items.forEach((item) => {
    const value = String(item || '').trim();
    if (!value || seen[value]) return;
    seen[value] = true;
    result.push(value);
  });

  return result;
}

function normalizeDependentKeyList(items) {
  if (!Array.isArray(items)) return [];
  const seen = {};
  const result = [];
  items.forEach((item) => {
    const value = String(item || '');
    if (!value || seen[value]) return;
    seen[value] = true;
    result.push(value);
  });
  return result;
}

function buildReverseDependencyIndexes(byCell) {
  const dependentsByCell = {};
  const dependentsByNamedRef = {};
  const dependentsByChannel = {};
  const dependentsByAttachment = {};
  const register = (bucket, key, sourceKey) => {
    const normalizedKey = String(key || '');
    const normalizedSourceKey = String(sourceKey || '');
    if (!normalizedKey || !normalizedSourceKey) return;
    if (!Array.isArray(bucket[normalizedKey])) bucket[normalizedKey] = [];
    if (bucket[normalizedKey].indexOf(normalizedSourceKey) === -1) {
      bucket[normalizedKey].push(normalizedSourceKey);
    }
  };

  Object.keys(byCell || {}).forEach((sourceKey) => {
    const entry = isPlainObject(byCell[sourceKey]) ? byCell[sourceKey] : {};
    (Array.isArray(entry.cells) ? entry.cells : []).forEach((item) => {
      if (!item || typeof item !== 'object') return;
      register(
        dependentsByCell,
        `${String(item.sheetId || '')}:${String(item.cellId || '').toUpperCase()}`,
        sourceKey,
      );
    });
    (Array.isArray(entry.namedRefs) ? entry.namedRefs : []).forEach((name) => {
      register(dependentsByNamedRef, String(name || '').trim(), sourceKey);
    });
    (Array.isArray(entry.channelLabels) ? entry.channelLabels : []).forEach(
      (label) => {
        register(dependentsByChannel, String(label || '').trim(), sourceKey);
      },
    );
    (Array.isArray(entry.attachments) ? entry.attachments : []).forEach(
      (item) => {
        if (!item || typeof item !== 'object') return;
        register(
          dependentsByAttachment,
          `${String(item.sheetId || '')}:${String(item.cellId || '').toUpperCase()}`,
          sourceKey,
        );
      },
    );
  });

  return {
    dependentsByCell,
    dependentsByNamedRef,
    dependentsByChannel,
    dependentsByAttachment,
  };
}

function normalizeDependencyGraph(graphValue) {
  const source = isPlainObject(graphValue) ? graphValue : {};
  const byCellSource = isPlainObject(source.byCell) ? source.byCell : {};
  const byCell = {};

  Object.keys(byCellSource).forEach((cellKey) => {
    const entry = isPlainObject(byCellSource[cellKey])
      ? byCellSource[cellKey]
      : {};
    byCell[String(cellKey)] = {
      cells: normalizeDependencyRefList(entry.cells),
      namedRefs: normalizeStringList(entry.namedRefs),
      channelLabels: normalizeStringList(entry.channelLabels),
      attachments: normalizeDependencyRefList(entry.attachments, 'attachment'),
    };
  });

  const reverse = buildReverseDependencyIndexes(byCell);
  return {
    byCell,
    dependentsByCell: Object.fromEntries(
      Object.keys(reverse.dependentsByCell).map((key) => [
        key,
        normalizeDependentKeyList(reverse.dependentsByCell[key]),
      ]),
    ),
    dependentsByNamedRef: Object.fromEntries(
      Object.keys(reverse.dependentsByNamedRef).map((key) => [
        key,
        normalizeDependentKeyList(reverse.dependentsByNamedRef[key]),
      ]),
    ),
    dependentsByChannel: Object.fromEntries(
      Object.keys(reverse.dependentsByChannel).map((key) => [
        key,
        normalizeDependentKeyList(reverse.dependentsByChannel[key]),
      ]),
    ),
    dependentsByAttachment: Object.fromEntries(
      Object.keys(reverse.dependentsByAttachment).map((key) => [
        key,
        normalizeDependentKeyList(reverse.dependentsByAttachment[key]),
      ]),
    ),
    meta: {
      authoritative: source.meta && source.meta.authoritative === true,
      version: 1,
      repairedAt: String((source.meta && source.meta.repairedAt) || ''),
      reason: String((source.meta && source.meta.reason) || ''),
    },
  };
}

function ensureSheetEntry(workbook, sheetId) {
  if (!isPlainObject(workbook.sheets)) workbook.sheets = {};
  if (!isPlainObject(workbook.sheets[sheetId])) {
    workbook.sheets[sheetId] = createEmptySheetEntry();
  }
  return workbook.sheets[sheetId];
}

function inferTabsFromFlatStorage(flatStorage, namedCells) {
  const source = isPlainObject(flatStorage) ? flatStorage : {};
  const tabs = [];
  const sheetIds = [];
  const reportIds = [];

  const pushUnique = (list, value) => {
    if (!value || list.indexOf(value) !== -1) return;
    list.push(value);
  };

  Object.keys(source).forEach((key) => {
    const reportMatch = /^SHEET:([^:]+):REPORT_CONTENT$/.exec(key);
    if (reportMatch) {
      pushUnique(reportIds, reportMatch[1]);
      return;
    }

    const sheetMatch =
      /^SHEET:([^:]+):(CELL:|CELL_GEN_SOURCE:|COL_WIDTH:|ROW_HEIGHT:)/.exec(
        key,
      );
    if (sheetMatch) {
      pushUnique(sheetIds, sheetMatch[1]);
    }
  });

  Object.keys(namedCells || {}).forEach((name) => {
    const ref = namedCells[name];
    if (!ref || typeof ref.sheetId !== 'string') return;
    pushUnique(sheetIds, ref.sheetId);
  });

  sheetIds.forEach((sheetId, index) => {
    tabs.push({
      id: sheetId,
      name: `Sheet ${index + 1}`,
      type: 'sheet',
    });
  });

  reportIds.forEach((sheetId, index) => {
    tabs.push({
      id: sheetId,
      name: index === 0 ? 'Report' : `Report ${index + 1}`,
      type: 'report',
    });
  });

  return tabs;
}

function buildCellRecord(source, previousCell) {
  const nextSource = String(source || '');
  const nextSourceType = isFormulaSource(nextSource) ? 'formula' : 'raw';
  const previous = isPlainObject(previousCell) ? previousCell : {};
  const sourceChanged = String(previous.source || '') !== nextSource;
  const nextVersion = sourceChanged
    ? (Number(previous.version) || 0) + 1
    : Number(previous.version) || 1;

  return {
    source: nextSource,
    sourceType: nextSourceType,
    value:
      nextSourceType === 'formula' ? String(previous.value || '') : nextSource,
    state:
      nextSourceType === 'formula'
        ? sourceChanged
          ? 'stale'
          : String(previous.state || 'stale')
        : 'resolved',
    generatedBy: String(previous.generatedBy || ''),
    lastProcessedChannelEventIds: isPlainObject(
      previous.lastProcessedChannelEventIds,
    )
      ? { ...previous.lastProcessedChannelEventIds }
      : {},
    sourceVersion: nextVersion,
    computedVersion:
      nextSourceType === 'formula'
        ? sourceChanged
          ? 0
          : Number(previous.computedVersion) || 0
        : nextVersion,
    dependencyVersion:
      nextSourceType === 'formula'
        ? sourceChanged
          ? 0
          : Number(previous.dependencyVersion) || 0
        : nextVersion,
    dependencySignature:
      nextSourceType === 'formula' && !sourceChanged
        ? String(previous.dependencySignature || '')
        : '',
    version: nextVersion,
  };
}

export function decodeWorkbookDocument(workbookValue) {
  const workbook = isPlainObject(workbookValue) ? workbookValue : {};

  return {
    version: 1,
    tabs: cloneTabs(workbook.tabs),
    activeTabId:
      typeof workbook.activeTabId === 'string' ? workbook.activeTabId : '',
    aiMode: workbook.aiMode === AI_MODE.manual ? AI_MODE.manual : AI_MODE.auto,
    namedCells: isPlainObject(workbook.namedCells)
      ? { ...workbook.namedCells }
      : {},
    sheets: isPlainObject(workbook.sheets) ? { ...workbook.sheets } : {},
    dependencyGraph: normalizeDependencyGraph(workbook.dependencyGraph),
    caches: decodeDynamicMapKeys(workbook.caches),
    globals: decodeDynamicMapKeys(workbook.globals),
  };
}

export function buildWorkbookFromFlatStorage(
  flatStorage,
  previousWorkbook,
  options = {},
) {
  const source = isPlainObject(flatStorage) ? flatStorage : {};
  const previous = decodeWorkbookDocument(previousWorkbook);
  const workbook = decodeWorkbookDocument(previousWorkbook);
  const namedCells = parseJsonObject(
    source[STORAGE_KEYS.namedCells],
    previous.namedCells,
  );
  let tabs = parseJsonTabs(source[STORAGE_KEYS.tabs], previous.tabs);

  if (!tabs.length) {
    tabs = inferTabsFromFlatStorage(source, namedCells);
  }

  workbook.tabs = tabs;
  workbook.activeTabId = String(
    source[STORAGE_KEYS.activeTab] ||
      previous.activeTabId ||
      (tabs[0] && tabs[0].id) ||
      '',
  );
  workbook.aiMode =
    source[STORAGE_KEYS.aiMode] === AI_MODE.manual
      ? AI_MODE.manual
      : AI_MODE.auto;
  workbook.namedCells = namedCells;
  workbook.sheets = {};
  workbook.dependencyGraph =
    previous.dependencyGraph || normalizeDependencyGraph({});
  workbook.caches = {};
  workbook.globals = {};

  if (typeof source[STORAGE_KEYS.reportContent] !== 'undefined') {
    ensureSheetEntry(workbook, 'report').reportContent = String(
      source[STORAGE_KEYS.reportContent] || '',
    );
  }

  Object.keys(source).forEach((key) => {
    const value = String(source[key] ?? '');

    if (
      key === STORAGE_KEYS.tabs ||
      key === STORAGE_KEYS.activeTab ||
      key === STORAGE_KEYS.aiMode ||
      key === STORAGE_KEYS.namedCells ||
      key === STORAGE_KEYS.reportContent
    ) {
      return;
    }

    let match = /^SHEET:([^:]+):CELL:([A-Za-z]+[0-9]+)$/.exec(key);
    if (match) {
      const sheetId = match[1];
      const cellId = String(match[2]).toUpperCase();
      if (!value) return;
      const previousCell = previous.sheets?.[sheetId]?.cells?.[cellId];
      ensureSheetEntry(workbook, sheetId).cells[cellId] = buildCellRecord(
        value,
        previousCell,
      );
      return;
    }

    match = /^SHEET:([^:]+):CELL_GEN_SOURCE:([A-Za-z]+[0-9]+)$/.exec(key);
    if (match) {
      const sheetId = match[1];
      const cellId = String(match[2]).toUpperCase();
      if (!value) return;
      const sheetEntry = ensureSheetEntry(workbook, sheetId);
      const nextCell =
        sheetEntry.cells[cellId] ||
        buildCellRecord('', previous.sheets?.[sheetId]?.cells?.[cellId]);
      nextCell.generatedBy = String(value).toUpperCase();
      sheetEntry.cells[cellId] = nextCell;
      return;
    }

    match = /^SHEET:([^:]+):COL_WIDTH:([0-9]+)$/.exec(key);
    if (match) {
      ensureSheetEntry(workbook, match[1]).columnWidths[match[2]] = value;
      return;
    }

    match = /^SHEET:([^:]+):ROW_HEIGHT:([0-9]+)$/.exec(key);
    if (match) {
      ensureSheetEntry(workbook, match[1]).rowHeights[match[2]] = value;
      return;
    }

    match = /^SHEET:([^:]+):REPORT_CONTENT$/.exec(key);
    if (match) {
      ensureSheetEntry(workbook, match[1]).reportContent = value;
      return;
    }

    if (key.indexOf('AI_') === 0) {
      workbook.caches[key] = value;
      return;
    }

    workbook.globals[key] = value;
  });

  const computedValues = isPlainObject(options.computedValues)
    ? options.computedValues
    : null;
  const computedSheetId = String(options.activeSheetId || '');
  if (computedValues && computedSheetId) {
    const sheetEntry = ensureSheetEntry(workbook, computedSheetId);
    Object.keys(computedValues).forEach((cellId) => {
      const normalizedCellId = String(cellId).toUpperCase();
      const cell = sheetEntry.cells[normalizedCellId];
      if (!cell) return;
      cell.value = String(computedValues[cellId] ?? '');
      cell.state = 'resolved';
    });
  }

  Object.keys(workbook.sheets).forEach((sheetId) => {
    const sheetEntry = workbook.sheets[sheetId];
    if (!isPlainObject(sheetEntry)) {
      delete workbook.sheets[sheetId];
      return;
    }

    const nextCells = {};
    Object.keys(sheetEntry.cells || {}).forEach((cellId) => {
      const cell = sheetEntry.cells[cellId];
      if (!isPlainObject(cell)) return;
      const sourceValue = String(cell.source || '');
      const generatedBy = String(cell.generatedBy || '');
      if (!sourceValue && !generatedBy) return;
      nextCells[cellId] = {
        source: sourceValue,
        sourceType: cell.sourceType === 'formula' ? 'formula' : 'raw',
        value: sourceValue
          ? String(
              cell.value ?? (cell.sourceType === 'formula' ? '' : sourceValue),
            )
          : '',
        state: String(
          cell.state || (cell.sourceType === 'formula' ? 'stale' : 'resolved'),
        ),
        error: String(cell.error || ''),
        generatedBy,
        lastProcessedChannelEventIds: isPlainObject(
          cell.lastProcessedChannelEventIds,
        )
          ? { ...cell.lastProcessedChannelEventIds }
          : {},
        sourceVersion: Number(cell.sourceVersion) || Number(cell.version) || 1,
        computedVersion: Number(cell.computedVersion) || 0,
        dependencyVersion: Number(cell.dependencyVersion) || 0,
        dependencySignature: String(cell.dependencySignature || ''),
        version: Number(cell.version) || 1,
      };
    });

    sheetEntry.cells = nextCells;
    if (!isPlainObject(sheetEntry.columnWidths)) sheetEntry.columnWidths = {};
    if (!isPlainObject(sheetEntry.rowHeights)) sheetEntry.rowHeights = {};
    if (typeof sheetEntry.reportContent !== 'string')
      sheetEntry.reportContent = String(sheetEntry.reportContent || '');
  });

  if (!workbook.tabs.length) {
    workbook.tabs = [{ id: 'sheet-1', name: 'Sheet 1', type: 'sheet' }];
  }

  if (
    !workbook.activeTabId ||
    !workbook.tabs.some((tab) => tab.id === workbook.activeTabId)
  ) {
    workbook.activeTabId = workbook.tabs[0].id;
  }

  return workbook;
}

export function flattenWorkbook(workbookValue) {
  const workbook = decodeWorkbookDocument(workbookValue);
  const storage = {};

  if (workbook.tabs.length) {
    storage[STORAGE_KEYS.tabs] = JSON.stringify(workbook.tabs);
  }
  if (workbook.activeTabId) {
    storage[STORAGE_KEYS.activeTab] = workbook.activeTabId;
  }
  storage[STORAGE_KEYS.aiMode] =
    workbook.aiMode === AI_MODE.manual ? AI_MODE.manual : AI_MODE.auto;
  if (Object.keys(workbook.namedCells).length) {
    storage[STORAGE_KEYS.namedCells] = JSON.stringify(workbook.namedCells);
  }

  Object.keys(workbook.sheets).forEach((sheetId) => {
    const sheetEntry = workbook.sheets[sheetId];
    if (!isPlainObject(sheetEntry)) return;

    Object.keys(sheetEntry.cells || {}).forEach((cellId) => {
      const cell = sheetEntry.cells[cellId];
      if (!isPlainObject(cell)) return;
      const source = String(cell.source || '');
      const generatedBy = String(cell.generatedBy || '');
      if (source) {
        storage[`SHEET:${sheetId}:CELL:${String(cellId).toUpperCase()}`] =
          source;
      }
      if (generatedBy) {
        storage[
          `SHEET:${sheetId}:CELL_GEN_SOURCE:${String(cellId).toUpperCase()}`
        ] = generatedBy;
      }
    });

    Object.keys(sheetEntry.columnWidths || {}).forEach((index) => {
      const width = String(sheetEntry.columnWidths[index] ?? '');
      if (!width) return;
      storage[`SHEET:${sheetId}:COL_WIDTH:${index}`] = width;
    });

    Object.keys(sheetEntry.rowHeights || {}).forEach((index) => {
      const height = String(sheetEntry.rowHeights[index] ?? '');
      if (!height) return;
      storage[`SHEET:${sheetId}:ROW_HEIGHT:${index}`] = height;
    });

    if (sheetEntry.reportContent) {
      storage[`SHEET:${sheetId}:REPORT_CONTENT`] = String(
        sheetEntry.reportContent,
      );
      if (sheetId === 'report') {
        storage[STORAGE_KEYS.reportContent] = String(sheetEntry.reportContent);
      }
    }
  });

  Object.keys(workbook.caches).forEach((key) => {
    storage[key] = String(workbook.caches[key] ?? '');
  });

  Object.keys(workbook.globals).forEach((key) => {
    storage[key] = String(workbook.globals[key] ?? '');
  });

  return storage;
}

export function encodeWorkbookForDocument(workbookValue) {
  const workbook = decodeWorkbookDocument(workbookValue);

  return {
    version: workbook.version,
    tabs: cloneTabs(workbook.tabs),
    activeTabId: workbook.activeTabId,
    aiMode: workbook.aiMode,
    namedCells: { ...workbook.namedCells },
    sheets: { ...workbook.sheets },
    dependencyGraph: normalizeDependencyGraph(workbook.dependencyGraph),
    caches: encodeDynamicMapKeys(workbook.caches),
    globals: encodeDynamicMapKeys(workbook.globals),
  };
}

export function decodeSheetDocumentStorage(sheetDocument) {
  if (sheetDocument && isPlainObject(sheetDocument.workbook)) {
    return flattenWorkbook(sheetDocument.workbook);
  }

  return decodeStorageMap((sheetDocument && sheetDocument.storage) || {});
}
