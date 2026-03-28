function isSelectionInsideReportEditor(app) {
  if (!app || !app.reportEditor || typeof window === 'undefined') return false;
  var selection =
    typeof window.getSelection === 'function' ? window.getSelection() : null;
  if (!selection || selection.rangeCount < 1) return false;
  var anchorNode = selection.anchorNode || null;
  if (!anchorNode) return false;
  return app.reportEditor === anchorNode || app.reportEditor.contains(anchorNode);
}

function readCommandState(command) {
  try {
    if (typeof document.queryCommandState !== 'function') return false;
    return document.queryCommandState(command) === true;
  } catch (error) {
    return false;
  }
}

function getReportTabId(app) {
  if (!app || !Array.isArray(app.tabs)) return '';
  for (var i = 0; i < app.tabs.length; i++) {
    var tab = app.tabs[i];
    if (!tab || typeof tab !== 'object') continue;
    if (tab.type === 'report' || String(tab.id || '') === 'report') {
      return String(tab.id || '');
    }
  }
  return app && app.isReportActive && app.isReportActive()
    ? String(app.activeSheetId || '')
    : '';
}

function syncReportContentToStorage(app) {
  if (!app || !app.reportEditor || !app.storage) return false;
  var reportTabId = getReportTabId(app);
  if (!reportTabId) return false;
  app.storage.setReportContent(reportTabId, app.reportEditor.innerHTML);
  return true;
}

export function getReportToolbarUiState(app) {
  var selectionInside = isSelectionInsideReportEditor(app);
  var commandsDisabled = !app || app.reportMode !== 'edit';
  var canExecCommand = !commandsDisabled;
  return {
    selectionInside: selectionInside,
    canExecCommand: canExecCommand,
    commands: {
      bold: canExecCommand ? readCommandState('bold') : false,
      italic: canExecCommand ? readCommandState('italic') : false,
      underline: canExecCommand ? readCommandState('underline') : false,
      insertUnorderedList: canExecCommand
        ? readCommandState('insertUnorderedList')
        : false,
    },
  };
}

export function runReportToolbarCommand(app, cmd) {
  if (!app || !app.reportEditor || !cmd || app.reportMode !== 'edit') return;
  app.reportEditor.focus();
  app.captureHistorySnapshot('report:' + app.activeSheetId);
  document.execCommand(cmd, false);
  if (app.isReportActive()) {
    syncReportContentToStorage(app);
  }
  app.renderReportLiveValues();
  if (typeof app.publishUiState === 'function') {
    app.publishUiState();
  }
}

export function setupReportToolbarCommands(app) {
  if (!app || !app.reportWrap) return;
  if (app.reportWrap.dataset.reportToolbarBound !== 'true') {
    app.reportWrap.dataset.reportToolbarBound = 'true';
    app.reportWrap.addEventListener('click', function (event) {
      var target = event.target;
      var button =
        target && typeof target.closest === 'function'
          ? target.closest('.report-cmd')
          : null;
      if (!button || !app.reportWrap.contains(button)) return;
      runReportToolbarCommand(app, button.dataset.cmd);
    });
  }
}
