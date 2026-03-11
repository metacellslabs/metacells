import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { createHash, randomUUID } from 'node:crypto';

export const Artifacts = new Mongo.Collection('artifacts');

export function buildArtifactPath(artifactId) {
  return `/artifacts/${encodeURIComponent(String(artifactId || ''))}`;
}

function nowDate() {
  return new Date();
}

function normalizeOwner(owner) {
  const source = owner && typeof owner === 'object' ? owner : {};
  return {
    ownerType: String(source.ownerType || '').trim(),
    ownerId: String(source.ownerId || '').trim(),
    scope: String(source.scope || '').trim(),
  };
}

function buildArtifactHash(prefix, payload) {
  return createHash('sha256')
    .update(`${prefix}\n${String(payload || '')}`)
    .digest('hex');
}

export async function createTextArtifact({
  text,
  mimeType = 'text/plain; charset=utf-8',
  fileName = '',
  owner = null,
}) {
  const value = String(text || '');
  const hash = buildArtifactHash('text', `${mimeType}\n${fileName}\n${value}`);
  const existing = await Artifacts.findOneAsync({ hash, kind: 'text' });
  if (existing) return existing;

  const doc = {
    _id: randomUUID(),
    kind: 'text',
    mimeType: String(mimeType || 'text/plain; charset=utf-8'),
    fileName: String(fileName || ''),
    size: Buffer.byteLength(value, 'utf8'),
    hash,
    text: value,
    ...normalizeOwner(owner),
    createdAt: nowDate(),
  };
  await Artifacts.insertAsync(doc);
  return doc;
}

export async function createBinaryArtifact({
  base64Data,
  mimeType = 'application/octet-stream',
  fileName = '',
  owner = null,
}) {
  const normalizedBase64 = String(base64Data || '');
  const hash = buildArtifactHash(
    'binary',
    `${mimeType}\n${fileName}\n${normalizedBase64}`,
  );
  const existing = await Artifacts.findOneAsync({ hash, kind: 'binary' });
  if (existing) return existing;

  const size = Buffer.from(normalizedBase64, 'base64').length;
  const doc = {
    _id: randomUUID(),
    kind: 'binary',
    mimeType: String(mimeType || 'application/octet-stream'),
    fileName: String(fileName || ''),
    size,
    hash,
    base64Data: normalizedBase64,
    ...normalizeOwner(owner),
    createdAt: nowDate(),
  };
  await Artifacts.insertAsync(doc);
  return doc;
}

export async function getArtifactById(artifactId) {
  if (!artifactId) return null;
  return Artifacts.findOneAsync({ _id: String(artifactId) });
}

export async function getArtifactText(artifactId) {
  const artifact = await getArtifactById(artifactId);
  if (!artifact || artifact.kind !== 'text') return '';
  return String(artifact.text || '');
}

export async function getArtifactBinary(artifactId) {
  const artifact = await getArtifactById(artifactId);
  if (!artifact || artifact.kind !== 'binary') return null;
  return {
    mimeType: String(artifact.mimeType || 'application/octet-stream'),
    fileName: String(artifact.fileName || 'artifact'),
    buffer: Buffer.from(String(artifact.base64Data || ''), 'base64'),
  };
}

export function parseAttachmentSourceValue(rawValue) {
  const raw = String(rawValue == null ? '' : rawValue);
  if (raw.indexOf('__ATTACHMENT__:') !== 0) return null;
  try {
    const parsed = JSON.parse(raw.substring('__ATTACHMENT__:'.length));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    return null;
  }
}

export function buildAttachmentSourceValue(payload) {
  return `__ATTACHMENT__:${JSON.stringify(payload || {})}`;
}

export async function hydrateWorkbookAttachmentArtifacts(workbookValue) {
  const workbook =
    workbookValue && typeof workbookValue === 'object'
      ? JSON.parse(JSON.stringify(workbookValue))
      : {};
  const sheets =
    workbook && workbook.sheets && typeof workbook.sheets === 'object'
      ? workbook.sheets
      : {};

  for (const sheetId of Object.keys(sheets)) {
    const sheet = sheets[sheetId];
    const cells =
      sheet && sheet.cells && typeof sheet.cells === 'object'
        ? sheet.cells
        : {};
    for (const cellId of Object.keys(cells)) {
      const cell = cells[cellId];
      if (!cell || typeof cell !== 'object') continue;
      const attachment = parseAttachmentSourceValue(cell.source);
      if (!attachment) continue;
      if (attachment.content || !attachment.contentArtifactId) continue;
      const content = await getArtifactText(
        String(attachment.contentArtifactId || ''),
      );
      cell.source = buildAttachmentSourceValue({
        ...attachment,
        content: String(content || ''),
      });
    }
  }

  return workbook;
}

export function stripWorkbookAttachmentInlineData(workbookValue) {
  const workbook =
    workbookValue && typeof workbookValue === 'object'
      ? JSON.parse(JSON.stringify(workbookValue))
      : {};
  const sheets =
    workbook && workbook.sheets && typeof workbook.sheets === 'object'
      ? workbook.sheets
      : {};

  for (const sheetId of Object.keys(sheets)) {
    const sheet = sheets[sheetId];
    const cells =
      sheet && sheet.cells && typeof sheet.cells === 'object'
        ? sheet.cells
        : {};
    for (const cellId of Object.keys(cells)) {
      const cell = cells[cellId];
      if (!cell || typeof cell !== 'object') continue;
      const attachment = parseAttachmentSourceValue(cell.source);
      if (!attachment) continue;
      cell.source = buildAttachmentSourceValue({
        ...attachment,
        content: '',
      });
    }
  }

  return workbook;
}

if (Meteor.isServer) {
  Meteor.methods({
    async 'artifacts.get'(artifactId) {
      return getArtifactById(String(artifactId || ''));
    },
  });
}
