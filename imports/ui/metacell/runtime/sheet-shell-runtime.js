function createLucideIconMarkup(paths) {
  return (
    "<svg viewBox='0 0 24 24' aria-hidden='true' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>" +
    paths.join('') +
    '</svg>'
  );
}

function showSheetShellDialog(options) {
  return new Promise((resolve) => {
    var config = options || {};
    var overlay = document.createElement('div');
    overlay.className = 'app-dialog-overlay';

    var modal = document.createElement('div');
    modal.className = 'app-dialog-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    if (config.title) modal.setAttribute('aria-label', String(config.title));

    var header = document.createElement('div');
    header.className = 'app-dialog-header';

    var title = document.createElement('h2');
    title.className = 'app-dialog-title';
    title.textContent = String(config.title || '');
    header.appendChild(title);

    if (config.description) {
      var description = document.createElement('p');
      description.className = 'app-dialog-description';
      description.textContent = String(config.description || '');
      header.appendChild(description);
    }

    var form = document.createElement('form');
    form.className = 'app-dialog-body';

    var input = null;
    if (config.input) {
      input = document.createElement('input');
      input.className = 'app-dialog-input';
      input.type = 'text';
      input.name = 'dialogValue';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.maxLength = 120;
      input.value = String(config.initialValue || '');
      if (config.placeholder) input.placeholder = String(config.placeholder);
      form.appendChild(input);
    }

    var actions = document.createElement('div');
    actions.className = 'app-dialog-actions';

    var cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'app-dialog-button';
    cancelButton.textContent = String(config.cancelLabel || 'Cancel');

    var confirmButton = document.createElement('button');
    confirmButton.type = 'submit';
    confirmButton.className =
      'app-dialog-button app-dialog-button-primary' +
      (config.destructive ? ' is-danger' : '');
    confirmButton.textContent = String(config.confirmLabel || 'Confirm');

    actions.appendChild(cancelButton);
    actions.appendChild(confirmButton);
    form.appendChild(actions);

    modal.appendChild(header);
    modal.appendChild(form);
    overlay.appendChild(modal);

    var settled = false;
    var cleanup = function (result) {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeyDown, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resolve(result);
    };

    var onKeyDown = function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        cleanup({ confirmed: false, value: input ? input.value : '' });
      }
    };

    cancelButton.addEventListener('click', function () {
      cleanup({ confirmed: false, value: input ? input.value : '' });
    });

    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) {
        cleanup({ confirmed: false, value: input ? input.value : '' });
      }
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      cleanup({ confirmed: true, value: input ? input.value : '' });
    });

    document.addEventListener('keydown', onKeyDown, true);
    document.body.appendChild(overlay);

    window.setTimeout(function () {
      if (input) {
        input.focus();
        input.select();
      } else {
        confirmButton.focus();
      }
    }, 0);
  });
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

export async function addTab(app) {
  var sheetCount = app.tabs.filter((tab) => !app.isReportTab(tab.id)).length;
  var defaultName = 'Sheet ' + (sheetCount + 1);
  var result = await showSheetShellDialog({
    title: 'New sheet',
    description: 'Choose a name for the new sheet tab.',
    input: true,
    initialValue: defaultName,
    placeholder: 'Sheet name',
    confirmLabel: 'Create sheet',
  });
  if (!result.confirmed) return;

  var name = result.value;
  name = name.trim() || defaultName;
  var tab = { id: app.storage.makeSheetId(), name: name, type: 'sheet' };
  app.captureHistorySnapshot('tabs');

  var insertAt = app.tabs.findIndex((item) => app.isReportTab(item.id));
  if (insertAt < 0) insertAt = app.tabs.length;
  app.tabs.splice(insertAt, 0, tab);
  app.storage.saveTabs(app.tabs);
  app.switchToSheet(tab.id);
}

export async function addReportTab(app) {
  var reportCount = app.tabs.filter((tab) => app.isReportTab(tab.id)).length;
  var defaultName = reportCount < 1 ? 'Report' : 'Report ' + (reportCount + 1);
  var result = await showSheetShellDialog({
    title: 'New report',
    description: 'Choose a name for the new report tab.',
    input: true,
    initialValue: defaultName,
    placeholder: 'Report name',
    confirmLabel: 'Create report',
  });
  if (!result.confirmed) return;
  var name = result.value;
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

export async function renameTabById(app, tabId) {
  var active = app.findTabById(tabId);
  if (!active) return;

  var result = await showSheetShellDialog({
    title: app.isReportTab(active.id) ? 'Rename report' : 'Rename sheet',
    description: 'Update the tab name.',
    input: true,
    initialValue: active.name,
    placeholder: 'Tab name',
    confirmLabel: 'Save',
  });
  if (!result.confirmed) return;

  var name = result.value;
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

export async function deleteActiveTab(app) {
  var sheetCount = app.tabs.filter((tab) => !app.isReportTab(tab.id)).length;
  var active = app.findTabById(app.activeSheetId);
  if (!active) return;
  var deletingSheet = !app.isReportTab(active.id);

  if (deletingSheet && sheetCount <= 1) {
    await showSheetShellDialog({
      title: 'Cannot delete sheet',
      description: 'At least one sheet tab must remain in the workbook.',
      confirmLabel: 'OK',
      cancelLabel: 'Close',
    });
    return;
  }

  var result = await showSheetShellDialog({
    title: app.isReportTab(active.id) ? 'Delete report?' : 'Delete sheet?',
    description:
      'This will permanently remove "' +
      active.name +
      '" from the workbook.',
    confirmLabel: 'Delete',
    destructive: true,
  });
  if (!result.confirmed) return;
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
  if (typeof app.restoreGridKeyboardFocusSoon === 'function') {
    app.restoreGridKeyboardFocusSoon();
  }
  setTimeout(function () {
    if (app.activeSheetId !== sheetId || app.isReportActive()) return;
    app.computeAll();
  }, 0);
  if (keepCrossMention) app.restoreCrossTabMentionEditor();
}
