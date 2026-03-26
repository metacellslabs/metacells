import {
  handleWorkbookGlobalClick,
  handleWorkbookGlobalKeydown,
  handleWorkbookGlobalPaste,
} from './keyboard-shortcuts-runtime.js';
import {
  addReportTab as addReportTabRuntime,
  addTab as addTabRuntime,
  deleteActiveTab as deleteActiveTabRuntime,
  onTabDragEnd as onTabDragEndRuntime,
  onTabDragOver as onTabDragOverRuntime,
  onTabDragStart as onTabDragStartRuntime,
  onTabDrop as onTabDropRuntime,
  renameActiveTab as renameActiveTabRuntime,
  renameTabById as renameTabByIdRuntime,
  renderTabs as renderTabsRuntime,
  reorderTabs as reorderTabsRuntime,
  switchToSheet as switchToSheetRuntime,
} from './sheet-shell-runtime.js';

let workbookUiRuntimePromise = null;
let workbookUiRuntimeLoaded = null;

function loadWorkbookUiRuntime() {
  if (!workbookUiRuntimePromise) {
    workbookUiRuntimePromise = Promise.all([
      import('./keyboard-menu-runtime.js'),
      import('./tab-mention-runtime.js'),
    ]).then(([keyboardMenuModule, tabMentionModule]) => ({
      keyboardMenu: keyboardMenuModule,
      tabMention: tabMentionModule,
    }));
  }
  return workbookUiRuntimePromise.then((runtime) => {
    workbookUiRuntimeLoaded = runtime;
    return runtime;
  });
}

export function installWorkbookUiMethods(SpreadsheetApp) {
  SpreadsheetApp.prototype.setupButtons = function () {
    var app = this;
    if (app.undoButton) {
      app.undoButton.addEventListener('click', function () {
        app.undo();
      });
    }
    if (app.redoButton) {
      app.redoButton.addEventListener('click', function () {
        app.redo();
      });
    }
    document.addEventListener('click', function (e) {
      handleWorkbookGlobalClick(app, e);
    });
    document.addEventListener('keydown', function (e) {
      handleWorkbookGlobalKeydown(app, e);
    });
    document.addEventListener('paste', function (e) {
      handleWorkbookGlobalPaste(app, e);
    });
    window.addEventListener('resize', function () {
      app.hideAddTabMenu();
    });
  };

  SpreadsheetApp.prototype.ensureAddTabMenu = function () {
    if (!workbookUiRuntimeLoaded) {
      return this.addTabMenuUiState || null;
    }
    return workbookUiRuntimeLoaded.keyboardMenu.ensureAddTabMenu(this);
  };

  SpreadsheetApp.prototype.toggleAddTabMenu = function () {
    return loadWorkbookUiRuntime().then(({ keyboardMenu }) => {
      keyboardMenu.toggleAddTabMenu(this);
    });
  };

  SpreadsheetApp.prototype.getAddTabMenuUiState = function () {
    if (!workbookUiRuntimeLoaded) {
      return { open: false, left: 0, top: 0 };
    }
    return workbookUiRuntimeLoaded.keyboardMenu.getAddTabMenuUiState(this);
  };

  SpreadsheetApp.prototype.hideAddTabMenu = function () {
    if (!workbookUiRuntimeLoaded) return;
    workbookUiRuntimeLoaded.keyboardMenu.hideAddTabMenu(this);
  };

  SpreadsheetApp.prototype.onTabButtonClick = function (tabId) {
    return loadWorkbookUiRuntime().then(({ tabMention }) => {
      tabMention.onTabButtonClick(this, tabId);
    });
  };

  SpreadsheetApp.prototype.shouldStartCrossTabMention = function (tabId) {
    if (!workbookUiRuntimeLoaded) return false;
    return workbookUiRuntimeLoaded.tabMention.shouldStartCrossTabMention(
      this,
      tabId,
    );
  };

  SpreadsheetApp.prototype.startCrossTabMention = function (targetSheetId) {
    return loadWorkbookUiRuntime().then(({ tabMention }) => {
      tabMention.startCrossTabMention(this, targetSheetId);
    });
  };

  SpreadsheetApp.prototype.restoreCrossTabMentionEditor = function () {
    return loadWorkbookUiRuntime().then(({ tabMention }) => {
      tabMention.restoreCrossTabMentionEditor(this);
    });
  };

  SpreadsheetApp.prototype.syncCrossTabMentionSourceValue = function (nextValue) {
    if (!workbookUiRuntimeLoaded) return false;
    return workbookUiRuntimeLoaded.tabMention.syncCrossTabMentionSourceValue(
      this,
      nextValue,
    );
  };

  SpreadsheetApp.prototype.isCrossTabMentionProxyActive = function () {
    if (!workbookUiRuntimeLoaded) return false;
    return workbookUiRuntimeLoaded.tabMention.isCrossTabMentionProxyActive(this);
  };

  SpreadsheetApp.prototype.finishCrossTabMentionAndReturnToSource = function () {
    if (!workbookUiRuntimeLoaded) return false;
    return workbookUiRuntimeLoaded.tabMention.finishCrossTabMentionAndReturnToSource(
      this,
    );
  };

  SpreadsheetApp.prototype.ensureContextMenu = function () {
    if (!workbookUiRuntimeLoaded) {
      return this.contextMenuUiState || null;
    }
    return workbookUiRuntimeLoaded.keyboardMenu.ensureContextMenu(this);
  };

  SpreadsheetApp.prototype.setupContextMenu = function () {
    if (this._contextMenuSetupRequested) return;
    this._contextMenuSetupRequested = true;
    loadWorkbookUiRuntime().then(({ keyboardMenu }) => {
      keyboardMenu.setupContextMenu(this);
    });
  };

  SpreadsheetApp.prototype.prepareContextFromCell = function (td) {
    return loadWorkbookUiRuntime().then(({ keyboardMenu }) => {
      keyboardMenu.prepareContextFromCell(this, td);
    });
  };

  SpreadsheetApp.prototype.openContextMenu = function (clientX, clientY) {
    return loadWorkbookUiRuntime().then(({ keyboardMenu }) => {
      keyboardMenu.openContextMenu(this, clientX, clientY);
    });
  };

  SpreadsheetApp.prototype.getContextMenuUiState = function () {
    if (!workbookUiRuntimeLoaded) {
      return { open: false, left: 0, top: 0, showCellActions: false };
    }
    return workbookUiRuntimeLoaded.keyboardMenu.getContextMenuUiState(this);
  };

  SpreadsheetApp.prototype.hideContextMenu = function () {
    if (!workbookUiRuntimeLoaded) return;
    workbookUiRuntimeLoaded.keyboardMenu.hideContextMenu(this);
  };

  SpreadsheetApp.prototype.renderTabs = function () {
    renderTabsRuntime(this);
  };

  SpreadsheetApp.prototype.onTabDragStart = function (event, tabId) {
    onTabDragStartRuntime(this, event, tabId);
  };

  SpreadsheetApp.prototype.onTabDragEnd = function () {
    onTabDragEndRuntime(this);
  };

  SpreadsheetApp.prototype.onTabDragOver = function (event, targetTabId) {
    onTabDragOverRuntime(this, event, targetTabId);
  };

  SpreadsheetApp.prototype.onTabDrop = function (event, targetTabId) {
    onTabDropRuntime(this, event, targetTabId);
  };

  SpreadsheetApp.prototype.reorderTabs = function (dragId, targetId) {
    reorderTabsRuntime(this, dragId, targetId);
  };

  SpreadsheetApp.prototype.addTab = function () {
    addTabRuntime(this);
  };

  SpreadsheetApp.prototype.addReportTab = function () {
    addReportTabRuntime(this);
  };

  SpreadsheetApp.prototype.renameActiveTab = function () {
    renameActiveTabRuntime(this);
  };

  SpreadsheetApp.prototype.renameTabById = function (tabId) {
    renameTabByIdRuntime(this, tabId);
  };

  SpreadsheetApp.prototype.deleteActiveTab = function () {
    deleteActiveTabRuntime(this);
  };

  SpreadsheetApp.prototype.switchToSheet = function (sheetId) {
    switchToSheetRuntime(this, sheetId);
  };
}
