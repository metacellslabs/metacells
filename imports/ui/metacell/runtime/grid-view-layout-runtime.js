import { DEFAULT_ROW_HEIGHT } from './constants.js';

export function getMountedRowRange(app, options) {
  var opts = options && typeof options === 'object' ? options : {};
  if (opts.includeAllRows === true || !app) {
    return getFullRowRange(app);
  }

  var mounted = app.mountedRowRange;
  if (
    mounted &&
    Number.isFinite(mounted.startRow) &&
    Number.isFinite(mounted.endRow) &&
    mounted.startRow >= 1 &&
    mounted.endRow >= mounted.startRow
  ) {
    return {
      startRow: mounted.startRow,
      endRow: mounted.endRow,
    };
  }
  return getFullRowRange(app);
}

export function forEachRowInRange(app, callback, options) {
  if (!app || typeof callback !== 'function') return;
  var range = getMountedRowRange(app, options);
  if (!range) return;

  var includeHeader = !!(options && options.includeHeader);
  if (includeHeader) {
    var headerRow =
      typeof app.getTableRowElement === 'function'
        ? app.getTableRowElement(0)
        : app.table && app.table.rows
          ? app.table.rows[0]
          : null;
    if (headerRow) callback(headerRow, 0);
  }

  for (var rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex++) {
    var row =
      typeof app.getTableRowElement === 'function'
        ? app.getTableRowElement(rowIndex)
        : app.table && app.table.rows
          ? app.table.rows[rowIndex]
          : null;
    if (!row) continue;
    callback(row, rowIndex);
  }
}

function getFullRowRange(app) {
  if (!app || !app.table || !app.table.rows || !app.table.rows.length) {
    return null;
  }
  return {
    startRow: 1,
    endRow: Math.max(1, app.table.rows.length - 1),
  };
}

export function captureRenderedRowHeights(app) {
  if (!app.table || !app.table.rows || !app.table.rows.length) return [];
  var heights = [];
  forEachRowInRange(
    app,
    function (row, rowIndex) {
      heights[rowIndex] = row
        ? Math.max(0, Math.round(row.offsetHeight || 0))
        : 0;
    },
    { includeHeader: true, includeAllRows: true },
  );
  return heights;
}

export function applyRenderedRowHeights(app, heights) {
  if (
    !Array.isArray(heights) ||
    !heights.length ||
    !app.table ||
    !app.table.rows ||
    !app.table.rows.length
  ) {
    return;
  }

  var headerHeight = Math.max(24, Number(heights[0] || 24));
  var headerRow =
    typeof app.getTableRowElement === 'function'
      ? app.getTableRowElement(0)
      : app.table.rows[0];
  if (headerRow) {
    headerRow.style.height = headerHeight + 'px';
    headerRow.style.minHeight = headerHeight + 'px';
    headerRow.style.maxHeight = headerHeight + 'px';
    for (
      var headerColIndex = 0;
      headerColIndex < headerRow.cells.length;
      headerColIndex++
    ) {
      var headerCell = headerRow.cells[headerColIndex];
      if (!headerCell) continue;
      headerCell.style.height = headerHeight + 'px';
      headerCell.style.minHeight = headerHeight + 'px';
      headerCell.style.maxHeight = headerHeight + 'px';
      headerCell.style.lineHeight = headerHeight + 'px';
    }
  }

  forEachRowInRange(
    app,
    function (_, rowIndex) {
      var nextHeight = Math.max(
        DEFAULT_ROW_HEIGHT,
        Number(heights[rowIndex] || DEFAULT_ROW_HEIGHT),
      );
      if (app.grid && typeof app.grid.setRowHeight === 'function') {
        app.grid.setRowHeight(rowIndex, nextHeight);
      }
    },
    { includeAllRows: true },
  );

  if (app.grid && typeof app.grid.updateTableSize === 'function') {
    app.grid.updateTableSize();
  }
}
