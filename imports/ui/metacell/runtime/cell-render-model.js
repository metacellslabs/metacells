import { describeCellSchedule } from '../../../lib/cell-schedule.js';
import { parseChannelSendCommand } from '../../../api/channels/commands.js';
import { getAttachmentDisplayLabel } from './attachment-render-runtime.js';

var dateFormatterCache = {};
var numberFormatterCache = {};

function getCachedDateFormatter(localeKey) {
  var cacheKey = String(localeKey || 'default');
  if (!dateFormatterCache[cacheKey]) {
    dateFormatterCache[cacheKey] = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }
  return dateFormatterCache[cacheKey];
}

function getCachedNumberFormatter(localeKey, options) {
  var cacheKey =
    String(localeKey || 'default') + '::' + JSON.stringify(options || {});
  if (!numberFormatterCache[cacheKey]) {
    numberFormatterCache[cacheKey] = new Intl.NumberFormat(
      undefined,
      options || {},
    );
  }
  return numberFormatterCache[cacheKey];
}

function parseNumericDisplayValue(value) {
  if (typeof value === 'number' && isFinite(value)) return value;
  var text = String(value == null ? '' : value).trim();
  if (!text) return null;
  var normalized = text.replace(/,/g, '');
  if (!/^[-+]?(\d+(\.\d+)?|\.\d+)$/.test(normalized)) return null;
  var parsed = Number(normalized);
  return isFinite(parsed) ? parsed : null;
}

function parseDateDisplayValue(value) {
  var text = String(value == null ? '' : value).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    var parts = text.split('-');
    var date = new Date(
      Number(parts[0]),
      Number(parts[1]) - 1,
      Number(parts[2]),
    );
    return isNaN(date.getTime()) ? null : date;
  }
  var parsed = new Date(text);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function getCellFormatMeta(app, sheetId, cellId) {
  var presentation = app.storage.getCellPresentation(sheetId, cellId);
  var format =
    presentation && presentation.format ? presentation.format : 'text';
  return {
    format: format,
    align: presentation && presentation.align ? presentation.align : 'left',
    wrapText: !!(presentation && presentation.wrapText),
    bold: !!(presentation && presentation.bold),
    italic: !!(presentation && presentation.italic),
    decimalPlaces:
      presentation && Number.isInteger(presentation.decimalPlaces)
        ? Math.max(0, Math.min(6, presentation.decimalPlaces))
        : null,
    backgroundColor:
      presentation && typeof presentation.backgroundColor === 'string'
        ? presentation.backgroundColor
        : '',
    fontFamily:
      presentation && presentation.fontFamily
        ? presentation.fontFamily
        : 'default',
    fontSize:
      presentation && Number.isFinite(presentation.fontSize)
        ? Math.max(10, Math.min(28, Number(presentation.fontSize)))
        : 14,
    borders:
      presentation && presentation.borders
        ? presentation.borders
        : {
            top: false,
            right: false,
            bottom: false,
            left: false,
          },
    isNumeric:
      [
        'number',
        'number_0',
        'number_2',
        'percent',
        'percent_2',
        'currency_usd',
        'currency_eur',
        'currency_gbp',
      ].indexOf(format) >= 0,
  };
}

export function formatCellDisplay(app, sheetId, cellId, displayValue, options) {
  var opts = options || {};
  if (opts.showFormulas || opts.attachment || opts.error) return displayValue;
  var presentation = app.storage.getCellPresentation(sheetId, cellId);
  var format = app.storage.getCellFormat(sheetId, cellId);
  var decimalPlaces =
    presentation && Number.isInteger(presentation.decimalPlaces)
      ? Math.max(0, Math.min(6, presentation.decimalPlaces))
      : null;
  if (format === 'date') {
    var dateValue = parseDateDisplayValue(displayValue);
    if (!dateValue) return displayValue;
    return getCachedDateFormatter('default').format(dateValue);
  }
  var numericValue = parseNumericDisplayValue(displayValue);
  if (numericValue == null) return displayValue;
  if (
    format === 'currency_usd' ||
    format === 'currency_eur' ||
    format === 'currency_gbp'
  ) {
    return getCachedNumberFormatter('default', {
      style: 'currency',
      currency:
        format === 'currency_eur'
          ? 'EUR'
          : format === 'currency_gbp'
            ? 'GBP'
            : 'USD',
      minimumFractionDigits: decimalPlaces != null ? decimalPlaces : 2,
      maximumFractionDigits: decimalPlaces != null ? decimalPlaces : 2,
    }).format(numericValue);
  }
  if (format === 'percent' || format === 'percent_2') {
    return getCachedNumberFormatter('default', {
      style: 'percent',
      minimumFractionDigits:
        decimalPlaces != null ? decimalPlaces : format === 'percent_2' ? 2 : 0,
      maximumFractionDigits:
        decimalPlaces != null ? decimalPlaces : format === 'percent_2' ? 2 : 0,
    }).format(numericValue);
  }
  if (format !== 'number' && format !== 'number_0' && format !== 'number_2') {
    return displayValue;
  }
  return getCachedNumberFormatter('default', {
    minimumFractionDigits:
      decimalPlaces != null ? decimalPlaces : format === 'number_2' ? 2 : 0,
    maximumFractionDigits:
      decimalPlaces != null
        ? decimalPlaces
        : format === 'number_0'
          ? 0
          : format === 'number_2'
            ? 2
            : 20,
  }).format(numericValue);
}

export function getAISkeletonVariant(rawValue) {
  var raw = String(rawValue || '');
  if (!raw) return 'default';
  if (raw.charAt(0) === '>') return 'list';
  if (raw.charAt(0) === '#') return 'table';
  return 'default';
}

export function shouldHighlightEmptyMentionedCell(app, sheetId, cellId, rawValue) {
  if (
    !app ||
    !app.storage ||
    typeof app.storage.getDependencyGraph !== 'function' ||
    typeof app.storage.getCellValue !== 'function'
  ) {
    return false;
  }
  if (String(rawValue == null ? '' : rawValue).trim() !== '') return false;
  var graph = app.storage.getDependencyGraph();
  var key = String(sheetId || '') + ':' + String(cellId || '').toUpperCase();
  var dependents =
    graph &&
    graph.dependentsByCell &&
    Array.isArray(graph.dependentsByCell[key])
      ? graph.dependentsByCell[key]
      : [];
  if (!dependents.length) return false;
  for (var i = 0; i < dependents.length; i++) {
    var dependentKey = String(dependents[i] || '');
    if (!dependentKey) continue;
    var separatorIndex = dependentKey.indexOf(':');
    if (separatorIndex < 0) continue;
    var dependentSheetId = dependentKey.slice(0, separatorIndex);
    var dependentCellId = dependentKey.slice(separatorIndex + 1).toUpperCase();
    if (!dependentSheetId || !dependentCellId) continue;
    var dependentRaw = String(
      app.storage.getCellValue(dependentSheetId, dependentCellId) || '',
    );
    if (dependentRaw.indexOf('@') >= 0) {
      return true;
    }
  }
  return false;
}

export function resolveRenderableAttachment(
  app,
  rawValue,
  computedValue,
  displayValue,
) {
  if (!app || typeof app.parseAttachmentSource !== 'function') return null;
  return (
    app.parseAttachmentSource(rawValue) ||
    app.parseAttachmentSource(computedValue) ||
    app.parseAttachmentSource(displayValue)
  );
}

function resolveFormulaAttachmentForRender(app, rawValue, computedValue, displayValue) {
  var parsedAttachment = resolveRenderableAttachment(
    app,
    rawValue,
    computedValue,
    displayValue,
  );
  var inferredAttachment = inferAttachmentPreviewFromFormulaRaw(rawValue);
  if (!parsedAttachment) return inferredAttachment;
  if (!inferredAttachment) return parsedAttachment;
  return {
    ...inferredAttachment,
    ...parsedAttachment,
    name: String(
      parsedAttachment.name || inferredAttachment.name || 'Attached file',
    ),
    type: String(
      parsedAttachment.type || inferredAttachment.type || 'application/octet-stream',
    ),
  };
}

export function isChannelSendCommandRaw(rawValue) {
  return !!parseChannelSendCommand(rawValue);
}

export function isAISpillSourceRaw(rawValue) {
  return /\b(?:listAI|tableAI)\s*\(/i.test(String(rawValue || ''));
}

export function isAIFormulaRaw(rawValue) {
  var text = String(rawValue || '');
  if (!text) return false;
  if (
    text.charAt(0) === "'" ||
    text.charAt(0) === '>' ||
    text.charAt(0) === '#'
  ) {
    return true;
  }
  return /\b(?:askAI|listAI|tableAI|recalc|update)\s*\(/i.test(text);
}

function inferAttachmentPreviewFromFormulaRaw(rawValue) {
  var text = String(rawValue || '').trim();
  if (!text) return null;
  var match = /^\s*=\s*(PDF|DOCX|FILE)\s*\(\s*(["'])(.*?)\2/i.exec(text);
  if (!match) return null;
  var kind = String(match[1] || '').toUpperCase();
  var name = String(match[3] || '').trim();
  if (kind === 'PDF') {
    return {
      name: name || 'application/pdf',
      type: 'application/pdf',
      generated: true,
      generatedAs: 'PDF',
      content: '',
      encoding: 'utf8',
    };
  }
  if (kind === 'DOCX') {
    return {
      name: name || 'DOCX_MD',
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

export function shouldShowGeneratedAISkeleton(
  app,
  generatedBy,
  showFormulas,
  attachment,
  errorHint,
  sheetId,
) {
  var sourceCellId = String(generatedBy || '').toUpperCase();
  if (showFormulas || attachment || errorHint || !sourceCellId) return false;
  if (
    app &&
    app.aiService &&
    typeof app.aiService.getMode === 'function' &&
    String(app.aiService.getMode() || '') === 'manual'
  ) {
    return false;
  }
  var sourceRaw = app.getRawCellValue(sourceCellId);
  if (!isAISpillSourceRaw(sourceRaw)) return false;
  var sourceState = app.storage.getCellState(sheetId, sourceCellId);
  return sourceState === 'pending' || sourceState === 'stale';
}

export function shouldHideGeneratedAIValue(
  app,
  generatedBy,
  showFormulas,
  attachment,
) {
  if (!showFormulas || attachment) return false;
  var sourceCellId = String(generatedBy || '').toUpperCase();
  if (!sourceCellId) return false;
  var sourceRaw = app.getRawCellValue(sourceCellId);
  return isAIFormulaRaw(sourceRaw);
}

export function buildCellRenderModel(app, sheetId, cellId, options) {
  var opts = options && typeof options === 'object' ? options : {};
  var targetSheetId = String(sheetId || '');
  var normalizedCellId = String(cellId || '').toUpperCase();
  var rawSource = Object.prototype.hasOwnProperty.call(opts, 'raw')
    ? opts.raw
    : app.storage.getCellValue(targetSheetId, normalizedCellId);
  var raw = String(rawSource == null ? '' : rawSource);
  var storedDisplaySource = Object.prototype.hasOwnProperty.call(
    opts,
    'storedDisplay',
  )
    ? opts.storedDisplay
    : app.storage.getCellDisplayValue(targetSheetId, normalizedCellId);
  var isFormula =
    !!raw &&
    (raw.charAt(0) === '=' ||
      raw.charAt(0) === '>' ||
      raw.charAt(0) === '#' ||
      raw.charAt(0) === "'");
  var storedDisplay = String(storedDisplaySource == null ? '' : storedDisplaySource);
  var storedComputedSource = Object.prototype.hasOwnProperty.call(
    opts,
    'storedComputed',
  )
    ? opts.storedComputed
    : app.storage.getCellComputedValue(targetSheetId, normalizedCellId);
  var storedComputed = String(
    storedComputedSource == null ? '' : storedComputedSource,
  );
  var cellStateSource = Object.prototype.hasOwnProperty.call(opts, 'cellState')
    ? opts.cellState
    : app.storage.getCellState(targetSheetId, normalizedCellId);
  var cellState = String(cellStateSource == null ? '' : cellStateSource);
  var errorHintSource = Object.prototype.hasOwnProperty.call(opts, 'errorHint')
    ? opts.errorHint
    : app.storage.getCellError(targetSheetId, normalizedCellId);
  var errorHint = String(errorHintSource == null ? '' : errorHintSource);
  var generatedBySource = Object.prototype.hasOwnProperty.call(
    opts,
    'generatedBy',
  )
    ? opts.generatedBy
    : app.storage.getGeneratedCellSource(targetSheetId, normalizedCellId);
  var generatedBy = String(generatedBySource == null ? '' : generatedBySource);
  var cellSchedule = Object.prototype.hasOwnProperty.call(opts, 'cellSchedule')
    ? opts.cellSchedule
    : app.storage.getCellSchedule(targetSheetId, normalizedCellId);
  var isEditing = Object.prototype.hasOwnProperty.call(opts, 'isEditing')
    ? !!opts.isEditing
    : app && typeof app.isEditingCell === 'function'
      ? app.isEditingCell(app.inputById[normalizedCellId] || null)
      : false;
  var literalDisplay = !!raw && raw.charAt(0) === '#';
  var showFormulas = opts.showFormulas === true;
  var isChannelCommand = isChannelSendCommandRaw(raw);
  var displayValue = showFormulas
    ? String(raw || '')
    : isFormula
      ? storedDisplay
      : isChannelCommand && storedDisplay
        ? storedDisplay
        : raw;
  var attachment = isFormula
    ? resolveFormulaAttachmentForRender(app, raw, storedComputed, displayValue)
    : resolveRenderableAttachment(app, raw, storedComputed, displayValue);

  if (attachment) {
    displayValue = getAttachmentDisplayLabel(attachment);
  }
  if (String(displayValue || '').indexOf('#AI_ERROR:') === 0) {
    displayValue =
      String(displayValue).replace(/^#AI_ERROR:\s*/i, '') || 'AI error';
    if (!errorHint) errorHint = String(displayValue || '');
  }
  if (shouldHideGeneratedAIValue(app, generatedBy, showFormulas, attachment)) {
    displayValue = '';
  }
  var showAISkeleton =
    !showFormulas &&
    isFormula &&
    !attachment &&
    !errorHint &&
    !(
      app &&
      app.aiService &&
      typeof app.aiService.getMode === 'function' &&
      String(app.aiService.getMode() || '') === 'manual'
    ) &&
    (cellState === 'pending' || cellState === 'stale') &&
    (String(displayValue == null ? '' : displayValue).trim() === '...' ||
      isAIFormulaRaw(raw));
  if (
    !showAISkeleton &&
    shouldShowGeneratedAISkeleton(
      app,
      generatedBy,
      showFormulas,
      attachment,
      errorHint,
      targetSheetId,
    )
  ) {
    showAISkeleton = true;
  }
  displayValue = formatCellDisplay(
    app,
    targetSheetId,
    normalizedCellId,
    displayValue,
    {
      showFormulas: showFormulas,
      attachment: attachment,
      error: !!errorHint,
    },
  );

  var formatMeta = getCellFormatMeta(app, targetSheetId, normalizedCellId);

  return {
    sheetId: targetSheetId,
    cellId: normalizedCellId,
    raw: raw,
    isFormula: isFormula,
    isChannelCommand: isChannelCommand,
    storedDisplay: storedDisplay,
    storedComputed: storedComputed,
    displayValue: displayValue,
    cellState: cellState,
    errorHint: errorHint,
    generatedBy: generatedBy,
    cellSchedule: cellSchedule,
    scheduleTitle: cellSchedule ? describeCellSchedule(cellSchedule) : '',
    isEditing: isEditing,
    literalDisplay: literalDisplay,
    showFormulas: showFormulas,
    attachment: attachment,
    showAISkeleton: showAISkeleton,
    aiSkeletonVariant: getAISkeletonVariant(raw),
    formatMeta: formatMeta,
    highlightEmptyMentioned: shouldHighlightEmptyMentionedCell(
      app,
      targetSheetId,
      normalizedCellId,
      raw,
    ),
  };
}
