import { AI_MODE } from './constants.js';
import {
  getWindowOrigin,
  openExternalWindow,
  printWindow,
  writeClipboardText,
} from './browser-runtime.js';
import { focusGridCellInput } from './grid-cell-runtime.js';

function publishFullscreenUi(app) {
  if (app && typeof app.publishUiState === 'function') {
    app.publishUiState();
  }
}

function getFullscreenDraftValue(app) {
  if (app.fullscreenEditMode === 'value') {
    return String(app.fullscreenValueDraft || '');
  }
  return String(app.fullscreenFormulaDraft || '');
}

function wrapSelection(textarea, prefix, suffix, placeholder) {
  if (!textarea) return;
  var value = String(textarea.value || '');
  var start =
    typeof textarea.selectionStart === 'number' ? textarea.selectionStart : value.length;
  var end =
    typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : start;
  var selected = value.slice(start, end) || String(placeholder || '');
  var nextValue =
    value.slice(0, start) + prefix + selected + suffix + value.slice(end);
  textarea.value = nextValue;
  var selectionStart = start + prefix.length;
  var selectionEnd = selectionStart + selected.length;
  textarea.focus();
  textarea.setSelectionRange(selectionStart, selectionEnd);
}

function insertLinePrefix(textarea, prefix) {
  if (!textarea) return;
  var value = String(textarea.value || '');
  var start =
    typeof textarea.selectionStart === 'number' ? textarea.selectionStart : value.length;
  var end =
    typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : start;
  var lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  var lineEndIndex = value.indexOf('\n', end);
  var lineEnd = lineEndIndex >= 0 ? lineEndIndex : value.length;
  var block = value.slice(lineStart, lineEnd);
  var lines = block.split('\n');
  var prefixed = lines
    .map(function (line) {
      return line ? prefix + line : prefix.trimEnd();
    })
    .join('\n');
  textarea.value = value.slice(0, lineStart) + prefixed + value.slice(lineEnd);
  textarea.focus();
  textarea.setSelectionRange(lineStart, lineStart + prefixed.length);
}

function syncFullscreenPreview(app) {
  if (!app.fullscreenEditor || !app.fullscreenPreview) return;
  app.fullscreenPreview.innerHTML = app.renderMarkdown(
    app.fullscreenEditor.value || '',
  );
}

function syncFullscreenModeButtons(app) {
  if (!app.fullscreenModeButtons || !app.fullscreenModeButtons.length) return;
  for (var i = 0; i < app.fullscreenModeButtons.length; i++) {
    var button = app.fullscreenModeButtons[i];
    button.classList.toggle(
      'is-active',
      String(button.dataset.mode || '') === app.fullscreenEditMode,
    );
  }
}

function syncFullscreenEditorFromMode(app) {
  if (!app.fullscreenEditor) return;
  app.fullscreenEditor.value = getFullscreenDraftValue(app);
  syncFullscreenModeButtons(app);
  syncFullscreenPreview(app);
}

function syncFullscreenEditingUi(app) {
  publishFullscreenUi(app);
}

function updateFullscreenDraft(app) {
  if (!app.fullscreenEditor) return;
  if (app.fullscreenEditMode === 'value') {
    app.fullscreenValueDraft = String(app.fullscreenEditor.value || '');
  } else {
    app.fullscreenFormulaDraft = String(app.fullscreenEditor.value || '');
  }
}

function updateFullscreenDraftValue(app, value) {
  var nextValue = String(value == null ? '' : value);
  if (app.fullscreenEditMode === 'value') {
    app.fullscreenValueDraft = nextValue;
  } else {
    app.fullscreenFormulaDraft = nextValue;
  }
  if (app.fullscreenEditor) {
    app.fullscreenEditor.value = nextValue;
  }
  syncFullscreenPreview(app);
  publishFullscreenUi(app);
}

function setFullscreenEditMode(app, mode) {
  var nextMode = mode === 'value' ? 'value' : 'formula';
  updateFullscreenDraft(app);
  app.fullscreenEditMode = nextMode;
  syncFullscreenEditorFromMode(app);
  publishFullscreenUi(app);
}

function enterFullscreenEditing(app, mode) {
  app.fullscreenIsEditing = true;
  syncFullscreenEditingUi(app);
  setFullscreenEditMode(app, mode || 'value');
  requestAnimationFrame(function () {
    if (!app.fullscreenEditor) return;
    app.fullscreenEditor.focus();
    app.fullscreenEditor.setSelectionRange(
      app.fullscreenEditor.value.length,
      app.fullscreenEditor.value.length,
    );
  });
}

export function startFullscreenEditing(app, mode) {
  enterFullscreenEditing(app, mode);
}

function runFullscreenMarkdownCommand(app, command) {
  if (!app.fullscreenEditor || !app.fullscreenIsEditing) return;
  if (command === 'bold') {
    wrapSelection(app.fullscreenEditor, '**', '**', 'bold text');
  } else if (command === 'italic') {
    wrapSelection(app.fullscreenEditor, '*', '*', 'italic text');
  } else if (command === 'heading') {
    insertLinePrefix(app.fullscreenEditor, '# ');
  } else if (command === 'list') {
    insertLinePrefix(app.fullscreenEditor, '- ');
  } else if (command === 'link') {
    wrapSelection(app.fullscreenEditor, '[', '](https://example.com)', 'link text');
  } else if (command === 'code') {
    wrapSelection(app.fullscreenEditor, '`', '`', 'code');
  }
  updateFullscreenDraft(app);
  syncFullscreenPreview(app);
}

function saveFullscreenCell(app) {
  if (!app.fullscreenEditor || !app.fullscreenCellId) return;
  updateFullscreenDraft(app);
  var raw =
    app.fullscreenEditMode === 'value'
      ? String(app.fullscreenValueDraft || '')
      : String(app.fullscreenFormulaDraft || '');
  app.commitRawCellEdit(
    app.fullscreenCellId,
    raw,
    app.beginCellUpdateTrace(app.fullscreenCellId, raw),
  );
  closeFullscreenCell(app);
}

export function setFullscreenDraft(app, value) {
  updateFullscreenDraftValue(app, value);
}

export function setFullscreenMode(app, mode) {
  setFullscreenEditMode(app, mode);
}

export function applyFullscreenMarkdownCommand(app, command) {
  runFullscreenMarkdownCommand(app, command);
  publishFullscreenUi(app);
}

export function saveFullscreenDraft(app) {
  saveFullscreenCell(app);
}

export function setupFullscreenOverlay(app) {
  var overlay = document.querySelector('.fullscreen-overlay');
  if (!overlay) return;

  app.fullscreenOverlay = overlay;
  app.fullscreenOverlayContent = overlay.querySelector('.fullscreen-content');
  app.fullscreenCellLabel = overlay.querySelector('.fullscreen-cell-label');
  app.fullscreenModeButtons = [].slice.call(
    overlay.querySelectorAll('.fullscreen-mode-button'),
  );
  app.fullscreenEditor = overlay.querySelector('.fullscreen-editor');
  app.fullscreenPreview = overlay.querySelector('.fullscreen-preview');
  app.fullscreenCellId = '';
  app.fullscreenEditMode = 'value';
  app.fullscreenIsEditing = false;
  app.fullscreenFormulaDraft = '';
  app.fullscreenValueDraft = '';
  syncFullscreenEditingUi(app);

  overlay.addEventListener('click', function (e) {
    var reactHandledControl =
      e.target && e.target.closest
        ? e.target.closest(
            '.fullscreen-mode-button, .fullscreen-edit-toggle, .fullscreen-md-button, .fullscreen-save, .fullscreen-close',
          )
        : null;
    if (reactHandledControl) {
      return;
    }
    var editToggle =
      e.target && e.target.closest
        ? e.target.closest('.fullscreen-edit-toggle')
        : null;
    if (editToggle) {
      e.preventDefault();
      enterFullscreenEditing(app, 'value');
      return;
    }
    var modeButton =
      e.target && e.target.closest
        ? e.target.closest('.fullscreen-mode-button')
        : null;
    if (modeButton) {
      e.preventDefault();
      setFullscreenEditMode(app, String(modeButton.dataset.mode || 'formula'));
      return;
    }
    var markdownButton =
      e.target && e.target.closest
        ? e.target.closest('.fullscreen-md-button')
        : null;
    if (markdownButton) {
      e.preventDefault();
      runFullscreenMarkdownCommand(
        app,
        String(markdownButton.dataset.cmd || ''),
      );
      return;
    }
    if (
      e.target &&
      e.target.closest &&
      e.target.closest('.fullscreen-save')
    ) {
      e.preventDefault();
      saveFullscreenCell(app);
      return;
    }
    if (
      e.target === overlay ||
      (e.target.closest && e.target.closest('.fullscreen-close'))
    ) {
      closeFullscreenCell(app);
    }
  });
  document.addEventListener('keydown', function (e) {
    if (!app.fullscreenOverlay || app.fullscreenOverlay.hidden) return;
    if (
      app.fullscreenIsEditing &&
      app.fullscreenEditor &&
      document.activeElement === app.fullscreenEditor &&
      app.handleMentionAutocompleteKeydown(e, app.fullscreenEditor)
    ) {
      return;
    }
    if (app.fullscreenIsEditing && (e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      saveFullscreenCell(app);
      return;
    }
    if (e.key !== 'Escape') return;
    e.preventDefault();
    closeFullscreenCell(app);
  });
  if (app.fullscreenEditor) {
    app.fullscreenEditor.addEventListener('input', function () {
      updateFullscreenDraft(app);
      syncFullscreenPreview(app);
      if (app.fullscreenIsEditing && typeof app.updateMentionAutocomplete === 'function') {
        app.updateMentionAutocomplete(app.fullscreenEditor);
      }
    });
    app.fullscreenEditor.addEventListener('blur', function () {
      if (typeof app.hideMentionAutocompleteSoon === 'function') {
        app.hideMentionAutocompleteSoon();
      }
    });
  }
}

export function copyCellValue(app, input) {
  var value = input.parentElement.dataset.computedValue || '';
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    navigator.clipboard.writeText
  ) {
    writeClipboardText(value);
    return;
  }
  var fallback = document.createElement('textarea');
  fallback.value = value;
  document.body.appendChild(fallback);
  fallback.select();
  document.execCommand('copy');
  fallback.remove();
}

export function runFormulaForCell(app, input) {
  if (!input) return;
  if (app.aiService.getMode() !== AI_MODE.manual) return;
  var raw = app.getRawCellValue(input.id);
  if (!raw || (raw.charAt(0) !== '=' && raw.charAt(0) !== '>')) return;
  app.computeAll({ forceRefreshAI: true });
}

export function openFullscreenCell(app, input) {
  if (
    !app.fullscreenOverlay ||
    !app.fullscreenOverlayContent ||
    !app.fullscreenEditor ||
    !app.fullscreenPreview ||
    !input
  ) {
    return;
  }
  var cellId = String(input.id || '').toUpperCase();
  var raw = app.getRawCellValue(cellId);
  var renderedValue = String(input.parentElement.dataset.computedValue || '');
  var storedDisplay = app.storage.getCellDisplayValue(app.activeSheetId, cellId);
  app.fullscreenCellId = cellId;
  app.fullscreenEditMode = 'value';
  app.fullscreenIsEditing = false;
  app.fullscreenFormulaDraft = String(raw == null ? '' : raw);
  app.fullscreenValueDraft = String(
    renderedValue || storedDisplay || (raw == null ? '' : raw),
  );
  syncFullscreenEditorFromMode(app);
  syncFullscreenEditingUi(app);
  publishFullscreenUi(app);
}

export function closeFullscreenCell(app) {
  if (!app.fullscreenOverlay || !app.fullscreenOverlayContent) return;
  var targetCellId = String(app.fullscreenCellId || '').toUpperCase();
  if (app.fullscreenEditor) app.fullscreenEditor.value = '';
  if (app.fullscreenPreview) app.fullscreenPreview.innerHTML = '';
  app.fullscreenCellId = '';
  app.fullscreenEditMode = 'value';
  app.fullscreenIsEditing = false;
  app.fullscreenFormulaDraft = '';
  app.fullscreenValueDraft = '';
  if (typeof app.hideMentionAutocomplete === 'function') {
    app.hideMentionAutocomplete();
  }
  syncFullscreenEditingUi(app);
  publishFullscreenUi(app);
  if (!targetCellId) return;
  requestAnimationFrame(function () {
    var input =
      app && typeof app.getCellInput === 'function'
        ? app.getCellInput(targetCellId)
        : app && app.inputById
          ? app.inputById[targetCellId]
          : null;
    if (!input) return;
    if (app && typeof app.setActiveInput === 'function') {
      app.setActiveInput(input);
    }
    focusGridCellInput(input);
  });
}

export function buildPublishedReportUrl(app) {
  if (!app.sheetDocumentId || !app.activeSheetId || !app.isReportActive()) {
    return '';
  }
  var origin = getWindowOrigin();
  return (
    origin +
    '/report/' +
    encodeURIComponent(app.sheetDocumentId) +
    '/' +
    encodeURIComponent(app.activeSheetId)
  );
}

export function publishCurrentReport(app) {
  if (!app.isReportActive()) return '';
  app.setReportMode('view');
  var url = buildPublishedReportUrl(app);
  if (!url) return '';
  writeClipboardText(url);
  openExternalWindow(url);
  return url;
}

export function exportCurrentReportPdf(app) {
  if (!app.isReportActive()) return;
  app.setReportMode('view');
  setTimeout(function () {
    printWindow();
  }, 0);
}
