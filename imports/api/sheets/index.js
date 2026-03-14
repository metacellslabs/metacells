import { Mongo } from 'meteor/mongo';
import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import {
  computeSheetSnapshot,
  invalidateWorkbookDependencies,
  isDependencyGraphAuthoritative,
  rebuildWorkbookDependencyGraph,
} from './server/compute';
import {
  hydrateWorkbookAttachmentArtifacts,
  getArtifactText,
  stripWorkbookAttachmentInlineData,
} from '../artifacts/index.js';
import { decodeStorageMap } from './storage-codec';
import {
  buildWorkbookFromFlatStorage,
  decodeSheetDocumentStorage,
  decodeWorkbookDocument,
  encodeWorkbookForDocument,
  flattenWorkbook,
} from './workbook-codec';
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

export const Sheets = new Mongo.Collection('sheets');

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

function escapeRegex(value) {
  return String(value == null ? '' : value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripChannelMentionsFromPrompt(text) {
  return String(text == null ? '' : text)
    .replace(/(^|[^A-Za-z0-9_:/])\/([A-Za-z][A-Za-z0-9_-]*)\b/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
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
    { fields: { workbook: 1, storage: 1 } },
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

  if (!isDependencyGraphAuthoritative(workbook)) {
    workbook = rebuildWorkbookDependencyGraph(workbook);
  }

  const encodedWorkbook = encodeWorkbookForDocument(workbook);
  const shouldUpdateWorkbook =
    JSON.stringify(sheetDocument.workbook || null) !==
    JSON.stringify(encodedWorkbook);
  const shouldUnsetStorage = typeof sheetDocument.storage !== 'undefined';

  if (shouldUpdateWorkbook || shouldUnsetStorage) {
    await Sheets.updateAsync(
      { _id: sheetId },
      {
        $set: {
          workbook: encodedWorkbook,
          updatedAt: new Date(),
        },
        $unset: {
          storage: '',
        },
      },
    );
  }

  return {
    ...sheetDocument,
    workbook: encodedWorkbook,
  };
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

  const workbook = decodeWorkbookDocument(sheetDocument.workbook || {});
  const rebuiltWorkbook = rebuildWorkbookDependencyGraph(workbook);
  await Sheets.updateAsync(
    { _id: sheetId },
    {
      $set: {
        workbook: encodeWorkbookForDocument(rebuiltWorkbook),
        updatedAt: new Date(),
      },
      $unset: {
        storage: '',
      },
    },
  );

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

function mergeWorkbookForCompute(persistedWorkbookValue, clientWorkbookValue) {
  const persistedWorkbook = decodeWorkbookDocument(
    persistedWorkbookValue || {},
  );
  const clientWorkbook = decodeWorkbookDocument(clientWorkbookValue || {});
  const mergedWorkbook = decodeWorkbookDocument(
    clientWorkbookValue || persistedWorkbookValue || {},
  );

  mergedWorkbook.caches = {
    ...(persistedWorkbook.caches || {}),
    ...(clientWorkbook.caches || {}),
  };
  mergedWorkbook.globals = {
    ...(persistedWorkbook.globals || {}),
    ...(clientWorkbook.globals || {}),
  };

  const persistedDependencyGraph =
    persistedWorkbook.dependencyGraph &&
    typeof persistedWorkbook.dependencyGraph === 'object'
      ? persistedWorkbook.dependencyGraph
      : {
          byCell: {},
          dependentsByCell: {},
          dependentsByNamedRef: {},
          dependentsByChannel: {},
          dependentsByAttachment: {},
        };
  const clientDependencyGraph =
    clientWorkbook.dependencyGraph &&
    typeof clientWorkbook.dependencyGraph === 'object'
      ? clientWorkbook.dependencyGraph
      : {
          byCell: {},
          dependentsByCell: {},
          dependentsByNamedRef: {},
          dependentsByChannel: {},
          dependentsByAttachment: {},
        };
  const persistedByCell =
    persistedDependencyGraph.byCell &&
    typeof persistedDependencyGraph.byCell === 'object'
      ? persistedDependencyGraph.byCell
      : {};
  const clientByCell =
    clientDependencyGraph.byCell &&
    typeof clientDependencyGraph.byCell === 'object'
      ? clientDependencyGraph.byCell
      : {};
  mergedWorkbook.dependencyGraph = {
    byCell: {
      ...persistedByCell,
      ...clientByCell,
    },
    dependentsByCell:
      clientDependencyGraph.dependentsByCell ||
      persistedDependencyGraph.dependentsByCell ||
      {},
    dependentsByNamedRef:
      clientDependencyGraph.dependentsByNamedRef ||
      persistedDependencyGraph.dependentsByNamedRef ||
      {},
    dependentsByChannel:
      clientDependencyGraph.dependentsByChannel ||
      persistedDependencyGraph.dependentsByChannel ||
      {},
    dependentsByAttachment:
      clientDependencyGraph.dependentsByAttachment ||
      persistedDependencyGraph.dependentsByAttachment ||
      {},
    meta: {
      authoritative: false,
      version: 1,
      repairedAt: '',
      reason: 'merged-snapshots',
    },
  };

  const sheetIds = new Set([
    ...Object.keys(persistedWorkbook.sheets || {}),
    ...Object.keys(clientWorkbook.sheets || {}),
  ]);

  sheetIds.forEach((sheetId) => {
    const persistedSheet =
      persistedWorkbook.sheets && persistedWorkbook.sheets[sheetId];
    const clientSheet = clientWorkbook.sheets && clientWorkbook.sheets[sheetId];
    const mergedSheet = mergedWorkbook.sheets && mergedWorkbook.sheets[sheetId];
    if (!mergedSheet || typeof mergedSheet !== 'object') return;

    const persistedCells =
      persistedSheet && typeof persistedSheet.cells === 'object'
        ? persistedSheet.cells
        : {};
    const clientCells =
      clientSheet && typeof clientSheet.cells === 'object'
        ? clientSheet.cells
        : {};
    const mergedCells =
      mergedSheet && typeof mergedSheet.cells === 'object'
        ? mergedSheet.cells
        : {};
    const cellIds = new Set([
      ...Object.keys(persistedCells),
      ...Object.keys(clientCells),
    ]);

    cellIds.forEach((cellId) => {
      const persistedCell =
        persistedCells[cellId] && typeof persistedCells[cellId] === 'object'
          ? persistedCells[cellId]
          : null;
      const clientCell =
        clientCells[cellId] && typeof clientCells[cellId] === 'object'
          ? clientCells[cellId]
          : null;
      const mergedCell =
        mergedCells[cellId] && typeof mergedCells[cellId] === 'object'
          ? mergedCells[cellId]
          : null;
      if (!mergedCell) {
        const generatedBy = persistedCell
          ? String(persistedCell.generatedBy || '').toUpperCase()
          : '';
        if (persistedCell && generatedBy && !clientCell) {
          const persistedSourceCell =
            persistedCells[generatedBy] &&
            typeof persistedCells[generatedBy] === 'object'
              ? persistedCells[generatedBy]
              : null;
          const clientSourceCell =
            clientCells[generatedBy] &&
            typeof clientCells[generatedBy] === 'object'
              ? clientCells[generatedBy]
              : null;
          const persistedSourceRaw = String(
            (persistedSourceCell && persistedSourceCell.source) || '',
          );
          const clientSourceRaw = String(
            (clientSourceCell && clientSourceCell.source) || '',
          );
          if (!persistedSourceRaw || persistedSourceRaw !== clientSourceRaw) {
            return;
          }
          mergedCells[cellId] = JSON.parse(JSON.stringify(persistedCell));
        }
        return;
      }

      const sourceMatches =
        persistedCell &&
        clientCell &&
        String(persistedCell.source || '') === String(clientCell.source || '');

      if (!sourceMatches) return;

      if (persistedCell) {
        mergedCell.value = String(
          persistedCell.value == null ? '' : persistedCell.value,
        );
        mergedCell.displayValue = String(
          persistedCell.displayValue == null ? '' : persistedCell.displayValue,
        );
        mergedCell.state = String(
          persistedCell.state || mergedCell.state || '',
        );
        mergedCell.error = String(persistedCell.error || '');
      }
    });
  });

  return mergedWorkbook;
}

export function workbookMentionsChannel(workbookValue, channelLabel) {
  const workbook = decodeWorkbookDocument(workbookValue || {});
  const target = normalizeChannelLabel(channelLabel);
  if (!target) return false;

  const sheets =
    workbook && workbook.sheets && typeof workbook.sheets === 'object'
      ? workbook.sheets
      : {};
  return Object.keys(sheets).some((sheetId) => {
    const sheet = sheets[sheetId];
    const cells =
      sheet && sheet.cells && typeof sheet.cells === 'object'
        ? sheet.cells
        : {};
    return Object.keys(cells).some((cellId) => {
      const cell = cells[cellId];
      const source = String((cell && cell.source) || '');
      if (!source) return false;
      const labels = extractChannelMentionLabels(source);
      return labels.indexOf(target) !== -1;
    });
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
  const sheets =
    workbook && workbook.sheets && typeof workbook.sheets === 'object'
      ? workbook.sheets
      : {};

  Object.keys(sheets).forEach((sheetId) => {
    const cells =
      sheets[sheetId] && typeof sheets[sheetId].cells === 'object'
        ? sheets[sheetId].cells
        : {};
    Object.keys(cells).forEach((cellId) => {
      const cell =
        cells[cellId] && typeof cells[cellId] === 'object' ? cells[cellId] : {};
      const source = String(cell.source || '');
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
      shouldAppend,
      events: eventDocs.length,
    });
    const values = [];
    let latestProcessedEventId = previousEventId;

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
  const docs = await Sheets.find({}, { fields: { workbook: 1 } }).fetchAsync();
  let matched = 0;
  let recomputed = 0;

  for (let i = 0; i < docs.length; i += 1) {
    const doc = docs[i];
    const workbook = decodeWorkbookDocument((doc && doc.workbook) || {});
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
        await Sheets.updateAsync(
          { _id: doc._id },
          {
            $set: {
              workbook: encodeWorkbookForDocument(
                decodeWorkbookDocument(nextWorkbook),
              ),
              updatedAt: new Date(),
            },
            $unset: {
              storage: '',
            },
          },
        );
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
    await Sheets.updateAsync(
      { _id: doc._id },
      {
        $set: {
          workbook: encodeWorkbookForDocument(
            decodeWorkbookDocument(nextWorkbook),
          ),
          updatedAt: new Date(),
        },
        $unset: {
          storage: '',
        },
      },
    );
    recomputed += 1;
  }

  return { matched, recomputed };
}

registerAIQueueSheetRuntimeHooks({
  loadSheetDocumentStorage: async (sheetId) => {
    const sheetDocument = await normalizeSheetDocument(sheetId);
    if (!sheetDocument) return null;
    return decodeWorkbookDocument(sheetDocument.workbook || {});
  },
});

if (Meteor.isServer) {
  Meteor.startup(async () => {
    const result = await migrateAllSheetsToWorkbook();
    console.log('[sheets] workbook migration complete', result);
  });

  Meteor.publish('sheets.list', function publishSheetsList() {
    return Sheets.find(
      {},
      {
        fields: { name: 1, createdAt: 1, updatedAt: 1 },
        sort: { updatedAt: -1, createdAt: -1 },
      },
    );
  });

  Meteor.publish('sheets.one', function publishSheet(sheetId) {
    check(sheetId, String);

    return Sheets.find(
      { _id: sheetId },
      {
        fields: { name: 1, workbook: 1, createdAt: 1, updatedAt: 1 },
      },
    );
  });

  Meteor.methods({
    async 'sheets.create'(name) {
      check(name, Match.Maybe(String));

      const now = new Date();
      const count = (await Sheets.find().countAsync()) + 1;
      const sheetName = String(name || '').trim() || `Metacell ${count}`;
      const workbook = buildWorkbookFromFlatStorage({});

      return Sheets.insertAsync({
        name: sheetName,
        workbook: encodeWorkbookForDocument(workbook),
        createdAt: now,
        updatedAt: now,
      });
    },

    async 'sheets.createFormulaTestWorkbook'(name) {
      check(name, Match.Maybe(String));

      const now = new Date();
      const workbook = await buildComputedFormulaTestWorkbook();
      const sheetName = String(name || '').trim() || 'Formula Test Bench';

      return Sheets.insertAsync({
        name: sheetName,
        workbook: encodeWorkbookForDocument(workbook),
        createdAt: now,
        updatedAt: now,
      });
    },

    async 'sheets.createFinancialModelWorkbook'(name) {
      check(name, Match.Maybe(String));

      const now = new Date();
      const workbook = await buildComputedFinancialModelWorkbook();
      const sheetName =
        String(name || '').trim() || 'AI Startup Financial Model';

      return Sheets.insertAsync({
        name: sheetName,
        workbook: encodeWorkbookForDocument(workbook),
        createdAt: now,
        updatedAt: now,
      });
    },

    async 'sheets.rename'(sheetId, name) {
      check(sheetId, String);
      check(name, String);

      const nextName = String(name || '').trim();
      if (!nextName) {
        throw new Meteor.Error('invalid-name', 'Workbook name is required');
      }

      await Sheets.updateAsync(
        { _id: sheetId },
        {
          $set: {
            name: nextName,
            updatedAt: new Date(),
          },
        },
      );
    },

    async 'sheets.remove'(sheetId) {
      check(sheetId, String);
      await Sheets.removeAsync({ _id: sheetId });
    },

    async 'sheets.migrateAllToWorkbook'() {
      return migrateAllSheetsToWorkbook();
    },

    async 'sheets.rebuildDependencyGraph'(sheetId) {
      check(sheetId, String);
      const workbook = await rebuildSheetDependencyGraph(sheetId);
      if (!workbook) {
        throw new Meteor.Error('not-found', 'Workbook not found');
      }
      return { rebuilt: true };
    },

    async 'sheets.rebuildAllDependencyGraphs'() {
      return rebuildAllSheetDependencyGraphs();
    },

    async 'sheets.saveWorkbook'(sheetId, workbook) {
      check(sheetId, String);
      check(workbook, isPlainObject);

      const sheetDocument = await normalizeSheetDocument(sheetId);
      const previousWorkbook = decodeWorkbookDocument(
        (sheetDocument && sheetDocument.workbook) || {},
      );
      const nextWorkbook = mergeWorkbookForCompute(previousWorkbook, workbook);
      const changes = collectChangedDependencySignals(
        previousWorkbook,
        nextWorkbook,
      );
      const invalidatedWorkbook = decodeWorkbookDocument(
        invalidateWorkbookDependencies(nextWorkbook, changes),
      );
      const repairedWorkbook =
        rebuildWorkbookDependencyGraph(invalidatedWorkbook);
      const persistedWorkbook =
        stripWorkbookAttachmentInlineData(repairedWorkbook);

      await Sheets.updateAsync(
        { _id: sheetId },
        {
          $set: {
            workbook: encodeWorkbookForDocument(persistedWorkbook),
            updatedAt: new Date(),
          },
          $unset: {
            storage: '',
          },
        },
      );

      if (changes.length) {
        await notifyQueuedSheetDependenciesChanged(sheetId, changes);
      }
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

      const sheetDocument = await normalizeSheetDocument(sheetId);
      if (profiler) profiler.step('normalize.done');

      if (!sheetDocument) {
        throw new Meteor.Error('not-found', 'Workbook not found');
      }

      const persistedWorkbook = decodeWorkbookDocument(
        sheetDocument.workbook || {},
      );
      const sourceWorkbook =
        options &&
        options.workbookSnapshot &&
        typeof options.workbookSnapshot === 'object'
          ? mergeWorkbookForCompute(persistedWorkbook, options.workbookSnapshot)
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

      const result = await computeSheetSnapshot({
        sheetDocumentId: sheetId,
        workbookData: hydratedWorkbook,
        activeSheetId,
        channelPayloads,
        forceRefreshAI: !!(options && options.forceRefreshAI),
        manualTriggerAI: !!(options && options.manualTriggerAI),
        changedSignals,
        persistWorkbook: async (nextWorkbook) => {
          const normalizedNextWorkbook = decodeWorkbookDocument(nextWorkbook);
          const latestSheetDocument = await Sheets.findOneAsync(
            { _id: sheetId },
            { fields: { workbook: 1 } },
          );
          const latestPersistedWorkbook = decodeWorkbookDocument(
            (latestSheetDocument && latestSheetDocument.workbook) || {},
          );
          const mergedPersistWorkbook = mergeWorkbookForCompute(
            normalizedNextWorkbook,
            latestPersistedWorkbook,
          );
          const changes = collectChangedDependencySignals(
            latestPersistedWorkbook,
            mergedPersistWorkbook,
          );
          const persistedNextWorkbook = stripWorkbookAttachmentInlineData(
            mergedPersistWorkbook,
          );
          if (profiler)
            profiler.step('persist.start', { changes: changes.length });
          await Sheets.updateAsync(
            { _id: sheetId },
            {
              $set: {
                workbook: encodeWorkbookForDocument(persistedNextWorkbook),
                updatedAt: new Date(),
              },
              $unset: {
                storage: '',
              },
            },
          );
          if (changes.length) {
            await notifyQueuedSheetDependenciesChanged(sheetId, changes);
          }
          if (profiler)
            profiler.step('persist.done', { changes: changes.length });
        },
      });
      const nextWorkbookAfterChannelHistory =
        result && result.workbook
          ? await (async () => {
              const mentionedLabels = [
                ...new Set(
                  Object.values(
                    (
                      decodeWorkbookDocument(result.workbook || {}).sheets || {}
                    ),
                  )
                    .flatMap((sheet) =>
                      Object.values((sheet && sheet.cells) || {}).flatMap(
                        (cell) =>
                          extractChannelMentionLabels(
                            String((cell && cell.source) || ''),
                          ),
                      ),
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
        result.workbook = nextWorkbookAfterChannelHistory;
        await Sheets.updateAsync(
          { _id: sheetId },
          {
            $set: {
              workbook: encodeWorkbookForDocument(
                stripWorkbookAttachmentInlineData(
                  decodeWorkbookDocument(nextWorkbookAfterChannelHistory),
                ),
              ),
              updatedAt: new Date(),
            },
            $unset: {
              storage: '',
            },
          },
        );
      }
      if (profiler)
        profiler.step('compute.done', {
          values:
            result && result.values ? Object.keys(result.values).length : 0,
        });

      if (result && result.workbook) {
        result.workbook = stripWorkbookAttachmentInlineData(result.workbook);
      }
      if (profiler) profiler.step('computeGrid.done');

      return result;
    },
  });
}
