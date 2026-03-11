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

export function insertRowsAtContext(app) {
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

export function insertColumnsAtContext(app) {
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
