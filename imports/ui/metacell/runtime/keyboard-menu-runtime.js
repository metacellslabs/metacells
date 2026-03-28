export function ensureAddTabMenu(app) {
  return app.addTabMenuUiState || null;
}

export function toggleAddTabMenu(app) {
  if (app.addTabMenuUiState && app.addTabMenuUiState.open === true) {
    hideAddTabMenu(app);
    return;
  }
  var rect = app.addTabButton.getBoundingClientRect();
  var gap = 6;
  var menuWidth = 156;
  var menuHeight = 112;
  var viewportWidth =
    window.innerWidth || document.documentElement.clientWidth || 0;
  var viewportHeight =
    window.innerHeight || document.documentElement.clientHeight || 0;

  var left = rect.left;
  if (left + menuWidth > viewportWidth - 8) {
    left = viewportWidth - menuWidth - 8;
  }
  if (left < 8) left = 8;

  var top = rect.bottom + gap;
  if (top + menuHeight > viewportHeight - 8) {
    top = rect.top - menuHeight - gap;
  }
  if (top < 8) top = 8;

  app.addTabMenuUiState = {
    open: true,
    left: Math.round(left),
    top: Math.round(top),
  };
  if (typeof app.publishUiState === 'function') app.publishUiState();
}

export function hideAddTabMenu(app) {
  app.addTabMenuUiState = {
    open: false,
    left: 0,
    top: 0,
  };
  if (typeof app.publishUiState === 'function') app.publishUiState();
}

export function getAddTabMenuUiState(app) {
  var state =
    app && app.addTabMenuUiState && typeof app.addTabMenuUiState === 'object'
      ? app.addTabMenuUiState
      : null;
  return {
    open: state ? state.open === true : false,
    left: state ? Number(state.left || 0) : 0,
    top: state ? Number(state.top || 0) : 0,
  };
}

export function ensureContextMenu(app) {
  return app.contextMenuUiState || null;
}

export function setupContextMenu(app) {
  app.table.addEventListener('contextmenu', function (e) {
    if (app.isReportActive()) return;
    var td = e.target && e.target.closest ? e.target.closest('td') : null;
    if (!td) return;
    e.preventDefault();
    prepareContextFromCell(app, td);
    openContextMenu(app, e.clientX, e.clientY);
  });

  document.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('.sheet-context-menu')) {
      return;
    }
    hideContextMenu(app);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hideContextMenu(app);
  });
  window.addEventListener('resize', function () {
    hideContextMenu(app);
  });
}

export function prepareContextFromCell(app, td) {
  if (!td) return;
  var rowIndex = td.parentElement ? td.parentElement.rowIndex : -1;
  var colIndex = td.cellIndex;
  var bounds =
    typeof app.getGridBounds === 'function'
      ? app.getGridBounds()
      : {
          rows: app.table.rows.length - 1,
          cols: app.table.rows[0].cells.length - 1,
        };
  var maxRow = bounds.rows;
  var maxCol = bounds.cols;
  if (rowIndex < 0 || colIndex < 0) return;

  if (rowIndex === 0 && colIndex > 0) {
    app.selectEntireColumn(colIndex, colIndex);
    app.contextMenuState = { type: 'col', index: colIndex };
    return;
  }
  if (colIndex === 0 && rowIndex > 0) {
    app.selectEntireRow(rowIndex, rowIndex);
    app.contextMenuState = { type: 'row', index: rowIndex };
    return;
  }
  if (rowIndex >= 1 && rowIndex <= maxRow && colIndex >= 1 && colIndex <= maxCol) {
    var cellId = app.cellIdFrom(colIndex, rowIndex);
    var input = resolveSpillSourceInput(
      app,
      typeof app.getCellInput === 'function'
        ? app.getCellInput(cellId)
        : app.inputById[cellId],
    );
    if (input) {
      app.setActiveInput(input);
      app.setSelectionAnchor(input.id);
      app.clearSelectionRange();
      if (typeof app.focusCellProxy === 'function') {
        app.focusCellProxy(input);
      }
    }
    app.contextMenuState = { type: 'cell', row: rowIndex, col: colIndex };
  }
}

export function openContextMenu(app, clientX, clientY) {
  var isCellContext = !!(
    app.contextMenuState && app.contextMenuState.type === 'cell'
  );
  var menuWidth = 180;
  var menuHeight = isCellContext ? 220 : 180;
  var viewportWidth =
    window.innerWidth || document.documentElement.clientWidth || 0;
  var viewportHeight =
    window.innerHeight || document.documentElement.clientHeight || 0;
  var left = clientX;
  var top = clientY;

  if (left + menuWidth > viewportWidth - 8) {
    left = viewportWidth - menuWidth - 8;
  }
  if (top + menuHeight > viewportHeight - 8) {
    top = viewportHeight - menuHeight - 8;
  }
  if (left < 8) left = 8;
  if (top < 8) top = 8;

  app.contextMenuUiState = {
    open: true,
    left: Math.round(left),
    top: Math.round(top),
    showCellActions: isCellContext,
  };
  if (typeof app.publishUiState === 'function') app.publishUiState();
}

export function hideContextMenu(app) {
  app.contextMenuUiState = {
    open: false,
    left: 0,
    top: 0,
    showCellActions: false,
  };
  if (typeof app.publishUiState === 'function') app.publishUiState();
}

export function getContextMenuUiState(app) {
  var state =
    app && app.contextMenuUiState && typeof app.contextMenuUiState === 'object'
      ? app.contextMenuUiState
      : null;
  return {
    open: state ? state.open === true : false,
    left: state ? Number(state.left || 0) : 0,
    top: state ? Number(state.top || 0) : 0,
    showCellActions: state ? state.showCellActions === true : false,
  };
}

function resolveSpillSourceInput(app, input) {
  if (!app || !input) return input;
  if (typeof app.getSpillSourceForCell !== 'function') return input;
  var sourceCellId = app.getSpillSourceForCell(app.activeSheetId, input.id);
  if (!sourceCellId || sourceCellId === String(input.id || '').toUpperCase()) {
    return input;
  }
  return (
    (typeof app.getCellInput === 'function'
      ? app.getCellInput(sourceCellId)
      : app.inputById && app.inputById[sourceCellId]) || input
  );
}
