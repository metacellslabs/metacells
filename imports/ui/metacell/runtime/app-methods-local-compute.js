import { traceCellUpdateClient } from '../../../lib/cell-update-profile.js';
import { applyComputedCellRender } from './compute-render-runtime.js';
import { applyActiveSourceCellEdit } from './source-edit-facade.js';
import {
  applyErrorRuntimeState,
  applyPendingRuntimeState,
  applyResolvedRuntimeState,
} from './runtime-cell-state-facade.js';
import {
  recomputeFromRawEdit,
  shouldForceServerRecomputeForRawEdit,
} from './recompute-from-edit-facade.js';

export function installLocalComputeMethods(SpreadsheetApp) {
  if (!SpreadsheetApp || !SpreadsheetApp.prototype) return;

  function invalidatePendingComputeResponses(app) {
    if (!app) return;
    app.computeRequestToken = (Number(app.computeRequestToken) || 0) + 1;
    if (app.isManualAIUpdating) {
      app.isManualAIUpdating = false;
      app.manualUpdateRequestToken = 0;
      app.syncAIModeUI();
    }
  }

  function getAsyncFormulaPlaceholder(app) {
    var mode =
      app &&
      app.aiService &&
      typeof app.aiService.getMode === 'function'
        ? String(app.aiService.getMode() || '')
        : '';
    return mode === 'manual' ? '(manual: click Update)' : '...';
  }

  function primeAsyncFormulaPendingUi(app, cellId, rawValue) {
    if (!app || !app.isExplicitAsyncFormulaRaw(rawValue)) return false;
    var normalizedCellId = String(cellId || '').toUpperCase();
    var placeholder = getAsyncFormulaPlaceholder(app);
    applyPendingRuntimeState(app, {
      sheetId: app.activeSheetId,
      cellId: normalizedCellId,
      placeholder: placeholder,
    });
    var input =
      typeof app.getCellInput === 'function'
        ? app.getCellInput(normalizedCellId)
        : app.inputById
          ? app.inputById[normalizedCellId]
          : null;
    if (input) {
      applyComputedCellRender(app, input, {
        showFormulas: app.displayMode === 'formulas',
        raw: rawValue,
        storedDisplay: placeholder,
        storedComputed: placeholder,
        cellState: 'pending',
        errorHint: '',
        generatedBy: app.storage.getGeneratedCellSource(
          app.activeSheetId,
          normalizedCellId,
        ),
      });
    }
    return true;
  }

  function applyLocalSyncTarget(app, sourceKey) {
    var parsed = app.parseDependencySourceKey(sourceKey);
    if (!parsed) return;
    try {
      var runtimeMeta = {};
      var value = app.formulaEngine.evaluateCell(
        parsed.sheetId,
        parsed.cellId,
        {},
        { forceRefreshAI: false, runtimeMeta: runtimeMeta },
      );
      var nextValue = String(value == null ? '' : value);
      var nextState = nextValue === '...' ? 'pending' : 'resolved';
      if (nextState === 'pending') {
        applyPendingRuntimeState(app, {
          sheetId: parsed.sheetId,
          cellId: parsed.cellId,
          placeholder: String(runtimeMeta.displayValue || nextValue),
        });
      } else {
        applyResolvedRuntimeState(app, {
          sheetId: parsed.sheetId,
          cellId: parsed.cellId,
          value: nextValue,
          displayValue: String(runtimeMeta.displayValue || nextValue),
        });
      }
    } catch (error) {
      var message = String(error && error.message ? error.message : error || '');
      if (message === '#SELECT_FILE') {
        applyPendingRuntimeState(app, {
          sheetId: parsed.sheetId,
          cellId: parsed.cellId,
          placeholder: '',
        });
        return;
      }
      var displayValue =
        message === '#SELECT_FILE'
          ? '#SELECT_FILE'
          : message.indexOf('#REF!') === 0
            ? '#REF!'
            : '#ERROR';
      applyErrorRuntimeState(app, {
        sheetId: parsed.sheetId,
        cellId: parsed.cellId,
        value: displayValue,
        error: message || displayValue,
      });
    }
  }

  SpreadsheetApp.prototype.collectLocalSyncRecomputePlan =
    function collectLocalSyncRecomputePlan(cellId, rawValue) {
      return this.collectLocalSyncRecomputePlanForCell(
        this.activeSheetId,
        cellId,
        rawValue,
      );
    };

  SpreadsheetApp.prototype.collectLocalSyncRecomputePlanForCell =
    function collectLocalSyncRecomputePlanForCell(sheetId, cellId, rawValue) {
      var normalizedCellId = String(cellId || '').toUpperCase();
      var raw = String(rawValue == null ? '' : rawValue);
      var targets = [];
      var seen = Object.create(null);
      var needsServer = false;
      var serverTargets = [];
      var add = function (key) {
        var normalized = String(key || '');
        if (!normalized || seen[normalized]) return;
        seen[normalized] = true;
        targets.push(normalized);
      };

      if (raw && raw.charAt(0) === '=') {
        add(String(sheetId || '') + ':' + normalizedCellId);
      }

      var downstream = this.getTransitiveDependentSourceKeysForCell(
        sheetId,
        normalizedCellId,
      );
      for (var i = 0; i < downstream.length; i++) add(downstream[i]);

      if (!targets.length) {
        return {
          localTargets: [],
          serverTargets: [],
          needsServer: false,
        };
      }
      for (var t = 0; t < targets.length; t++) {
        if (!this.canLocallyResolveSyncSourceKey(targets[t], Object.create(null))) {
          needsServer = true;
          serverTargets.push(targets[t]);
          targets.splice(t, 1);
          t -= 1;
        }
      }
      return {
        localTargets: targets,
        serverTargets: serverTargets,
        needsServer: needsServer,
      };
    };

  SpreadsheetApp.prototype.markServerRecomputeTargetsStale =
    function markServerRecomputeTargetsStale(sourceKeys) {
      var targets = Array.isArray(sourceKeys) ? sourceKeys : [];
      for (var i = 0; i < targets.length; i++) {
        var parsed = this.parseDependencySourceKey(targets[i]);
        if (!parsed) continue;
        var raw = String(this.storage.getCellValue(parsed.sheetId, parsed.cellId) || '');
        if (!this.isFormulaLikeRawValue(raw)) continue;
        if (this.isGeneratedAIResultSourceRaw(raw)) {
          if (typeof this.clearGeneratedResultCellsForSource === 'function') {
            this.clearGeneratedResultCellsForSource(
              parsed.sheetId,
              parsed.cellId,
              raw,
            );
          } else {
            this.storage.clearGeneratedCellsBySource(parsed.sheetId, parsed.cellId);
          }
        }
        var nextState = { state: 'stale', error: '' };
        if (this.isExplicitAsyncFormulaRaw(raw)) {
          var placeholder = getAsyncFormulaPlaceholder(this);
          nextState = {
            value: placeholder,
            displayValue: placeholder,
            state: 'pending',
            error: '',
          };
        }
        this.storage.setCellRuntimeState(parsed.sheetId, parsed.cellId, nextState);
      }
    };

  SpreadsheetApp.prototype.recomputeLocalSyncTargets =
    function recomputeLocalSyncTargets(sourceKeys) {
      var targets = Array.isArray(sourceKeys) ? sourceKeys : [];
      if (!targets.length) return false;

      for (var i = 0; i < targets.length; i++) {
        applyLocalSyncTarget(this, targets[i]);
      }
      return true;
    };

  SpreadsheetApp.prototype.recomputeLocalSyncTargetsBatched =
    function recomputeLocalSyncTargetsBatched(sourceKeys, options) {
      var app = this;
      var targets = Array.isArray(sourceKeys) ? sourceKeys.slice() : [];
      var opts = options && typeof options === 'object' ? options : {};
      var batchSize = Math.max(1, Math.min(100, Number(opts.batchSize) || 24));
      var onComplete =
        typeof opts.onComplete === 'function' ? opts.onComplete : function () {};
      if (!targets.length) {
        onComplete();
        return;
      }

      var index = 0;
      var runBatch = function () {
        var end = Math.min(index + batchSize, targets.length);
        for (; index < end; index += 1) {
          applyLocalSyncTarget(app, targets[index]);
        }
        if (index >= targets.length) {
          onComplete();
          return;
        }
        requestAnimationFrame(runBatch);
      };

      requestAnimationFrame(runBatch);
    };

  SpreadsheetApp.prototype.applyRawCellUpdate = function applyRawCellUpdate(
    sheetId,
    cellId,
    rawValue,
    meta,
  ) {
    var targetSheetId = String(sheetId || '');
    var normalizedCellId = String(cellId || '').toUpperCase();
    var raw = String(rawValue == null ? '' : rawValue);
    invalidatePendingComputeResponses(this);
    this.storage.setCellValue(targetSheetId, normalizedCellId, raw, meta);
    this.aiService.notifyActiveCellChanged();
    recomputeFromRawEdit(this, {
      sheetId: targetSheetId,
      cellId: normalizedCellId,
      rawValue: raw,
      renderOnDefer: true,
    });
  };

  SpreadsheetApp.prototype.commitRawCellEdit = function commitRawCellEdit(
    cellId,
    rawValue,
    trace,
    options,
  ) {
    var opts = options && typeof options === 'object' ? options : {};
    var normalizedCellId = String(cellId || '').toUpperCase();
    var raw = String(rawValue == null ? '' : rawValue);
    this.captureHistorySnapshot('cell:' + this.activeSheetId + ':' + normalizedCellId);
    if (this.runChannelSendCommandForCell(normalizedCellId, raw)) {
      traceCellUpdateClient(trace, 'channel_send.dispatched', {
        cellId: normalizedCellId,
      });
      return;
    }
    invalidatePendingComputeResponses(this);
    applyActiveSourceCellEdit(this, {
      cellId: normalizedCellId,
      rawValue: raw,
    });
    this.aiService.notifyActiveCellChanged();
    primeAsyncFormulaPendingUi(this, normalizedCellId, raw);
    var self = this;
    var finalizeEditRender = function () {
      var recomputePlan = self.collectLocalSyncRecomputePlan(
        normalizedCellId,
        raw,
      );
      var localTargets =
        recomputePlan && Array.isArray(recomputePlan.localTargets)
          ? recomputePlan.localTargets
          : [];
      var serverTargets =
        recomputePlan && Array.isArray(recomputePlan.serverTargets)
          ? recomputePlan.serverTargets
          : [];
      var needsServer = !!(recomputePlan && recomputePlan.needsServer);
      var finishAfterLocalSync = function () {
        if (serverTargets.length) self.markServerRecomputeTargetsStale(serverTargets);
        self.renderCurrentSheetFromStorage();
        traceCellUpdateClient(trace, 'edit.local_render.done', {
          hasDownstreamDependents: self.hasDownstreamDependents(normalizedCellId),
          localTargets: localTargets.length,
          serverTargets: serverTargets.length,
          needsServer: needsServer,
        });
        var shouldDeferManualAsyncRecompute =
          !!serverTargets.length &&
          !self.isFormulaLikeRawValue(raw) &&
          self.aiService &&
          typeof self.aiService.getMode === 'function' &&
          String(self.aiService.getMode() || '') === 'manual' &&
          serverTargets.every(function (sourceKey) {
            return isExplicitAsyncServerTarget(self, sourceKey);
          });
        if (shouldDeferManualAsyncRecompute) {
          traceCellUpdateClient(trace, 'edit.complete.defer_manual_async');
          return;
        }
        if (
          needsServer ||
          shouldForceServerRecomputeForRawEdit(
            self,
            self.activeSheetId,
            normalizedCellId,
            raw,
          )
        ) {
          self.computeAll({
            trace: trace,
            bypassPendingEdit: true,
            skipExpectedRevision: true,
          });
          return;
        }
        traceCellUpdateClient(trace, 'edit.complete.no_server');
      };

      if (localTargets.length) {
        if (opts.deferRender) {
          self.recomputeLocalSyncTargetsBatched(localTargets, {
            batchSize: 20,
            onComplete: function () {
              traceCellUpdateClient(trace, 'local_sync_recompute.done', {
                targets: localTargets.length,
                batched: true,
              });
              finishAfterLocalSync();
            },
          });
          return;
        }
        self.recomputeLocalSyncTargets(localTargets);
        traceCellUpdateClient(trace, 'local_sync_recompute.done', {
          targets: localTargets.length,
        });
      }
      finishAfterLocalSync();
    };

    if (opts.deferRender) {
      setTimeout(function () {
        finalizeEditRender();
      }, 0);
      return;
    }

    finalizeEditRender();
  };
}
