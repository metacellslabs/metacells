import { MIN_COL_WIDTH } from './constants.js';

export function setGridColumnWidth(grid, colIndex, width) {
  var finalWidth = Math.max(MIN_COL_WIDTH, width);
  for (var r = 0; r < grid.table.rows.length; r++) {
    var cell = grid.table.rows[r].cells[colIndex];
    if (!cell) continue;
    cell.style.width = finalWidth + 'px';
    cell.style.minWidth = finalWidth + 'px';
    cell.style.maxWidth = finalWidth + 'px';
  }
  return finalWidth;
}

export function lockGridColumnWidths(grid) {
  if (!grid.table || !grid.table.rows || !grid.table.rows.length) return;
  var headerRow = grid.table.rows[0];
  if (!headerRow || !headerRow.cells || !headerRow.cells.length) return;
  for (var colIndex = 0; colIndex < headerRow.cells.length; colIndex++) {
    var cell = headerRow.cells[colIndex];
    if (!cell) continue;
    grid.setColumnWidth(colIndex, cell.offsetWidth);
  }
}

export function setGridRowHeight(grid, rowIndex, height) {
  var finalHeight = Math.max(grid.defaultRowHeight, height);
  var row = grid.table.rows[rowIndex];
  if (row) {
    row.style.height = finalHeight + 'px';
    row.style.minHeight = finalHeight + 'px';
    row.style.maxHeight = finalHeight + 'px';
  }
  for (var c = 0; c < row.cells.length; c++) {
    row.cells[c].style.height = finalHeight + 'px';
    row.cells[c].style.minHeight = finalHeight + 'px';
    row.cells[c].style.maxHeight = finalHeight + 'px';
  }
  return finalHeight;
}

export function applyGridSavedSizes(grid, getColumnWidth, getRowHeight) {
  for (var colIndex = 1; colIndex < grid.table.rows[0].cells.length; colIndex++) {
    grid.setColumnWidth(colIndex, grid.defaultColWidth);
    var colWidth = getColumnWidth(colIndex);
    if (colWidth != null) grid.setColumnWidth(colIndex, colWidth);
  }

  for (var rowIndex = 1; rowIndex < grid.table.rows.length; rowIndex++) {
    grid.setRowHeight(rowIndex, grid.defaultRowHeight);
    var rowHeight = getRowHeight(rowIndex);
    if (rowHeight != null) grid.setRowHeight(rowIndex, rowHeight);
  }

  grid.updateTableSize();
  grid.stabilizeHeaderMetrics();
}

export function resetGridColumnWidths(grid, clearColumnWidth) {
  for (var colIndex = 1; colIndex < grid.table.rows[0].cells.length; colIndex++) {
    clearColumnWidth(colIndex);
    grid.setColumnWidth(colIndex, grid.defaultColWidth);
  }
  grid.updateTableSize();
}

export function updateGridTableSize(grid) {
  if (!grid.table.rows.length) return;

  var headerRow = grid.table.rows[0];
  var wrap = grid.table.parentElement;

  grid.table.style.width = '';
  grid.table.style.height = '';

  var totalWidth = 0;
  if (headerRow && headerRow.cells.length) {
    var firstCellRect = headerRow.cells[0].getBoundingClientRect();
    var lastCellRect = headerRow.cells[headerRow.cells.length - 1].getBoundingClientRect();
    totalWidth = Math.ceil(lastCellRect.right - firstCellRect.left);
  }
  totalWidth = Math.max(
    totalWidth,
    Math.ceil(grid.table.scrollWidth || 0),
    wrap ? Math.ceil(wrap.clientWidth || 0) : 0,
  );

  var totalHeight = 0;
  for (var r = 0; r < grid.table.rows.length; r++) {
    totalHeight += grid.table.rows[r].offsetHeight;
  }

  grid.table.style.width = totalWidth + 'px';
  grid.table.style.height = totalHeight + 'px';
}
