export function normalizeCellId(cellId) {
  return String(cellId || '').toUpperCase();
}

export function getCellInputById(app, cellId) {
  if (!app) return null;
  var normalizedCellId = normalizeCellId(cellId);
  if (!normalizedCellId) return null;
  var parsedCellId =
    typeof app.parseCellId === 'function'
      ? app.parseCellId(normalizedCellId)
      : null;
  if (parsedCellId && typeof app.ensureViewportRowMounted === 'function') {
    app.ensureViewportRowMounted(parsedCellId.row);
  }
  if (
    app.inputById &&
    Object.prototype.hasOwnProperty.call(app.inputById, normalizedCellId)
  ) {
    var cachedInput = app.inputById[normalizedCellId] || null;
    if (
      cachedInput &&
      cachedInput.isConnected &&
      (!app.table ||
        typeof app.table.contains !== 'function' ||
        app.table.contains(cachedInput))
    ) {
      return cachedInput;
    }
  }
  if (!app.table || typeof app.table.querySelector !== 'function') return null;
  return app.table.querySelector('#' + cssEscapeIdentifier(normalizedCellId));
}

export function getCellElementById(app, cellId) {
  var input = getCellInputById(app, cellId);
  return input && input.parentElement ? input.parentElement : null;
}

export function getCellInputByCoords(app, rowIndex, colIndex) {
  if (!app || !Number.isFinite(rowIndex) || !Number.isFinite(colIndex)) {
    return null;
  }
  if (typeof app.formatCellId === 'function') {
    return getCellInputById(app, app.formatCellId(colIndex, rowIndex));
  }
  return null;
}

export function getCellElementByCoords(app, rowIndex, colIndex) {
  var input = getCellInputByCoords(app, rowIndex, colIndex);
  return input && input.parentElement ? input.parentElement : null;
}

export function getTableRowElement(app, rowIndex) {
  if (!app || !app.table || !app.table.rows) return null;
  if (!Number.isFinite(rowIndex) || rowIndex < 0) return null;
  return app.table.rows[rowIndex] || null;
}

export function getHeaderCellByIndex(app, colIndex) {
  var headerRow = getTableRowElement(app, 0);
  if (!headerRow || !headerRow.cells) return null;
  if (!Number.isFinite(colIndex) || colIndex < 0) return null;
  return headerRow.cells[colIndex] || null;
}

export function getRowHeaderCellByIndex(app, rowIndex) {
  var row = getTableRowElement(app, rowIndex);
  if (!row || !row.cells || !Number.isFinite(rowIndex) || rowIndex < 0) {
    return null;
  }
  return row.cells[0] || null;
}

export function getGridBounds(app) {
  if (!app || !app.table || !app.table.rows || !app.table.rows.length) {
    return { rows: 0, cols: 0 };
  }
  return {
    rows: Math.max(0, app.table.rows.length - 1),
    cols: Math.max(0, app.table.rows[0].cells.length - 1),
  };
}

function cssEscapeIdentifier(value) {
  var text = String(value || '');
  if (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') {
    return CSS.escape(text);
  }
  return text.replace(/([^a-zA-Z0-9_\u00A0-\uFFFF-])/g, '\\$1');
}
