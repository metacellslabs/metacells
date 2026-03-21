import { rpc } from '../../../../lib/rpc-client.js';
import { AI_MODE } from './constants.js';
import { traceCellUpdateClient } from '../../../lib/cell-update-profile.js';
import { describeCellSchedule } from '../../../lib/cell-schedule.js';

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

function getCellFormatMeta(app, sheetId, cellId) {
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

function formatCellDisplay(app, sheetId, cellId, displayValue, options) {
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
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(dateValue);
  }
  var numericValue = parseNumericDisplayValue(displayValue);
  if (numericValue == null) return displayValue;
  if (
    format === 'currency_usd' ||
    format === 'currency_eur' ||
    format === 'currency_gbp'
  ) {
    return new Intl.NumberFormat(undefined, {
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
    return new Intl.NumberFormat(undefined, {
      style: 'percent',
      minimumFractionDigits:
        decimalPlaces != null ? decimalPlaces : format === 'percent_2' ? 2 : 0,
      maximumFractionDigits:
        decimalPlaces != null ? decimalPlaces : format === 'percent_2' ? 2 : 0,
    }).format(numericValue);
  }
  if (format !== 'number' && format !== 'number_0' && format !== 'number_2')
    return displayValue;
  return new Intl.NumberFormat(undefined, {
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

function getAISkeletonVariant(rawValue) {
  var raw = String(rawValue || '');
  if (!raw) return 'default';
  if (raw.charAt(0) === '>') return 'list';
  if (raw.charAt(0) === '#') return 'table';
  return 'default';
}

function shouldHighlightEmptyMentionedCell(app, cellId, rawValue) {
  if (!app || !app.storage || typeof app.storage.getDependencyGraph !== 'function') {
    return false;
  }
  if (String(rawValue == null ? '' : rawValue).trim() !== '') return false;
  var graph = app.storage.getDependencyGraph();
  var key = String(app.activeSheetId || '') + ':' + String(cellId || '').toUpperCase();
  var dependents =
    graph && graph.dependentsByCell && Array.isArray(graph.dependentsByCell[key])
      ? graph.dependentsByCell[key]
      : [];
  return dependents.length > 0;
}

function resolveRenderableAttachment(app, rawValue, computedValue, displayValue) {
  if (!app || typeof app.parseAttachmentSource !== 'function') return null;
  return (
    app.parseAttachmentSource(rawValue) ||
    app.parseAttachmentSource(computedValue) ||
    app.parseAttachmentSource(displayValue)
  );
}

export function renderCurrentSheetFromStorage(app) {
  if (app.isReportActive()) {
    app.renderReportLiveValues(true);
    return;
  }

  if (
    app.storage &&
    app.storage.storage &&
    typeof app.storage.storage.snapshot === 'function'
  ) {
    app.ensureGridCapacityForStorage(app.storage.storage.snapshot());
  }

  var formulaCount = 0;
  for (var i = 0; i < app.inputs.length; i++) {
    var probeRaw = app.getRawCellValue(app.inputs[i].id);
    if (
      probeRaw &&
      (probeRaw.charAt(0) === '=' ||
        probeRaw.charAt(0) === '>' ||
        probeRaw.charAt(0) === '#' ||
        probeRaw.charAt(0) === "'")
    )
      formulaCount++;
  }
  var formulaDone = 0;
  app.updateCalcProgress(0, formulaCount);
  var syncFormulaBarWithActiveCell = () => {
    if (!app.activeInput || app.hasPendingLocalEdit()) return;
    var rawValue = app.getRawCellValue(app.activeInput.id);
    var attachment = app.parseAttachmentSource(rawValue);
    app.formulaInput.value = attachment
      ? String(
          attachment.name ||
            (attachment.converting
              ? 'Converting file...'
              : attachment.pending
                ? 'Choose file'
                : 'Attached file'),
        )
      : rawValue;
  };
  var isAISpillSourceRaw = (rawValue) =>
    /\b(?:listAI|tableAI)\s*\(/i.test(String(rawValue || ''));
  var isAIFormulaRaw = (rawValue) => {
    var text = String(rawValue || '');
    if (!text) return false;
    if (
      text.charAt(0) === "'" ||
      text.charAt(0) === '>' ||
      text.charAt(0) === '#'
    ) {
      return true;
    }
    return /\b(?:askAI|listAI|tableAI)\s*\(/i.test(text);
  };
  var decorateFormulaMentionsForDisplay = (rawValue) => {
    return String(rawValue || '');
  };
  var shouldShowGeneratedAISkeleton = (generatedBy, showFormulas, attachment, errorHint) => {
    var sourceCellId = String(generatedBy || '').toUpperCase();
    if (showFormulas || attachment || errorHint || !sourceCellId) return false;
    var sourceRaw = app.getRawCellValue(sourceCellId);
    if (!isAISpillSourceRaw(sourceRaw)) return false;
    var sourceState = app.storage.getCellState(app.activeSheetId, sourceCellId);
    return sourceState === 'pending' || sourceState === 'stale';
  };
  var shouldHideGeneratedAIValue = (generatedBy, showFormulas, attachment) => {
    if (!showFormulas || attachment) return false;
    var sourceCellId = String(generatedBy || '').toUpperCase();
    if (!sourceCellId) return false;
    var sourceRaw = app.getRawCellValue(sourceCellId);
    return isAIFormulaRaw(sourceRaw);
  };

  app.inputs.forEach((input) => {
    try {
      var raw = app.getRawCellValue(input.id);
      var isFormula =
        !!raw &&
        (raw.charAt(0) === '=' ||
          raw.charAt(0) === '>' ||
          raw.charAt(0) === '#' ||
          raw.charAt(0) === "'");
      var storedDisplay = app.storage.getCellDisplayValue(
        app.activeSheetId,
        input.id,
      );
      var storedComputed = app.storage.getCellComputedValue(
        app.activeSheetId,
        input.id,
      );
      var cellState = app.storage.getCellState(app.activeSheetId, input.id);
      var errorHint = app.storage.getCellError(app.activeSheetId, input.id);
      var generatedBy = app.storage.getGeneratedCellSource(
        app.activeSheetId,
        input.id,
      );
      var cellSchedule = app.storage.getCellSchedule(
        app.activeSheetId,
        input.id,
      );
      var isEditing = document.activeElement === input;
      var literalDisplay = !!raw && raw.charAt(0) === '#';
      var showFormulas = app.displayMode === 'formulas';
      var displayValue = showFormulas
        ? decorateFormulaMentionsForDisplay(raw)
        : isFormula
          ? storedDisplay
          : raw;
      var attachment = resolveRenderableAttachment(
        app,
        raw,
        storedComputed,
        displayValue,
      );

      if (attachment) {
        displayValue = String(
          attachment.name ||
            (attachment.converting
              ? 'Converting file...'
              : attachment.pending
                ? 'Choose file'
                : 'Attached file'),
        );
      }
      if (String(displayValue || '').indexOf('#AI_ERROR:') === 0) {
        displayValue =
          String(displayValue).replace(/^#AI_ERROR:\s*/i, '') || 'AI error';
        if (!errorHint) errorHint = String(displayValue || '');
      }
      if (
        !showFormulas &&
        isFormula &&
        String(displayValue == null ? '' : displayValue) === ''
      ) {
        displayValue = raw;
      }
      if (shouldHideGeneratedAIValue(generatedBy, showFormulas, attachment)) {
        displayValue = '';
      }
      var showAISkeleton =
        !showFormulas &&
        isFormula &&
        !attachment &&
        !errorHint &&
        (cellState === 'pending' || cellState === 'stale') &&
        String(displayValue == null ? '' : displayValue).trim() === '...';
      if (
        !showAISkeleton &&
        shouldShowGeneratedAISkeleton(
          generatedBy,
          showFormulas,
          attachment,
          errorHint,
        )
      ) {
        showAISkeleton = true;
      }
      displayValue = formatCellDisplay(
        app,
        app.activeSheetId,
        input.id,
        displayValue,
        {
          showFormulas: showFormulas,
          attachment: attachment,
          error: !!errorHint,
        },
      );
      var formatMeta = getCellFormatMeta(app, app.activeSheetId, input.id);

      input.parentElement.classList.toggle(
        'manual-formula',
        app.aiService.getMode() === AI_MODE.manual && isFormula,
      );
      input.parentElement.classList.toggle('has-formula', isFormula);
      input.parentElement.classList.toggle(
        'empty-mentioned-cell',
        shouldHighlightEmptyMentionedCell(app, input.id, raw),
      );
      input.parentElement.classList.toggle(
        'has-display-value',
        String(displayValue == null ? '' : displayValue) !== '',
      );
      input.parentElement.classList.toggle('has-attachment', !!attachment);
      input.parentElement.classList.toggle('has-error', !!errorHint);
      if (errorHint) {
        input.parentElement.setAttribute('data-error-hint', errorHint);
      } else {
        input.parentElement.removeAttribute('data-error-hint');
      }
      app.grid.renderCellValue(input, displayValue, isEditing, isFormula, {
        literal: showFormulas ? true : literalDisplay,
        attachment: attachment,
        aiSkeleton: showAISkeleton,
        aiSkeletonVariant: getAISkeletonVariant(raw),
        error: !!errorHint,
        state: cellState,
        alignRight: !showFormulas && formatMeta.isNumeric,
        align: showFormulas ? 'left' : formatMeta.align,
        wrapText: !showFormulas && formatMeta.wrapText,
        bold: !showFormulas && formatMeta.bold,
        italic: !showFormulas && formatMeta.italic,
        backgroundColor: !showFormulas ? formatMeta.backgroundColor : '',
        fontFamily: !showFormulas ? formatMeta.fontFamily : 'default',
        fontSize: !showFormulas ? formatMeta.fontSize : 14,
        borders: formatMeta.borders,
        hasSchedule: !!cellSchedule,
        scheduleTitle: cellSchedule ? describeCellSchedule(cellSchedule) : '',
      });
      if (isFormula) {
        formulaDone++;
        app.updateCalcProgress(formulaDone, formulaCount);
      }
    } catch (e) {
      input.parentElement.classList.remove('manual-formula');
      input.parentElement.classList.remove('has-formula');
      input.parentElement.classList.remove('empty-mentioned-cell');
      input.parentElement.classList.remove('has-display-value');
      input.parentElement.classList.remove('has-attachment');
      input.parentElement.classList.remove('has-error');
      input.parentElement.removeAttribute('data-error-hint');
    }
  });

  updateWrappedRowHeights(app);
  applyRightOverflowText(app);
  app.applyDependencyHighlight();
  syncFormulaBarWithActiveCell();
  app.syncAIModeUI();
  app.renderReportLiveValues(true);
  app.finishCalcProgress(formulaCount);
}

export function getRenderTargetsForComputeResult(
  app,
  computedValues,
  didResort,
) {
  if (didResort) return app.inputs;
  var values =
    computedValues && typeof computedValues === 'object' ? computedValues : {};
  var ids = Object.keys(values);
  if (!ids.length) return [];
  if (ids.length >= app.inputs.length) return app.inputs;
  var targets = [];
  for (var i = 0; i < ids.length; i++) {
    var input = app.inputById[ids[i]];
    if (input) targets.push(input);
  }
  return targets.length ? targets : [];
}

export function computeAll(app) {
  var options = arguments.length > 1 ? arguments[1] : {};
  var trace =
    options && options.trace && typeof options.trace === 'object'
      ? options.trace
      : null;
  var isManualTrigger = !!(options && options.manualTriggerAI);
  app.backgroundComputeEnabled = true;
  if (app.isReportActive()) {
    app.renderReportLiveValues();
    return;
  }
  if (
    !options.forceRefreshAI &&
    !options.bypassPendingEdit &&
    app.hasPendingLocalEdit()
  ) {
    return;
  }
  app.ensureActiveCell();

  var formulaCount = 0;
  for (var i = 0; i < app.inputs.length; i++) {
    var probeRaw = app.getRawCellValue(app.inputs[i].id);
    if (
      probeRaw &&
      (probeRaw.charAt(0) === '=' ||
        probeRaw.charAt(0) === '>' ||
        probeRaw.charAt(0) === '#' ||
        probeRaw.charAt(0) === "'")
    )
      formulaCount++;
  }
  var formulaDone = 0;
  app.updateCalcProgress(0, formulaCount);

  var didResort = app.applyAutoResort();
  var requestToken = ++app.computeRequestToken;
  var activeSheetId = app.activeSheetId;
  if (isManualTrigger) {
    app.isManualAIUpdating = true;
    app.manualUpdateRequestToken = requestToken;
    app.syncAIModeUI();
  }
  var finishManualUpdate = function () {
    if (!isManualTrigger) return;
    if (app.manualUpdateRequestToken !== requestToken) return;
    app.isManualAIUpdating = false;
    app.manualUpdateRequestToken = 0;
    app.syncAIModeUI();
  };
  traceCellUpdateClient(trace, 'compute_call.start', {
    activeSheetId: activeSheetId,
    forceRefreshAI: !!options.forceRefreshAI,
    manualTriggerAI: isManualTrigger,
  });
  rpc('sheets.computeGrid', app.sheetDocumentId, activeSheetId, {
    forceRefreshAI: !!options.forceRefreshAI,
    manualTriggerAI: isManualTrigger,
    traceId: trace && trace.id ? trace.id : '',
    workbookSnapshot:
      app.storage &&
      app.storage.storage &&
      typeof app.storage.storage.snapshot === 'function'
        ? app.storage.storage.snapshot()
        : {},
  })
    .then((result) => {
      traceCellUpdateClient(trace, 'compute_call.done', {
        returnedValues:
          result && result.values ? Object.keys(result.values).length : 0,
        hasWorkbook: !!(result && result.workbook),
      });
      if (requestToken !== app.computeRequestToken) {
        finishManualUpdate();
        return;
      }
      if (activeSheetId !== app.activeSheetId) {
        finishManualUpdate();
        return;
      }

      if (
        result &&
        result.workbook &&
        app.storage.storage &&
        typeof app.storage.storage.replaceAll === 'function'
      ) {
        app.storage.storage.replaceAll(result.workbook);
      }

      if (result && result.workbook) {
        app.ensureGridCapacityForStorage(result.workbook);
      }

      app.computedValuesBySheet[activeSheetId] =
        result && result.values ? result.values : {};
      if (result && result.workbook) {
        renderCurrentSheetFromStorage(app);
        finishManualUpdate();
        // Fallback polling: if the server still returned '...' placeholders for
        // any AI cells (e.g. a race between concurrent requests), retry until
        // the actual answer arrives (max 30 retries, 1 s apart).
        var pendingValues = result && result.values ? result.values : {};
        var hasPendingAI = Object.keys(pendingValues).some(function (k) {
          return pendingValues[k] === '...';
        });
        if (hasPendingAI) {
          var pollCount = (options && options._pollCount) || 0;
          if (pollCount < 30) {
            setTimeout(function () {
              computeAll(app, { _pollCount: pollCount + 1 });
            }, 1000);
          }
        }
        return;
      }
      var computedValues = app.computedValuesBySheet[activeSheetId] || {};
      var renderTargets = getRenderTargetsForComputeResult(
        app,
        computedValues,
        didResort,
      );
      var renderFn = () => {
        renderTargets.forEach((input) => {
          try {
            var raw = app.getRawCellValue(input.id);
            var isFormula =
              !!raw &&
              (raw.charAt(0) === '=' ||
                raw.charAt(0) === '>' ||
                raw.charAt(0) === '#' ||
                raw.charAt(0) === "'");
            var storedDisplay = app.storage.getCellDisplayValue(
              app.activeSheetId,
              input.id,
            );
            var storedComputed = app.storage.getCellComputedValue(
              app.activeSheetId,
              input.id,
            );
            var cellState = app.storage.getCellState(
              app.activeSheetId,
              input.id,
            );
            var errorHint = app.storage.getCellError(
              app.activeSheetId,
              input.id,
            );
            var generatedBy = app.storage.getGeneratedCellSource(
              app.activeSheetId,
              input.id,
            );
            var value =
              isFormula &&
              Object.prototype.hasOwnProperty.call(computedValues, input.id)
                ? computedValues[input.id]
                : raw;
            var isEditing = document.activeElement === input;
            var literalDisplay = !!raw && raw.charAt(0) === '#';
            var showFormulas = app.displayMode === 'formulas';
            var displayValue = showFormulas
              ? decorateFormulaMentionsForDisplay(raw)
              : value;
            var attachment = resolveRenderableAttachment(
              app,
              raw,
              isFormula ? value || storedComputed : storedComputed,
              displayValue,
            );
            if (attachment) {
              displayValue = String(
                attachment.name ||
                  (attachment.converting
                    ? 'Converting file...'
                    : attachment.pending
                      ? 'Choose file'
                      : 'Attached file'),
              );
            }
            if (String(displayValue || '').indexOf('#AI_ERROR:') === 0) {
              displayValue =
                String(displayValue).replace(/^#AI_ERROR:\s*/i, '') ||
                'AI error';
              if (!errorHint) errorHint = String(displayValue || '');
            }
            if (
              !showFormulas &&
              isFormula &&
              String(displayValue == null ? '' : displayValue) === '' &&
              storedDisplay
            ) {
              displayValue = storedDisplay;
            }
            var showAISkeleton =
              !showFormulas &&
              isFormula &&
              !attachment &&
              !errorHint &&
              (cellState === 'pending' || cellState === 'stale') &&
              String(displayValue == null ? '' : displayValue).trim() === '...';
            if (
              !showAISkeleton &&
              shouldShowGeneratedAISkeleton(
                generatedBy,
                showFormulas,
                attachment,
                errorHint,
              )
            ) {
              showAISkeleton = true;
            }
            if (
              shouldHideGeneratedAIValue(generatedBy, showFormulas, attachment)
            ) {
              displayValue = '';
            }
            displayValue = formatCellDisplay(
              app,
              app.activeSheetId,
              input.id,
              displayValue,
              {
                showFormulas: showFormulas,
                attachment: attachment,
                error: !!errorHint,
              },
            );
            var formatMeta = getCellFormatMeta(
              app,
              app.activeSheetId,
              input.id,
            );
            input.parentElement.classList.toggle(
              'manual-formula',
              app.aiService.getMode() === AI_MODE.manual && isFormula,
            );
            input.parentElement.classList.toggle('has-formula', isFormula);
            input.parentElement.classList.toggle(
              'empty-mentioned-cell',
              shouldHighlightEmptyMentionedCell(app, input.id, raw),
            );
            input.parentElement.classList.toggle(
              'has-display-value',
              String(displayValue == null ? '' : displayValue) !== '',
            );
            input.parentElement.classList.toggle(
              'has-attachment',
              !!attachment,
            );
            input.parentElement.classList.toggle('has-error', !!errorHint);
            if (errorHint) {
              input.parentElement.setAttribute('data-error-hint', errorHint);
            } else {
              input.parentElement.removeAttribute('data-error-hint');
            }
            app.grid.renderCellValue(
              input,
              displayValue,
              isEditing,
              isFormula,
              {
                literal: showFormulas ? true : literalDisplay,
                attachment: attachment,
                aiSkeleton: showAISkeleton,
                aiSkeletonVariant: getAISkeletonVariant(raw),
                error: !!errorHint,
                state: cellState,
                alignRight: !showFormulas && formatMeta.isNumeric,
                align: showFormulas ? 'left' : formatMeta.align,
                wrapText: !showFormulas && formatMeta.wrapText,
                bold: !showFormulas && formatMeta.bold,
                italic: !showFormulas && formatMeta.italic,
                backgroundColor: !showFormulas
                  ? formatMeta.backgroundColor
                  : '',
                fontFamily: !showFormulas ? formatMeta.fontFamily : 'default',
                fontSize: !showFormulas ? formatMeta.fontSize : 14,
                borders: formatMeta.borders,
              },
            );
            if (isFormula) {
              formulaDone++;
              app.updateCalcProgress(formulaDone, formulaCount);
            }
          } catch (e) {
            input.parentElement.classList.remove('manual-formula');
            input.parentElement.classList.remove('has-formula');
            input.parentElement.classList.remove('has-display-value');
            input.parentElement.classList.remove('has-attachment');
            input.parentElement.classList.remove('has-error');
            input.parentElement.removeAttribute('data-error-hint');
          }
        });
      };
      if (renderTargets.length) {
        if (didResort) app.runWithAISuppressed(renderFn);
        else renderFn();
        updateWrappedRowHeights(app);
        applyRightOverflowText(app);
      }

      if (!app.hasPendingLocalEdit() && app.activeInput) {
        var rawValue = app.getRawCellValue(app.activeInput.id);
        var attachment = app.parseAttachmentSource(rawValue);
        app.formulaInput.value = attachment
          ? String(
              attachment.name ||
                (attachment.converting
                  ? 'Converting file...'
                  : attachment.pending
                    ? 'Choose file'
                    : 'Attached file'),
            )
          : rawValue;
      }

      app.syncAIModeUI();
      app.applyDependencyHighlight();
      app.renderReportLiveValues();
      app.finishCalcProgress(formulaCount);
      finishManualUpdate();
      traceCellUpdateClient(trace, 'render.done', {
        renderTargets: renderTargets.length,
        didResort: !!didResort,
      });
    })
    .catch((error) => {
      console.error('[sheet] computeAll failed', error);
      finishManualUpdate();
      app.syncAIModeUI();
      app.finishCalcProgress(formulaCount);
      traceCellUpdateClient(trace, 'compute_call.failed', {
        message: String(error && error.message ? error.message : error || ''),
      });
    });
}

export function measureOutputRequiredWidth(app, output) {
  if (!output) return 0;
  var probe = output.cloneNode(true);
  probe.classList.add('spill-overflow');
  probe.style.position = 'fixed';
  probe.style.left = '-99999px';
  probe.style.top = '0';
  probe.style.width = 'auto';
  probe.style.maxWidth = 'none';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.overflow = 'visible';
  probe.style.whiteSpace = 'nowrap';
  document.body.appendChild(probe);
  var width = Math.ceil(probe.scrollWidth || probe.offsetWidth || 0);
  probe.remove();
  return width;
}

export function hasUncomputedCells(app) {
  if (app.isReportActive()) return false;
  for (var i = 0; i < app.inputs.length; i++) {
    var input = app.inputs[i];
    var raw = app.getRawCellValue(input.id);
    if (!raw || (raw.charAt(0) !== '=' && raw.charAt(0) !== '>')) continue;

    var output = input.parentElement.querySelector('.cell-output');
    var shown = output ? String(output.textContent || '').trim() : '';
    if (shown === '...') return true;
  }
  return false;
}

export function startUncomputedMonitor(app) {
  if (app.uncomputedMonitorId) clearInterval(app.uncomputedMonitorId);

  app.uncomputedMonitorId = setInterval(() => {
    if (!app.backgroundComputeEnabled) return;
    if (app.hasPendingLocalEdit()) return;
    if (app.aiService.hasInFlightWork()) return;
    if (!hasUncomputedCells(app)) return;
    app.computeAll();
  }, app.uncomputedMonitorMs);
}

export function applyRightOverflowText(app) {
  var cellHasVisibleContent = (td, input) => {
    if (!td || !input) return false;
    var raw = String(app.getRawCellValue(input.id) || '').trim();
    if (raw !== '') return true;

    var shown = String(
      td.dataset.computedValue == null ? '' : td.dataset.computedValue,
    ).trim();
    if (shown !== '') return true;

    if (
      td.classList.contains('has-display-value') ||
      td.classList.contains('has-formula')
    )
      return true;

    var output = td.querySelector('.cell-output');
    var rendered = output ? String(output.textContent || '').trim() : '';
    return rendered !== '';
  };

  var clearState = (input) => {
    var output =
      input && input.parentElement
        ? input.parentElement.querySelector('.cell-output')
        : null;
    if (!output) return;
    output.classList.remove('spill-overflow');
    output.style.width = '';
    input.parentElement.classList.remove('spill-covered');
    input.parentElement.classList.remove('spill-source');
  };

  app.inputs.forEach((input) => clearState(input));

  for (var rowIndex = 1; rowIndex < app.table.rows.length; rowIndex++) {
    var row = app.table.rows[rowIndex];
    for (var colIndex = 1; colIndex < row.cells.length; colIndex++) {
      var td = row.cells[colIndex];
      var input = td.querySelector('input');
      if (!input) continue;
      if (app.isEditingCell(input)) continue;

      var output = td.querySelector('.cell-output');
      if (!output) continue;
      if (output.querySelector('table')) continue;
      if (td.classList.contains('display-wrap')) continue;
      if (
        td.classList.contains('display-align-center') ||
        td.classList.contains('display-align-right')
      )
        continue;

      var value = String(
        td.dataset.computedValue == null ? '' : td.dataset.computedValue,
      );
      if (!value || value.indexOf('\n') !== -1) continue;

      var immediateNext = row.cells[colIndex + 1];
      if (!immediateNext) continue;
      var immediateNextInput = immediateNext.querySelector('input');
      if (!immediateNextInput) continue;
      if (app.isEditingCell(immediateNextInput)) continue;
      if (cellHasVisibleContent(immediateNext, immediateNextInput)) continue;

      var baseWidth = td.clientWidth;
      output.classList.add('spill-overflow');
      output.style.width = baseWidth + 'px';
      var requiredWidth = app.measureOutputRequiredWidth(output);
      if (requiredWidth <= baseWidth + 1) {
        output.classList.remove('spill-overflow');
        output.style.width = '';
        continue;
      }

      var spanWidth = td.offsetWidth;
      var coveredCells = [];
      for (var nextCol = colIndex + 1; nextCol < row.cells.length; nextCol++) {
        var nextTd = row.cells[nextCol];
        var nextInput = nextTd.querySelector('input');
        if (!nextInput) break;
        if (app.isEditingCell(nextInput)) break;
        if (cellHasVisibleContent(nextTd, nextInput)) break;
        spanWidth += nextTd.offsetWidth;
        coveredCells.push(nextTd);
      }

      if (spanWidth <= baseWidth) {
        output.classList.remove('spill-overflow');
        output.style.width = '';
        continue;
      }
      output.style.width = Math.min(spanWidth, requiredWidth) + 'px';
      td.classList.add('spill-source');
      for (var c = 0; c < coveredCells.length; c++) {
        coveredCells[c].classList.add('spill-covered');
      }
    }
  }
}

function updateWrappedRowHeights(app) {
  if (!app.grid || !app.table || !app.table.rows || !app.table.rows.length)
    return;
  var defaultHeight = Number(app.grid.defaultRowHeight || 24);
  var measuredHeights = {};

  if (app.displayMode === 'formulas') {
    for (var formulaRowIndex = 1; formulaRowIndex < app.table.rows.length; formulaRowIndex++) {
      if (app.storage.getRowHeight(app.activeSheetId, formulaRowIndex) != null) continue;
      app.grid.setRowHeight(formulaRowIndex, defaultHeight);
    }
    if (typeof app.grid.stabilizeHeaderMetrics === 'function') {
      app.grid.stabilizeHeaderMetrics();
    }
    app.grid.updateTableSize();
    return;
  }

  for (var i = 0; i < app.inputs.length; i++) {
    var input = app.inputs[i];
    if (!input || !input.parentElement) continue;
    var td = input.parentElement;
    if (!td.classList.contains('display-wrap')) continue;
    if (td.classList.contains('editing')) continue;
    var row = td.parentElement;
    var rowIndex = row ? row.rowIndex : 0;
    if (!rowIndex || rowIndex < 1) continue;
    if (app.storage.getRowHeight(app.activeSheetId, rowIndex) != null) continue;
    var output = td.querySelector('.cell-output');
    if (!output) continue;
    var nextHeight = Math.max(
      defaultHeight,
      Math.ceil(output.scrollHeight) + 6,
    );
    measuredHeights[rowIndex] = Math.max(
      measuredHeights[rowIndex] || defaultHeight,
      nextHeight,
    );
  }

  for (var rowIndex = 1; rowIndex < app.table.rows.length; rowIndex++) {
    if (app.storage.getRowHeight(app.activeSheetId, rowIndex) != null) continue;
    app.grid.setRowHeight(rowIndex, measuredHeights[rowIndex] || defaultHeight);
  }
  if (typeof app.grid.stabilizeHeaderMetrics === 'function') {
    app.grid.stabilizeHeaderMetrics();
  }
  app.grid.updateTableSize();
}
