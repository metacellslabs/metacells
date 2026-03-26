import { getAttachmentDisplayLabel } from './attachment-render-runtime.js';
import {
  buildMentionAutocompleteUiState,
  publishMentionAutocompleteUiState,
  syncMentionAutocompleteUiToAnchor,
} from './mention-autocomplete-facade.js';
import { resolveCellAttachment } from './attachment-cell-facade.js';

function restoreMentionEditorValue(input, value, start, end) {
  if (!input) return;
  if (String(input.value || '') !== String(value || '')) {
    input.value = String(value || '');
  }
  if (typeof input.setSelectionRange === 'function') {
    input.setSelectionRange(start, end);
  }
}

function applyReportEditorMentionSelection(app, state, item) {
  var editor = state && state.input ? state.input : null;
  var textNode = state && state.textNode ? state.textNode : null;
  if (
    !editor ||
    !textNode ||
    textNode.nodeType !== Node.TEXT_NODE ||
    !item ||
    typeof item.token !== 'string'
  ) {
    hideMentionAutocomplete(app);
    return;
  }

  var source = String(textNode.nodeValue || '');
  var start = Number.isInteger(state.startOffset) ? state.startOffset : 0;
  var end = Number.isInteger(state.endOffset) ? state.endOffset : start;
  var insertedToken = String(item.token || '') + ' ';
  var nextValue = source.slice(0, start) + insertedToken + source.slice(end);
  textNode.nodeValue = nextValue;

  var caretOffset = start + insertedToken.length;
  if (app) {
    app.suppressReportMentionAutocompleteUntil = Date.now() + 180;
  }
  if (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof document.createRange === 'function' &&
    typeof window.getSelection === 'function'
  ) {
    var selection = window.getSelection();
    var range = document.createRange();
    range.setStart(textNode, caretOffset);
    range.collapse(true);
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  if (typeof editor.focus === 'function') {
    editor.focus();
  }
  if (typeof editor.dispatchEvent === 'function') {
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }
  hideMentionAutocomplete(app);
}

export function ensureMentionAutocomplete(app) {
  var el = document.querySelector('.mention-autocomplete');
  app.mentionAutocomplete = el || null;
  return el;
}

export function setupMentionAutocomplete(app) {
  ensureMentionAutocomplete(app);
  document.addEventListener('mousedown', function (e) {
    if (!app.mentionAutocompleteState) return;
    var target = e.target;
    if (!target) return;
    if (
      app.mentionAutocomplete && app.mentionAutocomplete.contains(target)
    ) {
      return;
    }
    if (
      target.closest &&
      target.closest('.mention-autocomplete')
    ) {
      return;
    }
    if (target === app.formulaInput) return;
    if (target.tagName === 'INPUT') {
      hideMentionAutocompleteSoon(app);
      return;
    }
    hideMentionAutocomplete(app);
  });
  window.addEventListener('resize', function () {
    hideMentionAutocomplete(app);
  });
}

export function hideMentionAutocompleteSoon(app) {
  setTimeout(function () {
    hideMentionAutocomplete(app);
  }, 120);
}

export function hideMentionAutocomplete(app) {
  if (
    !app.mentionAutocompleteState &&
    app.mentionAutocompleteUiState &&
    app.mentionAutocompleteUiState.visible !== true
  ) {
    return;
  }
  app.mentionAutocompleteState = null;
  publishMentionAutocompleteUiState(app, null);
}

export function updateMentionAutocomplete(app, input) {
  if (!input) return hideMentionAutocomplete(app);
  var ctx = getMentionAutocompleteContext(app, input);
  if (!ctx) return hideMentionAutocomplete(app);
  var items = getMentionAutocompleteItems(app, ctx.query, ctx.marker);
  if (!items.length) return hideMentionAutocomplete(app);

  var activeIndex = 0;
  if (
    app.mentionAutocompleteState &&
    app.mentionAutocompleteState.input === input
  ) {
    var prevToken =
      app.mentionAutocompleteState.items[
        app.mentionAutocompleteState.activeIndex
      ] &&
      app.mentionAutocompleteState.items[
        app.mentionAutocompleteState.activeIndex
      ].token;
    if (prevToken) {
      for (var i = 0; i < items.length; i++) {
        if (items[i].token === prevToken) {
          activeIndex = i;
          break;
        }
      }
    }
  }

  app.mentionAutocompleteState = {
    input: input,
    inputId: String(input.id || ''),
    marker: ctx.marker,
    start: ctx.start,
    end: ctx.end,
    items: items,
    activeIndex: activeIndex,
  };
  var sourceKind = input === app.editorOverlayInput ? 'overlay' : 'default';
  syncMentionAutocompleteUiToAnchor(app, {
    visible: true,
    anchorElement: input,
    anchorCaret: input === app.editorOverlayInput,
    sourceKind: sourceKind,
    activeIndex: activeIndex,
    items: items,
  });
}

export function getMentionAutocompleteContext(app, input) {
  if (!input || typeof input.selectionStart !== 'number') return null;
  var start = input.selectionStart;
  var end = input.selectionEnd;
  if (start !== end) return null;
  var value = String(input.value == null ? '' : input.value);
  var left = value.slice(0, start);
  var match = /(^|[^A-Za-z0-9_])(@@?|\/)([A-Za-z0-9_-]*)$/.exec(left);
  if (!match) return null;
  var marker = match[2];
  var query = match[3] || '';
  var markerStart = start - (marker.length + query.length);
  if (markerStart < 0) return null;
  return {
    marker: marker,
    query: query,
    start: markerStart,
    end: start,
  };
}

export function getMentionAutocompleteItems(app, query, marker) {
  var target = String(query == null ? '' : query).toLowerCase();
  var items = [];
  var seen = {};
  var addItem = function (kind, label, token, search) {
    var key = token.toLowerCase();
    if (seen[key]) return;
    var hay = (
      String(label) +
      ' ' +
      String(search || '') +
      ' ' +
      String(token)
    ).toLowerCase();
    if (target && hay.indexOf(target) === -1) return;
    seen[key] = true;
    items.push({
      kind: kind,
      label: label,
      token: token,
      search: search || '',
    });
  };
  var formatSheetCellToken = function (sheetName, cellId) {
    var normalizedSheet = String(sheetName || '');
    var normalizedCell = String(cellId || '').toUpperCase();
    var needsQuotes = /[^A-Za-z0-9_]/.test(normalizedSheet);
    var sheetToken = needsQuotes
      ? "'" +
        normalizedSheet.replace(/\\/g, '\\\\').replace(/'/g, "\\'") +
        "'"
      : normalizedSheet;
    return marker + sheetToken + '!' + normalizedCell;
  };
  var formatAttachmentToken = function (sheetId, sheetName, cellId) {
    var namedRef =
      app.storage && typeof app.storage.getCellNameFor === 'function'
        ? String(app.storage.getCellNameFor(sheetId, cellId) || '').trim()
        : '';
    if (namedRef) return 'File:@' + namedRef;
    return 'File:' + formatSheetCellToken(sheetName, cellId);
  };

  if (marker === '/') {
    for (var ch = 0; ch < app.availableChannels.length; ch++) {
      var channel = app.availableChannels[ch];
      if (!channel || !channel.label) continue;
      addItem(
        'channel',
        '/' + channel.label,
        '/' + channel.label,
        channel.label + ' channel',
      );
    }
    items.sort(function (a, b) {
      return a.label.localeCompare(b.label, undefined, {
        sensitivity: 'base',
      });
    });
    return items.slice(0, 16);
  }

  var named = app.storage.readNamedCells();
  var namedKeys = Object.keys(named || {}).sort(function (a, b) {
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });
  for (var i = 0; i < namedKeys.length; i++) {
    var name = namedKeys[i];
    var ref = named[name] || {};
    var location =
      ref.cellId ||
      (ref.startCellId && ref.endCellId
        ? ref.startCellId + ':' + ref.endCellId
        : '');
    addItem(
      'named',
      '@' + name + (location ? '  ' + location : ''),
      marker + name,
      name + ' ' + location,
    );
  }

  var allCells =
    app.storage && typeof app.storage.listAllCellIds === 'function'
      ? app.storage.listAllCellIds()
      : [];
  for (var a = 0; a < allCells.length; a++) {
    var entry = allCells[a];
    if (!entry || !entry.sheetId || !entry.cellId) continue;
    if (app.isReportTab(entry.sheetId)) continue;
    var tab = null;
    for (var ti = 0; ti < app.tabs.length; ti++) {
      if (String(app.tabs[ti] && app.tabs[ti].id || '') === String(entry.sheetId)) {
        tab = app.tabs[ti];
        break;
      }
    }
    if (!tab) continue;
    var attachment = resolveCellAttachment(app, entry.sheetId, entry.cellId);
    if (!attachment) continue;
    var fileLabel = getAttachmentDisplayLabel(attachment);
    var location = String(tab.name || '') + '!' + String(entry.cellId || '').toUpperCase();
    addItem(
      'attachment',
      'File: ' + fileLabel + '  ' + location,
      formatAttachmentToken(entry.sheetId, tab.name, entry.cellId),
      fileLabel + ' file attachment ' + location,
    );
  }

  var reportTabs = [];
  for (var t = 0; t < app.tabs.length; t++) {
    var tab = app.tabs[t];
    if (!tab) continue;
    if (app.isReportTab(tab.id)) reportTabs.push(tab);
  }
  if (reportTabs.length) {
    addItem('report', '@report', marker + 'report', 'report default');
  }
  for (var r = 0; r < reportTabs.length; r++) {
    var reportAlias = 'report' + (r + 1);
    addItem(
      'report',
      '@' + reportAlias + '  ' + reportTabs[r].name,
      marker + reportAlias,
      reportTabs[r].name + ' ' + reportAlias,
    );
  }

  for (var s = 0; s < app.tabs.length; s++) {
    var sheet = app.tabs[s];
    if (!sheet || app.isReportTab(sheet.id)) continue;
    var escaped = String(sheet.name || '')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'");
    addItem(
      'sheet',
      '@' + sheet.name + '!A1',
      marker + "'" + escaped + "'!A1",
      sheet.name + ' sheet',
    );
  }

  items.sort(function (a, b) {
    var aw = a.token.toLowerCase().indexOf(target) === marker.length ? 0 : 1;
    var bw = b.token.toLowerCase().indexOf(target) === marker.length ? 0 : 1;
    if (aw !== bw) return aw - bw;
    return a.label.localeCompare(b.label, undefined, {
      sensitivity: 'base',
    });
  });
  return items.slice(0, 16);
}

export function renderMentionAutocompleteList(app) {
  if (!app.mentionAutocompleteState) return;
  var prevUi =
    app.mentionAutocompleteUiState &&
    typeof app.mentionAutocompleteUiState === 'object'
      ? app.mentionAutocompleteUiState
      : null;
  publishMentionAutocompleteUiState(
    app,
    buildMentionAutocompleteUiState({
      visible: true,
      anchorRect:
        prevUi && Number.isFinite(prevUi.left) && Number.isFinite(prevUi.top)
          ? {
              left: prevUi.left,
              bottom: prevUi.top - 4,
              width: Number(prevUi.minWidth || 240),
            }
          : null,
      sourceKind:
        app.mentionAutocompleteState &&
        app.mentionAutocompleteState.input === app.editorOverlayInput
          ? 'overlay'
          : 'default',
      activeIndex: app.mentionAutocompleteState.activeIndex,
      items: app.mentionAutocompleteState.items,
    }),
  );
}

export function positionMentionAutocomplete(app, input) {
  syncMentionAutocompleteUiToAnchor(app, {
    visible: true,
    anchorElement: input,
    anchorCaret: input === app.editorOverlayInput,
    sourceKind: input === app.editorOverlayInput ? 'overlay' : 'default',
    activeIndex:
      app.mentionAutocompleteState &&
      Number.isFinite(app.mentionAutocompleteState.activeIndex)
        ? app.mentionAutocompleteState.activeIndex
        : 0,
    items:
      app.mentionAutocompleteState &&
      Array.isArray(app.mentionAutocompleteState.items)
        ? app.mentionAutocompleteState.items
        : [],
  });
}

export function handleMentionAutocompleteKeydown(app, e, input) {
  if (
    !app.mentionAutocompleteState ||
    (app.mentionAutocompleteState.input !== input &&
      String(app.mentionAutocompleteState.inputId || '') !==
        String((input && input.id) || ''))
  ) {
    return false;
  }
  if (e.key === 'ArrowDown') {
    var downValue = String(input && input.value != null ? input.value : '');
    var downStart =
      input && typeof input.selectionStart === 'number'
        ? input.selectionStart
        : downValue.length;
    var downEnd =
      input && typeof input.selectionEnd === 'number'
        ? input.selectionEnd
        : downValue.length;
    e.preventDefault();
    var next = app.mentionAutocompleteState.activeIndex + 1;
    if (next >= app.mentionAutocompleteState.items.length) next = 0;
    app.mentionAutocompleteState.activeIndex = next;
    renderMentionAutocompleteList(app);
    restoreMentionEditorValue(input, downValue, downStart, downEnd);
    return true;
  }
  if (e.key === 'ArrowUp') {
    var upValue = String(input && input.value != null ? input.value : '');
    var upStart =
      input && typeof input.selectionStart === 'number'
        ? input.selectionStart
        : upValue.length;
    var upEnd =
      input && typeof input.selectionEnd === 'number'
        ? input.selectionEnd
        : upValue.length;
    e.preventDefault();
    var prev = app.mentionAutocompleteState.activeIndex - 1;
    if (prev < 0) prev = app.mentionAutocompleteState.items.length - 1;
    app.mentionAutocompleteState.activeIndex = prev;
    renderMentionAutocompleteList(app);
    restoreMentionEditorValue(input, upValue, upStart, upEnd);
    return true;
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    applyMentionAutocompleteSelection(app, app.mentionAutocompleteState.activeIndex);
    return true;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    hideMentionAutocomplete(app);
    return true;
  }
  return false;
}

import { applyActiveSourceCellEdit } from './source-edit-facade.js';

export function applyMentionAutocompleteSelection(app, index) {
  if (!app.mentionAutocompleteState) return;
  var state = app.mentionAutocompleteState;
  var input = state.input;
  var item = state.items[index];
  if (!input || !item) return hideMentionAutocomplete(app);
  if (state.kind === 'reportEditor') {
    applyReportEditorMentionSelection(app, state, item);
    return;
  }

  var value = String(input.value == null ? '' : input.value);
  var next = value.slice(0, state.start) + item.token + value.slice(state.end);
  input.value = next;
  var caret = state.start + item.token.length;
  if (app && typeof app.setEditorSelectionRange === 'function') {
    app.setEditorSelectionRange(caret, caret, input);
  } else if (typeof input.setSelectionRange === 'function') {
    input.setSelectionRange(caret, caret);
  }
  input.focus();

  if (input === app.formulaInput) {
    if (app.activeInput) {
      app.syncActiveEditorValue(next, { syncOverlay: false });
      applyActiveSourceCellEdit(app, {
        cellId: app.activeInput.id,
        rawValue: next,
      });
    }
  } else if (input === app.editorOverlayInput) {
    if (app.activeInput) {
      app.syncActiveEditorValue(next);
      if (typeof app.updateEditingSessionDraft === 'function') {
        app.updateEditingSessionDraft(next, {
          origin: 'cell',
        });
      }
      if (typeof app.handleCellInputDraft === 'function') {
        app.handleCellInputDraft(app.activeInput, {
          origin: 'cell',
          mentionInput: app.editorOverlayInput,
        });
      }
      if (typeof app.publishUiState === 'function') {
        app.publishUiState();
      }
      if (typeof input.focus === 'function') {
        input.focus();
      }
      if (typeof app.setEditorSelectionRange === 'function') {
        app.setEditorSelectionRange(caret, caret, input);
      } else if (typeof input.setSelectionRange === 'function') {
        input.setSelectionRange(caret, caret);
      }
    }
  } else if (app.activeInput === input && app.formulaInput) {
    app.syncActiveEditorValue(next, { syncOverlay: false });
  }

  hideMentionAutocomplete(app);
}

export function setAvailableChannels(app, channels) {
  app.availableChannels = Array.isArray(channels)
    ? channels
        .map(function (channel) {
          return channel && typeof channel === 'object'
            ? {
                id: String(channel.id || ''),
                label: String(channel.label || '').trim(),
              }
            : null;
        })
        .filter(function (channel) {
          return !!(channel && channel.label);
        })
    : [];
  if (typeof app.syncChannelBindingControl === 'function') {
    app.syncChannelBindingControl();
  }
  if (app.mentionAutocompleteState && app.mentionAutocompleteState.input) {
    updateMentionAutocomplete(app, app.mentionAutocompleteState.input);
  }
}

export function canInsertFormulaMention(app, raw) {
  var text = String(raw == null ? '' : raw).trim();
  if (!text) return false;
  var prefix = text.charAt(0);
  return prefix === '=' || prefix === '#' || prefix === "'";
}

import { getSelectionRangeState } from './selection-range-facade.js';

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

export function buildMentionTokenForSelection(app, fallbackCellId, isRangeMode) {
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

export function clearFormulaMentionPreview(app, input) {
  var inputId = input ? String(input.id || '') : '';
  if (
    app.formulaMentionPreview &&
    (!inputId || app.formulaMentionPreview.inputId === inputId)
  ) {
    app.formulaMentionPreview = null;
  }
}
