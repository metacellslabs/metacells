import { defineModel } from '../../../lib/orm.js';
import { AppError } from '../../../lib/app-error.js';
import { check, Match } from '../../../lib/check.js';
import { registerMethods } from '../../../lib/rpc.js';
import {
  buildExplicitTargetCellMap,
  collectAffectedCellKeysFromSignals,
  computeSheetSnapshot,
  invalidateWorkbookDependencies,
  isDependencyGraphAuthoritative,
  rebuildWorkbookDependencyGraph,
} from './server/compute.js';
import {
  hydrateWorkbookAttachmentArtifacts,
  getArtifactText,
  stripWorkbookAttachmentInlineData,
} from '../artifacts/index.js';
import { decodeStorageMap } from './storage-codec.js';
import {
  buildClientWorkbookSnapshot,
  buildWorkbookFromFlatStorage,
  decodeSheetDocumentStorage,
  decodeWorkbookDocument,
  encodeWorkbookForDocument,
  flattenWorkbook,
} from './workbook-codec.js';
import {
  buildWorkbookCellPatchRecordFromCell,
  buildRuntimeCellSnapshotFromRecord,
  getCellSourceText,
  getWorkbookCellRecord,
  hasRuntimeCellFields,
  listWorkbookCellEntries,
  normalizeDocumentPersistCellRecord,
  normalizeRuntimeCellForDiffRecord,
} from './cell-record-helpers.js';
import {
  deleteWorkbookCellRecord,
  getWorkbookSheetRecord,
  listWorkbookSheetCellEntries,
  listWorkbookSheetIds,
  setWorkbookCellRecord,
} from './cell-snapshot-facade.js';
import {
  updateSheetDocumentFields,
  updateSheetRuntimeFields,
} from './sheet-update-helpers.js';
import {
  notifyQueuedSheetDependenciesChanged,
  registerAIQueueSheetRuntimeHooks,
  enqueueAIChatRequest,
} from '../ai/index.js';
import {
  extractChannelMentionLabels,
  formatChannelEventForPrompt,
  getChannelAttachmentLinkEntries,
  normalizeChannelLabel,
} from '../channels/mentioning.js';
import { getActiveChannelPayloadMap } from '../channels/runtime-state.js';
import {
  buildChannelAttachmentPath,
  ChannelEvents,
} from '../channels/events.js';
import { FormulaEngine } from '../../engine/formula-engine.js';
import { AIService } from '../../ui/metacell/runtime/ai-service.js';
import { StorageService } from '../../engine/storage-service.js';
import { WorkbookStorageAdapter } from '../../engine/workbook-storage-adapter.js';
import { buildAttachmentLinksMarkdown } from '../channels/mentioning.js';
import { createServerCellUpdateProfiler } from '../../lib/cell-update-profile.js';
import {
  buildComputedFinancialModelWorkbook,
  buildComputedFormulaTestWorkbook,
} from './formula-test-workbook.js';
import { publishWorkbookEvent } from './events/events-bus.js';
import { publishServerEvent } from '../../../server/ws-events.js';

export const Sheets = defineModel('sheets');

function publishSheetsEvent(type, payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  return publishServerEvent({
    type,
    scope: 'sheets',
    sheetId: String(source.sheetId || source._id || ''),
    payload: {
      sheetId: String(source.sheetId || source._id || ''),
      name: String(source.name || ''),
      createdAt: source.createdAt || null,
      updatedAt: source.updatedAt || null,
      runtimeUpdatedAt: source.runtimeUpdatedAt || null,
    },
  });
}

const isPlainObject = Match.Where((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Match.Error('Expected a plain object');
  }
  return true;
});

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function toWorkbookRevision(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value || '') : parsed.toISOString();
}

function getDocumentRevisionFromSheetDocument(sheetDocument) {
  return toWorkbookRevision(sheetDocument && sheetDocument.updatedAt);
}

function getRuntimeRevisionFromSheetDocument(sheetDocument) {
  return toWorkbookRevision(sheetDocument && sheetDocument.runtimeUpdatedAt);
}

function escapeRegex(value) {
  return String(value == null ? '' : value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripChannelMentionsFromPrompt(text) {
  return String(text == null ? '' : text)
    .replace(/(^|[^A-Za-z0-9_:/])\/([A-Za-z][A-Za-z0-9_-]*)\b/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function inferChannelFeedFilterMode(promptText) {
  const prompt = String(promptText || '').trim().toLowerCase();
  if (!prompt) return 'pass-through';
  if (
    /\b(only|include only|filter|matching|matches|if\b|when\b|where\b|unless|exclude|skip|payment request|invoice|urgent|overdue|requirement|criteria)\b/.test(
      prompt,
    )
  ) {
    return 'ai-filter';
  }
  return 'pass-through';
}

function inferChannelFeedExpectedFields(promptText) {
  const prompt = String(promptText || '').trim().toLowerCase();
  const fields = [];
  const add = (name, meaning) => {
    if (!name) return;
    if (fields.some((item) => item && item.name === name)) return;
    fields.push({ name, meaning });
  };

  add('summary', 'Short human-readable summary of the matching event');

  if (/\b(payment request|invoice|billing|pay|overdue|amount|bank|iban)\b/.test(prompt)) {
    add('requestType', 'Type of payment-related request, such as invoice or payment reminder');
    add('amount', 'Requested amount if present');
    add('currency', 'Currency code or symbol if present');
    add('dueDate', 'Due date if mentioned');
    add('invoiceNumber', 'Invoice or billing reference if present');
    add('counterparty', 'Sender, vendor, or customer requesting payment');
    add('reason', 'Why the event matched the payment-related criteria');
  }

  if (/\b(urgent|priority|asap|immediately|important|critical)\b/.test(prompt)) {
    add('priority', 'Priority level inferred from the message');
    add('urgencyReason', 'Why the message should be treated as urgent');
    add('deadline', 'Deadline or time sensitivity if mentioned');
  }

  if (/\b(action item|todo|task|follow up|follow-up|next step)\b/.test(prompt)) {
    add('actionItem', 'Concrete next action extracted from the event');
    add('owner', 'Likely owner or responsible person if identifiable');
    add('deadline', 'Deadline for the action if present');
    add('status', 'Initial task status such as new or pending');
  }

  if (/\b(lead|prospect|sales|deal|opportunity)\b/.test(prompt)) {
    add('company', 'Company or account name');
    add('contact', 'Primary contact name or email if present');
    add('stage', 'Sales stage or inferred opportunity stage');
    add('interest', 'What the lead is interested in');
  }

  if (/\b(support|incident|bug|issue|ticket|complaint)\b/.test(prompt)) {
    add('issueType', 'Type of issue or support request');
    add('severity', 'Severity or impact level');
    add('customer', 'Customer or reporter');
    add('product', 'Affected product or area if present');
  }

  if (/\b(meeting|call|appointment|schedule)\b/.test(prompt)) {
    add('meetingDate', 'Meeting or appointment date');
    add('meetingTime', 'Meeting or appointment time');
    add('participants', 'Participants if present');
    add('location', 'Meeting location or link');
  }

  if (!fields.some((item) => item.name === 'reason')) {
    add('reason', 'Why the event matched or was included');
  }

  return fields;
}

function buildChannelFeedDecisionSystemPrompt(task) {
  const filterMode =
    task && typeof task.filterMode === 'string' ? task.filterMode : 'pass-through';
  const expectedFields =
    task && Array.isArray(task.expectedFields) ? task.expectedFields : [];
  const guidance =
    filterMode === 'ai-filter'
      ? 'Set include=true only when the event clearly matches the requested filter or criteria. Set include=false when it does not match.'
      : 'Set include=true for any event that produces a useful output. Set include=false only when the event is irrelevant or produces no meaningful result.';
  return [
    'You are processing one channel event for a MetaCells channel-feed formula.',
    'Return JSON only.',
    'Schema: {"include":boolean,"value":"string","attributes":object}.',
    guidance,
    'value must be the row text that should be written into the spill region when include=true.',
    'attributes should contain any structured labels, extracted facts, or classification fields that you inferred from the event.',
    expectedFields.length
      ? `When the event matches, include these attribute fields when possible: ${expectedFields
          .map((field) => `${field.name} (${field.meaning})`)
          .join(', ')}.`
      : 'When the event matches, return the most relevant structured attributes for the event in attributes.',
    expectedFields.length
      ? `Shape value as a compact row summary that prioritizes: ${expectedFields
          .map((field) => field.name)
          .join(', ')}.`
      : 'Shape value as a compact row summary of the event.',
    'Do not include markdown fences or extra prose.',
  ].join(' ');
}

function parseChannelFeedDecisionResponse(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    return { include: false, value: '', attributes: {} };
  }
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      return {
        include:
          Object.prototype.hasOwnProperty.call(parsed || {}, 'include')
            ? parsed.include !== false
            : !!String(parsed && (parsed.value || parsed.message || '')).trim(),
        value: String(
          parsed && (parsed.value ?? parsed.message ?? parsed.response ?? ''),
        ).trim(),
        attributes:
          parsed && parsed.attributes && typeof parsed.attributes === 'object'
            ? parsed.attributes
            : {},
      };
    } catch (error) {}
  }
  return {
    include: true,
    value: raw,
    attributes: {},
  };
}

function buildChannelFeedWindowStart(days) {
  const totalDays = Math.max(1, parseInt(days, 10) || 1);
  if (totalDays <= 1) return startOfToday();
  const now = new Date();
  return new Date(now.getTime() - (totalDays - 1) * 24 * 60 * 60 * 1000);
}

async function hydrateChannelEventForPrompt(doc) {
  const eventDoc = doc && typeof doc === 'object' ? doc : null;
  if (!eventDoc) return null;

  const attachments = Array.isArray(eventDoc.attachments)
    ? await Promise.all(
        eventDoc.attachments.map(async (item, index) => {
          const attachmentId = String(
            item && (item.id || item.attachmentId)
              ? item.id || item.attachmentId
              : `legacy-${index}`,
          );
          const content =
            item && item.contentArtifactId
              ? await getArtifactText(String(item.contentArtifactId || ''))
              : String((item && item.content) || '');
          return {
            ...(item && typeof item === 'object' ? item : {}),
            id: attachmentId,
            downloadUrl: buildChannelAttachmentPath(
              eventDoc._id || '',
              attachmentId,
            ),
            content: content,
          };
        }),
      )
    : [];

  return {
    ...eventDoc,
    _id: String(eventDoc._id || ''),
    eventId: String(eventDoc._id || ''),
    label: String(eventDoc.label || ''),
    attachments,
  };
}

async function loadChannelEventsForWindow(label, days, afterCreatedAt) {
  const target = normalizeChannelLabel(label);
  if (!target) return [];

  const selector = {
    label: new RegExp(`^${escapeRegex(target)}$`, 'i'),
    createdAt: {
      $gte: buildChannelFeedWindowStart(days),
    },
  };
  if (afterCreatedAt instanceof Date) {
    selector.createdAt.$gt = afterCreatedAt;
  }

  const docs = await ChannelEvents.find(selector, {
    sort: { createdAt: 1, _id: 1 },
  }).fetchAsync();
  return Promise.all(docs.map((doc) => hydrateChannelEventForPrompt(doc)));
}

async function normalizeSheetDocument(sheetId) {
  const sheetDocument = await Sheets.findOneAsync(
    { _id: sheetId },
    {
      fields: {
        name: 1,
        workbook: 1,
        runtimeWorkbook: 1,
        runtimeUpdatedAt: 1,
        storage: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
  );
  if (!sheetDocument) return null;

  const existingWorkbook =
    sheetDocument.workbook && typeof sheetDocument.workbook === 'object'
      ? decodeWorkbookDocument(sheetDocument.workbook)
      : null;
  const legacyStorage =
    sheetDocument.storage && typeof sheetDocument.storage === 'object'
      ? decodeStorageMap(sheetDocument.storage)
      : null;

  let workbook = null;
  if (legacyStorage && Object.keys(legacyStorage).length) {
    workbook = buildWorkbookFromFlatStorage(legacyStorage, existingWorkbook);
  } else if (existingWorkbook) {
    workbook = existingWorkbook;
  } else {
    workbook = buildWorkbookFromFlatStorage(
      decodeSheetDocumentStorage(sheetDocument),
      null,
    );
  }

  const encodedWorkbook = encodeWorkbookForDocument(
    stripDependencyGraphFromDocumentWorkbook(workbook, 'document-persist'),
  );
  const shouldUpdateWorkbook =
    JSON.stringify(sheetDocument.workbook || null) !==
    JSON.stringify(encodedWorkbook);
  const shouldUnsetStorage = typeof sheetDocument.storage !== 'undefined';
  const normalizedUpdatedAt =
    shouldUpdateWorkbook || shouldUnsetStorage
      ? sheetDocument.updatedAt || new Date()
      : sheetDocument.updatedAt;

  if (shouldUpdateWorkbook || shouldUnsetStorage) {
    await updateSheetDocumentFields(sheetId, {
      set: {
        workbook: encodedWorkbook,
        updatedAt: normalizedUpdatedAt,
      },
      unset: {
        storage: '',
      },
    });
  }

  return {
    ...sheetDocument,
    workbook: encodedWorkbook,
    updatedAt: normalizedUpdatedAt,
    runtimeUpdatedAt: sheetDocument.runtimeUpdatedAt || null,
  };
}

function mergeRuntimeWorkbook(documentWorkbookValue, runtimeWorkbookValue) {
  const documentWorkbook = decodeWorkbookDocument(documentWorkbookValue || {});
  const runtimeWorkbook = decodeWorkbookDocument(runtimeWorkbookValue || {});
  const mergedWorkbook = decodeWorkbookDocument(documentWorkbook);

  listWorkbookSheetIds(runtimeWorkbook).forEach((sheetId) => {
    listWorkbookSheetCellEntries(runtimeWorkbook, sheetId).forEach(
      ({ cellId, cell: runtimeCell }) => {
      const runtimeCellWithoutSource = { ...runtimeCell };
      delete runtimeCellWithoutSource.source;
      const previousCell =
        getWorkbookCellRecord(mergedWorkbook, sheetId, cellId) || {};
      setWorkbookCellRecord(mergedWorkbook, sheetId, cellId, {
        ...previousCell,
        ...runtimeCellWithoutSource,
      });
    });
  });

  if (
    runtimeWorkbook.dependencyGraph &&
    typeof runtimeWorkbook.dependencyGraph === 'object'
  ) {
    mergedWorkbook.dependencyGraph = runtimeWorkbook.dependencyGraph;
  }
  mergedWorkbook.caches = {
    ...(documentWorkbook.caches || {}),
    ...(runtimeWorkbook.caches || {}),
  };
  mergedWorkbook.globals = {
    ...(documentWorkbook.globals || {}),
    ...(runtimeWorkbook.globals || {}),
  };
  return mergedWorkbook;
}

function getMergedWorkbookFromSheetDocument(sheetDocument) {
  if (!sheetDocument || typeof sheetDocument !== 'object') {
    return decodeWorkbookDocument({});
  }
  return mergeRuntimeWorkbook(
    sheetDocument.workbook || {},
    sheetDocument.runtimeWorkbook || {},
  );
}

function createEmptyRuntimeDependencyGraph(reason) {
  return {
    byCell: {},
    dependentsByCell: {},
    dependentsByNamedRef: {},
    dependentsByChannel: {},
    dependentsByAttachment: {},
    meta: {
      authoritative: false,
      version: 1,
      repairedAt: '',
      reason: String(reason || 'runtime-snapshot'),
    },
  };
}

function stripDependencyGraphFromDocumentWorkbook(workbookValue, reason) {
  const workbook = decodeWorkbookDocument(workbookValue || {});
  const nextWorkbook = decodeWorkbookDocument(workbook);
  nextWorkbook.dependencyGraph = createEmptyRuntimeDependencyGraph(
    reason || 'document-normalize',
  );
  return nextWorkbook;
}

function buildRuntimeWorkbookSnapshot(workbookValue) {
  const workbook = decodeWorkbookDocument(workbookValue || {});
  const nextWorkbook = {
    version: workbook.version,
    sheets: {},
    dependencyGraph:
      workbook.dependencyGraph && typeof workbook.dependencyGraph === 'object'
        ? workbook.dependencyGraph
        : createEmptyRuntimeDependencyGraph('runtime-snapshot'),
    caches: {
      ...(workbook.caches || {}),
    },
    globals: {
      ...(workbook.globals || {}),
    },
  };

  listWorkbookSheetIds(workbook).forEach((sheetId) => {
    listWorkbookSheetCellEntries(workbook, sheetId).forEach(({ cellId, cell }) => {
      if (!hasRuntimeCellFields(cell)) return;
      const runtimeCell = buildRuntimeCellSnapshotFromRecord(cell);
      if (!runtimeCell) return;
      setWorkbookCellRecord(nextWorkbook, sheetId, cellId, runtimeCell);
    });
  });

  return nextWorkbook;
}

async function migrateAllSheetsToWorkbook() {
  const docs = await Sheets.find({}, { fields: { _id: 1 } }).fetchAsync();
  let migrated = 0;

  for (let i = 0; i < docs.length; i += 1) {
    const before = await Sheets.findOneAsync(
      { _id: docs[i]._id },
      { fields: { workbook: 1, storage: 1 } },
    );
    await normalizeSheetDocument(docs[i]._id);
    const after = await Sheets.findOneAsync(
      { _id: docs[i]._id },
      { fields: { workbook: 1, storage: 1 } },
    );

    const hadLegacyStorage = !!(
      before && typeof before.storage !== 'undefined'
    );
    const createdWorkbook = !before?.workbook && !!after?.workbook;
    const changedWorkbook =
      JSON.stringify(before?.workbook || null) !==
      JSON.stringify(after?.workbook || null);
    if (hadLegacyStorage || createdWorkbook || changedWorkbook) {
      migrated += 1;
    }
  }

  return {
    total: docs.length,
    migrated,
  };
}

async function rebuildSheetDependencyGraph(sheetId) {
  const sheetDocument = await normalizeSheetDocument(sheetId);
  if (!sheetDocument) return null;

  const workbook = getMergedWorkbookFromSheetDocument(sheetDocument);
  const rebuiltWorkbook = rebuildWorkbookDependencyGraph(workbook);
  const persistedAt = new Date();
  await updateSheetRuntimeFields(sheetId, {
    set: {
      runtimeWorkbook: encodeWorkbookForDocument(
        buildRuntimeWorkbookSnapshot(rebuiltWorkbook),
      ),
      runtimeUpdatedAt: persistedAt,
    },
    unset: {
      storage: '',
    },
  });

  return rebuiltWorkbook;
}

async function rebuildAllSheetDependencyGraphs() {
  const docs = await Sheets.find({}, { fields: { _id: 1 } }).fetchAsync();
  let rebuilt = 0;

  for (let i = 0; i < docs.length; i += 1) {
    const nextWorkbook = await rebuildSheetDependencyGraph(docs[i]._id);
    if (nextWorkbook) rebuilt += 1;
  }

  return {
    total: docs.length,
    rebuilt,
  };
}

function collectChangedDependencySignals(previousWorkbook, nextWorkbook) {
  const before = flattenWorkbook(previousWorkbook);
  const after = flattenWorkbook(nextWorkbook);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes = [];
  const namedRefChanges = {};

  keys.forEach((key) => {
    const prevValue = Object.prototype.hasOwnProperty.call(before, key)
      ? before[key]
      : undefined;
    const nextValue = Object.prototype.hasOwnProperty.call(after, key)
      ? after[key]
      : undefined;
    if (prevValue === nextValue) return;

    const cellMatch = /^SHEET:([^:]+):CELL:([A-Za-z]+[0-9]+)$/.exec(
      String(key || ''),
    );
    if (cellMatch) {
      changes.push({
        kind: 'cell',
        sheetId: cellMatch[1],
        cellId: String(cellMatch[2]).toUpperCase(),
      });
      return;
    }

    const generatedCellMatch =
      /^SHEET:([^:]+):CELL_GEN_SOURCE:([A-Za-z]+[0-9]+)$/.exec(
        String(key || ''),
      );
    if (generatedCellMatch) {
      changes.push({
        kind: 'cell',
        sheetId: generatedCellMatch[1],
        cellId: String(generatedCellMatch[2]).toUpperCase(),
      });
      return;
    }

    if (String(key) === 'NAMED_CELLS') {
      const previousNamedCells =
        previousWorkbook &&
        previousWorkbook.namedCells &&
        typeof previousWorkbook.namedCells === 'object'
          ? previousWorkbook.namedCells
          : {};
      const nextNamedCells =
        nextWorkbook &&
        nextWorkbook.namedCells &&
        typeof nextWorkbook.namedCells === 'object'
          ? nextWorkbook.namedCells
          : {};
      const allNames = new Set([
        ...Object.keys(previousNamedCells),
        ...Object.keys(nextNamedCells),
      ]);
      allNames.forEach((name) => {
        if (
          JSON.stringify(previousNamedCells[name] || null) ===
          JSON.stringify(nextNamedCells[name] || null)
        )
          return;
        namedRefChanges[String(name)] = true;
      });
    }
  });

  Object.keys(namedRefChanges).forEach((name) => {
    changes.push({ kind: 'named-ref', name });
  });

  return changes;
}

function mergeWorkbookDocument(persistedWorkbookValue, clientWorkbookValue) {
  const persistedWorkbook = decodeWorkbookDocument(
    persistedWorkbookValue || {},
  );
  const clientWorkbook = decodeWorkbookDocument(clientWorkbookValue || {});
  const mergedWorkbook = decodeWorkbookDocument(persistedWorkbookValue || {});

  const normalizeMergedDocumentCell = (previousCellValue, mergedCellValue) => {
    const previousCell =
      previousCellValue && typeof previousCellValue === 'object'
        ? previousCellValue
        : {};
    const mergedCell =
      mergedCellValue && typeof mergedCellValue === 'object' ? mergedCellValue : {};
    const source = String(mergedCell.source || '');
    const previousSource = String(previousCell.source || '');
    const sourceChanged = source !== previousSource;
    const isFormula = !!source && /^[='>#]/.test(source);
    const nextSourceVersion = sourceChanged
      ? Math.max(
          1,
          (Number(previousCell.sourceVersion) ||
            Number(previousCell.version) ||
            0) + 1,
        )
      : Math.max(
          1,
          Number(mergedCell.sourceVersion) ||
            Number(previousCell.sourceVersion) ||
            Number(mergedCell.version) ||
            Number(previousCell.version) ||
            1,
        );

    if (!sourceChanged) {
      return {
        ...mergedCell,
        sourceVersion: nextSourceVersion,
        version: nextSourceVersion,
      };
    }

    if (isFormula) {
      return {
        ...mergedCell,
        sourceVersion: nextSourceVersion,
        version: nextSourceVersion,
        value: '',
        displayValue: '',
        state: 'stale',
        error: '',
        generatedBy: '',
        lastProcessedChannelEventIds: {},
        channelFeedMeta: null,
        computedVersion: 0,
        dependencyVersion: 0,
        dependencySignature: '',
      };
    }

    return {
      ...mergedCell,
      sourceVersion: nextSourceVersion,
      version: nextSourceVersion,
      value: source,
      displayValue: source,
      state: source ? 'resolved' : '',
      error: '',
      generatedBy: '',
      lastProcessedChannelEventIds: {},
      channelFeedMeta: null,
      computedVersion: nextSourceVersion,
      dependencyVersion: nextSourceVersion,
      dependencySignature: '',
    };
  };

  mergedWorkbook.tabs = Array.isArray(clientWorkbook.tabs)
    ? clientWorkbook.tabs
    : persistedWorkbook.tabs;
  mergedWorkbook.activeTabId = String(
    clientWorkbook.activeTabId || persistedWorkbook.activeTabId || '',
  );
  mergedWorkbook.aiMode = clientWorkbook.aiMode || persistedWorkbook.aiMode;
  mergedWorkbook.namedCells = {
    ...(persistedWorkbook.namedCells || {}),
    ...(clientWorkbook.namedCells || {}),
  };
  mergedWorkbook.sheets = {
    ...(persistedWorkbook.sheets || {}),
  };

  listWorkbookSheetIds(clientWorkbook).forEach((sheetId) => {
    const persistedSheet = getWorkbookSheetRecord(persistedWorkbook, sheetId);
    const clientSheet = getWorkbookSheetRecord(clientWorkbook, sheetId);
    const mergedSheet = {
      ...(persistedSheet && typeof persistedSheet === 'object'
        ? persistedSheet
        : {}),
      ...(clientSheet && typeof clientSheet === 'object' ? clientSheet : {}),
      cells: {},
      columnWidths:
        clientSheet && clientSheet.columnWidths && typeof clientSheet.columnWidths === 'object'
          ? { ...clientSheet.columnWidths }
          : persistedSheet &&
              persistedSheet.columnWidths &&
              typeof persistedSheet.columnWidths === 'object'
            ? { ...persistedSheet.columnWidths }
            : {},
      rowHeights:
        clientSheet && clientSheet.rowHeights && typeof clientSheet.rowHeights === 'object'
          ? { ...clientSheet.rowHeights }
          : persistedSheet &&
              persistedSheet.rowHeights &&
              typeof persistedSheet.rowHeights === 'object'
            ? { ...persistedSheet.rowHeights }
            : {},
      reportContent: String(
        (clientSheet && clientSheet.reportContent) ||
          (persistedSheet && persistedSheet.reportContent) ||
          '',
      ),
    };
    mergedWorkbook.sheets[sheetId] = mergedSheet;

    listWorkbookSheetCellEntries(mergedWorkbook, sheetId).forEach(({ cellId }) => {
      deleteWorkbookCellRecord(mergedWorkbook, sheetId, cellId);
    });

    listWorkbookSheetCellEntries(clientWorkbook, sheetId).forEach(
      ({ cellId, cell: clientCell }) => {
        const previousCell =
          getWorkbookCellRecord(persistedWorkbook, sheetId, cellId) || {};
        setWorkbookCellRecord(
          mergedWorkbook,
          sheetId,
          cellId,
          normalizeMergedDocumentCell(previousCell, {
            ...previousCell,
            ...(clientCell && typeof clientCell === 'object' ? clientCell : {}),
          }),
        );
      },
    );
  });

  mergedWorkbook.caches = {
    ...(persistedWorkbook.caches || {}),
    ...(clientWorkbook.caches || {}),
  };
  mergedWorkbook.globals = {
    ...(persistedWorkbook.globals || {}),
    ...(clientWorkbook.globals || {}),
  };

  mergedWorkbook.dependencyGraph = {
    byCell: {},
    dependentsByCell: {},
    dependentsByNamedRef: {},
    dependentsByChannel: {},
    dependentsByAttachment: {},
    meta: {
      authoritative: false,
      version: 1,
      repairedAt: '',
      reason: 'merged-snapshots',
    },
  };
  return mergedWorkbook;
}

function stripWorkbookRuntimeStateForDocumentPersist(workbookValue) {
  const workbook = decodeWorkbookDocument(workbookValue || {});
  const nextWorkbook = decodeWorkbookDocument(workbook);

  listWorkbookCellEntries(nextWorkbook).forEach(({ sheetId, cellId, cell }) => {
    const normalized = normalizeDocumentPersistCellRecord(cell);
    if (!normalized) {
      deleteWorkbookCellRecord(nextWorkbook, sheetId, cellId);
      return;
    }
    setWorkbookCellRecord(nextWorkbook, sheetId, cellId, normalized);
  });

  nextWorkbook.dependencyGraph = {
    byCell: {},
    dependentsByCell: {},
    dependentsByNamedRef: {},
    dependentsByChannel: {},
    dependentsByAttachment: {},
    meta: {
      authoritative: false,
      version: 1,
      repairedAt: '',
      reason: 'document-persist',
    },
  };
  return nextWorkbook;
}

export function workbookMentionsChannel(workbookValue, channelLabel) {
  const workbook = decodeWorkbookDocument(workbookValue || {});
  const target = normalizeChannelLabel(channelLabel);
  if (!target) return false;

  return listWorkbookCellEntries(workbook).some(({ cell }) => {
      const source = getCellSourceText(cell);
      if (!source) return false;
      const labels = extractChannelMentionLabels(source);
      return labels.indexOf(target) !== -1;
  });
}

function stripJsonFences(text) {
  const source = String(text == null ? '' : text).trim();
  if (!source) return '';
  const fenced = source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? String(fenced[1] || '').trim() : source;
}

function parseBatchAIResponse(text) {
  return JSON.parse(stripJsonFences(text));
}

function buildChannelBatchSystemPrompt() {
  return [
    'Return only valid JSON.',
    'Return a JSON array with one item per jobId.',
    'Do not include markdown, prose, or code fences.',
    'Each object must include jobId and formulaKind.',
    'For ask formulas return {"jobId":"...","formulaKind":"ask","value":"..."}.',
    'For list formulas return {"jobId":"...","formulaKind":"list","items":["..."]}.',
    'For table formulas return {"jobId":"...","formulaKind":"table","rows":[["..."]]}',
    'Keep every provided jobId exactly unchanged.',
  ].join(' ');
}

function collectChannelBatchTasks(
  sheetDocumentId,
  workbook,
  channelLabel,
  channelPayloads,
  options = {},
) {
  const adapter = new WorkbookStorageAdapter(workbook);
  const storageService = new StorageService(adapter);
  const aiService = new AIService(storageService, () => {}, {
    sheetDocumentId,
    getActiveSheetId: () => '',
  });
  const formulaEngine = new FormulaEngine(
    storageService,
    aiService,
    () => storageService.readTabs(),
    [],
  );
  const target = normalizeChannelLabel(channelLabel);
  const historyOnly = !!(options && options.historyOnly);
  const tasks = [];
  listWorkbookSheetIds(workbook).forEach((sheetId) => {
    listWorkbookSheetCellEntries(workbook, sheetId).forEach(({ cellId, cell }) => {
      const source = getCellSourceText(cell);
      if (!source) return;
      const channelFeedSpec =
        source.charAt(0) === '#'
          ? formulaEngine.parseChannelFeedPromptSpec(source)
          : null;
      const listSpec =
        source.charAt(0) === '>'
          ? formulaEngine.parseListShortcutSpec(source)
          : null;
      const formulaKind = channelFeedSpec
        ? 'channel-feed'
        : source.charAt(0) === "'"
          ? 'ask'
          : source.charAt(0) === '>'
            ? 'list'
            : source.charAt(0) === '#'
              ? 'table'
              : '';
      if (!formulaKind) return;
      if (historyOnly && formulaKind !== 'channel-feed') return;
      if (
        formulaKind === 'channel-feed' &&
        normalizeChannelLabel(
          channelFeedSpec &&
            Array.isArray(channelFeedSpec.labels) &&
            channelFeedSpec.labels.length
            ? channelFeedSpec.labels[0]
            : '',
        ) !== target
      ) {
        return;
      }
      if (extractChannelMentionLabels(source).indexOf(target) === -1) return;

      let promptTemplate = '';
      let count = null;
      let colsLimit = null;
      let rowsLimit = null;
      let days = null;
      let includeAttachments = false;
      if (formulaKind === 'ask') {
        const askSpec =
          typeof formulaEngine.parseFormulaDisplayPlaceholder === 'function'
            ? formulaEngine.parseFormulaDisplayPlaceholder(source.substring(1))
            : { content: source.substring(1) };
        promptTemplate = formulaEngine.normalizeQueuedPromptTemplate(
          askSpec && askSpec.content ? askSpec.content : source.substring(1),
        );
      } else if (formulaKind === 'list') {
        promptTemplate = listSpec && listSpec.prompt ? listSpec.prompt : '';
        count = 5;
        includeAttachments = !!(listSpec && listSpec.includeAttachments);
      } else if (formulaKind === 'channel-feed') {
        promptTemplate =
          channelFeedSpec && channelFeedSpec.prompt ? channelFeedSpec.prompt : '';
        days = channelFeedSpec && channelFeedSpec.days ? channelFeedSpec.days : 1;
        includeAttachments = !!(
          channelFeedSpec && channelFeedSpec.includeAttachments
        );
      } else if (formulaKind === 'table') {
        const spec = formulaEngine.parseTablePromptSpec(source);
        promptTemplate = spec && spec.prompt ? spec.prompt : '';
        colsLimit = spec && spec.cols ? spec.cols : null;
        rowsLimit = spec && spec.rows ? spec.rows : null;
      }
      if (!promptTemplate) return;

      const prepared = formulaEngine.prepareAIPrompt(
        sheetId,
        promptTemplate,
        {},
        { channelPayloads, includeChannelAttachments: includeAttachments },
      );
      tasks.push({
        jobId: `${sheetId}:${String(cellId || '').toUpperCase()}:${formulaKind}`,
        sheetId,
        cellId: String(cellId || '').toUpperCase(),
        formulaKind,
        promptTemplate,
        prompt: prepared.userPrompt,
        systemPrompt: prepared.systemPrompt,
        attachmentLinks: Array.isArray(prepared.attachmentLinks)
          ? prepared.attachmentLinks
          : [],
        count,
        colsLimit,
        rowsLimit,
        days,
        includeAttachments,
        filterMode:
          formulaKind === 'channel-feed'
            ? inferChannelFeedFilterMode(promptTemplate)
            : 'pass-through',
        expectedFields:
          formulaKind === 'channel-feed'
            ? inferChannelFeedExpectedFields(promptTemplate)
            : [],
      });
    });
  });

  return { tasks, storageService, formulaEngine };
}

async function runChannelBatchForWorkbook({
  sheetDocumentId,
  workbook,
  channelLabel,
  channelPayloads,
  historyOnly = false,
}) {
  const collected = collectChannelBatchTasks(
    sheetDocumentId,
    workbook,
    channelLabel,
    channelPayloads,
    { historyOnly },
  );
  const tasks = collected.tasks;
  if (!tasks.length) return workbook;

  const target = normalizeChannelLabel(channelLabel);
  const storageService = collected.storageService;
  const formulaEngine = collected.formulaEngine;
  const currentPayload =
    channelPayloads && channelPayloads[target] ? channelPayloads[target] : null;
  const currentEventId =
    currentPayload && (currentPayload.eventId || currentPayload._id)
      ? String(currentPayload.eventId || currentPayload._id)
      : '';
  const batchedTasks = tasks.filter((task) => task.formulaKind !== 'channel-feed');
  const feedTasks = tasks.filter((task) => task.formulaKind === 'channel-feed');

  if (batchedTasks.length) {
    const messages = [];
    const uniqueSystemPrompts = batchedTasks
    .map((task) => String(task.systemPrompt || '').trim())
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);
    if (uniqueSystemPrompts.length) {
      messages.push({
        role: 'system',
        content: uniqueSystemPrompts.join('\n\n'),
      });
    }
    messages.push({ role: 'system', content: buildChannelBatchSystemPrompt() });
    messages.push({
      role: 'user',
      content: JSON.stringify(
        batchedTasks.map((task) => ({
          jobId: task.jobId,
          formulaKind: task.formulaKind,
          prompt: task.prompt,
          count: task.count,
          colsLimit: task.colsLimit,
          rowsLimit: task.rowsLimit,
        })),
      ),
    });

    const responseText = await enqueueAIChatRequest(
      messages,
      {
        sheetDocumentId,
        activeSheetId: '',
        sourceCellId: `channel-batch:${target}`,
        formulaKind: 'channel-batch',
        queueIdentity: `${sheetDocumentId}:channel-batch:${target}`,
        dependencies: [{ kind: 'channel', label: target }],
      },
      { timeoutMs: 180000 },
    );

    const parsed = parseBatchAIResponse(responseText);
    const byJobId = {};
    (Array.isArray(parsed) ? parsed : []).forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const jobId = String(item.jobId || '');
      if (!jobId) return;
      byJobId[jobId] = item;
    });

    batchedTasks.forEach((task) => {
      const item = byJobId[task.jobId];
      if (!item) return;
      const previousProcessed =
        storageService.getCellProcessedChannelEventIds(
          task.sheetId,
          task.cellId,
        ) || {};
      const shouldAppend = !!(
        previousProcessed[target] &&
        currentEventId &&
        previousProcessed[target] !== currentEventId
      );

      if (task.formulaKind === 'ask') {
        let value = String(item.value == null ? '' : item.value);
        const markdown = buildAttachmentLinksMarkdown(task.attachmentLinks);
        if (markdown) {
          value = value ? `${value}\n\n${markdown}` : markdown;
        }
        storageService.setComputedCellValue(
          task.sheetId,
          task.cellId,
          value,
          'resolved',
          '',
        );
      } else if (task.formulaKind === 'list') {
        const values = Array.isArray(item.items)
          ? item.items
              .map((entry) => String(entry == null ? '' : entry))
              .filter((entry) => entry.trim() !== '')
          : [];
        formulaEngine.spillMatrixToSheet(
          task.sheetId,
          task.cellId,
          values.map((value) => [value]),
          {
            preserveSourceCell: true,
            appendBelowExisting: shouldAppend,
          },
        );
        if (!shouldAppend) {
          storageService.clearGeneratedCellsBySource(task.sheetId, task.cellId);
          formulaEngine.fillUnderneathCells(
            task.sheetId,
            task.cellId,
            values,
            0,
          );
        } else {
          const source = formulaEngine.parseCellId(task.cellId);
          const existing =
            storageService.listGeneratedCellsBySource(
              task.sheetId,
              task.cellId,
            ) || [];
          let maxRow = source ? source.row : 0;
          existing.forEach((cellId) => {
            const parsedCell = formulaEngine.parseCellId(cellId);
            if (parsedCell && parsedCell.row > maxRow) maxRow = parsedCell.row;
          });
          const colLabel = source
            ? formulaEngine.columnIndexToLabel(source.col)
            : 'A';
          for (let i = 0; i < values.length; i += 1) {
            const targetCellId = `${colLabel}${maxRow + i + 1}`;
            storageService.setCellValue(task.sheetId, targetCellId, values[i], {
              generatedBy: task.cellId,
            });
          }
        }
      } else if (task.formulaKind === 'table') {
        const rows = Array.isArray(item.rows) ? item.rows : [];
        formulaEngine.spillMatrixToSheet(task.sheetId, task.cellId, rows, {
          preserveSourceCell: true,
          appendBelowExisting: shouldAppend,
        });
      }

      storageService.setCellRuntimeState(task.sheetId, task.cellId, {
        state: 'resolved',
        error: '',
        lastProcessedChannelEventIds: currentEventId
          ? { [target]: currentEventId }
          : {},
      });
    });
  }

  for (let index = 0; index < feedTasks.length; index += 1) {
    const task = feedTasks[index];
    const previousProcessed =
      storageService.getCellProcessedChannelEventIds(task.sheetId, task.cellId) ||
      {};
    const previousEventId = String(previousProcessed[target] || '');
    let previousCreatedAt = null;
    if (previousEventId) {
      const previousDoc = await ChannelEvents.findOneAsync(
        { _id: previousEventId },
        { fields: { createdAt: 1 } },
      );
      if (previousDoc && previousDoc.createdAt instanceof Date) {
        previousCreatedAt = previousDoc.createdAt;
      }
    }

    const shouldAppend = !!previousCreatedAt;
    const eventDocs = await loadChannelEventsForWindow(
      target,
      task.days,
      shouldAppend ? previousCreatedAt : null,
    );
    console.log('[channel-feed] task.start', {
      sheetDocumentId,
      channelLabel: target,
      sheetId: task.sheetId,
      cellId: task.cellId,
      days: task.days,
      filterMode: task.filterMode,
      shouldAppend,
      events: eventDocs.length,
    });
    const values = [];
    let latestProcessedEventId = previousEventId;
    let lastDecisionAttributes = {};
    let lastDecisionValue = '';
    let lastEvaluatedEventId = previousEventId;
    let lastIncludedEventId = previousEventId;

    for (let eventIndex = 0; eventIndex < eventDocs.length; eventIndex += 1) {
      const eventPayload = eventDocs[eventIndex];
      if (!eventPayload) continue;
      const taskPrompt = stripChannelMentionsFromPrompt(task.promptTemplate);
      if (!taskPrompt) continue;
      const prepared = formulaEngine.prepareAIPrompt(
        task.sheetId,
        taskPrompt,
        {},
        { includeChannelAttachments: !!task.includeAttachments },
      );
      const eventText = formatChannelEventForPrompt(eventPayload, {
        includeAttachments: !!task.includeAttachments,
      });
      const finalPrompt = [
        `Task: ${prepared.userPrompt || taskPrompt}`,
        '',
        'Channel event:',
        eventText,
      ]
        .filter((part) => String(part || '').trim() !== '')
        .join('\n')
        .trim();
      if (!finalPrompt) continue;
      const responseText = await enqueueAIChatRequest(
        [
          {
            role: 'system',
            content: buildChannelFeedDecisionSystemPrompt(task),
          },
          ...(prepared.systemPrompt
            ? [{ role: 'system', content: String(prepared.systemPrompt) }]
            : []),
          {
            role: 'user',
            content: finalPrompt,
          },
        ],
        {
          sheetDocumentId,
          activeSheetId: task.sheetId,
          sourceCellId: task.cellId,
          formulaKind: 'channel-feed',
          queueIdentity: `${sheetDocumentId}:channel-feed:${task.sheetId}:${task.cellId}:${String(eventPayload._id || '')}`,
          dependencies: [{ kind: 'channel', label: target }],
        },
        { timeoutMs: 180000 },
      );
      const decision = parseChannelFeedDecisionResponse(responseText);
      const eventId = String(eventPayload.eventId || eventPayload._id || '');
      lastEvaluatedEventId = eventId || lastEvaluatedEventId;
      lastDecisionAttributes =
        decision && decision.attributes && typeof decision.attributes === 'object'
          ? decision.attributes
          : {};
      lastDecisionValue = String(
        decision && decision.value ? decision.value : '',
      ).trim();
      if (decision.include !== true || !lastDecisionValue) {
        console.log('[channel-feed] task.skip', {
          sheetDocumentId,
          sheetId: task.sheetId,
          cellId: task.cellId,
          eventId,
          filterMode: task.filterMode,
          attributes: lastDecisionAttributes,
        });
        latestProcessedEventId = eventId || latestProcessedEventId;
        continue;
      }
      const markdown = buildAttachmentLinksMarkdown(
        getChannelAttachmentLinkEntries(eventPayload, {
          includeAttachments: !!task.includeAttachments,
        }),
      );
      const value = markdown
        ? `${String(responseText || '').trim()}\n\n${markdown}`.trim()
        : String(responseText || '').trim();
      if (!value) continue;
      values.push(value);
      console.log('[channel-feed] task.value', {
        sheetDocumentId,
        sheetId: task.sheetId,
        cellId: task.cellId,
        eventId: String(eventPayload.eventId || eventPayload._id || ''),
        preview: value.slice(0, 160),
      });
      latestProcessedEventId = String(
        eventPayload.eventId || eventPayload._id || latestProcessedEventId || '',
      );
    }

    if (!shouldAppend) {
      formulaEngine.spillMatrixToSheet(
        task.sheetId,
        task.cellId,
        values.map((value) => [value]),
        {
          preserveSourceCell: true,
        },
      );
      console.log('[channel-feed] task.write.replace', {
        sheetDocumentId,
        sheetId: task.sheetId,
        cellId: task.cellId,
        rows: values.length,
        generated: storageService.listGeneratedCellsBySource(
          task.sheetId,
          task.cellId,
        ),
      });
    } else if (values.length) {
      const previousGenerated =
        storageService.listGeneratedCellsBySource(task.sheetId, task.cellId) || [];
      formulaEngine.spillMatrixToSheet(
        task.sheetId,
        task.cellId,
        values.map((value) => [value]),
        {
          preserveSourceCell: true,
          appendBelowExisting: true,
        },
      );
      const nextGenerated =
        storageService.listGeneratedCellsBySource(task.sheetId, task.cellId) || [];
      const writtenIds = nextGenerated.filter(
        (cellId) => previousGenerated.indexOf(cellId) === -1,
      );
      console.log('[channel-feed] task.write.append', {
        sheetDocumentId,
        sheetId: task.sheetId,
        cellId: task.cellId,
        rows: values.length,
        writtenIds,
      });
    }

    storageService.setCellRuntimeState(task.sheetId, task.cellId, {
      state: 'resolved',
      error: '',
      lastProcessedChannelEventIds: latestProcessedEventId
        ? { [target]: latestProcessedEventId }
        : {},
      channelFeedMeta: {
        filterMode: String(task.filterMode || 'pass-through'),
        decisionMode: 'ai-envelope',
        promptTemplate: String(task.promptTemplate || ''),
        lastDecisionAt: new Date().toISOString(),
        lastEvaluatedEventId: String(lastEvaluatedEventId || ''),
        lastIncludedEventId: String(lastIncludedEventId || ''),
        lastValuePreview: String(lastDecisionValue || '').slice(0, 500),
        lastAttributes: lastDecisionAttributes,
      },
    });
  }

  return storageService.storage &&
    typeof storageService.storage.snapshot === 'function'
    ? storageService.storage.snapshot()
    : workbook;
}

export async function recomputeSheetsMentioningChannel(channelLabel) {
  const target = normalizeChannelLabel(channelLabel);
  if (!target) {
    return { matched: 0, recomputed: 0 };
  }

  const channelPayloads = await getActiveChannelPayloadMap();
  const docs = await Sheets.find(
    {},
    { fields: { workbook: 1, runtimeWorkbook: 1 } },
  ).fetchAsync();
  let matched = 0;
  let recomputed = 0;

  for (let i = 0; i < docs.length; i += 1) {
    const doc = docs[i];
    const workbook = getMergedWorkbookFromSheetDocument(doc);
    if (!workbookMentionsChannel(workbook, target)) continue;
    matched += 1;

    const tabs = Array.isArray(workbook.tabs) ? workbook.tabs : [];
    const defaultActiveSheetId =
      String(workbook.activeTabId || '') ||
      String(
        (tabs.find((tab) => tab && tab.type === 'sheet') || {}).id || 'sheet-1',
      );

    const computeResult = await computeSheetSnapshot({
      sheetDocumentId: doc._id,
      workbookData: workbook,
      activeSheetId: defaultActiveSheetId,
      channelPayloads,
      changedSignals: [{ kind: 'channel', label: target }],
      persistWorkbook: async (nextWorkbook) => {
        const persistedAt = new Date();
        await updateSheetRuntimeFields(doc._id, {
          set: {
            runtimeWorkbook: encodeWorkbookForDocument(
              buildRuntimeWorkbookSnapshot(
                stripWorkbookAttachmentInlineData(
                  decodeWorkbookDocument(nextWorkbook),
                ),
              ),
            ),
            runtimeUpdatedAt: persistedAt,
          },
          unset: {
            storage: '',
          },
        });
      },
    });
    const nextWorkbook = await runChannelBatchForWorkbook({
      sheetDocumentId: doc._id,
      workbook:
        computeResult && computeResult.workbook
          ? computeResult.workbook
          : workbook,
      channelLabel: target,
      channelPayloads,
    });
    const persistedAt = new Date();
    await updateSheetRuntimeFields(doc._id, {
      set: {
        runtimeWorkbook: encodeWorkbookForDocument(
          buildRuntimeWorkbookSnapshot(
            stripWorkbookAttachmentInlineData(
              decodeWorkbookDocument(nextWorkbook),
            ),
          ),
        ),
        runtimeUpdatedAt: persistedAt,
      },
      unset: {
        storage: '',
      },
    });
    recomputed += 1;
  }

  return { matched, recomputed };
}

registerAIQueueSheetRuntimeHooks({
  loadSheetDocumentStorage: async (sheetId) => {
    const sheetDocument = await normalizeSheetDocument(sheetId);
    if (!sheetDocument) return null;
    return hydrateWorkbookAttachmentArtifacts(
      getMergedWorkbookFromSheetDocument(sheetDocument),
    );
  },
});

async function syncWorkbookSchedulesAfterPersist(payload, logMessage) {
  try {
    const module = await import('../schedules/index.js');
    if (
      module &&
      typeof module.syncWorkbookSchedulesOnSave === 'function'
    ) {
      await module.syncWorkbookSchedulesOnSave(payload);
    }
  } catch (error) {
    console.error(logMessage, error);
  }
}

async function removeWorkbookSchedulesAfterDelete(sheetId) {
  try {
    const module = await import('../schedules/index.js');
    if (
      module &&
      typeof module.removeWorkbookSchedulesAndJobs === 'function'
    ) {
      await module.removeWorkbookSchedulesAndJobs(sheetId);
    }
  } catch (error) {
    console.error('Failed to remove workbook schedules during delete', error);
  }
}

function buildChangedCellIdsForSheet(workbook, activeSheetId, changedSignals) {
  const normalizedSheetId = String(activeSheetId || '');
  if (!normalizedSheetId) return [];
  const affected = collectAffectedCellKeysFromSignals(workbook, changedSignals);
  if (!affected) return [];
  return Object.keys(affected)
    .map((cellKey) => {
      const separatorIndex = cellKey.indexOf(':');
      if (separatorIndex === -1) return '';
      const sheetId = cellKey.slice(0, separatorIndex);
      const cellId = cellKey.slice(separatorIndex + 1);
      return sheetId === normalizedSheetId ? String(cellId || '').toUpperCase() : '';
    })
    .filter(Boolean);
}

function publishWorkbookDocumentUpdatedEvent({
  sheetDocumentId,
  activeSheetId,
  revision,
  documentRevision = '',
  runtimeRevision = '',
  changedCellIds = [],
  channelLabel = '',
  cellPatchBySheet = null,
}) {
  publishWorkbookEvent({
    type: 'workbook.document.updated',
    sheetDocumentId,
    activeSheetId,
    revision: String(revision || documentRevision || runtimeRevision || ''),
    documentRevision: String(documentRevision || ''),
    runtimeRevision: String(runtimeRevision || ''),
    changedCellIds,
    cellPatchBySheet,
  });
}

function publishWorkbookRuntimeUpdatedEvent({
  sheetDocumentId,
  activeSheetId,
  revision,
  documentRevision = '',
  runtimeRevision = '',
  changedCellIds = [],
  pendingCellIds = [],
  cellPatchBySheet = null,
  channelLabel = '',
}) {
  publishWorkbookEvent({
    type: 'workbook.runtime.updated',
    sheetDocumentId,
    activeSheetId,
    revision: String(runtimeRevision || revision || documentRevision || ''),
    documentRevision: String(documentRevision || ''),
    runtimeRevision: String(runtimeRevision || ''),
    changedCellIds,
    pendingCellIds: Array.isArray(pendingCellIds) ? pendingCellIds : [],
    cellPatchBySheet,
    channelLabel: String(channelLabel || ''),
  });
}

function buildWorkbookCellPatchRecord(workbook, sheetId, cellId) {
  const normalizedSheetId = String(sheetId || '');
  const normalizedCellId = String(cellId || '').toUpperCase();
  if (!normalizedSheetId || !normalizedCellId) return null;
  const cell = getWorkbookCellRecord(workbook, normalizedSheetId, normalizedCellId);
  return buildWorkbookCellPatchRecordFromCell(cell);
}

function normalizeRuntimeCellForDiff(cellValue) {
  return normalizeRuntimeCellForDiffRecord(cellValue);
}

function collectChangedRuntimeCellIdsForSheet(
  previousWorkbook,
  nextWorkbook,
  activeSheetId,
) {
  const normalizedSheetId = String(activeSheetId || '');
  if (!normalizedSheetId) return [];
  const cellIds = new Set(
    [
      ...listWorkbookSheetCellEntries(previousWorkbook, normalizedSheetId),
      ...listWorkbookSheetCellEntries(nextWorkbook, normalizedSheetId),
    ].map((entry) => String((entry && entry.cellId) || '').toUpperCase()),
  );

  return Array.from(cellIds)
    .filter(Boolean)
    .filter((cellId) => {
      const before = normalizeRuntimeCellForDiff(
        getWorkbookCellRecord(previousWorkbook, normalizedSheetId, cellId),
      );
      const after = normalizeRuntimeCellForDiff(
        getWorkbookCellRecord(nextWorkbook, normalizedSheetId, cellId),
      );
      return JSON.stringify(before) !== JSON.stringify(after);
    });
}

function buildCellPatchBySheet(workbook, sheetId, changedCellIds = []) {
  const normalizedSheetId = String(sheetId || '');
  const normalizedCellIds = Array.isArray(changedCellIds)
    ? changedCellIds
        .map((cellId) => String(cellId || '').toUpperCase())
        .filter(Boolean)
    : [];
  if (!normalizedSheetId || !normalizedCellIds.length) return null;
  const sheetPatch = {};
  normalizedCellIds.forEach((cellId) => {
    const patch = buildWorkbookCellPatchRecord(workbook, normalizedSheetId, cellId);
    if (!patch) return;
    sheetPatch[cellId] = patch;
  });
  if (!Object.keys(sheetPatch).length) return null;
  return {
    [normalizedSheetId]: sheetPatch,
  };
}

export async function initSheets() {
  return undefined;
}

registerMethods({
  async 'sheets.list'() {
    return Sheets.find(
      {},
      {
        fields: { name: 1, createdAt: 1, updatedAt: 1 },
        sort: { updatedAt: -1, createdAt: -1 },
      },
    ).fetchAsync();
  },

  async 'sheets.one'(sheetId) {
    check(sheetId, String);

    const sheetDocument = await normalizeSheetDocument(sheetId);
    if (!sheetDocument) return null;
    return {
      ...sheetDocument,
      workbook: encodeWorkbookForDocument(
        getMergedWorkbookFromSheetDocument(sheetDocument),
      ),
      documentRevision: getDocumentRevisionFromSheetDocument(sheetDocument),
      runtimeRevision: getRuntimeRevisionFromSheetDocument(sheetDocument),
    };
  },

  async 'sheets.create'(name) {
    check(name, Match.Maybe(String));

    const now = new Date();
    const count = (await Sheets.find().countAsync()) + 1;
    const sheetName = String(name || '').trim() || `Metacell ${count}`;
    const workbook = buildWorkbookFromFlatStorage({});

    const sheetId = await Sheets.insertAsync({
      name: sheetName,
      workbook: encodeWorkbookForDocument(workbook),
      runtimeWorkbook: encodeWorkbookForDocument({}),
      createdAt: now,
      updatedAt: now,
      runtimeUpdatedAt: null,
    });
    publishSheetsEvent('sheets.created', {
      sheetId,
      name: sheetName,
      createdAt: now,
      updatedAt: now,
    });
    return sheetId;
  },

  async 'sheets.createFormulaTestWorkbook'(name) {
    check(name, Match.Maybe(String));

    const now = new Date();
    const workbook = await buildComputedFormulaTestWorkbook();
    const sheetName = String(name || '').trim() || 'Formula Test Bench';

    const sheetId = await Sheets.insertAsync({
      name: sheetName,
      workbook: encodeWorkbookForDocument(workbook),
      runtimeWorkbook: encodeWorkbookForDocument({}),
      createdAt: now,
      updatedAt: now,
      runtimeUpdatedAt: null,
    });
    publishSheetsEvent('sheets.created', {
      sheetId,
      name: sheetName,
      createdAt: now,
      updatedAt: now,
    });
    return sheetId;
  },

  async 'sheets.createFinancialModelWorkbook'(name) {
    check(name, Match.Maybe(String));

    const now = new Date();
    const workbook = await buildComputedFinancialModelWorkbook();
    const sheetName =
      String(name || '').trim() || 'AI Startup Financial Model';

    const sheetId = await Sheets.insertAsync({
      name: sheetName,
      workbook: encodeWorkbookForDocument(workbook),
      runtimeWorkbook: encodeWorkbookForDocument({}),
      createdAt: now,
      updatedAt: now,
      runtimeUpdatedAt: null,
    });
    publishSheetsEvent('sheets.created', {
      sheetId,
      name: sheetName,
      createdAt: now,
      updatedAt: now,
    });
    return sheetId;
  },

  async 'sheets.rename'(sheetId, name) {
    check(sheetId, String);
    check(name, String);

    const nextName = String(name || '').trim();
    if (!nextName) {
      throw new AppError('invalid-name', 'Workbook name is required');
    }

    await updateSheetDocumentFields(sheetId, {
      set: {
        name: nextName,
        updatedAt: new Date(),
      },
    });
    publishSheetsEvent('sheets.renamed', {
      sheetId,
      name: nextName,
      updatedAt: new Date(),
    });
  },

  async 'sheets.remove'(sheetId) {
    check(sheetId, String);
    const existing = await Sheets.findOneAsync(
      { _id: sheetId },
      { fields: { name: 1, createdAt: 1, updatedAt: 1 } },
    );
    await removeWorkbookSchedulesAfterDelete(sheetId);
    await Sheets.removeAsync({ _id: sheetId });
    publishSheetsEvent('sheets.removed', {
      sheetId,
      name: String((existing && existing.name) || ''),
      createdAt: existing && existing.createdAt ? existing.createdAt : null,
      updatedAt: new Date(),
    });
  },

  async 'sheets.migrateAllToWorkbook'() {
    return migrateAllSheetsToWorkbook();
  },

  async 'sheets.rebuildDependencyGraph'(sheetId) {
    check(sheetId, String);
    const workbook = await rebuildSheetDependencyGraph(sheetId);
    if (!workbook) {
      throw new AppError('not-found', 'Workbook not found');
    }
    return { rebuilt: true };
  },

  async 'sheets.rebuildAllDependencyGraphs'() {
    return rebuildAllSheetDependencyGraphs();
  },

  async 'sheets.saveWorkbook'(sheetId, workbook, options) {
    check(sheetId, String);
    check(workbook, isPlainObject);
    check(options, Match.Maybe(isPlainObject));

    const clientWorkbook = buildClientWorkbookSnapshot(workbook);
    const sheetDocument = await normalizeSheetDocument(sheetId);
    if (!sheetDocument) {
      throw new AppError('not-found', 'Workbook not found');
    }
    const currentRevision = getDocumentRevisionFromSheetDocument(sheetDocument);
    const currentRuntimeRevision =
      getRuntimeRevisionFromSheetDocument(sheetDocument);
    const expectedRevision = String(
      options && typeof options === 'object' ? options.expectedRevision || '' : '',
    );
    if (expectedRevision && currentRevision && expectedRevision !== currentRevision) {
      throw new AppError('conflict', 'Workbook changed on the server', {
        revision: currentRevision,
        documentRevision: currentRevision,
        runtimeRevision: currentRuntimeRevision,
        expectedRevision,
      });
    }
    const previousWorkbook = decodeWorkbookDocument(
      (sheetDocument && sheetDocument.workbook) || {},
    );
    const nextWorkbook = mergeWorkbookDocument(previousWorkbook, clientWorkbook);
    const changes = collectChangedDependencySignals(
      previousWorkbook,
      nextWorkbook,
    );
    const invalidatedWorkbook = decodeWorkbookDocument(
      invalidateWorkbookDependencies(nextWorkbook, changes),
    );
    const repairedWorkbook = rebuildWorkbookDependencyGraph(invalidatedWorkbook);
    const persistedWorkbook =
      stripWorkbookAttachmentInlineData(
        stripWorkbookRuntimeStateForDocumentPersist(repairedWorkbook),
      );

    const persistedAt = new Date();
    await updateSheetDocumentFields(sheetId, {
      set: {
        workbook: encodeWorkbookForDocument(persistedWorkbook),
        updatedAt: persistedAt,
      },
      unset: {
        storage: '',
        runtimeWorkbook: '',
        runtimeUpdatedAt: '',
      },
    });

    if (changes.length) {
      await notifyQueuedSheetDependenciesChanged(sheetId, changes);
    }
    publishWorkbookDocumentUpdatedEvent({
      sheetDocumentId: sheetId,
      activeSheetId: '',
      revision: toWorkbookRevision(persistedAt),
      documentRevision: toWorkbookRevision(persistedAt),
      runtimeRevision: '',
      changedCellIds: [],
    });
    await syncWorkbookSchedulesAfterPersist(
      {
        sheetDocumentId: sheetId,
        previousWorkbook,
        nextWorkbook: persistedWorkbook,
      },
      'Failed to sync workbook schedules after save',
    );
    return {
      revision: toWorkbookRevision(persistedAt),
      documentRevision: toWorkbookRevision(persistedAt),
      runtimeRevision: '',
    };
  },

  async 'sheets.computeGrid'(sheetId, activeSheetId, options) {
    check(sheetId, String);
    check(activeSheetId, String);
    check(options, Match.Maybe(isPlainObject));
    const profiler = createServerCellUpdateProfiler(
      options && options.traceId ? options.traceId : '',
      {
        sheetId,
        activeSheetId,
      },
    );
    if (profiler) profiler.step('computeGrid.start');
    const includeWorkbookSnapshot = !!(
      options &&
      typeof options === 'object' &&
      options.includeWorkbookSnapshot
    );

    const sheetDocument = await normalizeSheetDocument(sheetId);
    if (profiler) profiler.step('normalize.done');

    if (!sheetDocument) {
      throw new AppError('not-found', 'Workbook not found');
    }

    const persistedWorkbook = getMergedWorkbookFromSheetDocument(sheetDocument);
    const documentRevision = getDocumentRevisionFromSheetDocument(sheetDocument);
    let runtimeRevision = getRuntimeRevisionFromSheetDocument(sheetDocument);
    const expectedRevision = String(
      options && typeof options === 'object' ? options.expectedRevision || '' : '',
    );
    if (expectedRevision && documentRevision && expectedRevision !== documentRevision) {
      throw new AppError('conflict', 'Workbook changed on the server', {
        revision: documentRevision,
        documentRevision,
        runtimeRevision,
      });
    }
    const requestWorkbookDocumentSnapshot =
      options &&
      options.workbookSnapshot &&
      typeof options.workbookSnapshot === 'object'
        ? buildClientWorkbookSnapshot(options.workbookSnapshot)
        : null;
    const sourceWorkbook = requestWorkbookDocumentSnapshot
      ? mergeWorkbookDocument(
          persistedWorkbook,
          requestWorkbookDocumentSnapshot,
        )
      : persistedWorkbook;
    if (profiler) profiler.step('merge.done');
    const repairedWorkbook = isDependencyGraphAuthoritative(sourceWorkbook)
      ? sourceWorkbook
      : rebuildWorkbookDependencyGraph(sourceWorkbook);
    if (profiler)
      profiler.step('graph_repair.done', {
        repaired: !isDependencyGraphAuthoritative(sourceWorkbook),
      });
    const hydratedWorkbook =
      await hydrateWorkbookAttachmentArtifacts(repairedWorkbook);
    if (profiler) profiler.step('hydrate.done');
    const channelPayloads = await getActiveChannelPayloadMap();
    if (profiler) profiler.step('channel_payloads.done');
    const changedSignals = collectChangedDependencySignals(
      persistedWorkbook,
      sourceWorkbook,
    );
    const explicitTargetCellMap =
      options &&
      Array.isArray(options.targetCellIds) &&
      options.targetCellIds.length
        ? buildExplicitTargetCellMap(activeSheetId, options.targetCellIds)
        : null;

    const result = await computeSheetSnapshot({
      sheetDocumentId: sheetId,
      workbookData: hydratedWorkbook,
      activeSheetId,
      reloadWorkbookData: async () => {
        const latestSheetDocument = await Sheets.findOneAsync(
          { _id: sheetId },
          { fields: { workbook: 1, runtimeWorkbook: 1 } },
        );
        const latestMergedWorkbook = getMergedWorkbookFromSheetDocument(
          latestSheetDocument,
        );
        const latestSourceWorkbook = requestWorkbookDocumentSnapshot
          ? mergeWorkbookDocument(
              latestMergedWorkbook,
              requestWorkbookDocumentSnapshot,
            )
          : latestMergedWorkbook;
        return hydrateWorkbookAttachmentArtifacts(
          latestSourceWorkbook,
        );
      },
      channelPayloads,
      forceRefreshAI: !!(options && options.forceRefreshAI),
      manualTriggerAI: !!(options && options.manualTriggerAI),
      changedSignals,
      explicitTargetCellMap,
      persistWorkbook: async (nextWorkbook) => {
        const normalizedNextWorkbook = decodeWorkbookDocument(nextWorkbook);
        const latestSheetDocument = await Sheets.findOneAsync(
          { _id: sheetId },
          { fields: { workbook: 1, runtimeWorkbook: 1, updatedAt: 1, runtimeUpdatedAt: 1 } },
        );
        const latestPersistedRevision = toWorkbookRevision(
          latestSheetDocument && latestSheetDocument.updatedAt,
        );
        if (
          latestPersistedRevision &&
          documentRevision &&
          latestPersistedRevision !== documentRevision
        ) {
          throw new AppError('conflict', 'Workbook changed during compute', {
            revision: latestPersistedRevision,
            documentRevision: latestPersistedRevision,
            runtimeRevision: getRuntimeRevisionFromSheetDocument(latestSheetDocument),
          });
        }
        const latestPersistedWorkbook =
          getMergedWorkbookFromSheetDocument(latestSheetDocument);
        const changes = collectChangedDependencySignals(
          latestPersistedWorkbook,
          normalizedNextWorkbook,
        );
        const changedRuntimeCellIds = collectChangedRuntimeCellIdsForSheet(
          latestPersistedWorkbook,
          normalizedNextWorkbook,
          activeSheetId,
        );
        const persistedNextWorkbook = buildRuntimeWorkbookSnapshot(
          stripWorkbookAttachmentInlineData(normalizedNextWorkbook),
        );
        if (profiler)
          profiler.step('persist.start', { changes: changes.length });
        const persistedAt = new Date();
        await updateSheetRuntimeFields(sheetId, {
          set: {
            runtimeWorkbook: encodeWorkbookForDocument(persistedNextWorkbook),
            runtimeUpdatedAt: persistedAt,
          },
          unset: {
            storage: '',
          },
        });
        runtimeRevision = toWorkbookRevision(persistedAt);
        if (changes.length) {
          await notifyQueuedSheetDependenciesChanged(sheetId, changes);
        }
        publishWorkbookRuntimeUpdatedEvent({
          sheetDocumentId: sheetId,
          activeSheetId,
          revision: runtimeRevision,
          documentRevision,
          runtimeRevision,
          changedCellIds: changedRuntimeCellIds,
          cellPatchBySheet: buildCellPatchBySheet(
            normalizedNextWorkbook,
            activeSheetId,
            changedRuntimeCellIds,
          ),
          channelLabel: changes.some((change) => change && change.kind === 'channel')
            ? String(
                (changes.find((change) => change && change.kind === 'channel') || {})
                  .label || '',
              )
            : '',
        });
        await syncWorkbookSchedulesAfterPersist(
          {
            sheetDocumentId: sheetId,
            previousWorkbook: sourceWorkbook,
            nextWorkbook: normalizedNextWorkbook,
          },
          'Failed to sync workbook schedules after compute persist',
        );
        if (profiler)
          profiler.step('persist.done', { changes: changes.length });
      },
    });
    const nextWorkbookAfterChannelHistory =
      result && result.workbook
        ? await (async () => {
            const mentionedLabels = [
              ...new Set(
                listWorkbookCellEntries(
                  decodeWorkbookDocument(result.workbook || {}),
                )
                  .flatMap(({ cell }) =>
                    extractChannelMentionLabels(getCellSourceText(cell)),
                  )
                  .map((label) => normalizeChannelLabel(label))
                  .filter(Boolean),
              ),
            ];
            let nextWorkbook = result.workbook;
            for (let i = 0; i < mentionedLabels.length; i += 1) {
              nextWorkbook = await runChannelBatchForWorkbook({
                sheetDocumentId: sheetId,
                workbook: nextWorkbook,
                channelLabel: mentionedLabels[i],
                channelPayloads,
                historyOnly: true,
              });
            }
            return nextWorkbook;
          })()
        : result && result.workbook;
    if (nextWorkbookAfterChannelHistory && result) {
      const previousWorkbookBeforeChannelHistory = decodeWorkbookDocument(
        result.workbook || {},
      );
      result.workbook = nextWorkbookAfterChannelHistory;
      const persistedAt = new Date();
      await updateSheetRuntimeFields(sheetId, {
        set: {
          runtimeWorkbook: encodeWorkbookForDocument(
            buildRuntimeWorkbookSnapshot(
              stripWorkbookAttachmentInlineData(
                decodeWorkbookDocument(result.workbook),
              ),
            ),
          ),
          runtimeUpdatedAt: persistedAt,
        },
        unset: {
          storage: '',
        },
      });
      runtimeRevision = toWorkbookRevision(persistedAt);
      publishWorkbookRuntimeUpdatedEvent({
        sheetDocumentId: sheetId,
        activeSheetId,
        revision: runtimeRevision,
        documentRevision,
        runtimeRevision,
        changedCellIds: [],
        cellPatchBySheet: null,
      });
      await syncWorkbookSchedulesAfterPersist(
        {
          sheetDocumentId: sheetId,
          previousWorkbook: previousWorkbookBeforeChannelHistory,
          nextWorkbook: result.workbook,
        },
        'Failed to sync workbook schedules after channel history persist',
      );
    }
    if (profiler)
      profiler.step('compute.done', {
        values:
          result && result.values ? Object.keys(result.values).length : 0,
      });

    const workbookChangeSignals =
      result && result.workbook
        ? collectChangedDependencySignals(sourceWorkbook, result.workbook)
        : [];
    const changedCellIds =
      result && result.workbook
        ? collectChangedRuntimeCellIdsForSheet(
            sourceWorkbook,
            result.workbook,
            activeSheetId,
          )
        : result && result.values
          ? Object.keys(result.values)
              .map((cellId) => String(cellId || '').toUpperCase())
              .filter(Boolean)
          : [];
    const runtimePatchBySheet =
      result && result.workbook && changedCellIds.length
        ? buildCellPatchBySheet(
            result.workbook,
            activeSheetId,
            changedCellIds,
          )
        : null;

    if (result && result.values && changedCellIds.length) {
      const pendingCellIds = changedCellIds.filter((cellId) => {
        const value = String(result.values[cellId] == null ? '' : result.values[cellId]);
        return value === '...' || value === '(manual: click Update)';
      });
      publishWorkbookRuntimeUpdatedEvent({
        sheetDocumentId: sheetId,
        activeSheetId,
        revision: String(runtimeRevision || documentRevision || ''),
        documentRevision,
        runtimeRevision,
        pendingCellIds,
        changedCellIds,
        cellPatchBySheet: runtimePatchBySheet,
      });
    }

    if (result && result.workbook) {
      result.workbook = stripWorkbookAttachmentInlineData(result.workbook);
    }
    if (result && typeof result === 'object') {
      result.revision = String(runtimeRevision || documentRevision || '');
      result.documentRevision = documentRevision;
      result.runtimeRevision = String(runtimeRevision || '');
      result.changedCellIds = changedCellIds;
      result.runtimePatchBySheet = runtimePatchBySheet;
      if (!includeWorkbookSnapshot && Object.prototype.hasOwnProperty.call(result, 'workbook')) {
        delete result.workbook;
      }
    }
    if (profiler) profiler.step('computeGrid.done');

    return result;
  },

  async 'sheets.getSyncState'(sheetId) {
    check(sheetId, String);
    const sheetDocument = await Sheets.findOneAsync(
      { _id: sheetId },
      { fields: { updatedAt: 1, runtimeUpdatedAt: 1 } },
    );
    if (!sheetDocument) {
      throw new AppError('not-found', 'Workbook not found');
    }
    return {
      documentRevision: getDocumentRevisionFromSheetDocument(sheetDocument),
      runtimeRevision: getRuntimeRevisionFromSheetDocument(sheetDocument),
    };
  },
});
