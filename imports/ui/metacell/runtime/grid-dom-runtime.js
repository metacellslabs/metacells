export {
  forEachInput,
  getFirstAvailableInput,
  getMountedInputs,
  ensureGridCapacityForCellIds,
  ensureGridCapacityForStorage,
  getStorageGridBounds,
  refreshGridReferences,
} from './grid-capacity-runtime.js';

export function applyViewMode(app) {
  var isReport = app.isReportActive();
  app.tableWrap.style.display = isReport ? 'none' : '';
  app.reportWrap.style.display = isReport ? '' : 'none';
}

export function applyActiveSheetLayout(app) {
  if (app.isReportActive()) return;
  app.grid.applySavedSizes(
    (colIndex) => app.storage.getColumnWidth(app.activeSheetId, colIndex),
    (rowIndex) => app.storage.getRowHeight(app.activeSheetId, rowIndex),
  );
}
