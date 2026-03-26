import { cleanupViewportRendering as cleanupViewportRenderingRuntime } from './viewport-render-runtime.js';

export function destroySpreadsheetAppRuntime(app) {
  if (typeof app.detachSheetEventSubscription === 'function') {
    app.detachSheetEventSubscription();
    app.detachSheetEventSubscription = null;
  }
  app.syncServerEditLock(false);
  if (typeof app.hideEditorOverlay === 'function') {
    app.hideEditorOverlay();
  }
  app.hideFloatingAttachmentPreview();
  cleanupViewportRenderingRuntime(app);
  if (app.attachmentPreviewTimer) {
    clearTimeout(app.attachmentPreviewTimer);
    app.attachmentPreviewTimer = null;
  }
  if (app.handleAttachmentPreviewMouseOver) {
    document.removeEventListener(
      'mouseover',
      app.handleAttachmentPreviewMouseOver,
      true,
    );
  }
  if (app.handleAttachmentPreviewMouseOut) {
    document.removeEventListener(
      'mouseout',
      app.handleAttachmentPreviewMouseOut,
      true,
    );
  }
  if (app.handleAttachmentPreviewScroll) {
    window.removeEventListener('scroll', app.handleAttachmentPreviewScroll, true);
    window.removeEventListener('resize', app.handleAttachmentPreviewScroll, true);
  }
  if (app.handleAttachmentContentOverlayKeydown) {
    document.removeEventListener(
      'keydown',
      app.handleAttachmentContentOverlayKeydown,
    );
  }
  if (app.handleEditorOverlayViewportSync) {
    if (app.tableWrap) {
      app.tableWrap.removeEventListener(
        'scroll',
        app.handleEditorOverlayViewportSync,
      );
    }
    window.removeEventListener('resize', app.handleEditorOverlayViewportSync);
  }
  app.floatingAttachmentPreview = null;
  app.floatingAttachmentPreviewUiState = null;
  app.attachmentContentUiState = null;
}
