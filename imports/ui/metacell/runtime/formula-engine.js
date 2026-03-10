// Description: Formula parsing/evaluation orchestrator. Method implementations are split across logical modules.
import { aiMethods } from "./formula-engine/ai-methods.js";
import { mentionMethods } from "./formula-engine/mention-methods.js";
import { recalcMethods } from "./formula-engine/recalc-methods.js";
import { parserMethods } from "./formula-engine/parser-methods.js";
import { referenceMethods } from "./formula-engine/reference-methods.js";
import { schedulerMethods } from "./formula-engine/scheduler-methods.js";
import { buildFormulaContext } from "./formulas/index.js";

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
        var token = sheetId + ":" + cellId;

        if (stack[token]) throw new Error("Circular reference");
        stack[token] = true;

        try {
            var raw = this.storageService.getCellValue(sheetId, cellId);
            var attachment = this.parseAttachmentSource(raw);
            if (attachment) {
                return String(attachment.content == null ? "" : attachment.content);
            }
            if (raw.charAt(0) === "'") {
                var promptRaw = raw.substring(1);
                if (!promptRaw.trim()) return "";
                if (!this.arePromptDependenciesResolved(sheetId, promptRaw)) return "...";
                var opts = options || {};
                var preparedPrompt = this.prepareAIPrompt(sheetId, promptRaw, stack, options);
                var queueMeta = {
                    formulaKind: "ask",
                    sourceCellId: cellId,
                    promptTemplate: promptRaw,
                    dependencies: this.collectAIPromptDependencies(sheetId, promptRaw)
                };
                if (!preparedPrompt.userPrompt) return "";
                return this.aiService.ask(preparedPrompt.userPrompt, {
                    forceRefresh: !!opts.forceRefreshAI,
                    systemPrompt: preparedPrompt.systemPrompt,
                    queueMeta: queueMeta
                });
            }
            if (raw.charAt(0) === ">") {
                var listPrompt = this.parseListShortcutPrompt(raw);
                if (!listPrompt) return raw;
                var listOpts = options || {};
                this.listAI(sheetId, cellId, listPrompt, null, !!listOpts.forceRefreshAI, stack, options, 0);
                return raw;
            }
            if (raw.charAt(0) !== "=") return this.coerce(raw);
            var tableSpill = this.tryDirectMentionTableSpill(sheetId, cellId, raw, stack, options);
            if (tableSpill && tableSpill.applied) {
                return tableSpill.value;
            }
            var shortcutPrompt = this.parseListShortcutPrompt(raw);
            if (shortcutPrompt) {
                var listOpts = options || {};
                this.listAI(sheetId, cellId, shortcutPrompt, null, !!listOpts.forceRefreshAI, stack, options, 0);
                return raw;
            }

            var context = this.createContext(sheetId, cellId, stack, options);
            var expression = this.preprocessFormula(raw.substring(1), cellId);

            var fn = Function("context", "with (context) { return (" + expression + "); }");
            return fn(context);
        } finally {
            delete stack[token];
        }
    }

    parseAttachmentSource(rawValue) {
        var raw = String(rawValue == null ? "" : rawValue);
        if (raw.indexOf("__ATTACHMENT__:") !== 0) return null;
        try {
            var parsed = JSON.parse(raw.substring("__ATTACHMENT__:".length));
            if (!parsed || typeof parsed !== "object") return null;
            return parsed;
        } catch (e) {
            return null;
        }
    }

    createContext(sheetId, cellId, stack, options) {
        var opts = options || {};
        var forceRefreshAI = !!opts.forceRefreshAI;
        var context = {
            askAI: (text) => {
                if (!this.arePromptDependenciesResolved(sheetId, text)) return "...";
                var prepared = this.prepareAIPrompt(sheetId, text, stack, options);
                var queueMeta = {
                    formulaKind: "ask",
                    sourceCellId: cellId,
                    promptTemplate: text,
                    dependencies: this.collectAIPromptDependencies(sheetId, text)
                };
                return this.aiService.ask(prepared.userPrompt, {
                    forceRefresh: forceRefreshAI,
                    systemPrompt: prepared.systemPrompt,
                    queueMeta: queueMeta
                });
            },
            listAI: (text, count) => this.listAI(sheetId, cellId, text, count, forceRefreshAI, stack, options),
            recalc: (condition, targetCellRef) => this.recalc(sheetId, cellId, condition, targetCellRef, stack),
            update: (targetCellRef, newFormulaValue) => this.updateCellFormula(sheetId, cellId, targetCellRef, newFormulaValue),
            sheetRef: (sheetName, refCellId) => {
                var refSheetId = this.findSheetIdByName(sheetName);
                if (!refSheetId) throw new Error("Unknown sheet: " + sheetName);
                return this.evaluateCell(refSheetId, String(refCellId).toUpperCase(), stack, options);
            },
            regionRef: (startCellId, endCellId) => {
                return this.regionToCsv(sheetId, startCellId, endCellId, stack);
            },
            sheetRegionRef: (sheetName, startCellId, endCellId) => {
                var refSheetId = this.findSheetIdByName(sheetName);
                if (!refSheetId) throw new Error("Unknown sheet: " + sheetName);
                return this.regionToCsv(refSheetId, startCellId, endCellId, stack);
            },
            mentionRegionRef: (startCellId, endCellId) => {
                return this.regionToCsv(sheetId, startCellId, endCellId, stack);
            },
            mentionRawRegionRef: (startCellId, endCellId) => {
                return this.regionToRawCsv(sheetId, startCellId, endCellId);
            },
            mentionSheetRegionRef: (sheetName, startCellId, endCellId) => {
                var refSheetId = this.findSheetIdByName(sheetName);
                if (!refSheetId) throw new Error("Unknown sheet: " + sheetName);
                return this.regionToCsv(refSheetId, startCellId, endCellId, stack);
            },
            mentionRawSheetRegionRef: (sheetName, startCellId, endCellId) => {
                var refSheetId = this.findSheetIdByName(sheetName);
                if (!refSheetId) throw new Error("Unknown sheet: " + sheetName);
                return this.regionToRawCsv(refSheetId, startCellId, endCellId);
            },
            namedRef: (cellName) => {
                return this.getNamedOrSpecialValue(sheetId, cellName, stack, options);
            },
            mentionRef: (refCellId) => {
                return this.getMentionValue(sheetId, String(refCellId).toUpperCase(), stack, options);
            },
            mentionRawRef: (refCellId) => {
                return this.getMentionRawValue(sheetId, String(refCellId).toUpperCase());
            },
            mentionSheetRef: (sheetName, refCellId) => {
                var refSheetId = this.findSheetIdByName(sheetName);
                if (!refSheetId) throw new Error("Unknown sheet: " + sheetName);
                return this.getMentionValue(refSheetId, String(refCellId).toUpperCase(), stack, options);
            },
            mentionRawSheetRef: (sheetName, refCellId) => {
                var refSheetId = this.findSheetIdByName(sheetName);
                if (!refSheetId) throw new Error("Unknown sheet: " + sheetName);
                return this.getMentionRawValue(refSheetId, String(refCellId).toUpperCase());
            },
            mentionNamedRef: (cellName) => {
                return this.getNamedOrSpecialValue(sheetId, cellName, stack, options);
            },
            mentionRawNamedRef: (cellName) => {
                return this.getNamedOrSpecialValue(sheetId, cellName, stack, options, true);
            }
        };

        Object.assign(context, buildFormulaContext(this, {
            sheetId,
            cellId,
            stack,
            options
        }));

        this.cellIds.forEach((id) => {
            Object.defineProperty(context, id, {
                enumerable: false,
                get: () => this.evaluateCell(sheetId, id, stack, options)
            });
            Object.defineProperty(context, id.toLowerCase(), {
                enumerable: false,
                get: () => this.evaluateCell(sheetId, id, stack, options)
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
    schedulerMethods
);
