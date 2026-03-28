import { rpc } from '../../../../lib/rpc-client.js';
import { buildClientWorkbookSnapshot } from '../../../api/sheets/workbook-codec.js';
import { traceCellUpdateClient } from '../../../lib/cell-update-profile.js';
import {
  collectLocalAttachmentRuntimeState,
  collectLocalChannelCommandRuntimeState,
  getRenderTargetsForComputeResult,
  restoreLocalAttachmentRuntimeState,
  restoreLocalChannelCommandRuntimeState,
  syncFormulaBarWithActiveCell,
} from './compute-support-runtime.js';
import {
  applyRightOverflowText,
  measureOutputRequiredWidth,
  updateWrappedRowHeights,
} from './compute-layout-runtime.js';
import {
  applyComputedCellRender,
  clearComputedCellRenderState,
} from './compute-render-runtime.js';

function getInputRowIndex(app, input) {
  if (!input) return 0;
  var row =
    input.parentElement && input.parentElement.parentElement
      ? input.parentElement.parentElement
      : null;
  if (row && Number(row.rowIndex) > 0) return Number(row.rowIndex);
  var parsed =
    typeof app.parseCellId === 'function' ? app.parseCellId(input.id) : null;
  return parsed && parsed.row ? parsed.row : 0;
}

function buildDirtyLayoutOptions(inputs) {
  var dirtyRows = {};
  var dirtyCount = 0;
  var items = Array.isArray(inputs) ? inputs : [];
  for (var i = 0; i < items.length; i++) {
    var input = items[i];
    var rowIndex = getInputRowIndex(null, input);
    if (!Number.isFinite(rowIndex) || rowIndex < 1 || dirtyRows[rowIndex]) {
      continue;
    }
    dirtyRows[rowIndex] = true;
    dirtyCount++;
  }
  if (!dirtyCount) return null;
  return {
    rowIndexes: Object.keys(dirtyRows).map(function (rowIndex) {
      return Number(rowIndex);
    }),
  };
}

function normalizeChangedCellIds(cellIds) {
  return Array.isArray(cellIds)
    ? cellIds
        .map(function (cellId) {
          return String(cellId || '').toUpperCase();
        })
        .filter(Boolean)
    : [];
}

function getResultSheetPatch(result, sheetId, changedCellIds) {
  var runtimePatchBySheet =
    result && result.runtimePatchBySheet && typeof result.runtimePatchBySheet === 'object'
      ? result.runtimePatchBySheet
      : null;
  if (
    runtimePatchBySheet &&
    runtimePatchBySheet[sheetId] &&
    typeof runtimePatchBySheet[sheetId] === 'object'
  ) {
    return runtimePatchBySheet[sheetId];
  }
  return null;
}

function applyServerRuntimePatch(app, sheetId, sheetPatch) {
  if (
    !app ||
    !sheetId ||
    !sheetPatch ||
    typeof sheetPatch !== 'object' ||
    !app.storage ||
    typeof app.storage.applyServerCellPatch !== 'function'
  ) {
    return false;
  }
  var cellIds = Object.keys(sheetPatch);
  if (!cellIds.length) return false;
  for (var i = 0; i < cellIds.length; i++) {
    var cellId = String(cellIds[i] || '').toUpperCase();
    var patch =
      sheetPatch[cellId] && typeof sheetPatch[cellId] === 'object'
        ? sheetPatch[cellId]
        : null;
    if (!patch || patch.clear === true) return false;
    var localSource = String(app.getRawCellValue(cellId) || '');
    var nextSource = String(patch.source || '');
    if (localSource && localSource !== nextSource) return false;
    if (!app.storage.applyServerCellPatch(sheetId, cellId, patch)) return false;
  }
  return true;
}

function collectAttachmentRenderTargets(app, inputs) {
  var items = Array.isArray(inputs) ? inputs : [];
  var results = [];
  for (var i = 0; i < items.length; i++) {
    var input = items[i];
    if (!input) continue;
    var cellId = String(input.id || '').toUpperCase();
    if (!cellId) continue;
    var raw = app.getRawCellValue(cellId);
    var computed = app.storage.getCellComputedValue(app.activeSheetId, cellId);
    var display = app.storage.getCellDisplayValue(app.activeSheetId, cellId);
    if (
      app.parseAttachmentSource(raw) ||
      app.parseAttachmentSource(computed) ||
      app.parseAttachmentSource(display)
    ) {
      results.push(input);
    }
  }
  return results;
}

function rerenderAttachmentTargets(app, inputs) {
  var targets = collectAttachmentRenderTargets(app, inputs);
  for (var i = 0; i < targets.length; i++) {
    var input = targets[i];
    try {
      applyComputedCellRender(app, input, {
        showFormulas: app.displayMode === 'formulas',
        raw: app.getRawCellValue(input.id),
        storedDisplay: app.storage.getCellDisplayValue(app.activeSheetId, input.id),
        storedComputed: app.storage.getCellComputedValue(
          app.activeSheetId,
          input.id,
        ),
        cellState: app.storage.getCellState(app.activeSheetId, input.id),
        errorHint: app.storage.getCellError(app.activeSheetId, input.id),
        generatedBy: app.storage.getGeneratedCellSource(app.activeSheetId, input.id),
      });
    } catch (e) {}
  }
}

function renderChangedCellIds(app, cellIds) {
  var changedCellIds = normalizeChangedCellIds(cellIds);
  if (!changedCellIds.length) {
    renderCurrentSheetFromStorage(app);
    return;
  }
  var renderTargets = [];
  for (var i = 0; i < changedCellIds.length; i++) {
    var input =
      typeof app.getCellInput === 'function'
        ? app.getCellInput(changedCellIds[i])
        : app.inputById[changedCellIds[i]];
    if (input) renderTargets.push(input);
  }
  if (!renderTargets.length) {
    renderCurrentSheetFromStorage(app);
    return;
  }
  renderTargets.forEach(function (input) {
    try {
      applyComputedCellRender(app, input, {
        showFormulas: app.displayMode === 'formulas',
        raw: app.getRawCellValue(input.id),
        storedDisplay: app.storage.getCellDisplayValue(app.activeSheetId, input.id),
        storedComputed: app.storage.getCellComputedValue(
          app.activeSheetId,
          input.id,
        ),
        cellState: app.storage.getCellState(app.activeSheetId, input.id),
        errorHint: app.storage.getCellError(app.activeSheetId, input.id),
        generatedBy: app.storage.getGeneratedCellSource(app.activeSheetId, input.id),
      });
    } catch (e) {
      clearComputedCellRenderState(input, app);
    }
  });
  var layoutOptions = buildDirtyLayoutOptions(renderTargets);
  updateWrappedRowHeights(app, layoutOptions);
  applyRightOverflowText(app, layoutOptions);
  rerenderAttachmentTargets(app, renderTargets);
  syncFormulaBarWithActiveCell(app);
  if (typeof app.syncEditorOverlay === 'function') app.syncEditorOverlay();
  app.syncAIModeUI();
  app.applyDependencyHighlight();
  app.renderReportLiveValues();
}

export { renderChangedCellIds };

function applyFullWorkbookSnapshot(app, workbook) {
  if (
    !app ||
    !workbook ||
    typeof workbook !== 'object' ||
    !app.storage ||
    !app.storage.storage ||
    typeof app.storage.storage.replaceAll !== 'function'
  ) {
    return false;
  }
  var preservedChannelCommandState = collectLocalChannelCommandRuntimeState(app);
  var preservedAttachmentState = collectLocalAttachmentRuntimeState(app);
  app.storage.storage.replaceAll(workbook);
  restoreLocalChannelCommandRuntimeState(app, preservedChannelCommandState);
  restoreLocalAttachmentRuntimeState(app, preservedAttachmentState);
  if (typeof app.ensureGridCapacityForStorage === 'function') {
    app.ensureGridCapacityForStorage(workbook);
  }
  renderCurrentSheetFromStorage(app);
  return true;
}

function fetchAndApplyFullWorkbookSnapshot(app) {
  if (!app || !app.sheetDocumentId) return Promise.resolve(false);
  return rpc('sheets.one', app.sheetDocumentId)
    .then(function (sheetData) {
      var workbook =
        sheetData && sheetData.workbook && typeof sheetData.workbook === 'object'
          ? sheetData.workbook
          : null;
      if (!workbook) return false;
      if (
        sheetData &&
        sheetData.documentRevision &&
        app.storage &&
        app.storage.storage &&
        typeof app.storage.storage.setDocumentRevision === 'function'
      ) {
        app.storage.storage.setDocumentRevision(String(sheetData.documentRevision || ''));
      }
      if (sheetData && sheetData.runtimeRevision) {
        app.serverWorkbookRevision = String(sheetData.runtimeRevision || '');
      }
      return applyFullWorkbookSnapshot(app, workbook);
    })
    .catch(function () {
      return false;
    });
}

function handleComputeConflict(app, options) {
  if (!app) return Promise.resolve(null);
  return rpc('sheets.getSyncState', app.sheetDocumentId)
    .then(function (result) {
      var nextDocumentRevision = String(
        result && result.documentRevision ? result.documentRevision : '',
      );
      var nextRuntimeRevision = String(
        result && result.runtimeRevision ? result.runtimeRevision : '',
      );
      if (nextRuntimeRevision) {
        app.serverWorkbookRevision = nextRuntimeRevision;
      }
      if (nextDocumentRevision) {
        if (
          app.storage &&
          app.storage.storage &&
          typeof app.storage.storage.setDocumentRevision === 'function'
        ) {
          app.storage.storage.setDocumentRevision(nextDocumentRevision);
        }
      }
      return app.refreshVisibleSheetFromServer({
        bypassPendingEdit: true,
        forceRefreshAI: !!(options && options.forceRefreshAI),
        targetCellIds:
          options && Array.isArray(options.targetCellIds) ? options.targetCellIds : [],
        skipExpectedRevision: true,
      });
    })
    .catch(function () {
      return null;
    });
}

function getExpectedDocumentRevision(app) {
  if (
    app &&
    app.storage &&
    app.storage.storage &&
    typeof app.storage.storage.getDocumentRevision === 'function'
  ) {
    return String(app.storage.storage.getDocumentRevision() || '');
  }
  return '';
}

function shouldSendExpectedRevisionForCompute(app, options) {
  if (options && options.skipExpectedRevision) return false;
  if (
    app &&
    app.storage &&
    app.storage.storage &&
    typeof app.storage.storage.hasPendingPersistence === 'function' &&
    app.storage.storage.hasPendingPersistence()
  ) {
    return false;
  }
  return true;
}

function collectFormulaProbeInputs(app, options) {
  if (!app) return [];
  if (options && options.includeDetached && Array.isArray(app.inputs)) {
    return app.inputs;
  }
  return typeof app.getMountedInputs === 'function'
    ? app.getMountedInputs()
    : app.inputs || [];
}

export function renderCurrentSheetFromStorage(app) {
  var options =
    arguments.length > 1 && arguments[1] && typeof arguments[1] === 'object'
      ? arguments[1]
      : {};
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
  var mountedInputs = collectFormulaProbeInputs(app);
  for (var i = 0; i < mountedInputs.length; i++) {
    var probeRaw = app.getRawCellValue(mountedInputs[i].id);
    if (
      probeRaw &&
      (probeRaw.charAt(0) === '=' ||
        probeRaw.charAt(0) === '>' ||
        probeRaw.charAt(0) === '#' ||
        probeRaw.charAt(0) === "'")
    ) {
      formulaCount++;
    }
  }
  var formulaDone = 0;
  app.updateCalcProgress(0, formulaCount);

  mountedInputs.forEach(function (input) {
    try {
      var model = applyComputedCellRender(app, input, {
        showFormulas: app.displayMode === 'formulas',
      });
      if (model.isFormula) {
        formulaDone++;
        app.updateCalcProgress(formulaDone, formulaCount);
      }
    } catch (e) {
      clearComputedCellRenderState(input, app);
    }
  });

  var layoutOptions = buildDirtyLayoutOptions(mountedInputs);
  updateWrappedRowHeights(app, layoutOptions);
  applyRightOverflowText(app, layoutOptions);
  rerenderAttachmentTargets(app, mountedInputs);
  app.applyDependencyHighlight();
  syncFormulaBarWithActiveCell(app);
  if (typeof app.syncEditorOverlay === 'function') app.syncEditorOverlay();
  app.syncAIModeUI();
  app.renderReportLiveValues(true);
  app.finishCalcProgress(formulaCount);
}

export function computeAll(app) {
  var options =
    arguments.length > 1 && arguments[1] && typeof arguments[1] === 'object'
      ? arguments[1]
      : {};
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
  var computeProbeInputs = collectFormulaProbeInputs(app, {
    includeDetached: true,
  });
  for (var i = 0; i < computeProbeInputs.length; i++) {
    var probeRaw = app.getRawCellValue(computeProbeInputs[i].id);
    if (
      probeRaw &&
      (probeRaw.charAt(0) === '=' ||
        probeRaw.charAt(0) === '>' ||
        probeRaw.charAt(0) === '#' ||
        probeRaw.charAt(0) === "'")
    ) {
      formulaCount++;
    }
  }
  var formulaDone = 0;
  app.updateCalcProgress(0, formulaCount);

  var didResort = app.applyAutoResort();
  var requestToken = ++app.computeRequestToken;
  var activeSheetId =
    typeof app.getVisibleSheetId === 'function'
      ? app.getVisibleSheetId()
      : app.activeSheetId;
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
    expectedRevision: shouldSendExpectedRevisionForCompute(app, options)
      ? getExpectedDocumentRevision(app)
      : '',
    workbookSnapshot:
      app.storage &&
      app.storage.storage &&
      typeof app.storage.storage.snapshot === 'function'
        ? buildClientWorkbookSnapshot(app.storage.storage.snapshot())
        : {},
  })
    .then(function (result) {
      var selectivePatch = getResultSheetPatch(
        result,
        activeSheetId,
        result && result.changedCellIds,
      );
      traceCellUpdateClient(trace, 'compute_call.done', {
        returnedValues:
          result && result.values ? Object.keys(result.values).length : 0,
        hasRuntimePatch: !!selectivePatch,
      });
      if (requestToken !== app.computeRequestToken) {
        finishManualUpdate();
        return;
      }
      if (result && result.runtimeRevision) {
        app.serverWorkbookRevision = String(result.runtimeRevision || '');
      }
      if (result && result.documentRevision) {
        if (
          app.storage &&
          app.storage.storage &&
          typeof app.storage.storage.setDocumentRevision === 'function'
        ) {
          app.storage.storage.setDocumentRevision(
            String(result.documentRevision || ''),
          );
        }
      }
      if (activeSheetId !== app.activeSheetId) {
        finishManualUpdate();
        return;
      }
      var selectiveChangedCellIds = normalizeChangedCellIds(
        result && result.changedCellIds,
      );
      var appliedSelectivePatch = false;
      if (selectivePatch) {
        appliedSelectivePatch = applyServerRuntimePatch(
          app,
          activeSheetId,
          selectivePatch,
        );
      }

      if (
        selectiveChangedCellIds.length &&
        typeof app.ensureGridCapacityForCellIds === 'function'
      ) {
        app.ensureGridCapacityForCellIds(selectiveChangedCellIds);
      }

      app.computedValuesBySheet[activeSheetId] =
        result && result.values ? result.values : {};
      if (appliedSelectivePatch) {
        renderCurrentSheetFromStorage(app);
        finishManualUpdate();
        return;
      }
      if (selectiveChangedCellIds.length || selectivePatch) {
        return fetchAndApplyFullWorkbookSnapshot(app).then(function () {
          finishManualUpdate();
        });
      }
      var computedValues = app.computedValuesBySheet[activeSheetId] || {};
      var renderTargets = getRenderTargetsForComputeResult(
        app,
        computedValues,
        didResort,
      );
      var renderFn = function () {
        renderTargets.forEach(function (input) {
          try {
            var model = applyComputedCellRender(app, input, {
              showFormulas: app.displayMode === 'formulas',
              raw: app.getRawCellValue(input.id),
              storedDisplay: app.storage.getCellDisplayValue(
                app.activeSheetId,
                input.id,
              ),
              storedComputed: app.storage.getCellComputedValue(
                app.activeSheetId,
                input.id,
              ),
              cellState: app.storage.getCellState(app.activeSheetId, input.id),
              errorHint: app.storage.getCellError(app.activeSheetId, input.id),
              generatedBy: app.storage.getGeneratedCellSource(
                app.activeSheetId,
                input.id,
              ),
            });
            if (model.isFormula) {
              formulaDone++;
              app.updateCalcProgress(formulaDone, formulaCount);
            }
          } catch (e) {
            clearComputedCellRenderState(input, app);
          }
        });
      };
      if (renderTargets.length) {
        if (didResort) app.runWithAISuppressed(renderFn);
        else renderFn();
        var layoutOptions = buildDirtyLayoutOptions(renderTargets);
        updateWrappedRowHeights(app, layoutOptions);
        applyRightOverflowText(app, layoutOptions);
        rerenderAttachmentTargets(app, renderTargets);
      }

      syncFormulaBarWithActiveCell(app);
      if (typeof app.syncEditorOverlay === 'function') app.syncEditorOverlay();
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
    .catch(function (error) {
      console.error('[sheet] computeAll failed', error);
      if (error && String(error.error || '').toLowerCase() === 'conflict') {
        handleComputeConflict(app, options);
      }
      finishManualUpdate();
      app.syncAIModeUI();
      app.finishCalcProgress(formulaCount);
      traceCellUpdateClient(trace, 'compute_call.failed', {
        message: String(error && error.message ? error.message : error || ''),
      });
    });
}

export function refreshVisibleSheetFromServer(app) {
  var options =
    arguments.length > 1 && arguments[1] && typeof arguments[1] === 'object'
      ? arguments[1]
      : {};
  if (!app || app.isReportActive()) return Promise.resolve(null);
  if (!options.bypassPendingEdit && app.hasPendingLocalEdit()) {
    return Promise.resolve(null);
  }

  var requestToken = ++app.computeRequestToken;
  var activeSheetId =
    typeof app.getVisibleSheetId === 'function'
      ? app.getVisibleSheetId()
      : app.activeSheetId;
  var forceRefreshAI =
    options.forceRefreshAI === undefined ? true : !!options.forceRefreshAI;
  var hintedChangedCellIds = normalizeChangedCellIds(options.targetCellIds);
  var requestSignature = JSON.stringify({
    sheetId: String(activeSheetId || ''),
    forceRefreshAI: !!forceRefreshAI,
    targetCellIds: hintedChangedCellIds,
  });
  if (
    app.refreshVisibleSheetRequest &&
    app.refreshVisibleSheetRequest.promise &&
    app.refreshVisibleSheetRequest.signature === requestSignature
  ) {
    return app.refreshVisibleSheetRequest.promise;
  }

  var requestPromise = rpc('sheets.computeGrid', app.sheetDocumentId, activeSheetId, {
    forceRefreshAI: forceRefreshAI,
    manualTriggerAI: false,
    expectedRevision: shouldSendExpectedRevisionForCompute(app, options)
      ? getExpectedDocumentRevision(app)
      : '',
    targetCellIds: hintedChangedCellIds,
  })
    .then(function (result) {
      if (requestToken !== app.computeRequestToken) return null;
      if (activeSheetId !== app.activeSheetId) return null;
      var refreshPatch = getResultSheetPatch(
        result,
        activeSheetId,
        result && result.changedCellIds,
      );

      if (result && result.runtimeRevision) {
        app.serverWorkbookRevision = String(result.runtimeRevision || '');
      }
      if (result && result.documentRevision) {
        if (
          app.storage &&
          app.storage.storage &&
          typeof app.storage.storage.setDocumentRevision === 'function'
        ) {
          app.storage.storage.setDocumentRevision(
            String(result.documentRevision || ''),
          );
        }
      }
      var refreshChangedCellIds = normalizeChangedCellIds(
        result && result.changedCellIds,
      );
      var appliedRefreshPatch = false;
      if (refreshPatch) {
        appliedRefreshPatch = applyServerRuntimePatch(
          app,
          activeSheetId,
          refreshPatch,
        );
      }
      if (
        refreshChangedCellIds.length &&
        typeof app.ensureGridCapacityForCellIds === 'function'
      ) {
        app.ensureGridCapacityForCellIds(refreshChangedCellIds);
      }
      app.computedValuesBySheet[activeSheetId] =
        result && result.values ? result.values : {};
      var changedCellIds =
        result && Array.isArray(result.changedCellIds) && result.changedCellIds.length
          ? result.changedCellIds
          : hintedChangedCellIds;

      if (appliedRefreshPatch) {
        renderChangedCellIds(app, changedCellIds);
        return result;
      }
      if (refreshChangedCellIds.length || refreshPatch) {
        return fetchAndApplyFullWorkbookSnapshot(app).then(function () {
          return result;
        });
      }

      var computedValues = app.computedValuesBySheet[activeSheetId] || {};
      var renderTargets = getRenderTargetsForComputeResult(
        app,
        computedValues,
        false,
      );
      renderTargets.forEach(function (input) {
        try {
          applyComputedCellRender(app, input, {
            showFormulas: app.displayMode === 'formulas',
            raw: app.getRawCellValue(input.id),
            storedDisplay: app.storage.getCellDisplayValue(
              app.activeSheetId,
              input.id,
            ),
            storedComputed: app.storage.getCellComputedValue(
              app.activeSheetId,
              input.id,
            ),
            cellState: app.storage.getCellState(app.activeSheetId, input.id),
            errorHint: app.storage.getCellError(app.activeSheetId, input.id),
            generatedBy: app.storage.getGeneratedCellSource(
              app.activeSheetId,
              input.id,
            ),
          });
        } catch (e) {
          clearComputedCellRenderState(input, app);
        }
      });
      if (renderTargets.length) {
        var layoutOptions = buildDirtyLayoutOptions(renderTargets);
        updateWrappedRowHeights(app, layoutOptions);
        applyRightOverflowText(app, layoutOptions);
        rerenderAttachmentTargets(app, renderTargets);
      }
      syncFormulaBarWithActiveCell(app);
      if (typeof app.syncEditorOverlay === 'function') app.syncEditorOverlay();
      app.syncAIModeUI();
      app.applyDependencyHighlight();
      app.renderReportLiveValues();
      return result;
    })
    .catch(function (error) {
      console.error('[sheet] refreshVisibleSheetFromServer failed', error);
      if (error && String(error.error || '').toLowerCase() === 'conflict') {
        return handleComputeConflict(app, {
          forceRefreshAI: forceRefreshAI,
          targetCellIds: hintedChangedCellIds,
        });
      }
      return null;
    })
    .finally(function () {
      if (
        app.refreshVisibleSheetRequest &&
        app.refreshVisibleSheetRequest.signature === requestSignature
      ) {
        app.refreshVisibleSheetRequest = null;
      }
    });
  app.refreshVisibleSheetRequest = {
    signature: requestSignature,
    promise: requestPromise,
  };
  return requestPromise;
}

export { applyRightOverflowText, measureOutputRequiredWidth };
export { getRenderTargetsForComputeResult };

function needsFormulaRecompute(app, sheetId, input, options) {
  var opts = options && typeof options === 'object' ? options : {};
  if (!app || !sheetId || !input) return false;
  var raw = app.getRawCellValue(input.id);
  if (
    !raw ||
    (raw.charAt(0) !== '=' &&
      raw.charAt(0) !== '>' &&
      raw.charAt(0) !== '#' &&
      raw.charAt(0) !== "'")
  ) {
    return false;
  }
  var isExplicitAsync =
    app &&
    typeof app.isExplicitAsyncFormulaRaw === 'function' &&
    app.isExplicitAsyncFormulaRaw(raw);
  var state = String(app.storage.getCellState(sheetId, input.id) || '');
  if (opts.ignoreAsyncPending && isExplicitAsync && state === 'pending') {
    return false;
  }
  if (state === 'pending' || state === 'stale') return true;
  var display = String(app.storage.getCellDisplayValue(sheetId, input.id) || '');
  if (opts.ignoreAsyncPending && isExplicitAsync && display === '...') {
    return false;
  }
  if (!display.trim()) return true;
  var output = input.parentElement.querySelector('.cell-output');
  var shown = output ? String(output.textContent || '').trim() : '';
  if (opts.ignoreAsyncPending && isExplicitAsync && shown === '...') {
    return false;
  }
  if (shown === '...') return true;
  return false;
}

export function hasUncomputedCells(app) {
  if (app.isReportActive()) return false;
  var sheetId =
    typeof app.getVisibleSheetId === 'function'
      ? app.getVisibleSheetId()
      : app.activeSheetId;
  var ignoreAsyncPending = !!(app && app.serverPushEventsEnabled);
  for (var i = 0; i < app.inputs.length; i++) {
    if (
      needsFormulaRecompute(app, sheetId, app.inputs[i], {
        ignoreAsyncPending: ignoreAsyncPending,
      })
    ) {
      return true;
    }
  }
  return false;
}

function scheduleUncomputedCheck(app) {
  if (!app || typeof window === 'undefined') return;
  if (app.uncomputedMonitorId && typeof window.clearTimeout === 'function') {
    window.clearTimeout(app.uncomputedMonitorId);
    app.uncomputedMonitorId = null;
  }
  var delayMs = Math.max(250, Number(app.uncomputedMonitorMs) || 2000);
  app.uncomputedMonitorId = window.setTimeout(function () {
    app.uncomputedMonitorId = null;
    if (!app.backgroundComputeEnabled) return;
    if (app.hasPendingLocalEdit()) return;
    if (!app.serverPushEventsEnabled && app.aiService.hasInFlightWork()) {
      scheduleUncomputedCheck(app);
      return;
    }
    if (!hasUncomputedCells(app)) {
      scheduleUncomputedCheck(app);
      return;
    }
    Promise.resolve(app.computeAll()).finally(function () {
      scheduleUncomputedCheck(app);
    });
  }, delayMs);
}

export function startUncomputedMonitor(app) {
  scheduleUncomputedCheck(app);
}
