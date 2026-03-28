import {
  closeAllCellActionMenus,
  performCellActionMenuItem,
  toggleCellActionMenu,
} from './cell-actions-runtime.js';

function resolveCellInputFromEventTarget(target) {
  var cell = target && target.closest ? target.closest('td') : null;
  if (!cell) return null;
  return cell.querySelector('.cell-anchor-input');
}

function handleCellShellClick(app, input, e) {
  if (app.selectionDragJustFinished) {
    app.selectionDragJustFinished = false;
    return;
  }
  if (e.target === input) {
    var isFocusedEditor = !!(
      app &&
      typeof app.isEditingCell === 'function' &&
      app.isEditingCell(input) &&
      app.activeInput === input &&
      document.activeElement === input
    );
    if (isFocusedEditor) return;
    if (app && app.grid && typeof app.grid.setEditing === 'function') {
      app.grid.setEditing(input, false);
    }
  }
  if (e.target.closest && e.target.closest('.fill-handle')) return;
  if (e.target.closest && e.target.closest('.cell-actions')) return;
  var output = e.target.closest && e.target.closest('.cell-output');
  if (output) {
    var canScroll =
      output.scrollHeight > output.clientHeight ||
      output.scrollWidth > output.clientWidth;
    if (canScroll) return;
  }
  if (
    app &&
    typeof app.hideFloatingAttachmentPreview === 'function' &&
    !(e.target.closest && e.target.closest('.floating-attachment-preview'))
  ) {
    app.hideFloatingAttachmentPreview();
  }
  app.setActiveInput(input);
  if (e.shiftKey) {
    var rangeAnchor =
      (typeof app.getSelectionAnchorCellId === 'function'
        ? app.getSelectionAnchorCellId()
        : app.selectionAnchorId) || input.id;
    app.setSelectionRange(rangeAnchor, input.id);
  } else {
    app.setSelectionAnchor(input.id);
    app.clearSelectionRange();
  }
  if (typeof app.focusCellProxy === 'function') {
    app.focusCellProxy(input);
  } else if (typeof input.focus === 'function') {
    input.focus();
  }
}

function handleCellShellDoubleClick(app, input, e) {
  if (e.target.closest && e.target.closest('.fill-handle')) return;
  if (e.target.closest && e.target.closest('.cell-actions')) return;
  app.setActiveInput(input);
  app.startEditingCell(input);
}

function handleCellShellMouseDown(app, input, e) {
  if (e.button !== 0) return;
  if (e.target.closest && e.target.closest('.fill-handle')) return;
  if (e.target.closest && e.target.closest('.cell-actions')) return;
  app.startSelectionDrag(input, e);
}

function handleCellActionClick(app, input, e) {
  var btn = e.target.closest && e.target.closest('.cell-action-trigger');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  toggleCellActionMenu(app, input, btn);
}

function handleCellActionMenuItemClick(app, input, e) {
  var btn = e.target.closest && e.target.closest('.cell-action-menu-item');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  performCellActionMenuItem(app, input, btn.dataset.menuAction);
}

function handleCellFillHandleMouseDown(app, input, e) {
  e.preventDefault();
  e.stopPropagation();
  app.startFillDrag(input, e);
}

export function bindDelegatedCellShellEvents(app) {
  if (!app || !app.table || app.table.dataset.delegatedShellBound === 'true') {
    return;
  }
  app.table.dataset.delegatedShellBound = 'true';

  app.table.addEventListener('click', function (e) {
    var input = resolveCellInputFromEventTarget(e.target);
    if (e.target.closest && e.target.closest('.cell-action-menu-item')) {
      if (!input) return;
      handleCellActionMenuItemClick(app, input, e);
      return;
    }
    if (e.target.closest && e.target.closest('.cell-action-trigger')) {
      if (!input) return;
      handleCellActionClick(app, input, e);
      return;
    }
    closeAllCellActionMenus(app.table);
    if (!input) return;
    handleCellShellClick(app, input, e);
  });

  app.table.addEventListener('dblclick', function (e) {
    var input = resolveCellInputFromEventTarget(e.target);
    if (!input) return;
    handleCellShellDoubleClick(app, input, e);
  });

  app.table.addEventListener('mousedown', function (e) {
    if (!(e.target.closest && e.target.closest('.cell-actions'))) {
      closeAllCellActionMenus(app.table);
    }
    var input = resolveCellInputFromEventTarget(e.target);
    if (!input) return;
    if (e.target.closest && e.target.closest('.fill-handle')) {
      handleCellFillHandleMouseDown(app, input, e);
      return;
    }
    handleCellShellMouseDown(app, input, e);
  });
}
