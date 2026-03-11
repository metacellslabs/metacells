import { AI_MODE } from './constants.js';

export function ensureReportUI(app) {
  if (app.reportWrap && app.reportEditor && app.reportLive) return;
  if (!app.tableWrap || !app.tableWrap.parentElement) return;

  var wrap = document.createElement('div');
  wrap.className = 'report-wrap';
  wrap.style.display = 'none';
  wrap.innerHTML =
    '' +
    "<div class='report-toolbar'>" +
    "<button type='button' class='report-mode active' data-report-mode='edit'>Edit</button>" +
    "<button type='button' class='report-mode' data-report-mode='view'>View</button>" +
    "<button type='button' class='report-cmd' data-cmd='bold'><b>B</b></button>" +
    "<button type='button' class='report-cmd' data-cmd='italic'><i>I</i></button>" +
    "<button type='button' class='report-cmd' data-cmd='underline'><u>U</u></button>" +
    "<button type='button' class='report-cmd' data-cmd='insertUnorderedList'>&bull; List</button>" +
    "<span class='report-hint'>Mentions: <code>Sheet 1:A1</code>, <code>@named_cell</code>, region <code>@Sheet 1!A1:B10</code>. Inputs: <code>Input:Sheet 1!A1</code> or <code>Input:@named_cell</code></span>" +
    '</div>' +
    "<div id='report-editor' class='report-editor' contenteditable='true'></div>" +
    "<div id='report-live' class='report-live'></div>";

  app.tableWrap.parentElement.insertBefore(wrap, app.tableWrap.nextSibling);
  app.reportWrap = wrap;
  app.reportEditor = wrap.querySelector('#report-editor');
  app.reportLive = wrap.querySelector('#report-live');
}

export function setupAIModeControls(app) {
  app.aiModeSelect.value = app.storage.getAIMode();
  app.syncAIModeUI();

  app.aiModeSelect.addEventListener('change', () => {
    app.captureHistorySnapshot('ai-mode');
    app.aiService.setMode(app.aiModeSelect.value);
    app.syncAIModeUI();
    app.computeAll();
  });

  app.updateAIButton.addEventListener('click', () => {
    if (app.aiService.getMode() !== AI_MODE.manual) return;
    app.aiService.withManualTrigger(() => app.computeAll());
  });
}

export function syncAIModeUI(app) {
  var isManual = app.aiService.getMode() === AI_MODE.manual;
  app.updateAIButton.style.display = isManual ? 'inline-block' : 'none';
}

export function setupDisplayModeControls(app) {
  if (!app.displayModeSelect) return;
  app.displayModeSelect.value = app.displayMode;
  app.displayModeSelect.addEventListener('change', () => {
    app.setDisplayMode(app.displayModeSelect.value);
  });
}

export function setupCellFormatControls(app) {
  if (!app.cellFormatSelect) return;
  app.syncCellFormatControl();
  app.cellFormatSelect.addEventListener('change', () => {
    if (!app.activeInput || app.isReportActive()) return;
    app.captureHistorySnapshot('cell-format');
    var cellIds = getSelectedRegionCellIds(app);
    for (var i = 0; i < cellIds.length; i++) {
      app.setCellFormat(cellIds[i], app.cellFormatSelect.value);
    }
    app.renderCurrentSheetFromStorage();
  });
}

export function setupCellPresentationControls(app) {
  if (app.cellAlignSelect) {
    app.syncCellPresentationControls();
    app.cellAlignSelect.addEventListener('change', () => {
      applyPresentationToSelection(
        app,
        {
          align: app.cellAlignSelect.value,
        },
        'cell-align',
      );
    });
  }
  if (app.cellBoldButton) {
    app.cellBoldButton.addEventListener('click', () => {
      if (!app.activeInput || app.isReportActive()) return;
      var current = app.storage.getCellPresentation(
        app.activeSheetId,
        app.activeInput.id,
      );
      applyPresentationToSelection(
        app,
        {
          bold: !current.bold,
        },
        'cell-bold',
      );
    });
  }
  if (app.cellItalicButton) {
    app.cellItalicButton.addEventListener('click', () => {
      if (!app.activeInput || app.isReportActive()) return;
      var current = app.storage.getCellPresentation(
        app.activeSheetId,
        app.activeInput.id,
      );
      applyPresentationToSelection(
        app,
        {
          italic: !current.italic,
        },
        'cell-italic',
      );
    });
  }
  if (app.cellBordersSelect) {
    app.cellBordersSelect.addEventListener('change', () => {
      applyBordersPresetToSelection(app, app.cellBordersSelect.value);
    });
  }
  if (app.cellBgColorSelect) {
    app.cellBgColorSelect.addEventListener('change', () => {
      applyPresentationToSelection(
        app,
        {
          backgroundColor: String(app.cellBgColorSelect.value || ''),
        },
        'cell-bg-color',
      );
    });
  }
  if (app.cellFontFamilySelect) {
    app.cellFontFamilySelect.addEventListener('change', () => {
      applyPresentationToSelection(
        app,
        {
          fontFamily: String(app.cellFontFamilySelect.value || 'default'),
        },
        'cell-font-family',
      );
    });
  }
  if (app.cellWrapButton) {
    app.cellWrapButton.addEventListener('click', () => {
      if (!app.activeInput || app.isReportActive()) return;
      var current = app.storage.getCellPresentation(
        app.activeSheetId,
        app.activeInput.id,
      );
      applyPresentationToSelection(
        app,
        {
          wrapText: !current.wrapText,
        },
        'cell-wrap',
      );
    });
  }
  if (app.cellDecimalsDecreaseButton) {
    app.cellDecimalsDecreaseButton.addEventListener('click', () => {
      adjustDecimalPlaces(app, -1);
    });
  }
  if (app.cellDecimalsIncreaseButton) {
    app.cellDecimalsIncreaseButton.addEventListener('click', () => {
      adjustDecimalPlaces(app, 1);
    });
  }
  if (app.cellFontSizeDecreaseButton) {
    app.cellFontSizeDecreaseButton.addEventListener('click', () => {
      adjustFontSize(app, -1);
    });
  }
  if (app.cellFontSizeIncreaseButton) {
    app.cellFontSizeIncreaseButton.addEventListener('click', () => {
      adjustFontSize(app, 1);
    });
  }
}

export function applyPresentationToSelection(app, updates, historyKey) {
  if (!app.activeInput || app.isReportActive()) return;
  app.captureHistorySnapshot(historyKey);
  var cellIds = getSelectedRegionCellIds(app);
  for (var i = 0; i < cellIds.length; i++) {
    app.setCellPresentation(cellIds[i], updates);
  }
  app.renderCurrentSheetFromStorage();
  app.syncCellPresentationControls();
}

function getSelectedRegionCellIds(app) {
  var cellIds =
    typeof app.getSelectedCellIds === 'function'
      ? app.getSelectedCellIds()
      : [];
  if (!Array.isArray(cellIds) || !cellIds.length) {
    return app.activeInput ? [app.activeInput.id] : [];
  }
  return cellIds;
}

export function commitFormulaBarValue(app) {
  if (!app.activeInput) return;
  if (
    app.crossTabMentionContext &&
    app.activeSheetId !== app.crossTabMentionContext.sourceSheetId
  )
    return;

  var raw = String(app.formulaInput ? app.formulaInput.value : '');
  var existingRaw = String(app.getRawCellValue(app.activeInput.id) || '');
  var existingAttachment = app.parseAttachmentSource(existingRaw);
  if (existingAttachment && raw === String(existingAttachment.name || '')) {
    return;
  }
  if (app.aiService && typeof app.aiService.setEditDraftLock === 'function') {
    app.aiService.setEditDraftLock(false);
  }
  app.syncServerEditLock(false);
  if (app.runTablePromptForCell(app.activeInput.id, raw, app.activeInput))
    return;
  if (app.runQuotedPromptForCell(app.activeInput.id, raw, app.activeInput))
    return;

  app.activeInput.value = raw;
  app.commitRawCellEdit(
    app.activeInput.id,
    raw,
    app.beginCellUpdateTrace(app.activeInput.id, raw),
  );
}

export function bindFormulaBarEvents(app) {
  app.formulaInput.addEventListener('input', (e) => {
    if (!app.activeInput) return;
    var raw = e.target.value;
    app.syncCrossTabMentionSourceValue(raw);
    app.syncAIDraftLock();
    app.updateMentionAutocomplete(app.formulaInput);
  });

  app.formulaInput.addEventListener('keydown', (e) => {
    if (!app.activeInput) return;
    if (app.handleMentionAutocompleteKeydown(e, app.formulaInput)) return;
    if (e.key === 'Enter' && app.finishCrossTabMentionAndReturnToSource()) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      app.commitFormulaBarValue();
      app.activeInput.focus();
    }
  });
  app.formulaInput.addEventListener('blur', () => {
    app.commitFormulaBarValue();
    app.syncAIDraftLock();
    app.hideMentionAutocompleteSoon();
  });
}

export function setupCellNameControls(app) {
  app.cellNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      app.applyActiveCellName();
    }
  });
  if (app.namedCellJump) {
    app.namedCellJump.addEventListener('change', () => {
      var selected = app.namedCellJump.value;
      if (!selected) return;
      app.navigateToNamedCell(selected);
      app.namedCellJump.value = '';
    });
    app.refreshNamedCellJumpOptions();
  }
}

export function syncCellNameInput(app) {
  if (!app.activeInput) {
    app.cellNameInput.value = '';
    return;
  }
  app.cellNameInput.value =
    app.storage.getCellNameFor(app.activeSheetId, app.activeInput.id) || '';
}

export function syncCellFormatControl(app) {
  if (!app.cellFormatSelect) return;
  if (!app.activeInput || app.isReportActive()) {
    app.cellFormatSelect.value = 'text';
    app.cellFormatSelect.disabled = true;
    return;
  }
  app.cellFormatSelect.disabled = false;
  app.cellFormatSelect.value = app.getCellFormat(app.activeInput.id);
}

export function syncCellPresentationControls(app) {
  var disabled = !app.activeInput || app.isReportActive();
  var presentation = disabled
    ? {
        align: 'left',
        wrapText: false,
        bold: false,
        italic: false,
        decimalPlaces: null,
        backgroundColor: '',
        fontFamily: 'default',
        fontSize: 14,
        borders: { top: false, right: false, bottom: false, left: false },
      }
    : app.getCellPresentation(app.activeInput.id);

  if (app.cellAlignSelect) {
    app.cellAlignSelect.disabled = disabled;
    app.cellAlignSelect.value = presentation.align || 'left';
  }
  if (app.cellBoldButton) {
    app.cellBoldButton.disabled = disabled;
    app.cellBoldButton.classList.toggle('is-active', !!presentation.bold);
  }
  if (app.cellItalicButton) {
    app.cellItalicButton.disabled = disabled;
    app.cellItalicButton.classList.toggle('is-active', !!presentation.italic);
  }
  if (app.cellBordersSelect) {
    app.cellBordersSelect.disabled = disabled;
    app.cellBordersSelect.value = disabled
      ? 'none'
      : getBordersPresetValue(app, presentation.borders);
  }
  if (app.cellBgColorSelect) {
    app.cellBgColorSelect.disabled = disabled;
    app.cellBgColorSelect.value = disabled
      ? ''
      : String(presentation.backgroundColor || '');
  }
  if (app.cellFontFamilySelect) {
    app.cellFontFamilySelect.disabled = disabled;
    app.cellFontFamilySelect.value = disabled
      ? 'default'
      : String(presentation.fontFamily || 'default');
  }
  if (app.cellWrapButton) {
    app.cellWrapButton.disabled = disabled;
    app.cellWrapButton.classList.toggle('is-active', !!presentation.wrapText);
  }
  if (app.cellDecimalsDecreaseButton)
    app.cellDecimalsDecreaseButton.disabled = disabled;
  if (app.cellDecimalsIncreaseButton)
    app.cellDecimalsIncreaseButton.disabled = disabled;
  if (app.cellFontSizeDecreaseButton)
    app.cellFontSizeDecreaseButton.disabled = disabled;
  if (app.cellFontSizeIncreaseButton)
    app.cellFontSizeIncreaseButton.disabled = disabled;
}

function getSelectedRegionBounds(app) {
  if (
    app.selectionRange &&
    (app.selectionRange.startCol !== app.selectionRange.endCol ||
      app.selectionRange.startRow !== app.selectionRange.endRow)
  ) {
    return {
      startCol: app.selectionRange.startCol,
      endCol: app.selectionRange.endCol,
      startRow: app.selectionRange.startRow,
      endRow: app.selectionRange.endRow,
    };
  }
  if (!app.activeInput) return null;
  var parsed = app.parseCellId(app.activeInput.id);
  if (!parsed) return null;
  return {
    startCol: parsed.col,
    endCol: parsed.col,
    startRow: parsed.row,
    endRow: parsed.row,
  };
}

function applyBordersPresetToSelection(app, preset) {
  if (!app.activeInput || app.isReportActive()) return;
  var bounds = getSelectedRegionBounds(app);
  if (!bounds) return;
  app.captureHistorySnapshot('cell-borders');
  for (var row = bounds.startRow; row <= bounds.endRow; row++) {
    for (var col = bounds.startCol; col <= bounds.endCol; col++) {
      var cellId = app.formatCellId(col, row);
      app.setCellPresentation(cellId, {
        borders: buildBordersForPreset(preset, col, row, bounds),
      });
    }
  }
  app.renderCurrentSheetFromStorage();
  app.syncCellPresentationControls();
}

function buildBordersForPreset(preset, col, row, bounds) {
  switch (String(preset || 'none')) {
    case 'all':
      return { top: true, right: true, bottom: true, left: true };
    case 'outer':
      return {
        top: row === bounds.startRow,
        right: col === bounds.endCol,
        bottom: row === bounds.endRow,
        left: col === bounds.startCol,
      };
    case 'inner':
      return {
        top: row > bounds.startRow,
        right: col < bounds.endCol,
        bottom: row < bounds.endRow,
        left: col > bounds.startCol,
      };
    case 'top':
      return { top: true, right: false, bottom: false, left: false };
    case 'bottom':
      return { top: false, right: false, bottom: true, left: false };
    case 'left':
      return { top: false, right: false, bottom: false, left: true };
    case 'right':
      return { top: false, right: true, bottom: false, left: false };
    case 'none':
    case 'mixed':
    default:
      return { top: false, right: false, bottom: false, left: false };
  }
}

function getBordersPresetValue(app, borders) {
  var selected = getSelectedRegionCellIds(app);
  if (!selected.length) return 'none';
  var first = normalizeBorders(borders);
  for (var i = 1; i < selected.length; i++) {
    var presentation = app.getCellPresentation(selected[i]);
    var next = normalizeBorders(presentation && presentation.borders);
    if (
      first.top !== next.top ||
      first.right !== next.right ||
      first.bottom !== next.bottom ||
      first.left !== next.left
    ) {
      return 'mixed';
    }
  }
  if (first.top && first.right && first.bottom && first.left) return 'all';
  if (first.top && !first.right && !first.bottom && !first.left) return 'top';
  if (!first.top && first.right && !first.bottom && !first.left) return 'right';
  if (!first.top && !first.right && first.bottom && !first.left)
    return 'bottom';
  if (!first.top && !first.right && !first.bottom && first.left) return 'left';
  if (!first.top && !first.right && !first.bottom && !first.left) return 'none';
  return 'mixed';
}

function normalizeBorders(borders) {
  var next = borders && typeof borders === 'object' ? borders : {};
  return {
    top: next.top === true,
    right: next.right === true,
    bottom: next.bottom === true,
    left: next.left === true,
  };
}

function adjustDecimalPlaces(app, delta) {
  if (!app.activeInput || app.isReportActive()) return;
  var current = app.getCellPresentation(app.activeInput.id);
  var next = Number.isInteger(current.decimalPlaces)
    ? current.decimalPlaces
    : getDefaultDecimalPlaces(app.getCellFormat(app.activeInput.id));
  next = Math.max(0, Math.min(6, next + delta));
  applyPresentationToSelection(
    app,
    {
      decimalPlaces: next,
    },
    'cell-decimals',
  );
}

function getDefaultDecimalPlaces(format) {
  switch (String(format || 'text')) {
    case 'number_2':
    case 'percent_2':
      return 2;
    case 'number_0':
      return 0;
    case 'percent':
      return 0;
    case 'currency_usd':
    case 'currency_eur':
    case 'currency_gbp':
      return 2;
    default:
      return 0;
  }
}

function adjustFontSize(app, delta) {
  if (!app.activeInput || app.isReportActive()) return;
  var current = app.getCellPresentation(app.activeInput.id);
  var next = Math.max(10, Math.min(28, Number(current.fontSize || 14) + delta));
  applyPresentationToSelection(
    app,
    {
      fontSize: next,
    },
    'cell-font-size',
  );
}

export function applyActiveCellName(app) {
  if (!app.activeInput) {
    alert('Select a cell first.');
    return;
  }

  var rangeRef = null;
  if (
    app.selectionRange &&
    (app.selectionRange.startCol !== app.selectionRange.endCol ||
      app.selectionRange.startRow !== app.selectionRange.endRow)
  ) {
    rangeRef = {
      startCellId: app.formatCellId(
        app.selectionRange.startCol,
        app.selectionRange.startRow,
      ),
      endCellId: app.formatCellId(
        app.selectionRange.endCol,
        app.selectionRange.endRow,
      ),
    };
  }
  app.captureHistorySnapshot('named-cell:' + app.activeSheetId);
  var result = app.storage.setCellName(
    app.activeSheetId,
    app.activeInput.id,
    app.cellNameInput.value,
    rangeRef,
  );
  if (!result.ok) {
    alert(result.error);
  }
  app.syncCellNameInput();
  app.refreshNamedCellJumpOptions();
  app.computeAll();
}

export function refreshNamedCellJumpOptions(app) {
  if (!app.namedCellJump) return;
  var select = app.namedCellJump;
  var namedCells = app.storage.readNamedCells();
  var items = [];

  for (var key in namedCells) {
    if (!Object.prototype.hasOwnProperty.call(namedCells, key)) continue;
    var ref = namedCells[key];
    if (!ref || !ref.sheetId) continue;
    if (!ref.cellId && !(ref.startCellId && ref.endCellId)) continue;
    var tab = app.findTabById(ref.sheetId);
    if (!tab || app.isReportTab(ref.sheetId)) continue;
    items.push({
      name: key,
      sheetId: ref.sheetId,
      cellId: ref.cellId ? String(ref.cellId).toUpperCase() : '',
      startCellId: ref.startCellId ? String(ref.startCellId).toUpperCase() : '',
      endCellId: ref.endCellId ? String(ref.endCellId).toUpperCase() : '',
      sheetName: tab.name,
    });
  }

  items.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  );

  select.innerHTML = '';
  var placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '';
  select.appendChild(placeholder);

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var option = document.createElement('option');
    option.value = item.name;
    var location =
      item.cellId ||
      (item.startCellId && item.endCellId
        ? item.startCellId + ':' + item.endCellId
        : '');
    option.textContent =
      item.name + ' (' + item.sheetName + '!' + location + ')';
    select.appendChild(option);
  }
  select.value = '';
  select.disabled = items.length === 0;
}

export function navigateToNamedCell(app, name) {
  var ref = app.storage.resolveNamedCell(name);
  if (!ref || !ref.sheetId) return;
  if (app.isReportTab(ref.sheetId)) return;

  var targetCellId = ref.cellId
    ? String(ref.cellId).toUpperCase()
    : ref.startCellId
      ? String(ref.startCellId).toUpperCase()
      : '';
  if (!targetCellId) return;
  if (app.activeSheetId !== ref.sheetId) {
    app.switchToSheet(ref.sheetId);
  }
  var targetInput = app.inputById[targetCellId];
  if (!targetInput) return;
  app.setActiveInput(targetInput);
  targetInput.focus();
}
