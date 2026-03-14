// Description: Formula parsing/evaluation orchestrator. Method implementations are split across logical modules.
import { aiMethods } from './formula-engine/ai-methods.js';
import { mentionMethods } from './formula-engine/mention-methods.js';
import { recalcMethods } from './formula-engine/recalc-methods.js';
import { parserMethods } from './formula-engine/parser-methods.js';
import { referenceMethods } from './formula-engine/reference-methods.js';
import { schedulerMethods } from './formula-engine/scheduler-methods.js';
import { buildFormulaContext } from './formulas/index.js';

export class FormulaEngine {
  constructor(storageService, aiService, getTabs, cellIds) {
    this.storageService = storageService;
    this.aiService = aiService;
    this.getTabs = getTabs;
    this.cellIds = cellIds;
    this.recalcState = {};
    this.recalcQueued = {};
  }

  evaluateCell(sheetId, cellId, trace, options) {
    var stack = trace || {};
    var token = sheetId + ':' + cellId;

    if (stack[token]) throw new Error('Circular reference');
    stack[token] = true;

    try {
      var raw = this.storageService.getCellValue(sheetId, cellId);
      var attachment = this.parseAttachmentSource(raw);
      if (attachment) {
        this.recordDependencyAttachment(options, sheetId, cellId);
        return this.resolveAttachmentContentOrThrow(
          attachment,
          sheetId,
          cellId,
        );
      }
      if (raw.charAt(0) === "'") {
        var askFormulaSpec = this.parseFormulaDisplayPlaceholder(
          this.stripOptionalFormulaQuestionMarker(raw.substring(1)),
        );
        var promptRaw = askFormulaSpec.content;
        if (!promptRaw.trim()) return '';
        var askEmptyMessage = this.getEmptyMentionDependencyMessage(
          sheetId,
          promptRaw,
          stack,
          options,
        );
        var promptDependencies = this.collectAIPromptDependencies(
          sheetId,
          promptRaw,
        );
        if (askEmptyMessage) {
          this.recordAIPromptDependencies(options, promptDependencies);
          this.setDisplayPlaceholder(
            options,
            askFormulaSpec.placeholder || askEmptyMessage,
          );
          return '';
        }
        this.recordAIPromptDependencies(options, promptDependencies);
        if (!this.arePromptDependenciesResolved(sheetId, promptRaw, options))
          return '...';
        var opts = options || {};
        var preparedPrompt = this.prepareAIPrompt(
          sheetId,
          promptRaw,
          stack,
          options,
        );
        var queueMeta = {
          formulaKind: 'ask',
          sourceCellId: cellId,
          promptTemplate: this.normalizeQueuedPromptTemplate(promptRaw),
          dependencies: promptDependencies,
          attachmentLinks: preparedPrompt.attachmentLinks,
        };
        if (!preparedPrompt.userPrompt) {
          if (askFormulaSpec.placeholder) {
            this.setDisplayPlaceholder(options, askFormulaSpec.placeholder);
          }
          return '';
        }
        return this.aiService.ask(preparedPrompt.userPrompt, {
          forceRefresh: !!opts.forceRefreshAI,
          systemPrompt: preparedPrompt.systemPrompt,
          userContent: preparedPrompt.userContent,
          queueMeta: queueMeta,
        });
      }
      if (raw.charAt(0) === '>') {
        var listSpec = this.parseListShortcutSpec(raw);
        var listPrompt = listSpec && listSpec.prompt ? listSpec.prompt : '';
        if (!listPrompt) return raw;
        var listEmptyMessage = this.getEmptyMentionDependencyMessage(
          sheetId,
          listPrompt,
          stack,
          options,
        );
        if (listEmptyMessage) {
          this.recordAIPromptDependencies(
            options,
            this.collectAIPromptDependencies(sheetId, listPrompt),
          );
          this.setDisplayPlaceholder(
            options,
            (listSpec && listSpec.placeholder) || listEmptyMessage,
          );
          return '';
        }
        var listOpts = options || {};
        var listResult = this.listAI(
          sheetId,
          cellId,
          listPrompt,
          null,
          !!listOpts.forceRefreshAI,
          stack,
          Object.assign({}, options || {}, {
            includeChannelAttachments:
              !!(listSpec && listSpec.includeAttachments),
          }),
          0,
        );
        if (listResult === '...' || listResult === '(manual: click Update)') {
          return listResult;
        }
        return raw;
      }
      if (raw.charAt(0) === '#') {
        var channelFeedSpec = this.parseChannelFeedPromptSpec(raw);
        if (channelFeedSpec) {
          var channelFeedEmptyMessage = this.getEmptyMentionDependencyMessage(
            sheetId,
            channelFeedSpec.prompt,
            stack,
            options,
          );
          if (channelFeedEmptyMessage) {
            this.recordAIPromptDependencies(
              options,
              this.collectAIPromptDependencies(sheetId, channelFeedSpec.prompt),
            );
            this.setDisplayPlaceholder(
              options,
              channelFeedSpec.placeholder || channelFeedEmptyMessage,
            );
            return '';
          }
          return raw;
        }
        var tableSpec = this.parseTablePromptSpec(raw);
        if (!tableSpec) return raw;
        if (!tableSpec.prompt) return '';
        var tableEmptyMessage = this.getEmptyMentionDependencyMessage(
          sheetId,
          tableSpec.prompt,
          stack,
          options,
        );
        if (tableEmptyMessage) {
          this.recordAIPromptDependencies(
            options,
            this.collectAIPromptDependencies(sheetId, tableSpec.prompt),
          );
          this.setDisplayPlaceholder(
            options,
            tableSpec.placeholder || tableEmptyMessage,
          );
          return '';
        }
        var tableOpts = options || {};
        var tableResult = this.tableAI(
          sheetId,
          cellId,
          tableSpec.prompt,
          tableSpec.cols,
          tableSpec.rows,
          !!tableOpts.forceRefreshAI,
          stack,
          Object.assign({}, options || {}, {
            includeChannelAttachments: false,
          }),
        );
        if (tableResult === '...' || tableResult === '(manual: click Update)') {
          return tableResult;
        }
        return raw;
      }
      if (raw.charAt(0) !== '=') return this.coerce(raw);
      var equalFormulaSpec = this.parseFormulaDisplayPlaceholder(
        this.stripOptionalFormulaQuestionMarker(raw.substring(1)),
      );
      var formulaSource = equalFormulaSpec.content;
      var formulaEmptyMessage = this.getEmptyMentionDependencyMessage(
        sheetId,
        formulaSource,
        stack,
        options,
      );
      if (formulaEmptyMessage) {
        this.recordExplicitMentionDependenciesFromText(
          sheetId,
          formulaSource,
          options,
        );
        this.setDisplayPlaceholder(
          options,
          equalFormulaSpec.placeholder || formulaEmptyMessage,
        );
        return '';
      }
      var tableSpill = this.tryDirectMentionTableSpill(
        sheetId,
        cellId,
        raw,
        stack,
        options,
      );
      if (tableSpill && tableSpill.applied) {
        return tableSpill.value;
      }
      var shortcutPrompt = this.parseListShortcutPrompt(raw);
      if (shortcutPrompt) {
        var listOpts = options || {};
        this.listAI(
          sheetId,
          cellId,
          shortcutPrompt,
          null,
          !!listOpts.forceRefreshAI,
          stack,
          options,
          0,
        );
        return raw;
      }

      var context = this.createContext(sheetId, cellId, stack, options);
      var expression = this.preprocessFormula(formulaSource, cellId);

      var fn = Function(
        'context',
        'with (context) { return (' + expression + '); }',
      );
      var result = fn(context);
      if (
        equalFormulaSpec.placeholder &&
        String(result == null ? '' : result) === ''
      ) {
        this.setDisplayPlaceholder(options, equalFormulaSpec.placeholder);
      }
      return result;
    } finally {
      delete stack[token];
    }
  }

  parseAttachmentSource(rawValue) {
    var raw = String(rawValue == null ? '' : rawValue);
    if (raw.indexOf('__ATTACHMENT__:') !== 0) return null;
    try {
      var parsed = JSON.parse(raw.substring('__ATTACHMENT__:'.length));
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  resolveAttachmentContentOrThrow(attachment, sheetId, cellId) {
    var source =
      attachment && typeof attachment === 'object' ? attachment : null;
    if (!source) return '';
    if (
      source.pending ||
      (!source.content &&
        !source.contentArtifactId &&
        !source.previewUrl &&
        !source.name)
    ) {
      throw new Error('#SELECT_FILE');
    }
    if (source.content == null || source.content === '') {
      var storedDisplay =
        this.storageService &&
        typeof this.storageService.getCellDisplayValue === 'function'
          ? this.storageService.getCellDisplayValue(sheetId, cellId)
          : '';
      if (storedDisplay) return String(storedDisplay);
    }
    return String(source.content == null ? '' : source.content);
  }

  getDependencyCollector(options) {
    var opts = options && typeof options === 'object' ? options : {};
    return opts.dependencyCollector &&
      typeof opts.dependencyCollector === 'object'
      ? opts.dependencyCollector
      : null;
  }

  recordDependencyCell(options, sheetId, cellId) {
    var collector = this.getDependencyCollector(options);
    if (collector && typeof collector.addCell === 'function') {
      collector.addCell(sheetId, String(cellId || '').toUpperCase());
    }
  }

  recordDependencyNamedRef(options, name) {
    var collector = this.getDependencyCollector(options);
    if (collector && typeof collector.addNamedRef === 'function') {
      collector.addNamedRef(String(name || '').trim());
    }
  }

  recordDependencyChannel(options, label) {
    var collector = this.getDependencyCollector(options);
    if (collector && typeof collector.addChannel === 'function') {
      collector.addChannel(String(label || '').trim());
    }
  }

  recordDependencyAttachment(options, sheetId, cellId) {
    var collector = this.getDependencyCollector(options);
    if (collector && typeof collector.addAttachment === 'function') {
      collector.addAttachment(sheetId, String(cellId || '').toUpperCase());
    }
  }

  recordAIPromptDependency(options, dependency) {
    if (!dependency || !dependency.kind) return;

    if (dependency.kind === 'cell') {
      this.recordDependencyCell(options, dependency.sheetId, dependency.cellId);
      return;
    }

    if (dependency.kind === 'region') {
      var cellIds = this.enumerateRegionCellIds(
        dependency.startCellId,
        dependency.endCellId,
      );
      for (var i = 0; i < cellIds.length; i += 1) {
        this.recordDependencyCell(options, dependency.sheetId, cellIds[i]);
      }
      return;
    }

    if (dependency.kind === 'channel') {
      this.recordDependencyChannel(options, dependency.label);
    }
  }

  recordAIPromptDependencies(options, dependencies) {
    var items = Array.isArray(dependencies) ? dependencies : [];
    for (var i = 0; i < items.length; i += 1) {
      this.recordAIPromptDependency(options, items[i]);
    }
  }

  getRuntimeMeta(options) {
    var opts = options && typeof options === 'object' ? options : {};
    return opts.runtimeMeta && typeof opts.runtimeMeta === 'object'
      ? opts.runtimeMeta
      : null;
  }

  setDisplayPlaceholder(options, value) {
    var runtimeMeta = this.getRuntimeMeta(options);
    if (!runtimeMeta) return;
    runtimeMeta.displayValue = String(value == null ? '' : value);
  }

  enumerateRegionCellIds(startCellId, endCellId) {
    var start = this.parseCellId(startCellId);
    var end = this.parseCellId(endCellId);
    if (!start || !end) return [];

    var rowStart = Math.min(start.row, end.row);
    var rowEnd = Math.max(start.row, end.row);
    var colStart = Math.min(start.col, end.col);
    var colEnd = Math.max(start.col, end.col);
    var result = [];

    for (var r = rowStart; r <= rowEnd; r++) {
      for (var c = colStart; c <= colEnd; c++) {
        result.push(this.columnIndexToLabel(c) + r);
      }
    }

    return result;
  }

  createContext(sheetId, cellId, stack, options) {
    var opts = options || {};
    var forceRefreshAI = !!opts.forceRefreshAI;
    var context = {
      askAI: (text) => {
        var dependencies = this.collectAIPromptDependencies(sheetId, text);
        this.recordAIPromptDependencies(options, dependencies);
        if (!this.arePromptDependenciesResolved(sheetId, text, options))
          return '...';
        var prepared = this.prepareAIPrompt(sheetId, text, stack, options);
        var queueMeta = {
          formulaKind: 'ask',
          sourceCellId: cellId,
          promptTemplate: this.normalizeQueuedPromptTemplate(text),
          dependencies: dependencies,
          attachmentLinks: prepared.attachmentLinks,
        };
        return this.aiService.ask(prepared.userPrompt, {
          forceRefresh: forceRefreshAI,
          systemPrompt: prepared.systemPrompt,
          userContent: prepared.userContent,
          queueMeta: queueMeta,
        });
      },
      listAI: (text, count) =>
        this.listAI(
          sheetId,
          cellId,
          text,
          count,
          forceRefreshAI,
          stack,
          options,
        ),
      recalc: (condition, targetCellRef) =>
        this.recalc(sheetId, cellId, condition, targetCellRef, stack),
      update: (targetCellRef, newFormulaValue) =>
        this.updateCellFormula(sheetId, cellId, targetCellRef, newFormulaValue),
      sheetRef: (sheetName, refCellId) => {
        var refSheetId = this.findSheetIdByName(sheetName);
        if (!refSheetId) throw new Error('Unknown sheet: ' + sheetName);
        this.recordDependencyCell(options, refSheetId, refCellId);
        return this.evaluateCell(
          refSheetId,
          String(refCellId).toUpperCase(),
          stack,
          options,
        );
      },
      regionRef: (startCellId, endCellId) => {
        var regionCellIds = this.enumerateRegionCellIds(startCellId, endCellId);
        for (var i = 0; i < regionCellIds.length; i++) {
          this.recordDependencyCell(options, sheetId, regionCellIds[i]);
        }
        return this.regionToCsv(sheetId, startCellId, endCellId, stack);
      },
      sheetRegionRef: (sheetName, startCellId, endCellId) => {
        var refSheetId = this.findSheetIdByName(sheetName);
        if (!refSheetId) throw new Error('Unknown sheet: ' + sheetName);
        var regionCellIds = this.enumerateRegionCellIds(startCellId, endCellId);
        for (var i = 0; i < regionCellIds.length; i++) {
          this.recordDependencyCell(options, refSheetId, regionCellIds[i]);
        }
        return this.regionToCsv(refSheetId, startCellId, endCellId, stack);
      },
      mentionRegionRef: (startCellId, endCellId) => {
        var regionCellIds = this.enumerateRegionCellIds(startCellId, endCellId);
        for (var i = 0; i < regionCellIds.length; i++) {
          this.recordDependencyCell(options, sheetId, regionCellIds[i]);
        }
        return this.regionToCsv(sheetId, startCellId, endCellId, stack);
      },
      mentionRawRegionRef: (startCellId, endCellId) => {
        var regionCellIds = this.enumerateRegionCellIds(startCellId, endCellId);
        for (var i = 0; i < regionCellIds.length; i++) {
          this.recordDependencyCell(options, sheetId, regionCellIds[i]);
        }
        return this.regionToRawCsv(sheetId, startCellId, endCellId);
      },
      mentionSheetRegionRef: (sheetName, startCellId, endCellId) => {
        var refSheetId = this.findSheetIdByName(sheetName);
        if (!refSheetId) throw new Error('Unknown sheet: ' + sheetName);
        var regionCellIds = this.enumerateRegionCellIds(startCellId, endCellId);
        for (var i = 0; i < regionCellIds.length; i++) {
          this.recordDependencyCell(options, refSheetId, regionCellIds[i]);
        }
        return this.regionToCsv(refSheetId, startCellId, endCellId, stack);
      },
      mentionRawSheetRegionRef: (sheetName, startCellId, endCellId) => {
        var refSheetId = this.findSheetIdByName(sheetName);
        if (!refSheetId) throw new Error('Unknown sheet: ' + sheetName);
        var regionCellIds = this.enumerateRegionCellIds(startCellId, endCellId);
        for (var i = 0; i < regionCellIds.length; i++) {
          this.recordDependencyCell(options, refSheetId, regionCellIds[i]);
        }
        return this.regionToRawCsv(refSheetId, startCellId, endCellId);
      },
      namedRef: (cellName) => {
        this.recordDependencyNamedRef(options, cellName);
        return this.getNamedOrSpecialValue(sheetId, cellName, stack, options);
      },
      mentionRef: (refCellId) => {
        this.recordDependencyCell(options, sheetId, refCellId);
        return this.getMentionValue(
          sheetId,
          String(refCellId).toUpperCase(),
          stack,
          options,
        );
      },
      mentionRawRef: (refCellId) => {
        this.recordDependencyCell(options, sheetId, refCellId);
        return this.getMentionRawValue(
          sheetId,
          String(refCellId).toUpperCase(),
        );
      },
      mentionSheetRef: (sheetName, refCellId) => {
        var refSheetId = this.findSheetIdByName(sheetName);
        if (!refSheetId) throw new Error('Unknown sheet: ' + sheetName);
        this.recordDependencyCell(options, refSheetId, refCellId);
        return this.getMentionValue(
          refSheetId,
          String(refCellId).toUpperCase(),
          stack,
          options,
        );
      },
      mentionRawSheetRef: (sheetName, refCellId) => {
        var refSheetId = this.findSheetIdByName(sheetName);
        if (!refSheetId) throw new Error('Unknown sheet: ' + sheetName);
        this.recordDependencyCell(options, refSheetId, refCellId);
        return this.getMentionRawValue(
          refSheetId,
          String(refCellId).toUpperCase(),
        );
      },
      mentionNamedRef: (cellName) => {
        this.recordDependencyNamedRef(options, cellName);
        return this.getNamedOrSpecialValue(sheetId, cellName, stack, options);
      },
      mentionRawNamedRef: (cellName) => {
        this.recordDependencyNamedRef(options, cellName);
        return this.getNamedOrSpecialValue(
          sheetId,
          cellName,
          stack,
          options,
          true,
        );
      },
    };

    Object.assign(
      context,
      buildFormulaContext(this, {
        sheetId,
        cellId,
        stack,
        options,
      }),
    );

    this.cellIds.forEach((id) => {
      Object.defineProperty(context, id, {
        enumerable: false,
        get: () => {
          this.recordDependencyCell(options, sheetId, id);
          return this.evaluateCell(sheetId, id, stack, options);
        },
      });
      Object.defineProperty(context, id.toLowerCase(), {
        enumerable: false,
        get: () => {
          this.recordDependencyCell(options, sheetId, id);
          return this.evaluateCell(sheetId, id, stack, options);
        },
      });
    });

    return context;
  }
}

Object.assign(
  FormulaEngine.prototype,
  aiMethods,
  mentionMethods,
  recalcMethods,
  parserMethods,
  referenceMethods,
  schedulerMethods,
);
