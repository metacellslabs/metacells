import { applyActiveSourceCellEdit } from './source-edit-facade.js';
import {
  clearGeneratedResultCell,
  writeGeneratedResultCell,
} from './generated-result-facade.js';
import { applyPendingRuntimeState } from './runtime-cell-state-facade.js';

export function installGeneratedResultMethods(SpreadsheetApp) {
  if (!SpreadsheetApp || !SpreadsheetApp.prototype) return;

  function runManualPromptCompute(app, options) {
    var opts = options && typeof options === 'object' ? options : {};
    if (!app || !app.aiService) {
      app.computeAll({
        bypassPendingEdit: true,
        manualTriggerAI: true,
        forceRefreshAI: !!opts.forceRefreshAI,
      });
      return;
    }
    app.aiService.withManualTrigger(() =>
      app.computeAll({
        bypassPendingEdit: true,
        manualTriggerAI: true,
        forceRefreshAI: !!opts.forceRefreshAI,
      }),
    );
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

  function primeAsyncSourcePendingUi(app, cellId, rawValue) {
    if (!app || !app.isExplicitAsyncFormulaRaw(rawValue)) return;
    var sourceCellId = String(cellId || '').toUpperCase();
    if (
      app.isGeneratedAIResultSourceRaw(rawValue) &&
      typeof app.clearGeneratedResultCellsForSource === 'function'
    ) {
      app.clearGeneratedResultCellsForSource(
        app.activeSheetId,
        sourceCellId,
        rawValue,
      );
    }
    var placeholder = getAsyncFormulaPlaceholder(app);
    applyPendingRuntimeState(app, {
      sheetId: app.activeSheetId,
      cellId: sourceCellId,
      placeholder: placeholder,
    });
    if (typeof app.renderCurrentSheetFromStorage === 'function') {
      app.renderCurrentSheetFromStorage();
    }
  }

  SpreadsheetApp.prototype.isExplicitAsyncFormulaRaw =
    function isExplicitAsyncFormulaRaw(rawValue) {
      var raw = String(rawValue == null ? '' : rawValue);
      if (!raw) return false;
      if (raw.charAt(0) === "'" || raw.charAt(0) === '>' || raw.charAt(0) === '#') {
        return true;
      }
      if (raw.charAt(0) !== '=') return false;
      var expression = raw.substring(1);
      return /(^|[^A-Za-z0-9_])(askAI|listAI|recalc|update)\s*\(/i.test(expression);
    };

  SpreadsheetApp.prototype.isGeneratedAIResultSourceRaw =
    function isGeneratedAIResultSourceRaw(rawValue) {
      var raw = String(rawValue == null ? '' : rawValue);
      if (!raw) return false;
      if (raw.charAt(0) === '>' || raw.charAt(0) === '#') return true;
      if (raw.charAt(0) !== '=') return false;
      return /(^|[^A-Za-z0-9_])(listAI|tableAI)\s*\(/i.test(raw.substring(1));
    };

  SpreadsheetApp.prototype.runQuotedPromptForCell = function runQuotedPromptForCell(
    cellId,
    rawValue,
    inputElement,
  ) {
    var raw = String(rawValue == null ? '' : rawValue);
    if (!raw || raw.charAt(0) !== "'") return false;

    var prompt = raw.substring(1).trim();

    if (!prompt) {
      applyActiveSourceCellEdit(this, {
        cellId: cellId,
        rawValue: '',
        withHistory: true,
        inputElement: inputElement,
      });
      this.computeAll();
      return true;
    }

    applyActiveSourceCellEdit(this, {
      cellId: cellId,
      rawValue: raw,
      withHistory: true,
      inputElement: inputElement,
    });
    primeAsyncSourcePendingUi(this, cellId, raw);
    runManualPromptCompute(this);
    return true;
  };

  SpreadsheetApp.prototype.parseTablePromptSpec = function parseTablePromptSpec(
    rawValue,
  ) {
    var raw = String(rawValue == null ? '' : rawValue);
    if (!raw) return null;
    if (raw.charAt(0) !== '#') return null;

    var payload = raw.substring(1).trim();
    if (!payload) return { prompt: '', cols: null, rows: null };

    var parts = payload.split(';');
    if (parts.length >= 3) {
      var maybeRows = parseInt(parts[parts.length - 1].trim(), 10);
      var maybeCols = parseInt(parts[parts.length - 2].trim(), 10);
      if (!isNaN(maybeCols) && maybeCols > 0 && !isNaN(maybeRows) && maybeRows > 0) {
        return {
          prompt: parts.slice(0, -2).join(';').trim(),
          cols: maybeCols,
          rows: maybeRows,
        };
      }
    }

    return { prompt: payload, cols: null, rows: null };
  };

  SpreadsheetApp.prototype.parseChannelFeedPromptSpec =
    function parseChannelFeedPromptSpec(rawValue) {
      var raw = String(rawValue == null ? '' : rawValue);
      if (!raw || raw.charAt(0) !== '#') return null;

      var payload = raw.substring(1).trim();
      if (!payload) return null;

      var match = /^(\+)?(\d+)?\s*(.+)$/.exec(payload);
      if (!match) return null;

      var includeAttachments = match[1] === '+';
      var dayToken = String(match[2] || '').trim();
      var prompt = String(match[3] || '').trim();
      if (!prompt) return null;
      if (!/(^|[^A-Za-z0-9_:/])\/([A-Za-z][A-Za-z0-9_-]*)\b/.test(prompt)) {
        return null;
      }

      var days = dayToken ? parseInt(dayToken, 10) : 1;
      if (isNaN(days) || days < 1) return null;

      return { prompt: prompt, days: days, includeAttachments: includeAttachments };
    };

  SpreadsheetApp.prototype.runTablePromptForCell = function runTablePromptForCell(
    cellId,
    rawValue,
    inputElement,
  ) {
    var channelSpec = this.parseChannelFeedPromptSpec(rawValue);
    if (channelSpec) {
      applyActiveSourceCellEdit(this, {
        cellId: cellId,
        rawValue: String(rawValue),
        withHistory: true,
        inputElement: inputElement,
      });
      runManualPromptCompute(this);
      return true;
    }
    var spec = this.parseTablePromptSpec(rawValue);
    if (!spec) return false;
    var prompt = spec.prompt;
    if (!prompt) {
      applyActiveSourceCellEdit(this, {
        cellId: cellId,
        rawValue: '',
        withHistory: true,
        inputElement: inputElement,
      });
      runManualPromptCompute(this);
      return true;
    }

    var sourceCellId = String(cellId || '').toUpperCase();
    var sourceRaw = String(rawValue == null ? '' : rawValue);

    applyActiveSourceCellEdit(this, {
      cellId: cellId,
      rawValue: sourceRaw,
      withHistory: true,
      inputElement: inputElement,
    });
    primeAsyncSourcePendingUi(this, cellId, sourceRaw);
    runManualPromptCompute(this);

    var prepared = this.formulaEngine.prepareAIPrompt(
      this.activeSheetId,
      prompt,
      {},
      {},
    );
    var dependencies = this.formulaEngine.collectAIPromptDependencies(
      this.activeSheetId,
      prompt,
    );
    this.aiService
      .withManualTrigger(() =>
        this.aiService.askTable(prepared.userPrompt, spec.cols, spec.rows, {
          onResult: (rows) => {
            if (String(this.getRawCellValue(sourceCellId) || '') !== sourceRaw) return;
            this.placeTableAtCell(sourceCellId, rows, true);
          },
          systemPrompt: prepared.systemPrompt,
          userContent: prepared.userContent,
          queueMeta: {
            formulaKind: 'table',
            sourceCellId: sourceCellId,
            promptTemplate: prompt,
            colsLimit: spec.cols,
            rowsLimit: spec.rows,
            dependencies: dependencies,
          },
        }),
      )
      .then(() => {
        if (String(this.getRawCellValue(sourceCellId) || '') === sourceRaw) {
          runManualPromptCompute(this);
        }
      })
      .catch((err) => {
        if (String(this.getRawCellValue(sourceCellId) || '') !== sourceRaw) return;
        var message = '#AI_ERROR: ' + (err && err.message ? err.message : String(err));
        applyActiveSourceCellEdit(this, {
          cellId: sourceCellId,
          rawValue: sourceRaw,
        });
        var parsed = this.parseCellId(sourceCellId);
        if (parsed) {
          var errCellId = this.formatCellId(parsed.col, parsed.row + 1);
          if (this.inputById[errCellId]) {
            applyActiveSourceCellEdit(this, {
              cellId: errCellId,
              rawValue: message,
            });
          }
        }
        runManualPromptCompute(this);
      });
    return true;
  };

  SpreadsheetApp.prototype.placeTableAtCell = function placeTableAtCell(
    cellId,
    rows,
    preserveSourceCell,
  ) {
    var start = this.parseCellId(cellId);
    if (!start) return;
    var sourceKey = String(cellId || '').toUpperCase();
    var matrix = Array.isArray(rows) ? rows : [];
    if (!matrix.length) {
      if (!preserveSourceCell) {
        applyActiveSourceCellEdit(this, {
          cellId: cellId,
          rawValue: '',
        });
      }
      return;
    }

    var baseRow = start.row + (preserveSourceCell ? 1 : 0);
    var baseCol = start.col;

    for (var r = 0; r < matrix.length; r++) {
      var row = Array.isArray(matrix[r]) ? matrix[r] : [matrix[r]];
      for (var c = 0; c < row.length; c++) {
        var targetCellId = this.formatCellId(baseCol + c, baseRow + r);
        if (!this.inputById[targetCellId]) continue;
        writeGeneratedResultCell(this, {
          sheetId: this.activeSheetId,
          cellId: targetCellId,
          rawValue: String(row[c] == null ? '' : row[c]),
          generatedBy: sourceKey,
        });
      }
    }
  };

  SpreadsheetApp.prototype.collectGeneratedResultCellIdsForSource =
    function collectGeneratedResultCellIdsForSource(sheetId, sourceCellId, rawValue) {
      var sourceKey = String(sourceCellId || '').toUpperCase();
      var result = [];
      var seen = Object.create(null);
      var add = function (cellId) {
        var normalized = String(cellId || '').toUpperCase();
        if (!normalized || seen[normalized]) return;
        seen[normalized] = true;
        result.push(normalized);
      };

      var generatedIds = this.storage.listGeneratedCellsBySource(sheetId, sourceKey) || [];
      for (var i = 0; i < generatedIds.length; i++) add(generatedIds[i]);

      var raw = String(rawValue == null ? '' : rawValue);
      if (raw.charAt(0) !== '#') return result;
      if (this.parseChannelFeedPromptSpec(raw)) return result;
      if (
        !this.formulaEngine ||
        typeof this.formulaEngine.readTableShortcutMatrix !== 'function'
      ) {
        return result;
      }

      var source = this.parseCellId(sourceKey);
      if (!source) return result;
      var matrix = this.formulaEngine.readTableShortcutMatrix(
        sheetId,
        sourceKey,
        {},
        {},
      );
      var rows = Array.isArray(matrix) ? matrix : [];
      for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        var rowValues = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
        for (var colIndex = 0; colIndex < rowValues.length; colIndex++) {
          add(this.formatCellId(source.col + colIndex, source.row + 1 + rowIndex));
        }
      }
      return result;
    };

  SpreadsheetApp.prototype.clearGeneratedResultCellsForSource =
    function clearGeneratedResultCellsForSource(sheetId, sourceCellId, rawValue) {
      var generatedIds = this.collectGeneratedResultCellIdsForSource(
        sheetId,
        sourceCellId,
        rawValue,
      );
      var computedCache = this.computedValuesBySheet[sheetId];
      for (var i = 0; i < generatedIds.length; i++) {
        var targetCellId = String(generatedIds[i] || '').toUpperCase();
        if (computedCache) delete computedCache[targetCellId];
        clearGeneratedResultCell(this, {
          sheetId: sheetId,
          cellId: targetCellId,
        });
      }
      return generatedIds.length;
    };
}
