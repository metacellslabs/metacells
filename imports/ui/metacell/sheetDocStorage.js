import { Meteor } from 'meteor/meteor';
import { WorkbookStorageAdapter } from './runtime/workbook-storage-adapter.js';

class SheetDocStorageCore extends WorkbookStorageAdapter {
  constructor(sheetId, initialWorkbook) {
    super(initialWorkbook);
    this.sheetId = sheetId;
    this.flushTimer = null;
    this.flushDelayMs = 250;
    this.localRevision = 0;
    this.persistedRevision = 0;
    this.saveInFlight = false;
  }

  scheduleFlush() {
    this.localRevision += 1;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    const targetRevision = this.localRevision;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.saveInFlight = true;
      Meteor.callAsync('sheets.saveWorkbook', this.sheetId, this.snapshot())
        .then(() => {
          this.persistedRevision = Math.max(
            this.persistedRevision,
            targetRevision,
          );
        })
        .catch((error) => {
          console.error('Failed to save workbook', error);
        })
        .finally(() => {
          this.saveInFlight = false;
        });
    }, this.flushDelayMs);
  }

  replaceAll(nextWorkbook) {
    super.replaceAll(nextWorkbook);
    this.persistedRevision = this.localRevision;
    this.saveInFlight = false;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  hasPendingPersistence() {
    return (
      !!this.flushTimer ||
      this.saveInFlight ||
      this.persistedRevision < this.localRevision
    );
  }

  setCellSource(sheetId, cellId, value, meta) {
    super.setCellSource(sheetId, cellId, value, meta);
    this.scheduleFlush();
  }

  setComputedCellValue(sheetId, cellId, value, state) {
    super.setComputedCellValue(sheetId, cellId, value, state);
    this.scheduleFlush();
  }

  setCellRuntimeState(sheetId, cellId, updates) {
    super.setCellRuntimeState(sheetId, cellId, updates);
    this.scheduleFlush();
  }

  setCellFormat(sheetId, cellId, format) {
    super.setCellFormat(sheetId, cellId, format);
    this.scheduleFlush();
  }

  setCellPresentation(sheetId, cellId, presentation) {
    super.setCellPresentation(sheetId, cellId, presentation);
    this.scheduleFlush();
  }

  setCellSchedule(sheetId, cellId, schedule) {
    super.setCellSchedule(sheetId, cellId, schedule);
    this.scheduleFlush();
  }

  setCellDependencies(sheetId, cellId, dependencies) {
    super.setCellDependencies(sheetId, cellId, dependencies);
    this.scheduleFlush();
  }

  clearCellDependencies(sheetId, cellId) {
    super.clearCellDependencies(sheetId, cellId);
    this.scheduleFlush();
  }

  setColumnWidth(sheetId, colIndex, width) {
    super.setColumnWidth(sheetId, colIndex, width);
    this.scheduleFlush();
  }

  clearColumnWidth(sheetId, colIndex) {
    super.clearColumnWidth(sheetId, colIndex);
    this.scheduleFlush();
  }

  setRowHeight(sheetId, rowIndex, height) {
    super.setRowHeight(sheetId, rowIndex, height);
    this.scheduleFlush();
  }

  setTabs(tabs) {
    super.setTabs(tabs);
    this.scheduleFlush();
  }

  setActiveTabId(sheetId) {
    super.setActiveTabId(sheetId);
    this.scheduleFlush();
  }

  setAIMode(mode) {
    super.setAIMode(mode);
    this.scheduleFlush();
  }

  setReportContent(tabId, content) {
    super.setReportContent(tabId, content);
    this.scheduleFlush();
  }

  setNamedCells(namedCells) {
    super.setNamedCells(namedCells);
    this.scheduleFlush();
  }

  setCacheValue(key, value) {
    super.setCacheValue(key, value);
    this.scheduleFlush();
  }

  removeCacheValue(key) {
    super.removeCacheValue(key);
    this.scheduleFlush();
  }

  clearSheet(sheetId) {
    super.clearSheet(sheetId);
    this.scheduleFlush();
  }
}

export function createSheetDocStorage(sheetId, initialWorkbook) {
  return new SheetDocStorageCore(sheetId, initialWorkbook);
}
