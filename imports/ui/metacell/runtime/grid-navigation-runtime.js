import { focusGridCellInput } from './grid-cell-runtime.js';

export function setGridCellEditing(grid, input, editing) {
  var isEditing = !!editing;
  input.readOnly = !isEditing;
  input.setAttribute('aria-readonly', isEditing ? 'false' : 'true');
  input.tabIndex = isEditing ? 0 : -1;
  input.classList.toggle('editing', isEditing);
  input.parentElement.classList.toggle('editing', isEditing);
  if (typeof grid.onEditingStateChange === 'function') {
    grid.onEditingStateChange(input, isEditing);
  }
  if (!isEditing) {
    input.parentElement.classList.remove('formula-bar-editing');
  }
}

export function focusGridCellByArrow(grid, input, key) {
  var movement = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  }[key];

  if (!movement) return false;

  var td = input.parentElement;
  var row = td.parentElement;
  var nextRowIndex = row.rowIndex + movement[0];
  var nextCellIndex = td.cellIndex + movement[1];
  var bounds =
    grid && typeof grid.getGridBounds === 'function'
      ? grid.getGridBounds()
      : {
          rows: grid.table.rows.length - 1,
          cols: grid.table.rows[nextRowIndex]
            ? grid.table.rows[nextRowIndex].cells.length - 1
            : 0,
        };

  if (nextRowIndex < 1 || nextCellIndex < 1) return true;
  if (nextRowIndex > bounds.rows) return true;
  if (nextCellIndex > bounds.cols) return true;

  var nextInput =
    typeof grid.getInputByCoords === 'function'
      ? grid.getInputByCoords(nextRowIndex, nextCellIndex)
      : grid.table.rows[nextRowIndex].cells[nextCellIndex].querySelector(
          '.cell-anchor-input',
        );
  if (nextInput) {
    focusGridCellInput(nextInput);
  }
  return true;
}
