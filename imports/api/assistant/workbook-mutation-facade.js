import { buildAttachmentSourceValue } from '../artifacts/index.js';

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function buildAttachmentSourceFromUpload(upload) {
  if (!upload) throw new Error('Assistant upload not found');
  return buildAttachmentSourceValue({
    name: String(upload.name || 'Attached file'),
    type: String(upload.type || ''),
    content: '',
    contentArtifactId: String(upload.contentArtifactId || ''),
    binaryArtifactId: String(upload.binaryArtifactId || ''),
    downloadUrl: String(upload.downloadUrl || ''),
    previewUrl: String(upload.previewUrl || ''),
    pending: false,
  });
}

export function clearWorkbookCell(context, sheetId, cellId) {
  context.storage.setCellSchedule(sheetId, cellId, null);
  context.storage.setCellValue(sheetId, cellId, '');
}

export function setWorkbookCellSource(context, sheetId, cellId, source) {
  context.storage.setCellValue(sheetId, cellId, String(source || ''));
}

export function setWorkbookCellFromUpload(context, sheetId, cellId, upload) {
  context.storage.setCellValue(
    sheetId,
    cellId,
    buildAttachmentSourceFromUpload(upload),
  );
}

export function setWorkbookCellPresentation(context, sheetId, cellId, presentation) {
  if (!isPlainObject(presentation)) return;
  context.storage.setCellPresentation(sheetId, cellId, presentation);
}

export function setWorkbookCellSchedule(context, sheetId, cellId, schedule) {
  context.storage.setCellSchedule(sheetId, cellId, schedule == null ? null : schedule);
}
