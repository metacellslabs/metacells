import {
  getSelectionFillRangeState,
  getSelectionRangeState,
} from './selection-range-facade.js';

export function collectAppUiStateSnapshot(app) {
  var isReportActive =
    typeof app.isReportActive === 'function' ? app.isReportActive() : false;
  var reportMode = String(app.reportMode || 'edit');
  var activeCellId =
    typeof app.getSelectionActiveCellId === 'function'
      ? app.getSelectionActiveCellId()
      : String(app.activeCellId || '');
  var formulaSnapshotValue = '';
  if (
    app.formulaInput &&
    typeof document !== 'undefined' &&
    document.activeElement === app.formulaInput
  ) {
    formulaSnapshotValue = String(app.formulaInput.value || '');
  } else if (activeCellId) {
    var editingDraft =
      typeof app.getEditingSessionDraft === 'function'
        ? app.getEditingSessionDraft(activeCellId)
        : null;
    if (editingDraft != null) {
      formulaSnapshotValue = String(editingDraft);
    } else {
      formulaSnapshotValue = String(app.getRawCellValue(activeCellId) || '');
    }
  }
  var selectionUi = collectSelectionUiState(app, activeCellId);
  var toolbarUi =
    typeof app.collectToolbarUiState === 'function'
      ? app.collectToolbarUiState()
      : null;
  var surfaceStatusUi = collectSurfaceStatusUiState(app);
  return {
    tabs: app.getWorkbookTabs ? app.getWorkbookTabs() : [],
    visibleSheetId:
      typeof app.getVisibleSheetId === 'function'
        ? app.getVisibleSheetId()
        : String(app.activeSheetId || ''),
    editingOwnerSheetId:
      typeof app.getEditingOwnerSheetId === 'function'
        ? app.getEditingOwnerSheetId()
        : String(app.activeSheetId || ''),
    activeCellId: activeCellId,
    activeInputId:
      app.activeInput && app.activeInput.id
        ? String(app.activeInput.id || '').toUpperCase()
        : '',
    selectionAnchorId:
      typeof app.getSelectionAnchorCellId === 'function'
        ? app.getSelectionAnchorCellId()
        : String(app.selectionAnchorId || ''),
    selectionRange:
      getSelectionRangeState(app),
    selectionUi: selectionUi,
    selectionFillRange:
      getSelectionFillRangeState(app),
    editingSession:
      app.editingSession && typeof app.editingSession === 'object'
        ? app.editingSession
        : null,
    formulaValue: formulaSnapshotValue,
    cellNameValue: app.cellNameInput ? String(app.cellNameInput.value || '') : '',
    namedCellJumpUi:
      typeof app.getNamedCellJumpUiState === 'function'
        ? app.getNamedCellJumpUiState()
        : null,
    aiModeUi:
      typeof app.getAIModeUiState === 'function'
        ? app.getAIModeUiState()
        : null,
    formulaBarUi:
      typeof app.collectFormulaBarUiState === 'function'
        ? app.collectFormulaBarUiState()
        : null,
    toolbarUi: toolbarUi,
    serverPushUi: {
      state: String(app.serverPushConnectionState || 'disconnected'),
      enabled: app.serverPushEventsEnabled === true,
    },
    surfaceStatusUi: surfaceStatusUi,
    editorOverlayUi:
      app.editorOverlayUiState && typeof app.editorOverlayUiState === 'object'
        ? app.editorOverlayUiState
        : null,
    attachmentContentUi:
      app.attachmentContentUiState &&
      typeof app.attachmentContentUiState === 'object'
        ? app.attachmentContentUiState
        : null,
    floatingAttachmentPreviewUi:
      app.floatingAttachmentPreviewUiState &&
      typeof app.floatingAttachmentPreviewUiState === 'object'
        ? app.floatingAttachmentPreviewUiState
        : null,
    mentionAutocompleteUi:
      app.mentionAutocompleteUiState &&
      typeof app.mentionAutocompleteUiState === 'object'
        ? app.mentionAutocompleteUiState
        : null,
    fullscreenUi: {
      active: !!(app.fullscreenCellId && app.fullscreenOverlay),
      cellId: String(app.fullscreenCellId || ''),
      editMode: String(app.fullscreenEditMode || 'value'),
      isEditing: app.fullscreenIsEditing === true,
      draft:
        app.fullscreenEditMode === 'value'
          ? String(app.fullscreenValueDraft || '')
          : String(app.fullscreenFormulaDraft || ''),
    },
    formulaTrackerUi:
      typeof app.getFormulaTrackerUiState === 'function'
        ? app.getFormulaTrackerUiState()
        : null,
    assistantUi:
      typeof app.getAssistantUiState === 'function'
        ? app.getAssistantUiState()
        : {
            open: app.assistantPanelOpen === true,
            busy: app.assistantBusy === true,
          },
    scheduleDialogUi:
      typeof app.getScheduleDialogUiState === 'function'
        ? app.getScheduleDialogUiState()
        : null,
    addTabMenuUi:
      typeof app.getAddTabMenuUiState === 'function'
        ? app.getAddTabMenuUiState()
        : null,
    contextMenuUi:
      typeof app.getContextMenuUiState === 'function'
        ? app.getContextMenuUiState()
        : null,
    displayMode: String(app.displayMode || 'values'),
    reportMode: reportMode,
    isReportActive: isReportActive,
  };
}

function collectSurfaceStatusUiState(app) {
  var isReportActive =
    !!(app && typeof app.isReportActive === 'function' && app.isReportActive());
  var calcProgressVisible = !!(
    app &&
    app.calcProgress &&
    app.calcProgress.classList &&
    typeof app.calcProgress.classList.contains === 'function' &&
    app.calcProgress.classList.contains('active')
  );
  var calcProgressText = String(
    app && app.calcProgress ? app.calcProgress.textContent || '' : '',
  ).trim();
  var aiUpdating = !!(app && app.isManualAIUpdating);
  var aiInFlight = !!(
    app &&
    app.aiService &&
    typeof app.aiService.hasInFlightWork === 'function' &&
    app.aiService.hasInFlightWork()
  );
  var processing = calcProgressVisible || aiUpdating || aiInFlight;
  var scope = isReportActive ? 'report' : 'sheet';
  return {
    scope: scope,
    status: processing ? 'processing' : 'ready',
    label: processing ? 'Processing' : 'Ready',
    detail: processing
      ? calcProgressText || (aiUpdating ? 'Updating AI' : aiInFlight ? 'Waiting for AI' : '')
      : '',
    processing: processing,
  };
}

function collectSelectionUiState(app, activeCellId) {
  if (!app.tableWrap || !app.table) return null;
  var wrapRect = app.tableWrap.getBoundingClientRect();
  var getCellByCoords = function (rowIndex, colIndex) {
    return typeof app.getCellElementByCoords === 'function'
      ? app.getCellElementByCoords(rowIndex, colIndex)
      : app.table.rows[rowIndex] && app.table.rows[rowIndex].cells[colIndex];
  };
  var getHeaderCell = function (colIndex) {
    return typeof app.getHeaderCell === 'function'
      ? app.getHeaderCell(colIndex)
      : app.table.rows[0].cells[colIndex];
  };
  var getRowHeaderCell = function (rowIndex) {
    return typeof app.getRowHeaderCell === 'function'
      ? app.getRowHeaderCell(rowIndex)
      : app.table.rows[rowIndex].cells[0];
  };
  var toRelativeRect = function (element) {
    if (!element || !element.getBoundingClientRect) return null;
    var rect = element.getBoundingClientRect();
    return {
      left: rect.left - wrapRect.left + app.tableWrap.scrollLeft,
      top: rect.top - wrapRect.top + app.tableWrap.scrollTop,
      width: rect.width,
      height: rect.height,
    };
  };
  var getDependencyCellIds = function () {
    if (!activeCellId) return [];
    var targetSheetId =
      typeof app.getVisibleSheetId === 'function'
        ? String(app.getVisibleSheetId() || '')
        : String(app.activeSheetId || '');
    if (!targetSheetId) return [];
    var deps =
      app.storage && typeof app.storage.getCellDependencies === 'function'
        ? app.storage.getCellDependencies(targetSheetId, activeCellId) || {}
        : {};
    var raw = String(app.getRawCellValue(activeCellId) || '');
    if (
      (!Array.isArray(deps.cells) || !deps.cells.length) &&
      (!Array.isArray(deps.namedRefs) || !deps.namedRefs.length) &&
      (!Array.isArray(deps.attachments) || !deps.attachments.length) &&
      raw &&
      typeof app.collectDependencyHintsFromRaw === 'function'
    ) {
      deps = app.collectDependencyHintsFromRaw(raw, targetSheetId);
    }
    var seen = {};
    var result = [];
    var addCell = function (sheetId, cellId) {
      var nextSheetId = String(sheetId || '');
      var nextCellId = String(cellId || '').toUpperCase();
      if (
        !nextSheetId ||
        !nextCellId ||
        nextSheetId !== targetSheetId ||
        seen[nextCellId]
      ) {
        return;
      }
      seen[nextCellId] = true;
      result.push(nextCellId);
    };
    (Array.isArray(deps.cells) ? deps.cells : []).forEach(function (entry) {
      if (!entry || typeof entry !== 'object') return;
      addCell(entry.sheetId, entry.cellId);
    });
    (Array.isArray(deps.attachments) ? deps.attachments : []).forEach(
      function (entry) {
        if (!entry || typeof entry !== 'object') return;
        addCell(entry.sheetId, entry.cellId);
      },
    );
    (Array.isArray(deps.namedRefs) ? deps.namedRefs : []).forEach(function (name) {
      var ref =
        app.storage && typeof app.storage.resolveNamedCell === 'function'
          ? app.storage.resolveNamedCell(name)
          : null;
      if (!ref || !ref.sheetId) return;
      if (ref.cellId) {
        addCell(ref.sheetId, ref.cellId);
        return;
      }
      if (!ref.startCellId || !ref.endCellId) return;
      var start = app.parseCellId(ref.startCellId);
      var end = app.parseCellId(ref.endCellId);
      if (!start || !end) return;
      for (
        var row = Math.min(start.row, end.row);
        row <= Math.max(start.row, end.row);
        row++
      ) {
        for (
          var col = Math.min(start.col, end.col);
          col <= Math.max(start.col, end.col);
          col++
        ) {
          addCell(ref.sheetId, app.columnIndexToLabel(col) + row);
        }
      }
    });
    return result;
  };
  var dependencyCellIds = getDependencyCellIds();
  var activeRect = null;
  var activeInput =
    activeCellId && typeof app.getCellInput === 'function'
      ? app.getCellInput(activeCellId)
      : activeCellId && app.inputById
        ? app.inputById[activeCellId]
        : null;
  if (activeInput) {
    activeRect = toRelativeRect(activeInput.parentElement);
  }
  var selectionRange = getSelectionRangeState(app);
  var selectionSheetId =
    typeof app.getVisibleSheetId === 'function'
      ? String(app.getVisibleSheetId() || '')
      : String(app.activeSheetId || '');
  var selectionStartCellId = '';
  var selectionEndCellId = '';
  if (
    selectionRange &&
    Number.isFinite(selectionRange.startRow) &&
    Number.isFinite(selectionRange.startCol) &&
    typeof app.columnIndexToLabel === 'function'
  ) {
    selectionStartCellId =
      String(app.columnIndexToLabel(selectionRange.startCol) || '') +
      String(selectionRange.startRow || '');
  }
  if (
    selectionRange &&
    Number.isFinite(selectionRange.endRow) &&
    Number.isFinite(selectionRange.endCol) &&
    typeof app.columnIndexToLabel === 'function'
  ) {
    selectionEndCellId =
      String(app.columnIndexToLabel(selectionRange.endCol) || '') +
      String(selectionRange.endRow || '');
  }
  var rangeRect = null;
  if (
    selectionRange &&
    Number.isFinite(selectionRange.startRow) &&
    Number.isFinite(selectionRange.endRow) &&
    Number.isFinite(selectionRange.startCol) &&
    Number.isFinite(selectionRange.endCol)
  ) {
    var startCell = getCellByCoords(
      selectionRange.startRow,
      selectionRange.startCol,
    );
    var endCell = getCellByCoords(selectionRange.endRow, selectionRange.endCol);
    if (startCell && endCell) {
      var startRect = startCell.getBoundingClientRect();
      var endRect = endCell.getBoundingClientRect();
      rangeRect = {
        left: startRect.left - wrapRect.left + app.tableWrap.scrollLeft,
        top: startRect.top - wrapRect.top + app.tableWrap.scrollTop,
        width: endRect.right - startRect.left,
        height: endRect.bottom - startRect.top,
      };
    }
  }
  var fillHandleRect = null;
  if (activeRect) {
    fillHandleRect = {
      left:
        Number(activeRect.left || 0) +
        Math.max(0, Number(activeRect.width || 0) - 8),
      top:
        Number(activeRect.top || 0) +
        Math.max(0, Number(activeRect.height || 0) - 8),
      width: 7,
      height: 7,
    };
  }
  var computeHeaderRects = function () {
    var bounds =
      typeof app.getGridBounds === 'function'
        ? app.getGridBounds()
        : !app.table || !app.table.rows || !app.table.rows.length
          ? { rows: 0, cols: 0 }
          : {
              rows: app.table.rows.length - 1,
              cols: app.table.rows[0].cells.length - 1,
            };
    if (bounds.rows < 1 && bounds.cols < 1) return null;
    var result = {
      activeCols: [],
      activeRows: [],
      selectedCols: [],
      selectedRows: [],
      selectedCorner: null,
      dependencyCols: [],
      dependencyRows: [],
    };
    var maxRow = bounds.rows;
    var maxCol = bounds.cols;
    dependencyCellIds.forEach(function (cellId) {
      var parsedDependency = app.parseCellId(cellId);
      if (!parsedDependency) return;
      if (parsedDependency.col >= 1 && parsedDependency.col <= maxCol) {
        var dependencyColRect = toRelativeRect(getHeaderCell(parsedDependency.col));
        if (dependencyColRect) result.dependencyCols.push(dependencyColRect);
      }
      if (parsedDependency.row >= 1 && parsedDependency.row <= maxRow) {
        var dependencyRowRect = toRelativeRect(
          getRowHeaderCell(parsedDependency.row),
        );
        if (dependencyRowRect) result.dependencyRows.push(dependencyRowRect);
      }
    });
    if (
      selectionRange &&
      Number.isFinite(selectionRange.startCol) &&
      Number.isFinite(selectionRange.endCol) &&
      Number.isFinite(selectionRange.startRow) &&
      Number.isFinite(selectionRange.endRow)
    ) {
      for (var col = selectionRange.startCol; col <= selectionRange.endCol; col++) {
        if (col >= 1 && col <= maxCol) result.activeCols.push(toRelativeRect(getHeaderCell(col)));
      }
      for (var row = selectionRange.startRow; row <= selectionRange.endRow; row++) {
        if (row >= 1 && row <= maxRow) result.activeRows.push(toRelativeRect(getRowHeaderCell(row)));
      }
      if (selectionRange.startCol === 1 && selectionRange.endCol === maxCol) {
        for (var selectedRow = selectionRange.startRow; selectedRow <= selectionRange.endRow; selectedRow++) {
          if (selectedRow >= 1 && selectedRow <= maxRow) {
            result.selectedRows.push(toRelativeRect(getRowHeaderCell(selectedRow)));
          }
        }
      }
      if (selectionRange.startRow === 1 && selectionRange.endRow === maxRow) {
        for (var selectedCol = selectionRange.startCol; selectedCol <= selectionRange.endCol; selectedCol++) {
          if (selectedCol >= 1 && selectedCol <= maxCol) {
            result.selectedCols.push(toRelativeRect(getHeaderCell(selectedCol)));
          }
        }
      }
      if (
        selectionRange.startCol === 1 &&
        selectionRange.endCol === maxCol &&
        selectionRange.startRow === 1 &&
        selectionRange.endRow === maxRow
      ) {
        result.selectedCorner = toRelativeRect(getCellByCoords(0, 0));
      }
      result.activeCols = result.activeCols.filter(Boolean);
      result.activeRows = result.activeRows.filter(Boolean);
      result.selectedCols = result.selectedCols.filter(Boolean);
      result.selectedRows = result.selectedRows.filter(Boolean);
      return result;
    }
    if (activeCellId) {
      var parsedActive = app.parseCellId(activeCellId);
      if (parsedActive) {
        if (parsedActive.col >= 1 && parsedActive.col <= maxCol) {
          var activeColRect = toRelativeRect(getHeaderCell(parsedActive.col));
          if (activeColRect) result.activeCols.push(activeColRect);
        }
        if (parsedActive.row >= 1 && parsedActive.row <= maxRow) {
          var activeRowRect = toRelativeRect(getRowHeaderCell(parsedActive.row));
          if (activeRowRect) result.activeRows.push(activeRowRect);
        }
      }
    }
    return result;
  };
  return {
    activeCellId: String(activeCellId || ''),
    selectionSheetId: selectionSheetId,
    selectionStartCellId: String(selectionStartCellId || ''),
    selectionEndCellId: String(selectionEndCellId || ''),
    activeRect: activeRect,
    rangeRect: rangeRect,
    fillHandleRect: fillHandleRect,
    headerRects: computeHeaderRects(),
    dependencyRects: dependencyCellIds
      .map(function (cellId) {
        var input =
          typeof app.getCellInput === 'function'
            ? app.getCellInput(cellId)
            : app.inputById[cellId];
        return input && input.parentElement
          ? toRelativeRect(input.parentElement)
          : null;
      })
      .filter(Boolean),
  };
}
