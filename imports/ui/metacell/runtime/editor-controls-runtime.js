import { AI_MODE } from './constants.js';

var BG_COLOR_RECENT_CACHE_KEY = 'UI_RECENT_BG_COLORS';
function getAIModeIconMarkup(mode) {
  var normalized = String(mode || AI_MODE.manual);
  if (normalized === AI_MODE.auto) {
    return (
      "<span class='toolbar-mode-icon'>" +
      "<svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'>" +
      "<path d='M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z'></path>" +
      "<path d='M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z'></path>" +
      "<path d='M5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z'></path>" +
      '</svg>' +
      '</span>' +
      "<span class='toolbar-mode-label'>Automatic</span>"
    );
  }
  return (
    "<span class='toolbar-mode-icon'>" +
    "<svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'>" +
    "<path d='M9 11V5a3 3 0 0 1 6 0v6'></path>" +
    "<path d='M6 11h12'></path>" +
    "<path d='M8 11v4a4 4 0 0 0 8 0v-4'></path>" +
    "<path d='M12 19v2'></path>" +
    '</svg>' +
    '</span>' +
    "<span class='toolbar-mode-label'>Manual</span>"
  );
}

function getDisplayModeIconMarkup(mode) {
  var normalized = String(mode || 'values');
  if (normalized === 'formulas') {
    return (
      "<span class='toolbar-mode-icon'>" +
      "<svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'>" +
      "<path d='M8 5h8'></path>" +
      "<path d='M8 19h8'></path>" +
      "<path d='M14 5 10 19'></path>" +
      '</svg>' +
      '</span>' +
      "<span class='toolbar-mode-label'>Formulas</span>"
    );
  }
  return (
    "<span class='toolbar-mode-icon'>" +
    "<svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'>" +
    "<path d='M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z'></path>" +
    "<circle cx='12' cy='12' r='2.5'></circle>" +
    '</svg>' +
    '</span>' +
    "<span class='toolbar-mode-label'>Values</span>"
  );
}

function isManualAIFormulaRaw(rawValue) {
  var raw = String(rawValue == null ? '' : rawValue).trim();
  if (!raw) return false;
  if (raw.charAt(0) === "'" || raw.charAt(0) === '>' || raw.charAt(0) === '#') {
    return true;
  }
  return /\b(?:askAI|listAI)\s*\(/.test(raw);
}

function hasPendingManualAIWork(app) {
  if (!app || app.isReportActive()) return false;
  if (
    typeof app.hasPendingLocalEdit === 'function' &&
    app.hasPendingLocalEdit()
  ) {
    return true;
  }
  var inputs = Array.isArray(app.inputs) ? app.inputs : [];
  for (var i = 0; i < inputs.length; i++) {
    var input = inputs[i];
    if (!input || !input.id) continue;
    var raw = app.getRawCellValue(input.id);
    if (!isManualAIFormulaRaw(raw)) continue;
    var state = String(
      app.storage.getCellState(app.activeSheetId, input.id) || '',
    );
    if (state !== 'resolved' && state !== 'error') return true;
    var displayValue = String(
      app.storage.getCellDisplayValue(app.activeSheetId, input.id) || '',
    );
    if (displayValue === '(manual: click Update)') return true;
  }
  return false;
}

function getFontFamilyPreviewCssValue(fontFamily) {
  switch (String(fontFamily || 'default')) {
    case 'sans':
      return '"Trebuchet MS", "Segoe UI", sans-serif';
    case 'serif':
      return 'Georgia, "Times New Roman", serif';
    case 'mono':
      return '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace';
    case 'display':
      return '"Avenir Next", "Gill Sans", "Trebuchet MS", sans-serif';
    case 'default':
    default:
      return 'inherit';
  }
}

function getFontFamilyLabel(fontFamily) {
  switch (String(fontFamily || 'default')) {
    case 'sans':
      return 'Trebuchet MS';
    case 'serif':
      return 'Georgia';
    case 'mono':
      return 'SF Mono';
    case 'display':
      return 'Avenir Next';
    case 'default':
    default:
      return 'System UI';
  }
}

function syncFontFamilyButtonPreview(app, fontFamily) {
  if (!app || !app.cellFontFamilyButton) return;
  var nextFontFamily = String(fontFamily || 'default');
  app.cellFontFamilyButton.textContent = getFontFamilyLabel(nextFontFamily);
  app.cellFontFamilyButton.style.fontFamily =
    getFontFamilyPreviewCssValue(nextFontFamily);
}

function closeCellFontFamilyPicker(app) {
  if (!app || !app.cellFontFamilyPopover || !app.cellFontFamilyButton) return;
  app.cellFontFamilyPopover.hidden = true;
  app.cellFontFamilyButton.setAttribute('aria-expanded', 'false');
}

function openCellFontFamilyPicker(app) {
  if (!app || !app.cellFontFamilyPopover || !app.cellFontFamilyButton) return;
  app.cellFontFamilyPopover.hidden = false;
  app.cellFontFamilyButton.setAttribute('aria-expanded', 'true');
}

function normalizeBgColorValue(value) {
  var raw = String(value == null ? '' : value)
    .trim()
    .toLowerCase();
  if (!raw) return '';
  if (/^#[0-9a-f]{6}$/.test(raw)) return raw;
  if (/^#[0-9a-f]{3}$/.test(raw)) {
    return (
      '#' +
      raw.charAt(1) +
      raw.charAt(1) +
      raw.charAt(2) +
      raw.charAt(2) +
      raw.charAt(3) +
      raw.charAt(3)
    );
  }
  return '';
}

function readRecentBgColors(app) {
  if (!app || !app.storage || typeof app.storage.getCacheValue !== 'function') {
    return [];
  }
  var raw = app.storage.getCacheValue(BG_COLOR_RECENT_CACHE_KEY);
  if (!raw) return [];
  try {
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    var results = [];
    for (var i = 0; i < parsed.length; i++) {
      var color = normalizeBgColorValue(parsed[i]);
      if (!color || results.indexOf(color) !== -1) continue;
      results.push(color);
      if (results.length >= 8) break;
    }
    return results;
  } catch (e) {
    return [];
  }
}

function writeRecentBgColors(app, colors) {
  if (!app || !app.storage || typeof app.storage.setCacheValue !== 'function')
    return;
  app.storage.setCacheValue(BG_COLOR_RECENT_CACHE_KEY, JSON.stringify(colors));
}

function rememberRecentBgColor(app, color) {
  var normalized = normalizeBgColorValue(color);
  if (!normalized) return;
  var next = [normalized].concat(
    readRecentBgColors(app).filter(function (item) {
      return item !== normalized;
    }),
  );
  writeRecentBgColors(app, next.slice(0, 8));
}

function renderRecentBgColors(app, selectedColor) {
  if (!app || !app.cellBgColorRecent) return;
  var recent = readRecentBgColors(app);
  var normalizedSelected = normalizeBgColorValue(selectedColor);
  if (!recent.length) {
    app.cellBgColorRecent.innerHTML =
      "<span class='cell-bg-color-empty'>No recent colors</span>";
    return;
  }
  app.cellBgColorRecent.innerHTML = recent
    .map(function (color) {
      var isSelected = color === normalizedSelected;
      return (
        "<button type='button' class='cell-bg-color-chip" +
        (isSelected ? ' is-selected' : '') +
        "' data-color='" +
        color +
        "' title='" +
        color +
        "' style='--chip-color: " +
        color +
        "'></button>"
      );
    })
    .join('');
}

function syncBgColorPickerState(app, color) {
  if (!app || !app.cellBgColorButton) return;
  var normalized = normalizeBgColorValue(color);
  var swatchColor = normalized || 'transparent';
  if (app.cellBgColorSwatch) {
    app.cellBgColorSwatch.style.setProperty('--swatch-color', swatchColor);
    app.cellBgColorSwatch.classList.toggle('is-empty', !normalized);
  }
  app.cellBgColorButton.classList.toggle('has-color', !!normalized);
  app.cellBgColorButton.setAttribute('data-color-value', normalized || 'none');
  if (app.cellBgColorCustomInput) {
    app.cellBgColorCustomInput.value = normalized || '#fff7cc';
  }
  if (app.cellBgColorPopover) {
    var chips = app.cellBgColorPopover.querySelectorAll('.cell-bg-color-chip');
    for (var i = 0; i < chips.length; i++) {
      var chip = chips[i];
      var chipColor = normalizeBgColorValue(chip.getAttribute('data-color'));
      chip.classList.toggle(
        'is-selected',
        chipColor ? chipColor === normalized : !normalized,
      );
    }
  }
  renderRecentBgColors(app, normalized);
}

function closeBgColorPicker(app) {
  if (!app || !app.cellBgColorPopover || !app.cellBgColorButton) return;
  app.cellBgColorPopover.hidden = true;
  app.cellBgColorButton.setAttribute('aria-expanded', 'false');
}

function openBgColorPicker(app) {
  if (!app || !app.cellBgColorPopover || !app.cellBgColorButton) return;
  app.cellBgColorPopover.hidden = false;
  app.cellBgColorButton.setAttribute('aria-expanded', 'true');
}

function applyBgColorSelection(app, color) {
  var normalized = normalizeBgColorValue(color);
  if (normalized) rememberRecentBgColor(app, normalized);
  syncBgColorPickerState(app, normalized);
  applyPresentationToSelection(
    app,
    {
      backgroundColor: normalized,
    },
    'cell-bg-color',
  );
}

function closeCellFormatPicker(app) {
  if (!app || !app.cellFormatPopover || !app.cellFormatButton) return;
  app.cellFormatPopover.hidden = true;
  app.cellFormatButton.setAttribute('aria-expanded', 'false');
}

function openCellFormatPicker(app) {
  if (!app || !app.cellFormatPopover || !app.cellFormatButton) return;
  app.cellFormatPopover.hidden = false;
  app.cellFormatButton.setAttribute('aria-expanded', 'true');
}

function closeCellBordersPicker(app) {
  if (!app || !app.cellBordersPopover || !app.cellBordersButton) return;
  app.cellBordersPopover.hidden = true;
  app.cellBordersButton.setAttribute('aria-expanded', 'false');
}

function openCellBordersPicker(app) {
  if (!app || !app.cellBordersPopover || !app.cellBordersButton) return;
  app.cellBordersPopover.hidden = false;
  app.cellBordersButton.setAttribute('aria-expanded', 'true');
}

function closeDisplayModePicker(app) {
  if (!app || !app.displayModePopover || !app.displayModeButton) return;
  app.displayModePopover.hidden = true;
  app.displayModeButton.setAttribute('aria-expanded', 'false');
}

function openDisplayModePicker(app) {
  if (!app || !app.displayModePopover || !app.displayModeButton) return;
  app.displayModePopover.hidden = false;
  app.displayModeButton.setAttribute('aria-expanded', 'true');
}

export function syncDisplayModeControl(app) {
  if (!app || !app.displayModeButton) return;
  var mode = app.displayMode === 'formulas' ? 'formulas' : 'values';
  app.displayModeButton.innerHTML = getDisplayModeIconMarkup(mode);
  app.displayModeButton.setAttribute('data-display-mode-current', mode);
  if (app.displayModeOptions && app.displayModeOptions.length) {
    app.displayModeOptions.forEach(function (option) {
      var optionValue = String(
        option.getAttribute('data-display-mode') || 'values',
      );
      option.classList.toggle('is-active', optionValue === mode);
    });
  }
}

function closeAIModePicker(app) {
  if (!app || !app.aiModePopover || !app.aiModeButton) return;
  app.aiModePopover.hidden = true;
  app.aiModeButton.setAttribute('aria-expanded', 'false');
}

function openAIModePicker(app) {
  if (!app || !app.aiModePopover || !app.aiModeButton) return;
  app.aiModePopover.hidden = false;
  app.aiModeButton.setAttribute('aria-expanded', 'true');
}

function closeNamedCellJumpPicker(app) {
  if (!app || !app.namedCellJumpPopover || !app.namedCellJump) return;
  app.namedCellJumpPopover.hidden = true;
  app.namedCellJump.setAttribute('aria-expanded', 'false');
}

function openNamedCellJumpPicker(app) {
  if (!app || !app.namedCellJumpPopover || !app.namedCellJump) return;
  if (app.namedCellJump.disabled) return;
  app.namedCellJumpPopover.hidden = false;
  app.namedCellJump.setAttribute('aria-expanded', 'true');
}

function ensureNamedCellJumpState(app) {
  if (!app) return null;
  if (!app.namedCellJumpState || typeof app.namedCellJumpState !== 'object') {
    app.namedCellJumpState = {
      filteredItems: [],
      activeIndex: -1,
    };
  }
  return app.namedCellJumpState;
}

function getNamedCellJumpItems(app) {
  if (!app || !app.storage) return [];
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
  return items;
}

function filterNamedCellJumpItems(items, query) {
  var normalized = String(query == null ? '' : query)
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
  if (!normalized) return items.slice();
  return items.filter(function (item) {
    return (
      String(item.name || '')
        .toLowerCase()
        .indexOf(normalized) !== -1
    );
  });
}

function renderNamedCellJumpOptions(app, items, hasQuery) {
  if (!app || !app.namedCellJumpPopover) return;
  var state = ensureNamedCellJumpState(app);
  if (state) {
    state.filteredItems = Array.isArray(items) ? items.slice() : [];
    if (!state.filteredItems.length) {
      state.activeIndex = -1;
    } else if (
      !Number.isInteger(state.activeIndex) ||
      state.activeIndex < 0 ||
      state.activeIndex >= state.filteredItems.length
    ) {
      state.activeIndex = 0;
    }
  }
  if (!items.length) {
    app.namedCellJumpPopover.innerHTML =
      "<span class='named-cell-jump-empty'>" +
      (hasQuery ? 'No matching names' : 'No named cells') +
      '</span>';
    return;
  }
  app.namedCellJumpPopover.innerHTML = items
    .map(function (item, index) {
      var location =
        item.cellId ||
        (item.startCellId && item.endCellId
          ? item.startCellId + ':' + item.endCellId
          : '');
      return (
        "<button type='button' class='named-cell-jump-option" +
        (state && state.activeIndex === index ? ' is-active' : '') +
        "' data-name='" +
        item.name +
        "' data-index='" +
        index +
        "'>" +
        "<span class='named-cell-jump-name'>" +
        item.name +
        '</span>' +
        "<span class='named-cell-jump-location'>" +
        item.sheetName +
        '!' +
        location +
        '</span>' +
        '</button>'
      );
    })
    .join('');
}

function syncNamedCellJumpActiveOption(app) {
  if (!app || !app.namedCellJumpPopover) return;
  var state = ensureNamedCellJumpState(app);
  var options = app.namedCellJumpPopover.querySelectorAll(
    '.named-cell-jump-option',
  );
  for (var i = 0; i < options.length; i++) {
    options[i].classList.toggle('is-active', i === state.activeIndex);
  }
  if (
    state.activeIndex >= 0 &&
    state.activeIndex < options.length &&
    typeof options[state.activeIndex].scrollIntoView === 'function'
  ) {
    options[state.activeIndex].scrollIntoView({ block: 'nearest' });
  }
}

function setNamedCellJumpActiveIndex(app, nextIndex) {
  var state = ensureNamedCellJumpState(app);
  var count = Array.isArray(state.filteredItems)
    ? state.filteredItems.length
    : 0;
  if (!count) {
    state.activeIndex = -1;
    syncNamedCellJumpActiveOption(app);
    return;
  }
  if (!Number.isInteger(nextIndex)) nextIndex = 0;
  if (nextIndex < 0) nextIndex = 0;
  if (nextIndex >= count) nextIndex = count - 1;
  state.activeIndex = nextIndex;
  syncNamedCellJumpActiveOption(app);
}

function navigateToNamedCellJumpSelection(app, index) {
  var state = ensureNamedCellJumpState(app);
  if (
    !state ||
    !Array.isArray(state.filteredItems) ||
    index < 0 ||
    index >= state.filteredItems.length
  ) {
    return false;
  }
  app.navigateToNamedCell(state.filteredItems[index].name);
  closeNamedCellJumpPicker(app);
  return true;
}

function syncNamedCellJumpSearch(
  app,
  shouldOpen,
  preserveActiveIndex,
  queryOverride,
) {
  if (!app || !app.namedCellJumpPopover) return [];
  var state = ensureNamedCellJumpState(app);
  var allItems = getNamedCellJumpItems(app);
  var query =
    queryOverride != null
      ? String(queryOverride)
      : app.cellNameInput
        ? String(app.cellNameInput.value || '')
        : '';
  var filteredItems = filterNamedCellJumpItems(allItems, query);
  if (state && Array.isArray(state.filteredItems) && !preserveActiveIndex) {
    state.activeIndex = filteredItems.length ? 0 : -1;
  }
  renderNamedCellJumpOptions(app, filteredItems, !!String(query).trim());
  app.namedCellJump.disabled = allItems.length === 0;
  if (!allItems.length) {
    closeNamedCellJumpPicker(app);
  } else if (shouldOpen) {
    openNamedCellJumpPicker(app);
  }
  return filteredItems;
}

function tryNavigateFromCellNameInput(app) {
  if (!app || !app.cellNameInput) return false;
  var rawQuery = String(app.cellNameInput.value || '').trim();
  if (!rawQuery) return false;
  var state = ensureNamedCellJumpState(app);
  if (
    state &&
    state.activeIndex >= 0 &&
    navigateToNamedCellJumpSelection(app, state.activeIndex)
  ) {
    return true;
  }
  var normalizedName = rawQuery.replace(/^@/, '');
  var items = getNamedCellJumpItems(app);
  for (var i = 0; i < items.length; i++) {
    if (
      String(items[i].name || '').toLowerCase() === normalizedName.toLowerCase()
    ) {
      app.navigateToNamedCell(items[i].name);
      closeNamedCellJumpPicker(app);
      return true;
    }
  }
  var exactCellId = rawQuery.toUpperCase();
  if (
    app.parseCellId(exactCellId) &&
    app.inputById &&
    app.inputById[exactCellId]
  ) {
    var targetInput = app.inputById[exactCellId];
    app.setActiveInput(targetInput);
    targetInput.focus();
    closeNamedCellJumpPicker(app);
    return true;
  }
  var filteredItems = filterNamedCellJumpItems(items, rawQuery);
  if (filteredItems.length === 1) {
    app.navigateToNamedCell(filteredItems[0].name);
    closeNamedCellJumpPicker(app);
    return true;
  }
  return false;
}

function syncAIModeControl(app) {
  if (!app || !app.aiModeButton) return;
  var mode = String(app.aiService.getMode() || AI_MODE.manual);
  app.aiModeButton.innerHTML = getAIModeIconMarkup(mode);
  app.aiModeButton.setAttribute('data-ai-mode-current', mode);
  if (app.aiModeOptions && app.aiModeOptions.length) {
    app.aiModeOptions.forEach(function (option) {
      var optionValue = String(option.getAttribute('data-ai-mode') || 'manual');
      option.classList.toggle('is-active', optionValue === mode);
    });
  }
}

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
    "<button type='button' class='report-cmd' data-cmd='bold' aria-label='Bold' title='Bold'><svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M8 6h5a3 3 0 0 1 0 6H8z'></path><path d='M8 12h6a3 3 0 0 1 0 6H8z'></path></svg></button>" +
    "<button type='button' class='report-cmd' data-cmd='italic' aria-label='Italic' title='Italic'><svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M14 6h-4'></path><path d='M14 18h-4'></path><path d='M14 6 10 18'></path></svg></button>" +
    "<button type='button' class='report-cmd' data-cmd='underline' aria-label='Underline' title='Underline'><svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M7 5v6a5 5 0 0 0 10 0V5'></path><path d='M5 19h14'></path></svg></button>" +
    "<button type='button' class='report-cmd' data-cmd='insertUnorderedList' aria-label='Bullet list' title='Bullet list'><svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M9 6h11'></path><path d='M9 12h11'></path><path d='M9 18h11'></path><circle cx='4' cy='6' r='1' fill='currentColor' stroke='none'></circle><circle cx='4' cy='12' r='1' fill='currentColor' stroke='none'></circle><circle cx='4' cy='18' r='1' fill='currentColor' stroke='none'></circle></svg></button>" +
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
  if (!app.aiModeButton) return;
  app.aiService.setMode(app.storage.getAIMode());
  syncAIModeControl(app);
  app.syncAIModeUI();
  app.aiModeButton.addEventListener('click', function (event) {
    event.preventDefault();
    if (app.aiModePopover && !app.aiModePopover.hidden) {
      closeAIModePicker(app);
    } else {
      openAIModePicker(app);
    }
  });
  if (app.aiModePopover) {
    app.aiModePopover.addEventListener('click', function (event) {
      var option =
        event.target && event.target.closest
          ? event.target.closest('.ai-mode-option')
          : null;
      if (!option) return;
      event.preventDefault();
      var mode = String(option.getAttribute('data-ai-mode') || AI_MODE.manual);
      app.captureHistorySnapshot('ai-mode');
      app.aiService.setMode(mode);
      syncAIModeControl(app);
      app.syncAIModeUI();
      app.computeAll();
      closeAIModePicker(app);
    });
    document.addEventListener('click', function (event) {
      if (app.aiModePopover.hidden) return;
      var target = event.target;
      if (app.aiModeButton === target) return;
      if (app.aiModeButton.contains && app.aiModeButton.contains(target)) {
        return;
      }
      if (app.aiModePopover.contains && app.aiModePopover.contains(target)) {
        return;
      }
      closeAIModePicker(app);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeAIModePicker(app);
    });
  }
}

export function syncAIModeUI(app) {
  var isManual = app.aiService.getMode() === AI_MODE.manual;
  var hasPendingWork = isManual && hasPendingManualAIWork(app);
  var isLoading = !!app.isManualAIUpdating;
  syncAIModeControl(app);
  app.updateAIButton.style.display = isManual ? 'inline-flex' : 'none';
  app.updateAIButton.disabled = !hasPendingWork || isLoading;
  app.updateAIButton.classList.toggle('is-loading', isLoading);
  app.updateAIButton.setAttribute('aria-busy', isLoading ? 'true' : 'false');
}

export function setupDisplayModeControls(app) {
  if (!app.displayModeButton) return;
  syncDisplayModeControl(app);
  app.displayModeButton.addEventListener('click', function (event) {
    event.preventDefault();
    if (app.displayModePopover && !app.displayModePopover.hidden) {
      closeDisplayModePicker(app);
    } else {
      openDisplayModePicker(app);
    }
  });
  if (app.displayModePopover) {
    app.displayModePopover.addEventListener('click', function (event) {
      var option =
        event.target && event.target.closest
          ? event.target.closest('.display-mode-option')
          : null;
      if (!option) return;
      event.preventDefault();
      app.setDisplayMode(
        String(option.getAttribute('data-display-mode') || 'values'),
      );
      syncDisplayModeControl(app);
      closeDisplayModePicker(app);
    });
    document.addEventListener('click', function (event) {
      if (app.displayModePopover.hidden) return;
      var target = event.target;
      if (app.displayModeButton === target) return;
      if (
        app.displayModeButton.contains &&
        app.displayModeButton.contains(target)
      ) {
        return;
      }
      if (
        app.displayModePopover.contains &&
        app.displayModePopover.contains(target)
      ) {
        return;
      }
      closeDisplayModePicker(app);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeDisplayModePicker(app);
    });
  }
}

export function setupCellFormatControls(app) {
  if (!app.cellFormatButton) return;
  app.syncCellFormatControl();
  app.cellFormatButton.addEventListener('click', function (event) {
    if (app.cellFormatButton.disabled) return;
    event.preventDefault();
    if (app.cellFormatPopover && !app.cellFormatPopover.hidden) {
      closeCellFormatPicker(app);
    } else {
      openCellFormatPicker(app);
    }
  });
  app.cellFormatOptions.forEach(function (option) {
    option.addEventListener('click', function () {
      if (!app.activeCellId || app.isReportActive()) return;
      app.captureHistorySnapshot('cell-format');
      var cellIds = getSelectedRegionCellIds(app);
      var value = String(option.getAttribute('data-format') || 'text');
      for (var i = 0; i < cellIds.length; i++) {
        app.setCellFormat(cellIds[i], value);
      }
      app.renderCurrentSheetFromStorage();
      closeCellFormatPicker(app);
    });
  });
  document.addEventListener('click', function (event) {
    if (!app.cellFormatPopover || app.cellFormatPopover.hidden) return;
    var target = event.target;
    if (
      target === app.cellFormatButton ||
      (app.cellFormatButton.contains && app.cellFormatButton.contains(target))
    ) {
      return;
    }
    if (
      app.cellFormatPopover.contains &&
      app.cellFormatPopover.contains(target)
    ) {
      return;
    }
    closeCellFormatPicker(app);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeCellFormatPicker(app);
  });
}

export function setupCellPresentationControls(app) {
  if (app.cellAlignButtons && app.cellAlignButtons.length) {
    app.syncCellPresentationControls();
    app.cellAlignButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        if (!app.activeCellId || app.isReportActive() || button.disabled) return;
        applyPresentationToSelection(
          app,
          {
            align: String(button.getAttribute('data-align') || 'left'),
          },
          'cell-align',
        );
      });
    });
  }
  if (app.cellBoldButton) {
    app.cellBoldButton.addEventListener('click', () => {
      if (!app.activeCellId || app.isReportActive()) return;
      var current = app.storage.getCellPresentation(
        app.activeSheetId,
        app.activeCellId,
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
      if (!app.activeCellId || app.isReportActive()) return;
      var current = app.storage.getCellPresentation(
        app.activeSheetId,
        app.activeCellId,
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
  if (app.cellBordersButton) {
    app.cellBordersButton.addEventListener('click', function (event) {
      if (app.cellBordersButton.disabled) return;
      event.preventDefault();
      if (app.cellBordersPopover && !app.cellBordersPopover.hidden) {
        closeCellBordersPicker(app);
      } else {
        openCellBordersPicker(app);
      }
    });
  }
  if (app.cellBordersPopover) {
    app.cellBordersPopover.addEventListener('click', function (event) {
      var option =
        event.target && event.target.closest
          ? event.target.closest('.cell-borders-option')
          : null;
      if (!option) return;
      event.preventDefault();
      applyBordersPresetToSelection(
        app,
        String(option.getAttribute('data-preset') || 'none'),
      );
      closeCellBordersPicker(app);
    });
    document.addEventListener('click', function (event) {
      if (app.cellBordersPopover.hidden) return;
      var target = event.target;
      if (app.cellBordersButton === target) return;
      if (
        app.cellBordersButton.contains &&
        app.cellBordersButton.contains(target)
      ) {
        return;
      }
      if (
        app.cellBordersPopover.contains &&
        app.cellBordersPopover.contains(target)
      ) {
        return;
      }
      closeCellBordersPicker(app);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeCellBordersPicker(app);
    });
  }
  if (app.cellBgColorButton) {
    app.cellBgColorButton.addEventListener('click', (event) => {
      if (app.cellBgColorButton.disabled) return;
      event.preventDefault();
      if (app.cellBgColorPopover && !app.cellBgColorPopover.hidden) {
        closeBgColorPicker(app);
      } else {
        openBgColorPicker(app);
      }
    });
  }
  if (app.cellBgColorPopover) {
    app.cellBgColorPopover.addEventListener('click', (event) => {
      var chip =
        event.target && event.target.closest
          ? event.target.closest('.cell-bg-color-chip')
          : null;
      if (!chip) return;
      event.preventDefault();
      applyBgColorSelection(app, chip.getAttribute('data-color'));
      closeBgColorPicker(app);
    });
    document.addEventListener('click', (event) => {
      if (app.cellBgColorPopover.hidden) return;
      var target = event.target;
      if (
        target === app.cellBgColorButton ||
        (app.cellBgColorButton &&
          app.cellBgColorButton.contains &&
          app.cellBgColorButton.contains(target))
      ) {
        return;
      }
      if (
        app.cellBgColorPopover.contains &&
        app.cellBgColorPopover.contains(target)
      ) {
        return;
      }
      closeBgColorPicker(app);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeBgColorPicker(app);
    });
  }
  if (app.cellBgColorCustomInput) {
    app.cellBgColorCustomInput.addEventListener('input', () => {
      syncBgColorPickerState(app, app.cellBgColorCustomInput.value);
    });
    app.cellBgColorCustomInput.addEventListener('change', () => {
      applyBgColorSelection(app, app.cellBgColorCustomInput.value);
      closeBgColorPicker(app);
    });
  }
  if (app.cellFontFamilyButton) {
    app.cellFontFamilyButton.addEventListener('click', function (event) {
      if (app.cellFontFamilyButton.disabled) return;
      event.preventDefault();
      if (app.cellFontFamilyPopover && !app.cellFontFamilyPopover.hidden) {
        closeCellFontFamilyPicker(app);
      } else {
        openCellFontFamilyPicker(app);
      }
    });
  }
  if (app.cellFontFamilyPopover) {
    app.cellFontFamilyPopover.addEventListener('click', function (event) {
      var option =
        event.target && event.target.closest
          ? event.target.closest('.cell-font-family-option')
          : null;
      if (!option) return;
      event.preventDefault();
      var fontFamily = String(
        option.getAttribute('data-font-family') || 'default',
      );
      syncFontFamilyButtonPreview(app, fontFamily);
      applyPresentationToSelection(
        app,
        {
          fontFamily: fontFamily,
        },
        'cell-font-family',
      );
      closeCellFontFamilyPicker(app);
    });
    document.addEventListener('click', function (event) {
      if (app.cellFontFamilyPopover.hidden) return;
      var target = event.target;
      if (app.cellFontFamilyButton === target) return;
      if (
        app.cellFontFamilyButton.contains &&
        app.cellFontFamilyButton.contains(target)
      ) {
        return;
      }
      if (
        app.cellFontFamilyPopover.contains &&
        app.cellFontFamilyPopover.contains(target)
      ) {
        return;
      }
      closeCellFontFamilyPicker(app);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeCellFontFamilyPicker(app);
    });
  }
  if (app.cellWrapButton) {
    app.cellWrapButton.addEventListener('click', () => {
      if (!app.activeCellId || app.isReportActive()) return;
      var current = app.storage.getCellPresentation(
        app.activeSheetId,
        app.activeCellId,
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
  if (!app.activeCellId || app.isReportActive()) return;
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
    return app.activeCellId ? [app.activeCellId] : [];
  }
  return cellIds;
}

export function commitFormulaBarValue(app, options) {
  var activeInput = app.getActiveCellInput ? app.getActiveCellInput() : null;
  if (!activeInput) return;
  if (
    app.crossTabMentionContext &&
    app.activeSheetId !== app.crossTabMentionContext.sourceSheetId
  )
    return;

  var raw = String(app.formulaInput ? app.formulaInput.value : '');
  app.commitFormulaBarEditing(activeInput, {
    rawValue: raw,
    origin: 'formula-bar',
    restoreFocus: !!(options && options.restoreFocus),
  });
}

export function bindFormulaBarEvents(app) {
  app.formulaInput.addEventListener('input', (e) => {
    var activeInput = app.getActiveCellInput ? app.getActiveCellInput() : null;
    if (!activeInput) return;
    var raw = e.target.value;
    if (!app.crossTabMentionContext) {
      app.enterFormulaBarEditing(activeInput, {
        draftRaw: raw,
        origin: 'formula-bar',
      });
      app.syncCellDraft(activeInput, raw, {
        origin: 'formula-bar',
        syncFormula: false,
      });
    }
    app.updateEditingSessionDraft(raw, { origin: 'formula-bar' });
    app.syncCrossTabMentionSourceValue(raw);
    app.syncAIDraftLock();
    app.syncAIModeUI();
    app.updateMentionAutocomplete(app.formulaInput);
  });

  app.formulaInput.addEventListener('keydown', (e) => {
    var activeInput = app.getActiveCellInput ? app.getActiveCellInput() : null;
    if (!activeInput) return;
    if (app.handleMentionAutocompleteKeydown(e, app.formulaInput)) return;
    if (e.key === 'Enter' && app.finishCrossTabMentionAndReturnToSource()) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      app.commitFormulaBarValue({ restoreFocus: true });
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      app.cancelCellEditing(activeInput);
      app.suppressFormulaBarBlurCommitOnce = true;
      app.restoreFocusAfterEditingExit();
    }
  });
  app.formulaInput.addEventListener('blur', () => {
    var suppressCommit = app.suppressFormulaBarBlurCommitOnce;
    app.suppressFormulaBarBlurCommitOnce = false;
    if (!suppressCommit) {
      app.commitFormulaBarValue({ restoreFocus: false });
    }
    app.syncAIDraftLock();
    app.syncAIModeUI();
    app.hideMentionAutocompleteSoon();
  });
}

export function setupCellNameControls(app) {
  app.cellNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      var filteredItems = syncNamedCellJumpSearch(app, true, true);
      if (filteredItems.length) {
        var state = ensureNamedCellJumpState(app);
        var delta = e.key === 'ArrowDown' ? 1 : -1;
        var nextIndex =
          state.activeIndex >= 0
            ? state.activeIndex + delta
            : delta > 0
              ? 0
              : filteredItems.length - 1;
        setNamedCellJumpActiveIndex(app, nextIndex);
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!tryNavigateFromCellNameInput(app)) {
        app.applyActiveCellName();
        closeNamedCellJumpPicker(app);
        app.focusActiveEditor();
      }
      return;
    }
    if (e.key === 'Escape') {
      closeNamedCellJumpPicker(app);
      app.focusActiveEditor();
      app.syncCellNameInput();
    }
  });
  app.cellNameInput.addEventListener('input', () => {
    if (app.isReportActive && app.isReportActive()) return;
    syncNamedCellJumpSearch(app, true);
  });
  app.cellNameInput.addEventListener('focus', () => {
    syncNamedCellJumpSearch(app, false);
  });
  if (app.namedCellJump) {
    app.namedCellJump.addEventListener('click', (event) => {
      if (app.namedCellJump.disabled) return;
      event.preventDefault();
      if (app.namedCellJumpPopover && !app.namedCellJumpPopover.hidden) {
        closeNamedCellJumpPicker(app);
      } else {
        syncNamedCellJumpSearch(app, false, false, '');
        openNamedCellJumpPicker(app);
      }
    });
    if (app.namedCellJumpPopover) {
      app.namedCellJumpPopover.addEventListener('click', (event) => {
        var option =
          event.target && event.target.closest
            ? event.target.closest('.named-cell-jump-option')
            : null;
        if (!option) return;
        event.preventDefault();
        var optionIndex = parseInt(option.getAttribute('data-index'), 10);
        if (isNaN(optionIndex)) {
          var selected = String(option.getAttribute('data-name') || '');
          if (!selected) return;
          app.navigateToNamedCell(selected);
          closeNamedCellJumpPicker(app);
          return;
        }
        setNamedCellJumpActiveIndex(app, optionIndex);
        navigateToNamedCellJumpSelection(app, optionIndex);
      });
      app.namedCellJumpPopover.addEventListener('mousemove', (event) => {
        var option =
          event.target && event.target.closest
            ? event.target.closest('.named-cell-jump-option')
            : null;
        if (!option) return;
        var optionIndex = parseInt(option.getAttribute('data-index'), 10);
        if (isNaN(optionIndex)) return;
        setNamedCellJumpActiveIndex(app, optionIndex);
      });
      document.addEventListener('click', (event) => {
        if (app.namedCellJumpPopover.hidden) return;
        var target = event.target;
        if (app.namedCellJump === target) return;
        if (app.namedCellJump.contains && app.namedCellJump.contains(target)) {
          return;
        }
        if (
          app.namedCellJumpPopover.contains &&
          app.namedCellJumpPopover.contains(target)
        ) {
          return;
        }
        closeNamedCellJumpPicker(app);
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeNamedCellJumpPicker(app);
      });
    }
    app.namedCellJump.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (app.namedCellJumpPopover && !app.namedCellJumpPopover.hidden) {
          closeNamedCellJumpPicker(app);
        } else {
          syncNamedCellJumpSearch(app, false, false, '');
          openNamedCellJumpPicker(app);
        }
      }
    });
    app.refreshNamedCellJumpOptions();
  }
}

export function syncCellNameInput(app) {
  var activeCellId = String(app.activeCellId || '');
  if (!activeCellId) {
    app.cellNameInput.value = '';
    return;
  }
  if (typeof app.isEditorElementFocused === 'function' && app.isEditorElementFocused(app.cellNameInput)) return;
  app.cellNameInput.value =
    app.storage.getCellNameFor(app.activeSheetId, activeCellId) ||
    activeCellId;
  syncNamedCellJumpSearch(app, false);
}

export function syncCellFormatControl(app) {
  if (!app.cellFormatButton) return;
  var activeCellId = String(app.activeCellId || '');
  if (!activeCellId || app.isReportActive()) {
    app.cellFormatButton.disabled = true;
    closeCellFormatPicker(app);
    return;
  }
  app.cellFormatButton.disabled = false;
  var currentFormat = String(app.getCellFormat(activeCellId) || 'text');
  app.cellFormatOptions.forEach(function (option) {
    option.classList.toggle(
      'is-active',
      String(option.getAttribute('data-format') || '') === currentFormat,
    );
  });
}

export function syncCellPresentationControls(app) {
  if (app && typeof app.syncRegionRecordingControls === 'function') {
    app.syncRegionRecordingControls();
  }
  var activeCellId = String(app.activeCellId || '');
  var disabled = !activeCellId || app.isReportActive();
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
    : app.getCellPresentation(activeCellId);

  if (app.cellAlignButtons && app.cellAlignButtons.length) {
    app.cellAlignButtons.forEach(function (button) {
      var alignValue = String(button.getAttribute('data-align') || 'left');
      button.disabled = disabled;
      button.classList.toggle(
        'is-active',
        !disabled && alignValue === String(presentation.align || 'left'),
      );
    });
  }
  if (app.cellBoldButton) {
    app.cellBoldButton.disabled = disabled;
    app.cellBoldButton.classList.toggle('is-active', !!presentation.bold);
  }
  if (app.cellItalicButton) {
    app.cellItalicButton.disabled = disabled;
    app.cellItalicButton.classList.toggle('is-active', !!presentation.italic);
  }
  if (app.cellBordersButton) {
    var bordersPreset = disabled
      ? 'none'
      : getBordersPresetValue(app, presentation.borders);
    app.cellBordersButton.disabled = disabled;
    app.cellBordersButton.setAttribute('data-border-preset', bordersPreset);
    if (disabled) closeCellBordersPicker(app);
    if (app.cellBordersOptions && app.cellBordersOptions.length) {
      app.cellBordersOptions.forEach(function (option) {
        var preset = String(option.getAttribute('data-preset') || 'none');
        option.classList.toggle(
          'is-active',
          !disabled && preset === bordersPreset,
        );
      });
    }
  }
  if (app.cellBgColorButton) {
    app.cellBgColorButton.disabled = disabled;
    syncBgColorPickerState(
      app,
      disabled ? '' : String(presentation.backgroundColor || ''),
    );
    if (disabled) closeBgColorPicker(app);
  }
  if (app.cellFontFamilyButton) {
    var fontFamily = disabled
      ? 'default'
      : String(presentation.fontFamily || 'default');
    app.cellFontFamilyButton.disabled = disabled;
    syncFontFamilyButtonPreview(app, fontFamily);
    if (disabled) closeCellFontFamilyPicker(app);
    if (app.cellFontFamilyOptions && app.cellFontFamilyOptions.length) {
      app.cellFontFamilyOptions.forEach(function (option) {
        var optionValue = String(
          option.getAttribute('data-font-family') || 'default',
        );
        option.classList.toggle(
          'is-active',
          !disabled && optionValue === fontFamily,
        );
      });
    }
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
  var activeCellId = String(app.activeCellId || '');
  if (!activeCellId) return null;
  var parsed = app.parseCellId(activeCellId);
  if (!parsed) return null;
  return {
    startCol: parsed.col,
    endCol: parsed.col,
    startRow: parsed.row,
    endRow: parsed.row,
  };
}

function applyBordersPresetToSelection(app, preset) {
  if (!app.activeCellId || app.isReportActive()) return;
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
  var activeCellId = String(app.activeCellId || '');
  if (!activeCellId || app.isReportActive()) return;
  var current = app.getCellPresentation(activeCellId);
  var next = Number.isInteger(current.decimalPlaces)
    ? current.decimalPlaces
    : getDefaultDecimalPlaces(app.getCellFormat(activeCellId));
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
  var activeCellId = String(app.activeCellId || '');
  if (!activeCellId || app.isReportActive()) return;
  var current = app.getCellPresentation(activeCellId);
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
  if (!app.activeCellId) {
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
    app.activeCellId,
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
  syncNamedCellJumpSearch(
    app,
    !app.namedCellJumpPopover.hidden &&
      typeof app.isEditorElementFocused === 'function' &&
      app.isEditorElementFocused(app.cellNameInput),
  );
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
