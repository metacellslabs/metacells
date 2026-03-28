function isReportLiveContentEmpty(root) {
  if (!root) return true;
  var text = String(root.textContent || '').replace(/\u00a0/g, ' ').trim();
  if (text) return false;
  var hasMeaningfulNode = Array.from(root.querySelectorAll('*')).some((node) => {
    if (!node || !(node instanceof HTMLElement)) return false;
    if (node.classList.contains('report-empty-state')) return false;
    if (node.classList.contains('report-linked-input')) return true;
    if (node.classList.contains('attachment-chip')) return true;
    if (node.classList.contains('embedded-attachment')) return true;
    if (node.tagName === 'IMG' || node.tagName === 'IFRAME') return true;
    return false;
  });
  return !hasMeaningfulNode;
}

function getEmptyReportStateHtml() {
  return (
    "<div class='report-empty-state'>" +
    "<span class='report-empty-state-copy'>Fill this report with data, linked cells, and file inputs.</span>" +
    "<button type='button' class='report-empty-state-edit'>Edit</button>" +
    '</div>'
  );
}

export function renderReportLiveValues(app, forceRender) {
  if (!app.reportEditor || !app.reportLive) return;
  if (app.reportMode !== 'view' && !forceRender) return;
  var root = document.createElement('div');
  root.innerHTML = app.reportEditor.innerHTML || '';
  app.replaceMentionNodes(root);
  app.renderReportMarkdownNodes(root);
  var html = root.innerHTML.trim();
  var isEmpty = isReportLiveContentEmpty(root);
  var nextHtml = html
    ? isEmpty
      ? getEmptyReportStateHtml()
      : html
    : getEmptyReportStateHtml();
  if (!forceRender && app.lastReportLiveHtml === nextHtml) return;
  app.lastReportLiveHtml = nextHtml;
  app.reportLive.innerHTML = nextHtml;
  app.injectLinkedInputsFromPlaceholders(app.reportLive);
  app.decorateReportTabs(app.reportLive);
  if (isReportLiveContentEmpty(app.reportLive)) {
    app.reportLive.innerHTML = getEmptyReportStateHtml();
  }
  if (typeof app.publishUiState === 'function') {
    app.publishUiState();
  }
}
