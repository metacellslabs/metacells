// Description: Grid/table rendering, resizing, keyboard navigation, fill-handle support, and markdown cell display.
import {
  buildAttachmentHref,
  renderAttachmentValue,
  renderDownloadAttachmentLink,
  renderInternalAttachmentLink,
} from './attachment-render-runtime.js';
import {
  getDirectGridCellChild,
  getGridCellFocusProxy,
} from './grid-cell-runtime.js';
import {
  focusGridCellByArrow,
  setGridCellEditing,
} from './grid-navigation-runtime.js';
import {
  autoFitGridColumnWidth,
  hideGridColumnResizeGuide,
  measureGridCellPreferredWidth,
  moveGridColumnResizeGuide,
  setColumnWidthFromGuide,
  showGridColumnResizeGuide,
} from './grid-resize-runtime.js';
import {
  appendGridColumns,
  appendGridRows,
  buildGridSurface,
  fitGridRowHeaderColumnWidth,
  installGridResizeHandles,
  stabilizeGridHeaderMetrics,
} from './grid-surface-runtime.js';
import {
  applyGridSavedSizes,
  lockGridColumnWidths,
  resetGridColumnWidths,
  setGridColumnWidth,
  setGridRowHeight,
  updateGridTableSize,
} from './grid-size-runtime.js';

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
    this.stabilizeHeaderMetrics();
  }

  buildGrid() {
    buildGridSurface(this);
  }

  appendRows(startRowIndex, endRowIndex) {
    appendGridRows(this, startRowIndex, endRowIndex);
  }

  appendColumns(startColIndex, endColIndex) {
    appendGridColumns(this, startColIndex, endColIndex);
  }

  getInputs() {
    return [].slice.call(this.table.querySelectorAll('.cell-anchor-input'));
  }

  getInputByCoords(rowIndex, colIndex) {
    if (typeof this.resolveInputByCoords === 'function') {
      var resolvedInput = this.resolveInputByCoords(rowIndex, colIndex);
      if (resolvedInput) return resolvedInput;
    }
    if (
      !this.table ||
      !this.table.rows ||
      !this.table.rows[rowIndex] ||
      !this.table.rows[rowIndex].cells[colIndex]
    ) {
      return null;
    }
    return this.table.rows[rowIndex].cells[colIndex].querySelector(
      '.cell-anchor-input',
    );
  }

  getGridBounds() {
    if (typeof this.resolveGridBounds === 'function') {
      var resolvedBounds = this.resolveGridBounds();
      if (resolvedBounds) return resolvedBounds;
    }
    if (!this.table || !this.table.rows || !this.table.rows.length) {
      return { rows: 0, cols: 0 };
    }
    return {
      rows: Math.max(0, this.table.rows.length - 1),
      cols: Math.max(0, this.table.rows[0].cells.length - 1),
    };
  }

  getTableRow(rowIndex) {
    if (!this.table || !this.table.rows) return null;
    if (!Number.isFinite(rowIndex) || rowIndex < 0) return null;
    return this.table.rows[rowIndex] || null;
  }

  getHeaderCell(colIndex) {
    var headerRow = this.getTableRow(0);
    if (!headerRow || !headerRow.cells) return null;
    if (!Number.isFinite(colIndex) || colIndex < 0) return null;
    return headerRow.cells[colIndex] || null;
  }

  getRowHeaderCell(rowIndex) {
    var row = this.getTableRow(rowIndex);
    if (!row || !row.cells) return null;
    return row.cells[0] || null;
  }

  getFocusProxy(input) {
    return getGridCellFocusProxy(input);
  }

  fitRowHeaderColumnWidth() {
    fitGridRowHeaderColumnWidth(this);
  }

  stabilizeHeaderMetrics() {
    stabilizeGridHeaderMetrics(this);
  }

  setColumnWidth(colIndex, width) {
    return setGridColumnWidth(this, colIndex, width);
  }

  lockAllColumnWidths() {
    lockGridColumnWidths(this);
  }

  setColumnWidthFromGuide(colIndex, guideLeftX, columnLeftX) {
    return setColumnWidthFromGuide(this, colIndex, guideLeftX, columnLeftX);
  }

  setRowHeight(rowIndex, height) {
    return setGridRowHeight(this, rowIndex, height);
  }

  applySavedSizes(getColumnWidth, getRowHeight) {
    applyGridSavedSizes(this, getColumnWidth, getRowHeight);
  }

  resetColumnWidths(clearColumnWidth) {
    resetGridColumnWidths(this, clearColumnWidth);
  }

  installResizeHandles(onColumnResize, onRowResize, options) {
    installGridResizeHandles(this, onColumnResize, onRowResize, options);
  }

  autoFitColumnWidth(colIndex) {
    return autoFitGridColumnWidth(this, colIndex);
  }

  measureCellPreferredWidth(cell) {
    return measureGridCellPreferredWidth(cell);
  }

  showColumnResizeGuide(clientX) {
    showGridColumnResizeGuide(this, clientX);
  }

  moveColumnResizeGuide(clientX) {
    moveGridColumnResizeGuide(this, clientX);
  }

  hideColumnResizeGuide() {
    hideGridColumnResizeGuide(this);
  }

  updateTableSize() {
    updateGridTableSize(this);
  }

  setEditing(input, editing) {
    setGridCellEditing(this, input, editing);
  }

  focusCellByArrow(input, key) {
    return focusGridCellByArrow(this, input, key);
  }

  renderCellValue(input, value, isEditing, hasFormula, options) {
    if (!isEditing) input.value = value;
    input.parentElement.dataset.computedValue =
      value == null ? '' : String(value);

    var output = getDirectGridCellChild(input.parentElement, 'cell-output');
    var statusNode = getDirectGridCellChild(input.parentElement, 'cell-status');
    var opts = options || {};
    var aiSkeletonVariant = String(opts.aiSkeletonVariant || 'default');
    var scheduleNode = getDirectGridCellChild(
      input.parentElement,
      'cell-schedule-indicator',
    );
    input.parentElement.classList.toggle('has-ai-skeleton', !!opts.aiSkeleton);
    if (output) {
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
        output.innerHTML = this.renderAttachmentValue(opts.attachment);
      } else if (opts.aiSkeleton) {
        if (aiSkeletonVariant === 'table') {
          output.innerHTML =
            "<span class='cell-ai-skeleton cell-ai-skeleton-table' aria-hidden='true'>" +
            "<span class='cell-ai-skeleton-table-row'><span class='cell-ai-skeleton-block'></span><span class='cell-ai-skeleton-block'></span><span class='cell-ai-skeleton-block'></span></span>" +
            "<span class='cell-ai-skeleton-table-row'><span class='cell-ai-skeleton-block'></span><span class='cell-ai-skeleton-block'></span><span class='cell-ai-skeleton-block'></span></span>" +
            "<span class='cell-ai-skeleton-table-row'><span class='cell-ai-skeleton-block'></span><span class='cell-ai-skeleton-block'></span><span class='cell-ai-skeleton-block'></span></span>" +
            '</span>';
        } else {
          output.innerHTML =
            "<span class='cell-ai-skeleton cell-ai-skeleton-list' aria-hidden='true'>" +
            "<span class='cell-ai-skeleton-line is-long'></span>" +
            "<span class='cell-ai-skeleton-line is-mid'></span>" +
            "<span class='cell-ai-skeleton-line is-short'></span>" +
            '</span>';
        }
      } else {
        output.innerHTML = opts.literal
          ? this.escapeHtml(value == null ? '' : value).replace(/\r\n?/g, '<br>')
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
    input.parentElement.classList.toggle('display-align-left', opts.align === 'left');
    input.parentElement.classList.toggle('display-align-center', opts.align === 'center');
    input.parentElement.classList.toggle('display-align-right', opts.align === 'right');
    input.parentElement.classList.toggle('display-wrap', !!opts.wrapText);
    input.parentElement.classList.toggle('display-bold', !!opts.bold);
    input.parentElement.classList.toggle('display-italic', !!opts.italic);
    var borders = opts.borders || {};
    input.parentElement.classList.toggle('display-border-top', borders.top === true);
    input.parentElement.classList.toggle('display-border-right', borders.right === true);
    input.parentElement.classList.toggle('display-border-bottom', borders.bottom === true);
    input.parentElement.classList.toggle('display-border-left', borders.left === true);
    input.parentElement.classList.toggle('has-schedule', !!opts.hasSchedule);
    if (scheduleNode) {
      if (opts.hasSchedule) {
        scheduleNode.innerHTML =
          "<svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><rect x='3.5' y='5.5' width='17' height='15' rx='2.5'></rect><path d='M7 3.5v4'></path><path d='M17 3.5v4'></path><path d='M3.5 9.5h17'></path></svg>";
        if (opts.scheduleTitle) {
          scheduleNode.setAttribute('title', String(opts.scheduleTitle));
        } else {
          scheduleNode.removeAttribute('title');
        }
      } else {
        scheduleNode.innerHTML = '';
        scheduleNode.removeAttribute('title');
      }
    }
    if (statusNode) {
      var nextState = hasFormula ? String(opts.state || '') : '';
      var showStatusBadge = !(opts.aiSkeleton && (nextState === 'pending' || nextState === 'stale'));
      var title = '';
      if (showStatusBadge && (nextState === 'pending' || nextState === 'stale')) {
        title = nextState === 'stale' ? 'Waiting for recompute' : 'Computing';
      } else if (nextState === 'error') {
        title = 'Error';
      }
      if (showStatusBadge && (nextState === 'pending' || nextState === 'stale')) {
        statusNode.innerHTML =
          "<svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10' stroke-dasharray='3 3' /><path d='M12 6v6l4 2' /></svg>";
      } else if (nextState === 'error') {
        statusNode.innerHTML =
          "<svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z' /><path d='M12 9v4' /><path d='M12 17h.01' /></svg>";
      } else {
        statusNode.innerHTML = '';
      }
      statusNode.className =
        'cell-status' + (showStatusBadge && nextState ? ' is-' + nextState : '');
      if (title) statusNode.setAttribute('title', title);
      else statusNode.removeAttribute('title');
    }
  }

  renderAttachmentValue(attachment) {
    return renderAttachmentValue(this, attachment);
  }

  renderDownloadAttachmentLink(label, href) {
    return renderDownloadAttachmentLink(this, label, href);
  }

  buildAttachmentHref(attachment) {
    return buildAttachmentHref(this, attachment);
  }

  renderMarkdown(value) {
    var text = this.escapeHtml(value == null ? '' : value).replace(/\r\n?/g, '\n');
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
    return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(separatorLine);
  }

  renderMarkdownTable(lines) {
    if (!lines.length) return '';

    var headerCells = this.parseTableRow(lines[0]);
    var bodyRows = [];
    for (var i = 1; i < lines.length; i++) bodyRows.push(this.parseTableRow(lines[i]));

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
    if (normalized.charAt(normalized.length - 1) === '|') {
      normalized = normalized.substring(0, normalized.length - 1);
    }
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
    return renderInternalAttachmentLink(this, label, href);
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
