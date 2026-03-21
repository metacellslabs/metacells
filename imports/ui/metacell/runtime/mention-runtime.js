export function ensureMentionAutocomplete(app) {
  if (app.mentionAutocomplete) return app.mentionAutocomplete;
  var el = document.createElement('div');
  el.className = 'mention-autocomplete';
  el.style.display = 'none';
  el.innerHTML = "<div class='mention-autocomplete-list'></div>";
  document.body.appendChild(el);
  el.addEventListener('mousedown', (e) => {
    var item =
      e.target && e.target.closest
        ? e.target.closest('.mention-autocomplete-item')
        : null;
    if (!item) return;
    e.preventDefault();
    var idx = parseInt(item.dataset.index || '-1', 10);
    if (isNaN(idx) || idx < 0) return;
    applyMentionAutocompleteSelection(app, idx);
  });
  app.mentionAutocomplete = el;
  return el;
}

export function setupMentionAutocomplete(app) {
  ensureMentionAutocomplete(app);
  document.addEventListener('mousedown', (e) => {
    if (!app.mentionAutocompleteState) return;
    var target = e.target;
    if (!target) return;
    if (app.mentionAutocomplete && app.mentionAutocomplete.contains(target))
      return;
    if (target === app.formulaInput) return;
    if (target.tagName === 'INPUT') {
      hideMentionAutocompleteSoon(app);
      return;
    }
    hideMentionAutocomplete(app);
  });
  window.addEventListener('resize', () => hideMentionAutocomplete(app));
}

export function hideMentionAutocompleteSoon(app) {
  setTimeout(() => hideMentionAutocomplete(app), 120);
}

export function hideMentionAutocomplete(app) {
  if (app.mentionAutocomplete) app.mentionAutocomplete.style.display = 'none';
  app.mentionAutocompleteState = null;
}

export function updateMentionAutocomplete(app, input) {
  if (!input) return hideMentionAutocomplete(app);
  var ctx = getMentionAutocompleteContext(app, input);
  if (!ctx) return hideMentionAutocomplete(app);
  var items = getMentionAutocompleteItems(app, ctx.query, ctx.marker);
  if (!items.length) return hideMentionAutocomplete(app);

  var menu = ensureMentionAutocomplete(app);
  var list = menu.querySelector('.mention-autocomplete-list');
  if (!list) return hideMentionAutocomplete(app);

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
    marker: ctx.marker,
    start: ctx.start,
    end: ctx.end,
    items: items,
    activeIndex: activeIndex,
  };
  renderMentionAutocompleteList(app);
  positionMentionAutocomplete(app, input);
}

export function getMentionAutocompleteContext(app, input) {
  if (!input) return null;
  var range =
    app && typeof app.getEditorSelectionRange === 'function'
      ? app.getEditorSelectionRange(input)
      : {
          start:
            typeof input.selectionStart === 'number' ? input.selectionStart : 0,
          end: typeof input.selectionEnd === 'number' ? input.selectionEnd : 0,
        };
  var start = range.start;
  var end = range.end;
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
  var addItem = (kind, label, token, search) => {
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
    items.sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
    );
    return items.slice(0, 16);
  }

  var named = app.storage.readNamedCells();
  var namedKeys = Object.keys(named || {}).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
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

  var reportTabs = [];
  for (var t = 0; t < app.tabs.length; t++) {
    var tab = app.tabs[t];
    if (!tab) continue;
    if (app.isReportTab(tab.id)) reportTabs.push(tab);
  }
  if (reportTabs.length)
    addItem('report', '@report', marker + 'report', 'report default');
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

  items.sort((a, b) => {
    var aw = a.token.toLowerCase().indexOf(target) === marker.length ? 0 : 1;
    var bw = b.token.toLowerCase().indexOf(target) === marker.length ? 0 : 1;
    if (aw !== bw) return aw - bw;
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  });
  return items.slice(0, 16);
}

export function renderMentionAutocompleteList(app) {
  if (!app.mentionAutocomplete || !app.mentionAutocompleteState) return;
  var list = app.mentionAutocomplete.querySelector(
    '.mention-autocomplete-list',
  );
  if (!list) return;
  list.innerHTML = '';
  for (var i = 0; i < app.mentionAutocompleteState.items.length; i++) {
    var item = app.mentionAutocompleteState.items[i];
    var row = document.createElement('button');
    row.type = 'button';
    row.className =
      'mention-autocomplete-item' +
      (i === app.mentionAutocompleteState.activeIndex ? ' active' : '');
    row.dataset.index = String(i);
    row.textContent = item.label;
    list.appendChild(row);
  }
  app.mentionAutocomplete.style.display = 'block';
}

export function positionMentionAutocomplete(app, input) {
  if (!app.mentionAutocomplete) return;
  var rect = input.getBoundingClientRect();
  var left = rect.left;
  var top = rect.bottom + 4;
  var maxWidth = Math.max(240, rect.width);
  app.mentionAutocomplete.style.left = Math.round(left) + 'px';
  app.mentionAutocomplete.style.top = Math.round(top) + 'px';
  app.mentionAutocomplete.style.minWidth =
    Math.round(Math.min(maxWidth, 460)) + 'px';
}

export function handleMentionAutocompleteKeydown(app, e, input) {
  if (
    !app.mentionAutocompleteState ||
    app.mentionAutocompleteState.input !== input
  )
    return false;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    var next = app.mentionAutocompleteState.activeIndex + 1;
    if (next >= app.mentionAutocompleteState.items.length) next = 0;
    app.mentionAutocompleteState.activeIndex = next;
    renderMentionAutocompleteList(app);
    return true;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    var prev = app.mentionAutocompleteState.activeIndex - 1;
    if (prev < 0) prev = app.mentionAutocompleteState.items.length - 1;
    app.mentionAutocompleteState.activeIndex = prev;
    renderMentionAutocompleteList(app);
    return true;
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    applyMentionAutocompleteSelection(
      app,
      app.mentionAutocompleteState.activeIndex,
    );
    return true;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    hideMentionAutocomplete(app);
    return true;
  }
  return false;
}

export function applyMentionAutocompleteSelection(app, index) {
  if (!app.mentionAutocompleteState) return;
  var state = app.mentionAutocompleteState;
  var input = state.input;
  var item = state.items[index];
  if (!input || !item) return hideMentionAutocomplete(app);

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
      app.setRawCellValue(app.activeInput.id, next);
    }
  } else if (input === app.editorOverlayInput) {
    if (app.activeInput) {
      app.syncActiveEditorValue(next);
    }
  } else if (app.activeInput === input) {
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

export function buildMentionTokenForSelection(
  app,
  fallbackCellId,
  isRangeMode,
) {
  var sheetPrefix = getMentionSheetPrefix(app);
  if (!isRangeMode || !app.selectionRange) {
    var localLabel = app.getPreferredMentionLabel(
      String(fallbackCellId).toUpperCase(),
    );
    if (sheetPrefix)
      return '@' + sheetPrefix + String(fallbackCellId).toUpperCase();
    return '@' + localLabel;
  }
  var startCellId = app.formatCellId(
    app.selectionRange.startCol,
    app.selectionRange.startRow,
  );
  var endCellId = app.formatCellId(
    app.selectionRange.endCol,
    app.selectionRange.endRow,
  );
  if (startCellId === endCellId) {
    if (sheetPrefix) return '@' + sheetPrefix + startCellId;
    return '@' + app.getPreferredMentionLabel(startCellId);
  }
  if (sheetPrefix) return '@' + sheetPrefix + startCellId + ':' + endCellId;
  return '@' + startCellId + ':' + endCellId;
}

export function getMentionSheetPrefix(app) {
  if (!app.crossTabMentionContext) return '';
  if (app.activeSheetId === app.crossTabMentionContext.sourceSheetId) return '';
  var tab = app.findTabById(app.activeSheetId);
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

export function clearFormulaMentionPreview(app) {
  app.formulaMentionPreview = null;
}
