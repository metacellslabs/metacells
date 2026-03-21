import { getRegisteredFormulas } from '../formulas/index.js';
import { getRegisteredChannelConnectors } from '../../api/channels/connectors/index.js';

const UNKNOWN_FORMULA_ALLOWED_GLOBALS = {
  Math: true,
  Number: true,
  String: true,
  Boolean: true,
  Array: true,
  Object: true,
  JSON: true,
  Date: true,
  RegExp: true,
  parseInt: true,
  parseFloat: true,
  isNaN: true,
  isFinite: true,
  encodeURIComponent: true,
  decodeURIComponent: true,
  Infinity: true,
  NaN: true,
};

function normalizeText(value) {
  return String(value == null ? '' : value).trim();
}

function pickCellRecord(engine, sheetId, cellId) {
  var targetSheetId = String(sheetId || '');
  var targetCellId = String(cellId || '').toUpperCase();
  var raw = engine.storageService.getCellValue(targetSheetId, targetCellId) || '';
  var attachment =
    typeof engine.parseAttachmentSource === 'function'
      ? engine.parseAttachmentSource(raw)
      : null;
  return {
    sheetId: targetSheetId,
    sheetName:
      typeof engine.getSheetNameById === 'function'
        ? engine.getSheetNameById(targetSheetId)
        : targetSheetId,
    cellId: targetCellId,
    source: String(raw || ''),
    value: String(
      engine.storageService.getCellDisplayValue(targetSheetId, targetCellId) || '',
    ),
    state: String(
      engine.storageService.getCellState(targetSheetId, targetCellId) || '',
    ),
    error: String(
      engine.storageService.getCellError(targetSheetId, targetCellId) || '',
    ),
    type: attachment ? 'file' : raw.charAt(0) === '=' ? 'formula' : 'raw',
    attachment: attachment
      ? {
          name: String(attachment.name || targetCellId),
          type: String(attachment.type || ''),
          previewUrl: String(
            attachment.previewUrl || attachment.downloadUrl || '',
          ),
          content: String(attachment.content || '').slice(0, 4000),
        }
      : null,
    dependencies:
      engine.storageService.getCellDependencies(targetSheetId, targetCellId) || {
        cells: [],
        namedRefs: [],
        channelLabels: [],
        attachments: [],
      },
  };
}

export const fallbackMethods = {
  getSheetNameById(sheetId) {
    var target = String(sheetId || '');
    var tabs =
      this.storageService && typeof this.storageService.readTabs === 'function'
        ? this.storageService.readTabs()
        : [];
    for (var i = 0; i < tabs.length; i += 1) {
      var tab = tabs[i];
      if (tab && String(tab.id || '') === target) {
        return String(tab.name || target);
      }
    }
    return target;
  },

  collectUnknownFunctionNames(formulaBody, context) {
    var source = String(formulaBody == null ? '' : formulaBody);
    var currentContext =
      context && typeof context === 'object' ? context : Object.create(null);
    var results = [];
    var seen = {};
    var pattern = /(^|[^.\w$])([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
    var match;
    while ((match = pattern.exec(source))) {
      var name = String(match[2] || '').trim();
      if (!name || seen[name]) continue;
      seen[name] = true;
      if (
        Object.prototype.hasOwnProperty.call(currentContext, name) ||
        Object.prototype.hasOwnProperty.call(currentContext, name.toLowerCase()) ||
        UNKNOWN_FORMULA_ALLOWED_GLOBALS[name]
      ) {
        continue;
      }
      results.push(name);
    }
    return results;
  },

  shouldUseUnknownFormulaFallback(formulaBody, context, error) {
    var unknownNames = this.collectUnknownFunctionNames(formulaBody, context);
    if (unknownNames.length) return unknownNames;
    var message = String((error && error.message) || '').trim();
    var fallbackMatch = /^([A-Za-z_][A-Za-z0-9_]*) is not defined$/.exec(message);
    if (fallbackMatch) return [fallbackMatch[1]];
    return [];
  },

  buildUnknownFormulaCapabilities(options) {
    var channelPayloads =
      options &&
      typeof options === 'object' &&
      options.channelPayloads &&
      typeof options.channelPayloads === 'object'
        ? options.channelPayloads
        : {};
    var namedCells =
      this.storageService && typeof this.storageService.readNamedCells === 'function'
        ? this.storageService.readNamedCells()
        : {};
    return {
      formulas: getRegisteredFormulas().map(function (formula) {
        return {
          name: String(formula.name || ''),
          signature: String(formula.signature || ''),
          summary: String(formula.summary || ''),
          examples: Array.isArray(formula.examples) ? formula.examples.slice(0, 3) : [],
        };
      }),
      references: {
        directCells: 'Use A1 style references for same-sheet cells and SheetName!A1 for cross-sheet cells.',
        ranges: 'Use A1:B5 and SheetName!A1:B5 for regions.',
        namedCells: Object.keys(namedCells || {}).map(function (name) {
          return {
            name: String(name || ''),
            ref:
              namedCells && namedCells[name] && typeof namedCells[name] === 'object'
                ? {
                    sheetId: String(namedCells[name].sheetId || ''),
                    cellId: String(namedCells[name].cellId || '').toUpperCase(),
                  }
                : null,
          };
        }),
        helperFunctions: [
          'namedRef(name)',
          'sheetRef(sheetName, cellId)',
          'regionRef(startCellId, endCellId)',
          'sheetRegionRef(sheetName, startCellId, endCellId)',
          'mentionRef(cellId)',
          'mentionNamedRef(name)',
        ],
      },
      ai: {
        ask: "Prefix prompt with ' for single-cell AI output",
        list: 'Prefix prompt with > for spill lists',
        table: 'Prefix prompt with # for spill tables',
      },
      files: {
        supported: true,
        note: 'Cells may contain file attachments with extracted content available for AI reasoning.',
      },
      reports: {
        supported: true,
        note: 'Workbook tabs may be regular sheets or report tabs with rich content.',
      },
      mutations: {
        supported: true,
        functions: ['update(targetCellRef, newFormulaValue)', 'recalc(condition, targetCellRef)'],
      },
      channels: getRegisteredChannelConnectors().map(function (connector) {
        var labelExamples = Array.isArray(connector.mentioningFormulas)
          ? connector.mentioningFormulas.slice(0, 3)
          : [];
        return {
          id: String(connector.id || ''),
          name: String(connector.name || ''),
          description: String(connector.description || ''),
          capabilities:
            connector && connector.capabilities && typeof connector.capabilities === 'object'
              ? {
                  ...connector.capabilities,
                  actions: Array.isArray(connector.capabilities.actions)
                    ? connector.capabilities.actions.slice()
                    : [],
                  entities: Array.isArray(connector.capabilities.entities)
                    ? connector.capabilities.entities.slice()
                    : [],
                }
              : null,
          mentioningExamples: labelExamples,
        };
      }),
      activeChannelLabels: Object.keys(channelPayloads || {}),
    };
  },

  buildUnknownFormulaDependencySubgraph(sheetId, cellId, formulaBody) {
    var rootSheetId = String(sheetId || '');
    var rootCellId = String(cellId || '').toUpperCase();
    var direct = this.collectFormulaReferenceDependencies(rootSheetId, formulaBody);
    var queue = [];
    var seen = {};
    var nodes = [];

    for (var i = 0; i < direct.length; i += 1) {
      var dependency = direct[i];
      if (!dependency || dependency.kind !== 'cell') continue;
      queue.push({
        sheetId: String(dependency.sheetId || rootSheetId),
        cellId: String(dependency.cellId || '').toUpperCase(),
        depth: 0,
      });
    }

    while (queue.length) {
      var item = queue.shift();
      var key = String(item.sheetId) + ':' + String(item.cellId).toUpperCase();
      if (seen[key]) continue;
      seen[key] = true;
      var record = pickCellRecord(this, item.sheetId, item.cellId);
      record.depth = Number(item.depth) || 0;
      nodes.push(record);
      if (record.depth >= 3) continue;
      var depCells =
        record.dependencies && Array.isArray(record.dependencies.cells)
          ? record.dependencies.cells
          : [];
      for (var d = 0; d < depCells.length; d += 1) {
        var dep = depCells[d];
        if (!dep || typeof dep !== 'object') continue;
        queue.push({
          sheetId: String(dep.sheetId || ''),
          cellId: String(dep.cellId || '').toUpperCase(),
          depth: record.depth + 1,
        });
      }
    }

    return {
      root: { sheetId: rootSheetId, cellId: rootCellId },
      directDependencies: direct,
      cells: nodes,
    };
  },

  buildUnknownFormulaFallbackRequest(sheetId, cellId, rawFormula, options) {
    var formulaSource = String(rawFormula == null ? '' : rawFormula).trim();
    var formulaBody =
      formulaSource.charAt(0) === '=' ? formulaSource.substring(1) : formulaSource;
    var capabilityManifest = this.buildUnknownFormulaCapabilities(options);
    var dependencyGraph = this.buildUnknownFormulaDependencySubgraph(
      sheetId,
      cellId,
      formulaBody,
    );
    var systemPrompt = [
      'You are evaluating an unsupported MetaCells spreadsheet formula.',
      'A formula called by the user does not exist as a built-in function yet.',
      'Use the workbook capabilities and dependency graph provided by the system to infer the intended result.',
      'Return only the computed cell value as plain text.',
      'Do not explain your reasoning.',
      'Do not return markdown, JSON, code fences, or prose.',
      'If the intended result is numeric, return only the raw number.',
      'If the intended result is empty, return an empty string.',
      'MetaCells capability manifest:',
      JSON.stringify(capabilityManifest),
    ].join('\n');
    var userPrompt = [
      'Evaluate this unsupported MetaCells formula using the dependency graph and workbook capabilities.',
      'Target cell: ' + String(cellId || '').toUpperCase(),
      'Sheet: ' + this.getSheetNameById(sheetId),
      'Formula: ' + formulaSource,
      'Dependency graph:',
      JSON.stringify(dependencyGraph),
    ].join('\n');
    return {
      systemPrompt: systemPrompt,
      userPrompt: userPrompt,
      userContent: userPrompt,
      dependencies: dependencyGraph.directDependencies,
      capabilityManifest: capabilityManifest,
      dependencyGraph: dependencyGraph,
    };
  },

  evaluateUnknownFormulaFallback(
    sheetId,
    cellId,
    rawFormula,
    unknownFunctions,
    options,
  ) {
    var formulaSource = String(rawFormula == null ? '' : rawFormula).trim();
    var directDependencies = this.collectFormulaReferenceDependencies(
      sheetId,
      formulaSource.charAt(0) === '=' ? formulaSource.substring(1) : formulaSource,
    );
    this.recordAIPromptDependencies(options, directDependencies);
    for (var i = 0; i < directDependencies.length; i += 1) {
      var dependency = directDependencies[i];
      if (
        dependency &&
        dependency.kind === 'cell' &&
        !this.isCellDependencyResolved(dependency.sheetId, dependency.cellId)
      ) {
        return '...';
      }
    }
    var payload = this.buildUnknownFormulaFallbackRequest(
      sheetId,
      cellId,
      formulaSource,
      options,
    );
    var opts = options || {};
    return this.aiService.ask(payload.userPrompt, {
      forceRefresh: !!opts.forceRefreshAI,
      systemPrompt: payload.systemPrompt,
      userContent: payload.userContent,
      queueMeta: {
        formulaKind: 'formula-fallback',
        sourceCellId: String(cellId || '').toUpperCase(),
        promptTemplate: formulaSource,
        dependencies: payload.dependencies,
        forceRefresh: !!opts.forceRefreshAI,
        unknownFunctions: Array.isArray(unknownFunctions)
          ? unknownFunctions.slice()
          : [],
      },
    });
  },
};
