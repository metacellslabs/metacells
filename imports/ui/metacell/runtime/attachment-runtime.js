import { rpc } from '../../../../lib/rpc-client.js';

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
      var selectButton =
        e.target && e.target.closest
          ? e.target.closest('.attachment-select')
          : null;
      var removeButton =
        e.target && e.target.closest
          ? e.target.closest('.attachment-remove')
          : null;
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
      rpc(
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
