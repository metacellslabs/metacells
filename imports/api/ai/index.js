import { AppError } from '../../../lib/app-error.js';
import { check, Match } from '../../../lib/check.js';
import { registerMethods } from '../../../lib/rpc.js';
import { defineModel } from '../../../lib/orm.js';
import { FormulaEngine } from '../../engine/formula-engine.js';
import { AIService } from '../../ui/metacell/runtime/ai-service.js';
import { StorageService } from '../../engine/storage-service.js';
import { GRID_COLS, GRID_ROWS } from '../../engine/constants.js';
import {
  buildListSystemPrompt,
  buildTableSystemPrompt,
} from '../../ui/metacell/runtime/ai-prompts.js';
import {
  WorkbookStorageAdapter,
  createEmptyWorkbook,
} from '../../engine/workbook-storage-adapter.js';
import {
  getActiveAIProvider,
  getEffectiveAIChatConcurrencySync,
  getJobSettingsSync,
  getLMStudioBaseUrl,
} from '../settings/index.js';
import {
  deferJobExecution,
  enqueueDurableJobAndWait,
  registerJobHandler,
} from '../jobs/index.js';
import { publishWorkbookEvent } from '../sheets/events/events-bus.js';
import { decodeWorkbookDocument } from '../sheets/workbook-codec.js';
import { collectAffectedCellKeysFromSignals } from '../sheets/server/compute.js';

const URL_MARKDOWN_MAX_CHARS = 50000;
const AI_QUEUE_CONCURRENCY = 5;
const AI_QUEUE_MAX_RETRIES = 3;
const AI_QUEUE_RETRY_DELAY_MS = 750;
const queueMetaMatch = Match.Maybe(
  Match.Where(
    (value) =>
      value == null ||
      (!!value && typeof value === 'object' && !Array.isArray(value)),
  ),
);
const editLockOwnerMatch = Match.Maybe(String);
const editLockSeqMatch = Match.Maybe(Number);

let cachedModel = null;
let aiQueueActiveCount = 0;
let loadSheetDocumentStorageHook = null;
let loadChannelPayloadsHook = null;
const aiQueuedTasks = [];
const aiPendingTaskByKey = new Map();
const aiLockedSources = new Set();
const aiLockStateByKey = new Map();
const Sheets = defineModel('sheets');

function log(event, payload) {
  console.log(`[ai] ${event}`, payload);
}

async function loadWorkbookForQueueMeta(queueMeta) {
  const meta = queueMeta && typeof queueMeta === 'object' ? queueMeta : null;
  if (!meta) return null;
  if (meta.workbookSnapshot && typeof meta.workbookSnapshot === 'object') {
    return decodeWorkbookDocument(meta.workbookSnapshot);
  }
  if (!meta.sheetDocumentId || typeof loadSheetDocumentStorageHook !== 'function') {
    return null;
  }
  return loadSheetDocumentStorageHook(meta.sheetDocumentId);
}

async function collectChangedCellIdsForQueueMeta(queueMeta) {
  const meta = queueMeta && typeof queueMeta === 'object' ? queueMeta : null;
  if (!meta || !meta.sheetDocumentId || !meta.activeSheetId || !meta.sourceCellId) {
    return [];
  }
  try {
    const workbook = await loadWorkbookForQueueMeta(meta);
    if (!workbook) return [];
    const affected = collectAffectedCellKeysFromSignals(workbook, [
      {
        kind: 'cell',
        sheetId: String(meta.activeSheetId || ''),
        cellId: String(meta.sourceCellId || '').toUpperCase(),
      },
    ]);
    if (!affected || typeof affected !== 'object') {
      return [String(meta.sourceCellId || '').toUpperCase()].filter(Boolean);
    }
    return Object.keys(affected)
      .map((cellKey) => {
        const separatorIndex = String(cellKey || '').indexOf(':');
        return separatorIndex === -1
          ? ''
          : String(cellKey).slice(separatorIndex + 1).toUpperCase();
      })
      .filter(Boolean);
  } catch (error) {
    return [String(meta.sourceCellId || '').toUpperCase()].filter(Boolean);
  }
}

function providerSupportsImageInput(provider, model) {
  const providerType = String(provider && provider.type ? provider.type : '')
    .trim()
    .toLowerCase();
  const modelName = String(model || provider?.model || '')
    .trim()
    .toLowerCase();
  if (!providerType || !modelName) return false;
  if (providerType === 'deepseek') {
    return modelName.includes('vl') || modelName.includes('vision');
  }
  if (providerType === 'openai') {
    return modelName.includes('gpt-4o') || modelName.includes('gpt-4.1');
  }
  if (providerType === 'gemini') {
    return modelName.includes('gemini');
  }
  if (providerType === 'lm_studio') {
    return (
      modelName.includes('vision') ||
      modelName.includes('vl') ||
      modelName.includes('llava')
    );
  }
  return false;
}

function normalizeGeminiTextPart(value) {
  const text = String(value == null ? '' : value);
  return text ? { text } : null;
}

function parseGeminiInlineDataUrl(url) {
  const match = /^data:([^;,]+);base64,(.*)$/i.exec(String(url || '').trim());
  if (!match) return null;
  return {
    inlineData: {
      mimeType: String(match[1] || 'application/octet-stream').trim(),
      data: String(match[2] || '').trim(),
    },
  };
}

function buildGeminiParts(content) {
  if (typeof content === 'string') {
    return normalizeGeminiTextPart(content) ? [normalizeGeminiTextPart(content)] : [];
  }
  if (!Array.isArray(content)) return [];
  const parts = [];
  for (let i = 0; i < content.length; i += 1) {
    const part = content[i];
    if (typeof part === 'string') {
      const textPart = normalizeGeminiTextPart(part);
      if (textPart) parts.push(textPart);
      continue;
    }
    if (!part || typeof part !== 'object') continue;
    if (part.type === 'text' || part.type === 'input_text') {
      const textPart = normalizeGeminiTextPart(part.text);
      if (textPart) parts.push(textPart);
      continue;
    }
    if (part.type === 'image_url') {
      const imageUrl =
        part.image_url && typeof part.image_url === 'object'
          ? String(part.image_url.url || '').trim()
          : '';
      const inlineData = parseGeminiInlineDataUrl(imageUrl);
      if (inlineData) {
        parts.push(inlineData);
      } else if (imageUrl) {
        parts.push({
          text: `[image omitted: ${imageUrl}]`,
        });
      }
    }
  }
  return parts;
}

function buildGeminiRequestPayload(messages) {
  const source = Array.isArray(messages) ? messages : [];
  const systemTexts = [];
  const contents = [];

  for (let i = 0; i < source.length; i += 1) {
    const message = source[i] && typeof source[i] === 'object' ? source[i] : {};
    const role = String(message.role || 'user').trim().toLowerCase();
    const parts = buildGeminiParts(message.content);
    if (!parts.length) continue;
    if (role === 'system') {
      const systemText = parts
        .map((part) => (part && typeof part.text === 'string' ? part.text : ''))
        .filter(Boolean)
        .join('\n\n')
        .trim();
      if (systemText) systemTexts.push(systemText);
      continue;
    }
    contents.push({
      role: role === 'assistant' ? 'model' : 'user',
      parts,
    });
  }

  const payload = {
    contents:
      contents.length > 0
        ? contents
        : [
            {
              role: 'user',
              parts: [normalizeGeminiTextPart(systemTexts.join('\n\n'))].filter(Boolean),
            },
          ],
  };
  const systemInstruction = systemTexts.join('\n\n').trim();
  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }
  return payload;
}

function extractGeminiResponseText(data) {
  const candidates =
    data && Array.isArray(data.candidates) ? data.candidates : [];
  const first = candidates[0] && typeof candidates[0] === 'object' ? candidates[0] : null;
  const content = first && first.content && typeof first.content === 'object'
    ? first.content
    : null;
  const parts = content && Array.isArray(content.parts) ? content.parts : [];
  return parts
    .map((part) => (part && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('');
}

function stripUnsupportedImageParts(messages) {
  return Array.isArray(messages)
    ? messages.map((message) => {
        const source = message && typeof message === 'object' ? message : {};
        const content = source.content;
        if (!Array.isArray(content)) {
          return {
            role: source.role,
            content,
          };
        }
        const text = content
          .map((part) => {
            if (typeof part === 'string') return part;
            if (!part || typeof part !== 'object') return '';
            if (part.type === 'text')
              return String(part.text == null ? '' : part.text);
            return '';
          })
          .join('\n\n')
          .trim();
        return {
          role: source.role,
          content: text,
        };
      })
    : [];
}

function htmlToMarkdown(html) {
  return String(html == null ? '' : html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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
      const col = columnLabelToIndex(String(match[1]).toUpperCase());
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

function buildListInstruction(count) {
  return buildListSystemPrompt(count);
}

function buildTableInstruction(colsLimit, rowsLimit) {
  return buildTableSystemPrompt(colsLimit, rowsLimit);
}

async function fetchModelFromServer() {
  const provider = await getActiveAIProvider();
  const providerKey = [provider.type, provider.baseUrl, provider.model].join(
    '|',
  );
  if (cachedModel && cachedModel.providerKey === providerKey) {
    log('model.cache_hit', {
      model: cachedModel.model,
      provider: provider.type,
    });
    return cachedModel.model;
  }

  if (provider.type === 'deepseek') {
    const model = String(provider.model || 'deepseek-chat');
    cachedModel = { providerKey, model };
    log('model.provider_default', { model, provider: provider.type });
    return model;
  }

  if (provider.type === 'openai') {
    const model = String(provider.model || 'gpt-4.1-mini');
    cachedModel = { providerKey, model };
    log('model.provider_default', { model, provider: provider.type });
    return model;
  }

  if (provider.type === 'gemini') {
    const model = String(provider.model || 'gemini-flash-latest');
    cachedModel = { providerKey, model };
    log('model.provider_default', { model, provider: provider.type });
    return model;
  }

  if (provider.type === 'lm_studio' && provider.model) {
    const model = String(provider.model);
    cachedModel = { providerKey, model };
    log('model.provider_override', { model, provider: provider.type });
    return model;
  }

  const lmStudioBaseUrl =
    provider.type === 'lm_studio'
      ? provider.baseUrl
      : await getLMStudioBaseUrl();
  log('model.fetch.start', {
    provider: provider.type,
    baseUrl: lmStudioBaseUrl,
  });

  try {
    const response = await fetch(`${lmStudioBaseUrl}/models`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const model = data && data.data && data.data[0] && data.data[0].id;
    cachedModel = { providerKey, model: model || 'local-model' };
    log('model.fetch.success', {
      model: cachedModel.model,
      provider: provider.type,
    });
    return cachedModel.model;
  } catch (error) {
    cachedModel = { providerKey, model: 'local-model' };
    log('model.fetch.fallback', {
      error: error.message,
      model: cachedModel.model,
      provider: provider.type,
    });
    return cachedModel.model;
  }
}

function createTaskKey(type, payload, queueMeta) {
  const payloadText = JSON.stringify(payload || {});
  const payloadHash = createStablePayloadHash(payloadText);
  if (queueMeta && queueMeta.queueIdentity) {
    return `${type}:${queueMeta.queueIdentity}:${payloadHash}`;
  }
  return `${type}:${payloadHash}`;
}

function createStablePayloadHash(text) {
  const source = String(text || '');
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function scheduleQueueDrain() {
  setTimeout(() => {
    drainQueue().catch((error) => {
      log('queue.drain.error', {
        message: error && error.message ? error.message : String(error),
      });
    });
  }, 0);
}

function normalizeTaskDependencies(dependencies) {
  return Array.isArray(dependencies)
    ? dependencies.filter(
        (dependency) => dependency && typeof dependency === 'object',
      )
    : [];
}

function createSourceLockKey(meta) {
  if (
    !meta ||
    !meta.sheetDocumentId ||
    !meta.activeSheetId ||
    !meta.sourceCellId
  )
    return '';
  return [
    String(meta.sheetDocumentId || ''),
    String(meta.activeSheetId || ''),
    String(meta.sourceCellId || '').toUpperCase(),
  ].join(':');
}

function isTaskSourceLocked(task) {
  const key = createSourceLockKey(task && task.queueMeta);
  return !!(key && aiLockedSources.has(key));
}

function createQueueIdentity(queueMeta) {
  if (
    !queueMeta ||
    !queueMeta.sheetDocumentId ||
    !queueMeta.sourceCellId ||
    !queueMeta.formulaKind
  ) {
    return '';
  }
  return [
    queueMeta.sheetDocumentId,
    queueMeta.activeSheetId || '',
    queueMeta.sourceCellId,
    queueMeta.formulaKind,
  ].join(':');
}

function shouldRefreshTaskForChanges(task, changes) {
  const dependencies = normalizeTaskDependencies(
    task.queueMeta && task.queueMeta.dependencies,
  );
  if (!dependencies.length) return false;

  return changes.some((change) => {
    if (!change || typeof change !== 'object') return false;
    if (change.kind === 'named-cells') return true;

    return dependencies.some((dependency) => {
      if (!dependency || typeof dependency !== 'object') return false;
      if (dependency.kind === 'cell') {
        return (
          change.kind === 'cell' &&
          String(change.sheetId || '') === String(dependency.sheetId || '') &&
          String(change.cellId || '').toUpperCase() ===
            String(dependency.cellId || '').toUpperCase()
        );
      }

      if (dependency.kind === 'region' && change.kind === 'cell') {
        if (String(change.sheetId || '') !== String(dependency.sheetId || ''))
          return false;
        const start = parseCellId(dependency.startCellId);
        const end = parseCellId(dependency.endCellId);
        const target = parseCellId(change.cellId);
        if (!start || !end || !target) return false;
        const minRow = Math.min(start.row, end.row);
        const maxRow = Math.max(start.row, end.row);
        const minCol = Math.min(start.col, end.col);
        const maxCol = Math.max(start.col, end.col);
        return (
          target.row >= minRow &&
          target.row <= maxRow &&
          target.col >= minCol &&
          target.col <= maxCol
        );
      }

      return false;
    });
  });
}

function parseCellId(cellId) {
  const match = /^([A-Za-z]+)([0-9]+)$/.exec(
    String(cellId || '').toUpperCase(),
  );
  if (!match) return null;
  return {
    col: columnLabelToIndex(match[1]),
    row: parseInt(match[2], 10),
  };
}

async function buildQueuedPayload(queueMeta) {
  if (!queueMeta) return null;
  const workbookData = await loadWorkbookForQueueMeta(queueMeta);
  if (!workbookData) return null;

  const rawStorage = new WorkbookStorageAdapter(workbookData);
  const storageService = new StorageService(rawStorage);
  const channelPayloads =
    typeof loadChannelPayloadsHook === 'function'
      ? (await loadChannelPayloadsHook()) || {}
      : {};
  const aiService = new AIService(storageService, () => {}, {
    sheetDocumentId: queueMeta.sheetDocumentId,
    getActiveSheetId: () => String(queueMeta.activeSheetId || ''),
  });
  const formulaEngine = new FormulaEngine(
    storageService,
    aiService,
    () => storageService.readTabs(),
    buildCellIds(workbookData),
  );
  const sourceSheetId = String(queueMeta.activeSheetId || '');
  const promptTemplate = String(queueMeta.promptTemplate || '');

  return aiService.withRequestsSuppressed(() => {
    const runtimeOptions = { channelPayloads };
    if (queueMeta.formulaKind === 'formula-fallback') {
      const prepared = formulaEngine.buildUnknownFormulaFallbackRequest(
        sourceSheetId,
        String(queueMeta.sourceCellId || '').toUpperCase(),
        promptTemplate,
        runtimeOptions,
      );
      return {
        messages: [
          { role: 'system', content: prepared.systemPrompt },
          { role: 'user', content: prepared.userContent || prepared.userPrompt },
        ],
        dependencies: prepared.dependencies,
      };
    }

    const prepared = formulaEngine.prepareAIPrompt(
      sourceSheetId,
      promptTemplate,
      {},
      runtimeOptions,
    );
    const dependencies = formulaEngine.collectAIPromptDependencies(
      sourceSheetId,
      promptTemplate,
      runtimeOptions,
    );
    const buildUserContent = (text) =>
      aiService.buildUserMessageContent(text, prepared.userContent);
    const enrich = (messages) =>
      aiService
        .enrichPromptWithFetchedUrls(prepared.userPrompt)
        .then((finalPrompt) => {
          const nextMessages = messages.slice();
          nextMessages[nextMessages.length - 1] = {
            role: 'user',
            content: buildUserContent(finalPrompt),
          };
          return { messages: nextMessages, dependencies };
        });

    if (queueMeta.formulaKind === 'list') {
      const count = Math.max(
        1,
        Math.min(50, parseInt(queueMeta.count, 10) || 5),
      );
      const messages = [];
      if (prepared.systemPrompt)
        messages.push({ role: 'system', content: prepared.systemPrompt });
      messages.push({ role: 'system', content: buildListInstruction(count) });
      messages.push({
        role: 'user',
        content: buildUserContent(prepared.userPrompt),
      });
      return enrich(messages);
    }

    if (queueMeta.formulaKind === 'table') {
      const colsLimit = parseInt(queueMeta.colsLimit, 10) || null;
      const rowsLimit = parseInt(queueMeta.rowsLimit, 10) || null;
      const messages = [];
      if (prepared.systemPrompt)
        messages.push({ role: 'system', content: prepared.systemPrompt });
      messages.push({
        role: 'system',
        content: buildTableInstruction(colsLimit, rowsLimit),
      });
      messages.push({
        role: 'user',
        content: buildUserContent(prepared.userPrompt),
      });
      return enrich(messages);
    }

    const messages = [];
    if (prepared.systemPrompt)
      messages.push({ role: 'system', content: prepared.systemPrompt });
    messages.push({
      role: 'user',
      content: buildUserContent(prepared.userPrompt),
    });
    return enrich(messages);
  });
}

async function getResolvedSourceCellValue(queueMeta) {
  if (
    !queueMeta ||
    !queueMeta.activeSheetId ||
    !queueMeta.sourceCellId ||
    (!queueMeta.workbookSnapshot &&
      (!queueMeta.sheetDocumentId ||
        typeof loadSheetDocumentStorageHook !== 'function'))
  ) {
    return '';
  }

  const workbookData = await loadWorkbookForQueueMeta(queueMeta);
  if (!workbookData) return '';

  const rawStorage = new WorkbookStorageAdapter(workbookData);
  const storageService = new StorageService(rawStorage);
  const state = String(
    storageService.getCellState(
      queueMeta.activeSheetId,
      queueMeta.sourceCellId,
    ) || '',
  );
  if (state !== 'resolved') return '';
  return String(
    storageService.getCellDisplayValue(
      queueMeta.activeSheetId,
      queueMeta.sourceCellId,
    ) || '',
  );
}

async function refreshTaskFromSheetState(task, reason) {
  if (
    !task ||
    task.state !== 'queued' ||
    !task.queueMeta ||
    typeof loadSheetDocumentStorageHook !== 'function'
  ) {
    return;
  }

  if (String(task.queueMeta.formulaKind || '') === 'channel-feed') {
    return;
  }

  const rebuilt = await buildQueuedPayload(task.queueMeta);
  if (
    !rebuilt ||
    !Array.isArray(rebuilt.messages) ||
    !rebuilt.messages.length
  ) {
    return;
  }

  task.payload = {
    messages: rebuilt.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  };
  const previousKey = task.key;
  task.queueMeta = {
    ...task.queueMeta,
    dependencies: rebuilt.dependencies,
    queueIdentity: createQueueIdentity(task.queueMeta),
  };
  const nextKey = createTaskKey('chat', task.payload, task.queueMeta);
  if (previousKey !== nextKey) {
    aiPendingTaskByKey.delete(previousKey);
    task.key = nextKey;
    aiPendingTaskByKey.set(nextKey, task);
  }
  log('queue.refresh', {
    taskKey: task.key,
    reason,
    dependencies: normalizeTaskDependencies(rebuilt.dependencies).length,
  });
}

function enqueueTask(type, payload, queueMeta, runner) {
  const normalizedMeta = queueMeta
    ? {
        ...queueMeta,
        queueIdentity: createQueueIdentity(queueMeta),
        dependencies: normalizeTaskDependencies(queueMeta.dependencies),
      }
    : null;
  const taskKey = createTaskKey(type, payload, normalizedMeta);
  const existing = aiPendingTaskByKey.get(taskKey);
  if (existing) {
    if (existing.state === 'queued') {
      existing.payload = payload;
      existing.queueMeta = normalizedMeta;
    }
    log('queue.dedupe', {
      taskKey,
      state: existing.state,
      attempts: existing.attempts,
    });
    return existing.promise;
  }

  let resolveTask;
  let rejectTask;
  const promise = new Promise((resolve, reject) => {
    resolveTask = resolve;
    rejectTask = reject;
  });

  const task = {
    key: taskKey,
    payload,
    queueMeta: normalizedMeta,
    runner,
    attempts: 0,
    state: 'queued',
    waitingForEditLock: false,
    resolve: resolveTask,
    reject: rejectTask,
    promise,
  };

  aiPendingTaskByKey.set(taskKey, task);
  aiQueuedTasks.push(task);
  log('queue.enqueued', {
    taskKey,
    queued: aiQueuedTasks.length,
    active: aiQueueActiveCount,
    dependencies: normalizeTaskDependencies(
      normalizedMeta && normalizedMeta.dependencies,
    ).length,
  });
  scheduleQueueDrain();
  return promise;
}

function normalizeQueueMeta(queueMeta) {
  return queueMeta
    ? {
        ...queueMeta,
        queueIdentity: createQueueIdentity(queueMeta),
        dependencies: normalizeTaskDependencies(queueMeta.dependencies),
      }
    : null;
}

async function drainQueue() {
  while (aiQueueActiveCount < AI_QUEUE_CONCURRENCY && aiQueuedTasks.length) {
    const task = aiQueuedTasks.shift();
    task.state = 'active';
    task.attempts += 1;
    aiQueueActiveCount += 1;

    log('queue.start', {
      taskKey: task.key,
      attempt: task.attempts,
      queued: aiQueuedTasks.length,
      active: aiQueueActiveCount,
    });

    Promise.resolve()
      .then(() => {
        if (isTaskSourceLocked(task)) {
          task.state = 'queued';
          task.waitingForEditLock = true;
          if (aiQueuedTasks.indexOf(task) === -1) {
            aiQueuedTasks.push(task);
          }
          log('queue.blocked_by_edit_lock', {
            taskKey: task.key,
            queued: aiQueuedTasks.length,
            active: aiQueueActiveCount - 1,
          });
          return { __blockedByEditLock: true };
        }
        task.waitingForEditLock = false;
        return task.runner(task);
      })
      .then((result) => {
        aiQueueActiveCount -= 1;
        if (result && result.__blockedByEditLock) {
          return;
        }
        aiPendingTaskByKey.delete(task.key);
        task.resolve(result);
        log('queue.success', {
          taskKey: task.key,
          attempt: task.attempts,
          queued: aiQueuedTasks.length,
          active: aiQueueActiveCount,
        });
        scheduleQueueDrain();
      })
      .catch((error) => {
        aiQueueActiveCount -= 1;

        if (task.attempts < AI_QUEUE_MAX_RETRIES) {
          task.state = 'queued';
          aiQueuedTasks.push(task);
          log('queue.retry', {
            taskKey: task.key,
            attempt: task.attempts,
            message: error && error.message ? error.message : String(error),
            queued: aiQueuedTasks.length,
            active: aiQueueActiveCount,
          });
          setTimeout(() => {
            drainQueue().catch((retryError) => {
              log('queue.retry.error', {
                taskKey: task.key,
                message:
                  retryError && retryError.message
                    ? retryError.message
                    : String(retryError),
              });
            });
          }, AI_QUEUE_RETRY_DELAY_MS);
          return;
        }

        aiPendingTaskByKey.delete(task.key);
        task.reject(error);
        log('queue.failed', {
          taskKey: task.key,
          attempts: task.attempts,
          message: error && error.message ? error.message : String(error),
          queued: aiQueuedTasks.length,
          active: aiQueueActiveCount,
        });
        scheduleQueueDrain();
      });
  }
}

async function runAIChatJob(job) {
  const task = {
    key: String(
      job && job.dedupeKey
        ? job.dedupeKey
        : job && job._id
          ? job._id
          : 'ai-job',
    ),
    payload: job && job.payload ? { ...job.payload } : { messages: [] },
    queueMeta: normalizeQueueMeta(
      job && job.payload ? job.payload.queueMeta : null,
    ),
  };

  if (isTaskSourceLocked(task)) {
    return deferJobExecution(500, 'blocked by edit lock');
  }

  if (
    task.queueMeta &&
    String(task.queueMeta.formulaKind || '') !== 'channel-feed'
  ) {
    const formulaKind = String(task.queueMeta.formulaKind || '');
    const canSkipResolved =
      formulaKind === 'ask' || formulaKind === 'formula-fallback';
    if (canSkipResolved && task.queueMeta.forceRefresh !== true) {
      const currentValue = await getResolvedSourceCellValue(task.queueMeta);
      if (currentValue) {
        log('method.ai.requestChat.skip_resolved', {
          taskKey: task.key,
          sourceCellId: String(task.queueMeta.sourceCellId || '').toUpperCase(),
        });
        return currentValue;
      }
    }
    const rebuilt = await buildQueuedPayload(task.queueMeta);
    if (rebuilt && Array.isArray(rebuilt.messages) && rebuilt.messages.length) {
      task.payload = {
        messages: rebuilt.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      };
      task.queueMeta = {
        ...task.queueMeta,
        dependencies: rebuilt.dependencies,
      };
    }
  }

  try {
    const model = await fetchModelFromServer();
    const provider = await getActiveAIProvider();
    const effectiveMessages = providerSupportsImageInput(provider, model)
      ? task.payload.messages || []
      : stripUnsupportedImageParts(task.payload.messages || []);
    log('method.ai.requestChat.start', {
      model,
      messages: effectiveMessages.map((message) => ({
        role: message.role,
        preview: String(
          Array.isArray(message.content)
            ? message.content
                .map((part) =>
                  typeof part === 'string' ? part : (part && part.text) || '',
                )
                .join('')
            : message.content,
        ).slice(0, 200),
      })),
      dependencies: normalizeTaskDependencies(
        task.queueMeta && task.queueMeta.dependencies,
      ).length,
    });

    const requestBaseUrl =
      provider.type === 'lm_studio'
        ? provider.baseUrl
        : String(provider.baseUrl || '');
    const requestUrl =
      provider.type === 'gemini'
        ? `${requestBaseUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(model)}:generateContent`
        : `${requestBaseUrl.replace(/\/+$/, '')}/chat/completions`;
    const requestHeaders = { 'Content-Type': 'application/json' };
    if (
      (provider.type === 'deepseek' || provider.type === 'openai') &&
      provider.apiKey
    ) {
      requestHeaders.Authorization = `Bearer ${provider.apiKey}`;
    }
    if (provider.type === 'gemini' && provider.apiKey) {
      requestHeaders['X-goog-api-key'] = provider.apiKey;
    }
    const requestBody = JSON.stringify(
      provider.type === 'gemini'
        ? buildGeminiRequestPayload(effectiveMessages)
        : {
            model,
            messages: effectiveMessages,
          },
    );
    log('method.ai.requestChat.fetch', {
      provider: provider.type,
      url: requestUrl,
      body: requestBody,
    });
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: requestBody,
    });

    if (!response.ok) {
      const body = await response.text();
      log('method.ai.requestChat.error', {
        status: response.status,
        body: body.slice(0, 500),
      });
      let details = body;
      try {
        const parsed = JSON.parse(body);
        details =
          parsed &&
          parsed.error &&
          (parsed.error.message || parsed.error.code || parsed.error.type)
            ? String(
                parsed.error.message || parsed.error.code || parsed.error.type,
              )
            : body;
      } catch (e) {}
      const message = String(details || '').trim();
      throw new Error(message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const finalContent =
      provider.type === 'gemini'
        ? String(extractGeminiResponseText(data) || '')
        : String(
            (() => {
              const message =
                data && data.choices && data.choices[0] && data.choices[0].message;
              let content = message && message.content;
              if (Array.isArray(content)) {
                content = content
                  .map((part) =>
                    typeof part === 'string' ? part : (part && part.text) || '',
                  )
                  .join('');
              }
              return content || '';
            })(),
          );
    log('method.ai.requestChat.success', {
      preview: finalContent.slice(0, 500),
      length: finalContent.length,
    });
    if (task.queueMeta && task.queueMeta.sheetDocumentId) {
      const changedCellIds = await collectChangedCellIdsForQueueMeta(
        task.queueMeta,
      );
      publishWorkbookEvent({
        type: 'workbook.ai.completed',
        sheetDocumentId: task.queueMeta.sheetDocumentId,
        activeSheetId: task.queueMeta.activeSheetId,
        changedCellIds: changedCellIds,
        sourceCellId: task.queueMeta.sourceCellId,
        formulaKind: task.queueMeta.formulaKind,
        status: 'completed',
      });
    }
    return finalContent;
  } catch (error) {
    if (task.queueMeta && task.queueMeta.sheetDocumentId) {
      const changedCellIds = await collectChangedCellIdsForQueueMeta(
        task.queueMeta,
      );
      publishWorkbookEvent({
        type: 'workbook.ai.failed',
        sheetDocumentId: task.queueMeta.sheetDocumentId,
        activeSheetId: task.queueMeta.activeSheetId,
        changedCellIds: changedCellIds,
        sourceCellId: task.queueMeta.sourceCellId,
        formulaKind: task.queueMeta.formulaKind,
        status: 'failed',
      });
    }
    throw error;
  }
}

export function registerAIQueueSheetRuntimeHooks(hooks) {
  const nextHooks = hooks || {};
  if (typeof nextHooks.loadSheetDocumentStorage === 'function') {
    loadSheetDocumentStorageHook = nextHooks.loadSheetDocumentStorage;
  }
  if (typeof nextHooks.loadChannelPayloads === 'function') {
    loadChannelPayloadsHook = nextHooks.loadChannelPayloads;
  }
}

registerJobHandler('ai.request_chat', {
  description: 'Durable outbound AI provider chat/completion request',
  concurrency: () => getEffectiveAIChatConcurrencySync(),
  retryPolicy: {
    maxAttempts: () => getJobSettingsSync().aiChatMaxAttempts,
    retryDelayMs: () => getJobSettingsSync().aiChatRetryDelayMs,
  },
  timeoutMs: () => getJobSettingsSync().aiChatTimeoutMs,
  leaseTimeoutMs: () => getJobSettingsSync().aiChatLeaseTimeoutMs,
  heartbeatIntervalMs: () => getJobSettingsSync().aiChatHeartbeatIntervalMs,
  payloadSchema: {
    messages: [Object],
    queueMeta: Match.Maybe(Object),
  },
  payloadSchemaDescription: 'Object with messages array and optional queueMeta',
  idempotencyStrategy:
    'dedupeKey derived from queue identity or serialized message payload',
  run: runAIChatJob,
});

export async function enqueueAIChatRequest(messages, queueMeta, options = {}) {
  const payload = {
    messages: Array.isArray(messages)
      ? messages.map((message) => ({
          role: String((message && message.role) || 'user'),
          content:
            message && Object.prototype.hasOwnProperty.call(message, 'content')
              ? message.content
              : '',
        }))
      : [],
    queueMeta: queueMeta || null,
  };
  const normalizedMeta = normalizeQueueMeta(queueMeta || null);
  return enqueueDurableJobAndWait(
    {
      type: 'ai.request_chat',
      payload,
      dedupeKey: createTaskKey('chat', payload, normalizedMeta),
      maxAttempts: AI_QUEUE_MAX_RETRIES,
      retryDelayMs: AI_QUEUE_RETRY_DELAY_MS,
    },
    {
      timeoutMs:
        Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 180_000,
    },
  );
}

export async function notifyQueuedSheetDependenciesChanged(
  sheetDocumentId,
  changes,
) {
  const normalizedSheetId = String(sheetDocumentId || '');
  const normalizedChanges = Array.isArray(changes) ? changes : [];
  if (!normalizedSheetId || !normalizedChanges.length) return;

  for (let i = 0; i < aiQueuedTasks.length; i += 1) {
    const task = aiQueuedTasks[i];
    if (!task || task.state !== 'queued' || !task.queueMeta) continue;
    if (String(task.queueMeta.sheetDocumentId || '') !== normalizedSheetId)
      continue;
    if (!shouldRefreshTaskForChanges(task, normalizedChanges)) continue;
    await refreshTaskFromSheetState(task, 'dependency-change');
  }
}

registerMethods({
  'ai.setSourceEditLock'(
    sheetDocumentId,
    activeSheetId,
    sourceCellId,
    locked,
    ownerId,
    sequence,
  ) {
    let normalizedOwnerId = ownerId;
    let normalizedSequence = sequence;
    if (
      typeof normalizedOwnerId === 'number' &&
      typeof normalizedSequence === 'undefined'
    ) {
      normalizedSequence = normalizedOwnerId;
      normalizedOwnerId = undefined;
    }

    check(sheetDocumentId, String);
    check(activeSheetId, String);
    check(sourceCellId, String);
    check(locked, Boolean);
    check(normalizedOwnerId, editLockOwnerMatch);
    check(normalizedSequence, editLockSeqMatch);

    const key = createSourceLockKey({
      sheetDocumentId,
      activeSheetId,
      sourceCellId,
    });
    if (!key) return false;

    const owner = String(normalizedOwnerId || '');
    const seq = Number.isFinite(normalizedSequence) ? normalizedSequence : 0;
    const current = aiLockStateByKey.get(key);
    if (current && current.owner === owner && seq < current.sequence) {
      return false;
    }

    if (locked) {
      aiLockStateByKey.set(key, { owner, sequence: seq, locked: true });
      aiLockedSources.add(key);
      log('source.locked', { key });
    } else {
      aiLockStateByKey.set(key, { owner, sequence: seq, locked: false });
      aiLockedSources.delete(key);
      log('source.unlocked', { key });
      scheduleQueueDrain();
    }
    return true;
  },

  async 'ai.getModel'() {
    log('method.ai.getModel', {});
    return fetchModelFromServer();
  },

  async 'ai.requestChat'(messages, queueMeta) {
    check(messages, [
      {
        role: String,
        content: Match.OneOf(String, [Match.Any]),
      },
    ]);
    check(queueMeta, queueMetaMatch);

    return enqueueAIChatRequest(messages, queueMeta, { timeoutMs: 180_000 });
  },

  async 'ai.fetchUrlMarkdown'(url) {
    check(url, String);

    log('method.ai.fetchUrlMarkdown.start', { url });
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text();
      log('method.ai.fetchUrlMarkdown.error', {
        url,
        status: response.status,
        body: body.slice(0, 500),
      });
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const markdown = htmlToMarkdown(html);
    const finalMarkdown =
      markdown.length > URL_MARKDOWN_MAX_CHARS
        ? markdown.slice(0, URL_MARKDOWN_MAX_CHARS)
        : markdown;
    log('method.ai.fetchUrlMarkdown.success', {
      url,
      htmlLength: html.length,
      markdownLength: finalMarkdown.length,
      preview: finalMarkdown.slice(0, 500),
    });
    return finalMarkdown;
  },

  async 'ai.fetchProviderModels'(providerType, baseUrl, apiKey) {
    check(providerType, String);
    check(baseUrl, String);
    check(apiKey, Match.Maybe(String));

    let effectiveUrl = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (!effectiveUrl) {
      throw new AppError('invalid-url', 'Base URL is required');
    }

    const alias = String(
      process.env.METACELLS_CONTAINER_HOST_ALIAS || '',
    ).trim();
    if (alias) {
      try {
        const parsed = new URL(effectiveUrl);
        const host = String(parsed.hostname || '').trim().toLowerCase();
        if (
          host === 'localhost' ||
          host === '127.0.0.1' ||
          host === '[::1]'
        ) {
          parsed.hostname = alias;
          effectiveUrl = parsed.toString().replace(/\/$/, '');
        }
      } catch (e) {}
    }

    const normalizedType = String(providerType || '').trim().toLowerCase();
    const headers = { 'Content-Type': 'application/json' };
    if ((normalizedType === 'openai' || normalizedType === 'deepseek') && apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    if (normalizedType === 'gemini' && apiKey) {
      headers['X-goog-api-key'] = apiKey;
    }

    log('method.ai.fetchProviderModels.start', {
      provider: normalizedType,
      url: effectiveUrl,
    });

    const response = await fetch(`${effectiveUrl}/models`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const body = await response.text();
      log('method.ai.fetchProviderModels.error', {
        provider: normalizedType,
        status: response.status,
        body: body.slice(0, 500),
      });
      throw new AppError(
        'fetch-models-error',
        `HTTP ${response.status}: ${body.slice(0, 200)}`,
      );
    }

    const data = await response.json();
    const rawModels =
      normalizedType === 'gemini'
        ? data && Array.isArray(data.models)
          ? data.models
          : []
        : data && Array.isArray(data.data)
          ? data.data
          : [];
    const models = rawModels
      .map((m) => {
        if (normalizedType === 'gemini') {
          const rawName = String((m && m.name) || '').trim();
          const modelId = rawName.replace(/^models\//, '');
          return {
            id: modelId,
            name: String((m && m.displayName) || modelId || rawName),
            owned_by: 'google',
          };
        }
        return {
          id: String((m && m.id) || ''),
          name: String((m && (m.name || m.id)) || ''),
          owned_by: String((m && m.owned_by) || ''),
        };
      })
      .filter((m) => m.id)
      .sort((a, b) => a.id.localeCompare(b.id));

    log('method.ai.fetchProviderModels.success', {
      provider: normalizedType,
      count: models.length,
      preview: models.slice(0, 5).map((m) => m.id),
    });

    return models;
  },

  async 'ai.testProviderConnection'(providerType, baseUrl, apiKey, model) {
    check(providerType, String);
    check(baseUrl, String);
    check(apiKey, Match.Maybe(String));
    check(model, Match.Maybe(String));

    let effectiveUrl = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (!effectiveUrl) {
      throw new AppError('invalid-url', 'Base URL is required');
    }

    const alias = String(
      process.env.METACELLS_CONTAINER_HOST_ALIAS || '',
    ).trim();
    if (alias) {
      try {
        const parsed = new URL(effectiveUrl);
        const host = String(parsed.hostname || '').trim().toLowerCase();
        if (
          host === 'localhost' ||
          host === '127.0.0.1' ||
          host === '[::1]'
        ) {
          parsed.hostname = alias;
          effectiveUrl = parsed.toString().replace(/\/$/, '');
        }
      } catch (_error) {}
    }

    const normalizedType = String(providerType || '').trim().toLowerCase();
    const normalizedModel = String(model || '').trim();
    const headers = { 'Content-Type': 'application/json' };
    if (
      (normalizedType === 'openai' || normalizedType === 'deepseek') &&
      apiKey
    ) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    if (normalizedType === 'gemini' && apiKey) {
      headers['X-goog-api-key'] = apiKey;
    }

    if (
      (normalizedType === 'openai' ||
        normalizedType === 'deepseek' ||
        normalizedType === 'gemini' ||
        normalizedType === 'lm_studio') &&
      !normalizedModel
    ) {
      throw new AppError('invalid-model', 'Model is required');
    }

    const testUrl =
      normalizedType === 'gemini'
        ? `${effectiveUrl}/models/${encodeURIComponent(normalizedModel)}:generateContent`
        : `${effectiveUrl}/chat/completions`;
    const body = JSON.stringify(
      normalizedType === 'gemini'
        ? {
            contents: [
              {
                role: 'user',
                parts: [{ text: 'Reply with OK.' }],
              },
            ],
          }
        : {
            model: normalizedModel,
            messages: [{ role: 'user', content: 'Reply with OK.' }],
            max_tokens: 8,
          },
    );
    log('method.ai.testProviderConnection.start', {
      provider: normalizedType,
      url: testUrl,
      model: normalizedModel,
    });

    const response = await fetch(testUrl, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      const body = await response.text();
      log('method.ai.testProviderConnection.error', {
        provider: normalizedType,
        status: response.status,
        body: body.slice(0, 500),
      });
      throw new AppError(
        'provider-test-error',
        `HTTP ${response.status}: ${body.slice(0, 200)}`,
      );
    }

    log('method.ai.testProviderConnection.success', {
      provider: normalizedType,
      url: testUrl,
      model: normalizedModel,
    });
    return { ok: true };
  },
});
