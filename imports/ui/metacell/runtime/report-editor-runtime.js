import { setupReportLiveInteractions } from './report-live-runtime.js';
import { renderReportLiveValues } from './report-render-runtime.js';
import { setupReportToolbarCommands } from './report-toolbar-runtime.js';
import {
  publishMentionAutocompleteUiState,
  syncMentionAutocompleteUiToAnchor,
} from './mention-autocomplete-facade.js';

const REPORT_EDITOR_PLACEHOLDER =
  'Select text to format. Mentions: Sheet 1:A1, @named_cell, region @Sheet 1!A1:B10. Inputs: Input:Sheet 1!A1 or Input:@named_cell';

function getReportTabId(app) {
  if (!app || !Array.isArray(app.tabs)) return '';
  for (var i = 0; i < app.tabs.length; i++) {
    var tab = app.tabs[i];
    if (!tab || typeof tab !== 'object') continue;
    if (tab.type === 'report' || String(tab.id || '') === 'report') {
      return String(tab.id || '');
    }
  }
  return app && app.isReportActive && app.isReportActive()
    ? String(app.activeSheetId || '')
    : '';
}

export function syncReportContentToStorage(app) {
  if (!app || !app.reportEditor || !app.storage) return false;
  var reportTabId = getReportTabId(app);
  if (!reportTabId) return false;
  app.storage.setReportContent(reportTabId, app.reportEditor.innerHTML);
  app.reportEditorLoadedTabId = reportTabId;
  return true;
}

function refreshReportDomRefs(app) {
  if (typeof document === 'undefined') return;
  app.reportWrap = document.querySelector('.report-wrap');
  app.reportEditor = document.querySelector('#report-editor');
  app.reportLive = document.querySelector('#report-live');
}

function isEditorContentEmpty(editor) {
  if (!editor) return true;
  var text = String(editor.textContent || '').replace(/\u00a0/g, ' ').trim();
  if (text) return false;
  var hasMeaningfulNode = Array.from(editor.querySelectorAll('*')).some((node) => {
    if (!node || !(node instanceof HTMLElement)) return false;
    return node.tagName === 'IMG' || node.tagName === 'IFRAME';
  });
  return !hasMeaningfulNode;
}

function syncReportEditorPlaceholder(app) {
  if (!app || !app.reportEditor) return;
  app.reportEditor.dataset.placeholder = REPORT_EDITOR_PLACEHOLDER;
  app.reportEditor.dataset.empty = isEditorContentEmpty(app.reportEditor)
    ? 'true'
    : 'false';
}

function updateReportMentionAutocompleteUi(app, payload) {
  publishMentionAutocompleteUiState(app, payload);
}

function hideReportMentionAutocomplete(app) {
  app.mentionAutocompleteState = null;
  updateReportMentionAutocompleteUi(app, null);
}

function getReportEditorMentionContext(editor) {
  if (
    typeof window === 'undefined' ||
    !editor ||
    typeof window.getSelection !== 'function'
  ) {
    return null;
  }
  var selection = window.getSelection();
  if (!selection || selection.rangeCount < 1 || !selection.isCollapsed) {
    return null;
  }
  var range = selection.getRangeAt(0);
  var container = range.startContainer;
  var offset = range.startOffset;
  if (!editor.contains(container)) return null;

  if (container.nodeType === Node.ELEMENT_NODE) {
    var previous =
      offset > 0 && container.childNodes ? container.childNodes[offset - 1] : null;
    if (previous && previous.nodeType === Node.TEXT_NODE) {
      container = previous;
      offset = String(previous.nodeValue || '').length;
    } else {
      return null;
    }
  }

  if (container.nodeType !== Node.TEXT_NODE) return null;
  if (
    container.parentElement &&
    container.parentElement.closest &&
    container.parentElement.closest(
      'code, pre, a, button, .report-linked-input, .report-file-shell',
    )
  ) {
    return null;
  }

  var left = String(container.nodeValue || '').slice(0, offset);
  var match = /(^|[^A-Za-z0-9_])(@@?|\/)([A-Za-z0-9_-]*)$/.exec(left);
  if (!match) return null;
  var marker = match[2];
  var query = match[3] || '';
  return {
    marker: marker,
    query: query,
    textNode: container,
    startOffset: offset - (marker.length + query.length),
    endOffset: offset,
    range: range.cloneRange(),
  };
}

function updateReportMentionAutocomplete(app) {
  if (!app || !app.reportEditor || app.reportMode !== 'edit') {
    hideReportMentionAutocomplete(app);
    return;
  }
  if (
    app.suppressReportMentionAutocompleteUntil &&
    Date.now() < Number(app.suppressReportMentionAutocompleteUntil)
  ) {
    hideReportMentionAutocomplete(app);
    return;
  }
  app.suppressReportMentionAutocompleteUntil = 0;
  var ctx = getReportEditorMentionContext(app.reportEditor);
  if (!ctx) {
    hideReportMentionAutocomplete(app);
    return;
  }
  var items =
    typeof app.getMentionAutocompleteItems === 'function'
      ? app.getMentionAutocompleteItems(ctx.query, ctx.marker)
      : [];
  if (!items || !items.length) {
    hideReportMentionAutocomplete(app);
    return;
  }
  var rect =
    ctx.range && typeof ctx.range.getBoundingClientRect === 'function'
      ? ctx.range.getBoundingClientRect()
      : null;
  var editorRect =
    typeof app.reportEditor.getBoundingClientRect === 'function'
      ? app.reportEditor.getBoundingClientRect()
      : null;
  var activeIndex =
    app.mentionAutocompleteState &&
    app.mentionAutocompleteState.kind === 'reportEditor' &&
    app.mentionAutocompleteState.textNode === ctx.textNode &&
    Array.isArray(app.mentionAutocompleteState.items)
      ? Math.min(
          Math.max(Number(app.mentionAutocompleteState.activeIndex) || 0, 0),
          items.length - 1,
        )
      : 0;
  app.mentionAutocompleteState = {
    kind: 'reportEditor',
    input: app.reportEditor,
    inputId: 'report-editor',
    marker: ctx.marker,
    items: items,
    activeIndex: activeIndex,
    textNode: ctx.textNode,
    startOffset: ctx.startOffset,
    endOffset: ctx.endOffset,
  };
  syncMentionAutocompleteUiToAnchor(app, {
    visible: true,
    anchorRect: rect,
    fallbackRect: editorRect,
    sourceKind: 'report',
    activeIndex: activeIndex,
    items: items,
  });
}

export function setupReportControls(app) {
  refreshReportDomRefs(app);
  if (!app.reportEditor || !app.reportWrap) return;

  var reportTabId = getReportTabId(app);
  if (String(app.reportEditorLoadedTabId || '') !== String(reportTabId || '')) {
    app.reportEditor.innerHTML = app.storage.getReportContent(reportTabId) || '';
    app.reportEditorLoadedTabId = reportTabId;
  }
  syncReportEditorPlaceholder(app);

  if (app.reportEditor.dataset.reportInputBound !== 'true') {
    app.reportEditor.dataset.reportInputBound = 'true';
    app.reportEditor.addEventListener('input', function () {
      if (!app.isReportActive()) return;
      syncReportEditorPlaceholder(app);
      app.captureHistorySnapshot('report:' + (getReportTabId(app) || app.activeSheetId));
      syncReportContentToStorage(app);
      app.renderReportLiveValues();
      updateReportMentionAutocomplete(app);
    });
    app.reportEditor.addEventListener('blur', function () {
      syncReportEditorPlaceholder(app);
      syncReportContentToStorage(app);
      if (typeof app.hideMentionAutocompleteSoon === 'function') {
        app.hideMentionAutocompleteSoon();
      }
    });
    app.reportEditor.addEventListener('keydown', function (event) {
      if (
        typeof app.handleMentionAutocompleteKeydown === 'function' &&
        app.handleMentionAutocompleteKeydown(event, app.reportEditor)
      ) {
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
          event.stopImmediatePropagation();
        }
        return;
      }
    });
    app.reportEditor.addEventListener('keyup', function () {
      updateReportMentionAutocomplete(app);
    });
    app.reportEditor.addEventListener('click', function () {
      updateReportMentionAutocomplete(app);
    });
  }

  setupReportToolbarCommands(app);
  setupReportLiveInteractions(app);

  app.setReportMode('view');
  app.renderReportLiveValues();
}

export function setReportMode(app, mode) {
  app.reportMode = mode === 'view' ? 'view' : 'edit';
  var isView = app.reportMode === 'view';
  if (isView) {
    syncReportContentToStorage(app);
  }
  if (app.reportWrap && app.reportWrap.classList) {
    app.reportWrap.classList.toggle('report-mode-view', isView);
    app.reportWrap.classList.toggle('report-mode-edit', !isView);
  }

  if (isView) {
    app.renderReportLiveValues(true);
  }

  if (!isView) app.lastReportLiveHtml = '';
  syncReportEditorPlaceholder(app);
  if (typeof app.publishUiState === 'function') {
    app.publishUiState();
  }
  if (
    !isView &&
    app.reportEditor &&
    typeof requestAnimationFrame === 'function'
  ) {
    requestAnimationFrame(function () {
      if (!app.reportEditor || app.reportMode !== 'edit') return;
      var isEmptyEditor = isEditorContentEmpty(app.reportEditor);
      app.reportEditor.focus();
      if (isEmptyEditor) return;
      if (
        typeof window !== 'undefined' &&
        typeof document !== 'undefined' &&
        typeof document.createRange === 'function' &&
        typeof window.getSelection === 'function'
      ) {
        var selection = window.getSelection();
        if (!selection) return;
        var range = document.createRange();
        range.selectNodeContents(app.reportEditor);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    });
  }
}
