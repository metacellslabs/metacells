import { AI_MODE } from './constants.js';
import {
  getWindowOrigin,
  openExternalWindow,
  printWindow,
  writeClipboardText,
} from './browser-runtime.js';

export function setupFullscreenOverlay(app) {
  var overlay = document.createElement('div');
  overlay.className = 'fullscreen-overlay';
  overlay.style.display = 'none';
  overlay.innerHTML =
    "<div class='fullscreen-panel'><button type='button' class='fullscreen-close' title='Close'>✕</button><div class='fullscreen-content'></div></div>";
  document.body.appendChild(overlay);

  app.fullscreenOverlay = overlay;
  app.fullscreenOverlayContent = overlay.querySelector('.fullscreen-content');

  overlay.addEventListener('click', (e) => {
    if (
      e.target === overlay ||
      (e.target.closest && e.target.closest('.fullscreen-close'))
    ) {
      closeFullscreenCell(app);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (
      !app.fullscreenOverlay ||
      app.fullscreenOverlay.style.display === 'none'
    )
      return;
    e.preventDefault();
    closeFullscreenCell(app);
  });
}

export function copyCellValue(app, input) {
  var value = input.parentElement.dataset.computedValue || '';
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    navigator.clipboard.writeText
  ) {
    writeClipboardText(value);
    return;
  }
  var fallback = document.createElement('textarea');
  fallback.value = value;
  document.body.appendChild(fallback);
  fallback.select();
  document.execCommand('copy');
  fallback.remove();
}

export function runFormulaForCell(app, input) {
  if (!input) return;
  if (app.aiService.getMode() !== AI_MODE.manual) return;
  var raw = app.getRawCellValue(input.id);
  if (!raw || (raw.charAt(0) !== '=' && raw.charAt(0) !== '>')) return;
  app.computeAll({ forceRefreshAI: true });
}

export function openFullscreenCell(app, input) {
  if (!app.fullscreenOverlay || !app.fullscreenOverlayContent) return;
  var value = input.parentElement.dataset.computedValue || '';
  app.fullscreenOverlayContent.innerHTML = app.grid.renderMarkdown(value);
  app.fullscreenOverlay.style.display = 'flex';
}

export function closeFullscreenCell(app) {
  if (!app.fullscreenOverlay || !app.fullscreenOverlayContent) return;
  app.fullscreenOverlayContent.innerHTML = '';
  app.fullscreenOverlay.style.display = 'none';
}

export function buildPublishedReportUrl(app) {
  if (!app.sheetDocumentId || !app.activeSheetId || !app.isReportActive())
    return '';
  var origin = getWindowOrigin();
  return (
    origin +
    '/report/' +
    encodeURIComponent(app.sheetDocumentId) +
    '/' +
    encodeURIComponent(app.activeSheetId)
  );
}

export function publishCurrentReport(app) {
  if (!app.isReportActive()) return '';
  app.setReportMode('view');
  var url = buildPublishedReportUrl(app);
  if (!url) return '';
  writeClipboardText(url);
  openExternalWindow(url);
  return url;
}

export function exportCurrentReportPdf(app) {
  if (!app.isReportActive()) return;
  app.setReportMode('view');
  setTimeout(() => {
    printWindow();
  }, 0);
}
