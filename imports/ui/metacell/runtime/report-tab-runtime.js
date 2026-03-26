import { fragmentHasVisibleContent } from './report-transform-runtime.js';

export function getReportTabStateStore(app) {
  if (!app.reportActiveTabKeysBySheet) app.reportActiveTabKeysBySheet = {};
  return app.reportActiveTabKeysBySheet;
}

export function activateReportTab(app, tabKey) {
  if (!app.reportLive) return;
  var key = String(tabKey || '');
  if (!key) return;
  var store = getReportTabStateStore(app);
  store[app.activeSheetId] = key;
  var buttons = app.reportLive.querySelectorAll('.report-tab-nav-button');
  buttons.forEach((button) => {
    button.classList.toggle('active', button.dataset.reportTabKey === key);
  });
  var sections = app.reportLive.querySelectorAll('.report-tab-panel');
  sections.forEach((section) => {
    section.hidden = section.dataset.reportTabKey !== key;
  });
}

export function decorateReportTabs(app, root) {
  if (!root) return;
  var container = root;
  while (
    container.children &&
    container.children.length === 1 &&
    container.firstElementChild &&
    /^(DIV|SECTION|ARTICLE)$/i.test(
      String(container.firstElementChild.tagName || ''),
    ) &&
    container.firstElementChild.querySelector('.report-tab-title') &&
    ![].slice.call(container.childNodes).some((node) => {
      return (
        node.nodeType === Node.TEXT_NODE && String(node.nodeValue || '').trim()
      );
    })
  ) {
    container = container.firstElementChild;
  }
  var markers = [].slice.call(container.querySelectorAll('.report-tab-title'));
  if (!markers.length) return;

  var sections = [];
  markers.forEach((marker, index) => {
    sections.push({
      key:
        'tab-' +
        index +
        '-' +
        String(marker.textContent || '')
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-'),
      title:
        String(marker.textContent || '').trim() || 'Section ' + (index + 1),
    });
  });
  if (!sections.length) return;

  var preambleRange = document.createRange();
  preambleRange.setStart(container, 0);
  preambleRange.setEndBefore(markers[0]);
  var preambleFragment = preambleRange.cloneContents();

  sections.forEach((section, index) => {
    var sectionRange = document.createRange();
    sectionRange.setStartAfter(markers[index]);
    if (index + 1 < markers.length)
      sectionRange.setEndBefore(markers[index + 1]);
    else sectionRange.setEnd(container, container.childNodes.length);
    section.fragment = sectionRange.cloneContents();
  });

  container.innerHTML = '';
  if (fragmentHasVisibleContent(app, preambleFragment)) {
    var preambleBlock = document.createElement('div');
    preambleBlock.className = 'report-tab-preamble';
    preambleBlock.appendChild(preambleFragment);
    container.appendChild(preambleBlock);
  }

  var nav = document.createElement('div');
  nav.className = 'report-tab-nav';
  sections.forEach((section) => {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'report-tab-nav-button';
    button.dataset.reportTabKey = section.key;
    button.textContent = section.title;
    nav.appendChild(button);
  });
  container.appendChild(nav);

  var panels = document.createElement('div');
  panels.className = 'report-tab-panels';
  sections.forEach((section) => {
    var panel = document.createElement('div');
    panel.className = 'report-tab-panel';
    panel.dataset.reportTabKey = section.key;
    if (section.fragment) panel.appendChild(section.fragment);
    panels.appendChild(panel);
  });
  container.appendChild(panels);

  var store = getReportTabStateStore(app);
  var nextKey = store[app.activeSheetId];
  if (!sections.some((section) => section.key === nextKey))
    nextKey = sections[0].key;
  activateReportTab(app, nextKey);
}
