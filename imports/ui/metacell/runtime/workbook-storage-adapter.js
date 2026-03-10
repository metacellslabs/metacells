import { AI_MODE } from "./constants.js";

function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

function deepClone(value) {
    return JSON.parse(JSON.stringify(value || {}));
}

function normalizeTabs(tabs) {
    if (!Array.isArray(tabs)) return [];
    return tabs
        .filter(function(tab) {
            return tab && typeof tab.id === "string" && typeof tab.name === "string";
        })
        .map(function(tab) {
            return {
                id: String(tab.id),
                name: String(tab.name),
                type: tab.type === "report" ? "report" : "sheet"
            };
        });
}

function normalizeWorkbook(input) {
    var workbook = isPlainObject(input) ? input : {};
    return {
        version: 1,
        tabs: normalizeTabs(workbook.tabs),
        activeTabId: typeof workbook.activeTabId === "string" ? workbook.activeTabId : "",
        aiMode: workbook.aiMode === AI_MODE.manual ? AI_MODE.manual : AI_MODE.auto,
        namedCells: isPlainObject(workbook.namedCells) ? deepClone(workbook.namedCells) : {},
        sheets: isPlainObject(workbook.sheets) ? deepClone(workbook.sheets) : {},
        caches: isPlainObject(workbook.caches) ? deepClone(workbook.caches) : {},
        globals: isPlainObject(workbook.globals) ? deepClone(workbook.globals) : {}
    };
}

function normalizeCellRecord(source, previousCell) {
    var nextSource = String(source == null ? "" : source);
    var prev = isPlainObject(previousCell) ? previousCell : {};
    var sourceType = /^[='>#]/.test(nextSource) ? "formula" : "raw";
    var version = Number(prev.version) || 0;
    if (String(prev.source || "") !== nextSource) version += 1;
    if (version < 1) version = 1;

    return {
        source: nextSource,
        sourceType: sourceType,
        value: sourceType === "formula" ? String(prev.value || "") : nextSource,
        state: sourceType === "formula" ? (String(prev.source || "") !== nextSource ? "stale" : String(prev.state || "stale")) : "resolved",
        error: sourceType === "formula" ? String(prev.error || "") : "",
        generatedBy: String(prev.generatedBy || ""),
        version: version
    };
}

export class WorkbookStorageAdapter {
    constructor(workbook) {
        this.workbook = normalizeWorkbook(workbook);
    }

    snapshot() {
        return deepClone(this.workbook);
    }

    replaceAll(nextWorkbook) {
        this.workbook = normalizeWorkbook(nextWorkbook);
    }

    ensureSheet(sheetId) {
        var id = String(sheetId || "");
        if (!id) return null;
        if (!isPlainObject(this.workbook.sheets[id])) {
            this.workbook.sheets[id] = {
                cells: {},
                columnWidths: {},
                rowHeights: {},
                reportContent: ""
            };
        }
        var sheet = this.workbook.sheets[id];
        if (!isPlainObject(sheet.cells)) sheet.cells = {};
        if (!isPlainObject(sheet.columnWidths)) sheet.columnWidths = {};
        if (!isPlainObject(sheet.rowHeights)) sheet.rowHeights = {};
        if (typeof sheet.reportContent !== "string") sheet.reportContent = String(sheet.reportContent || "");
        return sheet;
    }

    listSheetIds() {
        return Object.keys(this.workbook.sheets || {});
    }

    listCellIds(sheetId) {
        var sheet = this.ensureSheet(sheetId);
        return sheet ? Object.keys(sheet.cells || {}) : [];
    }

    getCellRecord(sheetId, cellId) {
        var sheet = this.ensureSheet(sheetId);
        if (!sheet) return null;
        var id = String(cellId || "").toUpperCase();
        return isPlainObject(sheet.cells[id]) ? sheet.cells[id] : null;
    }

    getCellDisplayValue(sheetId, cellId) {
        var cell = this.getCellRecord(sheetId, cellId);
        if (!cell) return "";
        return String(cell.value == null ? "" : cell.value);
    }

    getCellState(sheetId, cellId) {
        var cell = this.getCellRecord(sheetId, cellId);
        if (!cell) return "";
        return String(cell.state || "");
    }

    getCellError(sheetId, cellId) {
        var cell = this.getCellRecord(sheetId, cellId);
        if (!cell) return "";
        return String(cell.error || "");
    }

    getCellSource(sheetId, cellId) {
        var cell = this.getCellRecord(sheetId, cellId);
        return cell ? String(cell.source || "") : "";
    }

    setCellSource(sheetId, cellId, value, meta) {
        var sheet = this.ensureSheet(sheetId);
        if (!sheet) return;
        var id = String(cellId || "").toUpperCase();
        var previous = this.getCellRecord(sheetId, id);
        var next = normalizeCellRecord(value, previous);
        var generatedBy = meta && meta.generatedBy ? String(meta.generatedBy).toUpperCase() : "";
        next.generatedBy = generatedBy || String((previous && previous.generatedBy) || "");
        if (!generatedBy && previous && previous.generatedBy && String(value || "") === "") {
            next.generatedBy = "";
        }

        if (!next.source && !next.generatedBy) {
            delete sheet.cells[id];
            return;
        }

        next.error = "";
        sheet.cells[id] = next;
    }

    setComputedCellValue(sheetId, cellId, value, state, errorMessage) {
        var sheet = this.ensureSheet(sheetId);
        if (!sheet) return;
        var id = String(cellId || "").toUpperCase();
        var cell = this.getCellRecord(sheetId, id);
        if (!cell) return;
        cell.value = String(value == null ? "" : value);
        cell.state = String(state || "resolved");
        cell.error = String(errorMessage || "");
        sheet.cells[id] = cell;
    }

    getGeneratedCellSource(sheetId, cellId) {
        var cell = this.getCellRecord(sheetId, cellId);
        return cell ? String(cell.generatedBy || "") : "";
    }

    listGeneratedCellsBySource(sheetId, sourceCellId) {
        var source = String(sourceCellId || "").toUpperCase();
        if (!source) return [];
        var ids = this.listCellIds(sheetId);
        var result = [];
        for (var i = 0; i < ids.length; i++) {
            var cell = this.getCellRecord(sheetId, ids[i]);
            if (!cell) continue;
            if (String(cell.generatedBy || "").toUpperCase() === source) result.push(ids[i]);
        }
        return result;
    }

    clearGeneratedCellsBySource(sheetId, sourceCellId) {
        var ids = this.listGeneratedCellsBySource(sheetId, sourceCellId);
        for (var i = 0; i < ids.length; i++) {
            this.setCellSource(sheetId, ids[i], "", { generatedBy: "" });
        }
        return ids.length;
    }

    getColumnWidth(sheetId, colIndex) {
        var sheet = this.ensureSheet(sheetId);
        var value = sheet ? parseFloat(sheet.columnWidths[String(colIndex)]) : NaN;
        return isNaN(value) ? null : value;
    }

    setColumnWidth(sheetId, colIndex, width) {
        var sheet = this.ensureSheet(sheetId);
        if (!sheet) return;
        sheet.columnWidths[String(colIndex)] = String(width);
    }

    clearColumnWidth(sheetId, colIndex) {
        var sheet = this.ensureSheet(sheetId);
        if (!sheet) return;
        delete sheet.columnWidths[String(colIndex)];
    }

    getRowHeight(sheetId, rowIndex) {
        var sheet = this.ensureSheet(sheetId);
        var value = sheet ? parseFloat(sheet.rowHeights[String(rowIndex)]) : NaN;
        return isNaN(value) ? null : value;
    }

    setRowHeight(sheetId, rowIndex, height) {
        var sheet = this.ensureSheet(sheetId);
        if (!sheet) return;
        sheet.rowHeights[String(rowIndex)] = String(height);
    }

    getTabs() {
        return normalizeTabs(this.workbook.tabs);
    }

    setTabs(tabs) {
        this.workbook.tabs = normalizeTabs(tabs);
    }

    getActiveTabId(defaultSheetId) {
        return String(this.workbook.activeTabId || defaultSheetId || "");
    }

    setActiveTabId(sheetId) {
        this.workbook.activeTabId = String(sheetId || "");
    }

    getAIMode() {
        return this.workbook.aiMode === AI_MODE.manual ? AI_MODE.manual : AI_MODE.auto;
    }

    setAIMode(mode) {
        this.workbook.aiMode = mode === AI_MODE.manual ? AI_MODE.manual : AI_MODE.auto;
    }

    getReportContent(tabId) {
        var id = String(tabId || "");
        if (!id) id = "report";
        var sheet = this.ensureSheet(id);
        return sheet ? String(sheet.reportContent || "") : "";
    }

    setReportContent(tabId, content) {
        var id = String(tabId || "");
        if (!id) id = "report";
        var sheet = this.ensureSheet(id);
        if (!sheet) return;
        sheet.reportContent = String(content == null ? "" : content);
    }

    getNamedCells() {
        return deepClone(this.workbook.namedCells || {});
    }

    setNamedCells(namedCells) {
        this.workbook.namedCells = isPlainObject(namedCells) ? deepClone(namedCells) : {};
    }

    getCacheValue(key) {
        return Object.prototype.hasOwnProperty.call(this.workbook.caches, key)
            ? this.workbook.caches[key]
            : undefined;
    }

    setCacheValue(key, value) {
        this.workbook.caches[String(key)] = String(value == null ? "" : value);
    }

    removeCacheValue(key) {
        delete this.workbook.caches[String(key)];
    }

    clearSheet(sheetId) {
        delete this.workbook.sheets[String(sheetId || "")];
    }
}

export function createEmptyWorkbook() {
    return normalizeWorkbook({});
}
