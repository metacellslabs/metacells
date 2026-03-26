import { rpc } from '../../../lib/rpc-client.js';
import { WorkbookStorageAdapter } from './runtime/workbook-storage-adapter.js';
import { buildClientWorkbookSnapshot } from '../../api/sheets/workbook-codec.js';

class SheetDocStorageCore extends WorkbookStorageAdapter {
  constructor(sheetId, initialWorkbook, options) {
    super(initialWorkbook);
    const opts = options && typeof options === 'object' ? options : {};
    this.sheetId = sheetId;
    this.flushTimer = null;
    this.flushDelayMs = 250;
    this.localRevision = 0;
    this.persistedRevision = 0;
    this.saveInFlight = false;
    this.documentRevision = String(opts.initialDocumentRevision || '');
    this.onDocumentRevisionChange =
      typeof opts.onDocumentRevisionChange === 'function'
        ? opts.onDocumentRevisionChange
        : null;
    this.onRevisionConflict =
      typeof opts.onRevisionConflict === 'function'
        ? opts.onRevisionConflict
        : null;
  }

  getDocumentRevision() {
    return String(this.documentRevision || '');
  }

  shouldAcceptDocumentRevision(revision) {
    const nextRevision = String(revision || '');
    const currentRevision = String(this.documentRevision || '');
    if (!nextRevision) return false;
    if (!currentRevision) return true;
    if (nextRevision === currentRevision) return false;
    const currentTime = Date.parse(currentRevision);
    const nextTime = Date.parse(nextRevision);
    if (Number.isFinite(currentTime) && Number.isFinite(nextTime)) {
      return nextTime >= currentTime;
    }
    return nextRevision >= currentRevision;
  }

  setDocumentRevision(revision) {
    const nextRevision = String(revision || '');
    if (!this.shouldAcceptDocumentRevision(nextRevision)) return;
    this.documentRevision = nextRevision;
    if (typeof this.onDocumentRevisionChange === 'function') {
      this.onDocumentRevisionChange(nextRevision);
    }
  }

  scheduleFlush() {
    this.localRevision += 1;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    const runFlush = (targetRevision) => {
      this.flushTimer = null;
      if (this.saveInFlight) {
        this.flushTimer = setTimeout(() => {
          runFlush(this.localRevision);
        }, this.flushDelayMs);
        return;
      }
      this.saveInFlight = true;
      const documentSnapshot = buildClientWorkbookSnapshot(this.snapshot());
      documentSnapshot.caches = {};
      rpc(
        'sheets.saveWorkbook',
        this.sheetId,
        documentSnapshot,
        {
          expectedRevision: this.getDocumentRevision(),
        },
      )
        .then((result) => {
          this.persistedRevision = Math.max(
            this.persistedRevision,
            targetRevision,
          );
          if (result && result.revision) {
            this.setDocumentRevision(result.revision);
          }
          return result;
        })
        .catch((error) => {
          var isConflict =
            error &&
            String(error.error || '').trim().toLowerCase() === 'conflict';
          if (isConflict) {
            var nextRevision = String(
              (error &&
                error.details &&
                (error.details.documentRevision || error.details.revision)) ||
                '',
            );
            if (nextRevision) {
              this.setDocumentRevision(nextRevision);
            }
            if (typeof this.onRevisionConflict === 'function') {
              this.onRevisionConflict(error);
            }
            if (this.persistedRevision < this.localRevision) {
              this.scheduleFlush();
            }
            return;
          }
          console.error('Failed to save workbook', error);
        })
        .finally(() => {
          this.saveInFlight = false;
          if (!this.flushTimer && this.persistedRevision < this.localRevision) {
            this.flushTimer = setTimeout(() => {
              runFlush(this.localRevision);
            }, this.flushDelayMs);
          }
        });
    };

    const targetRevision = this.localRevision;
    this.flushTimer = setTimeout(() => {
      runFlush(targetRevision);
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

  setComputedCellValue(sheetId, cellId, value, state, errorMessage, meta) {
    super.setComputedCellValue(
      sheetId,
      cellId,
      value,
      state,
      errorMessage,
      meta,
    );
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

  setCellDependencies(sheetId, cellId, dependencies) {
    super.setCellDependencies(sheetId, cellId, dependencies);
  }

  clearCellDependencies(sheetId, cellId) {
    super.clearCellDependencies(sheetId, cellId);
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
  }

  removeCacheValue(key) {
    super.removeCacheValue(key);
  }

  clearSheet(sheetId) {
    super.clearSheet(sheetId);
    this.scheduleFlush();
  }
}

export function createSheetDocStorage(sheetId, initialWorkbook, options) {
  return new SheetDocStorageCore(sheetId, initialWorkbook, options);
}
