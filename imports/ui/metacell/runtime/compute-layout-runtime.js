import {
  applySpillVisualStateFromModel,
  clearSpillVisualState,
} from './spill-runtime.js';
import { clearSpillEntriesForRows } from './spill-model.js';
import { forEachRowInRange } from './grid-view-layout-runtime.js';

function getInputRowIndex(app, input) {
  if (!input) return 0;
  var row =
    input.parentElement && input.parentElement.parentElement
      ? input.parentElement.parentElement
      : null;
  if (row && Number(row.rowIndex) > 0) return Number(row.rowIndex);
  var parsed =
    typeof app.parseCellId === 'function' ? app.parseCellId(input.id) : null;
  return parsed && parsed.row ? parsed.row : 0;
}

export function measureOutputRequiredWidth(app, output) {
  if (!output) return 0;
  var probe = output.cloneNode(true);
  probe.classList.add('spill-overflow');
  probe.style.position = 'fixed';
  probe.style.left = '-99999px';
  probe.style.top = '0';
  probe.style.width = 'auto';
  probe.style.maxWidth = 'none';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.overflow = 'visible';
  probe.style.whiteSpace = 'nowrap';
  document.body.appendChild(probe);
  var width = Math.ceil(probe.scrollWidth || probe.offsetWidth || 0);
  probe.remove();
  return width;
}

function cellHasDisplayFlag(td, flag) {
  if (!td || !flag) return false;
  if (td.classList && td.classList.contains(flag)) return true;
  var shell = td.querySelector('.cell-react-shell');
  return !!(shell && shell.classList && shell.classList.contains(flag));
}

export function applyRightOverflowText(app, options) {
  var opts = options && typeof options === 'object' ? options : {};
  var dirtyRows = Array.isArray(opts.rowIndexes) ? opts.rowIndexes : null;
  var dirtyRowMap = null;
  if (dirtyRows && dirtyRows.length) {
    dirtyRowMap = {};
    for (var dirtyIndex = 0; dirtyIndex < dirtyRows.length; dirtyIndex++) {
      var dirtyRowIndex = Number(dirtyRows[dirtyIndex]);
      if (!Number.isFinite(dirtyRowIndex) || dirtyRowIndex < 1) continue;
      dirtyRowMap[dirtyRowIndex] = true;
    }
  }

  var cellHasVisibleContent = function (td, input) {
    if (!td || !input) return false;
    var raw = String(app.getRawCellValue(input.id) || '').trim();
    if (raw !== '') return true;

    var shown = String(
      td.dataset.computedValue == null ? '' : td.dataset.computedValue,
    ).trim();
    if (shown !== '') return true;

    if (
      td.classList.contains('has-display-value') ||
      td.classList.contains('has-formula')
    ) {
      return true;
    }

    var output = td.querySelector('.cell-output');
    var rendered = output ? String(output.textContent || '').trim() : '';
    return rendered !== '';
  };

  if (dirtyRowMap) {
    clearSpillEntriesForRows(app, app.activeSheetId, Object.keys(dirtyRowMap));
  } else if (typeof app.clearSpillSheetState === 'function') {
    app.clearSpillSheetState(app.activeSheetId);
  }
  clearSpillVisualState(
    app,
    dirtyRowMap ? { rowIndexes: Object.keys(dirtyRowMap) } : null,
  );

  forEachRowInRange(app, function (row, rowIndex) {
    if (dirtyRowMap && !dirtyRowMap[rowIndex]) return;
    for (var colIndex = 1; colIndex < row.cells.length; colIndex++) {
      var td = row.cells[colIndex];
      var input = td.querySelector('.cell-anchor-input');
      if (!input) continue;
      if (app.isEditingCell(input)) continue;

      var output = td.querySelector('.cell-output');
      if (!output) continue;
      if (output.querySelector('table')) continue;
      if (cellHasDisplayFlag(td, 'display-wrap')) continue;
      if (
        cellHasDisplayFlag(td, 'display-align-center') ||
        cellHasDisplayFlag(td, 'display-align-right')
      ) {
        continue;
      }

      var value = String(
        td.dataset.computedValue == null ? '' : td.dataset.computedValue,
      );
      if (!value || value.indexOf('\n') !== -1) continue;

      var immediateNext = row.cells[colIndex + 1];
      if (!immediateNext) continue;
      var immediateNextInput = immediateNext.querySelector('.cell-anchor-input');
      if (!immediateNextInput) continue;
      if (app.isEditingCell(immediateNextInput)) continue;
      if (cellHasVisibleContent(immediateNext, immediateNextInput)) continue;

      var baseWidth = td.clientWidth;
      output.classList.add('spill-overflow');
      output.style.width = baseWidth + 'px';
      var requiredWidth = app.measureOutputRequiredWidth(output);
      if (requiredWidth <= baseWidth + 1) {
        output.classList.remove('spill-overflow');
        output.style.width = '';
        continue;
      }

      var spanWidth = td.offsetWidth;
      var coveredCells = [];
      for (var nextCol = colIndex + 1; nextCol < row.cells.length; nextCol++) {
        var nextTd = row.cells[nextCol];
        var nextInput = nextTd.querySelector('.cell-anchor-input');
        if (!nextInput) break;
        if (app.isEditingCell(nextInput)) break;
        if (cellHasVisibleContent(nextTd, nextInput)) break;
        spanWidth += nextTd.offsetWidth;
        coveredCells.push(nextTd);
      }

      if (spanWidth <= baseWidth) {
        output.classList.remove('spill-overflow');
        output.style.width = '';
        continue;
      }
      var appliedWidth = Math.min(spanWidth, requiredWidth);
      output.style.width = appliedWidth + 'px';
      td.classList.add('spill-source');
      var coveredCellIds = [];
      for (var c = 0; c < coveredCells.length; c++) {
        coveredCells[c].classList.add('spill-covered');
        var coveredInput = coveredCells[c].querySelector('.cell-anchor-input');
        if (coveredInput) {
          coveredCellIds.push(String(coveredInput.id || '').toUpperCase());
        }
      }
      if (typeof app.setSpillEntry === 'function') {
        app.setSpillEntry(app.activeSheetId, input.id, {
          kind: 'overflow',
          coveredCellIds: coveredCellIds,
          range: {
            startCol: colIndex,
            endCol: colIndex + coveredCells.length,
            startRow: rowIndex,
            endRow: rowIndex,
          },
          requiredWidth: requiredWidth,
          appliedWidth: appliedWidth,
        });
      }
    }
  });
  applySpillVisualStateFromModel(app, app.activeSheetId);
}

export function updateWrappedRowHeights(app, options) {
  var opts = options && typeof options === 'object' ? options : {};
  if (!app.grid || !app.table || !app.table.rows || !app.table.rows.length) {
    return;
  }
  var defaultHeight = Number(app.grid.defaultRowHeight || 24);
  var measuredHeights = {};
  var dirtyRows = Array.isArray(opts.rowIndexes) ? opts.rowIndexes : null;
  var dirtyRowMap = null;
  if (dirtyRows && dirtyRows.length) {
    dirtyRowMap = {};
    for (var dirtyIndex = 0; dirtyIndex < dirtyRows.length; dirtyIndex++) {
      var dirtyRowIndex = Number(dirtyRows[dirtyIndex]);
      if (!Number.isFinite(dirtyRowIndex) || dirtyRowIndex < 1) continue;
      dirtyRowMap[dirtyRowIndex] = true;
    }
  }

  if (app.displayMode === 'formulas') {
    forEachRowInRange(app, function (_, formulaRowIndex) {
      if (dirtyRowMap && !dirtyRowMap[formulaRowIndex]) return;
      if (
        app.storage.getRowHeight(app.activeSheetId, formulaRowIndex) != null
      ) {
        return;
      }
      app.grid.setRowHeight(formulaRowIndex, defaultHeight);
    });
    if (typeof app.grid.stabilizeHeaderMetrics === 'function') {
      app.grid.stabilizeHeaderMetrics();
    }
    app.grid.updateTableSize();
    return;
  }

  var wrapInputs =
    typeof app.getMountedInputs === 'function'
      ? app.getMountedInputs()
      : app.inputs;
  for (var i = 0; i < wrapInputs.length; i++) {
    var input = wrapInputs[i];
    if (!input || !input.parentElement) continue;
    var td = input.parentElement;
    if (!cellHasDisplayFlag(td, 'display-wrap')) continue;
    if (td.classList.contains('editing')) continue;
    var rowIndex = getInputRowIndex(app, input);
    if (!rowIndex || rowIndex < 1) continue;
    if (dirtyRowMap && !dirtyRowMap[rowIndex]) continue;
    if (app.storage.getRowHeight(app.activeSheetId, rowIndex) != null) continue;
    var output = td.querySelector('.cell-output');
    if (!output) continue;
    var nextHeight = Math.max(defaultHeight, Math.ceil(output.scrollHeight) + 6);
    measuredHeights[rowIndex] = Math.max(
      measuredHeights[rowIndex] || defaultHeight,
      nextHeight,
    );
  }

  forEachRowInRange(app, function (_, rowIndex) {
    if (dirtyRowMap && !dirtyRowMap[rowIndex]) return;
    if (app.storage.getRowHeight(app.activeSheetId, rowIndex) != null) return;
    app.grid.setRowHeight(rowIndex, measuredHeights[rowIndex] || defaultHeight);
  });
  if (typeof app.grid.stabilizeHeaderMetrics === 'function') {
    app.grid.stabilizeHeaderMetrics();
  }
  app.grid.updateTableSize();
}
