let reportRuntimePromise = null;
let reportRuntimeLoaded = null;

function loadReportRuntime() {
  if (!reportRuntimePromise) {
    reportRuntimePromise = import('./report-runtime.js').then((module) => {
      reportRuntimeLoaded = module;
      return module;
    });
  }
  return reportRuntimePromise;
}

function ensureReportRuntime(app) {
  if (reportRuntimeLoaded) return Promise.resolve(reportRuntimeLoaded);
  if (!app || typeof app.isReportActive !== 'function' || !app.isReportActive()) {
    return Promise.resolve(null);
  }
  return loadReportRuntime();
}

export function installReportMethods(SpreadsheetApp) {
  SpreadsheetApp.prototype.setupReportControls = function () {
    loadReportRuntime().then((runtime) => {
      runtime.setupReportControls(this);
      if (typeof this.publishUiState === 'function') this.publishUiState();
    });
  };

  SpreadsheetApp.prototype.setReportMode = function (mode) {
    return loadReportRuntime().then((runtime) => {
      runtime.setReportMode(this, mode);
    });
  };

  SpreadsheetApp.prototype.renderReportLiveValues = function (forceRender) {
    return ensureReportRuntime(this).then((runtime) => {
      if (!runtime) return;
      runtime.renderReportLiveValues(this, forceRender);
    });
  };

  SpreadsheetApp.prototype.replaceMentionNodes = function (root) {
    if (!reportRuntimeLoaded) return;
    reportRuntimeLoaded.replaceMentionNodes(this, root);
  };

  SpreadsheetApp.prototype.renderReportMarkdownNodes = function (root) {
    if (!reportRuntimeLoaded) return;
    reportRuntimeLoaded.renderReportMarkdownNodes(this, root);
  };

  SpreadsheetApp.prototype.replaceMentionInTextNode = function (textNode) {
    if (!reportRuntimeLoaded) return;
    reportRuntimeLoaded.replaceMentionInTextNode(this, textNode);
  };

  SpreadsheetApp.prototype.createReportTabElement = function (token) {
    if (!reportRuntimeLoaded) return null;
    return reportRuntimeLoaded.createReportTabElement(this, token);
  };

  SpreadsheetApp.prototype.fragmentHasVisibleContent = function (fragment) {
    if (!reportRuntimeLoaded) return false;
    return reportRuntimeLoaded.fragmentHasVisibleContent(this, fragment);
  };

  SpreadsheetApp.prototype.getReportTabStateStore = function () {
    if (!reportRuntimeLoaded) return {};
    return reportRuntimeLoaded.getReportTabStateStore(this);
  };

  SpreadsheetApp.prototype.activateReportTab = function (tabKey) {
    return loadReportRuntime().then((runtime) =>
      runtime.activateReportTab(this, tabKey),
    );
  };

  SpreadsheetApp.prototype.decorateReportTabs = function (root) {
    if (!reportRuntimeLoaded) return;
    reportRuntimeLoaded.decorateReportTabs(this, root);
  };

  SpreadsheetApp.prototype.parseReportControlToken = function (token, prefix) {
    if (!reportRuntimeLoaded) return null;
    return reportRuntimeLoaded.parseReportControlToken(this, token, prefix);
  };

  SpreadsheetApp.prototype.resolveReportInternalLink = function (token) {
    if (!reportRuntimeLoaded) return null;
    return reportRuntimeLoaded.resolveReportInternalLink(this, token);
  };

  SpreadsheetApp.prototype.createReportInternalLinkElement = function (token, target) {
    if (!reportRuntimeLoaded) return null;
    return reportRuntimeLoaded.createReportInternalLinkElement(this, token, target);
  };

  SpreadsheetApp.prototype.followReportInternalLink = function (link) {
    if (!reportRuntimeLoaded) return;
    reportRuntimeLoaded.followReportInternalLink(this, link);
  };

  SpreadsheetApp.prototype.injectLinkedInputsFromPlaceholders = function (root) {
    if (!reportRuntimeLoaded) return;
    reportRuntimeLoaded.injectLinkedInputsFromPlaceholders(this, root);
  };

  SpreadsheetApp.prototype.createLinkedReportInputElement = function (inputResolved) {
    if (!reportRuntimeLoaded) return null;
    return reportRuntimeLoaded.createLinkedReportInputElement(this, inputResolved);
  };

  SpreadsheetApp.prototype.createLinkedReportFileElement = function (inputResolved) {
    if (!reportRuntimeLoaded) return null;
    return reportRuntimeLoaded.createLinkedReportFileElement(this, inputResolved);
  };

  SpreadsheetApp.prototype.handleReportFileShellAction = function (shell, removeOnly) {
    return ensureReportRuntime(this).then((runtime) => {
      if (!runtime) return;
      runtime.handleReportFileShellAction(this, shell, removeOnly);
    });
  };

  SpreadsheetApp.prototype.applyLinkedReportInput = function (input) {
    return ensureReportRuntime(this).then((runtime) => {
      if (!runtime) return;
      runtime.applyLinkedReportInput(this, input);
    });
  };

  SpreadsheetApp.prototype.refreshLinkedReportInputValue = function (input) {
    return ensureReportRuntime(this).then((runtime) => {
      if (!runtime) return;
      runtime.refreshLinkedReportInputValue(this, input);
    });
  };

  SpreadsheetApp.prototype.resolveReportInputMention = function (payload) {
    if (!reportRuntimeLoaded) return null;
    return reportRuntimeLoaded.resolveReportInputMention(this, payload);
  };

  SpreadsheetApp.prototype.resolveReportMention = function (token) {
    if (!reportRuntimeLoaded) return null;
    return reportRuntimeLoaded.resolveReportMention(this, token);
  };

  SpreadsheetApp.prototype.resolveReportReference = function (token) {
    if (!reportRuntimeLoaded) return null;
    return reportRuntimeLoaded.resolveReportReference(this, token);
  };

  SpreadsheetApp.prototype.resolveNamedMention = function (name, rawMode) {
    if (!reportRuntimeLoaded) return null;
    return reportRuntimeLoaded.resolveNamedMention(this, name, rawMode);
  };

  SpreadsheetApp.prototype.resolveSheetCellMention = function (token, rawMode) {
    if (!reportRuntimeLoaded) return null;
    return reportRuntimeLoaded.resolveSheetCellMention(this, token, rawMode);
  };

  SpreadsheetApp.prototype.resolveSheetRegionMention = function (token, rawMode) {
    if (!reportRuntimeLoaded) return null;
    return reportRuntimeLoaded.resolveSheetRegionMention(this, token, rawMode);
  };

  SpreadsheetApp.prototype.readRegionValues = function (sheetId, startCellId, endCellId) {
    if (!reportRuntimeLoaded) return [];
    return reportRuntimeLoaded.readRegionValues(this, sheetId, startCellId, endCellId);
  };

  SpreadsheetApp.prototype.readRegionRawValues = function (
    sheetId,
    startCellId,
    endCellId,
  ) {
    if (!reportRuntimeLoaded) return [];
    return reportRuntimeLoaded.readRegionRawValues(this, sheetId, startCellId, endCellId);
  };

  SpreadsheetApp.prototype.createReportRegionTableElement = function (rows) {
    if (!reportRuntimeLoaded) return null;
    return reportRuntimeLoaded.createReportRegionTableElement(this, rows);
  };

  SpreadsheetApp.prototype.createReportListElement = function (items) {
    if (!reportRuntimeLoaded) return null;
    return reportRuntimeLoaded.createReportListElement(this, items);
  };

  SpreadsheetApp.prototype.isListShortcutCell = function (sheetId, cellId) {
    if (!reportRuntimeLoaded) return false;
    return reportRuntimeLoaded.isListShortcutCell(this, sheetId, cellId);
  };

  SpreadsheetApp.prototype.parseListItemsFromMentionValue = function (value) {
    if (!reportRuntimeLoaded) return [];
    return reportRuntimeLoaded.parseListItemsFromMentionValue(this, value);
  };
}
