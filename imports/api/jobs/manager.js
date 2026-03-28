import { defineModel } from '../../../lib/orm.js';
import { check, Match } from '../../../lib/check.js';
import { registerMethods } from '../../../lib/rpc.js';
import { publishServerEvent } from '../../../server/ws-events.js';

export const ManagedJobs = defineModel('managed_jobs');

const ACTIVE_STATUSES = {
  queued: true,
  leased: true,
  running: true,
  retrying: true,
};

function nowIso() {
  return new Date().toISOString();
}

function isActiveStatus(status) {
  return !!ACTIVE_STATUSES[String(status || '').trim().toLowerCase()];
}

function isLiveLowLevelJob(sourceJob) {
  const job = sourceJob && typeof sourceJob === 'object' ? sourceJob : {};
  const status = String(job.status || '')
    .trim()
    .toLowerCase();
  if (status === 'queued' || status === 'retrying') return true;
  if (status !== 'leased' && status !== 'running') return false;
  if (!job.lockUntil) return false;
  const lockUntil = new Date(job.lockUntil);
  if (Number.isNaN(lockUntil.getTime())) return false;
  return lockUntil.getTime() > Date.now();
}

function deriveJobOwner(sourceJob) {
  const job = sourceJob && typeof sourceJob === 'object' ? sourceJob : {};
  const payload = job.payload && typeof job.payload === 'object' ? job.payload : {};
  const queueMeta =
    payload.queueMeta && typeof payload.queueMeta === 'object'
      ? payload.queueMeta
      : {};

  if (
    queueMeta.sheetDocumentId &&
    queueMeta.activeSheetId &&
    queueMeta.sourceCellId
  ) {
    const sheetDocumentId = String(queueMeta.sheetDocumentId || '').trim();
    const sheetId = String(queueMeta.activeSheetId || '').trim();
    const cellId = String(queueMeta.sourceCellId || '').trim().toUpperCase();
    return {
      ownerType: 'workbook-cell',
      ownerId: `${sheetDocumentId}:${sheetId}:${cellId}`,
      sheetDocumentId,
      sheetId,
      cellId,
    };
  }

  if (job.type === 'files.extract_content' && payload.binaryArtifactId) {
    return {
      ownerType: 'attachment-artifact',
      ownerId: String(payload.binaryArtifactId || '').trim(),
      sheetDocumentId: '',
      sheetId: '',
      cellId: '',
    };
  }

  return {
    ownerType: '',
    ownerId: '',
    sheetDocumentId: '',
    sheetId: '',
    cellId: '',
  };
}

function toManagedJobView(record) {
  const source = record && typeof record === 'object' ? record : {};
  return {
    _id: String(source._id || source.jobId || ''),
    jobId: String(source.jobId || source._id || ''),
    type: String(source.type || ''),
    status: String(source.status || '').toLowerCase(),
    attempts: Number(source.attempts) || 0,
    maxAttempts: Number(source.maxAttempts) || 0,
    dedupeKey: String(source.dedupeKey || ''),
    error: String(source.error || ''),
    uiLabel: String(source.uiLabel || source.type || ''),
    active: source.active !== false,
    ownerType: String(source.ownerType || ''),
    ownerId: String(source.ownerId || ''),
    sheetDocumentId: String(source.sheetDocumentId || ''),
    sheetId: String(source.sheetId || ''),
    cellId: String(source.cellId || '').toUpperCase(),
    createdAt: source.createdAt || null,
    updatedAt: source.updatedAt || null,
    startedAt: source.startedAt || null,
    finishedAt: source.finishedAt || null,
  };
}

async function getJobsModel() {
  const module = await import('./index.js');
  return module.Jobs;
}

async function publishManagedJob(record) {
  const view = toManagedJobView(record);
  if (!view.jobId) return;
  publishServerEvent({
    type: 'jobs.manager.updated',
    scope: 'jobs_manager',
    jobId: view.jobId,
    jobType: view.type,
    jobStatus: view.status,
    payload: view,
  });
}

function buildManagedJobRecord(sourceJob, existing, payload = {}) {
  const owner = deriveJobOwner(sourceJob);
  const status = String(
    (payload && payload.status) || sourceJob.status || '',
  )
    .trim()
    .toLowerCase();
  const active = isLiveLowLevelJob({
    ...(existing && typeof existing === 'object' ? existing : {}),
    ...(sourceJob && typeof sourceJob === 'object' ? sourceJob : {}),
    status,
  });
  const updatedAt =
    (sourceJob && sourceJob.updatedAt) ||
    (sourceJob && sourceJob.completedAt) ||
    new Date();
  return {
    _id: String((existing && existing._id) || sourceJob._id || sourceJob.jobId || ''),
    jobId: String(sourceJob._id || sourceJob.jobId || ''),
    type: String(sourceJob.type || (existing && existing.type) || ''),
    status,
    attempts: Object.prototype.hasOwnProperty.call(payload || {}, 'attempts')
      ? Number(payload.attempts) || 0
      : Number(sourceJob.attempts) || Number((existing && existing.attempts) || 0),
    maxAttempts: Object.prototype.hasOwnProperty.call(payload || {}, 'maxAttempts')
      ? Number(payload.maxAttempts) || 0
      : Number(sourceJob.maxAttempts) || Number((existing && existing.maxAttempts) || 0),
    dedupeKey: String(sourceJob.dedupeKey || (existing && existing.dedupeKey) || ''),
    error: String(
      (payload && payload.message) ||
        sourceJob.lastError ||
        (existing && existing.error) ||
        '',
    ),
    uiLabel: String((existing && existing.uiLabel) || sourceJob.type || ''),
    active,
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    sheetDocumentId: owner.sheetDocumentId,
    sheetId: owner.sheetId,
    cellId: owner.cellId,
    createdAt: (sourceJob && sourceJob.createdAt) || (existing && existing.createdAt) || new Date(),
    updatedAt,
    startedAt:
      (sourceJob && sourceJob.startedAt) || (existing && existing.startedAt) || null,
    finishedAt: active
      ? null
      : (sourceJob && sourceJob.completedAt) ||
        (existing && existing.finishedAt) ||
        updatedAt,
  };
}

export async function reconcileManagedJobsSnapshot() {
  const Jobs = await getJobsModel();
  const activeJobs = await Jobs.find(
    {
      $or: [
        {
          status: {
            $in: ['queued', 'retrying'],
          },
        },
        {
          status: {
            $in: ['leased', 'running'],
          },
          lockUntil: { $gt: new Date() },
        },
      ],
    },
    {
      sort: { updatedAt: -1, createdAt: -1 },
      limit: 1000,
    },
  ).fetchAsync();

  const activeJobIds = new Set();
  const sourceList = Array.isArray(activeJobs) ? activeJobs : [];
  for (let index = 0; index < sourceList.length; index += 1) {
    const sourceJob =
      sourceList[index] && typeof sourceList[index] === 'object'
        ? sourceList[index]
        : null;
    if (!sourceJob) continue;
    const jobId = String(sourceJob._id || sourceJob.jobId || '').trim();
    if (!jobId) continue;
    activeJobIds.add(jobId);
    const existing = await ManagedJobs.findOneAsync({ jobId });
    const nextRecord = buildManagedJobRecord(sourceJob, existing, {});
    if (existing) {
      await ManagedJobs.updateAsync({ _id: existing._id }, { $set: nextRecord });
    } else {
      await ManagedJobs.insertAsync(nextRecord);
    }
  }

  const activeRecords = await ManagedJobs.find({ active: true }).fetchAsync();
  const recordList = Array.isArray(activeRecords) ? activeRecords : [];
  for (let index = 0; index < recordList.length; index += 1) {
    const record =
      recordList[index] && typeof recordList[index] === 'object'
        ? recordList[index]
        : null;
    if (!record) continue;
    const jobId = String(record.jobId || record._id || '').trim();
    if (!jobId || activeJobIds.has(jobId)) continue;
    const timestamp = nowIso();
    const nextRecord = {
      ...record,
      active: false,
      status: isActiveStatus(record.status)
        ? 'completed'
        : String(record.status || '').toLowerCase(),
      finishedAt: record.finishedAt || timestamp,
      updatedAt: timestamp,
    };
    await ManagedJobs.updateAsync({ _id: record._id }, { $set: nextRecord });
    await publishManagedJob(nextRecord);
  }
}

export async function syncManagedJobFromLowLevelEvent(type, job, payload = {}) {
  const sourceJob = job && typeof job === 'object' ? job : {};
  const jobId = String(sourceJob._id || sourceJob.jobId || '').trim();
  if (!jobId) return null;

  const existing = await ManagedJobs.findOneAsync({ jobId });
  const nextRecord = buildManagedJobRecord(sourceJob, existing, payload);

  if (existing) {
    await ManagedJobs.updateAsync(
      { _id: existing._id },
      {
        $set: nextRecord,
      },
    );
  } else {
    await ManagedJobs.insertAsync(nextRecord);
  }

  await publishManagedJob(nextRecord);
  return nextRecord;
}

registerMethods({
  async 'jobs.manager.listActive'(limit = 200) {
    check(limit, Match.Optional(Number));
    await reconcileManagedJobsSnapshot();
    const records = await ManagedJobs.find(
      { active: true },
      {
        sort: { updatedAt: -1, createdAt: -1 },
        limit: Math.max(1, Math.min(1000, parseInt(limit, 10) || 200)),
      },
    ).fetchAsync();
    return (Array.isArray(records) ? records : []).map((item) =>
      toManagedJobView(item),
    );
  },
});
