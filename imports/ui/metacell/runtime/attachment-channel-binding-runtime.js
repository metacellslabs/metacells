function normalizeChannelLabel(label) {
  return String(label == null ? '' : label)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function stripChannelMentions(text) {
  return String(text == null ? '' : text)
    .replace(/(^|[^A-Za-z0-9_:/])\/([A-Za-z][A-Za-z0-9_-]*)\b/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(text) {
  return String(text == null ? '' : text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getChannelBindingMode(app, rawValue) {
  var raw = String(rawValue == null ? '' : rawValue).trim();
  if (!raw) return 'table';
  if (/^\/([A-Za-z][A-Za-z0-9_-]*)\s*$/.test(raw)) return 'log';
  if (
    raw.charAt(0) === '#' &&
    app &&
    app.formulaEngine &&
    typeof app.formulaEngine.parseChannelFeedPromptSpec === 'function' &&
    app.formulaEngine.parseChannelFeedPromptSpec(raw)
  ) {
    return 'table';
  }
  if (
    raw.charAt(0) === '>' &&
    /(^|[^A-Za-z0-9_:/])\/([A-Za-z][A-Za-z0-9_-]*)\b/.test(raw)
  ) {
    return 'list';
  }
  if (
    raw.charAt(0) === "'" &&
    /(^|[^A-Za-z0-9_:/])\/([A-Za-z][A-Za-z0-9_-]*)\b/.test(raw)
  ) {
    return 'note';
  }
  return 'table';
}

function getBoundChannelLabel(app, rawValue) {
  var raw = String(rawValue == null ? '' : rawValue);
  var bareMatch = /^\s*\/([A-Za-z][A-Za-z0-9_-]*)\s*$/.exec(raw);
  if (bareMatch && bareMatch[1]) return normalizeChannelLabel(bareMatch[1]);
  var mentionMatch = /(^|[^A-Za-z0-9_:/])\/([A-Za-z][A-Za-z0-9_-]*)\b/.exec(raw);
  if (mentionMatch && mentionMatch[2]) {
    return normalizeChannelLabel(mentionMatch[2]);
  }
  if (
    !app ||
    !app.formulaEngine ||
    typeof app.formulaEngine.parseChannelFeedPromptSpec !== 'function'
  ) {
    return '';
  }
  var spec = app.formulaEngine.parseChannelFeedPromptSpec(raw);
  if (!spec || !Array.isArray(spec.labels) || !spec.labels.length) return '';
  return normalizeChannelLabel(spec.labels[0]);
}

function getChannelBindingPrompt(app, rawValue) {
  var raw = String(rawValue == null ? '' : rawValue).trim();
  if (!raw) return '';

  if (
    app &&
    app.formulaEngine &&
    typeof app.formulaEngine.parseChannelFeedPromptSpec === 'function'
  ) {
    var feedSpec = app.formulaEngine.parseChannelFeedPromptSpec(raw);
    if (feedSpec && feedSpec.prompt) return stripChannelMentions(feedSpec.prompt);
  }

  if (
    raw.charAt(0) === '#' &&
    app &&
    app.formulaEngine &&
    typeof app.formulaEngine.parseTablePromptSpec === 'function'
  ) {
    var tableSpec = app.formulaEngine.parseTablePromptSpec(raw);
    if (tableSpec && tableSpec.prompt) {
      return stripChannelMentions(tableSpec.prompt);
    }
  }

  if (raw.charAt(0) === "'") return stripChannelMentions(raw.substring(1));

  if (
    raw.charAt(0) === '>' &&
    app &&
    app.formulaEngine &&
    typeof app.formulaEngine.parseListShortcutSpec === 'function'
  ) {
    var listSpec = app.formulaEngine.parseListShortcutSpec(raw);
    if (listSpec && listSpec.prompt) return stripChannelMentions(listSpec.prompt);
  }

  if (raw.charAt(0) !== '=') return stripChannelMentions(raw);
  return '';
}

function buildDefaultChannelBindingPrompt(mode) {
  if (mode === 'note') {
    return 'summarize the latest incoming event in one short paragraph';
  }
  if (mode === 'list') {
    return 'summarize each incoming event in one short line';
  }
  return 'extract key fields from each incoming event';
}

function stripSpecificChannelMention(text, channelLabel) {
  var normalized = normalizeChannelLabel(channelLabel);
  if (!normalized) return String(text == null ? '' : text).trim();
  return String(text == null ? '' : text)
    .replace(
      new RegExp('(^|[^A-Za-z0-9_:/])/' + escapeRegex(normalized) + '\\b', 'g'),
      '$1',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function buildChannelBindingRaw(app, rawValue, channelLabel, mode) {
  var normalizedLabel = normalizeChannelLabel(channelLabel);
  var normalizedMode = String(mode || 'table').trim().toLowerCase() || 'table';
  if (!normalizedLabel) return String(rawValue == null ? '' : rawValue);
  if (normalizedMode === 'log') return '/' + normalizedLabel;
  var prompt = stripSpecificChannelMention(
    getChannelBindingPrompt(app, rawValue),
    normalizedLabel,
  );
  if (!prompt) prompt = buildDefaultChannelBindingPrompt(normalizedMode);
  if (normalizedMode === 'note') return "' /" + normalizedLabel + ' ' + prompt;
  if (normalizedMode === 'list') return '> /' + normalizedLabel + ' ' + prompt;
  return '# /' + normalizedLabel + ' ' + prompt;
}

function focusFormulaInputAtEnd(app) {
  if (!app || !app.formulaInput) return;
  app.formulaInput.focus();
  if (typeof app.formulaInput.setSelectionRange === 'function') {
    var caret = String(app.formulaInput.value || '').length;
    app.formulaInput.setSelectionRange(caret, caret);
  }
}

export function syncChannelBindingControl(app) {
  if (!app || !app.bindChannelSelect) return;
  var select = app.bindChannelSelect;
  var modeSelect = app.bindChannelModeSelect;
  var channels = Array.isArray(app.availableChannels) ? app.availableChannels : [];
  var disabled =
    !!(app.isReportActive && app.isReportActive()) ||
    !app.hasSingleSelectedCell() ||
    !channels.length;
  var activeCellId = String(app.activeCellId || '').toUpperCase();
  var currentRaw = activeCellId ? app.getRawCellValue(activeCellId) : '';
  var currentLabel = getBoundChannelLabel(app, currentRaw);
  var currentMode = getChannelBindingMode(app, currentRaw);

  select.innerHTML =
    "<option value=''>Channel</option>" +
    channels
      .map(function (channel) {
        if (!channel || !channel.label) return '';
        var label = String(channel.label || '');
        var value = normalizeChannelLabel(label)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
        var text = label
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
        return "<option value='" + value + "'>" + text + '</option>';
      })
      .filter(Boolean)
      .join('');
  select.value = currentLabel || '';
  select.disabled = disabled;
  if (modeSelect) {
    modeSelect.value = currentMode || 'table';
    modeSelect.disabled = disabled;
  }
}

export function applyChannelBindingSelection(app, channelLabel, selectedMode) {
  var activeCellId = String((app && app.activeCellId) || '').toUpperCase();
  var activeInput = app && app.getActiveCellInput ? app.getActiveCellInput() : null;
  if (!activeCellId) {
    syncChannelBindingControl(app);
    return;
  }
  var nextChannelLabel = normalizeChannelLabel(channelLabel);
  if (!nextChannelLabel) {
    var existingRaw = String(
      app.formulaInput && app.formulaInput.value != null
        ? app.formulaInput.value
        : app.getRawCellValue(activeCellId),
    );
    nextChannelLabel = getBoundChannelLabel(app, existingRaw);
  }
  if (!nextChannelLabel) {
    syncChannelBindingControl(app);
    return;
  }
  var nextMode = String(selectedMode || 'table').trim().toLowerCase() || 'table';
  var currentRaw = String(
    app.formulaInput && app.formulaInput.value != null
      ? app.formulaInput.value
      : app.getRawCellValue(activeCellId),
  );
  var nextRaw = buildChannelBindingRaw(
    app,
    currentRaw,
    nextChannelLabel,
    nextMode,
  );
  if (nextRaw === currentRaw) {
    focusFormulaInputAtEnd(app);
    syncChannelBindingControl(app);
    return;
  }
  if (!activeInput) {
    syncChannelBindingControl(app);
    return;
  }
  app.enterFormulaBarEditing(activeInput, {
    draftRaw: nextRaw,
    origin: 'formula-bar',
  });
  app.syncActiveEditorValue(nextRaw, { syncOverlay: false });
  app.commitFormulaBarValue();
  focusFormulaInputAtEnd(app);
  syncChannelBindingControl(app);
}

export function setupChannelBindingControls(app) {
  if (app.useReactShellControls) {
    syncChannelBindingControl(app);
    return;
  }
  var applyCurrentChannelBindingSelection = function () {
    applyChannelBindingSelection(
      app,
      app.bindChannelSelect ? app.bindChannelSelect.value : '',
      app.bindChannelModeSelect ? app.bindChannelModeSelect.value : 'table',
    );
  };

  if (app.bindChannelSelect) {
    app.bindChannelSelect.addEventListener(
      'change',
      applyCurrentChannelBindingSelection,
    );
  }
  if (app.bindChannelModeSelect) {
    app.bindChannelModeSelect.addEventListener(
      'change',
      applyCurrentChannelBindingSelection,
    );
  }
  syncChannelBindingControl(app);
}
