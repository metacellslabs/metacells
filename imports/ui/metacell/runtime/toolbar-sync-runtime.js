import { AI_MODE } from './constants.js';
import { getToolbarPickerOpenState, setToolbarPickerOpenState } from './toolbar-popover-runtime.js';
import { getBordersPresetValue } from './toolbar-actions-runtime.js';
import {
  getSelectionRangeState,
  hasMultiCellSelectionRange,
} from './selection-range-facade.js';
export { getToolbarPickerOpenState } from './toolbar-popover-runtime.js';

var BG_COLOR_RECENT_CACHE_KEY = 'UI_RECENT_BG_COLORS';

function getVisibleSheetId(app) {
  return typeof app.getVisibleSheetId === 'function'
    ? String(app.getVisibleSheetId() || '')
    : String(app.activeSheetId || '');
}

function getEditingOwnerSheetId(app) {
  return typeof app.getEditingOwnerSheetId === 'function'
    ? String(app.getEditingOwnerSheetId() || '')
    : getVisibleSheetId(app);
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
  var visibleSheetId = getVisibleSheetId(app);
  if (
    typeof app.hasPendingLocalEdit === 'function' &&
    app.hasPendingLocalEdit()
  ) {
    return true;
  }
  var inputs =
    typeof app.getMountedInputs === 'function'
      ? app.getMountedInputs()
      : Array.isArray(app.inputs)
        ? app.inputs
        : [];
  for (var i = 0; i < inputs.length; i++) {
    var input = inputs[i];
    if (!input || !input.id) continue;
    var raw = app.getRawCellValue(input.id);
    if (!isManualAIFormulaRaw(raw)) continue;
    var state = String(app.storage.getCellState(visibleSheetId, input.id) || '');
    if (state !== 'resolved' && state !== 'error') return true;
    var displayValue = String(
      app.storage.getCellDisplayValue(visibleSheetId, input.id) || '',
    );
    if (displayValue === '(manual: click Update)') return true;
  }
  return false;
}

function getRegionRecordingUiState(app) {
  var recording = app && app.regionRecordingState ? app.regionRecordingState : null;
  var phase = recording && recording.phase ? String(recording.phase) : 'idle';
  var label = 'Record';
  if (phase === 'recording') {
    label = 'Pause';
  } else if (phase === 'paused') {
    label = 'Stop';
  } else if (phase === 'rendering') {
    label = 'Rendering';
  }
  var hasRegionSelection = !!(
    app &&
    hasMultiCellSelectionRange(app)
  );
  var hasDownload = !!(
    app &&
    app.regionRecordingDownloadReady === true &&
    app.regionRecordingGifUrl
  );
  var shouldShow = !!(
    app &&
    !app.isReportActive() &&
    (hasRegionSelection || phase !== 'idle' || hasDownload)
  );
  return {
    visible: shouldShow,
    phase: phase,
    canRecord: shouldShow && phase !== 'rendering',
    showDownload: hasDownload && phase === 'idle',
    label: label,
  };
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
  if (app.useReactShellControls) {
    return;
  }
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

function closeCellFontFamilyPicker(app) {
  if (!app || !app.cellFontFamilyPopover || !app.cellFontFamilyButton) return;
  setToolbarPickerOpenState(app, 'fontFamily', false);
  if (!app.useReactShellControls) {
    app.cellFontFamilyPopover.hidden = true;
    app.cellFontFamilyButton.setAttribute('aria-expanded', 'false');
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

function closeCellFormatPicker(app) {
  if (!app || !app.cellFormatPopover || !app.cellFormatButton) return;
  setToolbarPickerOpenState(app, 'format', false);
  if (!app.useReactShellControls) {
    app.cellFormatPopover.hidden = true;
    app.cellFormatButton.setAttribute('aria-expanded', 'false');
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

export function getRecentBgColors(app) {
  return readRecentBgColors(app);
}

export function syncDisplayModeControl(app) {
  if (!app || !app.displayModeButton) return;
  var mode = app.displayMode === 'formulas' ? 'formulas' : 'values';
  app.displayModeButton.setAttribute('data-display-mode-current', mode);
  if (!app.useReactShellControls && app.displayModeOptions && app.displayModeOptions.length) {
    app.displayModeOptions.forEach(function (option) {
      var optionValue = String(
        option.getAttribute('data-display-mode') || 'values',
      );
      option.classList.toggle('is-active', optionValue === mode);
    });
  }
}

function syncAIModeControl(app) {
  if (!app || !app.aiModeButton) return;
  var mode = String(app.aiService.getMode() || AI_MODE.manual);
  app.aiModeButton.setAttribute('data-ai-mode-current', mode);
  if (!app.useReactShellControls && app.aiModeOptions && app.aiModeOptions.length) {
    app.aiModeOptions.forEach(function (option) {
      var optionValue = String(option.getAttribute('data-ai-mode') || 'manual');
      option.classList.toggle('is-active', optionValue === mode);
    });
  }
}

export function syncAIModeUI(app) {
  var isManual = app.aiService.getMode() === AI_MODE.manual;
  var hasPendingWork = isManual && hasPendingManualAIWork(app);
  var isLoading = !!app.isManualAIUpdating;
  syncAIModeControl(app);
  if (!app || !app.updateAIButton) return;
  app.updateAIButton.disabled = !hasPendingWork || isLoading;
  if (!app.useReactShellControls) {
    app.updateAIButton.style.display = isManual ? 'inline-flex' : 'none';
    app.updateAIButton.classList.toggle('is-loading', isLoading);
    app.updateAIButton.setAttribute('aria-busy', isLoading ? 'true' : 'false');
  }
}

export function getAIModeUiState(app) {
  var mode =
    app && app.aiService && typeof app.aiService.getMode === 'function'
      ? String(app.aiService.getMode() || AI_MODE.manual)
      : AI_MODE.manual;
  var isManual = mode === AI_MODE.manual;
  var isLoading = !!(app && app.isManualAIUpdating);
  var hasPendingWork = !!(app && isManual && hasPendingManualAIWork(app));
  return {
    mode: mode,
    pickerOpen: getToolbarPickerOpenState(app, 'aiMode', app && app.aiModePopover),
    showUpdateButton: isManual,
    updateButtonDisabled: !hasPendingWork || isLoading,
    updateButtonLoading: isLoading,
  };
}

export function getDisplayModeUiState(app) {
  return {
    mode:
      app && app.displayMode === 'formulas'
        ? 'formulas'
        : 'values',
    pickerOpen: getToolbarPickerOpenState(
      app,
      'displayMode',
      app && app.displayModePopover,
    ),
  };
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
  if (app.useReactShellControls) {
    return currentFormat;
  }
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
      if (app.useReactShellControls) return;
      button.classList.toggle(
        'is-active',
        !disabled && alignValue === String(presentation.align || 'left'),
      );
    });
  }
  if (app.cellBoldButton) {
    app.cellBoldButton.disabled = disabled;
    if (!app.useReactShellControls) {
      app.cellBoldButton.classList.toggle('is-active', !!presentation.bold);
    }
  }
  if (app.cellItalicButton) {
    app.cellItalicButton.disabled = disabled;
    if (!app.useReactShellControls) {
      app.cellItalicButton.classList.toggle('is-active', !!presentation.italic);
    }
  }
  if (app.cellBordersButton) {
    var bordersPreset = disabled
      ? 'none'
      : getBordersPresetValue(app, presentation.borders);
    app.cellBordersButton.disabled = disabled;
    app.cellBordersButton.setAttribute('data-border-preset', bordersPreset);
    if (disabled) closeCellBordersPicker(app);
    if (
      !app.useReactShellControls &&
      app.cellBordersOptions &&
      app.cellBordersOptions.length
    ) {
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
    if (
      !app.useReactShellControls &&
      app.cellFontFamilyOptions &&
      app.cellFontFamilyOptions.length
    ) {
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
    if (!app.useReactShellControls) {
      app.cellWrapButton.classList.toggle('is-active', !!presentation.wrapText);
    }
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

export function collectFormulaBarUiState(app) {
  var activeCellId = String((app && app.activeCellId) || '');
  var disabled = !activeCellId || !!(app && app.isReportActive && app.isReportActive());
  var currentFormat = disabled
    ? 'text'
    : String((app && app.getCellFormat && app.getCellFormat(activeCellId)) || 'text');
  var presentation = disabled
    ? {
        align: 'left',
        wrapText: false,
        bold: false,
        italic: false,
        backgroundColor: '',
        fontFamily: 'default',
        fontSize: 14,
        borders: { top: false, right: false, bottom: false, left: false },
      }
    : app.getCellPresentation(activeCellId);
  return {
    disabled: disabled,
    currentFormat: currentFormat,
    formatPickerOpen: getToolbarPickerOpenState(app, 'format', app && app.cellFormatPopover),
    decimalsDisabled: disabled,
    align: String((presentation && presentation.align) || 'left'),
    bordersPreset: disabled
      ? 'none'
      : getBordersPresetValue(app, presentation && presentation.borders),
    bordersPickerOpen: getToolbarPickerOpenState(
      app,
      'borders',
      app && app.cellBordersPopover,
    ),
    backgroundColor: String((presentation && presentation.backgroundColor) || ''),
    bgColorPickerOpen: getToolbarPickerOpenState(
      app,
      'bgColor',
      app && app.cellBgColorPopover,
    ),
    recentBgColors: getRecentBgColors(app),
    fontSizeDisabled: disabled,
    fontFamily: String((presentation && presentation.fontFamily) || 'default'),
    fontFamilyPickerOpen: getToolbarPickerOpenState(
      app,
      'fontFamily',
      app && app.cellFontFamilyPopover,
    ),
    wrapText: !!(presentation && presentation.wrapText),
    bold: !!(presentation && presentation.bold),
    italic: !!(presentation && presentation.italic),
    channelLabel:
      app && app.bindChannelSelect ? String(app.bindChannelSelect.value || '') : '',
    channelMode:
      app && app.bindChannelModeSelect
        ? String(app.bindChannelModeSelect.value || 'table')
        : 'table',
    channelOptions: Array.isArray(app && app.availableChannels)
      ? app.availableChannels
          .map(function (channel) {
            return channel && channel.label
              ? {
                  id: String(channel.id || ''),
                  label: String(channel.label || ''),
                }
              : null;
          })
          .filter(Boolean)
      : [],
    channelDisabled: disabled || !(app && app.availableChannels && app.availableChannels.length),
    canAttachFile: !disabled,
    regionRecordingUi: getRegionRecordingUiState(app),
  };
}

export function collectToolbarUiState(app) {
  return {
    activeCellId: String((app && app.activeCellId) || ''),
    displayMode: String((app && app.displayMode) || 'values'),
    displayModeUi: getDisplayModeUiState(app),
    aiModeUi: getAIModeUiState(app),
    namedCellJumpUi:
      app && typeof app.getNamedCellJumpUiState === 'function'
        ? app.getNamedCellJumpUiState()
        : null,
    formulaBarUi: collectFormulaBarUiState(app),
  };
}
