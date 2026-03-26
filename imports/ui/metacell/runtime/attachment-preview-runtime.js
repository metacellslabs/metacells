import { rpc } from '../../../../lib/rpc-client.js';
import { buildAttachmentHref } from './attachment-render-runtime.js';

function getVisibleSheetId(app) {
  return typeof app.getVisibleSheetId === 'function'
    ? String(app.getVisibleSheetId() || '')
    : String(app.activeSheetId || '');
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

function publishAttachmentUiState(app) {
  if (app && typeof app.publishUiState === 'function') {
    app.publishUiState();
  }
}

function getAttachmentPreviewKind(attachment) {
  var source = attachment && typeof attachment === 'object' ? attachment : {};
  var type = String(source.type || '').toLowerCase();
  var name = String(source.name || '').toLowerCase();
  if (type.indexOf('image/') === 0 || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)) {
    return 'image';
  }
  if (type === 'application/pdf' || /\.pdf$/i.test(name)) {
    return 'pdf';
  }
  return '';
}

export function canPreviewAttachmentFile(attachment) {
  var kind = getAttachmentPreviewKind(attachment);
  return kind === 'image' || kind === 'pdf';
}

export function hideAttachmentContentOverlay(app) {
  if (!app) return;
  app.attachmentContentUiState = null;
  publishAttachmentUiState(app);
}

async function loadAttachmentContentText(attachment) {
  var source = attachment && typeof attachment === 'object' ? attachment : {};
  var inlineContent = String(source.content || '');
  if (inlineContent && String(source.encoding || 'utf8').toLowerCase() !== 'base64') {
    return inlineContent;
  }
  var artifactId = String(source.contentArtifactId || '').trim();
  if (!artifactId) return '';
  var artifact = await rpc('artifacts.get', artifactId);
  if (!artifact || String(artifact.kind || '') !== 'text') return '';
  return String(artifact.text || '');
}

export async function openAttachmentContentPreview(app, sheetId, cellId) {
  var attachment = resolveCellAttachment(app, sheetId, cellId);
  if (!attachment) return;
  var name = String(attachment.name || 'Attached file');
  app.attachmentContentUiState = {
    open: true,
    title: name,
    body: 'Loading...',
  };
  publishAttachmentUiState(app);
  try {
    var text = await loadAttachmentContentText(attachment);
    app.attachmentContentUiState = {
      open: true,
      title: name,
      body: text || 'No extracted text content is available for this attachment.',
    };
    publishAttachmentUiState(app);
  } catch (error) {
    app.attachmentContentUiState = {
      open: true,
      title: name,
      body: String(
        (error && (error.reason || error.message)) ||
          'Failed to load extracted content',
      ).trim(),
    };
    publishAttachmentUiState(app);
  }
}

export function openAttachmentFilePreview(app, sheetId, cellId, anchor) {
  var attachment = resolveCellAttachment(app, sheetId, cellId);
  if (!attachment) return;
  var previewKind = getAttachmentPreviewKind(attachment);
  if (!previewKind) return;
  var previewUrl = buildAttachmentHref(app && app.grid, attachment);
  if (!String(previewUrl || '').trim()) return;

  var left = 24;
  var top = 24;
  if (anchor && anchor.getBoundingClientRect) {
    var rect = anchor.getBoundingClientRect();
    var popupWidth = 320;
    var popupHeight = 280;
    left = rect.left + window.scrollX;
    top = rect.top + window.scrollY - popupHeight - 10;
    if (left + popupWidth > window.scrollX + window.innerWidth - 12) {
      left = window.scrollX + window.innerWidth - popupWidth - 12;
    }
    if (left < window.scrollX + 12) left = window.scrollX + 12;
    if (top < window.scrollY + 12) {
      top = rect.bottom + window.scrollY + 10;
    }
  } else {
    left = window.scrollX + Math.max(12, Math.round((window.innerWidth - 320) / 2));
    top = window.scrollY + Math.max(12, Math.round((window.innerHeight - 280) / 6));
  }

  app.floatingAttachmentPreviewUiState = {
    open: true,
    left: Math.round(left),
    top: Math.round(top),
    previewUrl: String(previewUrl || ''),
    previewKind: previewKind,
    previewName: String(attachment.name || 'attachment'),
  };
  publishAttachmentUiState(app);
}

export function ensureFloatingAttachmentPreview(app) {
  if (!app.floatingAttachmentPreviewUiState) {
    app.floatingAttachmentPreviewUiState = null;
  }
  return app.floatingAttachmentPreviewUiState;
}

export function setupAttachmentLinkPreview(app) {
  if (!app.handleAttachmentContentOverlayKeydown) {
    app.handleAttachmentContentOverlayKeydown = function (event) {
      if (event.key !== 'Escape') return;
      if (app.attachmentContentUiState && app.attachmentContentUiState.open) {
        event.preventDefault();
        hideAttachmentContentOverlay(app);
        return;
      }
      if (app.floatingAttachmentPreviewUiState) {
        event.preventDefault();
        hideFloatingAttachmentPreview(app);
      }
    };
    document.addEventListener('keydown', app.handleAttachmentContentOverlayKeydown);
  }
  app.handleAttachmentPreviewMouseOver = function (event) {
    var target =
      event && event.target && event.target.closest
        ? event.target.closest(
            '.embedded-attachment-link.has-preview .embedded-attachment-open[data-preview-url]',
          )
        : null;
    if (!target) return;
    if (app.attachmentPreviewTimer) clearTimeout(app.attachmentPreviewTimer);
    app.attachmentPreviewTimer = setTimeout(function () {
      app.attachmentPreviewTimer = null;
      showFloatingAttachmentPreview(app, target);
    }, 500);
  };

  app.handleAttachmentPreviewMouseOut = function (event) {
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

  app.handleAttachmentPreviewScroll = function () {
    if (!app.attachmentPreviewAnchor) return;
    positionFloatingAttachmentPreview(app, app.attachmentPreviewAnchor);
  };

  document.addEventListener('mouseover', app.handleAttachmentPreviewMouseOver, true);
  document.addEventListener('mouseout', app.handleAttachmentPreviewMouseOut, true);
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

  ensureFloatingAttachmentPreview(app);
  app.attachmentPreviewAnchor = anchor;
  positionFloatingAttachmentPreview(app, anchor);
}

export function positionFloatingAttachmentPreview(app, anchor) {
  if (!anchor) {
    return;
  }
  var rect = anchor.getBoundingClientRect();
  var popupWidth = 320;
  var popupHeight = 280;
  var left = rect.left + window.scrollX;
  var top = rect.top + window.scrollY - popupHeight - 10;

  if (left + popupWidth > window.scrollX + window.innerWidth - 12) {
    left = window.scrollX + window.innerWidth - popupWidth - 12;
  }
  if (left < window.scrollX + 12) left = window.scrollX + 12;
  if (top < window.scrollY + 12) {
    top = rect.bottom + window.scrollY + 10;
  }

  app.floatingAttachmentPreviewUiState = {
    open: true,
    left: Math.round(left),
    top: Math.round(top),
    previewUrl: String(anchor.getAttribute('data-preview-url') || ''),
    previewKind: String(anchor.getAttribute('data-preview-kind') || ''),
    previewName: String(
      anchor.getAttribute('data-preview-name') || 'attachment',
    ),
  };
  publishAttachmentUiState(app);
}

export function hideFloatingAttachmentPreview(app) {
  app.attachmentPreviewAnchor = null;
  if (!app) return;
  app.floatingAttachmentPreviewUiState = null;
  publishAttachmentUiState(app);
}

export function getVisibleAttachmentSheetId(app) {
  return getVisibleSheetId(app);
}
