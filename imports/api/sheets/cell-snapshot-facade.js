import {
  getWorkbookCellRecord,
  getWorkbookSheetCells,
  listWorkbookCellEntries,
} from './cell-record-helpers.js';

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function getWorkbookSheetRecord(workbookValue, sheetId) {
  const workbook = isPlainObject(workbookValue) ? workbookValue : {};
  const sheets = isPlainObject(workbook.sheets) ? workbook.sheets : {};
  return isPlainObject(sheets[sheetId]) ? sheets[sheetId] : null;
}

export function listWorkbookSheetIds(workbookValue) {
  const workbook = isPlainObject(workbookValue) ? workbookValue : {};
  const sheets = isPlainObject(workbook.sheets) ? workbook.sheets : {};
  return Object.keys(sheets);
}

export function listWorkbookSheetCellEntries(workbookValue, sheetId) {
  return listWorkbookCellEntries(workbookValue).filter(
    (entry) => String((entry && entry.sheetId) || '') === String(sheetId || ''),
  );
}

export function setWorkbookCellRecord(
  workbookValue,
  sheetId,
  cellId,
  cellValue,
  sheetPatch = {},
) {
  const workbook = isPlainObject(workbookValue) ? workbookValue : {};
  if (!isPlainObject(workbook.sheets)) workbook.sheets = {};
  const normalizedSheetId = String(sheetId || '');
  const normalizedCellId = String(cellId || '').toUpperCase();
  if (!normalizedSheetId || !normalizedCellId) return null;

  const existingSheet = getWorkbookSheetRecord(workbook, normalizedSheetId);
  const nextSheet = {
    ...(existingSheet || {}),
    ...sheetPatch,
    cells: {
      ...(getWorkbookSheetCells(workbook, normalizedSheetId) || {}),
    },
  };
  nextSheet.cells[normalizedCellId] = cellValue;
  workbook.sheets[normalizedSheetId] = nextSheet;
  return nextSheet.cells[normalizedCellId];
}

export function deleteWorkbookCellRecord(workbookValue, sheetId, cellId) {
  const workbook = isPlainObject(workbookValue) ? workbookValue : {};
  const normalizedSheetId = String(sheetId || '');
  const normalizedCellId = String(cellId || '').toUpperCase();
  const existingSheet = getWorkbookSheetRecord(workbook, normalizedSheetId);
  if (!existingSheet) return false;
  const existingCells = getWorkbookSheetCells(workbook, normalizedSheetId);
  if (!existingCells || !Object.prototype.hasOwnProperty.call(existingCells, normalizedCellId)) {
    return false;
  }

  const nextCells = { ...existingCells };
  delete nextCells[normalizedCellId];
  workbook.sheets[normalizedSheetId] = {
    ...existingSheet,
    cells: nextCells,
  };
  return true;
}

export function getWorkbookCellPatchSnapshot(workbookValue, sheetId, cellId) {
  return getWorkbookCellRecord(workbookValue, sheetId, cellId);
}
