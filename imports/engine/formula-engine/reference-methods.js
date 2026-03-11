// Description: reference methods extracted from FormulaEngine for smaller logical modules.
export const referenceMethods = {
  regionToRawCsv(sheetId, startCellId, endCellId) {
    var start = this.parseCellId(startCellId);
    var end = this.parseCellId(endCellId);
    if (!start || !end) return '';

    var rowStart = Math.min(start.row, end.row);
    var rowEnd = Math.max(start.row, end.row);
    var colStart = Math.min(start.col, end.col);
    var colEnd = Math.max(start.col, end.col);
    var rows = [];

    for (var r = rowStart; r <= rowEnd; r++) {
      var rowValues = [];
      for (var c = colStart; c <= colEnd; c++) {
        var cellId = this.columnIndexToLabel(c) + r;
        var raw = this.storageService.getCellValue(sheetId, cellId);
        rowValues.push(this.escapeCsv(raw == null ? '' : String(raw)));
      }
      rows.push(rowValues.join(','));
    }

    return rows.join('\n');
  },

  regionToCsv(sheetId, startCellId, endCellId, stack) {
    var start = this.parseCellId(startCellId);
    var end = this.parseCellId(endCellId);
    if (!start || !end) return '';

    var rowStart = Math.min(start.row, end.row);
    var rowEnd = Math.max(start.row, end.row);
    var colStart = Math.min(start.col, end.col);
    var colEnd = Math.max(start.col, end.col);
    var rows = [];

    for (var r = rowStart; r <= rowEnd; r++) {
      var rowValues = [];
      for (var c = colStart; c <= colEnd; c++) {
        var cellId = this.columnIndexToLabel(c) + r;
        var value = this.evaluateCell(sheetId, cellId, stack);
        rowValues.push(this.escapeCsv(value == null ? '' : String(value)));
      }
      rows.push(rowValues.join(','));
    }

    return rows.join('\n');
  },

  parseCellId(cellId) {
    var match = /^([A-Za-z]+)([0-9]+)$/.exec(String(cellId || ''));
    if (!match) return null;
    return {
      col: this.columnLabelToIndex(match[1].toUpperCase()),
      row: parseInt(match[2], 10),
    };
  },

  columnLabelToIndex(label) {
    var result = 0;
    for (var i = 0; i < label.length; i++) {
      result = result * 26 + (label.charCodeAt(i) - 64);
    }
    return result;
  },

  columnIndexToLabel(index) {
    var n = index;
    var label = '';
    while (n > 0) {
      var rem = (n - 1) % 26;
      label = String.fromCharCode(65 + rem) + label;
      n = Math.floor((n - 1) / 26);
    }
    return label;
  },

  escapeCsv(value) {
    if (/[",\n]/.test(value)) {
      return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
  },

  fillUnderneathCells(sheetId, sourceCellId, options, startFromIndex) {
    var source = this.parseCellId(sourceCellId);
    if (!source) return;
    var sourceKey = String(sourceCellId || '').toUpperCase();

    var values = Array.isArray(options) ? options : [];
    var colLabel = this.columnIndexToLabel(source.col);
    var startIndex = startFromIndex || 0;

    for (var i = startIndex; i < values.length; i++) {
      var targetCellId = colLabel + (source.row + (i - startIndex) + 1);
      this.storageService.setCellValue(sheetId, targetCellId, values[i], {
        generatedBy: sourceKey,
      });
    }
  },

  escapeForDoubleQuotedString(text) {
    return String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  },

  coerce(value) {
    return isNaN(parseFloat(value)) ? value : parseFloat(value);
  },
};
