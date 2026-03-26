export function parseReportControlToken(app, token, prefix) {
  var source = String(token == null ? '' : token);
  var body =
    source.indexOf(prefix) === 0 ? source.substring(prefix.length) : source;
  var match = /^(.*?)(?::\[([^\]]*)\])?$/.exec(body);
  return {
    referenceToken: String(match && match[1] ? match[1] : body).trim(),
    hint: String(match && match[2] ? match[2] : '').trim(),
  };
}

export function resolveReportInternalLink(app, token) {
  var raw = String(token || '');
  if (!raw || raw.indexOf('!@') !== 0) return null;
  var hashIdx = raw.indexOf('#');
  var linkToken = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw;
  var label = hashIdx >= 0 ? raw.slice(hashIdx + 1).trim() : '';
  var ref = resolveReportReference(app, linkToken.substring(1));
  if (!ref || !ref.sheetId) return null;
  if (ref.cellId)
    return {
      sheetId: ref.sheetId,
      cellId: String(ref.cellId).toUpperCase(),
      label: label,
    };
  if (ref.startCellId)
    return {
      sheetId: ref.sheetId,
      cellId: String(ref.startCellId).toUpperCase(),
      label: label,
    };
  return null;
}

export function createReportInternalLinkElement(app, token, target) {
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'report-internal-link';
  btn.dataset.sheetId = target.sheetId;
  btn.dataset.cellId = target.cellId;
  btn.textContent = String(target && target.label ? target.label : token || '');
  return btn;
}

export function followReportInternalLink(app, link) {
  var sheetId = String(link.dataset.sheetId || '');
  var cellId = String(link.dataset.cellId || '').toUpperCase();
  if (!sheetId || !cellId) return;
  if (app.isReportTab(sheetId)) {
    app.switchToSheet(sheetId);
    return;
  }
  if (app.activeSheetId !== sheetId) app.switchToSheet(sheetId);
  var input = app.inputById[cellId];
  if (!input) return;
  app.setActiveInput(input);
  input.focus();
}

export function resolveReportInputMention(app, payload) {
  var resolved = resolveReportReference(app, payload);
  if (!resolved) return null;
  if (resolved.type === 'region') {
    return {
      sheetId: resolved.sheetId,
      cellId: resolved.startCellId,
      value: readLinkedInputValue(app, resolved.sheetId, resolved.startCellId),
    };
  }
  return {
    sheetId: resolved.sheetId,
    cellId: resolved.cellId,
    value: readLinkedInputValue(app, resolved.sheetId, resolved.cellId),
  };
}

export function resolveReportMention(app, token) {
  var resolved = resolveReportReference(app, token);
  if (!resolved) return null;
  if (resolved.type === 'region')
    return { type: 'region', rows: resolved.rows, value: resolved.value };
  if (resolved.type === 'table')
    return { type: 'table', rows: resolved.rows, value: resolved.value };
  if (resolved.type === 'list')
    return { type: 'list', items: resolved.items, value: resolved.value };
  return { value: resolved.value };
}

function resolveAttachmentMention(app, sheetId, cellId, value) {
  if (!app || !app.parseAttachmentSource || !app.storage) return null;
  var raw = app.storage.getCellValue(sheetId, cellId);
  var attachment = app.parseAttachmentSource(raw);
  if (!attachment) return null;
  return {
    type: 'attachment',
    sheetId: sheetId,
    cellId: cellId,
    value: value,
  };
}

export function resolveReportReference(app, token) {
  if (!token) return null;
  var rawMode = token.indexOf('_@') === 0;
  var tokenBody = rawMode ? token.substring(1) : token;
  var normalized =
    tokenBody.charAt(0) === '@' ? tokenBody.substring(1) : tokenBody;
  var rangeResolved = resolveSheetRegionMention(app, normalized, rawMode);
  if (rangeResolved) return rangeResolved;
  if (normalized.charAt(0) === '@')
    return resolveNamedMention(app, normalized.substring(1), rawMode);
  if (tokenBody.charAt(0) === '@') {
    var named = resolveNamedMention(app, tokenBody.substring(1), rawMode);
    if (named) return named;
    return resolveSheetCellMention(app, tokenBody.substring(1), rawMode);
  }
  return resolveSheetCellMention(app, normalized, rawMode);
}

export function resolveNamedMention(app, name, rawMode) {
  var ref = app.storage.resolveNamedCell(name);
  if (!ref || !ref.sheetId) return null;
  if (ref.startCellId && ref.endCellId) {
    var startCellId = String(ref.startCellId).toUpperCase();
    var endCellId = String(ref.endCellId).toUpperCase();
    var rows = rawMode
      ? readRegionRawValues(app, ref.sheetId, startCellId, endCellId)
      : readRegionValues(app, ref.sheetId, startCellId, endCellId);
    return {
      type: 'region',
      sheetId: ref.sheetId,
      startCellId: startCellId,
      endCellId: endCellId,
      rows: rows,
      value: rows.length ? rows[0].join(', ') : '',
    };
  }
  if (!ref.cellId) return null;
  var targetCellId = String(ref.cellId).toUpperCase();
  var value = rawMode
    ? app.storage.getCellValue(ref.sheetId, targetCellId)
    : app.readCellMentionValue(ref.sheetId, targetCellId);
  if (rawMode) {
    return {
      sheetId: ref.sheetId,
      cellId: targetCellId,
      value: String(value == null ? '' : value),
    };
  }
  if (isListShortcutCell(app, ref.sheetId, targetCellId)) {
    return {
      type: 'list',
      sheetId: ref.sheetId,
      cellId: targetCellId,
      items: parseListItemsFromMentionValue(app, value),
      value: value,
    };
  }
  if (isTableShortcutCell(app, ref.sheetId, targetCellId)) {
    var tableRows = readTableMentionRows(app, ref.sheetId, targetCellId);
    return {
      type: 'table',
      sheetId: ref.sheetId,
      cellId: targetCellId,
      rows: tableRows,
      value: value,
    };
  }
  return { sheetId: ref.sheetId, cellId: targetCellId, value: value };
}

export function resolveSheetCellMention(app, token, rawMode) {
  var match =
    /^(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))[:!]([A-Za-z]+[0-9]+)$/.exec(
      token,
    );
  if (!match) return null;
  var sheetName = match[1] || match[2] || '';
  var cellId = (match[3] || '').toUpperCase();
  var sheetId = app.findSheetIdByName(sheetName);
  if (!sheetId) return null;
  var value = rawMode
    ? app.storage.getCellValue(sheetId, cellId)
    : app.readCellMentionValue(sheetId, cellId);
  if (rawMode) {
    return {
      sheetId: sheetId,
      cellId: cellId,
      value: String(value == null ? '' : value),
    };
  }
  if (isListShortcutCell(app, sheetId, cellId)) {
    return {
      type: 'list',
      sheetId: sheetId,
      cellId: cellId,
      items: parseListItemsFromMentionValue(app, value),
      value: value,
    };
  }
  if (isTableShortcutCell(app, sheetId, cellId)) {
    var tableRows = readTableMentionRows(app, sheetId, cellId);
    return {
      type: 'table',
      sheetId: sheetId,
      cellId: cellId,
      rows: tableRows,
      value: value,
    };
  }
  return { sheetId: sheetId, cellId: cellId, value: value };
}

export function resolveSheetRegionMention(app, token, rawMode) {
  var match =
    /^(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))[:!]([A-Za-z]+[0-9]+):([A-Za-z]+[0-9]+)$/.exec(
      token,
    );
  if (!match) return null;
  var sheetName = match[1] || match[2] || '';
  var startCellId = (match[3] || '').toUpperCase();
  var endCellId = (match[4] || '').toUpperCase();
  var sheetId = app.findSheetIdByName(sheetName);
  if (!sheetId) return null;
  var rows = rawMode
    ? readRegionRawValues(app, sheetId, startCellId, endCellId)
    : readRegionValues(app, sheetId, startCellId, endCellId);
  return {
    type: 'region',
    sheetId: sheetId,
    startCellId: startCellId,
    endCellId: endCellId,
    rows: rows,
    value: rows.length ? rows[0].join(', ') : '',
  };
}

export function readRegionValues(app, sheetId, startCellId, endCellId) {
  var start = app.parseCellId(startCellId);
  var end = app.parseCellId(endCellId);
  if (!start || !end) return [];
  var rowStart = Math.min(start.row, end.row);
  var rowEnd = Math.max(start.row, end.row);
  var colStart = Math.min(start.col, end.col);
  var colEnd = Math.max(start.col, end.col);
  var rows = [];
  for (var row = rowStart; row <= rowEnd; row++) {
    var values = [];
    for (var col = colStart; col <= colEnd; col++) {
      var cellId = app.formatCellId(col, row);
      values.push(app.readCellComputedValue(sheetId, cellId));
    }
    rows.push(values);
  }
  return rows;
}

export function readRegionRawValues(app, sheetId, startCellId, endCellId) {
  var start = app.parseCellId(startCellId);
  var end = app.parseCellId(endCellId);
  if (!start || !end) return [];
  var rowStart = Math.min(start.row, end.row);
  var rowEnd = Math.max(start.row, end.row);
  var colStart = Math.min(start.col, end.col);
  var colEnd = Math.max(start.col, end.col);
  var rows = [];
  for (var row = rowStart; row <= rowEnd; row++) {
    var values = [];
    for (var col = colStart; col <= colEnd; col++) {
      var cellId = app.formatCellId(col, row);
      values.push(String(app.storage.getCellValue(sheetId, cellId) || ''));
    }
    rows.push(values);
  }
  return rows;
}

export function createReportRegionTableElement(app, rows) {
  var table = document.createElement('table');
  table.className = 'report-region-table';
  var body = document.createElement('tbody');
  var safeRows = Array.isArray(rows) ? rows : [];
  for (var r = 0; r < safeRows.length; r++) {
    var tr = document.createElement('tr');
    var rowValues = Array.isArray(safeRows[r]) ? safeRows[r] : [];
    for (var c = 0; c < rowValues.length; c++) {
      var td = document.createElement('td');
      td.textContent = String(rowValues[c] == null ? '' : rowValues[c]);
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  table.appendChild(body);
  return table;
}

export function createReportListElement(app, items) {
  var list = document.createElement('ul');
  list.className = 'report-mentioned-list';
  var values = Array.isArray(items) ? items : [];
  for (var i = 0; i < values.length; i++) {
    var text = String(values[i] == null ? '' : values[i]).trim();
    if (!text) continue;
    var li = document.createElement('li');
    li.textContent = text;
    list.appendChild(li);
  }
  if (!list.childNodes.length) {
    var empty = document.createElement('li');
    empty.textContent = '';
    list.appendChild(empty);
  }
  return list;
}

export function isListShortcutCell(app, sheetId, cellId) {
  var raw = app.storage.getCellValue(
    sheetId,
    String(cellId || '').toUpperCase(),
  );
  if (!raw || raw.charAt(0) !== '>') return false;
  return !!app.formulaEngine.parseListShortcutPrompt(raw);
}

export function isTableShortcutCell(app, sheetId, cellId) {
  var raw = app.storage.getCellValue(
    sheetId,
    String(cellId || '').toUpperCase(),
  );
  if (!raw || raw.charAt(0) !== '#') return false;
  if (
    app.formulaEngine &&
    typeof app.formulaEngine.parseChannelFeedPromptSpec === 'function' &&
    app.formulaEngine.parseChannelFeedPromptSpec(raw)
  ) {
    return false;
  }
  return !!(
    app.formulaEngine &&
    typeof app.formulaEngine.parseTablePromptSpec === 'function' &&
    app.formulaEngine.parseTablePromptSpec(raw)
  );
}

export function readTableMentionRows(app, sheetId, cellId) {
  if (
    !app ||
    !app.formulaEngine ||
    typeof app.formulaEngine.readTableShortcutMatrix !== 'function'
  ) {
    return [];
  }
  var rows = app.formulaEngine.readTableShortcutMatrix(
    sheetId,
    String(cellId || '').toUpperCase(),
    {},
    {},
  );
  return Array.isArray(rows) ? rows : [];
}

export function parseListItemsFromMentionValue(app, value) {
  return String(value == null ? '' : value)
    .split(/\r?\n/)
    .map(function (line) {
      return line.trim();
    })
    .filter(Boolean);
}

export function readLinkedInputValue(app, sheetId, cellId) {
  return readLinkedReportInputValue(app, sheetId, cellId);
}
import { readLinkedReportInputValue } from './report-input-facade.js';
