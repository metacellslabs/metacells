import { FormulaEngine } from "../../../ui/metacell/runtime/formula-engine.js";
import { AIService } from "../../../ui/metacell/runtime/ai-service.js";
import { StorageService } from "../../../ui/metacell/runtime/storage-service.js";
import { GRID_COLS, GRID_ROWS } from "../../../ui/metacell/runtime/constants.js";
import { WorkbookStorageAdapter, createEmptyWorkbook } from "../../../ui/metacell/runtime/workbook-storage-adapter.js";

function columnIndexToLabel(index) {
  let n = index;
  let label = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function columnLabelToIndex(label) {
  let result = 0;
  for (let i = 0; i < label.length; i += 1) {
    result = result * 26 + (label.charCodeAt(i) - 64);
  }
  return result;
}

function buildCellIds(workbookData) {
  const ids = [];
  let maxRow = GRID_ROWS;
  let maxCol = GRID_COLS;
  const workbook = workbookData && typeof workbookData === "object" ? workbookData : createEmptyWorkbook();
  const sheets = workbook.sheets && typeof workbook.sheets === "object" ? workbook.sheets : {};

  Object.keys(sheets).forEach((sheetId) => {
    const cells = sheets[sheetId] && typeof sheets[sheetId].cells === "object" ? sheets[sheetId].cells : {};
    Object.keys(cells).forEach((cellId) => {
      const match = /^([A-Za-z]+)([0-9]+)$/.exec(String(cellId || "").toUpperCase());
      if (!match) return;
      const col = columnLabelToIndex(match[1]);
      const row = parseInt(match[2], 10);
      if (!Number.isNaN(col) && col > maxCol) maxCol = col;
      if (!Number.isNaN(row) && row > maxRow) maxRow = row;
    });
  });

  for (let row = 1; row <= maxRow; row += 1) {
    for (let col = 1; col <= maxCol; col += 1) {
      ids.push(`${columnIndexToLabel(col)}${row}`);
    }
  }

  return ids;
}

class MemoryWorkbookStorage extends WorkbookStorageAdapter {}

function inferComputedCellState(rawValue, computedValue) {
  const raw = String(rawValue || "");
  const value = String(computedValue == null ? "" : computedValue);

  if (!raw) return "resolved";
  if (value === "#REF!" || value === "#ERROR") return "error";
  if (value.indexOf("#AI_ERROR:") === 0) return "error";
  if (raw.charAt(0) === "'" || raw.charAt(0) === ">" || raw.charAt(0) === "#") {
    if (value === "..." || value === "(manual: click Update)") return "pending";
    return "resolved";
  }
  if (raw.charAt(0) === "=") {
    if (value === "..." || value === "(manual: click Update)") return "pending";
    return "resolved";
  }
  return "resolved";
}

function normalizeComputeError(error) {
  const message = error && error.message ? String(error.message) : String(error || "Formula error");
  return message || "Formula error";
}

function classifyComputeFailure(error) {
  const message = normalizeComputeError(error);
  if (/^Unknown sheet:/i.test(message) || /^Unknown cell name:/i.test(message)) {
    return {
      value: "#REF!",
      error: message,
    };
  }
  return {
    value: "#ERROR",
    error: message,
  };
}

export async function computeSheetSnapshot({
  sheetDocumentId,
  workbookData,
  activeSheetId,
  persistWorkbook,
  forceRefreshAI = false,
}) {
  const rawStorage = new MemoryWorkbookStorage(workbookData);
  const storageService = new StorageService(rawStorage);
  const tabs = storageService.readTabs();
  const sheetTabIds = tabs
    .filter((tab) => tab && tab.type === "sheet")
    .map((tab) => String(tab.id || ""))
    .filter(Boolean);
  const orderedSheetIds = [];

  if (activeSheetId && sheetTabIds.indexOf(activeSheetId) !== -1) {
    orderedSheetIds.push(activeSheetId);
  }
  for (let i = 0; i < sheetTabIds.length; i += 1) {
    if (orderedSheetIds.indexOf(sheetTabIds[i]) === -1) {
      orderedSheetIds.push(sheetTabIds[i]);
    }
  }

  const saveSnapshot = async (computedValues, computedErrors) => {
    if (typeof persistWorkbook !== "function") return;
    if (computedValues && typeof computedValues === "object") {
      Object.keys(computedValues).forEach((sheetId) => {
        const sheetValues = computedValues[sheetId];
        if (!sheetValues || typeof sheetValues !== "object") return;
        Object.keys(sheetValues).forEach((cellId) => {
          const rawValue = storageService.getCellValue(sheetId, cellId);
          const errorMessage = computedErrors
            && computedErrors[sheetId]
            && Object.prototype.hasOwnProperty.call(computedErrors[sheetId], cellId)
            ? computedErrors[sheetId][cellId]
            : "";
          storageService.setComputedCellValue(
            sheetId,
            cellId,
            sheetValues[cellId],
            inferComputedCellState(rawValue, sheetValues[cellId]),
            errorMessage,
          );
        });
      });
    }
    await persistWorkbook(rawStorage.snapshot());
  };

  const aiService = new AIService(storageService, () => {
    const asyncComputedValues = {};
    const asyncComputedErrors = {};
    for (let i = 0; i < orderedSheetIds.length; i += 1) {
      const sheetId = orderedSheetIds[i];
      const evaluationPlan = typeof formulaEngine.buildEvaluationPlan === "function"
        ? formulaEngine.buildEvaluationPlan(sheetId)
        : formulaEngine.cellIds;
      asyncComputedValues[sheetId] = {};
      asyncComputedErrors[sheetId] = {};
      for (let cellIndex = 0; cellIndex < evaluationPlan.length; cellIndex += 1) {
        const cellId = evaluationPlan[cellIndex];
        try {
          asyncComputedValues[sheetId][cellId] = formulaEngine.evaluateCell(sheetId, cellId, {}, { forceRefreshAI });
        } catch (error) {
          const failure = classifyComputeFailure(error);
          asyncComputedValues[sheetId][cellId] = failure.value;
          asyncComputedErrors[sheetId][cellId] = failure.error;
        }
      }
    }
    saveSnapshot(asyncComputedValues, asyncComputedErrors).catch((error) => {
      console.error("[sheet.compute] failed to persist async AI update", error);
    });
  }, {
    sheetDocumentId,
    getActiveSheetId: () => activeSheetId,
  });

  const formulaEngine = new FormulaEngine(
    storageService,
    aiService,
    () => storageService.readTabs(),
    buildCellIds(workbookData),
  );

  const valuesBySheet = {};
  const errorsBySheet = {};

  for (let sheetIndex = 0; sheetIndex < orderedSheetIds.length; sheetIndex += 1) {
    const sheetId = orderedSheetIds[sheetIndex];
    const sheetValues = {};
    const sheetErrors = {};
    const evaluationPlan = typeof formulaEngine.buildEvaluationPlan === "function"
      ? formulaEngine.buildEvaluationPlan(sheetId)
      : formulaEngine.cellIds;

    for (let i = 0; i < evaluationPlan.length; i += 1) {
      const cellId = evaluationPlan[i];
      try {
        sheetValues[cellId] = formulaEngine.evaluateCell(sheetId, cellId, {}, { forceRefreshAI });
      } catch (error) {
        const failure = classifyComputeFailure(error);
        sheetValues[cellId] = failure.value;
        sheetErrors[cellId] = failure.error;
      }
    }

    valuesBySheet[sheetId] = sheetValues;
    errorsBySheet[sheetId] = sheetErrors;
  }

  await saveSnapshot(valuesBySheet, errorsBySheet);
  return { values: valuesBySheet[activeSheetId] || {}, valuesBySheet, workbook: rawStorage.snapshot() };
}
