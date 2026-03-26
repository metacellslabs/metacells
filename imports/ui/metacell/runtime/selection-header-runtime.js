import { focusGridCellInput } from './grid-cell-runtime.js';
import { getSelectionRangeState, setSelectionRangeState } from './selection-range-facade.js';

export function clearHeaderSelectionHighlight(app) {
  var maxRow = app.table.rows.length - 1;
  var maxCol = app.table.rows[0].cells.length - 1;

  for (var col = 1; col <= maxCol; col++) {
    app.table.rows[0].cells[col].classList.remove('selected-col-header');
    app.table.rows[0].cells[col].classList.remove('active-col-header');
  }
  for (var row = 1; row <= maxRow; row++) {
    app.table.rows[row].cells[0].classList.remove('selected-row-header');
    app.table.rows[row].cells[0].classList.remove('active-row-header');
  }
  app.table.rows[0].cells[0].classList.remove('selected-corner-header');
}

export function updateAxisHeaderHighlight(app) {
  var maxRow = app.table.rows.length - 1;
  var maxCol = app.table.rows[0].cells.length - 1;

  for (var col = 1; col <= maxCol; col++) {
    app.table.rows[0].cells[col].classList.remove('active-col-header');
  }
  for (var row = 1; row <= maxRow; row++) {
    app.table.rows[row].cells[0].classList.remove('active-row-header');
  }

  var selectionRange = getSelectionRangeState(app);
  if (selectionRange) {
    for (var c = selectionRange.startCol; c <= selectionRange.endCol; c++) {
      if (c < 1 || c > maxCol) continue;
      app.table.rows[0].cells[c].classList.add('active-col-header');
    }
    for (var r = selectionRange.startRow; r <= selectionRange.endRow; r++) {
      if (r < 1 || r > maxRow) continue;
      app.table.rows[r].cells[0].classList.add('active-row-header');
    }
    return;
  }

  if (!app.activeInput) return;
  var parsed = app.parseCellId(app.activeInput.id);
  if (!parsed) return;
  if (parsed.col >= 1 && parsed.col <= maxCol)
    app.table.rows[0].cells[parsed.col].classList.add('active-col-header');
  if (parsed.row >= 1 && parsed.row <= maxRow)
    app.table.rows[parsed.row].cells[0].classList.add('active-row-header');
}

export function bindHeaderSelectionEvents(app) {
  var headerRow = app.table.rows[0];
  for (var colIndex = 1; colIndex < headerRow.cells.length; colIndex++) {
    var colHeader = headerRow.cells[colIndex];
    if (colHeader.dataset.boundHeaderSelection === 'true') continue;
    colHeader.dataset.boundHeaderSelection = 'true';
    colHeader.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (
        e.target.closest &&
        (e.target.closest('.col-resize-handle') ||
          e.target.closest('.sort-button'))
      )
        return;
      e.preventDefault();
      startHeaderSelectionDrag(app, 'col', e.currentTarget.cellIndex);
    });
    colHeader.addEventListener('click', (e) => {
      if (e.button !== 0) return;
      if (
        e.target.closest &&
        (e.target.closest('.col-resize-handle') ||
          e.target.closest('.sort-button'))
      ) {
        return;
      }
      e.preventDefault();
      applyHeaderSelectionRange(
        app,
        'col',
        e.currentTarget.cellIndex,
        e.currentTarget.cellIndex,
      );
    });
  }

  for (var rowIndex = 1; rowIndex < app.table.rows.length; rowIndex++) {
    var rowHeader = app.table.rows[rowIndex].cells[0];
    if (rowHeader.dataset.boundHeaderSelection === 'true') continue;
    rowHeader.dataset.boundHeaderSelection = 'true';
    rowHeader.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest && e.target.closest('.row-resize-handle')) return;
      e.preventDefault();
      startHeaderSelectionDrag(
        app,
        'row',
        e.currentTarget.parentElement.rowIndex,
      );
    });
    rowHeader.addEventListener('click', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest && e.target.closest('.row-resize-handle')) return;
      e.preventDefault();
      applyHeaderSelectionRange(
        app,
        'row',
        e.currentTarget.parentElement.rowIndex,
        e.currentTarget.parentElement.rowIndex,
      );
    });
  }
}

export function startHeaderSelectionDrag(app, mode, anchorIndex) {
  if (mode !== 'row' && mode !== 'col') return;
  if (!anchorIndex || anchorIndex < 1) return;
  app.headerSelectionDrag = {
    mode: mode,
    anchorIndex: anchorIndex,
    targetIndex: anchorIndex,
  };

  applyHeaderSelectionRange(app, mode, anchorIndex, anchorIndex);

  var onMove = (e) => onHeaderSelectionDragMove(app, e);
  var onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    app.headerSelectionDrag = null;
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

export function onHeaderSelectionDragMove(app, event) {
  if (!app.headerSelectionDrag) return;
  var el = document.elementFromPoint(event.clientX, event.clientY);
  if (!el || !el.closest) return;
  var td = el.closest('td');
  if (!td) return;
  var mode = app.headerSelectionDrag.mode;
  var index =
    mode === 'row'
      ? td.parentElement
        ? td.parentElement.rowIndex
        : 0
      : td.cellIndex;
  if (mode === 'row' && td.cellIndex !== 0) return;
  if (mode === 'col' && (!td.parentElement || td.parentElement.rowIndex !== 0))
    return;
  if (index < 1 || index === app.headerSelectionDrag.targetIndex) return;

  app.headerSelectionDrag.targetIndex = index;
  applyHeaderSelectionRange(
    app,
    mode,
    app.headerSelectionDrag.anchorIndex,
    index,
  );
}

export function applyHeaderSelectionRange(app, mode, fromIndex, toIndex) {
  var start = Math.min(fromIndex, toIndex);
  var end = Math.max(fromIndex, toIndex);
  if (mode === 'row') {
    selectEntireRow(app, start, end);
  } else if (mode === 'col') {
    selectEntireColumn(app, start, end);
  }
}

export function selectEntireRow(app, startRow, endRow) {
  var maxCol = app.table.rows[0].cells.length - 1;
  var from = Math.max(1, Math.min(startRow, endRow));
  var to = Math.max(1, Math.max(startRow, endRow));
  var anchorId = app.formatCellId(1, from);
  app.setSelectionAnchor(anchorId);
  setSelectionRangeState(app, {
    startCol: 1,
    endCol: maxCol,
    startRow: from,
    endRow: to,
  });
  app.highlightSelectionRange();
  var target = app.inputById[app.formatCellId(1, from)];
  if (target) {
    app.extendSelectionNav = true;
    app.setActiveInput(target);
    app.extendSelectionNav = false;
    focusGridCellInput(target);
  }
}

export function selectEntireColumn(app, startCol, endCol) {
  var maxRow = app.table.rows.length - 1;
  var from = Math.max(1, Math.min(startCol, endCol));
  var to = Math.max(1, Math.max(startCol, endCol));
  var anchorId = app.formatCellId(from, 1);
  app.setSelectionAnchor(anchorId);
  setSelectionRangeState(app, {
    startCol: from,
    endCol: to,
    startRow: 1,
    endRow: maxRow,
  });
  app.highlightSelectionRange();
  var target = app.inputById[app.formatCellId(from, 1)];
  if (target) {
    app.extendSelectionNav = true;
    app.setActiveInput(target);
    app.extendSelectionNav = false;
    focusGridCellInput(target);
  }
}
