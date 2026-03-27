import { setupViewportRendering as setupViewportRenderingRuntime } from './viewport-render-runtime.js';
import { attachSheetEventSubscription } from './sheet-events-runtime.js';

export function setupSpreadsheetAppBehavior(app) {
  app.setupColumnSort();
  app.setupGridResizing();
  app.setupButtons();
  app.setupAIModeControls();
  app.setupDisplayModeControls();
  app.setupCellFormatControls();
  app.setupCellPresentationControls();
  app.setupRegionRecordingControls();
  app.setupCellNameControls();
  app.setupAttachmentControls();
  app.setupAssistantPanel();
  app.setupFormulaTrackerPanel();
  app.setupEditorOverlay();
  app.bindGridInputEvents();
  app.bindHeaderSelectionEvents();
  app.bindFormulaBarEvents();
  app.setupMentionAutocomplete();
  app.setupContextMenu();
  app.setupAttachmentLinkPreview();
  if (typeof app.detachSheetEventSubscription === 'function') {
    app.detachSheetEventSubscription();
  }
  app.detachSheetEventSubscription = attachSheetEventSubscription(app);
  setupViewportRenderingRuntime(app);
  app.startUncomputedMonitor();
  app.renderTabs();
  app.applyViewMode();
  if (app.isReportActive()) {
    app.setupReportControls();
  }
  app.applyActiveSheetLayout();
  app.renderCurrentSheetFromStorage();
  app.ensureActiveCell();
  if (typeof app.publishUiState === 'function') {
    app.publishUiState();
  }
  if (
    !app.isReportActive() &&
    typeof app.hasUncomputedCells === 'function' &&
    app.hasUncomputedCells()
  ) {
    if (!app) return;
    if (typeof app.hasPendingLocalEdit === 'function' && app.hasPendingLocalEdit()) {
      return;
    }
    if (typeof app.refreshVisibleSheetFromServer === 'function') {
      app.refreshVisibleSheetFromServer({
        bypassPendingEdit: true,
        forceRefreshAI: false,
        skipExpectedRevision: true,
      });
      return;
    }
    if (typeof app.computeAll !== 'function') return;
    app.computeAll({
      bypassPendingEdit: true,
      forceRefreshAI: false,
      skipExpectedRevision: true,
    });
  }
}
