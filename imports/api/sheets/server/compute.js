import { FormulaEngine } from '../../../engine/formula-engine.js';
import { AIService } from '../../../ui/metacell/runtime/ai-service.js';
import { StorageService } from '../../../engine/storage-service.js';
import { GRID_COLS, GRID_ROWS } from '../../../engine/constants.js';
import {
  WorkbookStorageAdapter,
  createEmptyWorkbook,
} from '../../../engine/workbook-storage-adapter.js';

function columnIndexToLabel(index) {
  let n = index;
  let label = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function columnLabelToIndex(label) {
  let result = 0;
  for (let i = 0; i < label.length; i += 1) {
    result = result * 26 + (label.charCodeAt(i) - 64);
  }
  return result;
}

function buildCellIds(workbookData) {
  const ids = [];
  let maxRow = GRID_ROWS;
  let maxCol = GRID_COLS;
  const workbook =
    workbookData && typeof workbookData === 'object'
      ? workbookData
      : createEmptyWorkbook();
  const sheets =
    workbook.sheets && typeof workbook.sheets === 'object'
      ? workbook.sheets
      : {};

  Object.keys(sheets).forEach((sheetId) => {
    const cells =
      sheets[sheetId] && typeof sheets[sheetId].cells === 'object'
        ? sheets[sheetId].cells
        : {};
    Object.keys(cells).forEach((cellId) => {
      const match = /^([A-Za-z]+)([0-9]+)$/.exec(
        String(cellId || '').toUpperCase(),
      );
      if (!match) return;
      const col = columnLabelToIndex(match[1]);
      const row = parseInt(match[2], 10);
      if (!Number.isNaN(col) && col > maxCol) maxCol = col;
      if (!Number.isNaN(row) && row > maxRow) maxRow = row;
    });
  });

  for (let row = 1; row <= maxRow; row += 1) {
    for (let col = 1; col <= maxCol; col += 1) {
      ids.push(`${columnIndexToLabel(col)}${row}`);
    }
  }

  return ids;
}

function makeCellGraphKey(sheetId, cellId) {
  return `${String(sheetId || '')}:${String(cellId || '').toUpperCase()}`;
}

function buildChangedCellKeySet(changedSignals) {
  const result = {};
  const signals = Array.isArray(changedSignals) ? changedSignals : [];
  for (let i = 0; i < signals.length; i += 1) {
    const signal = signals[i] || {};
    if (signal.kind !== 'cell') continue;
    result[makeCellGraphKey(signal.sheetId, signal.cellId)] = true;
  }
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
    const entry =
      byCell[sourceKey] && typeof byCell[sourceKey] === 'object'
        ? byCell[sourceKey]
        : {};
    (Array.isArray(entry.cells) ? entry.cells : []).forEach((item) => {
      if (!item || typeof item !== 'object') return;
      register(
        dependentsByCell,
        makeCellGraphKey(item.sheetId, item.cellId),
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
          makeCellGraphKey(item.sheetId, item.cellId),
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

function createDependencyCollector() {
  const cells = [];
  const namedRefs = [];
  const channelLabels = [];
  const attachments = [];
  const seenCells = {};
  const seenNamedRefs = {};
  const seenChannels = {};
  const seenAttachments = {};

  return {
    addCell(sheetId, cellId) {
      const normalizedSheetId = String(sheetId || '');
      const normalizedCellId = String(cellId || '').toUpperCase();
      if (!normalizedSheetId || !normalizedCellId) return;
      const key = `${normalizedSheetId}:${normalizedCellId}`;
      if (seenCells[key]) return;
      seenCells[key] = true;
      cells.push({ sheetId: normalizedSheetId, cellId: normalizedCellId });
    },
    addNamedRef(name) {
      const normalizedName = String(name || '').trim();
      if (!normalizedName || seenNamedRefs[normalizedName]) return;
      seenNamedRefs[normalizedName] = true;
      namedRefs.push(normalizedName);
    },
    addChannel(label) {
      const normalizedLabel = String(label || '').trim();
      if (!normalizedLabel || seenChannels[normalizedLabel]) return;
      seenChannels[normalizedLabel] = true;
      channelLabels.push(normalizedLabel);
    },
    addAttachment(sheetId, cellId) {
      const normalizedSheetId = String(sheetId || '');
      const normalizedCellId = String(cellId || '').toUpperCase();
      if (!normalizedSheetId || !normalizedCellId) return;
      const key = `${normalizedSheetId}:${normalizedCellId}`;
      if (seenAttachments[key]) return;
      seenAttachments[key] = true;
      attachments.push({
        sheetId: normalizedSheetId,
        cellId: normalizedCellId,
      });
    },
    snapshot() {
      return {
        cells,
        namedRefs,
        channelLabels,
        attachments,
      };
    },
  };
}

function getWorkbookDependencyGraph(workbookData) {
  const workbook =
    workbookData && typeof workbookData === 'object' ? workbookData : {};
  const graph =
    workbook.dependencyGraph && typeof workbook.dependencyGraph === 'object'
      ? workbook.dependencyGraph
      : {};
  const byCell =
    graph.byCell && typeof graph.byCell === 'object' ? graph.byCell : {};
  const reverse = buildReverseDependencyIndexes(byCell);
  const dependentsByCell =
    graph.dependentsByCell && typeof graph.dependentsByCell === 'object'
      ? graph.dependentsByCell
      : reverse.dependentsByCell;
  const dependentsByNamedRef =
    graph.dependentsByNamedRef && typeof graph.dependentsByNamedRef === 'object'
      ? graph.dependentsByNamedRef
      : reverse.dependentsByNamedRef;
  const dependentsByChannel =
    graph.dependentsByChannel && typeof graph.dependentsByChannel === 'object'
      ? graph.dependentsByChannel
      : reverse.dependentsByChannel;
  const dependentsByAttachment =
    graph.dependentsByAttachment &&
    typeof graph.dependentsByAttachment === 'object'
      ? graph.dependentsByAttachment
      : reverse.dependentsByAttachment;
  return {
    byCell,
    dependentsByCell,
    dependentsByNamedRef,
    dependentsByChannel,
    dependentsByAttachment,
    meta:
      graph.meta && typeof graph.meta === 'object'
        ? graph.meta
        : { authoritative: false },
  };
}

export function isDependencyGraphAuthoritative(workbookData) {
  const graph = getWorkbookDependencyGraph(workbookData);
  return graph.meta && graph.meta.authoritative === true;
}

export function collectAffectedCellKeysFromSignals(
  workbookData,
  changedSignals,
) {
  const signals = Array.isArray(changedSignals) ? changedSignals : [];
  if (!signals.length) return null;

  const graph = getWorkbookDependencyGraph(workbookData);
  if (!graph || !Object.keys(graph.byCell).length) return null;
  if (!isDependencyGraphAuthoritative(workbookData)) return null;

  const reverseGraph = graph;
  const queue = [];
  const affected = {};

  const enqueue = (cellKey) => {
    const normalizedKey = String(cellKey || '');
    if (!normalizedKey || affected[normalizedKey]) return;
    affected[normalizedKey] = true;
    queue.push(normalizedKey);
  };

  for (let i = 0; i < signals.length; i += 1) {
    const signal = signals[i] || {};
    if (signal.kind === 'named-cells') return null;

    if (signal.kind === 'cell') {
      const signalKey = makeCellGraphKey(signal.sheetId, signal.cellId);
      enqueue(signalKey);
      const cellDependents = reverseGraph.dependentsByCell[signalKey] || [];
      const attachmentDependents =
        reverseGraph.dependentsByAttachment[signalKey] || [];
      cellDependents.forEach(enqueue);
      attachmentDependents.forEach(enqueue);
      continue;
    }

    if (signal.kind === 'named-ref') {
      const dependents =
        reverseGraph.dependentsByNamedRef[String(signal.name || '').trim()] ||
        [];
      dependents.forEach(enqueue);
      continue;
    }

    if (signal.kind === 'channel') {
      const dependents =
        reverseGraph.dependentsByChannel[String(signal.label || '').trim()] ||
        [];
      dependents.forEach(enqueue);
      continue;
    }

    return null;
  }

  while (queue.length) {
    const currentKey = queue.shift();
    const downstream = reverseGraph.dependentsByCell[currentKey] || [];
    downstream.forEach(enqueue);
  }

  return affected;
}

export function buildTargetCellMap(workbookData, changedSignals) {
  const affectedKeys = collectAffectedCellKeysFromSignals(
    workbookData,
    changedSignals,
  );
  if (!affectedKeys) return null;
  const bySheet = {};

  Object.keys(affectedKeys).forEach((cellKey) => {
    const separatorIndex = cellKey.indexOf(':');
    if (separatorIndex === -1) return;
    const sheetId = cellKey.slice(0, separatorIndex);
    const cellId = cellKey.slice(separatorIndex + 1);
    if (!bySheet[sheetId]) bySheet[sheetId] = {};
    bySheet[sheetId][cellId] = true;
  });

  return bySheet;
}

export function invalidateWorkbookDependencies(workbookData, changedSignals) {
  const targetCellMap = buildTargetCellMap(workbookData, changedSignals);
  if (!targetCellMap) {
    return workbookData;
  }

  const rawStorage = new MemoryWorkbookStorage(workbookData);
  const storageService = new StorageService(rawStorage);
  const changedCellKeys = buildChangedCellKeySet(changedSignals);

  Object.keys(targetCellMap).forEach((sheetId) => {
    const targetCells = targetCellMap[sheetId] || {};
    Object.keys(targetCells).forEach((cellId) => {
      const rawValue = String(
        storageService.getCellValue(sheetId, cellId) || '',
      );
      if (!rawValue) return;
      const sourceKey = makeCellGraphKey(sheetId, cellId);
      const isFormula = /^[='>#]/.test(rawValue);
      const isDirectlyChanged = !!changedCellKeys[sourceKey];
      const isExplicitAsyncFormula =
        rawValue.charAt(0) === "'" ||
        rawValue.charAt(0) === '>' ||
        rawValue.charAt(0) === '#' ||
        (rawValue.charAt(0) === '=' &&
          /(^|[^A-Za-z0-9_])(askAI|listAI|recalc|update)\s*\(/i.test(
            rawValue.substring(1),
          ));
      const clearsGeneratedResults =
        rawValue.charAt(0) === '>' ||
        rawValue.charAt(0) === '#' ||
        (rawValue.charAt(0) === '=' &&
          /(^|[^A-Za-z0-9_])(listAI|tableAI)\s*\(/i.test(
            rawValue.substring(1),
          ));

      if (isFormula) {
        if (clearsGeneratedResults) {
          storageService.clearGeneratedCellsBySource(sheetId, cellId);
        }
        const nextState = {
          state: 'stale',
          error: '',
        };
        if (isExplicitAsyncFormula) nextState.value = '';
        storageService.setCellRuntimeState(sheetId, cellId, nextState);
        return;
      }

      if (isDirectlyChanged) {
        storageService.setCellRuntimeState(sheetId, cellId, {
          value: rawValue,
          state: 'resolved',
          error: '',
        });
      }
    });
  });

  return rawStorage.snapshot();
}

class MemoryWorkbookStorage extends WorkbookStorageAdapter {}

export function rebuildWorkbookDependencyGraph(
  workbookData,
  channelPayloads = {},
) {
  const rawStorage = new MemoryWorkbookStorage(workbookData);
  const storageService = new StorageService(rawStorage);
  const aiStub = {
    getMode() {
      return 'auto';
    },
    ask() {
      return '...';
    },
    list() {
      return ['...'];
    },
    askTable() {
      return [['...']];
    },
  };
  const tabs = storageService.readTabs();
  const formulaEngine = new FormulaEngine(
    storageService,
    aiStub,
    () => tabs,
    buildCellIds(rawStorage.snapshot()),
  );

  tabs
    .filter((tab) => tab && tab.type === 'sheet')
    .forEach((tab) => {
      const sheetId = String(tab.id || '');
      const cellRefs =
        typeof storageService.listAllCellIds === 'function'
          ? storageService.listAllCellIds(sheetId)
          : [];
      cellRefs.forEach((entry) => {
        const cellId = String((entry && entry.cellId) || '').toUpperCase();
        const rawValue = String(
          storageService.getCellValue(sheetId, cellId) || '',
        );
        if (!rawValue || !/^[='>#]/.test(rawValue)) {
          storageService.clearCellDependencies(sheetId, cellId);
          return;
        }
        const dependencyCollector = createDependencyCollector();
        try {
          formulaEngine.evaluateCell(
            sheetId,
            cellId,
            {},
            {
              forceRefreshAI: false,
              channelPayloads,
              dependencyCollector,
            },
          );
        } catch (error) {}
        storageService.setCellDependencies(
          sheetId,
          cellId,
          dependencyCollector.snapshot(),
        );
      });
    });

  rawStorage.markDependencyGraphAuthoritative(true, 'repair');
  return rawStorage.snapshot();
}

function inferComputedCellState(rawValue, computedValue) {
  const raw = String(rawValue || '');
  const value = String(computedValue == null ? '' : computedValue);

  if (!raw) return 'resolved';
  if (value === '#REF!' || value === '#ERROR' || value === '#SELECT_FILE')
    return 'error';
  if (value.indexOf('#AI_ERROR:') === 0) return 'error';
  if (raw.charAt(0) === "'" || raw.charAt(0) === '>' || raw.charAt(0) === '#') {
    if (value === '...' || value === '(manual: click Update)') return 'pending';
    return 'resolved';
  }
  if (raw.charAt(0) === '=') {
    if (value === '...' || value === '(manual: click Update)') return 'pending';
    return 'resolved';
  }
  return 'resolved';
}

function normalizeComputeError(error) {
  const message =
    error && error.message
      ? String(error.message)
      : String(error || 'Formula error');
  return message || 'Formula error';
}

function classifyComputeFailure(error) {
  const message = normalizeComputeError(error);
  if (
    /^Unknown sheet:/i.test(message) ||
    /^Unknown cell name:/i.test(message)
  ) {
    return {
      value: '#REF!',
      error: message,
    };
  }
  if (message === '#SELECT_FILE' || /^#SELECT_FILE\b/i.test(message)) {
    return {
      value: '#SELECT_FILE',
      error: 'Select a file first',
    };
  }
  return {
    value: '#ERROR',
    error: message,
  };
}

function buildProcessedChannelEventIds(dependencies, channelPayloads) {
  const result = {};
  const entry =
    dependencies && typeof dependencies === 'object' ? dependencies : {};
  const labels = Array.isArray(entry.channelLabels) ? entry.channelLabels : [];
  const payloads =
    channelPayloads && typeof channelPayloads === 'object'
      ? channelPayloads
      : {};

  labels.forEach((label) => {
    const key = String(label || '').trim();
    const payload = payloads[key];
    const eventId =
      payload && (payload.eventId || payload._id)
        ? String(payload.eventId || payload._id)
        : '';
    if (!key || !eventId) return;
    result[key] = eventId;
  });

  return result;
}

function buildDependencySignature(
  storageService,
  dependencies,
  channelPayloads,
) {
  const entry =
    dependencies && typeof dependencies === 'object' ? dependencies : {};
  const payloads =
    channelPayloads && typeof channelPayloads === 'object'
      ? channelPayloads
      : {};
  const normalized = {
    cells: [],
    namedRefs: [],
    channelLabels: [],
    attachments: [],
  };

  (Array.isArray(entry.cells) ? entry.cells : []).forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const versionInfo = storageService.getCellVersionInfo(
      item.sheetId,
      item.cellId,
    );
    normalized.cells.push({
      sheetId: String(item.sheetId || ''),
      cellId: String(item.cellId || '').toUpperCase(),
      sourceVersion: Number(versionInfo.sourceVersion) || 0,
      computedVersion: Number(versionInfo.computedVersion) || 0,
      dependencyVersion: Number(versionInfo.dependencyVersion) || 0,
    });
  });

  (Array.isArray(entry.attachments) ? entry.attachments : []).forEach(
    (item) => {
      if (!item || typeof item !== 'object') return;
      const versionInfo = storageService.getCellVersionInfo(
        item.sheetId,
        item.cellId,
      );
      normalized.attachments.push({
        sheetId: String(item.sheetId || ''),
        cellId: String(item.cellId || '').toUpperCase(),
        sourceVersion: Number(versionInfo.sourceVersion) || 0,
        computedVersion: Number(versionInfo.computedVersion) || 0,
      });
    },
  );

  (Array.isArray(entry.namedRefs) ? entry.namedRefs : []).forEach((name) => {
    const normalizedName = String(name || '').trim();
    if (!normalizedName) return;
    const resolved = storageService.resolveNamedCell(normalizedName) || null;
    normalized.namedRefs.push({
      name: normalizedName,
      target: resolved ? JSON.stringify(resolved) : '',
    });
  });

  (Array.isArray(entry.channelLabels) ? entry.channelLabels : []).forEach(
    (label) => {
      const normalizedLabel = String(label || '').trim();
      if (!normalizedLabel) return;
      const payload = payloads[normalizedLabel] || null;
      normalized.channelLabels.push({
        label: normalizedLabel,
        eventId:
          payload && (payload.eventId || payload._id)
            ? String(payload.eventId || payload._id)
            : '',
      });
    },
  );

  return JSON.stringify(normalized);
}

function canReuseComputedCell(
  storageService,
  sheetId,
  cellId,
  rawValue,
  dependencySignature,
  forceRefreshAI,
) {
  const raw = String(rawValue || '');
  if (!raw || !/^[='>#]/.test(raw)) return false;
  if (forceRefreshAI) return false;
  const state = String(storageService.getCellState(sheetId, cellId) || '');
  if (state !== 'resolved') return false;
  const value = String(
    storageService.getCellComputedValue(sheetId, cellId) || '',
  );
  if (!value) return false;
  const versionInfo = storageService.getCellVersionInfo(sheetId, cellId);
  return (
    String(versionInfo.dependencySignature || '') ===
    String(dependencySignature || '')
  );
}

export async function computeSheetSnapshot({
  sheetDocumentId,
  workbookData,
  activeSheetId,
  persistWorkbook,
  channelPayloads = {},
  forceRefreshAI = false,
  manualTriggerAI = false,
  changedSignals = [],
}) {
  const invalidatedWorkbook = invalidateWorkbookDependencies(
    workbookData,
    changedSignals,
  );
  const rawStorage = new MemoryWorkbookStorage(invalidatedWorkbook);
  const storageService = new StorageService(rawStorage);
  const tabs = storageService.readTabs();
  const sheetTabIds = tabs
    .filter((tab) => tab && tab.type === 'sheet')
    .map((tab) => String(tab.id || ''))
    .filter(Boolean);
  const orderedSheetIds = [];

  if (activeSheetId && sheetTabIds.indexOf(activeSheetId) !== -1) {
    orderedSheetIds.push(activeSheetId);
  }
  for (let i = 0; i < sheetTabIds.length; i += 1) {
    if (orderedSheetIds.indexOf(sheetTabIds[i]) === -1) {
      orderedSheetIds.push(sheetTabIds[i]);
    }
  }

  const saveSnapshot = async (
    computedValues,
    computedErrors,
    computedProcessedEventIds,
  ) => {
    if (typeof persistWorkbook !== 'function') return;
    if (computedValues && typeof computedValues === 'object') {
      Object.keys(computedValues).forEach((sheetId) => {
        const sheetValues = computedValues[sheetId];
        if (!sheetValues || typeof sheetValues !== 'object') return;
        Object.keys(sheetValues).forEach((cellId) => {
          const rawValue = storageService.getCellValue(sheetId, cellId);
          const errorMessage =
            computedErrors &&
            computedErrors[sheetId] &&
            Object.prototype.hasOwnProperty.call(
              computedErrors[sheetId],
              cellId,
            )
              ? computedErrors[sheetId][cellId]
              : '';
          storageService.setComputedCellValue(
            sheetId,
            cellId,
            sheetValues[cellId],
            inferComputedCellState(rawValue, sheetValues[cellId]),
            errorMessage,
            {
              displayValue: storageService.getCellDisplayValue(sheetId, cellId),
            },
          );
          if (
            computedProcessedEventIds &&
            computedProcessedEventIds[sheetId] &&
            Object.prototype.hasOwnProperty.call(
              computedProcessedEventIds[sheetId],
              cellId,
            )
          ) {
            storageService.setCellRuntimeState(sheetId, cellId, {
              lastProcessedChannelEventIds:
                computedProcessedEventIds[sheetId][cellId],
            });
          }
        });
      });
    }
    await persistWorkbook(rawStorage.snapshot());
  };

  const aiService = new AIService(
    storageService,
    async (queueMeta) => {
      const asyncComputedValues = {};
      const asyncComputedErrors = {};
      const asyncProcessedEventIds = {};
      const asyncDependenciesBySheet = {};
      const sourceSheetId =
        queueMeta && queueMeta.sourceCellId
          ? String(queueMeta.activeSheetId || activeSheetId || '')
          : '';
      const sourceCellId =
        queueMeta && queueMeta.sourceCellId
          ? String(queueMeta.sourceCellId || '').toUpperCase()
          : '';
      const asyncChangedSignals =
        queueMeta && queueMeta.sourceCellId
          ? [
              {
                kind: 'cell',
                sheetId: sourceSheetId,
                cellId: sourceCellId,
              },
            ]
          : [];
      if (sourceSheetId && sourceCellId) {
        asyncComputedValues[sourceSheetId] = {};
        asyncComputedErrors[sourceSheetId] = {};
        asyncProcessedEventIds[sourceSheetId] = {};
        asyncDependenciesBySheet[sourceSheetId] = {};
        const sourceDependencyCollector = createDependencyCollector();
        const sourceRuntimeMeta = {};
        try {
          const computedValue = formulaEngine.evaluateCell(
            sourceSheetId,
            sourceCellId,
            {},
            {
              forceRefreshAI,
              channelPayloads,
              dependencyCollector: sourceDependencyCollector,
              runtimeMeta: sourceRuntimeMeta,
            },
          );
          const sourceDependencies = sourceDependencyCollector.snapshot();
          const dependencySignature = buildDependencySignature(
            storageService,
            sourceDependencies,
            channelPayloads,
          );
          asyncComputedValues[sourceSheetId][sourceCellId] = computedValue;
          asyncDependenciesBySheet[sourceSheetId][sourceCellId] =
            sourceDependencies;
          storageService.setComputedCellValue(
            sourceSheetId,
            sourceCellId,
            computedValue,
            inferComputedCellState(
              storageService.getCellValue(sourceSheetId, sourceCellId),
              computedValue,
            ),
            '',
            {
              dependencySignature,
              ...(Object.prototype.hasOwnProperty.call(
                sourceRuntimeMeta,
                'displayValue',
              )
                ? {
                    displayValue: String(
                      sourceRuntimeMeta.displayValue == null
                        ? ''
                        : sourceRuntimeMeta.displayValue,
                    ),
                  }
                : {}),
            },
          );
          asyncProcessedEventIds[sourceSheetId][sourceCellId] =
            buildProcessedChannelEventIds(sourceDependencies, channelPayloads);
          storageService.setCellRuntimeState(sourceSheetId, sourceCellId, {
            lastProcessedChannelEventIds:
              asyncProcessedEventIds[sourceSheetId][sourceCellId],
          });
        } catch (error) {
          const failure = classifyComputeFailure(error);
          const sourceDependencies = sourceDependencyCollector.snapshot();
          const dependencySignature = buildDependencySignature(
            storageService,
            sourceDependencies,
            channelPayloads,
          );
          asyncComputedValues[sourceSheetId][sourceCellId] = failure.value;
          asyncComputedErrors[sourceSheetId][sourceCellId] = failure.error;
          asyncDependenciesBySheet[sourceSheetId][sourceCellId] =
            sourceDependencies;
          storageService.setComputedCellValue(
            sourceSheetId,
            sourceCellId,
            failure.value,
            'error',
            failure.error,
            { dependencySignature },
          );
          asyncProcessedEventIds[sourceSheetId][sourceCellId] =
            buildProcessedChannelEventIds(sourceDependencies, channelPayloads);
          storageService.setCellRuntimeState(sourceSheetId, sourceCellId, {
            lastProcessedChannelEventIds:
              asyncProcessedEventIds[sourceSheetId][sourceCellId],
          });
        }
        if (typeof persistWorkbook === 'function') {
          await persistWorkbook(rawStorage.snapshot());
        }
      }
      const asyncTargetCellMap = forceRefreshAI
        ? null
        : buildTargetCellMap(rawStorage.snapshot(), asyncChangedSignals);
      for (let i = 0; i < orderedSheetIds.length; i += 1) {
        const sheetId = orderedSheetIds[i];
        const evaluationPlan =
          typeof formulaEngine.buildEvaluationPlan === 'function'
            ? formulaEngine.buildEvaluationPlan(sheetId)
            : formulaEngine.cellIds;
        const targetCells =
          asyncTargetCellMap && asyncTargetCellMap[sheetId]
            ? asyncTargetCellMap[sheetId]
            : null;
        asyncComputedValues[sheetId] = asyncComputedValues[sheetId] || {};
        asyncComputedErrors[sheetId] = asyncComputedErrors[sheetId] || {};
        asyncProcessedEventIds[sheetId] = asyncProcessedEventIds[sheetId] || {};
        asyncDependenciesBySheet[sheetId] =
          asyncDependenciesBySheet[sheetId] || {};
        for (
          let cellIndex = 0;
          cellIndex < evaluationPlan.length;
          cellIndex += 1
        ) {
          const cellId = evaluationPlan[cellIndex];
          if (asyncTargetCellMap && !targetCells?.[cellId]) {
            continue;
          }
          if (sheetId === sourceSheetId && cellId === sourceCellId) {
            continue;
          }
          const storedDependencies = storageService.getCellDependencies(
            sheetId,
            cellId,
          );
          const storedDependencySignature = buildDependencySignature(
            storageService,
            storedDependencies,
            channelPayloads,
          );
          const mustReevaluateAsyncTarget = !!(
            asyncTargetCellMap && targetCells?.[cellId]
          );
          if (
            !mustReevaluateAsyncTarget &&
            canReuseComputedCell(
              storageService,
              sheetId,
              cellId,
              storageService.getCellValue(sheetId, cellId),
              storedDependencySignature,
              forceRefreshAI,
            )
          ) {
            asyncComputedValues[sheetId][cellId] =
              storageService.getCellComputedValue(sheetId, cellId);
            asyncDependenciesBySheet[sheetId][cellId] = storedDependencies;
            asyncProcessedEventIds[sheetId][cellId] =
              buildProcessedChannelEventIds(
                storedDependencies,
                channelPayloads,
              );
            continue;
          }
          const dependencyCollector = createDependencyCollector();
          const runtimeMeta = {};
          try {
            const computedValue = formulaEngine.evaluateCell(
              sheetId,
              cellId,
              {},
              {
                forceRefreshAI,
                channelPayloads,
                dependencyCollector,
                runtimeMeta,
              },
            );
            asyncDependenciesBySheet[sheetId][cellId] =
              dependencyCollector.snapshot();
            asyncComputedValues[sheetId][cellId] = computedValue;
            const dependencySignature = buildDependencySignature(
              storageService,
              asyncDependenciesBySheet[sheetId][cellId],
              channelPayloads,
            );
            storageService.setComputedCellValue(
              sheetId,
              cellId,
              computedValue,
              inferComputedCellState(
                storageService.getCellValue(sheetId, cellId),
                computedValue,
              ),
              '',
              {
                dependencySignature,
                ...(Object.prototype.hasOwnProperty.call(
                  runtimeMeta,
                  'displayValue',
                )
                  ? {
                      displayValue: String(
                        runtimeMeta.displayValue == null
                          ? ''
                          : runtimeMeta.displayValue,
                      ),
                    }
                  : {}),
              },
            );
            asyncProcessedEventIds[sheetId][cellId] =
              buildProcessedChannelEventIds(
                asyncDependenciesBySheet[sheetId][cellId],
                channelPayloads,
              );
            storageService.setCellRuntimeState(sheetId, cellId, {
              lastProcessedChannelEventIds:
                asyncProcessedEventIds[sheetId][cellId],
            });
          } catch (error) {
            const failure = classifyComputeFailure(error);
            asyncComputedValues[sheetId][cellId] = failure.value;
            asyncComputedErrors[sheetId][cellId] = failure.error;
            asyncDependenciesBySheet[sheetId][cellId] =
              dependencyCollector.snapshot();
            const dependencySignature = buildDependencySignature(
              storageService,
              asyncDependenciesBySheet[sheetId][cellId],
              channelPayloads,
            );
            storageService.setComputedCellValue(
              sheetId,
              cellId,
              failure.value,
              'error',
              failure.error,
              { dependencySignature },
            );
            asyncProcessedEventIds[sheetId][cellId] =
              buildProcessedChannelEventIds(
                asyncDependenciesBySheet[sheetId][cellId],
                channelPayloads,
              );
            storageService.setCellRuntimeState(sheetId, cellId, {
              lastProcessedChannelEventIds:
                asyncProcessedEventIds[sheetId][cellId],
            });
          }
        }
      }
      Object.keys(asyncDependenciesBySheet).forEach((sheetId) => {
        const sheetDeps = asyncDependenciesBySheet[sheetId] || {};
        Object.keys(sheetDeps).forEach((cellId) => {
          storageService.setCellDependencies(
            sheetId,
            cellId,
            sheetDeps[cellId],
          );
        });
      });
      rawStorage.markDependencyGraphAuthoritative(true, 'async-compute');
      saveSnapshot(
        asyncComputedValues,
        asyncComputedErrors,
        asyncProcessedEventIds,
      ).catch((error) => {
        console.error(
          '[sheet.compute] failed to persist async AI update',
          error,
        );
      });
    },
    {
      sheetDocumentId,
      getActiveSheetId: () => activeSheetId,
    },
  );

  const formulaEngine = new FormulaEngine(
    storageService,
    aiService,
    () => storageService.readTabs(),
    buildCellIds(invalidatedWorkbook),
  );

  const valuesBySheet = {};
  const errorsBySheet = {};
  const dependenciesBySheet = {};
  const processedEventIdsBySheet = {};
  const targetCellMap = forceRefreshAI
    ? null
    : buildTargetCellMap(workbookData, changedSignals);

  const evaluateWorkbook = () => {
    for (
      let sheetIndex = 0;
      sheetIndex < orderedSheetIds.length;
      sheetIndex += 1
    ) {
      const sheetId = orderedSheetIds[sheetIndex];
      const sheetValues = {};
      const sheetErrors = {};
      const sheetDependencies = {};
      const sheetProcessedEventIds = {};
      const evaluationPlan =
        typeof formulaEngine.buildEvaluationPlan === 'function'
          ? formulaEngine.buildEvaluationPlan(sheetId)
          : formulaEngine.cellIds;
      const targetCells =
        targetCellMap && targetCellMap[sheetId] ? targetCellMap[sheetId] : null;

      for (let i = 0; i < evaluationPlan.length; i += 1) {
        const cellId = evaluationPlan[i];
        if (targetCellMap && !targetCells?.[cellId]) {
          continue;
        }
        const storedDependencies = storageService.getCellDependencies(
          sheetId,
          cellId,
        );
        const storedDependencySignature = buildDependencySignature(
          storageService,
          storedDependencies,
          channelPayloads,
        );
        if (
          canReuseComputedCell(
            storageService,
            sheetId,
            cellId,
            storageService.getCellValue(sheetId, cellId),
            storedDependencySignature,
            forceRefreshAI,
          )
        ) {
          sheetValues[cellId] = storageService.getCellComputedValue(
            sheetId,
            cellId,
          );
          sheetDependencies[cellId] = storedDependencies;
          sheetProcessedEventIds[cellId] = buildProcessedChannelEventIds(
            storedDependencies,
            channelPayloads,
          );
          continue;
        }
        const dependencyCollector = createDependencyCollector();
        const runtimeMeta = {};
        try {
          const computedValue = formulaEngine.evaluateCell(
            sheetId,
            cellId,
            {},
            {
              forceRefreshAI,
              channelPayloads,
              dependencyCollector,
              runtimeMeta,
            },
          );
          sheetValues[cellId] = computedValue;
          sheetDependencies[cellId] = dependencyCollector.snapshot();
          sheetProcessedEventIds[cellId] = buildProcessedChannelEventIds(
            sheetDependencies[cellId],
            channelPayloads,
          );
          const dependencySignature = buildDependencySignature(
            storageService,
            sheetDependencies[cellId],
            channelPayloads,
          );
          storageService.setComputedCellValue(
            sheetId,
            cellId,
            computedValue,
            inferComputedCellState(
              storageService.getCellValue(sheetId, cellId),
              computedValue,
            ),
            '',
            {
              dependencySignature,
              ...(Object.prototype.hasOwnProperty.call(
                runtimeMeta,
                'displayValue',
              )
                ? {
                    displayValue: String(
                      runtimeMeta.displayValue == null
                        ? ''
                        : runtimeMeta.displayValue,
                    ),
                  }
                : {}),
            },
          );
          storageService.setCellRuntimeState(sheetId, cellId, {
            lastProcessedChannelEventIds: sheetProcessedEventIds[cellId],
          });
        } catch (error) {
          const failure = classifyComputeFailure(error);
          sheetValues[cellId] = failure.value;
          sheetErrors[cellId] = failure.error;
          sheetDependencies[cellId] = dependencyCollector.snapshot();
          sheetProcessedEventIds[cellId] = buildProcessedChannelEventIds(
            sheetDependencies[cellId],
            channelPayloads,
          );
          const dependencySignature = buildDependencySignature(
            storageService,
            sheetDependencies[cellId],
            channelPayloads,
          );
          storageService.setComputedCellValue(
            sheetId,
            cellId,
            failure.value,
            'error',
            failure.error,
            { dependencySignature },
          );
          storageService.setCellRuntimeState(sheetId, cellId, {
            lastProcessedChannelEventIds: sheetProcessedEventIds[cellId],
          });
        }
      }

      valuesBySheet[sheetId] = sheetValues;
      errorsBySheet[sheetId] = sheetErrors;
      dependenciesBySheet[sheetId] = sheetDependencies;
      processedEventIdsBySheet[sheetId] = sheetProcessedEventIds;
    }
  };

  if (manualTriggerAI) aiService.withManualTrigger(evaluateWorkbook);
  else evaluateWorkbook();

  if (Object.keys(valuesBySheet).length) {
    Object.keys(dependenciesBySheet).forEach((sheetId) => {
      const sheetDeps = dependenciesBySheet[sheetId] || {};
      Object.keys(sheetDeps).forEach((cellId) => {
        storageService.setCellDependencies(sheetId, cellId, sheetDeps[cellId]);
      });
    });
  }

  rawStorage.markDependencyGraphAuthoritative(true, 'compute');

  // Wait for pending AI requests to complete before returning.
  // Without this, AI cells return '...' placeholders and the client never
  // receives the actual result (onInvalidate persists to DB later, but the
  // RPC response has already been sent).
  const hadPendingAI =
    typeof aiService.hasPendingRequests === 'function' &&
    aiService.hasPendingRequests();
  if (hadPendingAI) {
    await aiService.waitForPendingRequests();

    // After waiting:
    // - OWN requests: onInvalidate already updated rawStorage with correct AI results.
    //   this.cache[cacheKey] has the answer, re-evaluation picks it up.
    // - SHARED requests (concurrent): SHARED_AI_RESULT_CACHE has the answer,
    //   loadCache() finds it, re-evaluation picks it up.
    //
    // Re-run evaluateWorkbook() so valuesBySheet gets the correct (non-'...') values.
    // This also ensures rawStorage is updated for shared-request cases.
    evaluateWorkbook();
    rawStorage.markDependencyGraphAuthoritative(true, 'compute');

    await saveSnapshot(valuesBySheet, errorsBySheet, processedEventIdsBySheet);
  } else {
    await saveSnapshot(valuesBySheet, errorsBySheet, processedEventIdsBySheet);
  }
  return {
    values: valuesBySheet[activeSheetId] || {},
    valuesBySheet,
    workbook: rawStorage.snapshot(),
  };
}
