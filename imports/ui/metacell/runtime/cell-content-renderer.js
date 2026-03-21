function getFontFamilyCssValue(fontFamily) {
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

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildAttachmentHref(attachment) {
  var meta = attachment || {};
  var directUrl = String(
    meta.downloadUrl || meta.previewUrl || meta.url || '',
  ).trim();
  if (directUrl) return directUrl;

  var content = meta.content;
  if (content == null || content === '') return '';

  var mimeType = String(meta.type || 'application/octet-stream').trim();
  var encoding = String(meta.encoding || 'utf8').trim().toLowerCase();
  if (encoding === 'base64') {
    return 'data:' + mimeType + ';base64,' + String(content);
  }
  return (
    'data:' +
    mimeType +
    ';charset=utf-8,' +
    encodeURIComponent(String(content))
  );
}

function renderGeneratedAttachmentCard(label, href, hasDirectFileUrl) {
  var name = String(label || 'attachment');
  var safeName = escapeHtml(name);
  var safeHref = escapeHtml(String(href || ''));
  var openAttrs = hasDirectFileUrl
    ? " target='_blank' rel='noopener noreferrer'"
    : '';

  return (
    "<span class='generated-attachment-card'>" +
    "<a class='generated-attachment-main' href='" +
    safeHref +
    "'" +
    openAttrs +
    (hasDirectFileUrl ? '' : " download='" + safeName + "'") +
    '>' +
    "<span class='generated-attachment-name'>" +
    safeName +
    '</span>' +
    '</a>' +
    "<a class='generated-attachment-download' href='" +
    safeHref +
    "' download='" +
    safeName +
    "' aria-label='Download " +
    safeName +
    "' title='Download " +
    safeName +
    "'>" +
    "<svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>" +
    "<path d='M12 3v11' />" +
    "<path d='m7 11 5 5 5-5' />" +
    "<path d='M5 21h14' />" +
    '</svg>' +
    '</a>' +
    "<button type='button' class='generated-attachment-content-preview' title='Show extracted content' aria-label='Show extracted content'>" +
    "<svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'>" +
    "<path d='M8 3H5a2 2 0 0 0-2 2v3'></path>" +
    "<path d='M16 3h3a2 2 0 0 1 2 2v3'></path>" +
    "<path d='M8 21H5a2 2 0 0 1-2-2v-3'></path>" +
    "<path d='M16 21h3a2 2 0 0 0 2-2v-3'></path>" +
    '</svg>' +
    '</button>' +
    '</span>'
  );
}

function renderAttachmentValue(attachment) {
  var meta = attachment || {};
  var pending = !!meta.pending;
  var name = escapeHtml(String(meta.name || ''));
  var previewUrl = String(meta.previewUrl || '');
  var downloadUrl = buildAttachmentHref(meta);
  var hasDirectFileUrl = !!String(
    meta.downloadUrl || meta.previewUrl || meta.url || '',
  ).trim();
  var generated = meta.generated === true;
  var isImage =
    String(meta.type || '')
      .toLowerCase()
      .indexOf('image/') === 0 && !!previewUrl;
  if (pending) {
    return (
      "<div class='attachment-chip pending full'><button type='button' class='attachment-select'>" +
      (meta.converting ? 'Converting the file...' : 'Choose file') +
      '</button></div>'
    );
  }
  if (generated && downloadUrl) {
    return renderGeneratedAttachmentCard(
      String(meta.name || 'Attached file'),
      downloadUrl,
      hasDirectFileUrl,
    );
  }
  return (
    "<div class='attachment-chip" +
    (downloadUrl ? ' has-download' : '') +
    " has-content-preview" +
    (isImage ? ' has-image-preview has-inline-image' : '') +
    "' data-full-name='" +
    (name || 'Attached file') +
    "'>" +
    "<button type='button' class='attachment-select'" +
    (isImage
      ? ' style="background-image:url(\'' +
        escapeHtml(previewUrl) +
        '\');"'
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
        escapeHtml(previewUrl) +
        "' alt='" +
        (name || 'Attached image') +
        "' /></div>"
      : '') +
    (downloadUrl
      ? "<a class='attachment-download' href='" +
        escapeHtml(downloadUrl) +
        "' download='" +
        (name || 'Attached file') +
        "' title='Download attachment' aria-label='Download attachment'>" +
        "<svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>" +
        "<path d='M12 3v11' />" +
        "<path d='m7 11 5 5 5-5' />" +
        "<path d='M5 21h14' />" +
        '</svg>' +
        '</a>'
      : '') +
    "<button type='button' class='attachment-content-preview' title='Show extracted content' aria-label='Show extracted content'>" +
    "<svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'>" +
    "<path d='M8 3H5a2 2 0 0 0-2 2v3'></path>" +
    "<path d='M16 3h3a2 2 0 0 1 2 2v3'></path>" +
    "<path d='M8 21H5a2 2 0 0 1-2-2v-3'></path>" +
    "<path d='M16 21h3a2 2 0 0 0 2-2v-3'></path>" +
    '</svg>' +
    '</button>' +
    "<button type='button' class='attachment-remove' title='Remove attachment'>×</button></div>"
  );
}

function renderInternalAttachmentLink(label, href) {
  var name = String(label || 'attachment');
  var safeName = escapeHtml(name);
  var safeHref = escapeHtml(String(href || ''));
  return (
    "<span class='embedded-attachment-link'>" +
    "<a class='embedded-attachment-download' href='" +
    safeHref +
    "' download='" +
    safeName +
    "'>" +
    safeName +
    '</a>' +
    '</span>'
  );
}

function parseTableRow(line) {
  var normalized = String(line || '').trim();
  if (normalized.charAt(0) === '|') normalized = normalized.substring(1);
  if (normalized.charAt(normalized.length - 1) === '|')
    normalized = normalized.substring(0, normalized.length - 1);
  return normalized.split('|').map(function (cell) {
    return cell.trim();
  });
}

function isMarkdownTableHeader(headerLine, separatorLine) {
  if (!headerLine || !separatorLine) return false;
  if (!/\|/.test(headerLine)) return false;
  return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(
    separatorLine,
  );
}

function renderMarkdownTable(lines) {
  if (!lines.length) return '';

  var headerCells = parseTableRow(lines[0]);
  var bodyRows = [];

  for (var i = 1; i < lines.length; i++) {
    bodyRows.push(parseTableRow(lines[i]));
  }

  var thead =
    '<thead><tr>' +
    headerCells
      .map(function (cell) {
        return '<th>' + renderInlineMarkdown(cell) + '</th>';
      })
      .join('') +
    '</tr></thead>';
  var tbody =
    '<tbody>' +
    bodyRows
      .map(function (row) {
        return (
          '<tr>' +
          row
            .map(function (cell) {
              return '<td>' + renderInlineMarkdown(cell) + '</td>';
            })
            .join('') +
          '</tr>'
        );
      })
      .join('') +
    '</tbody>';

  return "<table class='md-table'>" + thead + tbody + '</table>';
}

function renderInlineMarkdown(text) {
  var output = String(text || '');
  output = output.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
  output = output.replace(/^###\s+/, '');
  output = output.replace(/^##\s+/, '');
  output = output.replace(/^#\s+/, '');
  output = output.replace(
    /\[([^\]]+)\]\((\/channel-events\/[^)\s]+)\)/g,
    function (_, label, href) {
      return renderInternalAttachmentLink(label, href);
    },
  );
  output = output.replace(
    /`([^`]+)`/g,
    '<code>$1</code>',
  );
  output = output.replace(
    /\*\*([^*]+)\*\*/g,
    '<strong>$1</strong>',
  );
  output = output.replace(
    /\*([^*]+)\*/g,
    '<em>$1</em>',
  );
  output = output.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    "<a href='$2' target='_blank' rel='noopener noreferrer'>$1</a>",
  );
  return output;
}

export function renderMarkdown(value) {
  var text = escapeHtml(value == null ? '' : value).replace(/\r\n?/g, '\n');
  var lines = text.split('\n');
  var blocks = [];

  for (var i = 0; i < lines.length; i++) {
    var header = lines[i];
    var separator = lines[i + 1];

    if (isMarkdownTableHeader(header, separator)) {
      var tableLines = [header];
      i += 2;
      while (i < lines.length && /\|/.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      i--;
      blocks.push(renderMarkdownTable(tableLines));
    } else {
      blocks.push(renderInlineMarkdown(header));
    }
  }

  return blocks.join('<br>');
}

function renderAISkeletonHtml(variant) {
  var aiSkeletonVariant = String(variant || 'default');
  if (aiSkeletonVariant === 'table') {
    return (
      "<span class='cell-ai-skeleton cell-ai-skeleton-table' aria-hidden='true'>" +
      "<span class='cell-ai-skeleton-table-row'>" +
      "<span class='cell-ai-skeleton-block'></span>" +
      "<span class='cell-ai-skeleton-block'></span>" +
      "<span class='cell-ai-skeleton-block'></span>" +
      '</span>' +
      "<span class='cell-ai-skeleton-table-row'>" +
      "<span class='cell-ai-skeleton-block'></span>" +
      "<span class='cell-ai-skeleton-block'></span>" +
      "<span class='cell-ai-skeleton-block'></span>" +
      '</span>' +
      "<span class='cell-ai-skeleton-table-row'>" +
      "<span class='cell-ai-skeleton-block'></span>" +
      "<span class='cell-ai-skeleton-block'></span>" +
      "<span class='cell-ai-skeleton-block'></span>" +
      '</span>' +
      '</span>'
    );
  }
  return (
    "<span class='cell-ai-skeleton cell-ai-skeleton-list' aria-hidden='true'>" +
    "<span class='cell-ai-skeleton-line is-long'></span>" +
    "<span class='cell-ai-skeleton-line is-mid'></span>" +
    "<span class='cell-ai-skeleton-line is-short'></span>" +
    '</span>'
  );
}

export function applyCellContentToOutput(output, value, hasFormula, options) {
  if (!output) return;
  var opts = options || {};
  var aiSkeletonVariant = String(opts.aiSkeletonVariant || 'default');
  output.classList.toggle('formula-value', !!hasFormula);
  output.classList.toggle('error-value', !!opts.error);
  output.classList.toggle('numeric-value', !!opts.alignRight);
  output.classList.toggle('ai-skeleton-value', !!opts.aiSkeleton);
  output.classList.toggle(
    'ai-skeleton-list-value',
    !!opts.aiSkeleton && aiSkeletonVariant === 'list',
  );
  output.classList.toggle(
    'ai-skeleton-table-value',
    !!opts.aiSkeleton && aiSkeletonVariant === 'table',
  );
  output.style.backgroundColor = opts.backgroundColor
    ? String(opts.backgroundColor)
    : '';
  output.style.fontSize = opts.fontSize ? String(opts.fontSize) + 'px' : '';
  output.style.fontFamily = getFontFamilyCssValue(opts.fontFamily);

  if (opts.attachment) {
    output.innerHTML = renderAttachmentValue(opts.attachment);
  } else if (opts.aiSkeleton) {
    output.innerHTML = renderAISkeletonHtml(aiSkeletonVariant);
  } else {
    output.innerHTML = opts.literal
      ? escapeHtml(value == null ? '' : value).replace(/\r\n?/g, '<br>')
      : renderMarkdown(value);
  }
}

export function applyCellInputTypography(input, options) {
  if (!input) return;
  var opts = options || {};
  input.style.fontSize = opts.fontSize ? String(opts.fontSize) + 'px' : '';
  input.style.fontFamily = getFontFamilyCssValue(opts.fontFamily);
}
