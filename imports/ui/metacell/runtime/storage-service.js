// Description: Persistence layer for tabs, cell data, and per-sheet layout settings.
import { AI_MODE } from "./constants.js";

export class StorageService {
    constructor(storage) {
        this.storage = storage;
    }

    parseNamedCellSheetIds() {
        var ids = [];
        var namedCells = this.readNamedCells();

        for (var key in namedCells) {
            if (!Object.prototype.hasOwnProperty.call(namedCells, key)) continue;
            var ref = namedCells[key];
            if (!ref || typeof ref.sheetId !== "string" || !ref.sheetId) continue;
            if (ids.indexOf(ref.sheetId) === -1) ids.push(ref.sheetId);
        }

        return ids;
    }

    inferTabsFromStorage() {
        var sheetIds = [];
        var reportIds = [];
        var workbookSheetIds = this.storage.listSheetIds ? this.storage.listSheetIds() : [];

        for (var i = 0; i < workbookSheetIds.length; i++) {
            var sheetId = workbookSheetIds[i];
            var reportContent = this.storage.getReportContent ? this.storage.getReportContent(sheetId) : "";
            if (reportContent && reportIds.indexOf(sheetId) === -1) {
                reportIds.push(sheetId);
                continue;
            }
            if (sheetIds.indexOf(sheetId) === -1) {
                sheetIds.push(sheetId);
            }
        }

        var namedSheetIds = this.parseNamedCellSheetIds();
        for (var n = 0; n < namedSheetIds.length; n++) {
            if (sheetIds.indexOf(namedSheetIds[n]) === -1) sheetIds.push(namedSheetIds[n]);
        }

        var tabs = [];

        for (var s = 0; s < sheetIds.length; s++) {
            tabs.push({
                id: sheetIds[s],
                name: "Sheet " + (s + 1),
                type: "sheet"
            });
        }

        for (var r = 0; r < reportIds.length; r++) {
            tabs.push({
                id: reportIds[r],
                name: r === 0 ? "Report" : ("Report " + (r + 1)),
                type: "report"
            });
        }

        return tabs;
    }

    getCellValue(sheetId, cellId) {
        return this.storage.getCellSource(sheetId, cellId) || "";
    }

    getCellDisplayValue(sheetId, cellId) {
        if (typeof this.storage.getCellDisplayValue === "function") {
            return this.storage.getCellDisplayValue(sheetId, cellId) || "";
        }
        return "";
    }

    getCellState(sheetId, cellId) {
        if (typeof this.storage.getCellState === "function") {
            return this.storage.getCellState(sheetId, cellId) || "";
        }
        return "";
    }

    getCellError(sheetId, cellId) {
        if (typeof this.storage.getCellError === "function") {
            return this.storage.getCellError(sheetId, cellId) || "";
        }
        return "";
    }

    setCellValue(sheetId, cellId, value, meta) {
        this.storage.setCellSource(sheetId, cellId, value, meta);
    }

    setComputedCellValue(sheetId, cellId, value, state, errorMessage) {
        if (typeof this.storage.setComputedCellValue === "function") {
            this.storage.setComputedCellValue(sheetId, cellId, value, state, errorMessage);
        }
    }

    getGeneratedCellSource(sheetId, cellId) {
        return this.storage.getGeneratedCellSource(sheetId, cellId) || "";
    }

    listGeneratedCellsBySource(sheetId, sourceCellId) {
        return this.storage.listGeneratedCellsBySource(sheetId, sourceCellId);
    }

    clearGeneratedCellsBySource(sheetId, sourceCellId) {
        return this.storage.clearGeneratedCellsBySource(sheetId, sourceCellId);
    }

    getColumnWidth(sheetId, colIndex) {
        return this.storage.getColumnWidth(sheetId, colIndex);
    }

    setColumnWidth(sheetId, colIndex, width) {
        this.storage.setColumnWidth(sheetId, colIndex, width);
    }

    clearColumnWidth(sheetId, colIndex) {
        this.storage.clearColumnWidth(sheetId, colIndex);
    }

    getRowHeight(sheetId, rowIndex) {
        return this.storage.getRowHeight(sheetId, rowIndex);
    }

    setRowHeight(sheetId, rowIndex, height) {
        this.storage.setRowHeight(sheetId, rowIndex, height);
    }

    readTabs() {
        var parsed = this.storage.getTabs ? this.storage.getTabs() : [];
        var changed = false;

        if (!Array.isArray(parsed)) parsed = [];

        parsed = parsed.filter(function(tab) {
            return tab && typeof tab.id === "string" && typeof tab.name === "string";
        });

        if (!parsed.length) {
            parsed = this.inferTabsFromStorage();
            changed = parsed.length > 0;
        }

        var inferredTabs = this.inferTabsFromStorage();
        for (var i = 0; i < inferredTabs.length; i++) {
            var inferred = inferredTabs[i];
            var exists = false;
            for (var j = 0; j < parsed.length; j++) {
                if (parsed[j] && parsed[j].id === inferred.id) {
                    exists = true;
                    break;
                }
            }
            if (!exists) {
                parsed.push(inferred);
                changed = true;
            }
        }

        if (!parsed.length) {
            parsed = [{ id: "sheet-1", name: "Sheet 1", type: "sheet" }];
            changed = true;
        }

        for (var k = 0; k < parsed.length; k++) {
            var tab = parsed[k];
            if (tab && tab.type !== "report") tab.type = "sheet";
        }

        if (changed) this.saveTabs(parsed);
        return parsed;
    }

    saveTabs(tabs) {
        this.storage.setTabs(tabs);
    }

    getActiveSheetId(defaultSheetId) {
        return this.storage.getActiveTabId(defaultSheetId) || defaultSheetId;
    }

    setActiveSheetId(sheetId) {
        this.storage.setActiveTabId(sheetId);
    }

    makeSheetId() {
        return "sheet-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
    }

    clearSheetStorage(sheetId) {
        this.storage.clearSheet(sheetId);
        this.clearNamedCellsForSheet(sheetId);
    }

    rewriteFormulaReferencesOnRename(oldName, newName) {
        if (!oldName || !newName || oldName === newName) return;
        var sheetIds = this.storage.listSheetIds ? this.storage.listSheetIds() : [];

        for (var s = 0; s < sheetIds.length; s++) {
            var ids = this.storage.listCellIds ? this.storage.listCellIds(sheetIds[s]) : [];
            for (var i = 0; i < ids.length; i++) {
                var current = this.getCellValue(sheetIds[s], ids[i]) || "";
                var rewritten = this.rewriteFormulaSheetRefs(current, oldName, newName);
                if (rewritten !== current) {
                    this.setCellValue(sheetIds[s], ids[i], rewritten);
                }
            }
        }
    }

    rewriteFormulaSheetRefs(rawValue, oldName, newName) {
        if (!rawValue || rawValue.charAt(0) !== "=") return rawValue;

        return rawValue.replace(/(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+)/g, function(match, quoted, plain, cellId) {
            var referencedName = quoted || plain || "";
            if (referencedName !== oldName) return match;
            if (quoted) return "'" + newName + "'!" + cellId;
            return newName + "!" + cellId;
        });
    }

    getAIMode() {
        return this.storage.getAIMode ? this.storage.getAIMode() : AI_MODE.auto;
    }

    setAIMode(mode) {
        this.storage.setAIMode(mode);
    }

    getReportContent(reportTabId) {
        return this.storage.getReportContent(reportTabId) || "";
    }

    setReportContent(reportTabId, content) {
        this.storage.setReportContent(reportTabId, content);
    }

    readNamedCells() {
        return this.storage.getNamedCells ? this.storage.getNamedCells() : {};
    }

    saveNamedCells(namedCells) {
        this.storage.setNamedCells(namedCells);
    }

    getCacheValue(key) {
        return this.storage.getCacheValue ? this.storage.getCacheValue(key) : undefined;
    }

    setCacheValue(key, value) {
        if (this.storage.setCacheValue) this.storage.setCacheValue(key, value);
    }

    removeCacheValue(key) {
        if (this.storage.removeCacheValue) this.storage.removeCacheValue(key);
    }

    listAllCellIds() {
        var result = [];
        var sheetIds = this.storage.listSheetIds ? this.storage.listSheetIds() : [];
        for (var s = 0; s < sheetIds.length; s++) {
            var ids = this.storage.listCellIds ? this.storage.listCellIds(sheetIds[s]) : [];
            for (var i = 0; i < ids.length; i++) {
                result.push({
                    sheetId: sheetIds[s],
                    cellId: ids[i]
                });
            }
        }
        return result;
    }

    findNamedCellEntry(name) {
        var namedCells = this.readNamedCells();
        var target = String(name || "").toLowerCase();
        for (var key in namedCells) {
            if (!Object.prototype.hasOwnProperty.call(namedCells, key)) continue;
            if (key.toLowerCase() === target) {
                return { key: key, value: namedCells[key] };
            }
        }
    }

    getCellNameFor(sheetId, cellId) {
        var namedCells = this.readNamedCells();
        for (var key in namedCells) {
            if (!Object.prototype.hasOwnProperty.call(namedCells, key)) continue;
            var ref = namedCells[key];
            if (!ref || ref.sheetId !== sheetId) continue;
            if (ref.cellId === cellId) return key;
            if (ref.startCellId === cellId) return key;
        }
        return "";
    }

    resolveNamedCell(name) {
        var entry = this.findNamedCellEntry(name);
        return entry && entry.value;
    }

    setCellName(sheetId, cellId, name, rangeRef) {
        var cleaned = String(name || "").trim();
        var namedCells = this.readNamedCells();
        var target = null;

        if (rangeRef && rangeRef.startCellId && rangeRef.endCellId) {
            target = {
                sheetId: sheetId,
                startCellId: String(rangeRef.startCellId).toUpperCase(),
                endCellId: String(rangeRef.endCellId).toUpperCase()
            };
        } else {
            target = {
                sheetId: sheetId,
                cellId: String(cellId || "").toUpperCase()
            };
        }

        for (var key in namedCells) {
            if (!Object.prototype.hasOwnProperty.call(namedCells, key)) continue;
            var ref = namedCells[key];
            if (this.namedRefMatches(ref, target)) {
                delete namedCells[key];
            }
        }

        if (!cleaned) {
            this.saveNamedCells(namedCells);
            return { ok: true, name: "" };
        }

        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(cleaned)) {
            return { ok: false, error: "Name must start with a letter or _, and use only letters, numbers, _." };
        }

        var existing = this.findNamedCellEntry(cleaned);
        if (existing) {
            var existingRef = existing.value;
            if (!this.namedRefMatches(existingRef, target)) {
                return { ok: false, error: "Name already used by another cell." };
            }
            delete namedCells[existing.key];
        }

        namedCells[cleaned] = target;
        this.saveNamedCells(namedCells);
        return { ok: true, name: cleaned };
    }

    namedRefMatches(left, right) {
        if (!left || !right) return false;
        if (left.sheetId !== right.sheetId) return false;
        var leftCell = left.cellId ? String(left.cellId).toUpperCase() : "";
        var rightCell = right.cellId ? String(right.cellId).toUpperCase() : "";
        var leftStart = left.startCellId ? String(left.startCellId).toUpperCase() : "";
        var rightStart = right.startCellId ? String(right.startCellId).toUpperCase() : "";
        var leftEnd = left.endCellId ? String(left.endCellId).toUpperCase() : "";
        var rightEnd = right.endCellId ? String(right.endCellId).toUpperCase() : "";
        return leftCell === rightCell && leftStart === rightStart && leftEnd === rightEnd;
    }

    clearNamedCellsForSheet(sheetId) {
        var namedCells = this.readNamedCells();
        var changed = false;

        for (var key in namedCells) {
            if (!Object.prototype.hasOwnProperty.call(namedCells, key)) continue;
            var ref = namedCells[key];
            if (ref && ref.sheetId === sheetId) {
                delete namedCells[key];
                changed = true;
            }
        }

        if (changed) this.saveNamedCells(namedCells);
    }
}
