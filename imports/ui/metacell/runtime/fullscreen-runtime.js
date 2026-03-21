import { Meteor } from 'meteor/meteor';
import { AI_MODE } from './constants.js';
import {
  getWindowOrigin,
  openExternalWindow,
  printWindow,
  writeClipboardText,
} from './browser-runtime.js';

function wrapSelection(textarea, prefix, suffix, placeholder) {
  if (!textarea) return;
  var value = String(textarea.value || '');
  var start = typeof textarea.selectionStart === 'number' ? textarea.selectionStart : value.length;
  var end = typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : start;
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
  var start = typeof textarea.selectionStart === 'number' ? textarea.selectionStart : value.length;
  var end = typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : start;
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
  if (app.fullscreenEditMode === 'value') {
    app.fullscreenEditor.value = String(app.fullscreenValueDraft || '');
  } else {
    app.fullscreenEditor.value = String(app.fullscreenFormulaDraft || '');
  }
  syncFullscreenModeButtons(app);
  syncFullscreenPreview(app);
}

function syncFullscreenEditingUi(app) {
  if (!app.fullscreenOverlay) return;
  app.fullscreenOverlay.classList.toggle(
    'fullscreen-is-editing',
    !!app.fullscreenIsEditing,
  );
}

function updateFullscreenDraft(app) {
  if (!app.fullscreenEditor) return;
  if (app.fullscreenEditMode === 'value') {
    app.fullscreenValueDraft = String(app.fullscreenEditor.value || '');
  } else {
    app.fullscreenFormulaDraft = String(app.fullscreenEditor.value || '');
  }
}

function setFullscreenEditMode(app, mode) {
  var nextMode = mode === 'value' ? 'value' : 'formula';
  updateFullscreenDraft(app);
  app.fullscreenEditMode = nextMode;
  syncFullscreenEditorFromMode(app);
}

function enterFullscreenEditing(app, mode) {
  app.fullscreenIsEditing = true;
  syncFullscreenEditingUi(app);
  setFullscreenEditMode(app, mode || 'value');
  requestAnimationFrame(() => {
    if (!app.fullscreenEditor) return;
    app.fullscreenEditor.focus();
    app.fullscreenEditor.setSelectionRange(
      app.fullscreenEditor.value.length,
      app.fullscreenEditor.value.length,
    );
  });
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

export function setupFullscreenOverlay(app) {
  var overlay = document.createElement('div');
  overlay.className = 'fullscreen-overlay';
  overlay.style.display = 'none';
  overlay.innerHTML =
    "<div class='fullscreen-panel'>" +
    "<div class='fullscreen-toolbar'>" +
    "<div class='fullscreen-toolbar-group'>" +
    "<span class='fullscreen-cell-label'></span>" +
    "<div class='fullscreen-mode-switch'>" +
    "<button type='button' class='fullscreen-mode-button' data-mode='formula' title='Edit formula'>Formula</button>" +
    "<button type='button' class='fullscreen-mode-button is-active' data-mode='value' title='Edit value'>Value</button>" +
    "</div>" +
    "<div class='fullscreen-preview-toggle'>" +
    "<span class='fullscreen-preview-label'>Preview</span>" +
    "<button type='button' class='fullscreen-edit-toggle' title='Edit' aria-label='Edit'><svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='M12 20h9'></path><path d='M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z'></path></svg></button>" +
    "</div>" +
    "<button type='button' class='fullscreen-md-button' data-cmd='heading' title='Heading'>H</button>" +
    "<button type='button' class='fullscreen-md-button' data-cmd='bold' title='Bold'>B</button>" +
    "<button type='button' class='fullscreen-md-button' data-cmd='italic' title='Italic'>I</button>" +
    "<button type='button' class='fullscreen-md-button' data-cmd='list' title='Bullet list'>List</button>" +
    "<button type='button' class='fullscreen-md-button' data-cmd='link' title='Link'>Link</button>" +
    "<button type='button' class='fullscreen-md-button' data-cmd='code' title='Code'>Code</button>" +
    "</div>" +
    "<div class='fullscreen-toolbar-group'>" +
    "<button type='button' class='fullscreen-save' title='Save'>Save</button>" +
    "<button type='button' class='fullscreen-close' title='Close'>✕</button>" +
    "</div>" +
    "</div>" +
    "<div class='fullscreen-content'>" +
    "<div class='fullscreen-pane fullscreen-pane-editor'>" +
    "<div class='fullscreen-pane-title'>Markdown</div>" +
    "<textarea class='fullscreen-editor' spellcheck='false'></textarea>" +
    "</div>" +
    "<div class='fullscreen-pane fullscreen-pane-preview'>" +
    "<div class='fullscreen-pane-title'>Preview</div>" +
    "<div class='fullscreen-preview'></div>" +
    "</div>" +
    "</div>" +
    "</div>";
  document.body.appendChild(overlay);

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

  overlay.addEventListener('click', (e) => {
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
  document.addEventListener('keydown', (e) => {
    if (
      !app.fullscreenOverlay ||
      app.fullscreenOverlay.style.display === 'none'
    )
      return;
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
    app.fullscreenEditor.addEventListener('input', () => {
      updateFullscreenDraft(app);
      syncFullscreenPreview(app);
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
  )
    return;
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
  if (app.fullscreenCellLabel) {
    app.fullscreenCellLabel.textContent = cellId;
  }
  syncFullscreenEditorFromMode(app);
  syncFullscreenEditingUi(app);
  app.fullscreenOverlay.style.display = 'flex';
}

export function closeFullscreenCell(app) {
  if (!app.fullscreenOverlay || !app.fullscreenOverlayContent) return;
  if (app.fullscreenEditor) app.fullscreenEditor.value = '';
  if (app.fullscreenPreview) app.fullscreenPreview.innerHTML = '';
  if (app.fullscreenCellLabel) app.fullscreenCellLabel.textContent = '';
  app.fullscreenCellId = '';
  app.fullscreenEditMode = 'value';
  app.fullscreenIsEditing = false;
  app.fullscreenFormulaDraft = '';
  app.fullscreenValueDraft = '';
  syncFullscreenEditingUi(app);
  app.fullscreenOverlay.style.display = 'none';
}

export function buildPublishedReportUrl(app) {
  if (!app.sheetDocumentId || !app.activeSheetId || !app.isReportActive())
    return '';
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
  Meteor.defer(() => {
    printWindow();
  });
}
