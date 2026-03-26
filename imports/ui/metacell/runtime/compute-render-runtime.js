import { AI_MODE } from './constants.js';
import { buildCellRenderModel } from './cell-render-model.js';
import {
  ensureGridCellChrome,
  getDirectGridCellChild,
  removeDirectGridCellChild,
} from './grid-cell-runtime.js';

function inferAttachmentFromRawFormula(rawValue) {
  var text = String(rawValue || '').trim();
  var match = /^\s*=\s*(PDF|DOCX|FILE)\s*\(\s*(["'])(.*?)\2/i.exec(text);
  if (!match) return null;
  var kind = String(match[1] || '').toUpperCase();
  var name = String(match[3] || '').trim();
  if (kind === 'PDF') {
    return {
      name: name || 'Attached file.pdf',
      type: 'application/pdf',
      generated: true,
      generatedAs: 'PDF',
      content: '',
      encoding: 'utf8',
    };
  }
  if (kind === 'DOCX') {
    return {
      name: name || 'Attached file.docx',
      type:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      generated: true,
      generatedAs: 'DOCX_MD',
      content: '',
      encoding: 'utf8',
    };
  }
  return {
    name: name || 'Attached file',
    type: 'application/octet-stream',
    generated: true,
    content: '',
    encoding: 'utf8',
  };
}

function resolveAttachmentForRender(app, model, modelOptions, sheetId, cellId) {
  var attachment = model && model.attachment ? model.attachment : null;
  if (attachment) return attachment;
  if (!app || typeof app.parseAttachmentSource !== 'function') {
    return model && model.isFormula ? inferAttachmentFromRawFormula(model.raw) : null;
  }
  var raw =
    model && Object.prototype.hasOwnProperty.call(model, 'raw')
      ? model.raw
      : modelOptions && Object.prototype.hasOwnProperty.call(modelOptions, 'raw')
        ? modelOptions.raw
        : app.storage.getCellValue(sheetId, cellId);
  var storedComputed =
    modelOptions && Object.prototype.hasOwnProperty.call(modelOptions, 'storedComputed')
      ? modelOptions.storedComputed
      : app.storage.getCellComputedValue(sheetId, cellId);
  var storedDisplay =
    modelOptions && Object.prototype.hasOwnProperty.call(modelOptions, 'storedDisplay')
      ? modelOptions.storedDisplay
      : app.storage.getCellDisplayValue(sheetId, cellId);
  return (
    app.parseAttachmentSource(raw) ||
    app.parseAttachmentSource(storedComputed) ||
    app.parseAttachmentSource(storedDisplay) ||
    (model && model.isFormula ? inferAttachmentFromRawFormula(raw) : null)
  );
}

function buildRenderSignature(app, model) {
  if (!model) return '';
  return JSON.stringify({
    displayMode: app && app.displayMode ? app.displayMode : 'values',
    aiMode:
      app && app.aiService && typeof app.aiService.getMode === 'function'
        ? String(app.aiService.getMode() || '')
        : '',
    isEditing: !!model.isEditing,
    isFormula: !!model.isFormula,
    displayValue: String(model.displayValue == null ? '' : model.displayValue),
    errorHint: String(model.errorHint || ''),
    cellState: String(model.cellState || ''),
    generatedBy: String(model.generatedBy || ''),
    attachmentName:
      model.attachment && model.attachment.name
        ? String(model.attachment.name)
        : '',
    attachmentType:
      model.attachment && model.attachment.type
        ? String(model.attachment.type)
        : '',
    attachmentPending:
      !!(model.attachment && model.attachment.pending === true),
    attachmentConverting:
      !!(model.attachment && model.attachment.converting === true),
    attachmentHasContent:
      !!(
        model.attachment &&
        String(model.attachment.content == null ? '' : model.attachment.content)
      ),
    attachmentHasDownloadUrl:
      !!(
        model.attachment &&
        String(
          model.attachment.downloadUrl ||
            model.attachment.url ||
            model.attachment.binaryArtifactId ||
            '',
        ).trim()
      ),
    attachmentHasPreviewUrl:
      !!(
        model.attachment &&
        String(model.attachment.previewUrl || '').trim()
      ),
    attachmentContentArtifactId:
      model.attachment && model.attachment.contentArtifactId
        ? String(model.attachment.contentArtifactId)
        : '',
    attachmentBinaryArtifactId:
      model.attachment && model.attachment.binaryArtifactId
        ? String(model.attachment.binaryArtifactId)
        : '',
    showAISkeleton: !!model.showAISkeleton,
    aiSkeletonVariant: String(model.aiSkeletonVariant || ''),
    highlightEmptyMentioned: !!model.highlightEmptyMentioned,
    scheduleTitle: String(model.scheduleTitle || ''),
    formatMeta: model.formatMeta || null,
    literalDisplay: !!model.literalDisplay,
    showFormulas: !!model.showFormulas,
  });
}

export function applyComputedCellRender(app, input, options) {
  var opts = options && typeof options === 'object' ? options : {};
  var targetSheetId =
    app && typeof app.getVisibleSheetId === 'function'
      ? app.getVisibleSheetId()
      : app.activeSheetId;
  var modelOptions = {
    isEditing:
      Object.prototype.hasOwnProperty.call(opts, 'isEditing')
        ? opts.isEditing
        : app && typeof app.isEditingCell === 'function'
          ? app.isEditingCell(input)
          : document.activeElement === input,
    showFormulas:
      Object.prototype.hasOwnProperty.call(opts, 'showFormulas')
        ? opts.showFormulas
        : app.displayMode === 'formulas',
  };
  if (Object.prototype.hasOwnProperty.call(opts, 'raw')) {
    modelOptions.raw = opts.raw;
  }
  if (Object.prototype.hasOwnProperty.call(opts, 'storedDisplay')) {
    modelOptions.storedDisplay = opts.storedDisplay;
  }
  if (Object.prototype.hasOwnProperty.call(opts, 'storedComputed')) {
    modelOptions.storedComputed = opts.storedComputed;
  }
  if (Object.prototype.hasOwnProperty.call(opts, 'cellState')) {
    modelOptions.cellState = opts.cellState;
  }
  if (Object.prototype.hasOwnProperty.call(opts, 'errorHint')) {
    modelOptions.errorHint = opts.errorHint;
  }
  if (Object.prototype.hasOwnProperty.call(opts, 'generatedBy')) {
    modelOptions.generatedBy = opts.generatedBy;
  }
  var model = buildCellRenderModel(app, targetSheetId, input.id, modelOptions);
  model.attachment = resolveAttachmentForRender(
    app,
    model,
    modelOptions,
    targetSheetId,
    input.id,
  );
  var renderSignature = buildRenderSignature(app, model);
  var cell = input.parentElement;
  var normalizedCellId = String(input && input.id ? input.id : '').toUpperCase();
  var normalizedSheetId = String(targetSheetId || '');
  if (input && input.dataset) {
    input.dataset.testid = 'grid-cell-input';
    input.dataset.cellId = normalizedCellId;
    input.dataset.sheetId = normalizedSheetId;
  }
  if (cell && cell.dataset) {
    cell.dataset.testid = 'grid-cell';
    cell.dataset.cellId = normalizedCellId;
    cell.dataset.sheetId = normalizedSheetId;
  }
  var focusProxy = getDirectGridCellChild(cell, 'cell-focus-proxy');
  if (focusProxy && focusProxy.dataset) {
    focusProxy.dataset.testid = 'grid-cell-focus-proxy';
    focusProxy.dataset.cellId = normalizedCellId;
    focusProxy.dataset.sheetId = normalizedSheetId;
  }
  if (cell && cell.dataset.renderSignature === renderSignature) {
    model.renderSkipped = true;
    return model;
  }
  if (cell) {
    removeDirectGridCellChild(cell, 'cell-react-shell');
    ensureGridCellChrome(cell, input);
  }
  if (
    app &&
    app.cellContentStore &&
    typeof app.cellContentStore.resetCell === 'function'
  ) {
    app.cellContentStore.resetCell(input.id);
  }

  input.parentElement.classList.toggle(
    'manual-formula',
    app.aiService.getMode() === AI_MODE.manual && model.isFormula,
  );
  input.parentElement.classList.toggle('has-formula', model.isFormula);
  input.parentElement.classList.toggle(
    'empty-mentioned-cell',
    model.highlightEmptyMentioned,
  );
  input.parentElement.classList.toggle(
    'has-display-value',
    String(model.displayValue == null ? '' : model.displayValue) !== '',
  );
  input.parentElement.classList.toggle('has-attachment', !!model.attachment);
  input.parentElement.classList.toggle('has-error', !!model.errorHint);
  if (model.errorHint) {
    input.parentElement.setAttribute('data-error-hint', model.errorHint);
  } else {
    input.parentElement.removeAttribute('data-error-hint');
  }
  app.grid.renderCellValue(
    input,
    model.displayValue,
    model.isEditing,
    model.isFormula,
    {
      literal: model.showFormulas ? true : model.literalDisplay,
      attachment: model.attachment,
      aiSkeleton: model.showAISkeleton,
      aiSkeletonVariant: model.aiSkeletonVariant,
      error: !!model.errorHint,
      state: model.cellState,
      alignRight: !model.showFormulas && model.formatMeta.isNumeric,
      align: model.showFormulas ? 'left' : model.formatMeta.align,
      wrapText: !model.showFormulas && model.formatMeta.wrapText,
      bold: !model.showFormulas && model.formatMeta.bold,
      italic: !model.showFormulas && model.formatMeta.italic,
      backgroundColor: !model.showFormulas
        ? model.formatMeta.backgroundColor
        : '',
      fontFamily: !model.showFormulas ? model.formatMeta.fontFamily : 'default',
      fontSize: !model.showFormulas ? model.formatMeta.fontSize : 14,
      borders: model.formatMeta.borders,
      hasSchedule: !!model.cellSchedule,
      scheduleTitle: model.scheduleTitle,
    },
  );
  if (cell) {
    cell.dataset.renderSignature = renderSignature;
    cell.removeAttribute('data-viewport-pruned');
  }
  return model;
}

export function clearComputedCellRenderState(input, app) {
  if (!input || !input.parentElement) return;
  input.parentElement.classList.remove('manual-formula');
  input.parentElement.classList.remove('has-formula');
  input.parentElement.classList.remove('empty-mentioned-cell');
  input.parentElement.classList.remove('has-display-value');
  input.parentElement.classList.remove('has-attachment');
  input.parentElement.classList.remove('has-error');
  input.parentElement.removeAttribute('data-error-hint');
  input.parentElement.removeAttribute('data-render-signature');
  if (
    app &&
    app.cellContentStore &&
    typeof app.cellContentStore.resetCell === 'function'
  ) {
    app.cellContentStore.resetCell(input.id);
  }
}
