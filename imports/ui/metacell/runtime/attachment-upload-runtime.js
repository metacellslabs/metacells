import { rpc } from '../../../../lib/rpc-client.js';
import {
  canPreviewAttachmentFile,
  openAttachmentContentPreview,
  openAttachmentFilePreview,
} from './attachment-preview-runtime.js';
import {
  buildAttachmentHref,
  getAttachmentDisplayLabel,
} from './attachment-render-runtime.js';
import {
  resolveCellAttachment,
  restoreAttachmentCellSource,
  setPendingAttachmentCell,
  setResolvedAttachmentCell,
} from './attachment-cell-facade.js';
import {
  clearAttachmentToPlaceholder,
  startAttachmentSelectionFromSource,
} from './attachment-selection-facade.js';
import { ensureAttachFileInputBinding } from './attachment-picker-facade.js';
import { applyComputedCellRender } from './compute-render-runtime.js';
import {
  ensureGridCellChrome,
  getDirectGridCellChild,
} from './grid-cell-runtime.js';

function getVisibleSheetId(app) {
  return typeof app.getVisibleSheetId === 'function'
    ? String(app.getVisibleSheetId() || '')
    : String(app.activeSheetId || '');
}

function getAttachmentDisplayValue(app, rawValue) {
  var raw = String(rawValue == null ? '' : rawValue);
  var attachment = app.parseAttachmentSource(raw);
  if (!attachment) return raw;
  return getAttachmentDisplayLabel(attachment);
}

function isFormulaAttachmentPreviewRaw(rawValue) {
  return /^\s*=\s*(PDF|DOCX|FILE)\s*\(/i.test(String(rawValue || ''));
}

function syncActiveAttachmentValue(app, cellId, rawValue) {
  if (String(app.activeCellId || '') !== String(cellId || '').toUpperCase()) {
    return;
  }
  var displayValue = getAttachmentDisplayValue(app, rawValue);
  app.syncActiveEditorValue(displayValue);
}

function refreshAttachmentUi(app, sheetId) {
  if (!app) return;
  var visibleSheetId = getVisibleSheetId(app);
  var targetSheetId = String(sheetId || visibleSheetId || '');
  if (
    targetSheetId &&
    visibleSheetId === targetSheetId &&
    typeof app.renderCurrentSheetFromStorage === 'function'
  ) {
    app.renderCurrentSheetFromStorage();
    return;
  }
  if (typeof app.renderReportLiveValues === 'function') {
    app.renderReportLiveValues(true);
  }
}

function forceRenderAttachmentCell(app, sheetId, cellId) {
  if (!app || !cellId) return;
  var targetSheetId = String(sheetId || getVisibleSheetId(app) || '');
  var targetCellId = String(cellId || '').toUpperCase();
  if (!targetSheetId || !targetCellId) return;
  if (getVisibleSheetId(app) !== targetSheetId) return;
  var input =
    typeof app.getCellInput === 'function'
      ? app.getCellInput(targetCellId)
      : app.inputById
      ? app.inputById[targetCellId]
        : null;
  if (!input) return;
  if (input.parentElement) {
    input.parentElement.removeAttribute('data-render-signature');
  }
  if (
    app.cellContentStore &&
    typeof app.cellContentStore.resetCell === 'function'
  ) {
    app.cellContentStore.resetCell(targetCellId);
  }
  var raw = app.storage.getCellValue(targetSheetId, targetCellId);
  var attachment = app.parseAttachmentSource(raw);
  if (input.parentElement && attachment) {
    ensureGridCellChrome(input.parentElement, input);
    var directOutput = getDirectGridCellChild(input.parentElement, 'cell-output');
    if (directOutput) {
      directOutput.innerHTML = app.grid.renderAttachmentValue(attachment);
    }
  }
  try {
    applyComputedCellRender(app, input, {
      showFormulas: app.displayMode === 'formulas',
      raw: raw,
      storedDisplay: app.storage.getCellDisplayValue(targetSheetId, targetCellId),
      storedComputed: app.storage.getCellComputedValue(targetSheetId, targetCellId),
      cellState: app.storage.getCellState(targetSheetId, targetCellId),
      errorHint: app.storage.getCellError(targetSheetId, targetCellId),
      generatedBy: app.storage.getGeneratedCellSource(targetSheetId, targetCellId),
    });
  } catch (_error) {}
}

function revealAttachmentCell(app, sheetId, cellId) {
  if (!app || !app.grid) return;
  var targetSheetId = String(sheetId || '');
  var targetCellId = String(cellId || '').toUpperCase();
  if (!targetSheetId || !targetCellId) return;
  if (getVisibleSheetId(app) !== targetSheetId) return;
  var input =
    typeof app.getCellInput === 'function'
      ? app.getCellInput(targetCellId)
      : app.inputById
        ? app.inputById[targetCellId]
        : null;
  if (!input || typeof app.grid.setEditing !== 'function') return;
  app.grid.setEditing(input, false);
}

function getClipboardFile(clipboardData) {
  if (!clipboardData) return null;
  var items = clipboardData.items;
  if (items && typeof items.length === 'number') {
    for (var index = 0; index < items.length; index++) {
      var item = items[index];
      if (!item || item.kind !== 'file' || typeof item.getAsFile !== 'function') {
        continue;
      }
      var file = item.getAsFile();
      if (file) return file;
    }
  }
  var files = clipboardData.files;
  if (files && typeof files.length === 'number' && files.length > 0) {
    return files[0] || null;
  }
  return null;
}

function hasClipboardFileSignal(clipboardData) {
  if (!clipboardData) return false;
  if (
    clipboardData.files &&
    typeof clipboardData.files.length === 'number' &&
    clipboardData.files.length > 0
  ) {
    return true;
  }
  var types = clipboardData.types;
  if (!types || typeof types.length !== 'number') return false;
  for (var index = 0; index < types.length; index++) {
    var type = String(types[index] || '').toLowerCase();
    if (
      type === 'files' ||
      type === 'text/uri-list' ||
      type === 'public.file-url'
    ) {
      return true;
    }
  }
  return false;
}

function getClipboardFileUrl(clipboardData) {
  if (!clipboardData || typeof clipboardData.getData !== 'function') return '';
  var uriList = String(clipboardData.getData('text/uri-list') || '').trim();
  if (uriList) {
    var lines = uriList
      .split(/\r?\n/)
      .map(function (line) {
        return String(line || '').trim();
      })
      .filter(function (line) {
        return !!line && line.charAt(0) !== '#';
      });
    if (lines.length) return lines[0];
  }
  return String(clipboardData.getData('public.file-url') || '').trim();
}

function inferAttachmentNameFromUrl(fileUrl) {
  var value = String(fileUrl || '').trim();
  if (!value) return '';
  try {
    var normalized = value.replace(/^file:\/\//i, '');
    var lastSegment = normalized.split(/[\\/]/).pop() || '';
    return decodeURIComponent(String(lastSegment || '').trim());
  } catch (_error) {
    var fallback = value.split(/[\\/]/).pop() || '';
    return String(fallback || '').trim();
  }
}

function readClipboardFileFallback() {
  try {
    if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
      return Promise.resolve(null);
    }
    return navigator.clipboard.read().then(function (items) {
      var list = Array.isArray(items) ? items : [];
      for (var itemIndex = 0; itemIndex < list.length; itemIndex++) {
        var item = list[itemIndex];
        var itemTypes = Array.isArray(item && item.types) ? item.types : [];
        for (var typeIndex = 0; typeIndex < itemTypes.length; typeIndex++) {
          var type = String(itemTypes[typeIndex] || '').toLowerCase();
          if (!type || type.indexOf('image/') === 0 || type === 'application/pdf') {
            return item.getType(itemTypes[typeIndex]).then(function (blob) {
              if (!blob) return null;
              var fallbackType = String(blob.type || 'application/octet-stream');
              var extension =
                fallbackType.indexOf('image/png') === 0
                  ? '.png'
                  : fallbackType.indexOf('image/jpeg') === 0
                    ? '.jpg'
                    : fallbackType.indexOf('application/pdf') === 0
                      ? '.pdf'
                      : '';
              var fileName = 'Pasted file' + extension;
              try {
                return new File([blob], fileName, { type: fallbackType });
              } catch (error) {
                blob.name = fileName;
                return blob;
              }
            });
          }
        }
      }
      return null;
    }).catch(function () {
      return null;
    });
  } catch (error) {
    return Promise.resolve(null);
  }
}

async function applyAttachmentFileToCell(app, ctx, file) {
  if (!app || !ctx || !file) return false;
  try {
    setPendingAttachmentCell(app, {
      sheetId: ctx.sheetId,
      cellId: ctx.cellId,
      payload: {
        name: file.name || 'Attached file',
        type: file.type || '',
        pending: true,
        converting: true,
      },
    });
    syncActiveAttachmentValue(
      app,
      ctx.cellId,
      app.storage.getCellValue(ctx.sheetId, ctx.cellId),
    );
    revealAttachmentCell(app, ctx.sheetId, ctx.cellId);
    refreshAttachmentUi(app, ctx.sheetId);

    var base64 = await file.arrayBuffer().then(function (buffer) {
      return arrayBufferToBase64(app, buffer);
    });
    var extracted = await readAttachedFileContent(app, file, base64);
    setResolvedAttachmentCell(app, {
      sheetId: ctx.sheetId,
      cellId: ctx.cellId,
      payload: {
        name: file.name || 'Attached file',
        type: file.type || '',
        content: extracted && extracted.content,
        contentArtifactId: extracted && extracted.contentArtifactId,
        binaryArtifactId: extracted && extracted.binaryArtifactId,
        downloadUrl: extracted && extracted.downloadUrl,
        previewUrl: extracted && extracted.previewUrl,
        pending: false,
      },
    });
    if (typeof app.computeAll === 'function') {
      app.computeAll({
        bypassPendingEdit: true,
        skipExpectedRevision: true,
        forceRefreshAI: true,
      });
    }
    syncActiveAttachmentValue(
      app,
      ctx.cellId,
      app.storage.getCellValue(ctx.sheetId, ctx.cellId),
    );
    revealAttachmentCell(app, ctx.sheetId, ctx.cellId);
    forceRenderAttachmentCell(app, ctx.sheetId, ctx.cellId);
    refreshAttachmentUi(app, ctx.sheetId);
    return true;
  } catch (error) {
    console.error('[attachment] applyAttachmentFileToCell.failed', {
      sheetId: String(ctx && ctx.sheetId || ''),
      cellId: String(ctx && ctx.cellId || ''),
      fileName: String(file && file.name || ''),
      fileType: String(file && file.type || ''),
      message: error && error.message ? error.message : String(error),
    });
    restoreAttachmentCellSource(app, {
      sheetId: ctx.sheetId,
      cellId: ctx.cellId,
      rawValue: ctx.previousValue,
    });
    syncActiveAttachmentValue(app, ctx.cellId, ctx.previousValue);
    revealAttachmentCell(app, ctx.sheetId, ctx.cellId);
    refreshAttachmentUi(app, ctx.sheetId);
    window.alert(
      error && error.message ? error.message : 'Failed to read file',
    );
    return false;
  }
}

async function applyAttachmentResultToCell(app, ctx, result) {
  if (!app || !ctx || !result) return false;
  setResolvedAttachmentCell(app, {
    sheetId: ctx.sheetId,
    cellId: ctx.cellId,
    payload: {
      name: result && result.name,
      type: result && result.type,
      content: result && result.content,
      contentArtifactId: result && result.contentArtifactId,
      binaryArtifactId: result && result.binaryArtifactId,
      downloadUrl: result && result.downloadUrl,
      previewUrl: result && result.previewUrl,
      pending: false,
    },
  });
  if (typeof app.computeAll === 'function') {
    app.computeAll({
      bypassPendingEdit: true,
      skipExpectedRevision: true,
      forceRefreshAI: true,
    });
  }
  syncActiveAttachmentValue(
    app,
    ctx.cellId,
    app.storage.getCellValue(ctx.sheetId, ctx.cellId),
  );
  revealAttachmentCell(app, ctx.sheetId, ctx.cellId);
  forceRenderAttachmentCell(app, ctx.sheetId, ctx.cellId);
  refreshAttachmentUi(app, ctx.sheetId);
  return true;
}

export function prepareActiveCellAttachmentSelection(app) {
  if (!app) return false;
  var cellId = '';
  if (typeof app.getSelectionActiveCellId === 'function') {
    cellId = String(app.getSelectionActiveCellId() || '').toUpperCase();
  }
  if (!cellId && app.activeInput && app.activeInput.id) {
    cellId = String(app.activeInput.id || '').toUpperCase();
  }
  if (!cellId) {
    cellId = String(app.activeCellId || '').toUpperCase();
  }
  var visibleSheetId = getVisibleSheetId(app);
  if (!app.hasSingleSelectedCell() || !cellId) return false;
  var previousValue = app.getRawCellValue(cellId);
  var started = startAttachmentSelectionFromSource(app, {
    sheetId: visibleSheetId,
    cellId: cellId,
    previousValue: String(previousValue == null ? '' : previousValue),
    showPendingPlaceholder: !resolveCellAttachment(app, visibleSheetId, cellId),
    renderMode: 'sheet',
  });
  if (!started) return false;
  syncActiveAttachmentValue(
    app,
    cellId,
    app.storage.getCellValue(visibleSheetId, cellId),
  );
  revealAttachmentCell(app, visibleSheetId, cellId);
  forceRenderAttachmentCell(app, visibleSheetId, cellId);
  refreshAttachmentUi(app, visibleSheetId);
  return true;
}

export async function commitPendingAttachmentSelection(app, file) {
  if (!app) return false;
  var ctx = app.pendingAttachmentContext;
  app.pendingAttachmentContext = null;
  app.pendingAttachmentPickerState = null;
  if (!ctx) return false;
  if (!file) {
    restoreAttachmentCellSource(app, {
      sheetId: ctx.sheetId,
      cellId: ctx.cellId,
      rawValue: ctx.previousValue,
      renderMode: String(ctx.renderMode || ''),
    });
    syncActiveAttachmentValue(app, ctx.cellId, ctx.previousValue);
    revealAttachmentCell(app, ctx.sheetId, ctx.cellId);
    refreshAttachmentUi(app, ctx.sheetId);
    return false;
  }
  return applyAttachmentFileToCell(app, ctx, file);
}

export function arrayBufferToBase64(app, buffer) {
  var bytes = new Uint8Array(buffer || new ArrayBuffer(0));
  var chunkSize = 0x8000;
  var binary = '';
  for (var i = 0; i < bytes.length; i += chunkSize) {
    var chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return window.btoa(binary);
}

export function readAttachedFileContent(app, file, preparedBase64) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    return Promise.reject(new Error('Failed to read file'));
  }
  var base64Promise =
    typeof preparedBase64 === 'string' && preparedBase64
      ? Promise.resolve(preparedBase64)
      : file.arrayBuffer().then(function (buffer) {
          return arrayBufferToBase64(app, buffer);
        });
  return base64Promise
    .then(function (base64) {
      return rpc(
        'files.extractContent',
        String(file.name || 'Attached file'),
        String(file.type || ''),
        base64,
      );
    })
    .then(function (result) {
      return {
        content: String(result && result.content != null ? result.content : ''),
        contentArtifactId: String((result && result.contentArtifactId) || ''),
        binaryArtifactId: String((result && result.binaryArtifactId) || ''),
        downloadUrl: String((result && result.downloadUrl) || ''),
        previewUrl: String((result && result.previewUrl) || ''),
      };
    });
}

export function handleAttachmentPaste(app, input, clipboardData) {
  if (!app || !input) return false;
  var cellId = String(input.id || '').toUpperCase();
  var visibleSheetId = getVisibleSheetId(app);
  if (!cellId || !visibleSheetId) return false;
  var previousValue = app.getRawCellValue(cellId);
  var ctx = {
    sheetId: visibleSheetId,
    cellId: cellId,
    previousValue: String(previousValue == null ? '' : previousValue),
  };
  var file = getClipboardFile(clipboardData);
  if (file) {
    void applyAttachmentFileToCell(app, ctx, file);
    return true;
  }
  var fileUrl = getClipboardFileUrl(clipboardData);
  if (fileUrl) {
    var inferredName = inferAttachmentNameFromUrl(fileUrl);
    setPendingAttachmentCell(app, {
      sheetId: ctx.sheetId,
      cellId: ctx.cellId,
      payload: {
        name: inferredName || 'Attached file',
        pending: true,
        converting: true,
      },
    });
    syncActiveAttachmentValue(
      app,
      ctx.cellId,
      app.storage.getCellValue(ctx.sheetId, ctx.cellId),
    );
    revealAttachmentCell(app, ctx.sheetId, ctx.cellId);
    forceRenderAttachmentCell(app, ctx.sheetId, ctx.cellId);
    refreshAttachmentUi(app, ctx.sheetId);
    void rpc('files.extractContentFromPath', fileUrl)
      .then(function (result) {
        if (!result) return false;
        return applyAttachmentResultToCell(app, ctx, result);
      })
      .catch(function () {
        restoreAttachmentCellSource(app, {
          sheetId: ctx.sheetId,
          cellId: ctx.cellId,
          rawValue: ctx.previousValue,
        });
        syncActiveAttachmentValue(app, ctx.cellId, ctx.previousValue);
        revealAttachmentCell(app, ctx.sheetId, ctx.cellId);
        forceRenderAttachmentCell(app, ctx.sheetId, ctx.cellId);
        refreshAttachmentUi(app, ctx.sheetId);
      });
    return true;
  }
  if (!hasClipboardFileSignal(clipboardData)) return false;
  void readClipboardFileFallback().then(function (fallbackFile) {
    if (!fallbackFile) return;
    return applyAttachmentFileToCell(app, ctx, fallbackFile);
  });
  return true;
}

export function pasteAttachmentFromSystemClipboard(app, input) {
  if (!app || !input) return Promise.resolve(false);
  var cellId = String(input.id || '').toUpperCase();
  var visibleSheetId = getVisibleSheetId(app);
  if (!cellId || !visibleSheetId) return Promise.resolve(false);
  var previousValue = app.getRawCellValue(cellId);
  var ctx = {
    sheetId: visibleSheetId,
    cellId: cellId,
    previousValue: String(previousValue == null ? '' : previousValue),
  };
  return readClipboardFileFallback().then(function (file) {
    if (!file) return false;
    return applyAttachmentFileToCell(app, ctx, file).then(function () {
      return true;
    });
  });
}

export function setupAttachmentUploadControls(app) {
  app.syncAttachButtonState();

  if (app.table) {
    app.table.addEventListener('click', function (e) {
      var contentPreviewButton =
        e.target && e.target.closest
          ? e.target.closest(
              '.attachment-content-preview, .generated-attachment-content-preview',
            )
          : null;
      var downloadLink =
        e.target && e.target.closest
          ? e.target.closest('.attachment-download')
          : null;
      var selectButton =
        e.target && e.target.closest
          ? e.target.closest('.attachment-select')
          : null;
      var removeButton =
        e.target && e.target.closest
          ? e.target.closest('.attachment-remove')
          : null;
      if (contentPreviewButton) {
        var previewTd =
          e.target && e.target.closest ? e.target.closest('td') : null;
        var previewInput = previewTd
          ? previewTd.querySelector('.cell-anchor-input')
          : null;
        if (!previewInput) return;
        e.preventDefault();
        e.stopPropagation();
        openAttachmentContentPreview(
          app,
          getVisibleSheetId(app),
          String(previewInput.id || '').toUpperCase(),
        );
        return;
      }
      if (downloadLink) {
        e.stopPropagation();
        return;
      }
      if (!selectButton && !removeButton) return;
      var td = e.target && e.target.closest ? e.target.closest('td') : null;
      var input = td ? td.querySelector('.cell-anchor-input') : null;
      if (!input) return;
      e.preventDefault();
      e.stopPropagation();
      app.setActiveInput(input);
      if (removeButton) {
        var visibleSheetId = getVisibleSheetId(app);
        clearAttachmentToPlaceholder(app, {
          sheetId: visibleSheetId,
          cellId: String(input.id || '').toUpperCase(),
          withHistory: true,
          clearComputed: true,
          renderMode: 'sheet',
        });
        syncActiveAttachmentValue(
          app,
          input.id,
          app.storage.getCellValue(
            visibleSheetId,
            String(input.id || '').toUpperCase(),
          ),
        );
        revealAttachmentCell(
          app,
          visibleSheetId,
          String(input.id || '').toUpperCase(),
        );
        forceRenderAttachmentCell(
          app,
          visibleSheetId,
          String(input.id || '').toUpperCase(),
        );
        refreshAttachmentUi(app, visibleSheetId);
        return;
      }
      var visibleSheetId = getVisibleSheetId(app);
      var existingAttachment = resolveCellAttachment(
        app,
        visibleSheetId,
        String(input.id || '').toUpperCase(),
      );
      if (existingAttachment && !existingAttachment.pending) {
        if (canPreviewAttachmentFile(existingAttachment)) {
          openAttachmentFilePreview(
            app,
            visibleSheetId,
            String(input.id || '').toUpperCase(),
            input,
          );
          return;
        }
        if (String(existingAttachment.content || '').trim()) {
          openAttachmentContentPreview(
            app,
            visibleSheetId,
            String(input.id || '').toUpperCase(),
          );
          return;
        }
      }
      var rawValue = app.getRawCellValue(input.id);
      if (isFormulaAttachmentPreviewRaw(rawValue)) {
        return;
      }
      var previousRaw = app.getRawCellValue(input.id);
      startAttachmentSelectionFromSource(app, {
        sheetId: visibleSheetId,
        cellId: String(input.id || '').toUpperCase(),
        previousValue: String(previousRaw == null ? '' : previousRaw),
        showPendingPlaceholder: !resolveCellAttachment(
          app,
          visibleSheetId,
          String(input.id || '').toUpperCase(),
        ),
        renderMode: 'sheet',
      });
    });
  }

  ensureAttachFileInputBinding(app);
}
