import { buildSimplePdfBase64 } from '../../../engine/pdf-utils.js';

export function getAttachmentDisplayLabel(attachment) {
  var meta = attachment && typeof attachment === 'object' ? attachment : {};
  var name = String(meta.name || '').trim();
  if (name) return name;
  if (meta.converting) return 'Converting file...';
  if (meta.pending) return 'Choose file';
  return 'Attached file';
}

export function getAttachmentStatusLabel(attachment) {
  var meta = attachment && typeof attachment === 'object' ? attachment : {};
  if (meta.converting) return 'Converting file...';
  if (meta.pending) return 'Choose file';
  return '';
}

export function renderAttachmentValue(grid, attachment) {
  var meta = attachment || {};
  var pending = !!meta.pending;
  var label = getAttachmentDisplayLabel(meta);
  var status = getAttachmentStatusLabel(meta);
  var name = grid.escapeHtml(String(label || ''));
  var previewUrl = String(meta.previewUrl || '');
  var downloadUrl = buildAttachmentHref(grid, meta);
  var hasDirectFileUrl = !!String(
    meta.downloadUrl || meta.previewUrl || meta.url || '',
  ).trim();
  var generated = meta.generated === true;
  var isImage =
    String(meta.type || '').toLowerCase().indexOf('image/') === 0 && !!previewUrl;
  if (pending) {
    var escapedStatus = grid.escapeHtml(String(status || 'Choose file'));
    var showSeparateStatus = !!String(meta.name || '').trim() && !!escapedStatus;
    return (
      "<div class='attachment-chip pending full' data-full-name='" +
      (name || 'Attached file') +
      "'><button type='button' class='attachment-select'>" +
      "<span class='attachment-select-icon' aria-hidden='true'>" +
      "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'>" +
      "<path d='m21.44 11.05-8.49 8.49a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.82l8.49-8.48' />" +
      '</svg>' +
      '</span>' +
      "<span class='attachment-select-text'>" +
      "<span class='attachment-select-label'>" +
      (name || escapedStatus) +
      '</span>' +
      (showSeparateStatus
        ? "<span class='attachment-select-status'>" + escapedStatus + '</span>'
        : '') +
      '</span>' +
      '</button></div>'
    );
  }
  if (generated && downloadUrl) {
    return renderStandardAttachmentChip(
      grid,
      meta,
      name,
      previewUrl,
      downloadUrl,
      hasDirectFileUrl,
      isImage,
    );
  }
  return renderStandardAttachmentChip(
    grid,
    meta,
    name,
    previewUrl,
    downloadUrl,
    hasDirectFileUrl,
    isImage,
  );
}

function renderStandardAttachmentChip(
  grid,
  meta,
  name,
  previewUrl,
  downloadUrl,
  hasDirectFileUrl,
  isImage,
) {
  var contentPreviewable =
    isImage || !!String(meta.content || '').trim();
  return (
    "<div class='attachment-chip" +
    (isImage ? ' has-image-preview has-inline-image' : '') +
    "' data-full-name='" +
    (name || 'Attached file') +
    "'>" +
    "<button type='button' class='attachment-select'" +
    (isImage
      ? " style=\"background-image:url('" +
        grid.escapeHtml(previewUrl) +
        "')\""
      : '') +
    '>' +
    "<span class='attachment-select-icon' aria-hidden='true'>" +
    "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'>" +
    "<path d='m21.44 11.05-8.49 8.49a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.82l8.49-8.48' />" +
    '</svg>' +
    '</span>' +
    "<span class='attachment-select-label'>" +
    (name || 'Attached file') +
    '</span>' +
    '</button>' +
    (isImage
      ? "<div class='attachment-image-preview'><img src='" +
        grid.escapeHtml(previewUrl) +
        "' alt='" +
        (name || 'Attached image') +
        "' /></div>"
      : '') +
    '</div>'
  );
}

export function renderDownloadAttachmentLink(grid, label, href) {
  var name = String(label || 'attachment');
  var safeName = grid.escapeHtml(name);
  var safeHref = grid.escapeHtml(String(href || ''));
  return (
    "<span class='embedded-attachment-link'><a class='embedded-attachment-download' href='" +
    safeHref +
    "' download='" +
    safeName +
    "'>" +
    safeName +
    '</a></span>'
  );
}

export function buildAttachmentHref(grid, attachment) {
  void grid;
  var meta = attachment || {};
  var directUrl = String(
    meta.downloadUrl || meta.previewUrl || meta.url || '',
  ).trim();
  if (directUrl) return directUrl;

  var content = meta.content;
  if (content == null || content === '') return '';

  var mimeType = String(meta.type || 'application/octet-stream').trim();
  var encoding = String(meta.encoding || 'utf8').trim().toLowerCase();
  if (String(meta.generatedAs || '').toUpperCase() === 'PDF') {
    if (encoding === 'base64') {
      return 'data:' + mimeType + ';base64,' + String(content);
    }
    return (
      'data:' +
      mimeType +
      ';base64,' +
      buildSimplePdfBase64(String(content))
    );
  }
  if (encoding === 'base64') {
    return 'data:' + mimeType + ';base64,' + String(content);
  }
  return 'data:' + mimeType + ';charset=utf-8,' + encodeURIComponent(String(content));
}

export function renderInternalAttachmentLink(grid, label, href) {
  var name = String(label || 'attachment');
  var safeName = grid.escapeHtml(name);
  var safeHref = grid.escapeHtml(String(href || ''));
  var lower = name.toLowerCase();
  var isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(lower);
  var isPdf = /\.pdf$/i.test(lower);

  if (isImage) {
    return (
      "<span class='embedded-attachment-link has-preview is-image'><a class='embedded-attachment-open' href='" +
      safeHref +
      "' target='_blank' rel='noopener noreferrer' data-preview-kind='image' data-preview-url='" +
      safeHref +
      "' data-preview-name='" +
      safeName +
      "'>" +
      safeName +
      '</a></span>'
    );
  }

  if (isPdf) {
    return (
      "<span class='embedded-attachment-link has-preview is-pdf'><a class='embedded-attachment-open' href='" +
      safeHref +
      "' target='_blank' rel='noopener noreferrer' data-preview-kind='pdf' data-preview-url='" +
      safeHref +
      "' data-preview-name='" +
      safeName +
      "'>" +
      safeName +
      '</a></span>'
    );
  }

  return (
    "<span class='embedded-attachment-link'><a class='embedded-attachment-open' href='" +
    safeHref +
    "' target='_blank' rel='noopener noreferrer'>" +
    safeName +
    "</a><a class='embedded-attachment-download' href='" +
    safeHref +
    "' download='" +
    safeName +
    "'>Download</a></span>"
  );
}
