// Description: Grid/table rendering, resizing, keyboard navigation, fill-handle support, and markdown cell display.
import { MIN_COL_WIDTH } from './constants.js';

export class GridManager {
  constructor(tableElement, rows, cols, defaultColWidth, defaultRowHeight) {
    this.table = tableElement;
    this.rows = rows;
    this.cols = cols;
    this.defaultColWidth = defaultColWidth;
    this.defaultRowHeight = defaultRowHeight;
    this.columnResizeGuide = null;

    this.buildGrid();
    this.fitRowHeaderColumnWidth();
  }

  buildGrid() {
    for (var i = 0; i < this.rows; i++) {
      var row = this.table.insertRow(-1);
      for (var j = 0; j < this.cols; j++) {
        var letter = String.fromCharCode('A'.charCodeAt(0) + j - 1);
        row.insertCell(-1).innerHTML =
          i && j
            ? "<div class='cell-output'></div><div class='cell-status' aria-hidden='true'></div><input id='" +
              letter +
              i +
              "'/><div class='cell-actions'><button type='button' class='cell-action' data-action='copy' title='Copy value'>⧉</button><button type='button' class='cell-action' data-action='fullscreen' title='Fullscreen'>⤢</button><button type='button' class='cell-action' data-action='run' title='Run formula'>▶</button></div><div class='fill-handle'></div>"
            : i || letter;
      }
    }
  }

  getInputs() {
    return [].slice.call(this.table.querySelectorAll('input'));
  }

  fitRowHeaderColumnWidth() {
    if (!this.table || !this.table.rows || !this.table.rows.length) return;
    var maxLabel = String(Math.max(1, this.rows - 1));
    var digits = maxLabel.length;
    var width = Math.max(28, 10 + digits * 8);

    for (var r = 0; r < this.table.rows.length; r++) {
      var cell = this.table.rows[r].cells[0];
      if (!cell) continue;
      cell.style.width = width + 'px';
      cell.style.minWidth = width + 'px';
    }
  }

  setColumnWidth(colIndex, width) {
    var finalWidth = Math.max(MIN_COL_WIDTH, width);
    for (var r = 0; r < this.table.rows.length; r++) {
      this.table.rows[r].cells[colIndex].style.width = finalWidth + 'px';
    }
    return finalWidth;
  }

  setRowHeight(rowIndex, height) {
    var finalHeight = Math.max(this.defaultRowHeight, height);
    var row = this.table.rows[rowIndex];
    for (var c = 0; c < row.cells.length; c++) {
      row.cells[c].style.height = finalHeight + 'px';
    }
    return finalHeight;
  }

  applySavedSizes(getColumnWidth, getRowHeight) {
    for (
      var colIndex = 1;
      colIndex < this.table.rows[0].cells.length;
      colIndex++
    ) {
      this.setColumnWidth(colIndex, this.defaultColWidth);
      var colWidth = getColumnWidth(colIndex);
      if (colWidth != null) this.setColumnWidth(colIndex, colWidth);
    }

    for (var rowIndex = 1; rowIndex < this.table.rows.length; rowIndex++) {
      this.setRowHeight(rowIndex, this.defaultRowHeight);
      var rowHeight = getRowHeight(rowIndex);
      if (rowHeight != null) this.setRowHeight(rowIndex, rowHeight);
    }

    this.updateTableSize();
  }

  resetColumnWidths(clearColumnWidth) {
    for (
      var colIndex = 1;
      colIndex < this.table.rows[0].cells.length;
      colIndex++
    ) {
      clearColumnWidth(colIndex);
      this.setColumnWidth(colIndex, this.defaultColWidth);
    }
    this.updateTableSize();
  }

  installResizeHandles(onColumnResize, onRowResize) {
    var headerRow = this.table.rows[0];

    for (var colIndex = 1; colIndex < headerRow.cells.length; colIndex++) {
      var colHeader = headerRow.cells[colIndex];
      colHeader.classList.add('col-header');

      var colHandle = document.createElement('div');
      colHandle.className = 'col-resize-handle';
      colHeader.appendChild(colHandle);

      ((index) => {
        colHandle.addEventListener('mousedown', (e) => {
          e.preventDefault();
          var startX = e.clientX;
          var startWidth = this.table.rows[0].cells[index].offsetWidth;
          var startTableWidth =
            this.table.offsetWidth || this.table.scrollWidth || 0;
          var didResize = false;
          var rafId = 0;
          var pendingClientX = startX;
          var flushResize = () => {
            rafId = 0;
            var deltaX = pendingClientX - startX;
            var finalWidth = this.setColumnWidth(index, startWidth + deltaX);
            onColumnResize(index, finalWidth);
            this.table.style.width =
              Math.max(0, startTableWidth + deltaX) + 'px';
            didResize = true;
          };
          this.showColumnResizeGuide(e.clientX);

          var onMove = (moveEvent) => {
            pendingClientX = moveEvent.clientX;
            this.moveColumnResizeGuide(moveEvent.clientX);
            if (!rafId) {
              rafId = requestAnimationFrame(flushResize);
            }
          };

          var onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (rafId) {
              cancelAnimationFrame(rafId);
              flushResize();
            }
            this.hideColumnResizeGuide();
            if (didResize) this.updateTableSize();
          };

          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });

        colHandle.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
          var fittedWidth = this.autoFitColumnWidth(index);
          onColumnResize(index, fittedWidth);
          this.updateTableSize();
        });
      })(colIndex);
    }

    for (var rowIndex = 1; rowIndex < this.table.rows.length; rowIndex++) {
      var rowHeader = this.table.rows[rowIndex].cells[0];
      rowHeader.classList.add('row-header');

      var rowHandle = document.createElement('div');
      rowHandle.className = 'row-resize-handle';
      rowHeader.appendChild(rowHandle);

      ((index) => {
        rowHandle.addEventListener('mousedown', (e) => {
          e.preventDefault();
          var startY = e.clientY;
          var startHeight = this.table.rows[index].offsetHeight;

          var onMove = (moveEvent) => {
            var finalHeight = this.setRowHeight(
              index,
              startHeight + (moveEvent.clientY - startY),
            );
            onRowResize(index, finalHeight);
            this.updateTableSize();
          };

          var onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          };

          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });
      })(rowIndex);
    }
  }

  autoFitColumnWidth(colIndex) {
    var maxWidth = MIN_COL_WIDTH;

    for (var rowIndex = 0; rowIndex < this.table.rows.length; rowIndex++) {
      var cell =
        this.table.rows[rowIndex] && this.table.rows[rowIndex].cells[colIndex];
      if (!cell) continue;
      maxWidth = Math.max(maxWidth, this.measureCellPreferredWidth(cell));
    }

    return this.setColumnWidth(
      colIndex,
      Math.min(Math.max(maxWidth, MIN_COL_WIDTH), 640),
    );
  }

  measureCellPreferredWidth(cell) {
    var probe = cell.cloneNode(true);
    probe.style.position = 'fixed';
    probe.style.left = '-99999px';
    probe.style.top = '0';
    probe.style.width = 'auto';
    probe.style.minWidth = '0';
    probe.style.maxWidth = 'none';
    probe.style.height = 'auto';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.whiteSpace = 'nowrap';
    probe.style.overflow = 'visible';

    var input = probe.querySelector('input');
    if (input) {
      input.style.position = 'static';
      input.style.width = 'auto';
      input.style.minWidth = '0';
      input.style.height = 'auto';
      input.style.pointerEvents = 'none';
    }

    var output = probe.querySelector('.cell-output');
    if (output) {
      output.style.position = 'static';
      output.style.width = 'auto';
      output.style.minWidth = '0';
      output.style.maxWidth = 'none';
      output.style.height = 'auto';
      output.style.overflow = 'visible';
      output.style.whiteSpace = 'nowrap';
    }

    document.body.appendChild(probe);
    var measured =
      Math.ceil(
        Math.max(
          probe.scrollWidth || 0,
          probe.offsetWidth || 0,
          cell.scrollWidth || 0,
        ),
      ) + 12;
    probe.remove();
    return measured;
  }

  ensureColumnResizeGuide() {
    if (
      this.columnResizeGuide &&
      document.body.contains(this.columnResizeGuide)
    ) {
      return this.columnResizeGuide;
    }
    var guide = document.createElement('div');
    guide.className = 'column-resize-guide';
    document.body.appendChild(guide);
    this.columnResizeGuide = guide;
    return guide;
  }

  showColumnResizeGuide(clientX) {
    var guide = this.ensureColumnResizeGuide();
    guide.style.left = Math.round(clientX) + 'px';
    guide.style.display = 'block';
  }

  moveColumnResizeGuide(clientX) {
    if (!this.columnResizeGuide) return;
    this.columnResizeGuide.style.left = Math.round(clientX) + 'px';
  }

  hideColumnResizeGuide() {
    if (!this.columnResizeGuide) return;
    this.columnResizeGuide.style.display = 'none';
  }

  updateTableSize() {
    if (!this.table.rows.length) return;

    var totalWidth = 0;
    var headerRow = this.table.rows[0];
    for (var c = 0; c < headerRow.cells.length; c++) {
      totalWidth += headerRow.cells[c].offsetWidth;
    }

    var totalHeight = 0;
    for (var r = 0; r < this.table.rows.length; r++) {
      totalHeight += this.table.rows[r].offsetHeight;
    }

    this.table.style.width = totalWidth + 'px';
    this.table.style.height = totalHeight + 'px';
  }

  setEditing(input, editing) {
    input.classList.toggle('editing', editing);
    input.parentElement.classList.toggle('editing', editing);
  }

  focusCellByArrow(input, key) {
    var movement = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    }[key];

    if (!movement) return false;

    var td = input.parentElement;
    var row = td.parentElement;
    var nextRowIndex = row.rowIndex + movement[0];
    var nextCellIndex = td.cellIndex + movement[1];

    if (nextRowIndex < 1 || nextCellIndex < 1) return true;
    if (nextRowIndex >= this.table.rows.length) return true;
    if (nextCellIndex >= this.table.rows[nextRowIndex].cells.length)
      return true;

    var nextInput =
      this.table.rows[nextRowIndex].cells[nextCellIndex].querySelector('input');
    if (nextInput) nextInput.focus();
    return true;
  }

  renderCellValue(input, value, isEditing, hasFormula, options) {
    if (!isEditing) input.value = value;
    input.parentElement.dataset.computedValue =
      value == null ? '' : String(value);

    var output = input.parentElement.querySelector('.cell-output');
    var statusNode = input.parentElement.querySelector('.cell-status');
    var opts = options || {};
    if (output) {
      output.classList.toggle('formula-value', !!hasFormula);
      output.classList.toggle('error-value', !!opts.error);
      output.classList.toggle('numeric-value', !!opts.alignRight);
      output.style.backgroundColor = opts.backgroundColor
        ? String(opts.backgroundColor)
        : '';
      output.style.fontSize = opts.fontSize ? String(opts.fontSize) + 'px' : '';
      output.style.fontFamily = getFontFamilyCssValue(opts.fontFamily);
      if (opts.attachment) {
        output.innerHTML = this.renderAttachmentValue(opts.attachment);
      } else {
        output.innerHTML = opts.literal
          ? this.escapeHtml(value == null ? '' : value).replace(
              /\r\n?/g,
              '<br>',
            )
          : this.renderMarkdown(value);
      }
    }
    input.style.fontSize = opts.fontSize ? String(opts.fontSize) + 'px' : '';
    input.style.fontFamily = getFontFamilyCssValue(opts.fontFamily);
    input.parentElement.style.setProperty(
      '--cell-bg',
      opts.backgroundColor ? String(opts.backgroundColor) : '#fff',
    );
    input.parentElement.classList.toggle('display-numeric', !!opts.alignRight);
    input.parentElement.classList.toggle(
      'display-align-left',
      opts.align === 'left',
    );
    input.parentElement.classList.toggle(
      'display-align-center',
      opts.align === 'center',
    );
    input.parentElement.classList.toggle(
      'display-align-right',
      opts.align === 'right',
    );
    input.parentElement.classList.toggle('display-wrap', !!opts.wrapText);
    input.parentElement.classList.toggle('display-bold', !!opts.bold);
    input.parentElement.classList.toggle('display-italic', !!opts.italic);
    var borders = opts.borders || {};
    input.parentElement.classList.toggle(
      'display-border-top',
      borders.top === true,
    );
    input.parentElement.classList.toggle(
      'display-border-right',
      borders.right === true,
    );
    input.parentElement.classList.toggle(
      'display-border-bottom',
      borders.bottom === true,
    );
    input.parentElement.classList.toggle(
      'display-border-left',
      borders.left === true,
    );
    if (statusNode) {
      var nextState = hasFormula ? String(opts.state || '') : '';
      var title = '';
      if (nextState === 'pending' || nextState === 'stale') {
        title = nextState === 'stale' ? 'Waiting for recompute' : 'Computing';
      } else if (nextState === 'resolved') {
        title = 'Computed';
      } else if (nextState === 'error') {
        title = 'Error';
      }
      if (nextState === 'pending' || nextState === 'stale') {
        statusNode.innerHTML =
          "<svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10' stroke-dasharray='3 3' /><path d='M12 6v6l4 2' /></svg>";
      } else if (nextState === 'resolved') {
        statusNode.innerHTML =
          "<svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M20 6 9 17l-5-5' /></svg>";
      } else if (nextState === 'error') {
        statusNode.innerHTML =
          "<svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z' /><path d='M12 9v4' /><path d='M12 17h.01' /></svg>";
      } else {
        statusNode.innerHTML = '';
      }
      statusNode.className =
        'cell-status' + (nextState ? ' is-' + nextState : '');
      if (title) statusNode.setAttribute('title', title);
      else statusNode.removeAttribute('title');
    }
  }

  renderAttachmentValue(attachment) {
    var meta = attachment || {};
    var pending = !!meta.pending;
    var name = this.escapeHtml(String(meta.name || ''));
    var previewUrl = String(meta.previewUrl || '');
    var isImage =
      String(meta.type || '')
        .toLowerCase()
        .indexOf('image/') === 0 && !!previewUrl;
    if (pending) {
      return "<div class='attachment-chip pending full'><button type='button' class='attachment-select'>Choose file</button></div>";
    }
    return (
      "<div class='attachment-chip" +
      (isImage ? ' has-image-preview has-inline-image' : '') +
      "' data-full-name='" +
      (name || 'Attached file') +
      "'>" +
      "<button type='button' class='attachment-select'" +
      (isImage
        ? ' style="background-image:url(\'' +
          this.escapeHtml(previewUrl) +
          '\');"'
        : '') +
      '>' +
      "<span class='attachment-select-label'>" +
      (name || 'Attached file') +
      '</span>' +
      '</button>' +
      (isImage
        ? "<div class='attachment-image-preview'><img src='" +
          this.escapeHtml(previewUrl) +
          "' alt='" +
          (name || 'Attached image') +
          "' /></div>"
        : '') +
      "<button type='button' class='attachment-remove' title='Remove attachment'>×</button></div>"
    );
  }

  renderMarkdown(value) {
    var text = this.escapeHtml(value == null ? '' : value).replace(
      /\r\n?/g,
      '\n',
    );
    var lines = text.split('\n');
    var blocks = [];

    for (var i = 0; i < lines.length; i++) {
      var header = lines[i];
      var separator = lines[i + 1];

      if (this.isMarkdownTableHeader(header, separator)) {
        var tableLines = [header];
        i += 2;
        while (i < lines.length && /\|/.test(lines[i])) {
          tableLines.push(lines[i]);
          i++;
        }
        i--;
        blocks.push(this.renderMarkdownTable(tableLines));
      } else {
        blocks.push(this.renderInlineMarkdown(header));
      }
    }

    return blocks.join('<br>');
  }

  isMarkdownTableHeader(headerLine, separatorLine) {
    if (!headerLine || !separatorLine) return false;
    if (!/\|/.test(headerLine)) return false;
    return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(
      separatorLine,
    );
  }

  renderMarkdownTable(lines) {
    if (!lines.length) return '';

    var headerCells = this.parseTableRow(lines[0]);
    var bodyRows = [];

    for (var i = 1; i < lines.length; i++) {
      bodyRows.push(this.parseTableRow(lines[i]));
    }

    var thead =
      '<thead><tr>' +
      headerCells
        .map((cell) => '<th>' + this.renderInlineMarkdown(cell) + '</th>')
        .join('') +
      '</tr></thead>';
    var tbody =
      '<tbody>' +
      bodyRows
        .map((row) => {
          return (
            '<tr>' +
            row
              .map((cell) => '<td>' + this.renderInlineMarkdown(cell) + '</td>')
              .join('') +
            '</tr>'
          );
        })
        .join('') +
      '</tbody>';

    return "<table class='md-table'>" + thead + tbody + '</table>';
  }

  parseTableRow(line) {
    var normalized = String(line || '').trim();
    if (normalized.charAt(0) === '|') normalized = normalized.substring(1);
    if (normalized.charAt(normalized.length - 1) === '|')
      normalized = normalized.substring(0, normalized.length - 1);
    return normalized.split('|').map(function (cell) {
      return cell.trim();
    });
  }

  renderInlineMarkdown(text) {
    var output = String(text || '');
    output = output.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
    output = output.replace(/^###\s+/, '');
    output = output.replace(/^##\s+/, '');
    output = output.replace(/^#\s+/, '');
    output = output.replace(
      /\[([^\]]+)\]\((\/channel-events\/[^)\s]+)\)/g,
      (_, label, href) => this.renderInternalAttachmentLink(label, href),
    );
    output = output.replace(
      /\[([^\]]+)\]\(((?:https?:\/\/|data:|blob:|\/)[^\s)]+)\)/g,
      "<a href='$2' target='_blank' rel='noopener noreferrer'>$1</a>",
    );
    output = output.replace(/`([^`]+)`/g, '<code>$1</code>');
    output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    output = output.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    return output;
  }

  renderInternalAttachmentLink(label, href) {
    var name = String(label || 'attachment');
    var safeName = this.escapeHtml(name);
    var safeHref = this.escapeHtml(String(href || ''));
    var lower = name.toLowerCase();
    var isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(lower);
    var isPdf = /\.pdf$/i.test(lower);

    if (isImage) {
      return (
        "<span class='embedded-attachment-link has-preview is-image'>" +
        "<a class='embedded-attachment-open' href='" +
        safeHref +
        "' target='_blank' rel='noopener noreferrer' data-preview-kind='image' data-preview-url='" +
        safeHref +
        "' data-preview-name='" +
        safeName +
        "'>" +
        safeName +
        '</a>' +
        '</span>'
      );
    }

    if (isPdf) {
      return (
        "<span class='embedded-attachment-link has-preview is-pdf'>" +
        "<a class='embedded-attachment-open' href='" +
        safeHref +
        "' target='_blank' rel='noopener noreferrer' data-preview-kind='pdf' data-preview-url='" +
        safeHref +
        "' data-preview-name='" +
        safeName +
        "'>" +
        safeName +
        '</a>' +
        '</span>'
      );
    }

    return (
      "<span class='embedded-attachment-link'>" +
      "<a class='embedded-attachment-open' href='" +
      safeHref +
      "' target='_blank' rel='noopener noreferrer'>" +
      safeName +
      '</a>' +
      "<a class='embedded-attachment-download' href='" +
      safeHref +
      "' download='" +
      safeName +
      "'>Download</a>" +
      '</span>'
    );
  }

  escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

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
      return '';
  }
}
