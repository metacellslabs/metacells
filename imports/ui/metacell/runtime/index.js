// Description: Application controller that wires UI, storage, grid rendering, tabs, formulas, and AI updates.
import { Meteor } from "meteor/meteor";
import { GRID_ROWS, GRID_COLS, DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT, AI_MODE } from "./constants.js";
import { StorageService } from "./storage-service.js";
import { AIService } from "./ai-service.js";
import { FormulaEngine } from "./formula-engine.js";
import { GridManager } from "./grid-manager.js";

var REPORT_TAB_ID = "report";

export class SpreadsheetApp {
    constructor(options) {
        var opts = options || {};
        if (!opts.storage) {
            throw new Error("SpreadsheetApp requires a storage adapter");
        }
        this.sheetDocumentId = String(opts.sheetDocumentId || "");
        this.initialSheetId = String(opts.initialSheetId || "");
        this.onActiveSheetChange = typeof opts.onActiveSheetChange === "function" ? opts.onActiveSheetChange : null;
        if (!this.sheetDocumentId) {
            throw new Error("SpreadsheetApp requires sheetDocumentId");
        }
        this.table = document.querySelector("table");
        this.tableWrap = document.querySelector(".table-wrap");
        this.reportWrap = document.querySelector(".report-wrap");
        this.reportEditor = document.querySelector("#report-editor");
        this.reportLive = document.querySelector("#report-live");
        this.formulaInput = document.querySelector("#formula-input");
        this.calcProgress = document.querySelector("#calc-progress");
        this.formulaBar = document.querySelector(".formula-bar");
        this.nameBar = document.querySelector(".name-bar");
        this.cellNameInput = document.querySelector("#cell-name-input");
        this.namedCellJump = document.querySelector("#named-cell-jump");
        this.attachFileButton = document.querySelector("#attach-file");
        this.attachFileInput = document.querySelector("#attach-file-input");
        this.aiModeSelect = document.querySelector("#ai-mode");
        this.undoButton = document.querySelector("#undo-action");
        this.redoButton = document.querySelector("#redo-action");
        this.updateAIButton = document.querySelector("#update-ai");
        this.tabsContainer = document.querySelector("#tabs");
        this.addTabButton = document.querySelector("#add-tab");
        this.deleteTabButton = document.querySelector("#delete-tab");
        this.ensureReportUI();

        this.storage = new StorageService(opts.storage);
        this.tabs = this.storage.readTabs();
        this.ensureReportTabExists();
        this.activeSheetId = this.initializeActiveSheetId();
        this.activeInput = null;
        this.fillDrag = null;
        this.selectionDrag = null;
        this.selectionDragJustFinished = false;
        this.sortStateBySheet = {};
        this.isResorting = false;
        this.dragTabId = null;
        this.editStartRawByCell = {};

        this.gridRows = GRID_ROWS;
        this.gridCols = GRID_COLS;
        this.grid = new GridManager(this.table, this.gridRows, this.gridCols, DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT);
        this.refreshGridReferences();
        this.selectionAnchorId = null;
        this.selectionRange = null;
        this.extendSelectionNav = false;
        this.lastSelectAllShortcutTs = 0;
        this.formulaRefCursorId = null;
        this.formulaMentionPreview = null;

        this.aiService = new AIService(this.storage, () => this.computeAll(), {
            sheetDocumentId: this.sheetDocumentId,
            getActiveSheetId: () => this.activeSheetId
        });
        this.formulaEngine = new FormulaEngine(this.storage, this.aiService, () => this.tabs, this.cellIds);
        this.uncomputedMonitorMs = 2000;
        this.uncomputedMonitorId = null;
        this.fullscreenOverlay = null;
        this.fullscreenOverlayContent = null;
        this.reportMode = "edit";
        this.calcProgressHideTimer = null;
        this.lastReportLiveHtml = "";
        this.addTabMenu = null;
        this.contextMenu = null;
        this.contextMenuState = null;
        this.headerSelectionDrag = null;
        this.mentionAutocomplete = null;
        this.mentionAutocompleteState = null;
        this.crossTabMentionContext = null;
        this.suppressBlurCommitOnce = false;
        this.computedValuesBySheet = {};
        this.computeRequestToken = 0;
        this.currentServerEditLockKey = "";
        this.editLockOwnerId = "lock-" + Date.now() + "-" + Math.random().toString(36).slice(2);
        this.editLockSequence = 0;
        this.pendingAttachmentContext = null;
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistoryEntries = 100;
        this.historyGroupKey = "";
        this.historyGroupAt = 0;
        this.historyGroupWindowMs = 1200;
        this.isApplyingHistory = false;

        this.setupGridResizing();
        this.setupColumnSort();
        this.setupButtons();
        this.setupAIModeControls();
        this.setupCellNameControls();
        this.setupAttachmentControls();
        this.setupReportControls();
        this.bindGridInputEvents();
        this.bindHeaderSelectionEvents();
        this.bindFormulaBarEvents();
        this.setupMentionAutocomplete();
        this.setupFullscreenOverlay();
        this.setupContextMenu();
        this.startUncomputedMonitor();

        this.renderTabs();
        this.applyViewMode();
        this.applyActiveSheetLayout();
        this.computeAll();
        this.ensureActiveCell();
    }

    hasPendingLocalEdit() {
        if (this.activeInput && this.isEditingCell(this.activeInput)) return true;
        if (!this.activeInput || !this.formulaInput) return false;
        if (document.activeElement !== this.formulaInput) return false;

        var currentFormulaValue = String(this.formulaInput.value == null ? "" : this.formulaInput.value);
        var storedRawValue = String(this.getRawCellValue(this.activeInput.id) || "");
        return currentFormulaValue !== storedRawValue;
    }

    syncAIDraftLock() {
        if (!this.aiService || typeof this.aiService.setEditDraftLock !== "function") return;
        var locked = this.hasPendingLocalEdit();
        this.aiService.setEditDraftLock(locked);
        this.syncServerEditLock(locked);
    }

    hasSingleSelectedCell() {
        if (!this.activeInput) return false;
        if (!this.selectionRange) return true;
        return this.selectionRange.startCol === this.selectionRange.endCol
            && this.selectionRange.startRow === this.selectionRange.endRow;
    }

    syncAttachButtonState() {
        if (!this.attachFileButton) return;
        this.attachFileButton.disabled = this.isReportActive() || !this.hasSingleSelectedCell();
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

    buildAttachmentSource(payload) {
        return "__ATTACHMENT__:" + JSON.stringify({
            name: String(payload && payload.name || ""),
            type: String(payload && payload.type || ""),
            content: String(payload && payload.content || ""),
            previewUrl: String(payload && payload.previewUrl || ""),
            pending: !!(payload && payload.pending)
        });
    }

    syncServerEditLock(locked) {
        var nextKey = "";
        if (locked && this.sheetDocumentId && this.activeSheetId && this.activeInput && this.activeInput.id) {
            nextKey = [
                String(this.sheetDocumentId || ""),
                String(this.activeSheetId || ""),
                String(this.activeInput.id || "").toUpperCase()
            ].join(":");
        }

        if (nextKey === this.currentServerEditLockKey) return;

        var releaseKey = this.currentServerEditLockKey;
        this.currentServerEditLockKey = nextKey;

        if (releaseKey) {
            var releaseParts = releaseKey.split(":");
            this.editLockSequence += 1;
            Meteor.callAsync(
                "ai.setSourceEditLock",
                releaseParts[0],
                releaseParts[1],
                releaseParts.slice(2).join(":"),
                false,
                this.editLockOwnerId,
                this.editLockSequence
            ).catch(() => {});
        }

        if (nextKey) {
            var lockParts = nextKey.split(":");
            this.editLockSequence += 1;
            Meteor.callAsync(
                "ai.setSourceEditLock",
                lockParts[0],
                lockParts[1],
                lockParts.slice(2).join(":"),
                true,
                this.editLockOwnerId,
                this.editLockSequence
            ).catch(() => {});
        }
    }

    initializeActiveSheetId() {
        var active = this.storage.getActiveSheetId(this.tabs[0].id);
        if (this.initialSheetId && this.findTabById(this.initialSheetId)) {
            active = this.initialSheetId;
            this.storage.setActiveSheetId(active);
        }
        if (!this.findTabById(active)) {
            active = this.tabs[0].id;
            this.storage.setActiveSheetId(active);
        }
        return active;
    }

    ensureReportTabExists() {
        for (var i = 0; i < this.tabs.length; i++) {
            if (this.tabs[i] && this.tabs[i].type === "report") return;
            if (this.tabs[i] && this.tabs[i].id === REPORT_TAB_ID) {
                this.tabs[i].type = "report";
                this.storage.saveTabs(this.tabs);
                return;
            }
        }
        this.tabs.push({ id: REPORT_TAB_ID, name: "Report", type: "report" });
        this.storage.saveTabs(this.tabs);
    }

    ensureReportUI() {
        if (this.reportWrap && this.reportEditor && this.reportLive) return;
        if (!this.tableWrap || !this.tableWrap.parentElement) return;

        var wrap = document.createElement("div");
        wrap.className = "report-wrap";
        wrap.style.display = "none";
        wrap.innerHTML = ""
            + "<div class='report-toolbar'>"
            + "<button type='button' class='report-mode active' data-report-mode='edit'>Edit</button>"
            + "<button type='button' class='report-mode' data-report-mode='view'>View</button>"
            + "<button type='button' class='report-cmd' data-cmd='bold'><b>B</b></button>"
            + "<button type='button' class='report-cmd' data-cmd='italic'><i>I</i></button>"
            + "<button type='button' class='report-cmd' data-cmd='underline'><u>U</u></button>"
            + "<button type='button' class='report-cmd' data-cmd='insertUnorderedList'>&bull; List</button>"
            + "<span class='report-hint'>Mentions: <code>Sheet 1:A1</code>, <code>@named_cell</code>, region <code>@Sheet 1!A1:B10</code>. Inputs: <code>Input:Sheet 1!A1</code> or <code>Input:@named_cell</code></span>"
            + "</div>"
            + "<div id='report-editor' class='report-editor' contenteditable='true'></div>"
            + "<div id='report-live' class='report-live'></div>";

        this.tableWrap.parentElement.insertBefore(wrap, this.tableWrap.nextSibling);
        this.reportWrap = wrap;
        this.reportEditor = wrap.querySelector("#report-editor");
        this.reportLive = wrap.querySelector("#report-live");
    }

    isReportTab(tabId) {
        var tab = this.findTabById(tabId);
        if (!tab) return false;
        return tab.type === "report" || tab.id === REPORT_TAB_ID;
    }

    isReportActive() {
        return this.isReportTab(this.activeSheetId);
    }

    findTabById(tabId) {
        for (var i = 0; i < this.tabs.length; i++) {
            if (this.tabs[i].id === tabId) return this.tabs[i];
        }
    }

    applyViewMode() {
        var report = this.isReportActive();
        document.body.classList.toggle("report-active", report);
        if (this.tableWrap) this.tableWrap.style.display = report ? "none" : "block";
        if (this.reportWrap) this.reportWrap.style.display = report ? "block" : "none";
        if (this.formulaBar) this.formulaBar.style.display = "flex";
        if (this.nameBar) this.nameBar.style.display = "flex";
        this.deleteTabButton.disabled = report;
    }

    getRawCellValue(cellId) {
        return this.storage.getCellValue(this.activeSheetId, cellId);
    }

    setRawCellValue(cellId, value, meta) {
        this.storage.setCellValue(this.activeSheetId, cellId, value, meta);
    }

    getWorkbookAdapter() {
        return this.storage && this.storage.storage ? this.storage.storage : null;
    }

    getWorkbookSnapshot() {
        var adapter = this.getWorkbookAdapter();
        if (!adapter || typeof adapter.snapshot !== "function") return null;
        return adapter.snapshot();
    }

    createHistoryEntry() {
        var workbook = this.getWorkbookSnapshot();
        if (!workbook) return null;
        return {
            workbook: workbook,
            activeSheetId: String(this.activeSheetId || ""),
            activeCellId: this.activeInput && this.activeInput.id ? String(this.activeInput.id).toUpperCase() : "A1"
        };
    }

    captureHistorySnapshot(groupKey) {
        if (this.isApplyingHistory) return;
        var entry = this.createHistoryEntry();
        if (!entry) return;
        var serialized = JSON.stringify(entry);
        var now = Date.now();

        if (groupKey && this.historyGroupKey === groupKey && now - this.historyGroupAt < this.historyGroupWindowMs) {
            return;
        }

        var last = this.undoStack.length ? this.undoStack[this.undoStack.length - 1] : "";
        if (last === serialized) {
            this.historyGroupKey = groupKey || "";
            this.historyGroupAt = now;
            return;
        }

        this.undoStack.push(serialized);
        if (this.undoStack.length > this.maxHistoryEntries) {
            this.undoStack.shift();
        }
        this.redoStack = [];
        this.historyGroupKey = groupKey || "";
        this.historyGroupAt = now;
    }

    resetHistoryGrouping() {
        this.historyGroupKey = "";
        this.historyGroupAt = 0;
    }

    applyWorkbookHistorySnapshot(serialized) {
        if (!serialized) return;
        var adapter = this.getWorkbookAdapter();
        if (!adapter || typeof adapter.replaceAll !== "function") return;

        var entry = JSON.parse(serialized);
        var snapshot = entry && entry.workbook ? entry.workbook : entry;
        var previousCellId = entry && entry.activeCellId
            ? String(entry.activeCellId).toUpperCase()
            : (this.activeInput && this.activeInput.id ? this.activeInput.id : "A1");
        this.isApplyingHistory = true;
        this.computeRequestToken += 1;
        this.clearSelectionRange();
        this.crossTabMentionContext = null;
        this.pendingAttachmentContext = null;
        this.hideMentionAutocomplete();
        this.hideAddTabMenu();
        this.hideContextMenu();
        this.syncServerEditLock(false);
        if (this.aiService && typeof this.aiService.setEditDraftLock === "function") {
            this.aiService.setEditDraftLock(false);
        }

        adapter.replaceAll(snapshot);
        if (typeof adapter.scheduleFlush === "function") {
            adapter.scheduleFlush();
        }

        this.tabs = this.storage.readTabs();
        var nextActiveSheetId = entry && entry.activeSheetId && this.findTabById(entry.activeSheetId)
            ? String(entry.activeSheetId)
            : (this.storage.getActiveSheetId(this.activeSheetId)
                || (this.tabs[0] && this.tabs[0].id)
                || "sheet-1");
        this.activeSheetId = nextActiveSheetId;
        if (this.onActiveSheetChange) this.onActiveSheetChange(nextActiveSheetId);

        this.ensureGridCapacityForStorage(snapshot);
        this.renderTabs();
        this.applyViewMode();
        if (this.reportEditor) {
            this.reportEditor.innerHTML = this.storage.getReportContent(this.activeSheetId) || "<p></p>";
        }
        if (this.isReportActive()) {
            this.setReportMode("view");
        }
        this.applyActiveSheetLayout();
        this.updateSortIcons();
        this.refreshNamedCellJumpOptions();

        var nextInput = this.inputById[previousCellId] || this.inputById["A1"] || this.inputs[0];
        if (!this.isReportActive() && nextInput) {
            this.setActiveInput(nextInput);
        } else {
            this.clearActiveInput();
        }

        this.computedValuesBySheet = {};
        this.resetHistoryGrouping();
        this.isApplyingHistory = false;
        this.computeAll();
        if (this.isReportActive()) {
            this.renderReportLiveValues(true);
        } else {
            this.ensureActiveCell();
        }
    }

    undo() {
        if (!this.undoStack.length) return;
        var current = this.createHistoryEntry();
        if (!current) return;
        this.redoStack.push(JSON.stringify(current));
        var previous = this.undoStack.pop();
        this.applyWorkbookHistorySnapshot(previous);
    }

    redo() {
        if (!this.redoStack.length) return;
        var current = this.createHistoryEntry();
        if (!current) return;
        this.undoStack.push(JSON.stringify(current));
        var next = this.redoStack.pop();
        this.applyWorkbookHistorySnapshot(next);
    }

    hasRawCellChanged(cellId, nextRawValue) {
        var next = String(nextRawValue == null ? "" : nextRawValue);
        var start = Object.prototype.hasOwnProperty.call(this.editStartRawByCell, cellId)
            ? this.editStartRawByCell[cellId]
            : this.getRawCellValue(cellId);
        return start !== next;
    }

    runQuotedPromptForCell(cellId, rawValue, inputElement) {
        var raw = String(rawValue == null ? "" : rawValue);
        if (!raw || raw.charAt(0) !== "'") return false;
        this.captureHistorySnapshot("cell:" + this.activeSheetId + ":" + String(cellId || "").toUpperCase());

        var prompt = raw.substring(1).trim();
        var updateFormulaBar = () => {
            if (this.activeInput && this.activeInput.id === cellId) {
                this.formulaInput.value = this.getRawCellValue(cellId);
            }
        };

        if (!prompt) {
            this.setRawCellValue(cellId, "");
            if (inputElement) inputElement.value = "";
            updateFormulaBar();
            this.computeAll();
            return true;
        }

        this.setRawCellValue(cellId, raw);
        if (inputElement) inputElement.value = raw;
        updateFormulaBar();
        this.aiService.withManualTrigger(() => this.computeAll());
        return true;
    }

    parseTablePromptSpec(rawValue) {
        var raw = String(rawValue == null ? "" : rawValue);
        if (!raw) return null;
        var marker = raw.charAt(0);
        if (marker !== "#") return null;

        var payload = raw.substring(1).trim();
        if (!payload) return { prompt: "", cols: null, rows: null };

        var parts = payload.split(";");
        if (parts.length >= 3) {
            var maybeRows = parseInt(parts[parts.length - 1].trim(), 10);
            var maybeCols = parseInt(parts[parts.length - 2].trim(), 10);
            if (!isNaN(maybeCols) && maybeCols > 0 && !isNaN(maybeRows) && maybeRows > 0) {
                return {
                    prompt: parts.slice(0, -2).join(";").trim(),
                    cols: maybeCols,
                    rows: maybeRows
                };
            }
        }

        return { prompt: payload, cols: null, rows: null };
    }

    runTablePromptForCell(cellId, rawValue, inputElement) {
        var spec = this.parseTablePromptSpec(rawValue);
        if (!spec) return false;
        this.captureHistorySnapshot("cell:" + this.activeSheetId + ":" + String(cellId || "").toUpperCase());
        var prompt = spec.prompt;
        if (!prompt) {
            this.setRawCellValue(cellId, "");
            if (inputElement) inputElement.value = "";
            if (this.activeInput && this.activeInput.id === cellId) this.formulaInput.value = "";
            this.computeAll();
            return true;
        }

        this.setRawCellValue(cellId, String(rawValue));
        if (inputElement) inputElement.value = String(rawValue);
        if (this.activeInput && this.activeInput.id === cellId) this.formulaInput.value = String(rawValue);
        this.computeAll();

        var prepared = this.formulaEngine.prepareAIPrompt(this.activeSheetId, prompt, {}, {});
        var dependencies = this.formulaEngine.collectAIPromptDependencies(this.activeSheetId, prompt);
        this.aiService.askTable(prepared.userPrompt, spec.cols, spec.rows, {
            systemPrompt: prepared.systemPrompt,
            queueMeta: {
                formulaKind: "table",
                sourceCellId: cellId,
                promptTemplate: prompt,
                colsLimit: spec.cols,
                rowsLimit: spec.rows,
                dependencies: dependencies
            }
        })
            .then((rows) => {
                this.placeTableAtCell(cellId, rows, true);
                this.computeAll();
            })
            .catch((err) => {
                var message = "#AI_ERROR: " + (err && err.message ? err.message : String(err));
                this.setRawCellValue(cellId, String(rawValue));
                var parsed = this.parseCellId(cellId);
                if (parsed) {
                    var errCellId = this.formatCellId(parsed.col, parsed.row + 1);
                    if (this.inputById[errCellId]) this.setRawCellValue(errCellId, message);
                }
                if (this.activeInput && this.activeInput.id === cellId) this.formulaInput.value = String(rawValue);
                this.computeAll();
            });
        return true;
    }

    placeTableAtCell(cellId, rows, preserveSourceCell) {
        var start = this.parseCellId(cellId);
        if (!start) return;
        var sourceKey = String(cellId || "").toUpperCase();
        var matrix = Array.isArray(rows) ? rows : [];
        if (!matrix.length) {
            if (!preserveSourceCell) this.setRawCellValue(cellId, "");
            return;
        }

        var baseRow = start.row + (preserveSourceCell ? 1 : 0);
        var baseCol = start.col;

        for (var r = 0; r < matrix.length; r++) {
            var row = Array.isArray(matrix[r]) ? matrix[r] : [matrix[r]];
            for (var c = 0; c < row.length; c++) {
                var targetCellId = this.formatCellId(baseCol + c, baseRow + r);
                if (!this.inputById[targetCellId]) continue;
                this.setRawCellValue(targetCellId, String(row[c] == null ? "" : row[c]), { generatedBy: sourceKey });
            }
        }
    }

    setupGridResizing() {
        this.grid.installResizeHandles(
            (colIndex, width) => this.storage.setColumnWidth(this.activeSheetId, colIndex, width),
            (rowIndex, height) => this.storage.setRowHeight(this.activeSheetId, rowIndex, height)
        );
    }

    setupColumnSort() {
        var headerRow = this.table.rows[0];
        for (var colIndex = 1; colIndex < headerRow.cells.length; colIndex++) {
            var cell = headerRow.cells[colIndex];
            var text = cell.textContent;
            cell.textContent = "";
            var label = document.createElement("span");
            label.textContent = text;
            var sortBtn = document.createElement("button");
            sortBtn.type = "button";
            sortBtn.className = "sort-button";
            sortBtn.textContent = "⇅";
            sortBtn.dataset.colIndex = String(colIndex);
            sortBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                var idx = parseInt(e.currentTarget.dataset.colIndex, 10);
                this.toggleSortByColumn(idx);
            });
            cell.appendChild(label);
            cell.appendChild(sortBtn);
        }
    }

    getSortState() {
        if (!this.sortStateBySheet[this.activeSheetId]) {
            this.sortStateBySheet[this.activeSheetId] = {};
        }
        return this.sortStateBySheet[this.activeSheetId];
    }

    cellIdFrom(colIndex, rowIndex) {
        return this.columnIndexToLabel(colIndex) + rowIndex;
    }

    normalizeSortValue(value) {
        if (value == null || value === "") return { empty: true, type: "string", value: "" };
        if (typeof value === "number" && !isNaN(value)) return { empty: false, type: "number", value: value };
        var n = parseFloat(value);
        if (!isNaN(n) && String(value).trim() !== "") return { empty: false, type: "number", value: n };
        return { empty: false, type: "string", value: String(value).toLowerCase() };
    }

    compareSortValues(a, b, direction) {
        if (a.empty && b.empty) return 0;
        if (a.empty) return 1;
        if (b.empty) return -1;

        var multiplier = direction === "desc" ? -1 : 1;
        if (a.type === "number" && b.type === "number") {
            if (a.value === b.value) return 0;
            return a.value < b.value ? -1 * multiplier : 1 * multiplier;
        }

        var left = String(a.value);
        var right = String(b.value);
        var cmp = left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
        if (cmp === 0) return 0;
        return cmp < 0 ? -1 * multiplier : 1 * multiplier;
    }

    runWithAISuppressed(fn) {
        if (this.aiService && typeof this.aiService.withRequestsSuppressed === "function") {
            return this.aiService.withRequestsSuppressed(fn);
        }
        return fn();
    }

    updateCalcProgress(current, total) {
        if (!this.calcProgress) return;
        if (!total || total < 1) {
            this.calcProgress.textContent = "";
            this.calcProgress.classList.remove("active");
            return;
        }
        if (this.calcProgressHideTimer) {
            clearTimeout(this.calcProgressHideTimer);
            this.calcProgressHideTimer = null;
        }
        this.calcProgress.textContent = Math.min(current, total) + "/" + total;
        this.calcProgress.classList.add("active");
    }

    finishCalcProgress(total) {
        if (!this.calcProgress) return;
        if (!total || total < 1) {
            this.updateCalcProgress(0, 0);
            return;
        }
        this.updateCalcProgress(total, total);
        this.calcProgressHideTimer = setTimeout(() => {
            this.updateCalcProgress(0, 0);
        }, 800);
    }

    toggleSortByColumn(colIndex) {
        var state = this.getSortState();
        var current = state[colIndex];
        var next = current === "asc" ? "desc" : "asc";
        state.colIndex = colIndex;
        state[colIndex] = next;
        this.captureHistorySnapshot("sort:" + this.activeSheetId);

        this.runWithAISuppressed(() => {
            this.sortRowsByColumn(colIndex, next);
        });
        this.updateSortIcons();
    }

    sortRowsByColumn(colIndex, direction, skipCompute) {
        var rows = [];
        var rowCount = this.table.rows.length;
        var colCount = this.table.rows[0].cells.length;

        for (var rowIndex = 1; rowIndex < rowCount; rowIndex++) {
            var keyCellId = this.cellIdFrom(colIndex, rowIndex);
            var keyValue;
            try {
                var cache = this.computedValuesBySheet[this.activeSheetId] || {};
                keyValue = Object.prototype.hasOwnProperty.call(cache, keyCellId)
                    ? cache[keyCellId]
                    : this.getRawCellValue(keyCellId);
            } catch (e) {
                keyValue = this.getRawCellValue(keyCellId);
            }

            var raw = {};
            for (var c = 1; c < colCount; c++) {
                var cellId = this.cellIdFrom(c, rowIndex);
                raw[c] = this.getRawCellValue(cellId);
            }

            rows.push({
                sourceRowIndex: rowIndex,
                sortValue: this.normalizeSortValue(keyValue),
                raw: raw
            });
        }

        rows.sort((a, b) => this.compareSortValues(a.sortValue, b.sortValue, direction));

        for (var targetRow = 1; targetRow < rowCount; targetRow++) {
            var source = rows[targetRow - 1];
            var dRow = targetRow - source.sourceRowIndex;
            for (var col = 1; col < colCount; col++) {
                var targetCellId = this.cellIdFrom(col, targetRow);
                var rawValue = source.raw[col] || "";
                var nextValue = rawValue.charAt(0) === "="
                    ? this.shiftFormulaReferences(rawValue, dRow, 0)
                    : rawValue;
                this.setRawCellValue(targetCellId, nextValue);
            }
        }

        if (!skipCompute) this.computeAll();
    }

    updateSortIcons() {
        var state = this.getSortState();
        var activeCol = state.colIndex;
        var headerRow = this.table.rows[0];

        for (var colIndex = 1; colIndex < headerRow.cells.length; colIndex++) {
            var btn = headerRow.cells[colIndex].querySelector(".sort-button");
            if (!btn) continue;
            var isActive = colIndex === activeCol && !!state[colIndex];
            btn.classList.toggle("sort-active", isActive);
            if (isActive && state[colIndex] === "asc") btn.textContent = "↑";
            else if (isActive && state[colIndex] === "desc") btn.textContent = "↓";
            else btn.textContent = "⇅";
        }
    }

    applyAutoResort() {
        if (this.isResorting) return;
        var state = this.getSortState();
        var colIndex = state.colIndex;
        var direction = colIndex ? state[colIndex] : null;
        if (!colIndex || !direction) return false;

        this.isResorting = true;
        try {
            this.runWithAISuppressed(() => {
                this.sortRowsByColumn(colIndex, direction, true);
            });
            return true;
        } finally {
            this.isResorting = false;
        }
    }

    applyActiveSheetLayout() {
        if (this.isReportActive()) return;
        this.grid.applySavedSizes(
            (colIndex) => this.storage.getColumnWidth(this.activeSheetId, colIndex),
            (rowIndex) => this.storage.getRowHeight(this.activeSheetId, rowIndex)
        );
    }

    refreshGridReferences() {
        this.inputs = this.grid.getInputs();
        this.cellIds = this.inputs.map(function(elm) { return elm.id; });
        this.inputById = {};
        this.inputs.forEach((input) => { this.inputById[input.id] = input; });
        if (this.formulaEngine) this.formulaEngine.cellIds = this.cellIds;
    }

    getStorageGridBounds(workbookSnapshot) {
        var maxRow = this.gridRows || GRID_ROWS;
        var maxCol = this.gridCols || GRID_COLS;
        var workbook = workbookSnapshot || {};
        var sheets = workbook && typeof workbook === "object" && workbook.sheets && typeof workbook.sheets === "object"
            ? workbook.sheets
            : {};
        for (var sheetId in sheets) {
            if (!Object.prototype.hasOwnProperty.call(sheets, sheetId)) continue;
            var cells = sheets[sheetId] && sheets[sheetId].cells && typeof sheets[sheetId].cells === "object"
                ? sheets[sheetId].cells
                : {};
            for (var cellId in cells) {
                if (!Object.prototype.hasOwnProperty.call(cells, cellId)) continue;
                var match = /^([A-Za-z]+)([0-9]+)$/.exec(String(cellId).toUpperCase());
                if (!match) continue;
                var col = this.formulaEngine.columnLabelToIndex(String(match[1]).toUpperCase());
                var row = parseInt(match[2], 10);
                if (!isNaN(col) && col > maxCol) maxCol = col;
                if (!isNaN(row) && row > maxRow) maxRow = row;
            }
        }
        return { maxRow: maxRow, maxCol: maxCol };
    }

    ensureGridCapacityForStorage(workbookSnapshot) {
        var bounds = this.getStorageGridBounds(workbookSnapshot);
        if (bounds.maxRow <= this.gridRows && bounds.maxCol <= this.gridCols) return;

        var nextRows = Math.max(this.gridRows, bounds.maxRow);
        var nextCols = Math.max(this.gridCols, bounds.maxCol);
        var activeId = this.activeInput ? this.activeInput.id : "A1";

        this.gridRows = nextRows;
        this.gridCols = nextCols;
        this.table.innerHTML = "";
        this.grid = new GridManager(this.table, this.gridRows, this.gridCols, DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT);
        this.refreshGridReferences();
        this.setupGridResizing();
        this.setupColumnSort();
        this.bindGridInputEvents();
        this.bindHeaderSelectionEvents();
        this.applyActiveSheetLayout();
        this.updateSortIcons();

        var nextActive = this.inputById[activeId] || this.inputById["A1"] || this.inputs[0];
        if (nextActive) this.setActiveInput(nextActive);
    }

    setupButtons() {
        this.addTabButton.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleAddTabMenu();
        });
        this.deleteTabButton.addEventListener("click", () => this.deleteActiveTab());
        if (this.undoButton) this.undoButton.addEventListener("click", () => this.undo());
        if (this.redoButton) this.redoButton.addEventListener("click", () => this.redo());

        document.addEventListener("click", (e) => {
            if (!this.addTabMenu || this.addTabMenu.style.display === "none") return;
            if (e.target === this.addTabButton) return;
            if (this.addTabButton && this.addTabButton.contains && this.addTabButton.contains(e.target)) return;
            if (this.addTabMenu.contains && this.addTabMenu.contains(e.target)) return;
            this.hideAddTabMenu();
        });
        document.addEventListener("keydown", (e) => {
            if ((e.metaKey || e.ctrlKey) && !e.altKey) {
                var key = String(e.key || "").toLowerCase();
                var activeEl = document.activeElement;
                var isReportEditing = !!(
                    activeEl &&
                    this.reportEditor &&
                    activeEl === this.reportEditor &&
                    this.reportMode === "edit"
                );
                var shouldUseWorkbookHistory = !this.hasPendingLocalEdit() && !isReportEditing;
                if (shouldUseWorkbookHistory && key === "z") {
                    e.preventDefault();
                    if (e.shiftKey) this.redo();
                    else this.undo();
                    return;
                }
                if (shouldUseWorkbookHistory && key === "y") {
                    e.preventDefault();
                    this.redo();
                    return;
                }
            }
            if (e.key !== "Escape") return;
            this.hideAddTabMenu();
        });
        window.addEventListener("resize", () => this.hideAddTabMenu());
    }

    ensureAddTabMenu() {
        if (this.addTabMenu) return this.addTabMenu;
        var menu = document.createElement("div");
        menu.className = "add-tab-menu";
        menu.style.display = "none";
        menu.innerHTML = ""
            + "<button type='button' class='add-tab-option' data-kind='sheet'>Sheet</button>"
            + "<button type='button' class='add-tab-option' data-kind='report'>Report</button>";
        document.body.appendChild(menu);
        menu.addEventListener("click", (e) => {
            var option = e.target && e.target.closest ? e.target.closest(".add-tab-option") : null;
            if (!option) return;
            var kind = option.dataset.kind;
            this.hideAddTabMenu();
            if (kind === "report") {
                this.addReportTab();
            } else {
                this.addTab();
            }
        });
        this.addTabMenu = menu;
        return menu;
    }

    toggleAddTabMenu() {
        var menu = this.ensureAddTabMenu();
        if (menu.style.display !== "none") {
            this.hideAddTabMenu();
            return;
        }
        var rect = this.addTabButton.getBoundingClientRect();
        menu.style.display = "flex";
        menu.style.visibility = "hidden";

        var gap = 6;
        var menuWidth = menu.offsetWidth || 120;
        var menuHeight = menu.offsetHeight || 72;
        var viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

        var left = rect.left;
        if (left + menuWidth > viewportWidth - 8) left = viewportWidth - menuWidth - 8;
        if (left < 8) left = 8;

        var top = rect.bottom + gap;
        if (top + menuHeight > viewportHeight - 8) {
            top = rect.top - menuHeight - gap;
        }
        if (top < 8) top = 8;

        menu.style.left = Math.round(left) + "px";
        menu.style.top = Math.round(top) + "px";
        menu.style.visibility = "visible";
        menu.style.display = "flex";
    }

    hideAddTabMenu() {
        if (!this.addTabMenu) return;
        this.addTabMenu.style.display = "none";
    }

    onTabButtonClick(tabId) {
        if (!this.findTabById(tabId)) return;
        if (this.shouldStartCrossTabMention(tabId)) {
            this.startCrossTabMention(tabId);
            return;
        }
        this.crossTabMentionContext = null;
        this.switchToSheet(tabId);
    }

    shouldStartCrossTabMention(tabId) {
        if (this.isReportTab(tabId)) return false;
        if (tabId === this.activeSheetId) return false;
        if (!this.activeInput) return false;
        var formulaRaw = String(this.formulaInput ? this.formulaInput.value : "");
        if (this.canInsertFormulaMention(formulaRaw)) return true;
        if (this.isEditingCell(this.activeInput) && this.canInsertFormulaMention(this.activeInput.value)) return true;
        return false;
    }

    startCrossTabMention(targetSheetId) {
        if (!this.activeInput) return this.switchToSheet(targetSheetId);
        var sourceCellId = this.activeInput.id;
        var sourceValue = String(this.formulaInput && document.activeElement === this.formulaInput
            ? this.formulaInput.value
            : (this.activeInput.value == null ? "" : this.activeInput.value));

        this.crossTabMentionContext = {
            sourceSheetId: this.activeSheetId,
            sourceCellId: sourceCellId,
            value: sourceValue
        };

        this.storage.setCellValue(this.crossTabMentionContext.sourceSheetId, this.crossTabMentionContext.sourceCellId, sourceValue);
        this.suppressBlurCommitOnce = true;
        this.switchToSheet(targetSheetId);
        this.restoreCrossTabMentionEditor();
    }

    restoreCrossTabMentionEditor() {
        if (!this.crossTabMentionContext) return;
        if (this.activeSheetId === this.crossTabMentionContext.sourceSheetId) return;
        if (this.isReportActive()) return;

        var targetInput = this.inputById[this.crossTabMentionContext.sourceCellId] || this.activeInput || this.inputById["A1"];
        if (!targetInput) return;
        this.setActiveInput(targetInput);
        this.startEditingCell(targetInput);
        targetInput.value = this.crossTabMentionContext.value;
        this.editStartRawByCell[targetInput.id] = this.crossTabMentionContext.value;
        this.formulaInput.value = this.crossTabMentionContext.value;
    }

    syncCrossTabMentionSourceValue(nextValue) {
        if (!this.crossTabMentionContext) return false;
        var value = String(nextValue == null ? "" : nextValue);
        this.crossTabMentionContext.value = value;
        return true;
    }

    isCrossTabMentionProxyActive() {
        return !!(this.crossTabMentionContext && this.activeSheetId !== this.crossTabMentionContext.sourceSheetId);
    }

    finishCrossTabMentionAndReturnToSource() {
        if (!this.crossTabMentionContext) return false;
        if (!this.isCrossTabMentionProxyActive()) return false;

        var ctx = this.crossTabMentionContext;
        var finalValue = String(ctx.value == null ? "" : ctx.value);
        this.storage.setCellValue(ctx.sourceSheetId, ctx.sourceCellId, finalValue);

        this.crossTabMentionContext = null;
        this.switchToSheet(ctx.sourceSheetId);
        var sourceInput = this.inputById[ctx.sourceCellId];
        if (!sourceInput) return true;

        this.setActiveInput(sourceInput);
        this.startEditingCell(sourceInput);
        sourceInput.value = finalValue;
        this.editStartRawByCell[sourceInput.id] = finalValue;
        this.formulaInput.value = finalValue;
        if (typeof sourceInput.setSelectionRange === "function") {
            var caret = finalValue.length;
            sourceInput.setSelectionRange(caret, caret);
        }
        return true;
    }

    ensureContextMenu() {
        if (this.contextMenu) return this.contextMenu;
        var menu = document.createElement("div");
        menu.className = "sheet-context-menu";
        menu.style.display = "none";
        menu.innerHTML = ""
            + "<button type='button' class='sheet-context-item' data-action='insert-row'>Insert row</button>"
            + "<button type='button' class='sheet-context-item' data-action='insert-col'>Insert column</button>"
            + "<button type='button' class='sheet-context-item' data-action='delete-row'>Delete row</button>"
            + "<button type='button' class='sheet-context-item' data-action='delete-col'>Delete column</button>"
            + "<div class='sheet-context-sep'></div>"
            + "<button type='button' class='sheet-context-item' data-action='copy'>Copy</button>"
            + "<button type='button' class='sheet-context-item' data-action='paste'>Paste</button>";
        document.body.appendChild(menu);
        menu.addEventListener("click", (e) => {
            var item = e.target && e.target.closest ? e.target.closest(".sheet-context-item") : null;
            if (!item) return;
            var action = item.dataset.action;
            this.hideContextMenu();
            this.runContextMenuAction(action);
        });
        this.contextMenu = menu;
        return menu;
    }

    setupContextMenu() {
        this.ensureContextMenu();
        this.table.addEventListener("contextmenu", (e) => {
            if (this.isReportActive()) return;
            var td = e.target && e.target.closest ? e.target.closest("td") : null;
            if (!td) return;
            e.preventDefault();
            this.prepareContextFromCell(td);
            this.openContextMenu(e.clientX, e.clientY);
        });

        document.addEventListener("click", () => this.hideContextMenu());
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") this.hideContextMenu();
        });
        window.addEventListener("resize", () => this.hideContextMenu());
    }

    prepareContextFromCell(td) {
        if (!td) return;
        var rowIndex = td.parentElement ? td.parentElement.rowIndex : -1;
        var colIndex = td.cellIndex;
        var maxRow = this.table.rows.length - 1;
        var maxCol = this.table.rows[0].cells.length - 1;
        if (rowIndex < 0 || colIndex < 0) return;

        if (rowIndex === 0 && colIndex > 0) {
            this.selectEntireColumn(colIndex, colIndex);
            this.contextMenuState = { type: "col", index: colIndex };
            return;
        }
        if (colIndex === 0 && rowIndex > 0) {
            this.selectEntireRow(rowIndex, rowIndex);
            this.contextMenuState = { type: "row", index: rowIndex };
            return;
        }
        if (rowIndex >= 1 && rowIndex <= maxRow && colIndex >= 1 && colIndex <= maxCol) {
            var cellId = this.cellIdFrom(colIndex, rowIndex);
            var input = this.inputById[cellId];
            if (input) {
                this.setActiveInput(input);
                this.setSelectionAnchor(cellId);
                this.clearSelectionRange();
                input.focus();
            }
            this.contextMenuState = { type: "cell", row: rowIndex, col: colIndex };
        }
    }

    openContextMenu(clientX, clientY) {
        var menu = this.ensureContextMenu();
        menu.style.display = "flex";
        menu.style.visibility = "hidden";

        var menuWidth = menu.offsetWidth || 180;
        var menuHeight = menu.offsetHeight || 220;
        var viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        var left = clientX;
        var top = clientY;

        if (left + menuWidth > viewportWidth - 8) left = viewportWidth - menuWidth - 8;
        if (top + menuHeight > viewportHeight - 8) top = viewportHeight - menuHeight - 8;
        if (left < 8) left = 8;
        if (top < 8) top = 8;

        menu.style.left = Math.round(left) + "px";
        menu.style.top = Math.round(top) + "px";
        menu.style.visibility = "visible";
        menu.style.display = "flex";
    }

    hideContextMenu() {
        if (!this.contextMenu) return;
        this.contextMenu.style.display = "none";
    }

    ensureMentionAutocomplete() {
        if (this.mentionAutocomplete) return this.mentionAutocomplete;
        var el = document.createElement("div");
        el.className = "mention-autocomplete";
        el.style.display = "none";
        el.innerHTML = "<div class='mention-autocomplete-list'></div>";
        document.body.appendChild(el);
        el.addEventListener("mousedown", (e) => {
            var item = e.target && e.target.closest ? e.target.closest(".mention-autocomplete-item") : null;
            if (!item) return;
            e.preventDefault();
            var idx = parseInt(item.dataset.index || "-1", 10);
            if (isNaN(idx) || idx < 0) return;
            this.applyMentionAutocompleteSelection(idx);
        });
        this.mentionAutocomplete = el;
        return el;
    }

    setupMentionAutocomplete() {
        this.ensureMentionAutocomplete();
        document.addEventListener("mousedown", (e) => {
            if (!this.mentionAutocompleteState) return;
            var target = e.target;
            if (!target) return;
            if (this.mentionAutocomplete && this.mentionAutocomplete.contains(target)) return;
            if (target === this.formulaInput) return;
            if (target.tagName === "INPUT") {
                this.hideMentionAutocompleteSoon();
                return;
            }
            this.hideMentionAutocomplete();
        });
        window.addEventListener("resize", () => this.hideMentionAutocomplete());
    }

    hideMentionAutocompleteSoon() {
        setTimeout(() => this.hideMentionAutocomplete(), 120);
    }

    hideMentionAutocomplete() {
        if (this.mentionAutocomplete) this.mentionAutocomplete.style.display = "none";
        this.mentionAutocompleteState = null;
    }

    updateMentionAutocomplete(input) {
        if (!input) return this.hideMentionAutocomplete();
        var ctx = this.getMentionAutocompleteContext(input);
        if (!ctx) return this.hideMentionAutocomplete();
        var items = this.getMentionAutocompleteItems(ctx.query, ctx.marker);
        if (!items.length) return this.hideMentionAutocomplete();

        var menu = this.ensureMentionAutocomplete();
        var list = menu.querySelector(".mention-autocomplete-list");
        if (!list) return this.hideMentionAutocomplete();

        var activeIndex = 0;
        if (this.mentionAutocompleteState && this.mentionAutocompleteState.input === input) {
            var prevToken = this.mentionAutocompleteState.items[this.mentionAutocompleteState.activeIndex] && this.mentionAutocompleteState.items[this.mentionAutocompleteState.activeIndex].token;
            if (prevToken) {
                for (var i = 0; i < items.length; i++) {
                    if (items[i].token === prevToken) {
                        activeIndex = i;
                        break;
                    }
                }
            }
        }

        this.mentionAutocompleteState = {
            input: input,
            marker: ctx.marker,
            start: ctx.start,
            end: ctx.end,
            items: items,
            activeIndex: activeIndex
        };
        this.renderMentionAutocompleteList();
        this.positionMentionAutocomplete(input);
    }

    getMentionAutocompleteContext(input) {
        if (!input || typeof input.selectionStart !== "number") return null;
        var start = input.selectionStart;
        var end = input.selectionEnd;
        if (start !== end) return null;
        var value = String(input.value == null ? "" : input.value);
        var left = value.slice(0, start);
        var match = /(^|[^A-Za-z0-9_])(@@?)([A-Za-z0-9_]*)$/.exec(left);
        if (!match) return null;
        var marker = match[2];
        var query = match[3] || "";
        var markerStart = start - (marker.length + query.length);
        if (markerStart < 0) return null;
        return {
            marker: marker,
            query: query,
            start: markerStart,
            end: start
        };
    }

    getMentionAutocompleteItems(query, marker) {
        var target = String(query == null ? "" : query).toLowerCase();
        var items = [];
        var seen = {};
        var addItem = (kind, label, token, search) => {
            var key = token.toLowerCase();
            if (seen[key]) return;
            var hay = (String(label) + " " + String(search || "") + " " + String(token)).toLowerCase();
            if (target && hay.indexOf(target) === -1) return;
            seen[key] = true;
            items.push({ kind: kind, label: label, token: token, search: search || "" });
        };

        var named = this.storage.readNamedCells();
        var namedKeys = Object.keys(named || {}).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
        for (var i = 0; i < namedKeys.length; i++) {
            var name = namedKeys[i];
            var ref = named[name] || {};
            var location = ref.cellId || ((ref.startCellId && ref.endCellId) ? (ref.startCellId + ":" + ref.endCellId) : "");
            addItem("named", "@" + name + (location ? "  " + location : ""), marker + name, name + " " + location);
        }

        var reportTabs = [];
        for (var t = 0; t < this.tabs.length; t++) {
            var tab = this.tabs[t];
            if (!tab) continue;
            if (this.isReportTab(tab.id)) reportTabs.push(tab);
        }
        if (reportTabs.length) addItem("report", "@report", marker + "report", "report default");
        for (var r = 0; r < reportTabs.length; r++) {
            var reportAlias = "report" + (r + 1);
            addItem("report", "@" + reportAlias + "  " + reportTabs[r].name, marker + reportAlias, reportTabs[r].name + " " + reportAlias);
        }

        for (var s = 0; s < this.tabs.length; s++) {
            var sheet = this.tabs[s];
            if (!sheet || this.isReportTab(sheet.id)) continue;
            var escaped = String(sheet.name || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
            addItem("sheet", "@" + sheet.name + "!A1", marker + "'" + escaped + "'!A1", sheet.name + " sheet");
        }

        items.sort((a, b) => {
            var aw = a.token.toLowerCase().indexOf(target) === marker.length ? 0 : 1;
            var bw = b.token.toLowerCase().indexOf(target) === marker.length ? 0 : 1;
            if (aw !== bw) return aw - bw;
            return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
        });
        return items.slice(0, 16);
    }

    renderMentionAutocompleteList() {
        if (!this.mentionAutocomplete || !this.mentionAutocompleteState) return;
        var list = this.mentionAutocomplete.querySelector(".mention-autocomplete-list");
        if (!list) return;
        list.innerHTML = "";
        for (var i = 0; i < this.mentionAutocompleteState.items.length; i++) {
            var item = this.mentionAutocompleteState.items[i];
            var row = document.createElement("button");
            row.type = "button";
            row.className = "mention-autocomplete-item" + (i === this.mentionAutocompleteState.activeIndex ? " active" : "");
            row.dataset.index = String(i);
            row.textContent = item.label;
            list.appendChild(row);
        }
        this.mentionAutocomplete.style.display = "block";
    }

    positionMentionAutocomplete(input) {
        if (!this.mentionAutocomplete) return;
        var rect = input.getBoundingClientRect();
        var left = rect.left;
        var top = rect.bottom + 4;
        var maxWidth = Math.max(240, rect.width);
        this.mentionAutocomplete.style.left = Math.round(left) + "px";
        this.mentionAutocomplete.style.top = Math.round(top) + "px";
        this.mentionAutocomplete.style.minWidth = Math.round(Math.min(maxWidth, 460)) + "px";
    }

    handleMentionAutocompleteKeydown(e, input) {
        if (!this.mentionAutocompleteState || this.mentionAutocompleteState.input !== input) return false;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            var next = this.mentionAutocompleteState.activeIndex + 1;
            if (next >= this.mentionAutocompleteState.items.length) next = 0;
            this.mentionAutocompleteState.activeIndex = next;
            this.renderMentionAutocompleteList();
            return true;
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            var prev = this.mentionAutocompleteState.activeIndex - 1;
            if (prev < 0) prev = this.mentionAutocompleteState.items.length - 1;
            this.mentionAutocompleteState.activeIndex = prev;
            this.renderMentionAutocompleteList();
            return true;
        }
        if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            this.applyMentionAutocompleteSelection(this.mentionAutocompleteState.activeIndex);
            return true;
        }
        if (e.key === "Escape") {
            e.preventDefault();
            this.hideMentionAutocomplete();
            return true;
        }
        return false;
    }

    applyMentionAutocompleteSelection(index) {
        if (!this.mentionAutocompleteState) return;
        var state = this.mentionAutocompleteState;
        var input = state.input;
        var item = state.items[index];
        if (!input || !item) return this.hideMentionAutocomplete();

        var value = String(input.value == null ? "" : input.value);
        var next = value.slice(0, state.start) + item.token + value.slice(state.end);
        input.value = next;
        var caret = state.start + item.token.length;
        if (typeof input.setSelectionRange === "function") input.setSelectionRange(caret, caret);
        input.focus();

        if (input === this.formulaInput) {
            if (this.activeInput) {
                this.activeInput.value = next;
                this.setRawCellValue(this.activeInput.id, next);
            }
        } else if (this.activeInput === input) {
            this.formulaInput.value = next;
        }

        this.hideMentionAutocomplete();
    }

    runContextMenuAction(action) {
        if (!action || this.isReportActive()) return;
        if (action === "copy") {
            this.copySelectedRangeToClipboard();
            return;
        }
        if (action === "paste") {
            this.pasteFromClipboard();
            return;
        }

        if (action === "insert-row") {
            this.insertRowsAtContext();
            return;
        }
        if (action === "delete-row") {
            this.deleteRowsAtContext();
            return;
        }
        if (action === "insert-col") {
            this.insertColumnsAtContext();
            return;
        }
        if (action === "delete-col") {
            this.deleteColumnsAtContext();
        }
    }

    setupAIModeControls() {
        this.aiModeSelect.value = this.storage.getAIMode();
        this.syncAIModeUI();

        this.aiModeSelect.addEventListener("change", () => {
            this.captureHistorySnapshot("ai-mode");
            this.aiService.setMode(this.aiModeSelect.value);
            this.syncAIModeUI();
            this.computeAll();
        });

        this.updateAIButton.addEventListener("click", () => {
            if (this.aiService.getMode() !== AI_MODE.manual) return;
            this.aiService.withManualTrigger(() => this.computeAll());
        });
    }

    setupAttachmentControls() {
        this.syncAttachButtonState();
        if (this.attachFileButton) {
            this.attachFileButton.addEventListener("click", () => {
                if (!this.hasSingleSelectedCell() || !this.activeInput || !this.attachFileInput) return;
                var cellId = String(this.activeInput.id || "").toUpperCase();
                var previousValue = this.getRawCellValue(cellId);
                this.pendingAttachmentContext = {
                    sheetId: this.activeSheetId,
                    cellId: cellId,
                    previousValue: String(previousValue == null ? "" : previousValue)
                };
                var pendingSource = this.buildAttachmentSource({ pending: true });
                this.setRawCellValue(cellId, pendingSource);
                this.activeInput.value = pendingSource;
                this.formulaInput.value = pendingSource;
                this.computeAll();
            });
        }
        if (this.table) {
            this.table.addEventListener("click", (e) => {
                var selectButton = e.target && e.target.closest ? e.target.closest(".attachment-select") : null;
                var removeButton = e.target && e.target.closest ? e.target.closest(".attachment-remove") : null;
                if (!selectButton && !removeButton) return;
                var td = e.target && e.target.closest ? e.target.closest("td") : null;
                var input = td ? td.querySelector("input") : null;
                if (!input) return;
                e.preventDefault();
                e.stopPropagation();
                this.setActiveInput(input);
                if (removeButton) {
                    this.captureHistorySnapshot("attachment:" + this.activeSheetId + ":" + String(input.id || "").toUpperCase());
                    var pendingSource = this.buildAttachmentSource({ pending: true });
                    this.setRawCellValue(input.id, pendingSource);
                    input.value = pendingSource;
                    if (this.activeInput === input) this.formulaInput.value = "";
                    this.computeAll();
                    return;
                }
                var previousRaw = this.getRawCellValue(input.id);
                this.pendingAttachmentContext = {
                    sheetId: this.activeSheetId,
                    cellId: String(input.id || "").toUpperCase(),
                    previousValue: String(previousRaw == null ? "" : previousRaw)
                };
                this.attachFileInput.value = "";
                this.attachFileInput.click();
            });
        }
        if (this.attachFileInput) {
            this.attachFileInput.addEventListener("change", async () => {
                var ctx = this.pendingAttachmentContext;
                this.pendingAttachmentContext = null;
                if (!ctx) return;

                var file = this.attachFileInput.files && this.attachFileInput.files[0];
                if (!file) {
                    this.storage.setCellValue(ctx.sheetId, ctx.cellId, ctx.previousValue);
                    if (this.activeInput && this.activeInput.id === ctx.cellId) {
                        this.activeInput.value = ctx.previousValue;
                        this.formulaInput.value = ctx.previousValue;
                    }
                    this.computeAll();
                    return;
                }

                try {
                    var base64 = await file.arrayBuffer().then((buffer) => this.arrayBufferToBase64(buffer));
                    var content = await this.readAttachedFileContent(file, base64);
                    var previewUrl = String(file.type || "").toLowerCase().indexOf("image/") === 0
                        ? ("data:" + String(file.type || "image/*") + ";base64," + base64)
                        : "";
                    var attachmentSource = this.buildAttachmentSource({
                        name: file.name || "Attached file",
                        type: file.type || "",
                        content: content,
                        previewUrl: previewUrl,
                        pending: false
                    });
                    this.captureHistorySnapshot("attachment:" + String(ctx.sheetId || "") + ":" + String(ctx.cellId || "").toUpperCase());
                    this.storage.setCellValue(ctx.sheetId, ctx.cellId, attachmentSource);
                    if (this.activeInput && this.activeInput.id === ctx.cellId) {
                        this.activeInput.value = attachmentSource;
                        this.formulaInput.value = attachmentSource;
                    }
                    if (this.isReportActive()) {
                        this.renderReportLiveValues(true);
                    }
                    this.aiService.notifyActiveCellChanged();
                    this.computeAll();
                } catch (error) {
                    this.storage.setCellValue(ctx.sheetId, ctx.cellId, ctx.previousValue);
                    if (this.activeInput && this.activeInput.id === ctx.cellId) {
                        this.activeInput.value = ctx.previousValue;
                        this.formulaInput.value = ctx.previousValue;
                    }
                    window.alert(error && error.message ? error.message : "Failed to read file");
                    this.computeAll();
                }
            });
        }
    }

    readAttachedFileContent(file, preparedBase64) {
        if (!file || typeof file.arrayBuffer !== "function") {
            return Promise.reject(new Error("Failed to read file"));
        }
        var base64Promise = typeof preparedBase64 === "string" && preparedBase64
            ? Promise.resolve(preparedBase64)
            : file.arrayBuffer().then((buffer) => this.arrayBufferToBase64(buffer));
        return base64Promise
            .then((base64) => Meteor.callAsync("files.extractContent", String(file.name || "Attached file"), String(file.type || ""), base64))
            .then((result) => String(result && result.content != null ? result.content : ""));
    }

    arrayBufferToBase64(buffer) {
        var bytes = new Uint8Array(buffer || new ArrayBuffer(0));
        var chunkSize = 0x8000;
        var binary = "";
        for (var i = 0; i < bytes.length; i += chunkSize) {
            var chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }
        return window.btoa(binary);
    }

    syncAIModeUI() {
        var isManual = this.aiService.getMode() === AI_MODE.manual;
        this.updateAIButton.style.display = isManual ? "inline-block" : "none";
    }

    commitFormulaBarValue() {
        if (!this.activeInput) return;
        if (this.crossTabMentionContext && this.activeSheetId !== this.crossTabMentionContext.sourceSheetId) return;

        var raw = String(this.formulaInput ? this.formulaInput.value : "");
        var existingRaw = String(this.getRawCellValue(this.activeInput.id) || "");
        var existingAttachment = this.parseAttachmentSource(existingRaw);
        if (existingAttachment && raw === String(existingAttachment.name || "")) {
            return;
        }
        if (this.aiService && typeof this.aiService.setEditDraftLock === "function") {
            this.aiService.setEditDraftLock(false);
        }
        this.syncServerEditLock(false);
        if (this.runTablePromptForCell(this.activeInput.id, raw, this.activeInput)) return;
        if (this.runQuotedPromptForCell(this.activeInput.id, raw, this.activeInput)) return;

        this.activeInput.value = raw;
        this.captureHistorySnapshot("cell:" + this.activeSheetId + ":" + String(this.activeInput.id || "").toUpperCase());
        this.setRawCellValue(this.activeInput.id, raw);
        this.aiService.notifyActiveCellChanged();
        this.computeAll();
    }

    bindFormulaBarEvents() {
        this.formulaInput.addEventListener("input", (e) => {
            if (!this.activeInput) return;
            var raw = e.target.value;
            this.syncCrossTabMentionSourceValue(raw);
            this.syncAIDraftLock();
            this.updateMentionAutocomplete(this.formulaInput);
        });

        this.formulaInput.addEventListener("keydown", (e) => {
            if (!this.activeInput) return;
            if (this.handleMentionAutocompleteKeydown(e, this.formulaInput)) return;
            if (e.key === "Enter" && this.finishCrossTabMentionAndReturnToSource()) {
                e.preventDefault();
                return;
            }
            if (e.key === "Enter") {
                e.preventDefault();
                this.commitFormulaBarValue();
                this.activeInput.focus();
            }
        });
        this.formulaInput.addEventListener("blur", () => {
            this.commitFormulaBarValue();
            this.syncAIDraftLock();
            this.hideMentionAutocompleteSoon();
        });
    }

    bindGridInputEvents() {
        this.inputs.forEach((input) => {
            input.addEventListener("focus", (e) => {
                this.setActiveInput(e.target);
                this.syncAIDraftLock();
            });

            input.addEventListener("blur", (e) => {
                var wasEditing = this.isEditingCell(e.target);
                this.grid.setEditing(e.target, false);
                this.syncAIDraftLock();
                if (!wasEditing) return;
                if (this.suppressBlurCommitOnce) {
                    this.suppressBlurCommitOnce = false;
                    delete this.editStartRawByCell[e.target.id];
                    return;
                }
                if (this.crossTabMentionContext && this.activeSheetId !== this.crossTabMentionContext.sourceSheetId) {
                    if (this.activeInput === e.target) {
                        this.formulaInput.value = this.crossTabMentionContext.value;
                    }
                    delete this.editStartRawByCell[e.target.id];
                    return;
                }
                this.formulaRefCursorId = null;
                this.formulaMentionPreview = null;
                var raw = String(e.target.value == null ? "" : e.target.value);
                var existingRaw = String(this.getRawCellValue(e.target.id) || "");
                var existingAttachment = this.parseAttachmentSource(existingRaw);
                if (existingAttachment && raw === String(existingAttachment.name || "")) {
                    delete this.editStartRawByCell[e.target.id];
                    if (this.activeInput === e.target) {
                        this.formulaInput.value = String(existingAttachment.name || "");
                    }
                    return;
                }
                var hasChanged = this.hasRawCellChanged(e.target.id, raw);
                if (!hasChanged) {
                    if (this.activeInput === e.target) {
                        this.formulaInput.value = raw;
                    }
                    delete this.editStartRawByCell[e.target.id];
                    return;
                }
                if (this.runTablePromptForCell(e.target.id, raw, e.target)) {
                    delete this.editStartRawByCell[e.target.id];
                    return;
                }
                if (this.runQuotedPromptForCell(e.target.id, raw, e.target)) {
                    delete this.editStartRawByCell[e.target.id];
                    return;
                }
                this.captureHistorySnapshot("cell:" + this.activeSheetId + ":" + String(e.target.id || "").toUpperCase());
                this.setRawCellValue(e.target.id, raw);
                this.aiService.notifyActiveCellChanged();
                if (this.activeInput === e.target) {
                    this.formulaInput.value = raw;
                }
                delete this.editStartRawByCell[e.target.id];
                this.computeAll();
            });

            input.addEventListener("keydown", (e) => {
                if (this.handleMentionAutocompleteKeydown(e, input)) return;
                if (this.isEditingCell(input) && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") && this.canInsertFormulaMention(input.value)) {
                    e.preventDefault();
                    var baseCellId = this.getFormulaMentionBaseCellId(input.id, e.key);
                    var targetCellId = (e.metaKey || e.ctrlKey)
                        ? this.findJumpTargetCellId(baseCellId, e.key)
                        : this.findAdjacentCellId(baseCellId, e.key);
                    if (!targetCellId) return;

                    if (e.shiftKey) {
                        if (!this.selectionRange) {
                            this.setSelectionAnchor(baseCellId);
                            this.setSelectionRange(baseCellId, targetCellId);
                        } else {
                            this.extendSelectionRangeTowardCell(targetCellId, e.key);
                        }
                    } else {
                        this.setSelectionAnchor(targetCellId);
                        this.setSelectionRange(targetCellId, targetCellId);
                    }

                    this.formulaRefCursorId = targetCellId;
                    var mentionToken = this.buildMentionTokenForSelection(targetCellId, !!e.shiftKey);
                    this.applyFormulaMentionPreview(input, mentionToken);
                    if (this.activeInput === input) this.formulaInput.value = input.value;
                    return;
                }
                if (!this.isEditingCell(input) && this.isDirectTypeKey(e)) {
                    e.preventDefault();
                    this.clearSelectionRange();
                    this.startEditingCell(input);
                    input.value = e.key;
                    if (this.activeInput === input) this.formulaInput.value = input.value;
                    return;
                }
                if (!e.metaKey && !e.ctrlKey && e.key === "Enter") {
                    if (this.finishCrossTabMentionAndReturnToSource()) {
                        e.preventDefault();
                        return;
                    }
                    if (!this.isEditingCell(input)) {
                        e.preventDefault();
                        this.startEditingCell(input);
                        return;
                    }
                    var hasChanged = this.hasRawCellChanged(input.id, input.value);
                    if (hasChanged && this.runTablePromptForCell(input.id, input.value, input)) {
                        e.preventDefault();
                        this.clearSelectionRange();
                        this.grid.focusCellByArrow(input, e.shiftKey ? "ArrowRight" : "ArrowDown");
                        return;
                    }
                    if (hasChanged && this.runQuotedPromptForCell(input.id, input.value, input)) {
                        e.preventDefault();
                        this.clearSelectionRange();
                        this.grid.focusCellByArrow(input, e.shiftKey ? "ArrowRight" : "ArrowDown");
                        return;
                    }
                    e.preventDefault();
                    this.clearSelectionRange();
                    this.grid.focusCellByArrow(input, e.shiftKey ? "ArrowRight" : "ArrowDown");
                    return;
                }
                if (!e.metaKey && !e.ctrlKey && e.key === "Escape" && this.isEditingCell(input)) {
                    e.preventDefault();
                    var restoreValue = Object.prototype.hasOwnProperty.call(this.editStartRawByCell, input.id)
                        ? this.editStartRawByCell[input.id]
                        : this.getRawCellValue(input.id);
                    input.value = restoreValue;
                    this.grid.setEditing(input, false);
                    if (this.activeInput === input) {
                        this.formulaInput.value = restoreValue;
                    }
                    delete this.editStartRawByCell[input.id];
                    this.formulaRefCursorId = null;
                    this.formulaMentionPreview = null;
                    this.syncAIDraftLock();
                    return;
                }
                if (!e.metaKey && !e.ctrlKey && (e.key === "Delete" || e.key === "Backspace")) {
                    var target = e.target;
                    var isEditing = !!(target && target.classList && target.classList.contains("editing"));
                    var hasTextSelection = target && typeof target.selectionStart === "number" && typeof target.selectionEnd === "number" && target.selectionStart !== target.selectionEnd;
                    var hasMultiCellSelection = !!(this.selectionRange && (
                        this.selectionRange.startCol !== this.selectionRange.endCol ||
                        this.selectionRange.startRow !== this.selectionRange.endRow
                    ));
                    if (!isEditing && !hasTextSelection) {
                        e.preventDefault();
                        this.clearSelectedCells();
                        return;
                    }
                    if (isEditing && hasMultiCellSelection) {
                        e.preventDefault();
                        this.clearSelectedCells();
                        return;
                    }
                }
                if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A")) {
                    e.preventDefault();
                    var now = Date.now();
                    var isDoublePress = now - this.lastSelectAllShortcutTs < 500;
                    this.lastSelectAllShortcutTs = now;
                    if (isDoublePress) {
                        this.selectWholeSheetRegion();
                    } else {
                        this.selectNearestValueRegionFromActive(input);
                    }
                    return;
                }
                if ((e.metaKey || e.ctrlKey) && (e.key === "c" || e.key === "C")) {
                    e.preventDefault();
                    this.copySelectedRangeToClipboard();
                    return;
                }
                if (!this.isEditingCell(input) && (e.metaKey || e.ctrlKey) && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight")) {
                    e.preventDefault();
                    if (e.shiftKey) {
                        var hadSelection = !!this.selectionRange;
                        var jumpSource = this.getSelectionEdgeInputForDirection(input, e.key);
                        this.extendSelectionNav = true;
                        var targetInput = this.moveToNextFilledCell(jumpSource || input, e.key);
                        this.extendSelectionNav = false;
                        if (targetInput) {
                            if (hadSelection && this.selectionRange) {
                                this.extendSelectionRangeTowardCell(targetInput.id, e.key);
                            } else {
                                var anchor = this.selectionAnchorId || input.id;
                                this.setSelectionRange(anchor, targetInput.id);
                            }
                        }
                    } else {
                        this.clearSelectionRange();
                        this.moveToNextFilledCell(input, e.key);
                    }
                    return;
                }
                if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight")) {
                    e.preventDefault();
                    this.moveSelectionByArrow(input, e.key);
                    return;
                }
                if (!e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight")) {
                    this.clearSelectionRange();
                }
                if (!e.shiftKey && (e.key === "Tab" || e.key === "Enter")) {
                    this.clearSelectionRange();
                }
                if (this.grid.focusCellByArrow(input, e.key)) {
                    e.preventDefault();
                }
            });

            input.addEventListener("input", () => {
                if (!this.isEditingCell(input)) return;
                this.syncAIDraftLock();
                this.updateMentionAutocomplete(input);
                if (this.activeInput === input) this.formulaInput.value = input.value;
            });
            input.addEventListener("blur", () => {
                this.syncAIDraftLock();
                this.hideMentionAutocompleteSoon();
            });

            input.addEventListener("click", (e) => {
                if (e.shiftKey) {
                    var anchor = this.selectionAnchorId || input.id;
                    this.setSelectionRange(anchor, input.id);
                    return;
                }
                this.setSelectionAnchor(input.id);
                this.clearSelectionRange();
            });

            input.addEventListener("paste", (e) => {
                var text = e.clipboardData && e.clipboardData.getData ? e.clipboardData.getData("text/plain") : "";
                if (typeof text !== "string") return;
                e.preventDefault();
                this.applyPastedText(text);
            });

            input.addEventListener("copy", (e) => {
                var text = this.getSelectedRangeText();
                if (!text) return;
                if (e.clipboardData && e.clipboardData.setData) {
                    e.preventDefault();
                    e.clipboardData.setData("text/plain", text);
                }
            });

            input.parentElement.addEventListener("click", (e) => {
                if (this.selectionDragJustFinished) {
                    this.selectionDragJustFinished = false;
                    return;
                }
                if (e.target === input) return;
                if (e.target.closest && e.target.closest(".fill-handle")) return;
                if (e.target.closest && e.target.closest(".cell-actions")) return;
                var output = e.target.closest && e.target.closest(".cell-output");
                if (output) {
                    var canScroll = output.scrollHeight > output.clientHeight || output.scrollWidth > output.clientWidth;
                    if (canScroll) return;
                }
                this.setActiveInput(input);
                if (e.shiftKey) {
                    var anchor = this.selectionAnchorId || input.id;
                    this.setSelectionRange(anchor, input.id);
                } else {
                    this.setSelectionAnchor(input.id);
                    this.clearSelectionRange();
                }
                input.focus();
            });

            input.parentElement.addEventListener("dblclick", (e) => {
                if (e.target.closest && e.target.closest(".fill-handle")) return;
                if (e.target.closest && e.target.closest(".cell-actions")) return;
                this.setActiveInput(input);
                this.startEditingCell(input);
            });

            input.parentElement.addEventListener("mousedown", (e) => {
                if (e.button !== 0) return;
                if (e.target.closest && e.target.closest(".fill-handle")) return;
                if (e.target.closest && e.target.closest(".cell-actions")) return;
                this.startSelectionDrag(input, e);
            });

            var actions = input.parentElement.querySelector(".cell-actions");
            if (actions) {
                actions.addEventListener("click", (e) => {
                    var btn = e.target.closest && e.target.closest(".cell-action");
                    if (!btn) return;
                    e.preventDefault();
                    e.stopPropagation();
                    var action = btn.dataset.action;
                    if (action === "copy") this.copyCellValue(input);
                    if (action === "fullscreen") this.openFullscreenCell(input);
                    if (action === "run") this.runFormulaForCell(input);
                });
            }

            var fillHandle = input.parentElement.querySelector(".fill-handle");
            if (fillHandle) {
                fillHandle.addEventListener("mousedown", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.startFillDrag(input, e);
                });
            }
        });
    }

    isEditingCell(input) {
        return !!(input && input.classList && input.classList.contains("editing"));
    }

    isDirectTypeKey(event) {
        if (!event) return false;
        if (event.metaKey || event.ctrlKey || event.altKey) return false;
        if (!event.key || event.key.length !== 1) return false;
        return true;
    }

    startEditingCell(input) {
        if (!input) return;
        this.grid.setEditing(input, true);
        this.editStartRawByCell[input.id] = this.getRawCellValue(input.id);
        this.formulaRefCursorId = input.id;
        this.formulaMentionPreview = null;
        var rawValue = this.getRawCellValue(input.id);
        var attachment = this.parseAttachmentSource(rawValue);
        input.value = attachment ? String(attachment.name || "") : rawValue;
        if (document.activeElement !== input) input.focus();
        this.syncAIDraftLock();
    }

    setActiveInput(input) {
        if (this.activeInput && this.activeInput.parentElement) {
            this.activeInput.parentElement.classList.remove("active-cell");
        }
        this.activeInput = input;
        this.activeInput.parentElement.classList.add("active-cell");
        var rawValue = this.getRawCellValue(input.id);
        var attachment = this.parseAttachmentSource(rawValue);
        this.formulaInput.value = attachment ? String(attachment.name || "") : rawValue;
        if (!this.extendSelectionNav) {
            this.setSelectionAnchor(input.id);
            this.clearSelectionRange();
        }
        this.updateAxisHeaderHighlight();
        this.syncCellNameInput();
        this.syncAIDraftLock();
        this.syncAttachButtonState();
    }

    clearActiveInput() {
        if (this.activeInput) {
            this.grid.setEditing(this.activeInput, false);
            this.activeInput.parentElement.classList.remove("active-cell");
        }
        this.activeInput = null;
        this.formulaInput.value = "";
        this.clearSelectionRange();
        this.updateAxisHeaderHighlight();
        this.syncCellNameInput();
        this.syncAIDraftLock();
        this.syncAttachButtonState();
    }

    destroy() {
        this.syncServerEditLock(false);
    }

    ensureActiveCell() {
        if (this.isReportActive()) return;
        if (this.activeInput) return;
        var fallback = this.inputById["A1"] || this.inputs[0];
        if (!fallback) return;
        this.setActiveInput(fallback);
        if (document.activeElement !== fallback) {
            fallback.focus();
        }
    }

    setSelectionAnchor(cellId) {
        this.selectionAnchorId = String(cellId || "").toUpperCase();
    }

    clearSelectionRange() {
        this.selectionRange = null;
        this.clearSelectionHighlight();
        this.syncAttachButtonState();
    }

    clearSelectionHighlight() {
        this.inputs.forEach((input) => {
            input.parentElement.classList.remove("selected-range");
        });
        this.clearHeaderSelectionHighlight();
    }

    clearHeaderSelectionHighlight() {
        var maxRow = this.table.rows.length - 1;
        var maxCol = this.table.rows[0].cells.length - 1;

        for (var col = 1; col <= maxCol; col++) {
            this.table.rows[0].cells[col].classList.remove("selected-col-header");
            this.table.rows[0].cells[col].classList.remove("active-col-header");
        }
        for (var row = 1; row <= maxRow; row++) {
            this.table.rows[row].cells[0].classList.remove("selected-row-header");
            this.table.rows[row].cells[0].classList.remove("active-row-header");
        }
        this.table.rows[0].cells[0].classList.remove("selected-corner-header");
    }

    setSelectionRange(anchorId, targetId) {
        var source = this.parseCellId(anchorId);
        var target = this.parseCellId(targetId);
        if (!source || !target) {
            this.clearSelectionRange();
            return;
        }

        this.selectionRange = {
            startCol: Math.min(source.col, target.col),
            endCol: Math.max(source.col, target.col),
            startRow: Math.min(source.row, target.row),
            endRow: Math.max(source.row, target.row)
        };
        this.highlightSelectionRange();
        this.syncAttachButtonState();
    }

    highlightSelectionRange() {
        this.clearSelectionHighlight();
        if (!this.selectionRange) return;
        var maxRow = this.table.rows.length - 1;
        var maxCol = this.table.rows[0].cells.length - 1;

        this.inputs.forEach((input) => {
            var parsed = this.parseCellId(input.id);
            if (!parsed) return;
            if (parsed.col < this.selectionRange.startCol || parsed.col > this.selectionRange.endCol) return;
            if (parsed.row < this.selectionRange.startRow || parsed.row > this.selectionRange.endRow) return;
            input.parentElement.classList.add("selected-range");
        });

        if (this.selectionRange.startCol === 1 && this.selectionRange.endCol === maxCol) {
            for (var row = this.selectionRange.startRow; row <= this.selectionRange.endRow; row++) {
                if (row < 1 || row > maxRow) continue;
                this.table.rows[row].cells[0].classList.add("selected-row-header");
            }
        }
        if (this.selectionRange.startRow === 1 && this.selectionRange.endRow === maxRow) {
            for (var col = this.selectionRange.startCol; col <= this.selectionRange.endCol; col++) {
                if (col < 1 || col > maxCol) continue;
                this.table.rows[0].cells[col].classList.add("selected-col-header");
            }
        }
        if (this.selectionRange.startCol === 1 && this.selectionRange.endCol === maxCol &&
            this.selectionRange.startRow === 1 && this.selectionRange.endRow === maxRow) {
            this.table.rows[0].cells[0].classList.add("selected-corner-header");
        }
        this.updateAxisHeaderHighlight();
    }

    updateAxisHeaderHighlight() {
        var maxRow = this.table.rows.length - 1;
        var maxCol = this.table.rows[0].cells.length - 1;

        for (var col = 1; col <= maxCol; col++) {
            this.table.rows[0].cells[col].classList.remove("active-col-header");
        }
        for (var row = 1; row <= maxRow; row++) {
            this.table.rows[row].cells[0].classList.remove("active-row-header");
        }

        if (this.selectionRange) {
            for (var c = this.selectionRange.startCol; c <= this.selectionRange.endCol; c++) {
                if (c < 1 || c > maxCol) continue;
                this.table.rows[0].cells[c].classList.add("active-col-header");
            }
            for (var r = this.selectionRange.startRow; r <= this.selectionRange.endRow; r++) {
                if (r < 1 || r > maxRow) continue;
                this.table.rows[r].cells[0].classList.add("active-row-header");
            }
            return;
        }

        if (!this.activeInput) return;
        var parsed = this.parseCellId(this.activeInput.id);
        if (!parsed) return;
        if (parsed.col >= 1 && parsed.col <= maxCol) this.table.rows[0].cells[parsed.col].classList.add("active-col-header");
        if (parsed.row >= 1 && parsed.row <= maxRow) this.table.rows[parsed.row].cells[0].classList.add("active-row-header");
    }

    bindHeaderSelectionEvents() {
        var headerRow = this.table.rows[0];
        for (var colIndex = 1; colIndex < headerRow.cells.length; colIndex++) {
            var colHeader = headerRow.cells[colIndex];
            colHeader.addEventListener("mousedown", (e) => {
                if (e.button !== 0) return;
                if (e.target.closest && (e.target.closest(".col-resize-handle") || e.target.closest(".sort-button"))) return;
                e.preventDefault();
                this.startHeaderSelectionDrag("col", e.currentTarget.cellIndex);
            });
        }

        for (var rowIndex = 1; rowIndex < this.table.rows.length; rowIndex++) {
            var rowHeader = this.table.rows[rowIndex].cells[0];
            rowHeader.addEventListener("mousedown", (e) => {
                if (e.button !== 0) return;
                if (e.target.closest && e.target.closest(".row-resize-handle")) return;
                e.preventDefault();
                this.startHeaderSelectionDrag("row", e.currentTarget.parentElement.rowIndex);
            });
        }
    }

    startHeaderSelectionDrag(mode, anchorIndex) {
        if (mode !== "row" && mode !== "col") return;
        if (!anchorIndex || anchorIndex < 1) return;
        this.headerSelectionDrag = {
            mode: mode,
            anchorIndex: anchorIndex,
            targetIndex: anchorIndex
        };

        this.applyHeaderSelectionRange(mode, anchorIndex, anchorIndex);

        var onMove = (e) => this.onHeaderSelectionDragMove(e);
        var onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            this.headerSelectionDrag = null;
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    }

    onHeaderSelectionDragMove(event) {
        if (!this.headerSelectionDrag) return;
        var el = document.elementFromPoint(event.clientX, event.clientY);
        if (!el || !el.closest) return;
        var td = el.closest("td");
        if (!td) return;
        var mode = this.headerSelectionDrag.mode;
        var index = mode === "row"
            ? (td.parentElement ? td.parentElement.rowIndex : 0)
            : td.cellIndex;
        if (mode === "row" && td.cellIndex !== 0) return;
        if (mode === "col" && (!td.parentElement || td.parentElement.rowIndex !== 0)) return;
        if (index < 1 || index === this.headerSelectionDrag.targetIndex) return;

        this.headerSelectionDrag.targetIndex = index;
        this.applyHeaderSelectionRange(mode, this.headerSelectionDrag.anchorIndex, index);
    }

    applyHeaderSelectionRange(mode, fromIndex, toIndex) {
        var start = Math.min(fromIndex, toIndex);
        var end = Math.max(fromIndex, toIndex);
        if (mode === "row") {
            this.selectEntireRow(start, end);
        } else if (mode === "col") {
            this.selectEntireColumn(start, end);
        }
    }

    selectEntireRow(startRow, endRow) {
        var maxCol = this.table.rows[0].cells.length - 1;
        var from = Math.max(1, Math.min(startRow, endRow));
        var to = Math.max(1, Math.max(startRow, endRow));
        var anchorId = this.formatCellId(1, from);
        this.setSelectionAnchor(anchorId);
        this.selectionRange = {
            startCol: 1,
            endCol: maxCol,
            startRow: from,
            endRow: to
        };
        this.highlightSelectionRange();
        var target = this.inputById[this.formatCellId(1, from)];
        if (target) {
            this.extendSelectionNav = true;
            this.setActiveInput(target);
            this.extendSelectionNav = false;
            target.focus();
        }
    }

    selectEntireColumn(startCol, endCol) {
        var maxRow = this.table.rows.length - 1;
        var from = Math.max(1, Math.min(startCol, endCol));
        var to = Math.max(1, Math.max(startCol, endCol));
        var anchorId = this.formatCellId(from, 1);
        this.setSelectionAnchor(anchorId);
        this.selectionRange = {
            startCol: from,
            endCol: to,
            startRow: 1,
            endRow: maxRow
        };
        this.highlightSelectionRange();
        var target = this.inputById[this.formatCellId(from, 1)];
        if (target) {
            this.extendSelectionNav = true;
            this.setActiveInput(target);
            this.extendSelectionNav = false;
            target.focus();
        }
    }

    moveSelectionByArrow(currentInput, key) {
        var parsed = this.parseCellId(currentInput.id);
        if (!parsed) return;
        var movement = {
            ArrowUp: [-1, 0],
            ArrowDown: [1, 0],
            ArrowLeft: [0, -1],
            ArrowRight: [0, 1]
        }[key];
        if (!movement) return;

        var nextCellId = this.formatCellId(parsed.col + movement[1], parsed.row + movement[0]);
        var nextInput = this.inputById[nextCellId];
        if (!nextInput) return;

        var anchor = this.selectionAnchorId || currentInput.id;
        this.extendSelectionNav = true;
        nextInput.focus();
        this.extendSelectionNav = false;
        this.setSelectionRange(anchor, nextInput.id);
    }

    moveToNextFilledCell(currentInput, key) {
        if (!currentInput) return false;
        var targetCellId = this.findJumpTargetCellId(currentInput.id, key);
        if (!targetCellId) return null;
        var target = this.inputById[targetCellId];
        if (!target) return null;
        target.focus();
        return target;
    }

    getSelectionEdgeInputForDirection(currentInput, key) {
        if (!currentInput || !this.selectionRange) return currentInput;
        var active = this.parseCellId(currentInput.id);
        if (!active) return currentInput;

        var range = this.selectionRange;
        var row = active.row;
        var col = active.col;

        if (key === "ArrowUp" || key === "ArrowDown") {
            if (col < range.startCol || col > range.endCol) col = range.startCol;
            row = key === "ArrowUp" ? range.startRow : range.endRow;
        } else if (key === "ArrowLeft" || key === "ArrowRight") {
            if (row < range.startRow || row > range.endRow) row = range.startRow;
            col = key === "ArrowLeft" ? range.startCol : range.endCol;
        } else {
            return currentInput;
        }

        var edgeCellId = this.formatCellId(col, row);
        return this.inputById[edgeCellId] || currentInput;
    }

    extendSelectionRangeTowardCell(targetCellId, key) {
        if (!this.selectionRange) return;
        var target = this.parseCellId(targetCellId);
        if (!target) return;

        var next = {
            startCol: this.selectionRange.startCol,
            endCol: this.selectionRange.endCol,
            startRow: this.selectionRange.startRow,
            endRow: this.selectionRange.endRow
        };

        if (key === "ArrowUp") {
            next.startRow = Math.min(next.startRow, target.row);
        } else if (key === "ArrowDown") {
            next.endRow = Math.max(next.endRow, target.row);
        } else if (key === "ArrowLeft") {
            next.startCol = Math.min(next.startCol, target.col);
        } else if (key === "ArrowRight") {
            next.endCol = Math.max(next.endCol, target.col);
        } else {
            return;
        }

        this.selectionRange = next;
        this.highlightSelectionRange();
    }

    findJumpTargetCellId(startCellId, key) {
        var parsed = this.parseCellId(startCellId);
        if (!parsed) return null;
        var movement = {
            ArrowUp: [-1, 0],
            ArrowDown: [1, 0],
            ArrowLeft: [0, -1],
            ArrowRight: [0, 1]
        }[key];
        if (!movement) return null;

        var maxRow = this.table.rows.length - 1;
        var maxCol = this.table.rows[0].cells.length - 1;
        var isWithin = (r, c) => r >= 1 && r <= maxRow && c >= 1 && c <= maxCol;
        var isFilled = (r, c) => this.cellHasAnyRawValue(this.formatCellId(c, r));

        var row = parsed.row;
        var col = parsed.col;
        var currentFilled = isFilled(row, col);
        var nextRow = row + movement[0];
        var nextCol = col + movement[1];

        if (currentFilled && isWithin(nextRow, nextCol) && isFilled(nextRow, nextCol)) {
            var edgeRow = nextRow;
            var edgeCol = nextCol;
            while (isWithin(edgeRow + movement[0], edgeCol + movement[1]) && isFilled(edgeRow + movement[0], edgeCol + movement[1])) {
                edgeRow += movement[0];
                edgeCol += movement[1];
            }
            return this.formatCellId(edgeCol, edgeRow);
        }

        var scanRow = nextRow;
        var scanCol = nextCol;
        while (isWithin(scanRow, scanCol)) {
            if (isFilled(scanRow, scanCol)) {
                return this.formatCellId(scanCol, scanRow);
            }
            scanRow += movement[0];
            scanCol += movement[1];
        }
        return null;
    }

    findAdjacentCellId(startCellId, key) {
        var parsed = this.parseCellId(startCellId);
        if (!parsed) return null;
        var movement = {
            ArrowUp: [-1, 0],
            ArrowDown: [1, 0],
            ArrowLeft: [0, -1],
            ArrowRight: [0, 1]
        }[key];
        if (!movement) return null;

        var row = parsed.row + movement[0];
        var col = parsed.col + movement[1];
        var maxRow = this.table.rows.length - 1;
        var maxCol = this.table.rows[0].cells.length - 1;
        if (row < 1 || row > maxRow || col < 1 || col > maxCol) return null;
        return this.formatCellId(col, row);
    }

    canInsertFormulaMention(raw) {
        var text = String(raw == null ? "" : raw).trim();
        if (!text) return false;
        var prefix = text.charAt(0);
        return prefix === "=" || prefix === "#" || prefix === "'";
    }

    getFormulaMentionBaseCellId(fallbackCellId, key) {
        if (!this.selectionRange) return this.formulaRefCursorId || fallbackCellId;
        var baseInput = this.inputById[this.formulaRefCursorId || fallbackCellId] || this.inputById[fallbackCellId];
        var edgeInput = this.getSelectionEdgeInputForDirection(baseInput || this.inputById[fallbackCellId], key);
        return edgeInput ? edgeInput.id : (this.formulaRefCursorId || fallbackCellId);
    }

    buildMentionTokenForSelection(fallbackCellId, isRangeMode) {
        var sheetPrefix = this.getMentionSheetPrefix();
        if (!isRangeMode || !this.selectionRange) {
            var localLabel = this.getPreferredMentionLabel(String(fallbackCellId).toUpperCase());
            if (sheetPrefix) return "@" + sheetPrefix + String(fallbackCellId).toUpperCase();
            return "@" + localLabel;
        }
        var startCellId = this.formatCellId(this.selectionRange.startCol, this.selectionRange.startRow);
        var endCellId = this.formatCellId(this.selectionRange.endCol, this.selectionRange.endRow);
        if (startCellId === endCellId) {
            if (sheetPrefix) return "@" + sheetPrefix + startCellId;
            return "@" + this.getPreferredMentionLabel(startCellId);
        }
        if (sheetPrefix) return "@" + sheetPrefix + startCellId + ":" + endCellId;
        return "@" + startCellId + ":" + endCellId;
    }

    getMentionSheetPrefix() {
        if (!this.crossTabMentionContext) return "";
        if (this.activeSheetId === this.crossTabMentionContext.sourceSheetId) return "";
        var tab = this.findTabById(this.activeSheetId);
        if (!tab || !tab.name) return "";
        var safe = String(tab.name).replace(/'/g, "");
        return "'" + safe + "'!";
    }

    insertTextIntoInputAtCursor(input, text) {
        if (!input) return;
        var value = String(input.value == null ? "" : input.value);
        var insertion = String(text == null ? "" : text);
        if (!insertion) return;

        var start = typeof input.selectionStart === "number" ? input.selectionStart : value.length;
        var end = typeof input.selectionEnd === "number" ? input.selectionEnd : value.length;
        var needsSpace = start > 0 && !/\s|\(|,|\+|-|\*|\/|:/.test(value.charAt(start - 1));
        var prefix = needsSpace ? " " : "";
        var nextValue = value.slice(0, start) + prefix + insertion + value.slice(end);
        input.value = nextValue;
        var cursor = start + prefix.length + insertion.length;
        if (typeof input.setSelectionRange === "function") {
            input.setSelectionRange(cursor, cursor);
        }
    }

    applyFormulaMentionPreview(input, token) {
        if (!input) return;
        var text = String(token == null ? "" : token);
        if (!text) return;
        var value = String(input.value == null ? "" : input.value);
        var caretStart = typeof input.selectionStart === "number" ? input.selectionStart : value.length;
        var caretEnd = typeof input.selectionEnd === "number" ? input.selectionEnd : value.length;

        if (this.formulaMentionPreview && this.formulaMentionPreview.inputId === input.id) {
            var isCaretOnPreviewTail = caretStart === caretEnd && caretStart === this.formulaMentionPreview.end;
            if (!isCaretOnPreviewTail) {
                this.formulaMentionPreview = null;
            }
        }

        if (this.formulaMentionPreview && this.formulaMentionPreview.inputId === input.id) {
            var start = this.formulaMentionPreview.start;
            var end = this.formulaMentionPreview.end;
            if (start >= 0 && end >= start && end <= value.length) {
                value = value.slice(0, start) + text + value.slice(end);
                input.value = value;
                this.formulaMentionPreview.start = start;
                this.formulaMentionPreview.end = start + text.length;
                if (typeof input.setSelectionRange === "function") {
                    input.setSelectionRange(this.formulaMentionPreview.end, this.formulaMentionPreview.end);
                }
                return;
            }
        }

        var startPos = caretStart;
        var endPos = caretEnd;
        var needsSpace = startPos > 0 && !/\s|\(|,|\+|-|\*|\/|:/.test(value.charAt(startPos - 1));
        var prefix = needsSpace ? " " : "";
        var inserted = prefix + text;
        var nextValue = value.slice(0, startPos) + inserted + value.slice(endPos);
        input.value = nextValue;

        this.formulaMentionPreview = {
            inputId: input.id,
            start: startPos,
            end: startPos + inserted.length
        };
        if (typeof input.setSelectionRange === "function") {
            input.setSelectionRange(this.formulaMentionPreview.end, this.formulaMentionPreview.end);
        }
    }

    getPreferredMentionLabel(cellId) {
        var name = this.storage.getCellNameFor(this.activeSheetId, String(cellId).toUpperCase());
        return name ? name : String(cellId).toUpperCase();
    }

    selectNearestValueRegionFromActive(input) {
        var active = input || this.activeInput;
        if (!active) return;
        var parsed = this.parseCellId(active.id);
        if (!parsed) return;

        var maxRow = this.table.rows.length - 1;
        var maxCol = this.table.rows[0].cells.length - 1;
        var row = parsed.row;
        var col = parsed.col;

        var findNearestInRow = (startCol, step) => {
            for (var c = startCol; c >= 1 && c <= maxCol; c += step) {
                var cellId = this.formatCellId(c, row);
                if (this.cellHasAnyRawValue(cellId)) return c;
            }
            return col;
        };

        var findNearestInCol = (startRow, step) => {
            for (var r = startRow; r >= 1 && r <= maxRow; r += step) {
                var cellId = this.formatCellId(col, r);
                if (this.cellHasAnyRawValue(cellId)) return r;
            }
            return row;
        };

        var leftCol = findNearestInRow(col - 1, -1);
        var rightCol = findNearestInRow(col + 1, 1);
        var topRow = findNearestInCol(row - 1, -1);
        var bottomRow = findNearestInCol(row + 1, 1);

        var startId = this.formatCellId(Math.min(leftCol, col), Math.min(topRow, row));
        var endId = this.formatCellId(Math.max(rightCol, col), Math.max(bottomRow, row));
        this.setSelectionAnchor(active.id);
        this.setSelectionRange(startId, endId);
    }

    selectWholeSheetRegion() {
        var maxRow = this.table.rows.length - 1;
        var maxCol = this.table.rows[0].cells.length - 1;
        if (maxRow < 1 || maxCol < 1) return;

        var startId = this.formatCellId(1, 1);
        var endId = this.formatCellId(maxCol, maxRow);
        var anchor = (this.activeInput && this.activeInput.id) ? this.activeInput.id : startId;
        this.setSelectionAnchor(anchor);
        this.setSelectionRange(startId, endId);
    }

    cellHasAnyRawValue(cellId) {
        var raw = this.getRawCellValue(cellId);
        return String(raw == null ? "" : raw).trim() !== "";
    }

    getSelectionStartCellId() {
        if (this.selectionRange) {
            return this.formatCellId(this.selectionRange.startCol, this.selectionRange.startRow);
        }
        return this.activeInput ? this.activeInput.id : null;
    }

    getSelectedCellIds() {
        if (!this.selectionRange) {
            return this.activeInput ? [this.activeInput.id] : [];
        }
        var ids = [];
        for (var row = this.selectionRange.startRow; row <= this.selectionRange.endRow; row++) {
            for (var col = this.selectionRange.startCol; col <= this.selectionRange.endCol; col++) {
                ids.push(this.formatCellId(col, row));
            }
        }
        return ids;
    }

    copySelectedRangeToClipboard() {
        var text = this.getSelectedRangeText();
        if (!text) return;
        var focusedElement = document.activeElement;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(() => {
                this.copyTextFallback(text, focusedElement);
            });
            return;
        }
        this.copyTextFallback(text, focusedElement);
    }

    pasteFromClipboard() {
        if (!navigator.clipboard || !navigator.clipboard.readText) return;
        navigator.clipboard.readText()
            .then((text) => this.applyPastedText(String(text || "")))
            .catch(() => {});
    }

    getSelectedRangeText() {
        var ids = this.getSelectedCellIds();
        if (!ids.length) return "";
        var rows = [];
        if (this.selectionRange) {
            for (var row = this.selectionRange.startRow; row <= this.selectionRange.endRow; row++) {
                var cols = [];
                for (var col = this.selectionRange.startCol; col <= this.selectionRange.endCol; col++) {
                    var cellId = this.formatCellId(col, row);
                    cols.push(this.getRawCellValue(cellId));
                }
                rows.push(cols.join("\t"));
            }
        } else {
            rows.push(this.getRawCellValue(ids[0]));
        }
        return rows.join("\n");
    }

    copyTextFallback(text, previouslyFocused) {
        var fallback = document.createElement("textarea");
        fallback.value = text;
        document.body.appendChild(fallback);
        fallback.select();
        document.execCommand("copy");
        fallback.remove();
        if (previouslyFocused && typeof previouslyFocused.focus === "function") {
            previouslyFocused.focus();
        } else if (this.activeInput && typeof this.activeInput.focus === "function") {
            this.activeInput.focus();
        }
    }

    applyPastedText(text) {
        var startCellId = this.getSelectionStartCellId();
        if (!startCellId) return;
        var start = this.parseCellId(startCellId);
        if (!start) return;

        var rows = String(text || "").replace(/\r/g, "").split("\n");
        if (!rows.length) return;
        this.captureHistorySnapshot("paste:" + this.activeSheetId);
        var matrix = rows.map((row) => row.split("\t"));
        var changed = {};

        if (this.selectionRange && matrix.length === 1 && matrix[0].length === 1) {
            for (var r = this.selectionRange.startRow; r <= this.selectionRange.endRow; r++) {
                for (var c = this.selectionRange.startCol; c <= this.selectionRange.endCol; c++) {
                    var cellId = this.formatCellId(c, r);
                    if (this.inputById[cellId]) {
                        this.setRawCellValue(cellId, matrix[0][0]);
                        changed[cellId] = true;
                    }
                }
            }
        } else {
            for (var rowIndex = 0; rowIndex < matrix.length; rowIndex++) {
                for (var colIndex = 0; colIndex < matrix[rowIndex].length; colIndex++) {
                    var targetCellId = this.formatCellId(start.col + colIndex, start.row + rowIndex);
                    if (!this.inputById[targetCellId]) continue;
                    this.setRawCellValue(targetCellId, matrix[rowIndex][colIndex]);
                    changed[targetCellId] = true;
                }
            }
        }

        if (this.activeInput && changed[this.activeInput.id]) {
            this.activeInput.value = this.getRawCellValue(this.activeInput.id);
            this.formulaInput.value = this.activeInput.value;
        }

        this.aiService.notifyActiveCellChanged();
        this.computeAll();
    }

    clearSelectedCells() {
        var ids = this.getSelectedCellIds();
        if (!ids.length && this.activeInput) {
            ids = [this.activeInput.id];
        }
        if (!ids.length) return;
        this.captureHistorySnapshot("clear:" + this.activeSheetId);

        for (var i = 0; i < ids.length; i++) {
            this.setRawCellValue(ids[i], "");
        }

        if (this.activeInput && ids.indexOf(this.activeInput.id) !== -1) {
            this.activeInput.value = "";
            this.formulaInput.value = "";
        }

        this.aiService.notifyActiveCellChanged();
        this.computeAll();
    }

    getSelectedRowBounds() {
        var maxCol = this.table.rows[0].cells.length - 1;
        if (this.selectionRange && this.selectionRange.startCol === 1 && this.selectionRange.endCol === maxCol) {
            return { start: this.selectionRange.startRow, end: this.selectionRange.endRow };
        }
        if (this.contextMenuState && this.contextMenuState.type === "row") {
            return { start: this.contextMenuState.index, end: this.contextMenuState.index };
        }
        if (this.activeInput) {
            var parsed = this.parseCellId(this.activeInput.id);
            if (parsed) return { start: parsed.row, end: parsed.row };
        }
        return null;
    }

    getSelectedColumnBounds() {
        var maxRow = this.table.rows.length - 1;
        if (this.selectionRange && this.selectionRange.startRow === 1 && this.selectionRange.endRow === maxRow) {
            return { start: this.selectionRange.startCol, end: this.selectionRange.endCol };
        }
        if (this.contextMenuState && this.contextMenuState.type === "col") {
            return { start: this.contextMenuState.index, end: this.contextMenuState.index };
        }
        if (this.activeInput) {
            var parsed = this.parseCellId(this.activeInput.id);
            if (parsed) return { start: parsed.col, end: parsed.col };
        }
        return null;
    }

    insertRowsAtContext() {
        var bounds = this.getSelectedRowBounds();
        if (!bounds) return;
        this.captureHistorySnapshot("rows:" + this.activeSheetId);
        var maxRow = this.table.rows.length - 1;
        var maxCol = this.table.rows[0].cells.length - 1;
        var start = Math.max(1, Math.min(bounds.start, maxRow));
        var count = Math.max(1, Math.min(maxRow - start + 1, bounds.end - bounds.start + 1));
        if (count < 1) return;

        for (var row = maxRow; row >= start; row--) {
            for (var col = 1; col <= maxCol; col++) {
                var targetId = this.formatCellId(col, row);
                var sourceRow = row - count;
                var sourceId = sourceRow >= start ? this.formatCellId(col, sourceRow) : null;
                this.setRawCellValue(targetId, sourceId ? this.getRawCellValue(sourceId) : "");
            }
        }

        this.selectEntireRow(start, start + count - 1);
        this.aiService.notifyActiveCellChanged();
        this.computeAll();
    }

    deleteRowsAtContext() {
        var bounds = this.getSelectedRowBounds();
        if (!bounds) return;
        this.captureHistorySnapshot("rows:" + this.activeSheetId);
        var maxRow = this.table.rows.length - 1;
        var maxCol = this.table.rows[0].cells.length - 1;
        var start = Math.max(1, Math.min(bounds.start, maxRow));
        var count = Math.max(1, Math.min(maxRow - start + 1, bounds.end - bounds.start + 1));
        if (count < 1) return;

        for (var row = start; row <= maxRow; row++) {
            for (var col = 1; col <= maxCol; col++) {
                var targetId = this.formatCellId(col, row);
                var sourceRow = row + count;
                var sourceId = sourceRow <= maxRow ? this.formatCellId(col, sourceRow) : null;
                this.setRawCellValue(targetId, sourceId ? this.getRawCellValue(sourceId) : "");
            }
        }

        this.selectEntireRow(start, Math.min(maxRow, start + count - 1));
        this.aiService.notifyActiveCellChanged();
        this.computeAll();
    }

    insertColumnsAtContext() {
        var bounds = this.getSelectedColumnBounds();
        if (!bounds) return;
        this.captureHistorySnapshot("cols:" + this.activeSheetId);
        var maxRow = this.table.rows.length - 1;
        var maxCol = this.table.rows[0].cells.length - 1;
        var start = Math.max(1, Math.min(bounds.start, maxCol));
        var count = Math.max(1, Math.min(maxCol - start + 1, bounds.end - bounds.start + 1));
        if (count < 1) return;

        for (var col = maxCol; col >= start; col--) {
            for (var row = 1; row <= maxRow; row++) {
                var targetId = this.formatCellId(col, row);
                var sourceCol = col - count;
                var sourceId = sourceCol >= start ? this.formatCellId(sourceCol, row) : null;
                this.setRawCellValue(targetId, sourceId ? this.getRawCellValue(sourceId) : "");
            }
        }

        this.selectEntireColumn(start, start + count - 1);
        this.aiService.notifyActiveCellChanged();
        this.computeAll();
    }

    deleteColumnsAtContext() {
        var bounds = this.getSelectedColumnBounds();
        if (!bounds) return;
        this.captureHistorySnapshot("cols:" + this.activeSheetId);
        var maxRow = this.table.rows.length - 1;
        var maxCol = this.table.rows[0].cells.length - 1;
        var start = Math.max(1, Math.min(bounds.start, maxCol));
        var count = Math.max(1, Math.min(maxCol - start + 1, bounds.end - bounds.start + 1));
        if (count < 1) return;

        for (var col = start; col <= maxCol; col++) {
            for (var row = 1; row <= maxRow; row++) {
                var targetId = this.formatCellId(col, row);
                var sourceCol = col + count;
                var sourceId = sourceCol <= maxCol ? this.formatCellId(sourceCol, row) : null;
                this.setRawCellValue(targetId, sourceId ? this.getRawCellValue(sourceId) : "");
            }
        }

        this.selectEntireColumn(start, Math.min(maxCol, start + count - 1));
        this.aiService.notifyActiveCellChanged();
        this.computeAll();
    }

    parseCellId(cellId) {
        var match = /^([A-Za-z]+)([0-9]+)$/.exec(String(cellId || ""));
        if (!match) return null;
        return {
            col: this.columnLabelToIndex(match[1].toUpperCase()),
            row: parseInt(match[2], 10)
        };
    }

    columnLabelToIndex(label) {
        var result = 0;
        for (var i = 0; i < label.length; i++) {
            result = result * 26 + (label.charCodeAt(i) - 64);
        }
        return result;
    }

    columnIndexToLabel(index) {
        var n = Math.max(1, index);
        var label = "";
        while (n > 0) {
            var rem = (n - 1) % 26;
            label = String.fromCharCode(65 + rem) + label;
            n = Math.floor((n - 1) / 26);
        }
        return label;
    }

    formatCellId(col, row) {
        return this.columnIndexToLabel(col) + row;
    }

    shiftFormulaReferences(rawValue, dRow, dCol) {
        if (!rawValue) return rawValue;
        var prefix = rawValue.charAt(0);
        if (prefix !== "=" && prefix !== "'" && prefix !== ">" && prefix !== "#") return rawValue;
        var body = prefix === "=" ? rawValue.substring(1) : rawValue;
        var replaced = body.replace(/((?:'[^']+'|[A-Za-z][A-Za-z0-9 _-]*)!)?([A-Za-z]+[0-9]+)(:([A-Za-z]+[0-9]+))?/g, (_, qualifier, firstRef, rangePart, secondRef) => {
            var shiftRef = (ref) => {
                var parsed = this.parseCellId(ref);
                if (!parsed) return ref;
                var nextCol = Math.max(1, parsed.col + dCol);
                var nextRow = Math.max(1, parsed.row + dRow);
                return this.formatCellId(nextCol, nextRow);
            };

            var left = shiftRef(firstRef);
            if (rangePart && secondRef) {
                return (qualifier || "") + left + ":" + shiftRef(secondRef);
            }
            return (qualifier || "") + left;
        });
        return prefix === "=" ? "=" + replaced : replaced;
    }

    clearFillRangeHighlight() {
        this.inputs.forEach((input) => {
            input.parentElement.classList.remove("fill-range");
        });
    }

    highlightFillRange(sourceId, targetId) {
        this.clearFillRangeHighlight();
        var source = this.parseCellId(sourceId);
        var target = this.parseCellId(targetId);
        if (!source || !target) return;

        var minCol = Math.min(source.col, target.col);
        var maxCol = Math.max(source.col, target.col);
        var minRow = Math.min(source.row, target.row);
        var maxRow = Math.max(source.row, target.row);

        this.inputs.forEach((input) => {
            var parsed = this.parseCellId(input.id);
            if (!parsed) return;
            if (parsed.col < minCol || parsed.col > maxCol) return;
            if (parsed.row < minRow || parsed.row > maxRow) return;
            if (input.id === sourceId) return;
            input.parentElement.classList.add("fill-range");
        });
    }

    startFillDrag(sourceInput, event) {
        this.setActiveInput(sourceInput);
        this.fillDrag = {
            sourceId: sourceInput.id,
            sourceRaw: this.getRawCellValue(sourceInput.id),
            targetId: sourceInput.id
        };

        var onMove = (moveEvent) => this.onFillDragMove(moveEvent);
        var onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            this.finishFillDrag();
        };

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        this.onFillDragMove(event);
    }

    startSelectionDrag(sourceInput, event) {
        if (!sourceInput) return;
        event.preventDefault();
        var mentionInput = null;
        if (this.activeInput && this.isEditingCell(this.activeInput) && this.canInsertFormulaMention(this.activeInput.value)) {
            mentionInput = this.activeInput;
        } else if (document.activeElement === this.formulaInput && this.canInsertFormulaMention(this.formulaInput.value)) {
            mentionInput = this.formulaInput;
        }

        if (!mentionInput) {
            this.setActiveInput(sourceInput);
        }
        this.setSelectionAnchor(sourceInput.id);
        this.setSelectionRange(sourceInput.id, sourceInput.id);
        this.selectionDrag = {
            anchorId: sourceInput.id,
            targetId: sourceInput.id,
            moved: false,
            mentionMode: !!mentionInput,
            mentionInput: mentionInput
        };

        if (mentionInput) {
            this.formulaRefCursorId = sourceInput.id;
            var firstToken = this.buildMentionTokenForSelection(sourceInput.id, true);
            this.applyFormulaMentionPreview(mentionInput, firstToken);
            this.syncMentionPreviewToUi(mentionInput);
        }

        var onMove = (moveEvent) => this.onSelectionDragMove(moveEvent);
        var onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            this.finishSelectionDrag();
        };

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    }

    onSelectionDragMove(event) {
        if (!this.selectionDrag) return;
        var el = document.elementFromPoint(event.clientX, event.clientY);
        if (!el || !el.closest) return;
        var td = el.closest("td");
        if (!td) return;
        var input = td.querySelector("input");
        if (!input) return;

        if (this.selectionDrag.targetId !== input.id) {
            this.selectionDrag.moved = true;
            this.selectionDrag.targetId = input.id;
            this.setSelectionRange(this.selectionDrag.anchorId, input.id);
            if (this.selectionDrag.mentionMode && this.selectionDrag.mentionInput) {
                this.formulaRefCursorId = input.id;
                var mentionToken = this.buildMentionTokenForSelection(input.id, true);
                this.applyFormulaMentionPreview(this.selectionDrag.mentionInput, mentionToken);
                this.syncMentionPreviewToUi(this.selectionDrag.mentionInput);
            }
        }
    }

    finishSelectionDrag() {
        if (!this.selectionDrag) return;
        var targetId = this.selectionDrag.targetId;
        var moved = !!this.selectionDrag.moved;
        var mentionMode = !!this.selectionDrag.mentionMode;
        var mentionInput = this.selectionDrag.mentionInput;
        this.selectionDrag = null;
        this.selectionDragJustFinished = moved || mentionMode;

        if (mentionMode && mentionInput) {
            this.syncMentionPreviewToUi(mentionInput);
            if (typeof mentionInput.focus === "function") mentionInput.focus();
            return;
        }

        var targetInput = this.inputById[targetId];
        if (!targetInput) return;
        this.extendSelectionNav = true;
        targetInput.focus();
        this.extendSelectionNav = false;
    }

    syncMentionPreviewToUi(mentionInput) {
        if (!mentionInput) return;
        if (this.syncCrossTabMentionSourceValue(mentionInput.value)) {
            if (mentionInput !== this.formulaInput) this.formulaInput.value = mentionInput.value;
            return;
        }
        if (mentionInput === this.formulaInput) {
            if (!this.activeInput) return;
            this.activeInput.value = mentionInput.value;
            this.setRawCellValue(this.activeInput.id, mentionInput.value);
            return;
        }
        if (this.activeInput === mentionInput) {
            this.formulaInput.value = mentionInput.value;
        }
    }

    onFillDragMove(event) {
        if (!this.fillDrag) return;
        var el = document.elementFromPoint(event.clientX, event.clientY);
        if (!el || !el.closest) return;
        var td = el.closest("td");
        if (!td) return;
        var input = td.querySelector("input");
        if (!input) return;

        this.fillDrag.targetId = input.id;
        this.highlightFillRange(this.fillDrag.sourceId, this.fillDrag.targetId);
    }

    finishFillDrag() {
        if (!this.fillDrag) return;
        this.captureHistorySnapshot("fill:" + this.activeSheetId);

        var source = this.parseCellId(this.fillDrag.sourceId);
        var target = this.parseCellId(this.fillDrag.targetId);
        var sourceRaw = this.fillDrag.sourceRaw;

        if (source && target && sourceRaw !== "") {
            var minCol = Math.min(source.col, target.col);
            var maxCol = Math.max(source.col, target.col);
            var minRow = Math.min(source.row, target.row);
            var maxRow = Math.max(source.row, target.row);

            for (var row = minRow; row <= maxRow; row++) {
                for (var col = minCol; col <= maxCol; col++) {
                    var cellId = this.formatCellId(col, row);
                    if (cellId === this.fillDrag.sourceId) continue;
                    var dRow = row - source.row;
                    var dCol = col - source.col;
                    var nextValue = (sourceRaw.charAt(0) === "=" || sourceRaw.charAt(0) === "'" || sourceRaw.charAt(0) === ">" || sourceRaw.charAt(0) === "#")
                        ? this.shiftFormulaReferences(sourceRaw, dRow, dCol)
                        : sourceRaw;
                    this.setRawCellValue(cellId, nextValue);
                }
            }
        }

        this.fillDrag = null;
        this.clearFillRangeHighlight();
        this.aiService.notifyActiveCellChanged();
        this.computeAll();
    }

    setupFullscreenOverlay() {
        var overlay = document.createElement("div");
        overlay.className = "fullscreen-overlay";
        overlay.style.display = "none";
        overlay.innerHTML = "<div class='fullscreen-panel'><button type='button' class='fullscreen-close' title='Close'>✕</button><div class='fullscreen-content'></div></div>";
        document.body.appendChild(overlay);

        this.fullscreenOverlay = overlay;
        this.fullscreenOverlayContent = overlay.querySelector(".fullscreen-content");

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay || (e.target.closest && e.target.closest(".fullscreen-close"))) {
                this.closeFullscreenCell();
            }
        });
        document.addEventListener("keydown", (e) => {
            if (e.key !== "Escape") return;
            if (!this.fullscreenOverlay || this.fullscreenOverlay.style.display === "none") return;
            e.preventDefault();
            this.closeFullscreenCell();
        });
    }

    copyCellValue(input) {
        var value = input.parentElement.dataset.computedValue || "";
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(value).catch(() => {});
            return;
        }
        var fallback = document.createElement("textarea");
        fallback.value = value;
        document.body.appendChild(fallback);
        fallback.select();
        document.execCommand("copy");
        fallback.remove();
    }

    runFormulaForCell(input) {
        if (!input) return;
        if (this.aiService.getMode() !== AI_MODE.manual) return;
        var raw = this.getRawCellValue(input.id);
        if (!raw || (raw.charAt(0) !== "=" && raw.charAt(0) !== ">")) return;
        this.computeAll({ forceRefreshAI: true });
    }

    openFullscreenCell(input) {
        if (!this.fullscreenOverlay || !this.fullscreenOverlayContent) return;
        var value = input.parentElement.dataset.computedValue || "";
        this.fullscreenOverlayContent.innerHTML = this.grid.renderMarkdown(value);
        this.fullscreenOverlay.style.display = "flex";
    }

    closeFullscreenCell() {
        if (!this.fullscreenOverlay || !this.fullscreenOverlayContent) return;
        this.fullscreenOverlayContent.innerHTML = "";
        this.fullscreenOverlay.style.display = "none";
    }

    setupCellNameControls() {
        this.cellNameInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                this.applyActiveCellName();
            }
        });
        if (this.namedCellJump) {
            this.namedCellJump.addEventListener("change", () => {
                var selected = this.namedCellJump.value;
                if (!selected) return;
                this.navigateToNamedCell(selected);
                this.namedCellJump.value = "";
            });
            this.refreshNamedCellJumpOptions();
        }
    }

    setupReportControls() {
        if (!this.reportEditor || !this.reportWrap) return;

        this.reportEditor.innerHTML = this.storage.getReportContent(this.activeSheetId) || "<p></p>";

        this.reportEditor.addEventListener("input", () => {
            if (!this.isReportActive()) return;
            this.captureHistorySnapshot("report:" + this.activeSheetId);
            this.storage.setReportContent(this.activeSheetId, this.reportEditor.innerHTML);
            this.renderReportLiveValues();
        });

        var cmdButtons = this.reportWrap.querySelectorAll(".report-cmd");
        cmdButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                if (this.reportMode !== "edit") return;
                var cmd = btn.dataset.cmd;
                this.reportEditor.focus();
                if (!cmd) return;
                this.captureHistorySnapshot("report:" + this.activeSheetId);
                document.execCommand(cmd, false);
                if (this.isReportActive()) this.storage.setReportContent(this.activeSheetId, this.reportEditor.innerHTML);
                this.renderReportLiveValues();
            });
        });

        this.reportLive.addEventListener("change", (e) => {
            var input = e.target && e.target.closest ? e.target.closest(".report-linked-input") : null;
            if (!input) return;
            this.applyLinkedReportInput(input);
        });
        this.reportLive.addEventListener("click", (e) => {
            var fileButton = e.target && e.target.closest ? e.target.closest(".report-file-button") : null;
            var removeButton = e.target && e.target.closest ? e.target.closest(".report-file-remove") : null;
            if (fileButton || removeButton) {
                var shell = (fileButton || removeButton).closest(".report-file-shell");
                if (!shell) return;
                e.preventDefault();
                e.stopPropagation();
                this.handleReportFileShellAction(shell, !!removeButton);
                return;
            }
        });
        this.reportLive.addEventListener("focusin", (e) => {
            var input = e.target && e.target.closest ? e.target.closest(".report-linked-input") : null;
            if (!input) return;
            this.refreshLinkedReportInputValue(input);
        });
        this.reportLive.addEventListener("keydown", (e) => {
            var input = e.target && e.target.closest ? e.target.closest(".report-linked-input") : null;
            if (!input) return;
            if (e.key === "Enter") {
                e.preventDefault();
                this.applyLinkedReportInput(input);
                input.blur();
            }
        });
        this.reportLive.addEventListener("click", (e) => {
            var link = e.target && e.target.closest ? e.target.closest(".report-internal-link") : null;
            if (!link) return;
            e.preventDefault();
            this.followReportInternalLink(link);
        });

        var modeButtons = this.reportWrap.querySelectorAll(".report-mode");
        modeButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                this.setReportMode(btn.dataset.reportMode || "edit");
            });
        });

        this.setReportMode("view");
        this.renderReportLiveValues();
    }

    setReportMode(mode) {
        this.reportMode = mode === "view" ? "view" : "edit";
        var isView = this.reportMode === "view";

        if (isView) {
            this.renderReportLiveValues(true);
        }

        if (this.reportEditor) this.reportEditor.style.display = isView ? "none" : "block";

        var liveLabel = this.reportWrap ? this.reportWrap.querySelector(".report-live-label") : null;
        if (liveLabel) liveLabel.style.display = isView ? "block" : "none";
        if (this.reportLive) this.reportLive.style.display = isView ? "block" : "none";

        var modeButtons = this.reportWrap ? this.reportWrap.querySelectorAll(".report-mode") : [];
        modeButtons.forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.reportMode === this.reportMode);
        });

        var cmdButtons = this.reportWrap ? this.reportWrap.querySelectorAll(".report-cmd") : [];
        cmdButtons.forEach((btn) => {
            btn.disabled = isView;
        });

        if (!isView) this.lastReportLiveHtml = "";
    }

    renderReportLiveValues(forceRender) {
        if (!this.reportEditor || !this.reportLive) return;
        if (this.reportMode !== "view" && !forceRender) return;
        var root = document.createElement("div");
        root.innerHTML = this.reportEditor.innerHTML || "";
        this.replaceMentionNodes(root);
        this.renderReportMarkdownNodes(root);
        var html = root.innerHTML.trim();
        var nextHtml = html || "<p></p>";
        if (!forceRender && this.lastReportLiveHtml === nextHtml) return;
        this.lastReportLiveHtml = nextHtml;
        this.reportLive.innerHTML = nextHtml;
        this.injectLinkedInputsFromPlaceholders(this.reportLive);
        if (!this.reportLive.innerHTML.trim()) {
            this.reportLive.innerHTML = "<p></p>";
        }
    }

    replaceMentionNodes(root) {
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        var nodes = [];
        var current;
        while ((current = walker.nextNode())) {
            nodes.push(current);
        }
        for (var i = 0; i < nodes.length; i++) {
            this.replaceMentionInTextNode(nodes[i]);
        }
    }

    renderReportMarkdownNodes(root) {
        if (!root) return;
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        var nodes = [];
        var current;
        while ((current = walker.nextNode())) {
            nodes.push(current);
        }

        for (var i = 0; i < nodes.length; i++) {
            var textNode = nodes[i];
            if (!textNode || !textNode.parentNode) continue;
            var parent = textNode.parentNode;
            if (!parent || !parent.closest) continue;
            if (parent.closest(".report-input-placeholder")) continue;
            if (parent.closest(".report-internal-link")) continue;
            if (parent.closest(".report-region-table")) continue;
            if (parent.closest(".report-linked-input")) continue;
            if (parent.closest("code, pre, button, a, table, ul, ol, li")) continue;

            var text = String(textNode.nodeValue || "");
            if (!text.trim()) continue;

            var container = document.createElement("div");
            container.innerHTML = this.grid.renderMarkdown(text);
            var fragment = document.createDocumentFragment();
            while (container.firstChild) {
                fragment.appendChild(container.firstChild);
            }
            parent.replaceChild(fragment, textNode);
        }
    }

    replaceMentionInTextNode(textNode) {
        var text = textNode.nodeValue || "";
        if (!text) return;
        var pattern = /(!@(?:'[^']+'|[A-Za-z][A-Za-z0-9 _-]*)[!:][A-Za-z]+[0-9]+:[A-Za-z]+[0-9]+(?:#[A-Za-z0-9 _-]+)?|!@(?:'[^']+'|[A-Za-z][A-Za-z0-9 _-]*)[!:][A-Za-z]+[0-9]+(?:#[A-Za-z0-9 _-]+)?|!@[A-Za-z_][A-Za-z0-9_]*(?:#[A-Za-z0-9 _-]+)?|File:(?:_?@[A-Za-z_][A-Za-z0-9_]*|(?:_?@)?(?:'[^']+'|[A-Za-z][A-Za-z0-9 _-]*)[!:][A-Za-z]+[0-9]+)(?::\[[^\]]*\])?|Input:(?:_?@[A-Za-z_][A-Za-z0-9_]*|(?:_?@)?(?:'[^']+'|[A-Za-z][A-Za-z0-9 _-]*)[!:][A-Za-z]+[0-9]+)(?::\[[^\]]*\])?|(?:_?@)?(?:'[^']+'|[A-Za-z][A-Za-z0-9 _-]*)[!:][A-Za-z]+[0-9]+:[A-Za-z]+[0-9]+|_?@[A-Za-z_][A-Za-z0-9_]*|(?:_?@)?(?:'[^']+'|[A-Za-z][A-Za-z0-9 _-]*)[:!][A-Za-z]+[0-9]+)/g;
        pattern.lastIndex = 0;
        var hasMatch = pattern.exec(text);
        if (!hasMatch) return;
        pattern.lastIndex = 0;

        var fragment = document.createDocumentFragment();
        var cursor = 0;
        var m;
        while ((m = pattern.exec(text))) {
            var token = m[0];
            if (m.index > cursor) {
                fragment.appendChild(document.createTextNode(text.slice(cursor, m.index)));
            }
            if (token.indexOf("Input:") === 0) {
                var inputSpec = this.parseReportControlToken(token, "Input:");
                var placeholder = document.createElement("span");
                placeholder.className = "report-input-placeholder";
                placeholder.dataset.reportInputToken = inputSpec.referenceToken;
                if (inputSpec.hint) placeholder.dataset.reportInputHint = inputSpec.hint;
                placeholder.textContent = token;
                fragment.appendChild(placeholder);
            } else if (token.indexOf("File:") === 0) {
                var fileSpec = this.parseReportControlToken(token, "File:");
                var filePlaceholder = document.createElement("span");
                filePlaceholder.className = "report-file-placeholder";
                filePlaceholder.dataset.reportFileToken = fileSpec.referenceToken;
                if (fileSpec.hint) filePlaceholder.dataset.reportFileHint = fileSpec.hint;
                filePlaceholder.textContent = token;
                fragment.appendChild(filePlaceholder);
            } else if (token.indexOf("!@") === 0) {
                var linkResolved = this.resolveReportInternalLink(token);
                if (!linkResolved) {
                    fragment.appendChild(document.createTextNode(token));
                } else {
                    fragment.appendChild(this.createReportInternalLinkElement(token, linkResolved));
                }
            } else {
                var resolved = this.resolveReportMention(token);
                if (!resolved || typeof resolved.value === "undefined") {
                    fragment.appendChild(document.createTextNode(token));
                } else if (resolved.type === "region") {
                    fragment.appendChild(this.createReportRegionTableElement(resolved.rows));
                } else if (resolved.type === "list") {
                    fragment.appendChild(this.createReportListElement(resolved.items));
                } else {
                    fragment.appendChild(document.createTextNode(String(resolved.value)));
                }
            }
            cursor = m.index + token.length;
        }
        if (cursor < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(cursor)));
        }
        textNode.parentNode.replaceChild(fragment, textNode);
    }

    parseReportControlToken(token, prefix) {
        var source = String(token == null ? "" : token);
        var body = source.indexOf(prefix) === 0 ? source.substring(prefix.length) : source;
        var match = /^(.*?)(?::\[([^\]]*)\])?$/.exec(body);
        return {
            referenceToken: String(match && match[1] ? match[1] : body).trim(),
            hint: String(match && match[2] ? match[2] : "").trim()
        };
    }

    resolveReportInternalLink(token) {
        var raw = String(token || "");
        if (!raw || raw.indexOf("!@") !== 0) return null;
        var hashIdx = raw.indexOf("#");
        var linkToken = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw;
        var label = hashIdx >= 0 ? raw.slice(hashIdx + 1).trim() : "";
        var ref = this.resolveReportReference(linkToken.substring(1));
        if (!ref || !ref.sheetId) return null;
        if (ref.cellId) {
            return {
                sheetId: ref.sheetId,
                cellId: String(ref.cellId).toUpperCase(),
                label: label
            };
        }
        if (ref.startCellId) {
            return {
                sheetId: ref.sheetId,
                cellId: String(ref.startCellId).toUpperCase(),
                label: label
            };
        }
        return null;
    }

    createReportInternalLinkElement(token, target) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "report-internal-link";
        btn.dataset.sheetId = target.sheetId;
        btn.dataset.cellId = target.cellId;
        btn.textContent = String((target && target.label) ? target.label : token || "");
        return btn;
    }

    followReportInternalLink(link) {
        var sheetId = String(link.dataset.sheetId || "");
        var cellId = String(link.dataset.cellId || "").toUpperCase();
        if (!sheetId || !cellId) return;
        if (this.isReportTab(sheetId)) {
            this.switchToSheet(sheetId);
            return;
        }
        if (this.activeSheetId !== sheetId) {
            this.switchToSheet(sheetId);
        }
        var input = this.inputById[cellId];
        if (!input) return;
        this.setActiveInput(input);
        input.focus();
    }

    injectLinkedInputsFromPlaceholders(root) {
        if (!root) return;
        var placeholders = root.querySelectorAll(".report-input-placeholder");
        placeholders.forEach((node) => {
            var payload = node.dataset.reportInputToken || "";
            var item = this.resolveReportInputMention(payload);
            if (!item) {
                node.classList.remove("report-input-placeholder");
                return;
            }
            item.placeholder = String(node.dataset.reportInputHint || "");
            var fragment = document.createDocumentFragment();
            fragment.appendChild(this.createLinkedReportInputElement(item));
            node.parentNode.replaceChild(fragment, node);
        });
        var filePlaceholders = root.querySelectorAll(".report-file-placeholder");
        filePlaceholders.forEach((node) => {
            var payload = node.dataset.reportFileToken || "";
            var item = this.resolveReportInputMention(payload);
            if (!item) {
                node.classList.remove("report-file-placeholder");
                return;
            }
            item.placeholder = String(node.dataset.reportFileHint || "");
            var fragment = document.createDocumentFragment();
            fragment.appendChild(this.createLinkedReportFileElement(item));
            node.parentNode.replaceChild(fragment, node);
        });
    }

    createLinkedReportInputElement(inputResolved) {
        var linked = document.createElement("input");
        linked.type = "text";
        linked.className = "report-linked-input";
        linked.disabled = false;
        linked.readOnly = false;
        linked.dataset.sheetId = inputResolved.sheetId;
        linked.dataset.cellId = inputResolved.cellId;
        linked.dataset.key = inputResolved.sheetId + ":" + inputResolved.cellId;
        linked.value = this.readLinkedInputValue(inputResolved.sheetId, inputResolved.cellId);
        if (inputResolved.placeholder) linked.placeholder = String(inputResolved.placeholder);
        return linked;
    }

    createLinkedReportFileElement(inputResolved) {
        var shell = document.createElement("span");
        shell.className = "report-file-shell";
        shell.dataset.sheetId = inputResolved.sheetId;
        shell.dataset.cellId = inputResolved.cellId;

        var raw = this.storage.getCellValue(inputResolved.sheetId, inputResolved.cellId);
        var attachment = this.parseAttachmentSource(raw);

        var choose = document.createElement("button");
        choose.type = "button";
        choose.className = "report-file-button";
        choose.textContent = attachment && attachment.name
            ? attachment.name
            : (inputResolved.placeholder || "Choose file");
        shell.appendChild(choose);

        if (attachment && attachment.name) {
            var remove = document.createElement("button");
            remove.type = "button";
            remove.className = "report-file-remove";
            remove.textContent = "×";
            remove.title = "Remove file";
            shell.appendChild(remove);
        }
        return shell;
    }

    handleReportFileShellAction(shell, removeOnly) {
        if (!shell || !this.attachFileInput) return;
        var sheetId = String(shell.dataset.sheetId || "");
        var cellId = String(shell.dataset.cellId || "").toUpperCase();
        if (!sheetId || !cellId) return;

        if (removeOnly) {
            this.captureHistorySnapshot("attachment:" + sheetId + ":" + cellId);
            this.storage.setCellValue(sheetId, cellId, this.buildAttachmentSource({ pending: true }));
            if (this.computedValuesBySheet[sheetId]) {
                delete this.computedValuesBySheet[sheetId][cellId];
            }
            this.renderReportLiveValues(true);
            this.computeAll();
            return;
        }

        var previousValue = this.storage.getCellValue(sheetId, cellId) || "";
        this.pendingAttachmentContext = {
            sheetId: sheetId,
            cellId: cellId,
            previousValue: String(previousValue == null ? "" : previousValue)
        };
        if (!this.parseAttachmentSource(previousValue)) {
            this.storage.setCellValue(sheetId, cellId, this.buildAttachmentSource({ pending: true }));
            this.renderReportLiveValues(true);
        }
        this.attachFileInput.value = "";
        this.attachFileInput.click();
    }

    applyLinkedReportInput(input) {
        var sheetId = input.dataset.sheetId;
        var cellId = String(input.dataset.cellId || "").toUpperCase();
        if (!sheetId || !cellId) return;

        this.captureHistorySnapshot("report-input:" + sheetId + ":" + cellId);
        this.storage.setCellValue(sheetId, cellId, input.value);
        if (this.computedValuesBySheet[sheetId]) {
            delete this.computedValuesBySheet[sheetId][cellId];
        }
        this.aiService.notifyActiveCellChanged();
        this.renderReportLiveValues(true);
        this.computeAll();
    }

    refreshLinkedReportInputValue(input) {
        var sheetId = input.dataset.sheetId;
        var cellId = String(input.dataset.cellId || "").toUpperCase();
        if (!sheetId || !cellId) return;
        input.value = this.readLinkedInputValue(sheetId, cellId);
    }

    resolveReportInputMention(payload) {
        var resolved = this.resolveReportReference(payload);
        if (!resolved) return null;
        if (resolved.type === "region") {
            return {
                sheetId: resolved.sheetId,
                cellId: resolved.startCellId,
                value: this.readLinkedInputValue(resolved.sheetId, resolved.startCellId)
            };
        }
        return {
            sheetId: resolved.sheetId,
            cellId: resolved.cellId,
            value: this.readLinkedInputValue(resolved.sheetId, resolved.cellId)
        };
    }

    resolveReportMention(token) {
        var resolved = this.resolveReportReference(token);
        if (!resolved) return null;
        if (resolved.type === "region") {
            return { type: "region", rows: resolved.rows, value: resolved.value };
        }
        if (resolved.type === "list") {
            return { type: "list", items: resolved.items, value: resolved.value };
        }
        return { value: resolved.value };
    }

    resolveReportReference(token) {
        if (!token) return null;
        var rawMode = token.indexOf("_@") === 0;
        var tokenBody = rawMode ? token.substring(1) : token;
        var normalized = tokenBody.charAt(0) === "@" ? tokenBody.substring(1) : tokenBody;
        var rangeResolved = this.resolveSheetRegionMention(normalized, rawMode);
        if (rangeResolved) return rangeResolved;
        if (normalized.charAt(0) === "@") {
            return this.resolveNamedMention(normalized.substring(1), rawMode);
        }
        if (tokenBody.charAt(0) === "@") {
            // Keep @name behavior.
            var named = this.resolveNamedMention(tokenBody.substring(1), rawMode);
            if (named) return named;
            // Fallback: @Sheet!A1 style references.
            return this.resolveSheetCellMention(tokenBody.substring(1), rawMode);
        }
        return this.resolveSheetCellMention(normalized, rawMode);
    }

    resolveNamedMention(name, rawMode) {
        var ref = this.storage.resolveNamedCell(name);
        if (!ref || !ref.sheetId) return null;
        if (ref.startCellId && ref.endCellId) {
            var startCellId = String(ref.startCellId).toUpperCase();
            var endCellId = String(ref.endCellId).toUpperCase();
            var rows = rawMode
                ? this.readRegionRawValues(ref.sheetId, startCellId, endCellId)
                : this.readRegionValues(ref.sheetId, startCellId, endCellId);
            return {
                type: "region",
                sheetId: ref.sheetId,
                startCellId: startCellId,
                endCellId: endCellId,
                rows: rows,
                value: rows.length ? rows[0].join(", ") : ""
            };
        }
        if (!ref.cellId) return null;
        var targetCellId = String(ref.cellId).toUpperCase();
        var value = rawMode
            ? this.storage.getCellValue(ref.sheetId, targetCellId)
            : this.readCellMentionValue(ref.sheetId, targetCellId);
        if (rawMode) {
            return {
                sheetId: ref.sheetId,
                cellId: targetCellId,
                value: String(value == null ? "" : value)
            };
        }
        if (this.isListShortcutCell(ref.sheetId, targetCellId)) {
            return {
                type: "list",
                sheetId: ref.sheetId,
                cellId: targetCellId,
                items: this.parseListItemsFromMentionValue(value),
                value: value
            };
        }
        return {
            sheetId: ref.sheetId,
            cellId: targetCellId,
            value: value
        };
    }

    resolveSheetCellMention(token, rawMode) {
        var match = /^(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))[:!]([A-Za-z]+[0-9]+)$/.exec(token);
        if (!match) return null;
        var sheetName = match[1] || match[2] || "";
        var cellId = (match[3] || "").toUpperCase();
        var sheetId = this.findSheetIdByName(sheetName);
        if (!sheetId) return null;
        var value = rawMode
            ? this.storage.getCellValue(sheetId, cellId)
            : this.readCellMentionValue(sheetId, cellId);
        if (rawMode) {
            return {
                sheetId: sheetId,
                cellId: cellId,
                value: String(value == null ? "" : value)
            };
        }
        if (this.isListShortcutCell(sheetId, cellId)) {
            return {
                type: "list",
                sheetId: sheetId,
                cellId: cellId,
                items: this.parseListItemsFromMentionValue(value),
                value: value
            };
        }
        return {
            sheetId: sheetId,
            cellId: cellId,
            value: value
        };
    }

    resolveSheetRegionMention(token, rawMode) {
        var match = /^(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))[:!]([A-Za-z]+[0-9]+):([A-Za-z]+[0-9]+)$/.exec(token);
        if (!match) return null;
        var sheetName = match[1] || match[2] || "";
        var startCellId = (match[3] || "").toUpperCase();
        var endCellId = (match[4] || "").toUpperCase();
        var sheetId = this.findSheetIdByName(sheetName);
        if (!sheetId) return null;
        var rows = rawMode
            ? this.readRegionRawValues(sheetId, startCellId, endCellId)
            : this.readRegionValues(sheetId, startCellId, endCellId);
        return {
            type: "region",
            sheetId: sheetId,
            startCellId: startCellId,
            endCellId: endCellId,
            rows: rows,
            value: rows.length ? rows[0].join(", ") : ""
        };
    }

    readRegionValues(sheetId, startCellId, endCellId) {
        var start = this.parseCellId(startCellId);
        var end = this.parseCellId(endCellId);
        if (!start || !end) return [];

        var rowStart = Math.min(start.row, end.row);
        var rowEnd = Math.max(start.row, end.row);
        var colStart = Math.min(start.col, end.col);
        var colEnd = Math.max(start.col, end.col);
        var rows = [];

        for (var row = rowStart; row <= rowEnd; row++) {
            var values = [];
            for (var col = colStart; col <= colEnd; col++) {
                var cellId = this.formatCellId(col, row);
                values.push(this.readCellComputedValue(sheetId, cellId));
            }
            rows.push(values);
        }
        return rows;
    }

    readRegionRawValues(sheetId, startCellId, endCellId) {
        var start = this.parseCellId(startCellId);
        var end = this.parseCellId(endCellId);
        if (!start || !end) return [];

        var rowStart = Math.min(start.row, end.row);
        var rowEnd = Math.max(start.row, end.row);
        var colStart = Math.min(start.col, end.col);
        var colEnd = Math.max(start.col, end.col);
        var rows = [];

        for (var row = rowStart; row <= rowEnd; row++) {
            var values = [];
            for (var col = colStart; col <= colEnd; col++) {
                var cellId = this.formatCellId(col, row);
                values.push(String(this.storage.getCellValue(sheetId, cellId) || ""));
            }
            rows.push(values);
        }
        return rows;
    }

    createReportRegionTableElement(rows) {
        var table = document.createElement("table");
        table.className = "report-region-table";
        var body = document.createElement("tbody");

        var safeRows = Array.isArray(rows) ? rows : [];
        for (var r = 0; r < safeRows.length; r++) {
            var tr = document.createElement("tr");
            var rowValues = Array.isArray(safeRows[r]) ? safeRows[r] : [];
            for (var c = 0; c < rowValues.length; c++) {
                var td = document.createElement("td");
                td.textContent = String(rowValues[c] == null ? "" : rowValues[c]);
                tr.appendChild(td);
            }
            body.appendChild(tr);
        }

        table.appendChild(body);
        return table;
    }

    createReportListElement(items) {
        var list = document.createElement("ul");
        list.className = "report-mentioned-list";
        var values = Array.isArray(items) ? items : [];
        for (var i = 0; i < values.length; i++) {
            var text = String(values[i] == null ? "" : values[i]).trim();
            if (!text) continue;
            var li = document.createElement("li");
            li.textContent = text;
            list.appendChild(li);
        }
        if (!list.childNodes.length) {
            var empty = document.createElement("li");
            empty.textContent = "";
            list.appendChild(empty);
        }
        return list;
    }

    isListShortcutCell(sheetId, cellId) {
        var raw = this.storage.getCellValue(sheetId, String(cellId || "").toUpperCase());
        if (!raw || raw.charAt(0) !== ">") return false;
        return !!this.formulaEngine.parseListShortcutPrompt(raw);
    }

    parseListItemsFromMentionValue(value) {
        return String(value == null ? "" : value)
            .split(/\r?\n/)
            .map(function(line) { return line.trim(); })
            .filter(Boolean);
    }

    findSheetIdByName(sheetName) {
        var target = String(sheetName || "");
        for (var i = 0; i < this.tabs.length; i++) {
            if (this.isReportTab(this.tabs[i].id)) continue;
            if (this.tabs[i].name === target) return this.tabs[i].id;
        }
        var lower = target.toLowerCase();
        for (var j = 0; j < this.tabs.length; j++) {
            if (this.isReportTab(this.tabs[j].id)) continue;
            if (this.tabs[j].name.toLowerCase() === lower) return this.tabs[j].id;
        }
    }

    readCellComputedValue(sheetId, cellId) {
        var normalizedId = String(cellId).toUpperCase();
        var raw = this.storage.getCellValue(sheetId, normalizedId);
        if (raw && raw.charAt(0) !== "=" && raw.charAt(0) !== ">" && raw.charAt(0) !== "#" && raw.charAt(0) !== "'") {
            return String(raw);
        }
        var cache = this.computedValuesBySheet[sheetId];
        if (cache && Object.prototype.hasOwnProperty.call(cache, normalizedId)) {
            return String(cache[normalizedId] == null ? "" : cache[normalizedId]);
        }
        try {
            var value = this.formulaEngine.evaluateCell(sheetId, normalizedId, {});
            return String(value == null ? "" : value);
        } catch (e) {
            return String(raw == null ? "" : raw);
        }
    }

    readCellMentionValue(sheetId, cellId) {
        try {
            var value = this.formulaEngine.getMentionValue(sheetId, String(cellId).toUpperCase(), {});
            return String(value == null ? "" : value);
        } catch (e) {
            return this.readCellComputedValue(sheetId, cellId);
        }
    }

    readLinkedInputValue(sheetId, cellId) {
        var targetCellId = String(cellId).toUpperCase();
        var raw = this.storage.getCellValue(sheetId, targetCellId);
        if (raw && raw.charAt(0) !== "=" && raw.charAt(0) !== ">") return String(raw);
        return this.readCellComputedValue(sheetId, targetCellId);
    }

    syncCellNameInput() {
        if (!this.activeInput) {
            this.cellNameInput.value = "";
            return;
        }
        this.cellNameInput.value = this.storage.getCellNameFor(this.activeSheetId, this.activeInput.id) || "";
    }

    applyActiveCellName() {
        if (!this.activeInput) {
            alert("Select a cell first.");
            return;
        }

        var rangeRef = null;
        if (this.selectionRange && (
            this.selectionRange.startCol !== this.selectionRange.endCol ||
            this.selectionRange.startRow !== this.selectionRange.endRow
        )) {
            rangeRef = {
                startCellId: this.formatCellId(this.selectionRange.startCol, this.selectionRange.startRow),
                endCellId: this.formatCellId(this.selectionRange.endCol, this.selectionRange.endRow)
            };
        }
        this.captureHistorySnapshot("named-cell:" + this.activeSheetId);
        var result = this.storage.setCellName(this.activeSheetId, this.activeInput.id, this.cellNameInput.value, rangeRef);
        if (!result.ok) {
            alert(result.error);
        }
        this.syncCellNameInput();
        this.refreshNamedCellJumpOptions();
        this.computeAll();
    }

    refreshNamedCellJumpOptions() {
        if (!this.namedCellJump) return;
        var select = this.namedCellJump;
        var namedCells = this.storage.readNamedCells();
        var items = [];

        for (var key in namedCells) {
            if (!Object.prototype.hasOwnProperty.call(namedCells, key)) continue;
            var ref = namedCells[key];
            if (!ref || !ref.sheetId) continue;
            if (!ref.cellId && !(ref.startCellId && ref.endCellId)) continue;
            var tab = this.findTabById(ref.sheetId);
            if (!tab || this.isReportTab(ref.sheetId)) continue;
            items.push({
                name: key,
                sheetId: ref.sheetId,
                cellId: ref.cellId ? String(ref.cellId).toUpperCase() : "",
                startCellId: ref.startCellId ? String(ref.startCellId).toUpperCase() : "",
                endCellId: ref.endCellId ? String(ref.endCellId).toUpperCase() : "",
                sheetName: tab.name
            });
        }

        items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

        select.innerHTML = "";
        var placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "";
        select.appendChild(placeholder);

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var option = document.createElement("option");
            option.value = item.name;
            var location = item.cellId || ((item.startCellId && item.endCellId) ? (item.startCellId + ":" + item.endCellId) : "");
            option.textContent = item.name + " (" + item.sheetName + "!" + location + ")";
            select.appendChild(option);
        }
        select.value = "";
        select.disabled = items.length === 0;
    }

    navigateToNamedCell(name) {
        var ref = this.storage.resolveNamedCell(name);
        if (!ref || !ref.sheetId) return;
        if (this.isReportTab(ref.sheetId)) return;

        var targetCellId = ref.cellId
            ? String(ref.cellId).toUpperCase()
            : (ref.startCellId ? String(ref.startCellId).toUpperCase() : "");
        if (!targetCellId) return;
        if (this.activeSheetId !== ref.sheetId) {
            this.switchToSheet(ref.sheetId);
        }
        var targetInput = this.inputById[targetCellId];
        if (!targetInput) return;
        this.setActiveInput(targetInput);
        targetInput.focus();
    }

    renderTabs() {
        this.tabsContainer.innerHTML = "";

        this.tabs.forEach((tab) => {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "tab-button" + (tab.id === this.activeSheetId ? " active" : "");
            button.innerHTML = "";
            if (this.isReportTab(tab.id)) {
                var icon = document.createElement("span");
                icon.className = "tab-doc-icon";
                icon.textContent = "📄";
                button.appendChild(icon);
            }
            var label = document.createElement("span");
            label.textContent = tab.name;
            button.appendChild(label);
            button.addEventListener("click", () => this.onTabButtonClick(tab.id));
            button.addEventListener("dblclick", (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.renameTabById(tab.id);
            });
            var canDrag = true;
            button.draggable = canDrag;
            if (canDrag) {
                button.addEventListener("dragstart", (e) => this.onTabDragStart(e, tab.id));
                button.addEventListener("dragend", () => this.onTabDragEnd());
                button.addEventListener("dragover", (e) => this.onTabDragOver(e, tab.id));
                button.addEventListener("drop", (e) => this.onTabDrop(e, tab.id));
            }
            this.tabsContainer.appendChild(button);
        });
        this.refreshNamedCellJumpOptions();
    }

    onTabDragStart(event, tabId) {
        this.dragTabId = tabId;
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", tabId);
        }
        var target = event.currentTarget;
        if (target && target.classList) target.classList.add("dragging");
    }

    onTabDragEnd() {
        this.dragTabId = null;
        var dragging = this.tabsContainer.querySelector(".tab-button.dragging");
        if (dragging) dragging.classList.remove("dragging");
    }

    onTabDragOver(event, targetTabId) {
        if (!this.dragTabId || this.dragTabId === targetTabId) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    }

    onTabDrop(event, targetTabId) {
        event.preventDefault();
        var dragId = this.dragTabId || (event.dataTransfer && event.dataTransfer.getData("text/plain"));
        this.onTabDragEnd();
        if (!dragId || dragId === targetTabId) return;
        this.reorderTabs(dragId, targetTabId);
    }

    reorderTabs(dragId, targetId) {
        var dragIndex = this.tabs.findIndex((tab) => tab.id === dragId);
        var targetIndex = this.tabs.findIndex((tab) => tab.id === targetId);
        if (dragIndex < 0 || targetIndex < 0) return;
        this.captureHistorySnapshot("tabs");

        var moving = this.tabs[dragIndex];
        this.tabs.splice(dragIndex, 1);
        var nextTargetIndex = this.tabs.findIndex((tab) => tab.id === targetId);
        this.tabs.splice(nextTargetIndex, 0, moving);
        this.storage.saveTabs(this.tabs);
        this.renderTabs();
    }

    addTab() {
        var sheetCount = this.tabs.filter((tab) => !this.isReportTab(tab.id)).length;
        var defaultName = "Sheet " + (sheetCount + 1);
        var name = prompt("New tab name", defaultName);
        if (name === null) return;

        name = name.trim() || defaultName;
        var tab = { id: this.storage.makeSheetId(), name: name, type: "sheet" };
        this.captureHistorySnapshot("tabs");

        var insertAt = this.tabs.findIndex((item) => this.isReportTab(item.id));
        if (insertAt < 0) insertAt = this.tabs.length;
        this.tabs.splice(insertAt, 0, tab);
        this.storage.saveTabs(this.tabs);
        this.switchToSheet(tab.id);
    }

    addReportTab() {
        var reportCount = this.tabs.filter((tab) => this.isReportTab(tab.id)).length;
        var defaultName = reportCount < 1 ? "Report" : ("Report " + (reportCount + 1));
        var name = prompt("New report name", defaultName);
        if (name === null) return;
        name = name.trim() || defaultName;

        var tab = { id: "report-" + Date.now() + "-" + Math.floor(Math.random() * 10000), name: name, type: "report" };
        this.captureHistorySnapshot("tabs");
        this.tabs.push(tab);
        this.storage.saveTabs(this.tabs);
        this.switchToSheet(tab.id);
    }

    renameActiveTab() {
        var active = this.findTabById(this.activeSheetId);
        if (!active) return;
        if (this.isReportTab(active.id)) return;
        this.renameTabById(active.id);
    }

    renameTabById(tabId) {
        var active = this.findTabById(tabId);
        if (!active) return;

        var name = prompt("Rename tab", active.name);
        if (name === null) return;

        name = name.trim();
        if (!name) return;

        this.captureHistorySnapshot("tabs");
        var oldName = active.name;
        active.name = name;

        this.storage.saveTabs(this.tabs);
        this.storage.rewriteFormulaReferencesOnRename(oldName, name);

        this.renderTabs();
        this.refreshNamedCellJumpOptions();
        this.computeAll();
    }

    deleteActiveTab() {
        var sheetCount = this.tabs.filter((tab) => !this.isReportTab(tab.id)).length;
        var active = this.findTabById(this.activeSheetId);
        if (!active) return;
        var deletingSheet = !this.isReportTab(active.id);

        if (deletingSheet && sheetCount <= 1) {
            alert("At least one tab is required.");
            return;
        }

        if (!confirm("Delete tab '" + active.name + "'?")) return;
        this.captureHistorySnapshot("tabs");

        this.storage.clearSheetStorage(active.id);
        this.tabs = this.tabs.filter(function(tab) { return tab.id !== active.id; });
        this.storage.saveTabs(this.tabs);
        this.refreshNamedCellJumpOptions();

        var fallback = this.tabs.find((tab) => !this.isReportTab(tab.id)) || this.tabs[0];
        if (fallback) this.switchToSheet(fallback.id);
    }

    switchToSheet(sheetId) {
        if (!this.findTabById(sheetId)) return;
        var keepCrossMention = !!(this.crossTabMentionContext && sheetId !== this.crossTabMentionContext.sourceSheetId && !this.isReportTab(sheetId));

        this.clearActiveInput();
        this.activeSheetId = sheetId;
        this.storage.setActiveSheetId(sheetId);
        if (this.onActiveSheetChange) this.onActiveSheetChange(sheetId);

        this.renderTabs();
        this.applyViewMode();
        if (this.isReportActive()) {
            if (this.reportEditor) {
                this.reportEditor.innerHTML = this.storage.getReportContent(this.activeSheetId) || "<p></p>";
            }
            this.setReportMode("view");
        }
        this.applyActiveSheetLayout();
        this.updateSortIcons();
        this.syncCellNameInput();
        this.computeAll();
        this.ensureActiveCell();
        if (keepCrossMention) this.restoreCrossTabMentionEditor();
    }

    computeAll() {
        var options = arguments.length > 0 ? arguments[0] : {};
        if (this.isReportActive()) {
            this.renderReportLiveValues();
            return;
        }
        if (!options.forceRefreshAI && this.hasPendingLocalEdit()) {
            return;
        }
        this.ensureActiveCell();

        var formulaCount = 0;
        for (var i = 0; i < this.inputs.length; i++) {
            var probeRaw = this.getRawCellValue(this.inputs[i].id);
            if (probeRaw && (probeRaw.charAt(0) === "=" || probeRaw.charAt(0) === ">" || probeRaw.charAt(0) === "#" || probeRaw.charAt(0) === "'")) formulaCount++;
        }
        var formulaDone = 0;
        this.updateCalcProgress(0, formulaCount);

        var didResort = this.applyAutoResort();
        var requestToken = ++this.computeRequestToken;
        var activeSheetId = this.activeSheetId;
        Meteor.callAsync("sheets.computeGrid", this.sheetDocumentId, activeSheetId, {
            forceRefreshAI: !!options.forceRefreshAI,
            workbookSnapshot: this.storage && this.storage.storage && typeof this.storage.storage.snapshot === "function"
                ? this.storage.storage.snapshot()
                : {}
        }).then((result) => {
            if (requestToken !== this.computeRequestToken) return;
            if (activeSheetId !== this.activeSheetId) return;

            if (result && result.workbook && this.storage.storage && typeof this.storage.storage.replaceAll === "function") {
                this.storage.storage.replaceAll(result.workbook);
            }

            if (result && result.workbook) {
                this.ensureGridCapacityForStorage(result.workbook);
            }

            this.computedValuesBySheet[activeSheetId] = result && result.values ? result.values : {};
            var computedValues = this.computedValuesBySheet[activeSheetId] || {};
            var renderFn = () => {
                this.inputs.forEach((input) => {
                    try {
                        var raw = this.getRawCellValue(input.id);
                        var attachment = this.parseAttachmentSource(raw);
                        var isFormula = !!raw && (raw.charAt(0) === "=" || raw.charAt(0) === ">" || raw.charAt(0) === "#" || raw.charAt(0) === "'");
                        var storedDisplay = this.storage.getCellDisplayValue(this.activeSheetId, input.id);
                        var errorHint = this.storage.getCellError(this.activeSheetId, input.id);
                        var value = isFormula && Object.prototype.hasOwnProperty.call(computedValues, input.id)
                            ? computedValues[input.id]
                            : raw;
                        var isEditing = document.activeElement === input;
                        var literalDisplay = !!raw && raw.charAt(0) === "#";
                        var displayValue = value;
                        if (attachment) {
                            displayValue = String(attachment.name || (attachment.pending ? "Select file" : "Attached file"));
                        }
                        if (String(displayValue || "").indexOf("#AI_ERROR:") === 0) {
                            displayValue = String(displayValue).replace(/^#AI_ERROR:\s*/i, "") || "AI error";
                            if (!errorHint) errorHint = String(displayValue || "");
                        }
                        if (isFormula && String(displayValue == null ? "" : displayValue) === "" && storedDisplay) {
                            displayValue = storedDisplay;
                        }
                        input.parentElement.classList.toggle("manual-formula", this.aiService.getMode() === AI_MODE.manual && isFormula);
                        input.parentElement.classList.toggle("has-formula", isFormula);
                        input.parentElement.classList.toggle("has-display-value", String(displayValue == null ? "" : displayValue) !== "");
                        input.parentElement.classList.toggle("has-attachment", !!attachment);
                        input.parentElement.classList.toggle("has-error", !!errorHint);
                        if (errorHint) {
                            input.parentElement.setAttribute("data-error-hint", errorHint);
                        } else {
                            input.parentElement.removeAttribute("data-error-hint");
                        }
                        this.grid.renderCellValue(input, displayValue, isEditing, isFormula, {
                            literal: literalDisplay,
                            attachment: attachment,
                            error: !!errorHint
                        });
                        if (isFormula) {
                            formulaDone++;
                            this.updateCalcProgress(formulaDone, formulaCount);
                        }
                    } catch (e) {
                        input.parentElement.classList.remove("manual-formula");
                        input.parentElement.classList.remove("has-formula");
                        input.parentElement.classList.remove("has-display-value");
                        input.parentElement.classList.remove("has-attachment");
                        input.parentElement.classList.remove("has-error");
                        input.parentElement.removeAttribute("data-error-hint");
                    }
                });
            };
            if (didResort) this.runWithAISuppressed(renderFn);
            else renderFn();
            this.applyRightOverflowText();

            if (this.activeInput && !this.hasPendingLocalEdit()) {
                this.formulaInput.value = this.getRawCellValue(this.activeInput.id);
            }

            this.renderReportLiveValues();
            this.finishCalcProgress(formulaCount);
        }).catch((error) => {
            console.error("[sheet] computeAll failed", error);
            this.finishCalcProgress(formulaCount);
        });
    }

    applyRightOverflowText() {
        var cellHasVisibleContent = (td, input) => {
            if (!td || !input) return false;
            var raw = String(this.getRawCellValue(input.id) || "").trim();
            if (raw !== "") return true;

            var shown = String(td.dataset.computedValue == null ? "" : td.dataset.computedValue).trim();
            if (shown !== "") return true;

            if (td.classList.contains("has-display-value") || td.classList.contains("has-formula")) return true;

            var output = td.querySelector(".cell-output");
            var rendered = output ? String(output.textContent || "").trim() : "";
            return rendered !== "";
        };

        var clearState = (input) => {
            var output = input && input.parentElement ? input.parentElement.querySelector(".cell-output") : null;
            if (!output) return;
            output.classList.remove("spill-overflow");
            output.style.width = "";
            input.parentElement.classList.remove("spill-covered");
            input.parentElement.classList.remove("spill-source");
        };

        this.inputs.forEach((input) => clearState(input));

        for (var rowIndex = 1; rowIndex < this.table.rows.length; rowIndex++) {
            var row = this.table.rows[rowIndex];
            for (var colIndex = 1; colIndex < row.cells.length; colIndex++) {
                var td = row.cells[colIndex];
                var input = td.querySelector("input");
                if (!input) continue;
                if (this.isEditingCell(input)) continue;

                var output = td.querySelector(".cell-output");
                if (!output) continue;
                if (output.querySelector("table")) continue;

                var value = String(td.dataset.computedValue == null ? "" : td.dataset.computedValue);
                if (!value || value.indexOf("\n") !== -1) continue;

                var immediateNext = row.cells[colIndex + 1];
                if (!immediateNext) continue;
                var immediateNextInput = immediateNext.querySelector("input");
                if (!immediateNextInput) continue;
                if (this.isEditingCell(immediateNextInput)) continue;
                if (cellHasVisibleContent(immediateNext, immediateNextInput)) continue;

                var baseWidth = td.clientWidth;
                output.classList.add("spill-overflow");
                output.style.width = baseWidth + "px";
                var requiredWidth = this.measureOutputRequiredWidth(output);
                if (requiredWidth <= baseWidth + 1) {
                    output.classList.remove("spill-overflow");
                    output.style.width = "";
                    continue;
                }

                var spanWidth = td.offsetWidth;
                var coveredCells = [];
                for (var nextCol = colIndex + 1; nextCol < row.cells.length; nextCol++) {
                    var nextTd = row.cells[nextCol];
                    var nextInput = nextTd.querySelector("input");
                    if (!nextInput) break;
                    if (this.isEditingCell(nextInput)) break;
                    if (cellHasVisibleContent(nextTd, nextInput)) break;
                    spanWidth += nextTd.offsetWidth;
                    coveredCells.push(nextTd);
                }

                if (spanWidth <= baseWidth) {
                    output.classList.remove("spill-overflow");
                    output.style.width = "";
                    continue;
                }
                output.style.width = Math.min(spanWidth, requiredWidth) + "px";
                td.classList.add("spill-source");
                for (var c = 0; c < coveredCells.length; c++) {
                    coveredCells[c].classList.add("spill-covered");
                }
            }
        }
    }

    measureOutputRequiredWidth(output) {
        if (!output) return 0;
        var probe = output.cloneNode(true);
        probe.classList.add("spill-overflow");
        probe.style.position = "fixed";
        probe.style.left = "-99999px";
        probe.style.top = "0";
        probe.style.width = "auto";
        probe.style.maxWidth = "none";
        probe.style.visibility = "hidden";
        probe.style.pointerEvents = "none";
        probe.style.overflow = "visible";
        probe.style.whiteSpace = "nowrap";
        document.body.appendChild(probe);
        var width = Math.ceil(probe.scrollWidth || probe.offsetWidth || 0);
        probe.remove();
        return width;
    }

    hasUncomputedCells() {
        if (this.isReportActive()) return false;
        for (var i = 0; i < this.inputs.length; i++) {
            var input = this.inputs[i];
            var raw = this.getRawCellValue(input.id);
            if (!raw || (raw.charAt(0) !== "=" && raw.charAt(0) !== ">")) continue;

            var output = input.parentElement.querySelector(".cell-output");
            var shown = output ? String(output.textContent || "").trim() : "";
            if (shown === "...") return true;
        }
        return false;
    }

    startUncomputedMonitor() {
        if (this.uncomputedMonitorId) clearInterval(this.uncomputedMonitorId);

        this.uncomputedMonitorId = setInterval(() => {
            if (this.hasPendingLocalEdit()) return;
            if (this.aiService.hasInFlightWork()) return;
            if (!this.hasUncomputedCells()) return;
            this.computeAll();
        }, this.uncomputedMonitorMs);
    }
}

export function mountSpreadsheetApp() {
    var options = arguments.length > 0 ? arguments[0] : {};
    return new SpreadsheetApp(options);
}
