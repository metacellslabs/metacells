export function setupGridResizing(app) {
  app.grid.installResizeHandles(
    (colIndex, width) =>
      app.storage.setColumnWidth(app.activeSheetId, colIndex, width),
    (rowIndex, height) =>
      app.storage.setRowHeight(app.activeSheetId, rowIndex, height),
  );
}

export function setupColumnSort(app) {
  var headerRow = app.table.rows[0];
  for (var colIndex = 1; colIndex < headerRow.cells.length; colIndex++) {
    var cell = headerRow.cells[colIndex];
    var text = cell.textContent;
    cell.textContent = '';
    var label = document.createElement('span');
    label.textContent = text;
    var sortBtn = document.createElement('button');
    sortBtn.type = 'button';
    sortBtn.className = 'sort-button';
    sortBtn.textContent = '⇅';
    sortBtn.dataset.colIndex = String(colIndex);
    sortBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      var idx = parseInt(e.currentTarget.dataset.colIndex, 10);
      app.toggleSortByColumn(idx);
    });
    cell.appendChild(label);
    cell.appendChild(sortBtn);
  }
}

export function getSortState(app) {
  if (!app.sortStateBySheet[app.activeSheetId]) {
    app.sortStateBySheet[app.activeSheetId] = {};
  }
  return app.sortStateBySheet[app.activeSheetId];
}

export function normalizeSortValue(app, value) {
  if (value == null || value === '')
    return { empty: true, type: 'string', value: '' };
  if (typeof value === 'number' && !isNaN(value))
    return { empty: false, type: 'number', value: value };
  var n = parseFloat(value);
  if (!isNaN(n) && String(value).trim() !== '')
    return { empty: false, type: 'number', value: n };
  return { empty: false, type: 'string', value: String(value).toLowerCase() };
}

export function compareSortValues(app, a, b, direction) {
  if (a.empty && b.empty) return 0;
  if (a.empty) return 1;
  if (b.empty) return -1;

  var multiplier = direction === 'desc' ? -1 : 1;
  if (a.type === 'number' && b.type === 'number') {
    if (a.value === b.value) return 0;
    return a.value < b.value ? -1 * multiplier : 1 * multiplier;
  }

  var left = String(a.value);
  var right = String(b.value);
  var cmp = left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
  if (cmp === 0) return 0;
  return cmp < 0 ? -1 * multiplier : 1 * multiplier;
}

export function toggleSortByColumn(app, colIndex) {
  var state = app.getSortState();
  var current = state[colIndex];
  var next = current === 'asc' ? 'desc' : 'asc';
  state.colIndex = colIndex;
  state[colIndex] = next;
  app.captureHistorySnapshot('sort:' + app.activeSheetId);

  app.runWithAISuppressed(() => {
    app.sortRowsByColumn(colIndex, next);
  });
  app.updateSortIcons();
}

export function sortRowsByColumn(app, colIndex, direction, skipCompute) {
  var rows = [];
  var rowCount = app.table.rows.length;
  var colCount = app.table.rows[0].cells.length;

  for (var rowIndex = 1; rowIndex < rowCount; rowIndex++) {
    var keyCellId = app.cellIdFrom(colIndex, rowIndex);
    var keyValue;
    try {
      var cache = app.computedValuesBySheet[app.activeSheetId] || {};
      keyValue = Object.prototype.hasOwnProperty.call(cache, keyCellId)
        ? cache[keyCellId]
        : app.getRawCellValue(keyCellId);
    } catch (e) {
      keyValue = app.getRawCellValue(keyCellId);
    }

    var raw = {};
    for (var c = 1; c < colCount; c++) {
      var cellId = app.cellIdFrom(c, rowIndex);
      raw[c] = app.getRawCellValue(cellId);
    }

    rows.push({
      sourceRowIndex: rowIndex,
      sortValue: app.normalizeSortValue(keyValue),
      raw: raw,
    });
  }

  rows.sort((a, b) =>
    app.compareSortValues(a.sortValue, b.sortValue, direction),
  );

  for (var targetRow = 1; targetRow < rowCount; targetRow++) {
    var source = rows[targetRow - 1];
    var dRow = targetRow - source.sourceRowIndex;
    for (var col = 1; col < colCount; col++) {
      var targetCellId = app.cellIdFrom(col, targetRow);
      var rawValue = source.raw[col] || '';
      var nextValue =
        rawValue.charAt(0) === '='
          ? app.shiftFormulaReferences(rawValue, dRow, 0)
          : rawValue;
      app.setRawCellValue(targetCellId, nextValue);
    }
  }

  if (!skipCompute) app.computeAll();
}

export function updateSortIcons(app) {
  var state = app.getSortState();
  var activeCol = state.colIndex;
  var headerRow = app.table.rows[0];

  for (var colIndex = 1; colIndex < headerRow.cells.length; colIndex++) {
    var btn = headerRow.cells[colIndex].querySelector('.sort-button');
    if (!btn) continue;
    var isActive = colIndex === activeCol && !!state[colIndex];
    btn.classList.toggle('sort-active', isActive);
    if (isActive && state[colIndex] === 'asc') btn.textContent = '↑';
    else if (isActive && state[colIndex] === 'desc') btn.textContent = '↓';
    else btn.textContent = '⇅';
  }
}

export function applyAutoResort(app) {
  if (app.isResorting) return;
  var state = app.getSortState();
  var colIndex = state.colIndex;
  var direction = colIndex ? state[colIndex] : null;
  if (!colIndex || !direction) return false;

  app.isResorting = true;
  try {
    app.runWithAISuppressed(() => {
      app.sortRowsByColumn(colIndex, direction, true);
    });
    return true;
  } finally {
    app.isResorting = false;
  }
}

export function getSelectedRowBounds(app) {
  var maxCol = app.table.rows[0].cells.length - 1;
  if (
    app.selectionRange &&
    app.selectionRange.startCol === 1 &&
    app.selectionRange.endCol === maxCol
  ) {
    return {
      start: app.selectionRange.startRow,
      end: app.selectionRange.endRow,
    };
  }
  if (app.contextMenuState && app.contextMenuState.type === 'row') {
    return {
      start: app.contextMenuState.index,
      end: app.contextMenuState.index,
    };
  }
  if (app.activeInput) {
    var parsed = app.parseCellId(app.activeInput.id);
    if (parsed) return { start: parsed.row, end: parsed.row };
  }
  return null;
}

function remapIndexForStructureEdit(index, start, count, mode) {
  var value = Number(index) || 0;
  var anchor = Number(start) || 0;
  var size = Math.max(1, Number(count) || 1);
  if (mode === 'insert') {
    return value >= anchor ? value + size : value;
  }
  if (mode !== 'delete') return value;
  if (value < anchor) return value;
  if (value >= anchor + size) return value - size;
  return anchor;
}

function remapRangeForStructureDelete(startIndex, endIndex, deleteStart, count) {
  var rangeStart = Number(startIndex) || 0;
  var rangeEnd = Number(endIndex) || 0;
  var anchor = Number(deleteStart) || 0;
  var size = Math.max(1, Number(count) || 1);
  var deleteEnd = anchor + size - 1;

  if (rangeEnd < anchor) {
    return { start: rangeStart, end: rangeEnd };
  }
  if (rangeStart > deleteEnd) {
    return {
      start: rangeStart - size,
      end: rangeEnd - size,
    };
  }

  var nextStart = rangeStart < anchor ? rangeStart : anchor;
  var nextEnd = rangeEnd > deleteEnd ? rangeEnd - size : anchor;
  if (nextEnd < nextStart) nextEnd = nextStart;
  return { start: nextStart, end: nextEnd };
}

export function remapNamedCellsForStructureEdit(
  namedCells,
  axis,
  start,
  count,
  mode,
  helpers,
) {
  var source = namedCells && typeof namedCells === 'object' ? namedCells : {};
  var result = {};
  var direction = axis === 'col' ? 'col' : 'row';
  var parseCellId =
    helpers && typeof helpers.parseCellId === 'function'
      ? helpers.parseCellId
      : null;
  var formatCellId =
    helpers && typeof helpers.formatCellId === 'function'
      ? helpers.formatCellId
      : null;
  if (!parseCellId || !formatCellId) return { ...source };

  Object.keys(source).forEach((name) => {
    var ref = source[name];
    if (!ref || typeof ref !== 'object' || !ref.sheetId) {
      result[name] = ref;
      return;
    }

    if (ref.cellId) {
      var parsed = parseCellId(ref.cellId);
      if (!parsed) {
        result[name] = ref;
        return;
      }
      var nextRow = parsed.row;
      var nextCol = parsed.col;
      if (direction === 'row') {
        nextRow = remapIndexForStructureEdit(parsed.row, start, count, mode);
      } else {
        nextCol = remapIndexForStructureEdit(parsed.col, start, count, mode);
      }
      result[name] = {
        sheetId: ref.sheetId,
        cellId: formatCellId(nextCol, nextRow),
      };
      return;
    }

    if (ref.startCellId && ref.endCellId) {
      var parsedStart = parseCellId(ref.startCellId);
      var parsedEnd = parseCellId(ref.endCellId);
      if (!parsedStart || !parsedEnd) {
        result[name] = ref;
        return;
      }
      var nextStartRow = parsedStart.row;
      var nextEndRow = parsedEnd.row;
      var nextStartCol = parsedStart.col;
      var nextEndCol = parsedEnd.col;

      if (direction === 'row') {
        if (mode === 'delete') {
          var nextRows = remapRangeForStructureDelete(
            parsedStart.row,
            parsedEnd.row,
            start,
            count,
          );
          nextStartRow = nextRows.start;
          nextEndRow = nextRows.end;
        } else {
          nextStartRow = remapIndexForStructureEdit(
            parsedStart.row,
            start,
            count,
            mode,
          );
          nextEndRow = remapIndexForStructureEdit(
            parsedEnd.row,
            start,
            count,
            mode,
          );
        }
      } else if (mode === 'delete') {
        var nextCols = remapRangeForStructureDelete(
          parsedStart.col,
          parsedEnd.col,
          start,
          count,
        );
        nextStartCol = nextCols.start;
        nextEndCol = nextCols.end;
      } else {
        nextStartCol = remapIndexForStructureEdit(
          parsedStart.col,
          start,
          count,
          mode,
        );
        nextEndCol = remapIndexForStructureEdit(
          parsedEnd.col,
          start,
          count,
          mode,
        );
      }

      result[name] = {
        sheetId: ref.sheetId,
        startCellId: formatCellId(nextStartCol, nextStartRow),
        endCellId: formatCellId(nextEndCol, nextEndRow),
      };
      return;
    }

    result[name] = ref;
  });

  return result;
}

function applyNamedCellRelinkForStructureEdit(app, axis, start, count, mode) {
  if (
    !app ||
    !app.storage ||
    typeof app.storage.readNamedCells !== 'function' ||
    typeof app.storage.saveNamedCells !== 'function' ||
    typeof app.parseCellId !== 'function' ||
    typeof app.formatCellId !== 'function'
  ) {
    return;
  }

  var current = app.storage.readNamedCells();
  var next = remapNamedCellsForStructureEdit(
    current,
    axis,
    start,
    count,
    mode,
    {
      parseCellId: app.parseCellId.bind(app),
      formatCellId: app.formatCellId.bind(app),
    },
  );
  app.storage.saveNamedCells(next);
}

export function getSelectedColumnBounds(app) {
  var maxRow = app.table.rows.length - 1;
  if (
    app.selectionRange &&
    app.selectionRange.startRow === 1 &&
    app.selectionRange.endRow === maxRow
  ) {
    return {
      start: app.selectionRange.startCol,
      end: app.selectionRange.endCol,
    };
  }
  if (app.contextMenuState && app.contextMenuState.type === 'col') {
    return {
      start: app.contextMenuState.index,
      end: app.contextMenuState.index,
    };
  }
  if (app.activeInput) {
    var parsed = app.parseCellId(app.activeInput.id);
    if (parsed) return { start: parsed.col, end: parsed.col };
  }
  return null;
}

export function insertRowsAtContext(app, position) {
  var bounds = app.getSelectedRowBounds();
  if (!bounds) return;
  app.captureHistorySnapshot('rows:' + app.activeSheetId);
  var maxRow = app.table.rows.length - 1;
  var maxCol = app.table.rows[0].cells.length - 1;
  var count = Math.max(1, bounds.end - bounds.start + 1);
  var insertAfter = String(position || 'before') === 'after';
  var anchor = insertAfter ? bounds.end + 1 : bounds.start;
  var start = Math.max(1, Math.min(anchor, maxRow + 1));

  if (
    typeof app.ensureGridCapacityForStorage === 'function' &&
    typeof app.formatCellId === 'function'
  ) {
    var probeWorkbook = {
      sheets: {},
    };
    probeWorkbook.sheets[app.activeSheetId] = {
      cells: {},
    };
    probeWorkbook.sheets[app.activeSheetId].cells[
      app.formatCellId(Math.max(1, maxCol), maxRow + count)
    ] = {};
    app.ensureGridCapacityForStorage(probeWorkbook);
    maxRow = app.table.rows.length - 1;
    maxCol = app.table.rows[0].cells.length - 1;
  }

  applyNamedCellRelinkForStructureEdit(app, 'row', start, count, 'insert');

  for (var row = maxRow; row >= start; row--) {
    for (var col = 1; col <= maxCol; col++) {
      var targetId = app.formatCellId(col, row);
      var sourceRow = row - count;
      var sourceId =
        sourceRow >= start ? app.formatCellId(col, sourceRow) : null;
      app.setRawCellValue(
        targetId,
        sourceId ? app.getRawCellValue(sourceId) : '',
      );
    }
  }

  app.selectEntireRow(start, start + count - 1);
  app.aiService.notifyActiveCellChanged();
  app.computeAll();
}

export function deleteRowsAtContext(app) {
  var bounds = app.getSelectedRowBounds();
  if (!bounds) return;
  app.captureHistorySnapshot('rows:' + app.activeSheetId);
  var maxRow = app.table.rows.length - 1;
  var maxCol = app.table.rows[0].cells.length - 1;
  var start = Math.max(1, Math.min(bounds.start, maxRow));
  var count = Math.max(
    1,
    Math.min(maxRow - start + 1, bounds.end - bounds.start + 1),
  );
  if (count < 1) return;

  applyNamedCellRelinkForStructureEdit(app, 'row', start, count, 'delete');

  for (var row = start; row <= maxRow; row++) {
    for (var col = 1; col <= maxCol; col++) {
      var targetId = app.formatCellId(col, row);
      var sourceRow = row + count;
      var sourceId =
        sourceRow <= maxRow ? app.formatCellId(col, sourceRow) : null;
      app.setRawCellValue(
        targetId,
        sourceId ? app.getRawCellValue(sourceId) : '',
      );
    }
  }

  app.selectEntireRow(start, Math.min(maxRow, start + count - 1));
  app.aiService.notifyActiveCellChanged();
  app.computeAll();
}

export function insertColumnsAtContext(app, position) {
  var bounds = app.getSelectedColumnBounds();
  if (!bounds) return;
  app.captureHistorySnapshot('cols:' + app.activeSheetId);
  var maxRow = app.table.rows.length - 1;
  var maxCol = app.table.rows[0].cells.length - 1;
  var insertAfter = String(position || 'before') === 'after';
  var anchor = insertAfter ? bounds.end + 1 : bounds.start;
  var start = Math.max(1, Math.min(anchor, maxCol + 1));
  var count = Math.max(1, bounds.end - bounds.start + 1);
  if (count < 1) return;

  if (
    typeof app.ensureGridCapacityForStorage === 'function' &&
    typeof app.formatCellId === 'function'
  ) {
    var probeWorkbook = {
      sheets: {},
    };
    probeWorkbook.sheets[app.activeSheetId] = {
      cells: {},
    };
    probeWorkbook.sheets[app.activeSheetId].cells[
      app.formatCellId(maxCol + count, Math.max(1, maxRow))
    ] = {};
    app.ensureGridCapacityForStorage(probeWorkbook);
    maxRow = app.table.rows.length - 1;
    maxCol = app.table.rows[0].cells.length - 1;
  }

  applyNamedCellRelinkForStructureEdit(app, 'col', start, count, 'insert');

  for (var col = maxCol; col >= start; col--) {
    for (var row = 1; row <= maxRow; row++) {
      var targetId = app.formatCellId(col, row);
      var sourceCol = col - count;
      var sourceId =
        sourceCol >= start ? app.formatCellId(sourceCol, row) : null;
      app.setRawCellValue(
        targetId,
        sourceId ? app.getRawCellValue(sourceId) : '',
      );
    }
  }

  app.selectEntireColumn(start, start + count - 1);
  app.aiService.notifyActiveCellChanged();
  app.computeAll();
}

export function deleteColumnsAtContext(app) {
  var bounds = app.getSelectedColumnBounds();
  if (!bounds) return;
  app.captureHistorySnapshot('cols:' + app.activeSheetId);
  var maxRow = app.table.rows.length - 1;
  var maxCol = app.table.rows[0].cells.length - 1;
  var start = Math.max(1, Math.min(bounds.start, maxCol));
  var count = Math.max(
    1,
    Math.min(maxCol - start + 1, bounds.end - bounds.start + 1),
  );
  if (count < 1) return;

  applyNamedCellRelinkForStructureEdit(app, 'col', start, count, 'delete');

  for (var col = start; col <= maxCol; col++) {
    for (var row = 1; row <= maxRow; row++) {
      var targetId = app.formatCellId(col, row);
      var sourceCol = col + count;
      var sourceId =
        sourceCol <= maxCol ? app.formatCellId(sourceCol, row) : null;
      app.setRawCellValue(
        targetId,
        sourceId ? app.getRawCellValue(sourceId) : '',
      );
    }
  }

  app.selectEntireColumn(start, Math.min(maxCol, start + count - 1));
  app.aiService.notifyActiveCellChanged();
  app.computeAll();
}
