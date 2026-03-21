import { Meteor } from 'meteor/meteor';

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

  if (/^\/([A-Za-z][A-Za-z0-9_-]*)\s*$/.test(raw)) {
    return 'log';
  }

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
  if (bareMatch && bareMatch[1]) {
    return normalizeChannelLabel(bareMatch[1]);
  }
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
    if (feedSpec && feedSpec.prompt) {
      return stripChannelMentions(feedSpec.prompt);
    }
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

  if (raw.charAt(0) === "'") {
    return stripChannelMentions(raw.substring(1));
  }

  if (
    raw.charAt(0) === '>' &&
    app &&
    app.formulaEngine &&
    typeof app.formulaEngine.parseListShortcutSpec === 'function'
  ) {
    var listSpec = app.formulaEngine.parseListShortcutSpec(raw);
    if (listSpec && listSpec.prompt) {
      return stripChannelMentions(listSpec.prompt);
    }
  }

  if (raw.charAt(0) !== '=') {
    return stripChannelMentions(raw);
  }

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
  if (normalizedMode === 'log') {
    return '/' + normalizedLabel;
  }
  var prompt = stripSpecificChannelMention(
    getChannelBindingPrompt(app, rawValue),
    normalizedLabel,
  );
  if (!prompt) {
    prompt = buildDefaultChannelBindingPrompt(normalizedMode);
  }
  if (normalizedMode === 'note') {
    return "' /" + normalizedLabel + ' ' + prompt;
  }
  if (normalizedMode === 'list') {
    return '> /' + normalizedLabel + ' ' + prompt;
  }
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

function getAttachmentDisplayValue(app, rawValue) {
  var raw = String(rawValue == null ? '' : rawValue);
  var attachment = app.parseAttachmentSource(raw);
  if (!attachment) return raw;
  return String(
    attachment.name ||
      (attachment.converting
        ? 'Converting file...'
        : attachment.pending
          ? 'Choose file'
          : 'Attached file'),
  );
}

function syncActiveAttachmentValue(app, cellId, rawValue) {
  if (!app.activeInput || app.activeInput.id !== String(cellId || '').toUpperCase()) {
    return;
  }
  var displayValue = getAttachmentDisplayValue(app, rawValue);
  app.activeInput.value = displayValue;
  app.formulaInput.value = displayValue;
}

function resolveCellAttachment(app, sheetId, cellId) {
  if (!app || typeof app.parseAttachmentSource !== 'function') return null;
  var raw = app.storage.getCellValue(sheetId, cellId);
  var computed = app.storage.getCellComputedValue(sheetId, cellId);
  var display = app.storage.getCellDisplayValue(sheetId, cellId);
  return (
    app.parseAttachmentSource(raw) ||
    app.parseAttachmentSource(computed) ||
    app.parseAttachmentSource(display)
  );
}

function ensureAttachmentContentOverlay(app) {
  if (app.attachmentContentOverlay) return app.attachmentContentOverlay;
  var overlay = document.createElement('div');
  overlay.className = 'attachment-content-overlay';
  overlay.style.display = 'none';
  overlay.innerHTML =
    "<div class='attachment-content-panel'>" +
    "<div class='attachment-content-header'>" +
    "<div class='attachment-content-title'></div>" +
    "<button type='button' class='attachment-content-close' title='Close'>✕</button>" +
    '</div>' +
    "<pre class='attachment-content-body'></pre>" +
    '</div>';
  document.body.appendChild(overlay);
  app.attachmentContentOverlay = overlay;
  app.attachmentContentTitle = overlay.querySelector('.attachment-content-title');
  app.attachmentContentBody = overlay.querySelector('.attachment-content-body');
  overlay.addEventListener('click', (event) => {
    if (
      event.target === overlay ||
      (event.target.closest && event.target.closest('.attachment-content-close'))
    ) {
      hideAttachmentContentOverlay(app);
    }
  });
  app.handleAttachmentContentOverlayKeydown = (event) => {
    if (event.key !== 'Escape') return;
    if (
      !app.attachmentContentOverlay ||
      app.attachmentContentOverlay.style.display === 'none'
    )
      return;
    event.preventDefault();
    hideAttachmentContentOverlay(app);
  };
  document.addEventListener('keydown', app.handleAttachmentContentOverlayKeydown);
  return overlay;
}

function hideAttachmentContentOverlay(app) {
  if (!app || !app.attachmentContentOverlay) return;
  app.attachmentContentOverlay.style.display = 'none';
  if (app.attachmentContentTitle) app.attachmentContentTitle.textContent = '';
  if (app.attachmentContentBody) app.attachmentContentBody.textContent = '';
}

async function loadAttachmentContentText(attachment) {
  var source = attachment && typeof attachment === 'object' ? attachment : {};
  var inlineContent = String(source.content || '');
  if (inlineContent && String(source.encoding || 'utf8').toLowerCase() !== 'base64') {
    return inlineContent;
  }
  var artifactId = String(source.contentArtifactId || '').trim();
  if (!artifactId) return '';
  var artifact = await Meteor.callAsync('artifacts.get', artifactId);
  if (!artifact || String(artifact.kind || '') !== 'text') return '';
  return String(artifact.text || '');
}

async function openAttachmentContentPreview(app, sheetId, cellId) {
  var attachment = resolveCellAttachment(app, sheetId, cellId);
  if (!attachment) return;
  var overlay = ensureAttachmentContentOverlay(app);
  var name = String(attachment.name || 'Attached file');
  if (app.attachmentContentTitle) app.attachmentContentTitle.textContent = name;
  if (app.attachmentContentBody) {
    app.attachmentContentBody.textContent = 'Loading...';
  }
  overlay.style.display = 'flex';
  try {
    var text = await loadAttachmentContentText(attachment);
    if (app.attachmentContentBody) {
      app.attachmentContentBody.textContent =
        text ||
        'No extracted text content is available for this attachment.';
    }
  } catch (error) {
    if (app.attachmentContentBody) {
      app.attachmentContentBody.textContent = String(
        (error && (error.reason || error.message)) ||
          'Failed to load extracted content',
      ).trim();
    }
  }
}

function refreshAttachmentUi(app, sheetId) {
  if (!app) return;
  var targetSheetId = String(sheetId || app.activeSheetId || '');
  if (
    targetSheetId &&
    app.activeSheetId === targetSheetId &&
    typeof app.renderCurrentSheetFromStorage === 'function'
  ) {
    app.renderCurrentSheetFromStorage();
    return;
  }
  if (typeof app.renderReportLiveValues === 'function') {
    app.renderReportLiveValues(true);
  }
}

function revealAttachmentCell(app, sheetId, cellId) {
  if (!app || !app.grid) return;
  var targetSheetId = String(sheetId || '');
  var targetCellId = String(cellId || '').toUpperCase();
  if (!targetSheetId || !targetCellId) return;
  if (app.activeSheetId !== targetSheetId) return;
  var input = app.inputById ? app.inputById[targetCellId] : null;
  if (!input || typeof app.grid.setEditing !== 'function') return;
  app.grid.setEditing(input, false);
}

export function setupAttachmentControls(app) {
  app.syncAttachButtonState();
  if (app.attachFileButton) {
    app.attachFileButton.addEventListener('click', () => {
      if (
        !app.hasSingleSelectedCell() ||
        !app.activeInput ||
        !app.attachFileInput
      )
        return;
      var cellId = String(app.activeInput.id || '').toUpperCase();
      var previousValue = app.getRawCellValue(cellId);
      app.pendingAttachmentContext = {
        sheetId: app.activeSheetId,
        cellId: cellId,
        previousValue: String(previousValue == null ? '' : previousValue),
      };
      var pendingSource = app.buildAttachmentSource({ pending: true });
      app.applyRawCellUpdate(app.activeSheetId, cellId, pendingSource);
      syncActiveAttachmentValue(app, cellId, pendingSource);
      revealAttachmentCell(app, app.activeSheetId, cellId);
      refreshAttachmentUi(app, app.activeSheetId);
    });
  }
  if (app.table) {
    app.table.addEventListener('click', (e) => {
      var contentPreviewButton =
        e.target && e.target.closest
          ? e.target.closest(
              '.attachment-content-preview, .generated-attachment-content-preview',
            )
          : null;
      var downloadLink =
        e.target && e.target.closest
          ? e.target.closest('.attachment-download')
          : null;
      var selectButton =
        e.target && e.target.closest
          ? e.target.closest('.attachment-select')
          : null;
      var removeButton =
        e.target && e.target.closest
          ? e.target.closest('.attachment-remove')
          : null;
      if (contentPreviewButton) {
        var previewTd =
          e.target && e.target.closest ? e.target.closest('td') : null;
        var previewInput = previewTd ? previewTd.querySelector('input') : null;
        if (!previewInput) return;
        e.preventDefault();
        e.stopPropagation();
        openAttachmentContentPreview(
          app,
          app.activeSheetId,
          String(previewInput.id || '').toUpperCase(),
        );
        return;
      }
      if (downloadLink) {
        e.stopPropagation();
        return;
      }
      if (!selectButton && !removeButton) return;
      var td = e.target && e.target.closest ? e.target.closest('td') : null;
      var input = td ? td.querySelector('input') : null;
      if (!input) return;
      e.preventDefault();
      e.stopPropagation();
      app.setActiveInput(input);
      if (removeButton) {
        app.captureHistorySnapshot(
          'attachment:' +
            app.activeSheetId +
            ':' +
            String(input.id || '').toUpperCase(),
        );
        var pendingSource = app.buildAttachmentSource({ pending: true });
        app.applyRawCellUpdate(app.activeSheetId, input.id, pendingSource);
        syncActiveAttachmentValue(app, input.id, pendingSource);
        revealAttachmentCell(
          app,
          app.activeSheetId,
          String(input.id || '').toUpperCase(),
        );
        refreshAttachmentUi(app, app.activeSheetId);
        return;
      }
      var previousRaw = app.getRawCellValue(input.id);
      app.pendingAttachmentContext = {
        sheetId: app.activeSheetId,
        cellId: String(input.id || '').toUpperCase(),
        previousValue: String(previousRaw == null ? '' : previousRaw),
      };
      app.attachFileInput.value = '';
      app.attachFileInput.click();
    });
  }
  if (app.attachFileInput) {
    app.attachFileInput.addEventListener('change', async () => {
      var ctx = app.pendingAttachmentContext;
      app.pendingAttachmentContext = null;
      if (!ctx) return;

      var file = app.attachFileInput.files && app.attachFileInput.files[0];
      if (!file) {
        app.applyRawCellUpdate(ctx.sheetId, ctx.cellId, ctx.previousValue);
        syncActiveAttachmentValue(app, ctx.cellId, ctx.previousValue);
        revealAttachmentCell(app, ctx.sheetId, ctx.cellId);
        refreshAttachmentUi(app, ctx.sheetId);
        return;
      }

      try {
        var convertingSource = app.buildAttachmentSource({
          name: file.name || 'Attached file',
          type: file.type || '',
          pending: true,
          converting: true,
        });
        app.applyRawCellUpdate(ctx.sheetId, ctx.cellId, convertingSource);
        syncActiveAttachmentValue(app, ctx.cellId, convertingSource);
        revealAttachmentCell(app, ctx.sheetId, ctx.cellId);
        refreshAttachmentUi(app, ctx.sheetId);
        var base64 = await file
          .arrayBuffer()
          .then((buffer) => arrayBufferToBase64(app, buffer));
        var extracted = await readAttachedFileContent(app, file, base64);
        var attachmentSource = app.buildAttachmentSource({
          name: file.name || 'Attached file',
          type: file.type || '',
          content: extracted && extracted.content,
          contentArtifactId: extracted && extracted.contentArtifactId,
          binaryArtifactId: extracted && extracted.binaryArtifactId,
          downloadUrl: extracted && extracted.downloadUrl,
          previewUrl: extracted && extracted.previewUrl,
          pending: false,
        });
        app.captureHistorySnapshot(
          'attachment:' +
            String(ctx.sheetId || '') +
            ':' +
            String(ctx.cellId || '').toUpperCase(),
        );
        app.applyRawCellUpdate(ctx.sheetId, ctx.cellId, attachmentSource);
        syncActiveAttachmentValue(app, ctx.cellId, attachmentSource);
        revealAttachmentCell(app, ctx.sheetId, ctx.cellId);
        refreshAttachmentUi(app, ctx.sheetId);
      } catch (error) {
        app.applyRawCellUpdate(ctx.sheetId, ctx.cellId, ctx.previousValue);
        syncActiveAttachmentValue(app, ctx.cellId, ctx.previousValue);
        revealAttachmentCell(app, ctx.sheetId, ctx.cellId);
        refreshAttachmentUi(app, ctx.sheetId);
        window.alert(
          error && error.message ? error.message : 'Failed to read file',
        );
      }
    });
  }

  var applyChannelBindingSelection = function () {
    if (!app.activeInput) {
      syncChannelBindingControl(app);
      return;
    }
    var channelLabel = normalizeChannelLabel(
      app.bindChannelSelect ? app.bindChannelSelect.value : '',
    );
    if (!channelLabel) {
      var existingRaw = String(
        app.formulaInput && app.formulaInput.value != null
          ? app.formulaInput.value
          : app.getRawCellValue(app.activeInput.id),
      );
      channelLabel = getBoundChannelLabel(app, existingRaw);
    }
    if (!channelLabel) {
      syncChannelBindingControl(app);
      return;
    }
    var selectedMode = app.bindChannelModeSelect
      ? String(app.bindChannelModeSelect.value || 'table').trim().toLowerCase()
      : 'table';
    var currentRaw = String(
      app.formulaInput && app.formulaInput.value != null
        ? app.formulaInput.value
        : app.getRawCellValue(app.activeInput.id),
    );
    var nextRaw = buildChannelBindingRaw(
      app,
      currentRaw,
      channelLabel,
      selectedMode,
    );
    if (nextRaw === currentRaw) {
      focusFormulaInputAtEnd(app);
      syncChannelBindingControl(app);
      return;
    }

    if (
      !Object.prototype.hasOwnProperty.call(
        app.editStartRawByCell,
        app.activeInput.id,
      )
    ) {
      app.editStartRawByCell[app.activeInput.id] = app.getRawCellValue(
        app.activeInput.id,
      );
    }
    app.activeInput.parentElement.classList.add('formula-bar-editing');
    app.grid.setEditing(app.activeInput, true);
    app.activeInput.value = nextRaw;
    if (app.formulaInput) {
      app.formulaInput.value = nextRaw;
    }
    app.commitFormulaBarValue();
    focusFormulaInputAtEnd(app);
    syncChannelBindingControl(app);
  };

  if (app.bindChannelSelect) {
    app.bindChannelSelect.addEventListener('change', applyChannelBindingSelection);
  }

  if (app.bindChannelModeSelect) {
    app.bindChannelModeSelect.addEventListener(
      'change',
      applyChannelBindingSelection,
    );
  }

  syncChannelBindingControl(app);
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
  var currentRaw =
    app && app.activeInput ? app.getRawCellValue(app.activeInput.id) : '';
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

export function readAttachedFileContent(app, file, preparedBase64) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    return Promise.reject(new Error('Failed to read file'));
  }
  var base64Promise =
    typeof preparedBase64 === 'string' && preparedBase64
      ? Promise.resolve(preparedBase64)
      : file.arrayBuffer().then((buffer) => arrayBufferToBase64(app, buffer));
  return base64Promise
    .then((base64) =>
      Meteor.callAsync(
        'files.extractContent',
        String(file.name || 'Attached file'),
        String(file.type || ''),
        base64,
      ),
    )
    .then((result) => ({
      content: String(result && result.content != null ? result.content : ''),
      contentArtifactId: String((result && result.contentArtifactId) || ''),
      binaryArtifactId: String((result && result.binaryArtifactId) || ''),
      downloadUrl: String((result && result.downloadUrl) || ''),
      previewUrl: String((result && result.previewUrl) || ''),
    }));
}

export function arrayBufferToBase64(app, buffer) {
  var bytes = new Uint8Array(buffer || new ArrayBuffer(0));
  var chunkSize = 0x8000;
  var binary = '';
  for (var i = 0; i < bytes.length; i += chunkSize) {
    var chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return window.btoa(binary);
}

export function ensureFloatingAttachmentPreview(app) {
  if (app.floatingAttachmentPreview) return app.floatingAttachmentPreview;
  var el = document.createElement('div');
  el.className = 'floating-attachment-preview';
  el.style.display = 'none';
  document.body.appendChild(el);
  app.floatingAttachmentPreview = el;
  return el;
}

export function setupAttachmentLinkPreview(app) {
  app.handleAttachmentPreviewMouseOver = (event) => {
    var target =
      event && event.target && event.target.closest
        ? event.target.closest(
            '.embedded-attachment-link.has-preview .embedded-attachment-open[data-preview-url]',
          )
        : null;
    if (!target) return;
    if (app.attachmentPreviewTimer) clearTimeout(app.attachmentPreviewTimer);
    app.attachmentPreviewTimer = setTimeout(() => {
      app.attachmentPreviewTimer = null;
      showFloatingAttachmentPreview(app, target);
    }, 500);
  };

  app.handleAttachmentPreviewMouseOut = (event) => {
    var target =
      event && event.target && event.target.closest
        ? event.target.closest(
            '.embedded-attachment-link.has-preview .embedded-attachment-open[data-preview-url]',
          )
        : null;
    if (!target) return;
    var related = event.relatedTarget;
    if (related && target.contains && target.contains(related)) return;
    if (app.attachmentPreviewTimer) {
      clearTimeout(app.attachmentPreviewTimer);
      app.attachmentPreviewTimer = null;
    }
    if (app.attachmentPreviewAnchor === target) {
      hideFloatingAttachmentPreview(app);
    }
  };

  app.handleAttachmentPreviewScroll = () => {
    if (!app.attachmentPreviewAnchor) return;
    positionFloatingAttachmentPreview(app, app.attachmentPreviewAnchor);
  };

  document.addEventListener(
    'mouseover',
    app.handleAttachmentPreviewMouseOver,
    true,
  );
  document.addEventListener(
    'mouseout',
    app.handleAttachmentPreviewMouseOut,
    true,
  );
  window.addEventListener('scroll', app.handleAttachmentPreviewScroll, true);
  window.addEventListener('resize', app.handleAttachmentPreviewScroll, true);
}

export function showFloatingAttachmentPreview(app, anchor) {
  if (!anchor) return;
  var previewUrl = String(anchor.getAttribute('data-preview-url') || '');
  var previewKind = String(anchor.getAttribute('data-preview-kind') || '');
  var previewName = String(
    anchor.getAttribute('data-preview-name') || 'attachment',
  );
  if (!previewUrl || !previewKind) return;

  var popup = ensureFloatingAttachmentPreview(app);
  var safeName = app.grid.escapeHtml(previewName);
  var safeUrl = app.grid.escapeHtml(previewUrl);
  var media =
    previewKind === 'pdf'
      ? "<iframe src='" +
        safeUrl +
        "' title='" +
        safeName +
        "' loading='lazy'></iframe>"
      : "<img src='" + safeUrl + "' alt='" + safeName + "' />";

  popup.innerHTML =
    '' +
    "<div class='floating-attachment-preview-media'>" +
    media +
    '</div>' +
    "<div class='floating-attachment-preview-actions'>" +
    "<a class='embedded-attachment-open' href='" +
    safeUrl +
    "' target='_blank' rel='noopener noreferrer'>Open</a>" +
    "<a class='embedded-attachment-download' href='" +
    safeUrl +
    "' download='" +
    safeName +
    "'>Download</a>" +
    '</div>';
  popup.style.display = 'block';
  app.attachmentPreviewAnchor = anchor;
  positionFloatingAttachmentPreview(app, anchor);
}

export function positionFloatingAttachmentPreview(app, anchor) {
  if (
    !anchor ||
    !app.floatingAttachmentPreview ||
    app.floatingAttachmentPreview.style.display === 'none'
  )
    return;
  var rect = anchor.getBoundingClientRect();
  var popup = app.floatingAttachmentPreview;
  var popupWidth = popup.offsetWidth || 320;
  var popupHeight = popup.offsetHeight || 280;
  var left = rect.left + window.scrollX;
  var top = rect.top + window.scrollY - popupHeight - 10;

  if (left + popupWidth > window.scrollX + window.innerWidth - 12) {
    left = window.scrollX + window.innerWidth - popupWidth - 12;
  }
  if (left < window.scrollX + 12) left = window.scrollX + 12;
  if (top < window.scrollY + 12) {
    top = rect.bottom + window.scrollY + 10;
  }

  popup.style.left = Math.round(left) + 'px';
  popup.style.top = Math.round(top) + 'px';
}

export function hideFloatingAttachmentPreview(app) {
  app.attachmentPreviewAnchor = null;
  if (!app.floatingAttachmentPreview) return;
  app.floatingAttachmentPreview.style.display = 'none';
  app.floatingAttachmentPreview.innerHTML = '';
}
