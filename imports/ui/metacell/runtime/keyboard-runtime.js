import { applyPresentationToSelection } from './editor-controls-runtime.js';
import {
  bindCellInputEditingEvents,
  bindOverlayEditingInputEvents,
} from './editing-input-runtime.js';

export function setupButtons(app) {
  app.addTabButton.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    app.toggleAddTabMenu();
  });
  app.deleteTabButton.addEventListener('click', () => app.deleteActiveTab());
  if (app.undoButton)
    app.undoButton.addEventListener('click', () => app.undo());
  if (app.redoButton)
    app.redoButton.addEventListener('click', () => app.redo());
  if (app.assistantChatButton)
    app.assistantChatButton.addEventListener('click', () =>
      app.toggleAssistantPanel(),
    );
  if (app.formulaTrackerButton)
    app.formulaTrackerButton.addEventListener('click', () =>
      app.toggleFormulaTrackerPanel(),
    );

  document.addEventListener('click', (e) => {
    if (!app.addTabMenu || app.addTabMenu.style.display === 'none') return;
    if (e.target === app.addTabButton) return;
    if (
      app.addTabButton &&
      app.addTabButton.contains &&
      app.addTabButton.contains(e.target)
    )
      return;
    if (app.addTabMenu.contains && app.addTabMenu.contains(e.target)) return;
    app.hideAddTabMenu();
  });
  document.addEventListener('keydown', (e) => {
    var activeEl = document.activeElement;
    var isEditableTarget = !!(
      activeEl &&
      ((activeEl.tagName === 'INPUT' &&
        !activeEl.readOnly &&
        !activeEl.disabled) ||
        activeEl === app.formulaInput ||
        activeEl === app.cellNameInput ||
        activeEl === app.reportEditor ||
        (activeEl.tagName === 'TEXTAREA' &&
          activeEl !== app.activeInput &&
          activeEl !== app.formulaInput) ||
        (activeEl.tagName === 'INPUT' &&
          activeEl !== app.activeInput &&
          activeEl !== app.formulaInput &&
          activeEl !== app.cellNameInput) ||
        activeEl.isContentEditable)
    );
    if (
      !e.metaKey &&
      !e.ctrlKey &&
      (e.key === 'Delete' || e.key === 'Backspace') &&
      !isEditableTarget &&
      !app.isReportActive() &&
      app.activeInput
    ) {
      e.preventDefault();
      app.clearSelectedCells();
      return;
    }

    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      var key = String(e.key || '').toLowerCase();
      var isReportEditing = !!(
        activeEl &&
        app.reportEditor &&
        activeEl === app.reportEditor &&
        app.reportMode === 'edit'
      );
      var shouldUseWorkbookHistory =
        !app.hasPendingLocalEdit() && !isReportEditing;
      var isDisplayModeShortcut =
        key === '/' ||
        key === '?' ||
        e.code === 'Slash' ||
        e.code === 'NumpadDivide';
      if (shouldUseWorkbookHistory && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) app.redo();
        else app.undo();
        return;
      }
      if (shouldUseWorkbookHistory && key === 'y') {
        e.preventDefault();
        app.redo();
        return;
      }
      if (!isReportEditing && isDisplayModeShortcut) {
        e.preventDefault();
        app.setDisplayMode(
          app.displayMode === 'formulas' ? 'values' : 'formulas',
        );
        return;
      }
      if (!isReportEditing && key === 'k' && !app.isReportActive()) {
        e.preventDefault();
        if (typeof app.runManualAIUpdate === 'function') {
          app.runManualAIUpdate();
        }
        return;
      }
      if (
        !isReportEditing &&
        key === 'b' &&
        app.activeInput &&
        !app.isReportActive()
      ) {
        e.preventDefault();
        var currentBold = app.storage.getCellPresentation(
          app.activeSheetId,
          app.activeInput.id,
        );
        applyPresentationToSelection(
          app,
          {
            bold: !currentBold.bold,
          },
          'cell-bold',
        );
        return;
      }
      if (
        !isReportEditing &&
        key === 'i' &&
        app.activeInput &&
        !app.isReportActive()
      ) {
        e.preventDefault();
        var currentItalic = app.storage.getCellPresentation(
          app.activeSheetId,
          app.activeInput.id,
        );
        applyPresentationToSelection(
          app,
          {
            italic: !currentItalic.italic,
          },
          'cell-italic',
        );
        return;
      }
    }
    if (e.key !== 'Escape') return;
    app.hideAddTabMenu();
    app.hideFormulaTrackerPanel();
  });
  window.addEventListener('resize', () => app.hideAddTabMenu());
}

export function ensureAddTabMenu(app) {
  if (app.addTabMenu) return app.addTabMenu;
  var menu = document.createElement('div');
  menu.className = 'add-tab-menu';
  menu.style.display = 'none';
  menu.innerHTML =
    '' +
    "<button type='button' class='add-tab-option' data-kind='sheet'>Sheet</button>" +
    "<button type='button' class='add-tab-option' data-kind='report'>Report</button>";
  document.body.appendChild(menu);
  menu.addEventListener('click', (e) => {
    var option =
      e.target && e.target.closest ? e.target.closest('.add-tab-option') : null;
    if (!option) return;
    var kind = option.dataset.kind;
    hideAddTabMenu(app);
    if (kind === 'report') {
      app.addReportTab();
    } else {
      app.addTab();
    }
  });
  app.addTabMenu = menu;
  return menu;
}

export function toggleAddTabMenu(app) {
  var menu = ensureAddTabMenu(app);
  if (menu.style.display !== 'none') {
    hideAddTabMenu(app);
    return;
  }
  var rect = app.addTabButton.getBoundingClientRect();
  menu.style.display = 'flex';
  menu.style.visibility = 'hidden';

  var gap = 6;
  var menuWidth = menu.offsetWidth || 120;
  var menuHeight = menu.offsetHeight || 72;
  var viewportWidth =
    window.innerWidth || document.documentElement.clientWidth || 0;
  var viewportHeight =
    window.innerHeight || document.documentElement.clientHeight || 0;

  var left = rect.left;
  if (left + menuWidth > viewportWidth - 8)
    left = viewportWidth - menuWidth - 8;
  if (left < 8) left = 8;

  var top = rect.bottom + gap;
  if (top + menuHeight > viewportHeight - 8) {
    top = rect.top - menuHeight - gap;
  }
  if (top < 8) top = 8;

  menu.style.left = Math.round(left) + 'px';
  menu.style.top = Math.round(top) + 'px';
  menu.style.visibility = 'visible';
  menu.style.display = 'flex';
}

export function hideAddTabMenu(app) {
  if (!app.addTabMenu) return;
  app.addTabMenu.style.display = 'none';
}

export function ensureContextMenu(app) {
  if (app.contextMenu) return app.contextMenu;
  var menu = document.createElement('div');
  menu.className = 'sheet-context-menu';
  menu.style.display = 'none';
  menu.innerHTML =
    '' +
    "<button type='button' class='sheet-context-item' data-action='insert-row-before'>Insert row before</button>" +
    "<button type='button' class='sheet-context-item' data-action='insert-row-after'>Insert row after</button>" +
    "<button type='button' class='sheet-context-item' data-action='insert-col-before'>Insert column before</button>" +
    "<button type='button' class='sheet-context-item' data-action='insert-col-after'>Insert column after</button>" +
    "<button type='button' class='sheet-context-item' data-action='delete-row'>Delete row</button>" +
    "<button type='button' class='sheet-context-item' data-action='delete-col'>Delete column</button>" +
    "<div class='sheet-context-sep'></div>" +
    "<button type='button' class='sheet-context-item' data-action='recalc'>Re-calc</button>" +
    "<button type='button' class='sheet-context-item' data-action='schedule'>Schedule</button>" +
    "<button type='button' class='sheet-context-item' data-action='copy'>Copy</button>" +
    "<button type='button' class='sheet-context-item' data-action='paste'>Paste</button>";
  document.body.appendChild(menu);
  menu.addEventListener('click', (e) => {
    var item =
      e.target && e.target.closest
        ? e.target.closest('.sheet-context-item')
        : null;
    if (!item) return;
    var action = item.dataset.action;
    hideContextMenu(app);
    app.runContextMenuAction(action);
  });
  app.contextMenu = menu;
  return menu;
}

export function setupContextMenu(app) {
  ensureContextMenu(app);
  app.table.addEventListener('contextmenu', (e) => {
    if (app.isReportActive()) return;
    var td = e.target && e.target.closest ? e.target.closest('td') : null;
    if (!td) return;
    e.preventDefault();
    prepareContextFromCell(app, td);
    openContextMenu(app, e.clientX, e.clientY);
  });

  document.addEventListener('click', () => hideContextMenu(app));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideContextMenu(app);
  });
  window.addEventListener('resize', () => hideContextMenu(app));
}

export function prepareContextFromCell(app, td) {
  if (!td) return;
  var rowIndex = td.parentElement ? td.parentElement.rowIndex : -1;
  var colIndex = td.cellIndex;
  var maxRow = app.table.rows.length - 1;
  var maxCol = app.table.rows[0].cells.length - 1;
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
  if (
    rowIndex >= 1 &&
    rowIndex <= maxRow &&
    colIndex >= 1 &&
    colIndex <= maxCol
  ) {
    var cellId = app.cellIdFrom(colIndex, rowIndex);
    var input = resolveSpillSourceInput(app, app.inputById[cellId]);
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
  var menu = ensureContextMenu(app);
  var recalcItem = menu.querySelector("[data-action='recalc']");
  var scheduleItem = menu.querySelector("[data-action='schedule']");
  if (recalcItem) {
    recalcItem.style.display =
      app.contextMenuState && app.contextMenuState.type === 'cell'
        ? 'block'
        : 'none';
  }
  if (scheduleItem) {
    scheduleItem.style.display =
      app.contextMenuState && app.contextMenuState.type === 'cell'
        ? 'block'
        : 'none';
  }
  menu.style.display = 'flex';
  menu.style.visibility = 'hidden';

  var menuWidth = menu.offsetWidth || 180;
  var menuHeight = menu.offsetHeight || 220;
  var viewportWidth =
    window.innerWidth || document.documentElement.clientWidth || 0;
  var viewportHeight =
    window.innerHeight || document.documentElement.clientHeight || 0;
  var left = clientX;
  var top = clientY;

  if (left + menuWidth > viewportWidth - 8)
    left = viewportWidth - menuWidth - 8;
  if (top + menuHeight > viewportHeight - 8)
    top = viewportHeight - menuHeight - 8;
  if (left < 8) left = 8;
  if (top < 8) top = 8;

  menu.style.left = Math.round(left) + 'px';
  menu.style.top = Math.round(top) + 'px';
  menu.style.visibility = 'visible';
  menu.style.display = 'flex';
}

export function hideContextMenu(app) {
  if (!app.contextMenu) return;
  app.contextMenu.style.display = 'none';
}

function resolveSpillSourceInput(app, input) {
  if (!app || !input) return input;
  if (typeof app.getSpillSourceForCell !== 'function') return input;
  var sourceCellId = app.getSpillSourceForCell(app.activeSheetId, input.id);
  if (!sourceCellId || sourceCellId === String(input.id || '').toUpperCase()) {
    return input;
  }
  return (app.inputById && app.inputById[sourceCellId]) || input;
}

function bindCellFocusProxyEvents(app, input) {
  var proxy =
    app.grid && typeof app.grid.getFocusProxy === 'function'
      ? app.grid.getFocusProxy(input)
      : input.parentElement.querySelector('.cell-focus-proxy');
  if (!proxy) return;

  proxy.addEventListener('focus', () => {
    app.setActiveInput(input);
    app.syncAIDraftLock();
  });

  proxy.addEventListener('click', (e) => {
    var targetInput = resolveSpillSourceInput(app, input);
    e.preventDefault();
    app.setActiveInput(targetInput);
    if (e.shiftKey) {
      var anchor =
        (typeof app.getSelectionAnchorCellId === 'function'
          ? app.getSelectionAnchorCellId()
          : app.selectionAnchorId) || targetInput.id;
      app.setSelectionRange(anchor, targetInput.id);
    } else {
      app.setSelectionAnchor(targetInput.id);
      app.clearSelectionRange();
    }
  });

  proxy.addEventListener('dblclick', (e) => {
    var targetInput = resolveSpillSourceInput(app, input);
    e.preventDefault();
    app.setActiveInput(targetInput);
    app.startEditingCell(targetInput);
  });

  proxy.addEventListener('keydown', (e) => {
    var targetInput = input;
    if (!app.isEditingCell(targetInput) && app.isDirectTypeKey(e)) {
      var directTypeValue =
        typeof app.getDirectTypeValue === 'function'
          ? app.getDirectTypeValue(e)
          : String(e.key || '');
      e.preventDefault();
      app.handleCellDirectType(targetInput, directTypeValue, {
        clearSelection: true,
        origin: 'cell',
      });
      return;
    }
    if (!e.metaKey && !e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      app.handleCellEditingEnter(targetInput, { origin: 'cell' });
      app.clearSelectionRange();
      return;
    }
    if (!e.metaKey && !e.ctrlKey && e.key === 'Tab') {
      e.preventDefault();
      app.clearSelectionRange();
      app.grid.focusCellByArrow(
        targetInput,
        e.shiftKey ? 'ArrowLeft' : 'ArrowRight',
      );
      return;
    }
    if (
      !e.metaKey &&
      !e.ctrlKey &&
      (e.key === 'Delete' || e.key === 'Backspace')
    ) {
      e.preventDefault();
      app.clearSelectedCells();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      var now = Date.now();
      var isDoublePress = now - app.lastSelectAllShortcutTs < 500;
      app.lastSelectAllShortcutTs = now;
      if (isDoublePress) {
        app.selectWholeSheetRegion();
      } else {
        app.selectNearestValueRegionFromActive(input);
      }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      app.copySelectedRangeToClipboard();
      return;
    }
    if (
      !app.isEditingCell(targetInput) &&
      (e.metaKey || e.ctrlKey) &&
      (e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight')
    ) {
      e.preventDefault();
      if (e.shiftKey) {
        var currentSelectionRange =
          typeof app.getSelectionRange === 'function'
            ? app.getSelectionRange()
            : app.selectionRange;
        var hadSelection = !!currentSelectionRange;
        var jumpSource = app.getSelectionEdgeInputForDirection(
          targetInput,
          e.key,
        );
        app.extendSelectionNav = true;
        var jumpTargetInput = app.moveToNextFilledCell(
          jumpSource || targetInput,
          e.key,
        );
        app.extendSelectionNav = false;
        if (jumpTargetInput) {
          if (
            hadSelection &&
            (typeof app.getSelectionRange === 'function'
              ? app.getSelectionRange()
              : app.selectionRange)
          ) {
            app.extendSelectionRangeTowardCell(jumpTargetInput.id, e.key);
          } else {
            var anchor =
              (typeof app.getSelectionAnchorCellId === 'function'
                ? app.getSelectionAnchorCellId()
                : app.selectionAnchorId) || targetInput.id;
            app.setSelectionRange(anchor, jumpTargetInput.id);
          }
        }
      } else {
        app.clearSelectionRange();
        app.moveToNextFilledCell(targetInput, e.key);
      }
      return;
    }
    if (
      e.shiftKey &&
      (e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight')
    ) {
      e.preventDefault();
      app.moveSelectionByArrow(targetInput, e.key);
      return;
    }
    if (
      !e.shiftKey &&
      (e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight')
    ) {
      app.clearSelectionRange();
    }
    if (!e.shiftKey && e.key === 'Enter') {
      app.clearSelectionRange();
    }
    if (app.grid.focusCellByArrow(targetInput, e.key)) {
      e.preventDefault();
    }
  });
}

function bindCellShellEvents(app, input) {
  input.parentElement.addEventListener('click', (e) => {
    if (app.selectionDragJustFinished) {
      app.selectionDragJustFinished = false;
      return;
    }
    if (e.target === input) return;
    if (e.target.closest && e.target.closest('.fill-handle')) return;
    if (e.target.closest && e.target.closest('.cell-actions')) return;
    var output = e.target.closest && e.target.closest('.cell-output');
    if (output) {
      var canScroll =
        output.scrollHeight > output.clientHeight ||
        output.scrollWidth > output.clientWidth;
      if (canScroll) return;
    }
    var targetInput = resolveSpillSourceInput(app, input);
    app.setActiveInput(targetInput);
    if (e.shiftKey) {
      var rangeAnchor =
        (typeof app.getSelectionAnchorCellId === 'function'
          ? app.getSelectionAnchorCellId()
          : app.selectionAnchorId) || targetInput.id;
      app.setSelectionRange(rangeAnchor, targetInput.id);
    } else {
      app.setSelectionAnchor(targetInput.id);
      app.clearSelectionRange();
    }
    if (typeof app.focusCellProxy === 'function') {
      app.focusCellProxy(targetInput);
    }
  });

  input.parentElement.addEventListener('dblclick', (e) => {
    if (e.target.closest && e.target.closest('.fill-handle')) return;
    if (e.target.closest && e.target.closest('.cell-actions')) return;
    var targetInput = resolveSpillSourceInput(app, input);
    app.setActiveInput(targetInput);
    app.startEditingCell(targetInput);
  });

  input.parentElement.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest && e.target.closest('.fill-handle')) return;
    if (e.target.closest && e.target.closest('.cell-actions')) return;
    app.startSelectionDrag(resolveSpillSourceInput(app, input), e);
  });
}

function bindCellActionEvents(app, input) {
  var actions = input.parentElement.querySelector('.cell-actions');
  if (actions) {
    actions.addEventListener('click', (e) => {
      var btn = e.target.closest && e.target.closest('.cell-action');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      var action = btn.dataset.action;
      if (action === 'copy') app.copyCellValue(input);
      if (action === 'fullscreen') app.openFullscreenCell(input);
      if (action === 'run') app.runFormulaForCell(input);
    });
  }
}

function bindCellFillHandleEvents(app, input) {
  var fillHandle = input.parentElement.querySelector('.fill-handle');
  if (fillHandle) {
    fillHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      app.startFillDrag(input, e);
    });
  }
}

export function bindGridInputEvents(app) {
  bindOverlayEditingInputEvents(app);
  app.inputs.forEach((input) => {
    bindCellInputEditingEvents(app, input);
    bindCellFocusProxyEvents(app, input);
    bindCellShellEvents(app, input);
    bindCellActionEvents(app, input);
    bindCellFillHandleEvents(app, input);
  });
}
