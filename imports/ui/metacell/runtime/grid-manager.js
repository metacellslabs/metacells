// Description: Grid/table rendering, resizing, keyboard navigation, fill-handle support, and markdown cell display.
import { MIN_COL_WIDTH } from './constants.js';
import {
  applyCellContentToOutput,
  applyCellInputTypography,
} from './cell-content-renderer.js';

function columnIndexToLabel(index) {
  var n = Number(index) || 0;
  var label = '';
  while (n > 0) {
    var rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

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
    for (var i = 0; i <= this.rows; i++) {
      var row = this.table.insertRow(-1);
      for (var j = 0; j <= this.cols; j++) {
        var letter = columnIndexToLabel(j);
        row.insertCell(-1).innerHTML =
          i && j
            ? "<div class='cell-output'></div><div class='cell-status' aria-hidden='true'></div><div class='cell-schedule-indicator' aria-hidden='true'></div><button type='button' class='cell-focus-proxy' tabindex='0' aria-label='Select cell " +
              letter +
              i +
              "'></button><input id='" +
              letter +
              i +
              "' class='cell-anchor-input' readonly tabindex='-1' aria-hidden='true' aria-readonly='true' autocomplete='off' spellcheck='false'/><div class='cell-actions'><button type='button' class='cell-action' data-action='copy' title='Copy value' aria-label='Copy value'><svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><rect x='9' y='9' width='10' height='10' rx='2'></rect><path d='M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1'></path></svg></button><button type='button' class='cell-action' data-action='fullscreen' title='Fullscreen' aria-label='Fullscreen'><svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M8 3H5a2 2 0 0 0-2 2v3'></path><path d='M16 3h3a2 2 0 0 1 2 2v3'></path><path d='M8 21H5a2 2 0 0 1-2-2v-3'></path><path d='M16 21h3a2 2 0 0 0 2-2v-3'></path></svg></button><button type='button' class='cell-action' data-action='run' title='Run formula'>▶</button></div><div class='fill-handle'></div>"
            : i || letter;
      }
    }
  }

  getInputs() {
    return [].slice.call(this.table.querySelectorAll('.cell-anchor-input'));
  }

  getFocusProxy(input) {
    if (!input || !input.parentElement) return null;
    return input.parentElement.querySelector('.cell-focus-proxy');
  }

  fitRowHeaderColumnWidth() {
    if (!this.table || !this.table.rows || !this.table.rows.length) return;
    var maxLabel = String(Math.max(1, this.rows));
    var digits = maxLabel.length;
    var width = Math.max(28, 10 + digits * 8);

    for (var r = 0; r < this.table.rows.length; r++) {
      var cell = this.table.rows[r].cells[0];
      if (!cell) continue;
      cell.style.width = width + 'px';
      cell.style.minWidth = width + 'px';
      cell.style.maxWidth = width + 'px';
    }
  }

  stabilizeHeaderMetrics() {
    if (!this.table || !this.table.rows || !this.table.rows.length) return;
    var headerRow = this.table.rows[0];
    headerRow.style.height = '24px';
    headerRow.style.minHeight = '24px';
    headerRow.style.maxHeight = '24px';
    for (var c = 0; c < headerRow.cells.length; c++) {
      var headerCell = headerRow.cells[c];
      if (!headerCell) continue;
      headerCell.style.height = '24px';
      headerCell.style.minHeight = '24px';
      headerCell.style.maxHeight = '24px';
      headerCell.style.lineHeight = '24px';
      headerCell.style.boxSizing = 'border-box';
      headerCell.style.overflow = 'hidden';
    }

    for (var r = 1; r < this.table.rows.length; r++) {
      var row = this.table.rows[r];
      if (row) {
        row.style.height = this.defaultRowHeight + 'px';
        row.style.minHeight = this.defaultRowHeight + 'px';
        row.style.maxHeight = this.defaultRowHeight + 'px';
      }
      var rowHeader = this.table.rows[r].cells[0];
      if (!rowHeader) continue;
      rowHeader.style.height = this.defaultRowHeight + 'px';
      rowHeader.style.minHeight = this.defaultRowHeight + 'px';
      rowHeader.style.maxHeight = this.defaultRowHeight + 'px';
      rowHeader.style.lineHeight = this.defaultRowHeight + 'px';
      rowHeader.style.boxSizing = 'border-box';
      rowHeader.style.overflow = 'hidden';
    }
  }

  setColumnWidth(colIndex, width) {
    var finalWidth = Math.max(MIN_COL_WIDTH, width);
    for (var r = 0; r < this.table.rows.length; r++) {
      var cell = this.table.rows[r].cells[colIndex];
      if (!cell) continue;
      cell.style.width = finalWidth + 'px';
      cell.style.minWidth = finalWidth + 'px';
      cell.style.maxWidth = finalWidth + 'px';
    }
    return finalWidth;
  }

  lockAllColumnWidths() {
    if (!this.table || !this.table.rows || !this.table.rows.length) return;
    var headerRow = this.table.rows[0];
    if (!headerRow || !headerRow.cells || !headerRow.cells.length) return;
    for (var colIndex = 0; colIndex < headerRow.cells.length; colIndex++) {
      var cell = headerRow.cells[colIndex];
      if (!cell) continue;
      this.setColumnWidth(colIndex, cell.offsetWidth);
    }
  }

  setColumnWidthFromGuide(colIndex, guideLeftX, columnLeftX) {
    var desiredRightX = guideLeftX + 1;
    var desiredWidth = Math.max(MIN_COL_WIDTH, desiredRightX - columnLeftX);
    var finalWidth = this.setColumnWidth(colIndex, desiredWidth);
    var cell = this.table.rows[0] && this.table.rows[0].cells[colIndex];
    if (!cell) return finalWidth;

    var actualRect = cell.getBoundingClientRect();
    var actualRightX = actualRect.right;
    var drift = desiredRightX - actualRightX;
    if (Math.abs(drift) > 0.5) {
      finalWidth = this.setColumnWidth(colIndex, finalWidth + drift);
    }
    return finalWidth;
  }

  setRowHeight(rowIndex, height) {
    var finalHeight = Math.max(this.defaultRowHeight, height);
    var row = this.table.rows[rowIndex];
    if (row) {
      row.style.height = finalHeight + 'px';
      row.style.minHeight = finalHeight + 'px';
      row.style.maxHeight = finalHeight + 'px';
    }
    for (var c = 0; c < row.cells.length; c++) {
      row.cells[c].style.height = finalHeight + 'px';
      row.cells[c].style.minHeight = finalHeight + 'px';
      row.cells[c].style.maxHeight = finalHeight + 'px';
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
    this.stabilizeHeaderMetrics();
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
          document.body.classList.add('is-column-resizing');
          this.lockAllColumnWidths();
          var columnRect =
            this.table.rows[0].cells[index].getBoundingClientRect();
          var startGuideX = columnRect.right - 1;
          var startLeftX = columnRect.left;
          var didResize = false;
          var pendingGuideX = startGuideX;
          this.showColumnResizeGuide(startGuideX);

          var onMove = (moveEvent) => {
            pendingGuideX = moveEvent.clientX;
            this.moveColumnResizeGuide(moveEvent.clientX);
            didResize = true;
          };

          var onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.classList.remove('is-column-resizing');
            if (didResize) {
              var finalWidth = this.setColumnWidthFromGuide(
                index,
                pendingGuideX,
                startLeftX,
              );
              onColumnResize(index, finalWidth);
              this.updateTableSize();
            }
            this.hideColumnResizeGuide();
          };

          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        });

        colHandle.addEventListener('dblclick', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.lockAllColumnWidths();
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

    var input = probe.querySelector('.cell-anchor-input');
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

    var headerRow = this.table.rows[0];
    var wrap = this.table.parentElement;

    // Clear previous fixed size so the table can expand to the new natural
    // width after column resize before we measure it again.
    this.table.style.width = '';
    this.table.style.height = '';

    var totalWidth = 0;
    if (headerRow && headerRow.cells.length) {
      var firstCellRect = headerRow.cells[0].getBoundingClientRect();
      var lastCellRect =
        headerRow.cells[headerRow.cells.length - 1].getBoundingClientRect();
      totalWidth = Math.ceil(lastCellRect.right - firstCellRect.left);
    }
    totalWidth = Math.max(
      totalWidth,
      Math.ceil(this.table.scrollWidth || 0),
      wrap ? Math.ceil(wrap.clientWidth || 0) : 0,
    );

    var totalHeight = 0;
    for (var r = 0; r < this.table.rows.length; r++) {
      totalHeight += this.table.rows[r].offsetHeight;
    }

    this.table.style.width = totalWidth + 'px';
    this.table.style.height = totalHeight + 'px';
  }

  setEditing(input, editing) {
    input.readOnly = true;
    input.classList.toggle('editing', editing);
    input.parentElement.classList.toggle('editing', editing);
    if (typeof this.onEditingStateChange === 'function') {
      this.onEditingStateChange(input, !!editing);
    }
    if (!editing) {
      input.parentElement.classList.remove('formula-bar-editing');
    }
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

    var nextInput = this.table.rows[nextRowIndex].cells[
      nextCellIndex
    ].querySelector('.cell-anchor-input');
    if (nextInput) {
      var focusProxy = this.getFocusProxy(nextInput);
      if (focusProxy && typeof focusProxy.focus === 'function') {
        focusProxy.focus();
      } else {
        nextInput.focus();
      }
    }
    return true;
  }

  renderCellValue(input, value, isEditing, hasFormula, options) {
    input.readOnly = true;
    if (!isEditing) input.value = value;
    input.parentElement.dataset.computedValue =
      value == null ? '' : String(value);

    var output = input.parentElement.querySelector('.cell-output');
    var statusNode = input.parentElement.querySelector('.cell-status');
    var opts = options || {};
    var aiSkeletonVariant = String(opts.aiSkeletonVariant || 'default');
    var scheduleNode = input.parentElement.querySelector(
      '.cell-schedule-indicator',
    );
    var opts = options || {};
    input.parentElement.classList.toggle('has-ai-skeleton', !!opts.aiSkeleton);
    input.parentElement.classList.toggle(
      'has-generated-attachment',
      !!(opts.attachment && opts.attachment.generated),
    );
    if (output) {
      applyCellContentToOutput(output, value, hasFormula, opts);
    }
    applyCellInputTypography(input, opts);
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
    var probe = document.createElement('div');
    applyCellContentToOutput(probe, '', false, { attachment: attachment });
    return probe.innerHTML;
  }

  renderDownloadAttachmentLink(label, href) {
    var name = String(label || 'attachment');
    var safeName = this.escapeHtml(name);
    var safeHref = this.escapeHtml(String(href || ''));
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

  renderGeneratedAttachmentCard(label, href, hasDirectFileUrl, type) {
    return this.renderAttachmentValue({
      name: label,
      downloadUrl: href,
      generated: true,
      type: type,
      url: hasDirectFileUrl ? href : '',
    });
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
