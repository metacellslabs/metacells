function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function getWorkbookSheetCells(workbookValue, sheetId) {
  const workbook = isPlainObject(workbookValue) ? workbookValue : {};
  const sheets = isPlainObject(workbook.sheets) ? workbook.sheets : {};
  const sheet = isPlainObject(sheets[sheetId]) ? sheets[sheetId] : null;
  return sheet && isPlainObject(sheet.cells) ? sheet.cells : null;
}

export function getWorkbookCellRecord(workbookValue, sheetId, cellId) {
  const cells = getWorkbookSheetCells(workbookValue, sheetId);
  if (!cells) return null;
  const normalizedCellId = String(cellId || '').toUpperCase();
  return isPlainObject(cells[normalizedCellId]) ? cells[normalizedCellId] : null;
}

export function listWorkbookCellEntries(workbookValue) {
  const workbook = isPlainObject(workbookValue) ? workbookValue : {};
  const sheets = isPlainObject(workbook.sheets) ? workbook.sheets : {};
  const entries = [];

  Object.keys(sheets).forEach((sheetId) => {
    const cells = getWorkbookSheetCells(workbook, sheetId);
    if (!cells) return;
    Object.keys(cells).forEach((cellId) => {
      const cell = isPlainObject(cells[cellId]) ? cells[cellId] : null;
      if (!cell) return;
      entries.push({
        sheetId: String(sheetId || ''),
        cellId: String(cellId || '').toUpperCase(),
        cell,
      });
    });
  });

  return entries;
}

export function cloneCellRecordWithSource(cellValue, source) {
  const cell = isPlainObject(cellValue) ? cellValue : {};
  return {
    ...cell,
    source: String(source || ''),
  };
}

export function cloneCellRecordWithSchedule(cellValue, schedule) {
  const cell = isPlainObject(cellValue) ? cellValue : {};
  return {
    ...cell,
    schedule,
  };
}

export function cloneCellRecordWithComputedValue(cellValue, value) {
  const cell = isPlainObject(cellValue) ? cellValue : {};
  return {
    ...cell,
    value: String(value == null ? '' : value),
    state: 'resolved',
  };
}

export function getCellSourceText(cellValue) {
  const cell = isPlainObject(cellValue) ? cellValue : null;
  return cell ? String(cell.source || '') : '';
}

export function getCellRuntimeValueText(cellValue) {
  const cell = isPlainObject(cellValue) ? cellValue : null;
  return cell ? String(cell.value || '') : '';
}

export function getCellDisplayValueText(cellValue) {
  const cell = isPlainObject(cellValue) ? cellValue : null;
  if (!cell) return '';
  return String(
    Object.prototype.hasOwnProperty.call(cell, 'displayValue')
      ? cell.displayValue
      : cell.value,
  );
}

export function getCellGeneratedByText(cellValue) {
  const cell = isPlainObject(cellValue) ? cellValue : null;
  return cell ? String(cell.generatedBy || '').toUpperCase() : '';
}

export function getCellStateText(cellValue) {
  const cell = isPlainObject(cellValue) ? cellValue : null;
  return cell ? String(cell.state || '') : '';
}

export function getCellErrorText(cellValue) {
  const cell = isPlainObject(cellValue) ? cellValue : null;
  return cell ? String(cell.error || '') : '';
}

export function buildWorkbookCellPatchRecordFromCell(cellValue) {
  const cell = isPlainObject(cellValue) ? cellValue : null;
  if (!cell) return { clear: true };
  return {
    source: getCellSourceText(cell),
    generatedBy: getCellGeneratedByText(cell),
    value: getCellRuntimeValueText(cell),
    displayValue: getCellDisplayValueText(cell),
    state: getCellStateText(cell),
    error: getCellErrorText(cell),
  };
}

export function normalizeRuntimeCellForDiffRecord(cellValue) {
  const cell = isPlainObject(cellValue) ? cellValue : null;
  if (!cell) return null;
  return {
    source: getCellSourceText(cell),
    generatedBy: getCellGeneratedByText(cell),
    value: getCellRuntimeValueText(cell),
    displayValue: getCellDisplayValueText(cell),
    state: getCellStateText(cell),
    error: getCellErrorText(cell),
  };
}

export function buildRuntimeCellSnapshotFromRecord(cellValue) {
  const cell = isPlainObject(cellValue) ? cellValue : null;
  if (!cell) return null;

  const generatedBy = String(cell.generatedBy || '').toUpperCase();
  const snapshot = {};

  if (generatedBy) snapshot.generatedBy = generatedBy;
  if (Object.prototype.hasOwnProperty.call(cell, 'value')) {
    snapshot.value = String(cell.value == null ? '' : cell.value);
  }
  if (Object.prototype.hasOwnProperty.call(cell, 'displayValue')) {
    snapshot.displayValue = String(
      cell.displayValue == null ? cell.value || '' : cell.displayValue,
    );
  }
  if (Object.prototype.hasOwnProperty.call(cell, 'state')) {
    snapshot.state = String(cell.state || '');
  }
  if (Object.prototype.hasOwnProperty.call(cell, 'error')) {
    snapshot.error = String(cell.error || '');
  }
  if (
    cell.lastProcessedChannelEventIds &&
    typeof cell.lastProcessedChannelEventIds === 'object'
  ) {
    snapshot.lastProcessedChannelEventIds = {
      ...cell.lastProcessedChannelEventIds,
    };
  }
  if (cell.channelFeedMeta && typeof cell.channelFeedMeta === 'object') {
    snapshot.channelFeedMeta = {
      ...cell.channelFeedMeta,
    };
  }
  if (Object.prototype.hasOwnProperty.call(cell, 'computedVersion')) {
    snapshot.computedVersion = Number(cell.computedVersion || 0);
  }
  if (Object.prototype.hasOwnProperty.call(cell, 'dependencyVersion')) {
    snapshot.dependencyVersion = Number(cell.dependencyVersion || 0);
  }
  if (Object.prototype.hasOwnProperty.call(cell, 'dependencySignature')) {
    snapshot.dependencySignature = String(cell.dependencySignature || '');
  }

  return Object.keys(snapshot).length ? snapshot : null;
}

export function hasRuntimeCellFields(cellValue) {
  const cell = isPlainObject(cellValue) ? cellValue : null;
  if (!cell) return false;
  return !!(
    String(cell.generatedBy || '').toUpperCase() ||
    String(cell.state || '') ||
    String(cell.error || '') ||
    String(cell.displayValue || '') ||
    String(cell.value || '') ||
    cell.channelFeedMeta ||
    (cell.lastProcessedChannelEventIds &&
      typeof cell.lastProcessedChannelEventIds === 'object' &&
      Object.keys(cell.lastProcessedChannelEventIds).length) ||
    Number(cell.computedVersion || 0) ||
    Number(cell.dependencyVersion || 0) ||
    String(cell.dependencySignature || '')
  );
}

export function normalizeDocumentPersistCellRecord(cellValue) {
  const cell = isPlainObject(cellValue) ? { ...cellValue } : null;
  if (!cell) return null;

  const source = String(cell.source || '');
  const generatedBy = String(cell.generatedBy || '').toUpperCase();
  const isFormula = !!source && /^[='>#]/.test(source);

  if (!source && generatedBy) {
    return null;
  }

  if (isFormula) {
    return {
      ...cell,
      value: '',
      displayValue: '',
      state: 'stale',
      error: '',
      lastProcessedChannelEventIds: {},
      channelFeedMeta: null,
      computedVersion: 0,
      dependencyVersion: 0,
      dependencySignature: '',
    };
  }

  const nextVersion = Number(cell.sourceVersion || cell.version || 1) || 1;
  return {
    ...cell,
    value: source,
    displayValue: source,
    state: source ? 'resolved' : '',
    error: '',
    lastProcessedChannelEventIds: {},
    channelFeedMeta: null,
    computedVersion: nextVersion,
    dependencyVersion: nextVersion,
    dependencySignature: '',
  };
}
