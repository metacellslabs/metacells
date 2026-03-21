import crypto from 'crypto';
import { Meteor } from '../../../lib/meteor-compat.js';
import { Collection } from '../../../lib/collections.js';
import { Match, check } from '../../../lib/check.js';
import { registerMethods } from '../../../lib/rpc.js';
import {
  computeCellScheduleNextRun,
  hasEnabledCellSchedule,
  normalizeCellSchedule,
} from '../../lib/cell-schedule.js';
import { enqueueAIChatRequest } from '../ai/index.js';
import {
  JOB_STATUS,
  Jobs,
  registerJobHandler,
  enqueueDurableJob,
} from '../jobs/index.js';
import { Sheets } from '../sheets/index.js';
import {
  decodeWorkbookDocument,
  encodeWorkbookForDocument,
} from '../sheets/workbook-codec.js';
import { getActiveChannelPayloadMap } from '../channels/runtime-state.js';
import { hydrateWorkbookAttachmentArtifacts, stripWorkbookAttachmentInlineData } from '../artifacts/index.js';
import { computeSheetSnapshot } from '../sheets/server/compute.js';

export const CellSchedules = new Collection('cell_schedules');

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function scheduleDocId(sheetDocumentId, sheetId, cellId) {
  return `${String(sheetDocumentId || '')}:${String(sheetId || '')}:${String(cellId || '').toUpperCase()}`;
}

function hashText(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || ''), 'utf8')
    .digest('hex');
}

function getWorkbookCell(workbook, sheetId, cellId) {
  const normalizedWorkbook = decodeWorkbookDocument(workbook || {});
  const sheet =
    normalizedWorkbook.sheets &&
    normalizedWorkbook.sheets[String(sheetId || '')] &&
    typeof normalizedWorkbook.sheets[String(sheetId || '')] === 'object'
      ? normalizedWorkbook.sheets[String(sheetId || '')]
      : null;
  const cells = sheet && sheet.cells && typeof sheet.cells === 'object' ? sheet.cells : {};
  return isPlainObject(cells[String(cellId || '').toUpperCase()])
    ? cells[String(cellId || '').toUpperCase()]
    : null;
}

function listWorkbookCells(workbook) {
  const normalizedWorkbook = decodeWorkbookDocument(workbook || {});
  const items = [];
  Object.keys(normalizedWorkbook.sheets || {}).forEach((sheetId) => {
    const cells =
      normalizedWorkbook.sheets[sheetId] &&
      normalizedWorkbook.sheets[sheetId].cells &&
      typeof normalizedWorkbook.sheets[sheetId].cells === 'object'
        ? normalizedWorkbook.sheets[sheetId].cells
        : {};
    Object.keys(cells).forEach((cellId) => {
      const cell = cells[cellId];
      if (!isPlainObject(cell)) return;
      items.push({
        sheetId,
        cellId: String(cellId).toUpperCase(),
        cell,
      });
    });
  });
  return items;
}

function extractChangedCells(previousWorkbook, nextWorkbook) {
  const beforeMap = new Map();
  listWorkbookCells(previousWorkbook).forEach((entry) => {
    beforeMap.set(`${entry.sheetId}:${entry.cellId}`, entry.cell);
  });
  const changes = [];
  listWorkbookCells(nextWorkbook).forEach((entry) => {
    const key = `${entry.sheetId}:${entry.cellId}`;
    const previous = beforeMap.get(key) || null;
    const next = entry.cell;
    const previousSource = String((previous && previous.source) || '');
    const nextSource = String((next && next.source) || '');
    const previousValue = String((previous && previous.value) || '');
    const nextValue = String((next && next.value) || '');
    const previousSchedule = normalizeCellSchedule(previous && previous.schedule);
    const nextSchedule = normalizeCellSchedule(next && next.schedule);
    const sourceChanged = previousSource !== nextSource;
    const valueChanged = previousValue !== nextValue;
    const scheduleChanged =
      JSON.stringify(previousSchedule || null) !== JSON.stringify(nextSchedule || null);
    if (
      sourceChanged ||
      valueChanged ||
      scheduleChanged
    ) {
      changes.push({
        sheetId: entry.sheetId,
        cellId: entry.cellId,
        previous,
        next,
        sourceChanged,
        valueChanged,
        scheduleChanged,
      });
    }
  });
  return changes;
}

function buildScheduleDoc(sheetDocumentId, sheetId, cellId, schedule, cell) {
  const normalizedSchedule = normalizeCellSchedule(schedule);
  if (!normalizedSchedule || normalizedSchedule.enabled === false) return null;
  const nextRunAt = computeCellScheduleNextRun(normalizedSchedule, new Date());
  return {
    _id: scheduleDocId(sheetDocumentId, sheetId, cellId),
    sheetDocumentId: String(sheetDocumentId || ''),
    sheetId: String(sheetId || ''),
    cellId: String(cellId || '').toUpperCase(),
    schedule: normalizedSchedule,
    enabled: normalizedSchedule.enabled !== false,
    nextRunAt,
    updatedAt: new Date(),
    sourceHash: String((normalizedSchedule && normalizedSchedule.sourceHash) || ''),
    sourcePreview: String((normalizedSchedule && normalizedSchedule.sourcePreview) || ''),
    lastKnownSource: String((cell && cell.source) || ''),
    lastKnownValue: String((cell && cell.value) || ''),
  };
}

function sameSchedule(a, b) {
  return JSON.stringify(normalizeCellSchedule(a) || null) === JSON.stringify(normalizeCellSchedule(b) || null);
}

async function removePendingScheduledRunJobs(scheduleIds) {
  const ids = Array.isArray(scheduleIds)
    ? scheduleIds.map((value) => String(value || '')).filter(Boolean)
    : [];
  if (!ids.length) return 0;
  return Jobs.removeAsync({
    type: 'schedules.run_cell',
    'payload.scheduleId': { $in: ids },
    status: { $in: [JOB_STATUS.QUEUED, JOB_STATUS.RETRYING] },
  });
}

async function removePendingScheduleDetectionJobsForWorkbook(sheetDocumentId) {
  const workbookId = String(sheetDocumentId || '');
  if (!workbookId) return 0;
  return Jobs.removeAsync({
    type: 'schedules.detect_cell',
    'payload.sheetDocumentId': workbookId,
    status: { $in: [JOB_STATUS.QUEUED, JOB_STATUS.RETRYING] },
  });
}

async function enqueueNextScheduledRun(scheduleDoc) {
  if (!scheduleDoc || !(scheduleDoc.nextRunAt instanceof Date)) return null;
  return enqueueDurableJob({
    type: 'schedules.run_cell',
    payload: {
      scheduleId: String(scheduleDoc._id || ''),
    },
    dedupeKey: `${String(scheduleDoc._id || '')}:${scheduleDoc.nextRunAt.toISOString()}`,
    runAt: scheduleDoc.nextRunAt,
    maxAttempts: 3,
    retryDelayMs: 2_000,
  });
}

function shouldConsiderScheduleText(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  if (value.length < 12) return false;
  return /(?:\bcron\b|\bevery\b|\bdaily\b|\bweekly\b|\bmonthly\b|\bonce\b|\beach\b|\bweekday\b|\bremind\b|\bschedule\b|(?:^|\s)\d{1,2}:\d{2}(?:\s|$)|(?:^|\s)[*0-9/,.-]+\s+[*0-9/,.-]+\s+[*0-9/,.-]+\s+[*0-9/,.-]+\s+[*0-9/,.-]+(?:\s|$))/i.test(
    value,
  );
}

async function detectScheduleFromText(text) {
  const content = String(text || '').trim();
  if (!shouldConsiderScheduleText(content)) return null;
  const response = await enqueueAIChatRequest(
    [
      {
        role: 'system',
        content:
          'Extract recurring schedule instructions from the user text. Return JSON only. Schema: {"hasSchedule":boolean,"schedule":{"kind":"once|daily|weekly|monthly|interval|cron","datetime":"ISO optional","time":"HH:MM optional","daysOfWeek":[0-6 optional Sunday=0],"dayOfMonth":number optional,"intervalMinutes":number optional,"cron":"5-field cron optional","label":"short label optional"}}. If no schedule instruction exists, return {"hasSchedule":false}.',
      },
      {
        role: 'user',
        content,
      },
    ],
    {
      formulaKind: 'schedule-detect',
    },
  );
  const raw = String(response || '').trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (!parsed || parsed.hasSchedule !== true) return null;
    return normalizeCellSchedule({
      ...(parsed.schedule || {}),
      origin: 'detected',
    });
  } catch (error) {
    return null;
  }
}

async function updateWorkbookCellSchedule(
  sheetDocumentId,
  sheetId,
  cellId,
  schedule,
  sourceText,
  sourceKind,
) {
  const sheetDoc = await Sheets.findOneAsync(
    { _id: sheetDocumentId },
    { fields: { workbook: 1 } },
  );
  if (!sheetDoc) return null;
  const workbook = decodeWorkbookDocument(sheetDoc.workbook || {});
  const sheet =
    workbook.sheets && workbook.sheets[sheetId] && typeof workbook.sheets[sheetId] === 'object'
      ? workbook.sheets[sheetId]
      : null;
  if (!sheet || !sheet.cells || !isPlainObject(sheet.cells[cellId])) return null;
  const cell = sheet.cells[cellId];
  const currentSchedule = normalizeCellSchedule(cell.schedule);
  if (currentSchedule && currentSchedule.origin === 'manual') return currentSchedule;

  const nextSchedule = schedule
    ? {
        ...schedule,
        origin: 'detected',
        triggerSource: sourceKind === 'value' ? 'value' : 'source',
        sourcePreview: String(sourceText || '').slice(0, 500),
        sourceHash: hashText(sourceText),
        updatedAt: new Date().toISOString(),
      }
    : null;
  cell.schedule = normalizeCellSchedule(nextSchedule);
  await Sheets.updateAsync(
    { _id: sheetDocumentId },
    {
      $set: {
        workbook: encodeWorkbookForDocument(stripWorkbookAttachmentInlineData(workbook)),
        updatedAt: new Date(),
      },
      $unset: { storage: '' },
    },
  );
  return cell.schedule || null;
}

async function syncManualSchedules(sheetDocumentId, workbook) {
  const docsToKeep = {};
  const existing = await CellSchedules.find({ sheetDocumentId }).fetchAsync();
  const existingById = new Map();
  for (let i = 0; i < existing.length; i += 1) {
    existingById.set(String(existing[i]._id || ''), existing[i]);
  }
  const cells = listWorkbookCells(workbook);
  for (let i = 0; i < cells.length; i += 1) {
    const entry = cells[i];
    const schedule = normalizeCellSchedule(entry.cell.schedule);
    if (!schedule || schedule.enabled === false) continue;
    const docId = scheduleDocId(sheetDocumentId, entry.sheetId, entry.cellId);
    docsToKeep[docId] = true;
    const doc = buildScheduleDoc(
      sheetDocumentId,
      entry.sheetId,
      entry.cellId,
      schedule,
      entry.cell,
    );
    if (!doc) continue;
    const existingDoc = existingById.get(docId) || null;
    const existingNextRunAt =
      existingDoc && existingDoc.nextRunAt instanceof Date
        ? existingDoc.nextRunAt
        : null;
    const scheduleChanged = !sameSchedule(
      existingDoc && existingDoc.schedule,
      schedule,
    );
    let shouldEnqueue = !existingDoc || scheduleChanged || !existingNextRunAt;
    if (
      !scheduleChanged &&
      existingNextRunAt &&
      existingNextRunAt.getTime() > Date.now()
    ) {
      doc.nextRunAt = existingNextRunAt;
      shouldEnqueue = false;
    }
    if (scheduleChanged && existingDoc) {
      await removePendingScheduledRunJobs([docId]);
    }
    await CellSchedules.upsertAsync(
      { _id: doc._id },
      {
        $set: doc,
      },
    );
    if (shouldEnqueue) {
      await enqueueNextScheduledRun(doc);
    }
  }

  const removedIds = [];
  for (let i = 0; i < existing.length; i += 1) {
    if (docsToKeep[String(existing[i]._id || '')]) continue;
    removedIds.push(String(existing[i]._id || ''));
    await CellSchedules.removeAsync(existing[i]._id);
  }
  if (removedIds.length) {
    await removePendingScheduledRunJobs(removedIds);
  }
}

async function enqueueDetectionForChangedCells(sheetDocumentId, changes) {
  for (let i = 0; i < changes.length; i += 1) {
    const change = changes[i];
    const nextCell = isPlainObject(change.next) ? change.next : {};
    const currentSchedule = normalizeCellSchedule(nextCell.schedule);
    if (currentSchedule && currentSchedule.origin === 'manual') continue;

    const sourceText = String(nextCell.source || '');
    const valueText = String(nextCell.value || '');
    const candidates = [];
    if (change.sourceChanged && shouldConsiderScheduleText(sourceText)) {
      candidates.push({ kind: 'source', text: sourceText });
    }
    if (
      change.valueChanged &&
      valueText &&
      valueText !== sourceText &&
      shouldConsiderScheduleText(valueText)
    ) {
      candidates.push({ kind: 'value', text: valueText });
    }

    for (let c = 0; c < candidates.length; c += 1) {
      const candidate = candidates[c];
      await enqueueDurableJob({
        type: 'schedules.detect_cell',
        payload: {
          sheetDocumentId,
          sheetId: change.sheetId,
          cellId: change.cellId,
          sourceKind: candidate.kind,
          text: candidate.text,
          textHash: hashText(candidate.text),
        },
        dedupeKey: [
          sheetDocumentId,
          change.sheetId,
          change.cellId,
          candidate.kind,
          hashText(candidate.text),
        ].join(':'),
        maxAttempts: 2,
        retryDelayMs: 2_000,
      });
    }
  }
}

export async function syncWorkbookSchedulesOnSave({
  sheetDocumentId,
  previousWorkbook,
  nextWorkbook,
}) {
  const workbook = decodeWorkbookDocument(nextWorkbook || {});
  await syncManualSchedules(sheetDocumentId, workbook);
  const changes = extractChangedCells(previousWorkbook, workbook);
  if (changes.length) {
    await enqueueDetectionForChangedCells(sheetDocumentId, changes);
  }
}

export async function removeWorkbookSchedulesAndJobs(sheetDocumentId) {
  const workbookId = String(sheetDocumentId || '');
  if (!workbookId) return { removedSchedules: 0, removedJobs: 0 };
  const existing = await CellSchedules.find({
    sheetDocumentId: workbookId,
  }).fetchAsync();
  const scheduleIds = existing
    .map((entry) => String(entry && entry._id ? entry._id : ''))
    .filter(Boolean);
  const removedRunJobs = scheduleIds.length
    ? await removePendingScheduledRunJobs(scheduleIds)
    : 0;
  const removedDetectJobs =
    await removePendingScheduleDetectionJobsForWorkbook(workbookId);
  const removedSchedules = await CellSchedules.removeAsync({
    sheetDocumentId: workbookId,
  });
  return {
    removedSchedules,
    removedJobs: Number(removedRunJobs || 0) + Number(removedDetectJobs || 0),
  };
}

async function runScheduleDetectionJob(job) {
  const payload = job && job.payload ? job.payload : {};
  const sheetDocumentId = String(payload.sheetDocumentId || '');
  const sheetId = String(payload.sheetId || '');
  const cellId = String(payload.cellId || '').toUpperCase();
  const text = String(payload.text || '');
  const textHash = String(payload.textHash || '');
  const sourceKind = String(payload.sourceKind || 'source');
  if (!sheetDocumentId || !sheetId || !cellId || !text) return null;

  const currentCell = getWorkbookCell(
    (await Sheets.findOneAsync({ _id: sheetDocumentId }, { fields: { workbook: 1 } }))?.workbook || {},
    sheetId,
    cellId,
  );
  if (!currentCell) return null;
  const currentText =
    sourceKind === 'value'
      ? String(currentCell.value || '')
      : String(currentCell.source || '');
  if (hashText(currentText) !== textHash) return null;

  const detected = await detectScheduleFromText(text);
  const docId = scheduleDocId(sheetDocumentId, sheetId, cellId);
  const existingDoc = await CellSchedules.findOneAsync(docId);
  const nextSchedule = await updateWorkbookCellSchedule(
    sheetDocumentId,
    sheetId,
    cellId,
    detected,
    text,
    sourceKind,
  );

  if (nextSchedule) {
    if (existingDoc && !sameSchedule(existingDoc.schedule, nextSchedule)) {
      await removePendingScheduledRunJobs([docId]);
    }
    const currentDoc = buildScheduleDoc(
      sheetDocumentId,
      sheetId,
      cellId,
      nextSchedule,
      currentCell,
    );
    if (currentDoc) {
      await CellSchedules.upsertAsync({ _id: currentDoc._id }, { $set: currentDoc });
      await enqueueNextScheduledRun(currentDoc);
    }
  } else {
    await CellSchedules.removeAsync(docId);
    await removePendingScheduledRunJobs([docId]);
  }
  return { detected: !!nextSchedule };
}

async function recomputeScheduledCell(scheduleDoc) {
  const sheetDocumentId = String(scheduleDoc.sheetDocumentId || '');
  const sheetId = String(scheduleDoc.sheetId || '');
  const cellId = String(scheduleDoc.cellId || '').toUpperCase();
  const sheetDocument = await Sheets.findOneAsync({ _id: sheetDocumentId }, { fields: { workbook: 1 } });
  if (!sheetDocument) return null;
  const persistedWorkbook = decodeWorkbookDocument(sheetDocument.workbook || {});
  const hydratedWorkbook = await hydrateWorkbookAttachmentArtifacts(persistedWorkbook);
  const channelPayloads = await getActiveChannelPayloadMap();
  return computeSheetSnapshot({
    sheetDocumentId,
    workbookData: hydratedWorkbook,
    activeSheetId: sheetId,
    channelPayloads,
    forceRefreshAI: true,
    manualTriggerAI: true,
    changedSignals: [{ kind: 'cell', sheetId, cellId }],
    persistWorkbook: async (nextWorkbook) => {
      const persistedNextWorkbook = stripWorkbookAttachmentInlineData(
        decodeWorkbookDocument(nextWorkbook),
      );
      await Sheets.updateAsync(
        { _id: sheetDocumentId },
        {
          $set: {
            workbook: encodeWorkbookForDocument(persistedNextWorkbook),
            updatedAt: new Date(),
          },
          $unset: { storage: '' },
        },
      );
      await syncWorkbookSchedulesOnSave({
        sheetDocumentId,
        previousWorkbook: persistedWorkbook,
        nextWorkbook: persistedNextWorkbook,
      });
    },
  });
}

async function runScheduledCellJob(job) {
  const payload = job && job.payload ? job.payload : {};
  const scheduleId = String(payload.scheduleId || '');
  if (!scheduleId) return null;
  const scheduleDoc = await CellSchedules.findOneAsync(scheduleId);
  if (!scheduleDoc || scheduleDoc.enabled === false) return null;
  const jobRunAt =
    job && job.runAt instanceof Date ? job.runAt : null;
  const currentNextRunAt =
    scheduleDoc.nextRunAt instanceof Date ? scheduleDoc.nextRunAt : null;
  if (
    jobRunAt &&
    currentNextRunAt &&
    Math.abs(jobRunAt.getTime() - currentNextRunAt.getTime()) > 1_000
  ) {
    return {
      skipped: true,
      reason: 'stale-scheduled-run',
      jobRunAt,
      currentNextRunAt,
    };
  }
  await recomputeScheduledCell(scheduleDoc);
  const now = new Date();
  const nextRunAt = computeCellScheduleNextRun(scheduleDoc.schedule, now);
  await CellSchedules.updateAsync(
    { _id: scheduleId },
    {
      $set: {
        lastRunAt: now,
        nextRunAt,
        updatedAt: now,
      },
    },
  );
  if (nextRunAt) {
    await enqueueNextScheduledRun({ ...scheduleDoc, nextRunAt });
  }
  return { ran: true, nextRunAt };
}

registerJobHandler('schedules.detect_cell', {
  description: 'AI schedule detection for changed workbook cells',
  timeoutMs: 180_000,
  payloadSchema: {
    sheetDocumentId: String,
    sheetId: String,
    cellId: String,
    sourceKind: String,
    text: String,
    textHash: String,
  },
  idempotencyStrategy:
    'dedupeKey is derived from workbook cell id, trigger source, and source text hash',
  run: runScheduleDetectionJob,
});

registerJobHandler('schedules.run_cell', {
  description: 'Recompute a scheduled workbook cell and enqueue its next run',
  timeoutMs: 180_000,
  payloadSchema: {
    scheduleId: String,
  },
  idempotencyStrategy:
    'dedupeKey is derived from schedule id and the scheduled nextRunAt timestamp',
  run: runScheduledCellJob,
});

registerMethods({
    async 'schedules.getCell'(sheetDocumentId, sheetId, cellId) {
      check(sheetDocumentId, String);
      check(sheetId, String);
      check(cellId, String);
      return CellSchedules.findOneAsync(scheduleDocId(sheetDocumentId, sheetId, cellId));
    },
  });
