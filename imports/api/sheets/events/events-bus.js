const workbookEventListeners = new Set();
const workbookEventSequenceByDocument = new Map();

function nextWorkbookEventSequence(sheetDocumentId) {
  const key = String(sheetDocumentId || '');
  if (!key) return 0;
  const nextValue = Number(workbookEventSequenceByDocument.get(key) || 0) + 1;
  workbookEventSequenceByDocument.set(key, nextValue);
  return nextValue;
}

function normalizeWorkbookEvent(event) {
  const source = event && typeof event === 'object' ? event : {};
  const sheetDocumentId = String(source.sheetDocumentId || '');
  const rawCellPatchBySheet =
    source.cellPatchBySheet && typeof source.cellPatchBySheet === 'object'
      ? source.cellPatchBySheet
      : {};
  const cellPatchBySheet = {};

  Object.keys(rawCellPatchBySheet).forEach((sheetId) => {
    const sheetPatch =
      rawCellPatchBySheet[sheetId] &&
      typeof rawCellPatchBySheet[sheetId] === 'object'
        ? rawCellPatchBySheet[sheetId]
        : null;
    if (!sheetPatch) return;
    const normalizedSheetPatch = {};
    Object.keys(sheetPatch).forEach((cellId) => {
      const patch =
        sheetPatch[cellId] && typeof sheetPatch[cellId] === 'object'
          ? sheetPatch[cellId]
          : null;
      if (!patch) return;
      normalizedSheetPatch[String(cellId || '').toUpperCase()] = {
        clear: patch.clear === true,
        source: String(patch.source || ''),
        generatedBy: String(patch.generatedBy || '').toUpperCase(),
        value: String(patch.value == null ? '' : patch.value),
        displayValue: String(
          patch.displayValue == null ? '' : patch.displayValue,
        ),
        state: String(patch.state || ''),
        error: String(patch.error || ''),
      };
    });
    if (Object.keys(normalizedSheetPatch).length) {
      cellPatchBySheet[String(sheetId || '')] = normalizedSheetPatch;
    }
  });
  return {
    type: String(source.type || ''),
    sheetDocumentId,
    activeSheetId: String(source.activeSheetId || ''),
    revision: String(source.revision || ''),
    sequence: Number.isFinite(source.sequence)
      ? Number(source.sequence)
      : nextWorkbookEventSequence(sheetDocumentId),
    sourceCellId: String(source.sourceCellId || '').toUpperCase(),
    formulaKind: String(source.formulaKind || ''),
    status: String(source.status || ''),
    channelLabel: String(source.channelLabel || '').trim(),
    pendingCellIds: Array.isArray(source.pendingCellIds)
      ? source.pendingCellIds
          .map((cellId) => String(cellId || '').toUpperCase())
          .filter(Boolean)
      : [],
    changedCellIds: Array.isArray(source.changedCellIds)
      ? source.changedCellIds
          .map((cellId) => String(cellId || '').toUpperCase())
          .filter(Boolean)
      : [],
    cellPatchBySheet: cellPatchBySheet,
    timestamp: Number.isFinite(source.timestamp)
      ? Number(source.timestamp)
      : Date.now(),
  };
}

export function subscribeWorkbookEvents(listener) {
  if (typeof listener !== 'function') return function () {};
  workbookEventListeners.add(listener);
  return function () {
    workbookEventListeners.delete(listener);
  };
}

export function publishWorkbookEvent(event) {
  const normalized = normalizeWorkbookEvent(event);
  if (!normalized.type || !normalized.sheetDocumentId) return normalized;
  workbookEventListeners.forEach((listener) => {
    try {
      listener(normalized);
    } catch (error) {}
  });
  return normalized;
}
