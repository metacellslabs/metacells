import { MIN_COL_WIDTH } from './constants.js';

export function setColumnWidthFromGuide(grid, colIndex, guideLeftX, columnLeftX) {
  var desiredRightX = guideLeftX + 1;
  var desiredWidth = Math.max(MIN_COL_WIDTH, desiredRightX - columnLeftX);
  var finalWidth = grid.setColumnWidth(colIndex, desiredWidth);
  var cell = grid.table.rows[0] && grid.table.rows[0].cells[colIndex];
  if (!cell) return finalWidth;

  var actualRect = cell.getBoundingClientRect();
  var actualRightX = actualRect.right;
  var drift = desiredRightX - actualRightX;
  if (Math.abs(drift) > 0.5) {
    finalWidth = grid.setColumnWidth(colIndex, finalWidth + drift);
  }
  return finalWidth;
}

export function measureGridCellPreferredWidth(cell) {
  var probe = cell.cloneNode(true);
  probe.style.position = 'fixed';
  probe.style.left = '-99999px';
  probe.style.top = '0';
  probe.style.width = 'auto';
  probe.style.minWidth = '0';
  probe.style.maxWidth = 'none';
  probe.style.height = 'auto';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.whiteSpace = 'nowrap';
  probe.style.overflow = 'visible';

  var input = probe.querySelector('.cell-anchor-input');
  if (input) {
    input.style.position = 'static';
    input.style.width = 'auto';
    input.style.minWidth = '0';
    input.style.height = 'auto';
    input.style.pointerEvents = 'none';
  }

  var output = probe.querySelector('.cell-output');
  if (output) {
    output.style.position = 'static';
    output.style.width = 'auto';
    output.style.minWidth = '0';
    output.style.maxWidth = 'none';
    output.style.height = 'auto';
    output.style.overflow = 'visible';
    output.style.whiteSpace = 'nowrap';
  }

  document.body.appendChild(probe);
  var measured =
    Math.ceil(Math.max(probe.scrollWidth || 0, probe.offsetWidth || 0, cell.scrollWidth || 0)) + 12;
  probe.remove();
  return measured;
}

export function autoFitGridColumnWidth(grid, colIndex) {
  var maxWidth = MIN_COL_WIDTH;
  for (var rowIndex = 0; rowIndex < grid.table.rows.length; rowIndex++) {
    var cell = grid.table.rows[rowIndex] && grid.table.rows[rowIndex].cells[colIndex];
    if (!cell) continue;
    maxWidth = Math.max(maxWidth, measureGridCellPreferredWidth(cell));
  }
  return grid.setColumnWidth(colIndex, Math.min(Math.max(maxWidth, MIN_COL_WIDTH), 640));
}

export function ensureGridColumnResizeGuide(grid) {
  if (grid.columnResizeGuide && document.body.contains(grid.columnResizeGuide)) {
    return grid.columnResizeGuide;
  }
  var guide = document.createElement('div');
  guide.className = 'column-resize-guide';
  document.body.appendChild(guide);
  grid.columnResizeGuide = guide;
  return guide;
}

export function showGridColumnResizeGuide(grid, clientX) {
  var guide = ensureGridColumnResizeGuide(grid);
  guide.style.left = Math.round(clientX) + 'px';
  guide.style.display = 'block';
}

export function moveGridColumnResizeGuide(grid, clientX) {
  if (!grid.columnResizeGuide) return;
  grid.columnResizeGuide.style.left = Math.round(clientX) + 'px';
}

export function hideGridColumnResizeGuide(grid) {
  if (!grid.columnResizeGuide) return;
  grid.columnResizeGuide.style.display = 'none';
}
