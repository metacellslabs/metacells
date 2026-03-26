import { setToolbarPickerOpenState } from './toolbar-popover-runtime.js';
import {
  adjustDecimalPlaces,
  adjustFontSize,
  applyBordersPresetToSelection,
  applyPresentationToSelection,
} from './toolbar-actions-runtime.js';
import {
  getActiveSourceCellId,
  getSelectedSourceCellIds,
} from './selection-source-runtime.js';

function getVisibleSheetId(app) {
  return typeof app.getVisibleSheetId === 'function'
    ? String(app.getVisibleSheetId() || '')
    : String(app.activeSheetId || '');
}

function getSelectedRegionCellIds(app) {
  return getSelectedSourceCellIds(app);
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
  if (app.useReactShellControls) return;
  app.cellFontFamilyButton.textContent = getFontFamilyLabel(nextFontFamily);
  app.cellFontFamilyButton.style.fontFamily =
    getFontFamilyPreviewCssValue(nextFontFamily);
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
  var raw = app.storage.getCacheValue('UI_RECENT_BG_COLORS');
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
  app.storage.setCacheValue('UI_RECENT_BG_COLORS', JSON.stringify(colors));
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
  if (app.useReactShellControls) {
    if (app && typeof app.publishUiState === 'function') app.publishUiState();
    return;
  }
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
  if (app.useReactShellControls) {
    renderRecentBgColors(app, normalized);
    return;
  }
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

function closeCellFontFamilyPicker(app) {
  if (!app || !app.cellFontFamilyPopover || !app.cellFontFamilyButton) return;
  setToolbarPickerOpenState(app, 'fontFamily', false);
  if (!app.useReactShellControls) {
    app.cellFontFamilyPopover.hidden = true;
    app.cellFontFamilyButton.setAttribute('aria-expanded', 'false');
  }
  if (app && typeof app.publishUiState === 'function') app.publishUiState();
}

function openCellFontFamilyPicker(app) {
  if (!app || !app.cellFontFamilyPopover || !app.cellFontFamilyButton) return;
  setToolbarPickerOpenState(app, 'fontFamily', true);
  if (!app.useReactShellControls) {
    app.cellFontFamilyPopover.hidden = false;
    app.cellFontFamilyButton.setAttribute('aria-expanded', 'true');
  }
  if (app && typeof app.publishUiState === 'function') app.publishUiState();
}

function closeBgColorPicker(app) {
  if (!app || !app.cellBgColorPopover || !app.cellBgColorButton) return;
  setToolbarPickerOpenState(app, 'bgColor', false);
  if (!app.useReactShellControls) {
    app.cellBgColorPopover.hidden = true;
    app.cellBgColorButton.setAttribute('aria-expanded', 'false');
  }
  if (app && typeof app.publishUiState === 'function') app.publishUiState();
}

function openBgColorPicker(app) {
  if (!app || !app.cellBgColorPopover || !app.cellBgColorButton) return;
  setToolbarPickerOpenState(app, 'bgColor', true);
  if (!app.useReactShellControls) {
    app.cellBgColorPopover.hidden = false;
    app.cellBgColorButton.setAttribute('aria-expanded', 'true');
  }
  if (app && typeof app.publishUiState === 'function') app.publishUiState();
}

function closeCellFormatPicker(app) {
  if (!app || !app.cellFormatPopover || !app.cellFormatButton) return;
  setToolbarPickerOpenState(app, 'format', false);
  if (!app.useReactShellControls) {
    app.cellFormatPopover.hidden = true;
    app.cellFormatButton.setAttribute('aria-expanded', 'false');
  }
  if (app && typeof app.publishUiState === 'function') app.publishUiState();
}

function openCellFormatPicker(app) {
  if (!app || !app.cellFormatPopover || !app.cellFormatButton) return;
  setToolbarPickerOpenState(app, 'format', true);
  if (!app.useReactShellControls) {
    app.cellFormatPopover.hidden = false;
    app.cellFormatButton.setAttribute('aria-expanded', 'true');
  }
  if (app && typeof app.publishUiState === 'function') app.publishUiState();
}

function closeCellBordersPicker(app) {
  if (!app || !app.cellBordersPopover || !app.cellBordersButton) return;
  setToolbarPickerOpenState(app, 'borders', false);
  if (!app.useReactShellControls) {
    app.cellBordersPopover.hidden = true;
    app.cellBordersButton.setAttribute('aria-expanded', 'false');
  }
  if (app && typeof app.publishUiState === 'function') app.publishUiState();
}

function openCellBordersPicker(app) {
  if (!app || !app.cellBordersPopover || !app.cellBordersButton) return;
  setToolbarPickerOpenState(app, 'borders', true);
  if (!app.useReactShellControls) {
    app.cellBordersPopover.hidden = false;
    app.cellBordersButton.setAttribute('aria-expanded', 'true');
  }
  if (app && typeof app.publishUiState === 'function') app.publishUiState();
}

export function toggleCellFormatPicker(app) {
  if (!app || !app.cellFormatPopover) return;
  if (app.cellFormatPopover.hidden) {
    openCellFormatPicker(app);
  } else {
    closeCellFormatPicker(app);
  }
}

export function toggleCellFontFamilyPicker(app) {
  if (!app || !app.cellFontFamilyPopover) return;
  if (app.cellFontFamilyPopover.hidden) {
    openCellFontFamilyPicker(app);
  } else {
    closeCellFontFamilyPicker(app);
  }
}

export function toggleBgColorPicker(app) {
  if (!app || !app.cellBgColorPopover) return;
  if (app.cellBgColorPopover.hidden) {
    openBgColorPicker(app);
  } else {
    closeBgColorPicker(app);
  }
}

export function toggleCellBordersPicker(app) {
  if (!app || !app.cellBordersPopover) return;
  if (app.cellBordersPopover.hidden) {
    openCellBordersPicker(app);
  } else {
    closeCellBordersPicker(app);
  }
}

export function applyCellFormat(app, format) {
  var cellIds = getSelectedRegionCellIds(app);
  if (!app || !cellIds.length || app.isReportActive()) return;
  app.captureHistorySnapshot('cell-format');
  var value = String(format || 'text');
  for (var i = 0; i < cellIds.length; i++) {
    app.setCellFormat(cellIds[i], value);
  }
  app.renderCurrentSheetFromStorage();
  closeCellFormatPicker(app);
  if (typeof app.publishUiState === 'function') app.publishUiState();
}

export function applyCellAlign(app, align) {
  applyPresentationToSelection(
    app,
    {
      align: String(align || 'left'),
    },
    'cell-align',
  );
}

export function toggleCellBold(app) {
  var activeCellId = getActiveSourceCellId(app);
  if (!app || !activeCellId || app.isReportActive()) return;
  var current = app.storage.getCellPresentation(
    getVisibleSheetId(app),
    activeCellId,
  );
  applyPresentationToSelection(
    app,
    {
      bold: !current.bold,
    },
    'cell-bold',
  );
}

export function toggleCellItalic(app) {
  var activeCellId = getActiveSourceCellId(app);
  if (!app || !activeCellId || app.isReportActive()) return;
  var current = app.storage.getCellPresentation(
    getVisibleSheetId(app),
    activeCellId,
  );
  applyPresentationToSelection(
    app,
    {
      italic: !current.italic,
    },
    'cell-italic',
  );
}

export function toggleCellWrap(app) {
  var activeCellId = getActiveSourceCellId(app);
  if (!app || !activeCellId || app.isReportActive()) return;
  var current = app.storage.getCellPresentation(
    getVisibleSheetId(app),
    activeCellId,
  );
  applyPresentationToSelection(
    app,
    {
      wrapText: !current.wrapText,
    },
    'cell-wrap',
  );
}

export function applyCellFontFamily(app, fontFamily) {
  if (!app) return;
  var nextFontFamily = String(fontFamily || 'default');
  syncFontFamilyButtonPreview(app, nextFontFamily);
  applyPresentationToSelection(
    app,
    {
      fontFamily: nextFontFamily,
    },
    'cell-font-family',
  );
  closeCellFontFamilyPicker(app);
}

export function applyCellBgColor(app, color) {
  if (!app) return;
  applyBgColorSelection(app, color);
  closeBgColorPicker(app);
}

export function setupCellFormatControls(app) {
  if (!app.cellFormatButton) return;
  app.syncCellFormatControl();
  if (app.useReactShellControls) return;
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
      if (!cellIds.length) return;
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
    if (app.useReactShellControls) return;
    app.cellAlignButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        if (!app.activeCellId || app.isReportActive() || button.disabled) return;
        applyCellAlign(app, String(button.getAttribute('data-align') || 'left'));
      });
    });
  }
  if (app.useReactShellControls) return;
  if (app.cellBoldButton) {
    app.cellBoldButton.addEventListener('click', () => {
      toggleCellBold(app);
    });
  }
  if (app.cellItalicButton) {
    app.cellItalicButton.addEventListener('click', () => {
      toggleCellItalic(app);
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
      applyBordersPresetToSelection(app, String(option.getAttribute('data-preset') || 'none'));
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
      applyCellBgColor(app, chip.getAttribute('data-color'));
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
      applyCellBgColor(app, app.cellBgColorCustomInput.value);
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
      applyCellFontFamily(
        app,
        String(option.getAttribute('data-font-family') || 'default'),
      );
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
      toggleCellWrap(app);
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
