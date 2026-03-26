import {
  applyRightOverflowText,
  updateWrappedRowHeights,
} from './compute-layout-runtime.js';
import {
  applyComputedCellRender,
  clearComputedCellRenderState,
} from './compute-render-runtime.js';
import { getDirectGridCellChild } from './grid-cell-runtime.js';
import { forEachRowInRange } from './grid-view-layout-runtime.js';

import { getSelectionRangeState } from './selection-range-facade.js';

function getInputRowIndex(app, input) {
  if (!input) return 0;
  var row =
    input.parentElement && input.parentElement.parentElement
      ? input.parentElement.parentElement
      : null;
  if (row && Number(row.rowIndex) > 0) return Number(row.rowIndex);
  var parsed =
    app && typeof app.parseCellId === 'function'
      ? app.parseCellId(input.id)
      : null;
  return parsed && parsed.row ? parsed.row : 0;
}

function ensureDetachedRowState(app) {
  if (!app) return null;
  if (!app.detachedRowsByIndex || typeof app.detachedRowsByIndex !== 'object') {
    app.detachedRowsByIndex = {};
  }
  return app.detachedRowsByIndex;
}

function estimateRowHeight(app, rowIndex, row) {
  var explicitHeight =
    app &&
    app.storage &&
    typeof app.storage.getRowHeight === 'function'
      ? Number(app.storage.getRowHeight(app.activeSheetId, rowIndex) || 0)
      : 0;
  if (explicitHeight > 0) return explicitHeight;
  var measuredHeight = row ? Number(row.offsetHeight || 0) : 0;
  if (measuredHeight > 0) return measuredHeight;
  return Math.max(
    24,
    Number(app && app.grid ? app.grid.defaultRowHeight || 24 : 24),
  );
}

function buildRowPlaceholder(app, rowIndex, sourceRow) {
  var placeholder = document.createElement('tr');
  placeholder.className = 'grid-row-placeholder';
  placeholder.dataset.rowPlaceholder = 'true';
  placeholder.dataset.rowIndex = String(rowIndex);
  var rowHeight = estimateRowHeight(app, rowIndex, sourceRow) + 'px';
  var cellCount =
    sourceRow && sourceRow.cells && sourceRow.cells.length
      ? sourceRow.cells.length
      : Math.max(
          1,
          Number(app.gridCols || (app.grid && app.grid.cols) || 0) + 1,
        );

  for (var cellIndex = 0; cellIndex < cellCount; cellIndex++) {
    var sourceCell =
      sourceRow && sourceRow.cells && sourceRow.cells[cellIndex]
        ? sourceRow.cells[cellIndex]
        : null;
    var td = sourceCell
      ? sourceCell.cloneNode(false)
      : document.createElement('td');
    td.classList.add('grid-row-placeholder-cell');
    td.innerHTML = '';
    td.style.height = rowHeight;
    td.style.minHeight = rowHeight;
    td.style.maxHeight = rowHeight;
    td.style.boxSizing = 'border-box';
    if (cellIndex === 0) {
      td.textContent = String(rowIndex);
      td.setAttribute('aria-hidden', 'true');
    }
    placeholder.appendChild(td);
  }
  placeholder.style.height = rowHeight;
  placeholder.style.minHeight = rowHeight;
  placeholder.style.maxHeight = rowHeight;
  return placeholder;
}

function mountViewportRow(app, rowIndex) {
  var detachedRows = ensureDetachedRowState(app);
  if (!detachedRows || !detachedRows[rowIndex]) return null;
  var placeholder =
    app.table && app.table.rows ? app.table.rows[rowIndex] : null;
  var row = detachedRows[rowIndex];
  if (!placeholder || !placeholder.parentNode) return row;
  row.dataset.rowMounted = 'true';
  row.dataset.gridRowIndex = String(rowIndex);
  placeholder.parentNode.replaceChild(row, placeholder);
  delete detachedRows[rowIndex];
  return row;
}

function unmountViewportRow(app, rowIndex) {
  if (!app || rowIndex < 1) return null;
  var row = app.table && app.table.rows ? app.table.rows[rowIndex] : null;
  if (!row || row.dataset.rowPlaceholder === 'true') return null;
  var detachedRows = ensureDetachedRowState(app);
  if (detachedRows[rowIndex]) return detachedRows[rowIndex];
  var placeholder = buildRowPlaceholder(app, rowIndex, row);
  row.dataset.rowMounted = 'false';
  row.dataset.gridRowIndex = String(rowIndex);
  detachedRows[rowIndex] = row;
  if (row.parentNode) row.parentNode.replaceChild(placeholder, row);
  return row;
}

function syncViewportMountedRows(app, keepRowMap) {
  if (!app || !app.table || !app.table.rows || !app.table.rows.length) return;
  var bounds =
    typeof app.getGridBounds === 'function'
      ? app.getGridBounds()
      : { rows: Math.max(1, app.table.rows.length - 1) };
  var rowMap = keepRowMap && typeof keepRowMap === 'object' ? keepRowMap : {};
  for (var rowIndex = 1; rowIndex <= bounds.rows; rowIndex++) {
    if (rowMap[rowIndex]) mountViewportRow(app, rowIndex);
    else unmountViewportRow(app, rowIndex);
  }
}

function getPinnedRowIndexes(app, options) {
  var rows = {};
  var opts = options && typeof options === 'object' ? options : {};
  var includeActive = opts.includeActive !== false;
  var includeSelection = opts.includeSelection !== false;

  if (includeActive) {
    var activeInput =
      app && typeof app.getActiveCellInput === 'function'
        ? app.getActiveCellInput()
        : app.activeInput;
    var activeRowIndex = getInputRowIndex(app, activeInput);
    if (activeRowIndex >= 1) rows[activeRowIndex] = true;
  }

  if (includeSelection) {
    var selectionRange = getSelectionRangeState(app);
    if (selectionRange) {
      for (
        var rowIndex = selectionRange.startRow;
        rowIndex <= selectionRange.endRow;
        rowIndex++
      ) {
        rows[rowIndex] = true;
      }
    }
  }

  var alwaysIncludeInputs = Array.isArray(opts.alwaysIncludeInputs)
    ? opts.alwaysIncludeInputs
    : [];
  for (var i = 0; i < alwaysIncludeInputs.length; i++) {
    var input = alwaysIncludeInputs[i];
    var includeRowIndex = getInputRowIndex(app, input);
    if (includeRowIndex >= 1) rows[includeRowIndex] = true;
  }

  return rows;
}

function collectViewportRowIndexes(app, inputs, options) {
  var items = Array.isArray(inputs) ? inputs : [];
  var rows = getPinnedRowIndexes(app, options);
  for (var i = 0; i < items.length; i++) {
    var input = items[i];
    var rowIndex = getInputRowIndex(app, input);
    if (rowIndex >= 1) rows[rowIndex] = true;
  }
  return rows;
}

function collectViewportKeepRowMap(app, inputs, options) {
  var rows = collectViewportRowIndexes(app, inputs, options);
  var range = getViewportRowRange(app);
  if (!range) return rows;
  for (var rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex++) {
    rows[rowIndex] = true;
  }
  return rows;
}

function applyMountedRowRange(app, keepRowMap) {
  if (!app || !app.table || !app.table.rows || !app.table.rows.length) return;
  var rowMap = keepRowMap && typeof keepRowMap === 'object' ? keepRowMap : {};
  var mountedStart = 0;
  var mountedEnd = 0;
  syncViewportMountedRows(app, rowMap);
  forEachRowInRange(
    app,
    function (row, rowIndex) {
      if (!row) return;
      var isMounted = !!rowMap[rowIndex];
      row.dataset.rowMounted = isMounted ? 'true' : 'false';
      if (!isMounted) return;
      if (!mountedStart) mountedStart = rowIndex;
      mountedEnd = rowIndex;
    },
    { includeAllRows: true },
  );
  if (app.table && app.table.rows && app.table.rows.length) {
    for (var rowIndex = 1; rowIndex < app.table.rows.length; rowIndex++) {
      var row =
        typeof app.getTableRowElement === 'function'
          ? app.getTableRowElement(rowIndex)
          : app.table.rows[rowIndex];
      if (!row || row.dataset.rowMounted === 'true' || rowMap[rowIndex]) {
        continue;
      }
      row.dataset.rowMounted = 'false';
    }
  }
  app.mountedRowRange =
    mountedStart && mountedEnd
      ? { startRow: mountedStart, endRow: mountedEnd }
      : null;
}

function pruneOffscreenCellContent(app, keepRowMap) {
  var mountedInputs =
    app && typeof app.getMountedInputs === 'function'
      ? app.getMountedInputs()
      : app && Array.isArray(app.inputs)
        ? app.inputs
        : [];
  if (!app || !mountedInputs.length) return;
  var rowMap = keepRowMap && typeof keepRowMap === 'object' ? keepRowMap : {};
  for (var i = 0; i < mountedInputs.length; i++) {
    var input = mountedInputs[i];
    if (!input || !input.parentElement || !input.parentElement.parentElement) {
      continue;
    }
    var cell = input.parentElement;
    var rowIndex = cell.parentElement.rowIndex;
    if (rowMap[rowIndex] || app.isEditingCell(input)) {
      cell.removeAttribute('data-viewport-pruned');
      continue;
    }
    if (cell.dataset.viewportPruned === 'true') continue;

    var output = getDirectGridCellChild(cell, 'cell-output');
    var statusNode = getDirectGridCellChild(cell, 'cell-status');
    var scheduleNode = getDirectGridCellChild(cell, 'cell-schedule-indicator');
    var focusProxy = getDirectGridCellChild(cell, 'cell-focus-proxy');
    var actions = getDirectGridCellChild(cell, 'cell-actions');
    var fillHandle = getDirectGridCellChild(cell, 'fill-handle');
    if (output && output.parentNode === cell) cell.removeChild(output);
    if (statusNode && statusNode.parentNode === cell) cell.removeChild(statusNode);
    if (scheduleNode && scheduleNode.parentNode === cell) cell.removeChild(scheduleNode);
    if (focusProxy && focusProxy.parentNode === cell) cell.removeChild(focusProxy);
    if (actions && actions.parentNode === cell) cell.removeChild(actions);
    if (fillHandle && fillHandle.parentNode === cell) cell.removeChild(fillHandle);
    cell.removeAttribute('data-render-signature');
    cell.setAttribute('data-viewport-pruned', 'true');
    if (
      app.cellContentStore &&
      typeof app.cellContentStore.resetCell === 'function'
    ) {
      app.cellContentStore.resetCell(input.id);
    }
  }
}

export function getViewportRowRange(app) {
  if (
    !app ||
    !app.tableWrap ||
    !app.table ||
    !app.table.rows ||
    !app.table.rows.length
  ) {
    return null;
  }

  var viewportTop = Math.max(0, Number(app.tableWrap.scrollTop || 0));
  var viewportBottom =
    viewportTop + Math.max(0, Number(app.tableWrap.clientHeight || 0));
  var firstVisibleRow = 1;
  var lastVisibleRow = Math.max(1, app.table.rows.length - 1);
  var foundFirstVisibleRow = false;
  var foundLastVisibleRow = false;

  forEachRowInRange(
    app,
    function (row, rowIndex) {
      if (foundFirstVisibleRow) return;
      var rowTop = Number(row.offsetTop || 0);
      var rowBottom = rowTop + Math.max(1, Number(row.offsetHeight || 0));
      if (rowBottom >= viewportTop) {
        firstVisibleRow = rowIndex;
        foundFirstVisibleRow = true;
      }
    },
    { includeAllRows: true },
  );

  forEachRowInRange(
    app,
    function (visibleRow, visibleRowIndex) {
      if (foundLastVisibleRow) return;
      if (visibleRowIndex < firstVisibleRow) return;
      var visibleRowTop = Number(visibleRow.offsetTop || 0);
      if (visibleRowTop > viewportBottom) {
        lastVisibleRow = Math.max(firstVisibleRow, visibleRowIndex - 1);
        foundLastVisibleRow = true;
        return;
      }
      lastVisibleRow = visibleRowIndex;
    },
    { includeAllRows: true },
  );

  var overscan = Math.max(0, Number(app.viewportOverscanRows || 0));
  return {
    startRow: Math.max(1, firstVisibleRow - overscan),
    endRow: Math.min(app.table.rows.length - 1, lastVisibleRow + overscan),
  };
}

export function getViewportInputRenderTargets(app, inputs, options) {
  var items = Array.isArray(inputs) ? inputs : [];
  if (!app || !app.viewportRenderingEnabled) return items;
  if (items.length <= Math.max(0, Number(app.viewportRenderThreshold || 0))) {
    return items;
  }

  var range = getViewportRowRange(app);
  if (!range) return items;

  var pinnedRows = getPinnedRowIndexes(app, options);
  var targets = [];
  for (var i = 0; i < items.length; i++) {
    var input = items[i];
    var rowIndex = getInputRowIndex(app, input);
    if (!rowIndex) continue;
    if (
      pinnedRows[rowIndex] ||
      (rowIndex >= range.startRow && rowIndex <= range.endRow)
    ) {
      targets.push(input);
    }
  }
  return targets.length ? targets : items;
}

export function renderViewportRows(app, options) {
  var mountedInputs =
    app && typeof app.getMountedInputs === 'function'
      ? app.getMountedInputs()
      : app && Array.isArray(app.inputs)
        ? app.inputs
        : [];
  if (!app || !mountedInputs.length) return;
  var targets = getViewportInputRenderTargets(app, mountedInputs, options);
  var keepRowMap = collectViewportKeepRowMap(app, targets, options);
  applyMountedRowRange(app, keepRowMap);
  var postMountInputs =
    typeof app.getMountedInputs === 'function'
      ? app.getMountedInputs()
      : mountedInputs;
  var finalTargets = [];
  for (var i = 0; i < postMountInputs.length; i++) {
    var input = postMountInputs[i];
    var rowIndex = getInputRowIndex(app, input);
    if (!rowIndex || !keepRowMap[rowIndex]) continue;
    finalTargets.push(input);
  }
  for (var targetIndex = 0; targetIndex < finalTargets.length; targetIndex++) {
    var targetInput = finalTargets[targetIndex];
    try {
      applyComputedCellRender(app, targetInput, {
        showFormulas: app.displayMode === 'formulas',
      });
    } catch (error) {
      clearComputedCellRenderState(targetInput, app);
    }
  }
  pruneOffscreenCellContent(app, keepRowMap);

  var rowIndexes = [];
  var seenRows = {};
  for (
    var renderTargetIndex = 0;
    renderTargetIndex < finalTargets.length;
    renderTargetIndex++
  ) {
    var renderedInput = finalTargets[renderTargetIndex];
    var renderedRowIndex = getInputRowIndex(app, renderedInput);
    if (!renderedRowIndex || seenRows[renderedRowIndex]) continue;
    seenRows[renderedRowIndex] = true;
    rowIndexes.push(renderedRowIndex);
  }
  if (rowIndexes.length) {
    updateWrappedRowHeights(app, { rowIndexes: rowIndexes });
    applyRightOverflowText(app, { rowIndexes: rowIndexes });
  }
  if (typeof app.syncEditorOverlay === 'function') app.syncEditorOverlay();
}

export function setupViewportRendering(app) {
  if (!app || !app.tableWrap || app.viewportRenderingRuntimeBound) return;
  app.viewportRenderingRuntimeBound = true;
  app.viewportRenderingEnabled = true;
  app.viewportOverscanRows = Math.max(
    8,
    Number(app.viewportOverscanRows || 12),
  );
  app.viewportRenderThreshold = Math.max(
    100,
    Number(app.viewportRenderThreshold || 160),
  );
  app.viewportRenderFramePending = false;
  app.ensureViewportRowMounted = function (rowIndex) {
    var parsedRowIndex = Number(rowIndex || 0);
    if (!Number.isFinite(parsedRowIndex) || parsedRowIndex < 1) return null;
    return mountViewportRow(app, parsedRowIndex);
  };
  app.remountAllViewportRows = function () {
    var detachedRows = ensureDetachedRowState(app);
    var indexes = Object.keys(detachedRows);
    for (var i = 0; i < indexes.length; i++) {
      mountViewportRow(app, Number(indexes[i]));
    }
    app.mountedRowRange = null;
  };
  app.handleViewportRenderSync = function () {
    if (app.viewportRenderFramePending) return;
    app.viewportRenderFramePending = true;
    requestAnimationFrame(function () {
      app.viewportRenderFramePending = false;
      if (app.isReportActive && app.isReportActive()) return;
      renderViewportRows(app, { reason: 'scroll' });
    });
  };
  app.tableWrap.addEventListener('scroll', app.handleViewportRenderSync, {
    passive: true,
  });
}

export function cleanupViewportRendering(app) {
  if (!app || !app.tableWrap || !app.handleViewportRenderSync) return;
  if (typeof app.remountAllViewportRows === 'function') {
    app.remountAllViewportRows();
  }
  app.tableWrap.removeEventListener('scroll', app.handleViewportRenderSync);
  app.handleViewportRenderSync = null;
  app.ensureViewportRowMounted = null;
  app.remountAllViewportRows = null;
  app.viewportRenderFramePending = false;
  app.viewportRenderingRuntimeBound = false;
}
