import { getSelectionRangeState } from './selection-range-facade.js';

export function canInsertFormulaMention(app, raw) {
  var text = String(raw == null ? '' : raw).trim();
  if (!text) return false;
  var prefix = text.charAt(0);
  return (
    prefix === '=' || prefix === "'" || prefix === '>' || prefix === '#'
  );
}

export function findSheetIdByName(app, sheetName) {
  var target = String(sheetName || '');
  for (var i = 0; i < app.tabs.length; i++) {
    if (app.isReportTab(app.tabs[i].id)) continue;
    if (app.tabs[i].name === target) return app.tabs[i].id;
  }
  var lower = target.toLowerCase();
  for (var j = 0; j < app.tabs.length; j++) {
    if (app.isReportTab(app.tabs[j].id)) continue;
    if (app.tabs[j].name.toLowerCase() === lower) return app.tabs[j].id;
  }
}

export function getMentionSheetPrefix(app) {
  var crossSheetPickContext = app.getCrossSheetPickContext();
  if (!crossSheetPickContext) return '';
  var visibleSheetId =
    typeof app.getVisibleSheetId === 'function'
      ? String(app.getVisibleSheetId() || '')
      : String(app.activeSheetId || '');
  if (visibleSheetId === crossSheetPickContext.sourceSheetId) return '';
  var tab = app.findTabById(visibleSheetId);
  if (!tab || !tab.name) return '';
  var safe = String(tab.name).replace(/'/g, '');
  return "'" + safe + "'!";
}

export function buildMentionTokenForSelection(
  app,
  fallbackCellId,
  isRangeMode,
) {
  var selectionRange = getSelectionRangeState(app);
  var sheetPrefix = getMentionSheetPrefix(app);
  if (!isRangeMode || !selectionRange) {
    var localLabel = app.getPreferredMentionLabel(
      String(fallbackCellId).toUpperCase(),
    );
    if (sheetPrefix) {
      return '@' + sheetPrefix + String(fallbackCellId).toUpperCase();
    }
    return '@' + localLabel;
  }
  var startCellId = app.formatCellId(
    selectionRange.startCol,
    selectionRange.startRow,
  );
  var endCellId = app.formatCellId(
    selectionRange.endCol,
    selectionRange.endRow,
  );
  if (startCellId === endCellId) {
    if (sheetPrefix) return '@' + sheetPrefix + startCellId;
    return '@' + app.getPreferredMentionLabel(startCellId);
  }
  if (sheetPrefix) return '@' + sheetPrefix + startCellId + ':' + endCellId;
  return '@' + startCellId + ':' + endCellId;
}

export function insertTextIntoInputAtCursor(app, input, text) {
  if (!input) return;
  var value = String(input.value == null ? '' : input.value);
  var insertion = String(text == null ? '' : text);
  if (!insertion) return;

  var start =
    app && typeof app.getEditorSelectionRange === 'function'
      ? app.getEditorSelectionRange(input).start
      : typeof input.selectionStart === 'number'
        ? input.selectionStart
        : value.length;
  var end =
    app && typeof app.getEditorSelectionRange === 'function'
      ? app.getEditorSelectionRange(input).end
      : typeof input.selectionEnd === 'number'
        ? input.selectionEnd
        : value.length;
  var needsSpace =
    start > 0 && !/\s|\(|,|\+|-|\*|\/|:/.test(value.charAt(start - 1));
  var prefix = needsSpace ? ' ' : '';
  var nextValue = value.slice(0, start) + prefix + insertion + value.slice(end);
  input.value = nextValue;
  var cursor = start + prefix.length + insertion.length;
  if (app && typeof app.setEditorSelectionRange === 'function') {
    app.setEditorSelectionRange(cursor, cursor, input);
  } else if (typeof input.setSelectionRange === 'function') {
    input.setSelectionRange(cursor, cursor);
  }
}

export function applyFormulaMentionPreview(app, input, token) {
  if (!input) return;
  var text = String(token == null ? '' : token);
  if (!text) return;
  var value = String(input.value == null ? '' : input.value);
  var range =
    app && typeof app.getEditorSelectionRange === 'function'
      ? app.getEditorSelectionRange(input)
      : {
          start:
            typeof input.selectionStart === 'number'
              ? input.selectionStart
              : value.length,
          end:
            typeof input.selectionEnd === 'number'
              ? input.selectionEnd
              : value.length,
        };
  var caretStart = range.start;
  var caretEnd = range.end;

  if (
    app.formulaMentionPreview &&
    app.formulaMentionPreview.inputId === input.id
  ) {
    var isCaretOnPreviewTail =
      caretStart === caretEnd && caretStart === app.formulaMentionPreview.end;
    if (!isCaretOnPreviewTail) {
      app.formulaMentionPreview = null;
    }
  }

  if (
    app.formulaMentionPreview &&
    app.formulaMentionPreview.inputId === input.id
  ) {
    var start = app.formulaMentionPreview.start;
    var end = app.formulaMentionPreview.end;
    if (start >= 0 && end >= start && end <= value.length) {
      value = value.slice(0, start) + text + value.slice(end);
      input.value = value;
      app.formulaMentionPreview.start = start;
      app.formulaMentionPreview.end = start + text.length;
      if (app && typeof app.setEditorSelectionRange === 'function') {
        app.setEditorSelectionRange(
          app.formulaMentionPreview.end,
          app.formulaMentionPreview.end,
          input,
        );
      } else if (typeof input.setSelectionRange === 'function') {
        input.setSelectionRange(
          app.formulaMentionPreview.end,
          app.formulaMentionPreview.end,
        );
      }
      if (typeof app.updateEditingSessionDraft === 'function') {
        app.updateEditingSessionDraft(input.value, { origin: 'cell' });
      }
      return;
    }
  }

  var startPos = caretStart;
  var endPos = caretEnd;
  var needsSpace =
    startPos > 0 && !/\s|\(|,|\+|-|\*|\/|:/.test(value.charAt(startPos - 1));
  var prefix = needsSpace ? ' ' : '';
  var inserted = prefix + text;
  var nextValue = value.slice(0, startPos) + inserted + value.slice(endPos);
  input.value = nextValue;

  app.formulaMentionPreview = {
    inputId: input.id,
    start: startPos,
    end: startPos + inserted.length,
  };
  if (app && typeof app.setEditorSelectionRange === 'function') {
    app.setEditorSelectionRange(
      app.formulaMentionPreview.end,
      app.formulaMentionPreview.end,
      input,
    );
  } else if (typeof input.setSelectionRange === 'function') {
    input.setSelectionRange(
      app.formulaMentionPreview.end,
      app.formulaMentionPreview.end,
    );
  }
  if (typeof app.updateEditingSessionDraft === 'function') {
    app.updateEditingSessionDraft(input.value, { origin: 'cell' });
  }
}

export function clearFormulaMentionPreview(app) {
  app.formulaMentionPreview = null;
}
