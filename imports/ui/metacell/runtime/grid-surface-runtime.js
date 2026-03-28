import { buildGridCellMarkup, columnIndexToLabel } from './grid-cell-runtime.js';

function annotateGridHeaderCell(cell, rowIndex, colIndex) {
  if (!cell || !cell.dataset) return;
  if (rowIndex === 0 && colIndex === 0) {
    cell.dataset.testid = 'grid-corner-header';
    return;
  }
  if (rowIndex === 0) {
    cell.dataset.testid = 'grid-column-header';
    cell.dataset.colIndex = String(colIndex || '');
    cell.dataset.colLabel = String(columnIndexToLabel(colIndex) || '');
    return;
  }
  if (colIndex === 0) {
    cell.dataset.testid = 'grid-row-header';
    cell.dataset.rowIndex = String(rowIndex || '');
  }
}

export function buildGridSurface(grid) {
  for (var i = 0; i <= grid.rows; i++) {
    var row = grid.table.insertRow(-1);
    for (var j = 0; j <= grid.cols; j++) {
      var cell = row.insertCell(-1);
      cell.innerHTML = buildGridCellMarkup(i, j);
      annotateGridHeaderCell(cell, i, j);
    }
  }
}

export function appendGridRows(grid, startRowIndex, endRowIndex) {
  for (var rowIndex = startRowIndex; rowIndex <= endRowIndex; rowIndex++) {
    var row = grid.table.insertRow(-1);
    for (var colIndex = 0; colIndex <= grid.cols; colIndex++) {
      var cell = row.insertCell(-1);
      cell.innerHTML = buildGridCellMarkup(rowIndex, colIndex);
      annotateGridHeaderCell(cell, rowIndex, colIndex);
    }
  }
}

export function appendGridColumns(grid, startColIndex, endColIndex) {
  for (var rowIndex = 0; rowIndex < grid.table.rows.length; rowIndex++) {
    var row = grid.table.rows[rowIndex];
    for (var colIndex = startColIndex; colIndex <= endColIndex; colIndex++) {
      var cell = row.insertCell(-1);
      cell.innerHTML = buildGridCellMarkup(rowIndex, colIndex);
      annotateGridHeaderCell(cell, rowIndex, colIndex);
    }
  }
}

export function fitGridRowHeaderColumnWidth(grid) {
  if (!grid.table || !grid.table.rows || !grid.table.rows.length) return;
  var maxLabel = String(Math.max(1, grid.rows));
  var digits = maxLabel.length;
  var width = Math.max(28, 10 + digits * 8);

  for (var r = 0; r < grid.table.rows.length; r++) {
    var cell = grid.table.rows[r].cells[0];
    if (!cell) continue;
    cell.style.width = width + 'px';
    cell.style.minWidth = width + 'px';
    cell.style.maxWidth = width + 'px';
  }
}

export function stabilizeGridHeaderMetrics(grid) {
  if (!grid.table || !grid.table.rows || !grid.table.rows.length) return;
  var headerRow = grid.table.rows[0];
  headerRow.style.height = '24px';
  headerRow.style.minHeight = '24px';
  headerRow.style.maxHeight = '24px';
  for (var c = 0; c < headerRow.cells.length; c++) {
    var headerCell = headerRow.cells[c];
    if (!headerCell) continue;
    headerCell.style.height = '24px';
    headerCell.style.minHeight = '24px';
    headerCell.style.maxHeight = '24px';
    headerCell.style.lineHeight = '24px';
    headerCell.style.boxSizing = 'border-box';
    headerCell.style.overflow = 'hidden';
  }

  for (var r = 1; r < grid.table.rows.length; r++) {
    var row = grid.table.rows[r];
    if (row) {
      row.style.height = grid.defaultRowHeight + 'px';
      row.style.minHeight = grid.defaultRowHeight + 'px';
      row.style.maxHeight = grid.defaultRowHeight + 'px';
    }
    var rowHeader = grid.table.rows[r].cells[0];
    if (!rowHeader) continue;
    rowHeader.style.height = grid.defaultRowHeight + 'px';
    rowHeader.style.minHeight = grid.defaultRowHeight + 'px';
    rowHeader.style.maxHeight = grid.defaultRowHeight + 'px';
    rowHeader.style.lineHeight = grid.defaultRowHeight + 'px';
    rowHeader.style.boxSizing = 'border-box';
    rowHeader.style.overflow = 'hidden';
  }
}

export function installGridResizeHandles(grid, onColumnResize, onRowResize, options) {
  var opts = options && typeof options === 'object' ? options : {};
  var headerRow = grid.table.rows[0];
  var startColumnIndex = Math.max(1, Number(opts.startColumnIndex || 1));
  var startRowIndex = Math.max(1, Number(opts.startRowIndex || 1));

  for (var colIndex = startColumnIndex; colIndex < headerRow.cells.length; colIndex++) {
    var colHeader = headerRow.cells[colIndex];
    if (!colHeader || colHeader.dataset.resizeBound === 'true') continue;
    colHeader.classList.add('col-header');
    colHeader.dataset.resizeBound = 'true';

    var colHandle = document.createElement('div');
    colHandle.className = 'col-resize-handle';
    colHandle.dataset.testid = 'grid-column-resize-handle';
    colHandle.dataset.colIndex = String(colIndex || '');
    colHeader.appendChild(colHandle);

    (function (index) {
      colHandle.addEventListener('mousedown', function (e) {
        e.preventDefault();
        document.body.classList.add('is-column-resizing');
        grid.lockAllColumnWidths();
        var columnRect = grid.table.rows[0].cells[index].getBoundingClientRect();
        var startGuideX = columnRect.right - 1;
        var startLeftX = columnRect.left;
        var didResize = false;
        var pendingGuideX = startGuideX;
        grid.showColumnResizeGuide(startGuideX);

        var onMove = function (moveEvent) {
          pendingGuideX = moveEvent.clientX;
          grid.moveColumnResizeGuide(moveEvent.clientX);
          didResize = true;
        };

        var onUp = function () {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          document.body.classList.remove('is-column-resizing');
          if (didResize) {
            var finalWidth = grid.setColumnWidthFromGuide(index, pendingGuideX, startLeftX);
            onColumnResize(index, finalWidth);
            grid.updateTableSize();
          }
          grid.hideColumnResizeGuide();
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      colHandle.addEventListener('dblclick', function (e) {
        e.preventDefault();
        e.stopPropagation();
        grid.lockAllColumnWidths();
        var fittedWidth = grid.autoFitColumnWidth(index);
        onColumnResize(index, fittedWidth);
        grid.updateTableSize();
      });
    })(colIndex);
  }

  for (var rowIndex = startRowIndex; rowIndex < grid.table.rows.length; rowIndex++) {
    var rowHeader = grid.table.rows[rowIndex].cells[0];
    if (!rowHeader || rowHeader.dataset.resizeBound === 'true') continue;
    rowHeader.classList.add('row-header');
    rowHeader.dataset.resizeBound = 'true';

    var rowHandle = document.createElement('div');
    rowHandle.className = 'row-resize-handle';
    rowHandle.dataset.testid = 'grid-row-resize-handle';
    rowHandle.dataset.rowIndex = String(rowIndex || '');
    rowHeader.appendChild(rowHandle);

    (function (index) {
      rowHandle.addEventListener('mousedown', function (e) {
        e.preventDefault();
        var startY = e.clientY;
        var startHeight = grid.table.rows[index].offsetHeight;

        var onMove = function (moveEvent) {
          var finalHeight = grid.setRowHeight(
            index,
            startHeight + (moveEvent.clientY - startY),
          );
          onRowResize(index, finalHeight);
          grid.updateTableSize();
        };

        var onUp = function () {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    })(rowIndex);
  }
}
