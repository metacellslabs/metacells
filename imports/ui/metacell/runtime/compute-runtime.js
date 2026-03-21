import { Meteor } from 'meteor/meteor';
import { AI_MODE } from './constants.js';
import { traceCellUpdateClient } from '../../../lib/cell-update-profile.js';
import {
  buildCellRenderModel,
  isChannelSendCommandRaw,
} from './cell-render-model.js';
import {
  applySpillVisualStateFromModel,
  clearSpillVisualState,
} from './spill-runtime.js';

function collectLocalChannelCommandRuntimeState(app) {
  if (!app || !app.storage || typeof app.storage.listAllCellIds !== 'function') {
    return [];
  }
  var entries = app.storage.listAllCellIds();
  var results = [];
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (!entry || !entry.sheetId || !entry.cellId) continue;
    var sheetId = String(entry.sheetId || '');
    var cellId = String(entry.cellId || '').toUpperCase();
    var raw = String(app.storage.getCellValue(sheetId, cellId) || '');
    if (!isChannelSendCommandRaw(raw)) continue;
    results.push({
      sheetId: sheetId,
      cellId: cellId,
      raw: raw,
      displayValue: String(app.storage.getCellDisplayValue(sheetId, cellId) || ''),
      value: String(app.storage.getCellComputedValue(sheetId, cellId) || ''),
      state: String(app.storage.getCellState(sheetId, cellId) || ''),
      error: String(app.storage.getCellError(sheetId, cellId) || ''),
    });
  }
  return results;
}

function restoreLocalChannelCommandRuntimeState(app, entries) {
  var items = Array.isArray(entries) ? entries : [];
  for (var i = 0; i < items.length; i++) {
    var entry = items[i] && typeof items[i] === 'object' ? items[i] : null;
    if (!entry || !entry.sheetId || !entry.cellId) continue;
    var currentRaw = String(
      app.storage.getCellValue(entry.sheetId, entry.cellId) || '',
    );
    if (currentRaw !== String(entry.raw || '')) continue;
    app.storage.setCellRuntimeState(entry.sheetId, entry.cellId, {
      value: entry.value,
      displayValue: entry.displayValue,
      state: entry.state,
      error: entry.error,
    });
  }
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
    var activeInput = app.getActiveCellInput
      ? app.getActiveCellInput()
      : app.activeInput;
    if (!activeInput || app.hasPendingLocalEdit()) return;
    var rawValue = app.getRawCellValue(activeInput.id);
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
  app.inputs.forEach((input) => {
    try {
      var model = buildCellRenderModel(
        app,
        app.activeSheetId,
        input.id,
        {
          showFormulas: app.displayMode === 'formulas',
          isEditing:
            app && typeof app.isEditingCell === 'function'
              ? app.isEditingCell(input)
              : document.activeElement === input,
        },
      );

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
      app.grid.renderCellValue(input, model.displayValue, model.isEditing, model.isFormula, {
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
        backgroundColor: !model.showFormulas ? model.formatMeta.backgroundColor : '',
        fontFamily: !model.showFormulas ? model.formatMeta.fontFamily : 'default',
        fontSize: !model.showFormulas ? model.formatMeta.fontSize : 14,
        borders: model.formatMeta.borders,
        hasSchedule: !!model.cellSchedule,
        scheduleTitle: model.scheduleTitle,
      });
      if (model.isFormula) {
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
  if (typeof app.syncEditorOverlay === 'function') app.syncEditorOverlay();
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
  Meteor.callAsync('sheets.computeGrid', app.sheetDocumentId, activeSheetId, {
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
      var preservedChannelCommandState =
        result && result.workbook
          ? collectLocalChannelCommandRuntimeState(app)
          : [];
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
        restoreLocalChannelCommandRuntimeState(
          app,
          preservedChannelCommandState,
        );
      }

      if (result && result.workbook) {
        app.ensureGridCapacityForStorage(result.workbook);
      }

      app.computedValuesBySheet[activeSheetId] =
        result && result.values ? result.values : {};
      if (result && result.workbook) {
        renderCurrentSheetFromStorage(app);
        finishManualUpdate();
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
            var model = buildCellRenderModel(
              app,
              app.activeSheetId,
              input.id,
              {
                raw: raw,
                storedDisplay: app.storage.getCellDisplayValue(
                  app.activeSheetId,
                  input.id,
                ),
                storedComputed: app.storage.getCellComputedValue(
                  app.activeSheetId,
                  input.id,
                ),
                cellState: app.storage.getCellState(
                  app.activeSheetId,
                  input.id,
                ),
                errorHint: app.storage.getCellError(
                  app.activeSheetId,
                  input.id,
                ),
                generatedBy: app.storage.getGeneratedCellSource(
                  app.activeSheetId,
                  input.id,
                ),
                isEditing:
                  app && typeof app.isEditingCell === 'function'
                    ? app.isEditingCell(input)
                    : document.activeElement === input,
                showFormulas: app.displayMode === 'formulas',
              },
            );
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
            input.parentElement.classList.toggle(
              'has-attachment',
              !!model.attachment,
            );
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
              },
            );
            if (model.isFormula) {
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

      var activeInput = app.getActiveCellInput
        ? app.getActiveCellInput()
        : app.activeInput;
      if (!app.hasPendingLocalEdit() && activeInput) {
        var rawValue = app.getRawCellValue(activeInput.id);
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
      if (typeof app.syncEditorOverlay === 'function') app.syncEditorOverlay();
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

  if (typeof app.clearSpillSheetState === 'function') {
    app.clearSpillSheetState(app.activeSheetId);
  }
  clearSpillVisualState(app);

  for (var rowIndex = 1; rowIndex < app.table.rows.length; rowIndex++) {
    var row = app.table.rows[rowIndex];
    for (var colIndex = 1; colIndex < row.cells.length; colIndex++) {
      var td = row.cells[colIndex];
      var input = td.querySelector('.cell-anchor-input');
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
      var immediateNextInput = immediateNext.querySelector('.cell-anchor-input');
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
        var nextInput = nextTd.querySelector('.cell-anchor-input');
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
      var appliedWidth = Math.min(spanWidth, requiredWidth);
      output.style.width = appliedWidth + 'px';
      td.classList.add('spill-source');
      var coveredCellIds = [];
      for (var c = 0; c < coveredCells.length; c++) {
        coveredCells[c].classList.add('spill-covered');
        var coveredInput = coveredCells[c].querySelector('.cell-anchor-input');
        if (coveredInput) {
          coveredCellIds.push(String(coveredInput.id || '').toUpperCase());
        }
      }
      if (typeof app.setSpillEntry === 'function') {
        app.setSpillEntry(app.activeSheetId, input.id, {
          coveredCellIds: coveredCellIds,
          range: {
            startCol: colIndex,
            endCol: colIndex + coveredCells.length,
            startRow: rowIndex,
            endRow: rowIndex,
          },
          requiredWidth: requiredWidth,
          appliedWidth: appliedWidth,
        });
      }
    }
  }
  applySpillVisualStateFromModel(app, app.activeSheetId);
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
