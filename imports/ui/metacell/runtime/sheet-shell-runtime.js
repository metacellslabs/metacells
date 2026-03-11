function createLucideIconMarkup(paths) {
  return (
    "<svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>" +
    paths.join('') +
    '</svg>'
  );
}

export function renderTabs(app) {
  app.tabsContainer.innerHTML = '';

  app.tabs.forEach((tab) => {
    var button = document.createElement('button');
    button.type = 'button';
    button.className =
      'tab-button' + (tab.id === app.activeSheetId ? ' active' : '');
    button.innerHTML = '';
    if (app.isReportTab(tab.id)) {
      var icon = document.createElement('span');
      icon.className = 'tab-doc-icon';
      icon.innerHTML = createLucideIconMarkup([
        "<path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' />",
        "<path d='M14 2v6h6' />",
        "<path d='M8 13h8' />",
        "<path d='M8 17h8' />",
        "<path d='M8 9h2' />",
      ]);
      button.appendChild(icon);
    }
    var label = document.createElement('span');
    label.textContent = tab.name;
    button.appendChild(label);
    button.addEventListener('click', () => app.onTabButtonClick(tab.id));
    button.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      app.renameTabById(tab.id);
    });
    var canDrag = true;
    button.draggable = canDrag;
    if (canDrag) {
      button.addEventListener('dragstart', (e) =>
        app.onTabDragStart(e, tab.id),
      );
      button.addEventListener('dragend', () => app.onTabDragEnd());
      button.addEventListener('dragover', (e) => app.onTabDragOver(e, tab.id));
      button.addEventListener('drop', (e) => app.onTabDrop(e, tab.id));
    }
    app.tabsContainer.appendChild(button);
  });
  app.refreshNamedCellJumpOptions();
}

export function onTabDragStart(app, event, tabId) {
  app.dragTabId = tabId;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', tabId);
  }
  var target = event.currentTarget;
  if (target && target.classList) target.classList.add('dragging');
}

export function onTabDragEnd(app) {
  app.dragTabId = null;
  var dragging = app.tabsContainer.querySelector('.tab-button.dragging');
  if (dragging) dragging.classList.remove('dragging');
}

export function onTabDragOver(app, event, targetTabId) {
  if (!app.dragTabId || app.dragTabId === targetTabId) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

export function onTabDrop(app, event, targetTabId) {
  event.preventDefault();
  var dragId =
    app.dragTabId ||
    (event.dataTransfer && event.dataTransfer.getData('text/plain'));
  app.onTabDragEnd();
  if (!dragId || dragId === targetTabId) return;
  app.reorderTabs(dragId, targetTabId);
}

export function reorderTabs(app, dragId, targetId) {
  var dragIndex = app.tabs.findIndex((tab) => tab.id === dragId);
  var targetIndex = app.tabs.findIndex((tab) => tab.id === targetId);
  if (dragIndex < 0 || targetIndex < 0) return;
  app.captureHistorySnapshot('tabs');

  var moving = app.tabs[dragIndex];
  app.tabs.splice(dragIndex, 1);
  var nextTargetIndex = app.tabs.findIndex((tab) => tab.id === targetId);
  app.tabs.splice(nextTargetIndex, 0, moving);
  app.storage.saveTabs(app.tabs);
  app.renderTabs();
}

export function addTab(app) {
  var sheetCount = app.tabs.filter((tab) => !app.isReportTab(tab.id)).length;
  var defaultName = 'Sheet ' + (sheetCount + 1);
  var name = prompt('New tab name', defaultName);
  if (name === null) return;

  name = name.trim() || defaultName;
  var tab = { id: app.storage.makeSheetId(), name: name, type: 'sheet' };
  app.captureHistorySnapshot('tabs');

  var insertAt = app.tabs.findIndex((item) => app.isReportTab(item.id));
  if (insertAt < 0) insertAt = app.tabs.length;
  app.tabs.splice(insertAt, 0, tab);
  app.storage.saveTabs(app.tabs);
  app.switchToSheet(tab.id);
}

export function addReportTab(app) {
  var reportCount = app.tabs.filter((tab) => app.isReportTab(tab.id)).length;
  var defaultName = reportCount < 1 ? 'Report' : 'Report ' + (reportCount + 1);
  var name = prompt('New report name', defaultName);
  if (name === null) return;
  name = name.trim() || defaultName;

  var tab = {
    id: 'report-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
    name: name,
    type: 'report',
  };
  app.captureHistorySnapshot('tabs');
  app.tabs.push(tab);
  app.storage.saveTabs(app.tabs);
  app.switchToSheet(tab.id);
}

export function renameActiveTab(app) {
  var active = app.findTabById(app.activeSheetId);
  if (!active) return;
  if (app.isReportTab(active.id)) return;
  app.renameTabById(active.id);
}

export function renameTabById(app, tabId) {
  var active = app.findTabById(tabId);
  if (!active) return;

  var name = prompt('Rename tab', active.name);
  if (name === null) return;

  name = name.trim();
  if (!name) return;

  app.captureHistorySnapshot('tabs');
  var oldName = active.name;
  active.name = name;

  app.storage.saveTabs(app.tabs);
  app.storage.rewriteFormulaReferencesOnRename(oldName, name);

  app.renderTabs();
  app.refreshNamedCellJumpOptions();
  app.computeAll();
}

export function deleteActiveTab(app) {
  var sheetCount = app.tabs.filter((tab) => !app.isReportTab(tab.id)).length;
  var active = app.findTabById(app.activeSheetId);
  if (!active) return;
  var deletingSheet = !app.isReportTab(active.id);

  if (deletingSheet && sheetCount <= 1) {
    alert('At least one tab is required.');
    return;
  }

  if (!confirm("Delete tab '" + active.name + "'?")) return;
  app.captureHistorySnapshot('tabs');

  app.storage.clearSheetStorage(active.id);
  app.tabs = app.tabs.filter(function (tab) {
    return tab.id !== active.id;
  });
  app.storage.saveTabs(app.tabs);
  app.refreshNamedCellJumpOptions();

  var fallback =
    app.tabs.find((tab) => !app.isReportTab(tab.id)) || app.tabs[0];
  if (fallback) app.switchToSheet(fallback.id);
}

export function switchToSheet(app, sheetId) {
  if (!app.findTabById(sheetId)) return;
  var keepCrossMention = !!(
    app.crossTabMentionContext &&
    sheetId !== app.crossTabMentionContext.sourceSheetId &&
    !app.isReportTab(sheetId)
  );

  app.clearActiveInput();
  app.activeSheetId = sheetId;
  app.storage.setActiveSheetId(sheetId);
  if (app.onActiveSheetChange) app.onActiveSheetChange(sheetId);

  app.renderTabs();
  app.applyViewMode();
  if (app.isReportActive()) {
    if (app.reportEditor) {
      app.reportEditor.innerHTML =
        app.storage.getReportContent(app.activeSheetId) || '<p></p>';
    }
    app.setReportMode('view');
    app.ensureActiveCell();
    if (keepCrossMention) app.restoreCrossTabMentionEditor();
    return;
  }
  app.applyActiveSheetLayout();
  app.updateSortIcons();
  app.syncCellNameInput();
  app.renderCurrentSheetFromStorage();
  app.ensureActiveCell();
  setTimeout(function () {
    if (app.activeSheetId !== sheetId || app.isReportActive()) return;
    app.computeAll();
  }, 0);
  if (keepCrossMention) app.restoreCrossTabMentionEditor();
}
