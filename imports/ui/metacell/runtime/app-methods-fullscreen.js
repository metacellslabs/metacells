let fullscreenRuntimePromise = null;
let fullscreenRuntimeLoaded = null;

function loadFullscreenRuntime() {
  if (!fullscreenRuntimePromise) {
    fullscreenRuntimePromise = import('./fullscreen-runtime.js').then((module) => {
      fullscreenRuntimeLoaded = module;
      return module;
    });
  }
  return fullscreenRuntimePromise;
}

function publishIfReady(app) {
  if (app && typeof app.publishUiState === 'function') {
    app.publishUiState();
  }
}

export function installFullscreenMethods(SpreadsheetApp) {
  SpreadsheetApp.prototype.setupFullscreenOverlay = function () {
    if (this._fullscreenSetupRequested) return;
    this._fullscreenSetupRequested = true;
    loadFullscreenRuntime().then((runtime) => {
      runtime.setupFullscreenOverlay(this);
      publishIfReady(this);
    });
  };

  SpreadsheetApp.prototype.startFullscreenEditing = function (mode) {
    return loadFullscreenRuntime().then((runtime) => {
      runtime.startFullscreenEditing(this, mode);
      publishIfReady(this);
    });
  };

  SpreadsheetApp.prototype.setFullscreenMode = function (mode) {
    return loadFullscreenRuntime().then((runtime) => {
      runtime.setFullscreenMode(this, mode);
      publishIfReady(this);
    });
  };

  SpreadsheetApp.prototype.setFullscreenDraft = function (value) {
    return loadFullscreenRuntime().then((runtime) => {
      runtime.setFullscreenDraft(this, value);
      publishIfReady(this);
    });
  };

  SpreadsheetApp.prototype.applyFullscreenMarkdownCommand = function (command) {
    return loadFullscreenRuntime().then((runtime) => {
      runtime.applyFullscreenMarkdownCommand(this, command);
      publishIfReady(this);
    });
  };

  SpreadsheetApp.prototype.saveFullscreenDraft = function () {
    return loadFullscreenRuntime().then((runtime) =>
      runtime.saveFullscreenDraft(this),
    );
  };

  SpreadsheetApp.prototype.copyCellValue = function (input) {
    return loadFullscreenRuntime().then((runtime) =>
      runtime.copyCellValue(this, input),
    );
  };

  SpreadsheetApp.prototype.runFormulaForCell = function (input) {
    return loadFullscreenRuntime().then((runtime) =>
      runtime.runFormulaForCell(this, input),
    );
  };

  SpreadsheetApp.prototype.renderMarkdown = function (value) {
    if (this.grid && typeof this.grid.renderMarkdown === 'function') {
      return this.grid.renderMarkdown(value);
    }
    return String(value == null ? '' : value);
  };

  SpreadsheetApp.prototype.openFullscreenCell = function (input) {
    return loadFullscreenRuntime().then((runtime) => {
      if (
        !this.fullscreenOverlay ||
        !this.fullscreenOverlayContent ||
        !this.fullscreenEditor ||
        !this.fullscreenPreview
      ) {
        runtime.setupFullscreenOverlay(this);
      }
      runtime.openFullscreenCell(this, input);
      publishIfReady(this);
    });
  };

  SpreadsheetApp.prototype.closeFullscreenCell = function () {
    if (!fullscreenRuntimeLoaded) {
      this.fullscreenState = null;
      publishIfReady(this);
      return;
    }
    fullscreenRuntimeLoaded.closeFullscreenCell(this);
    publishIfReady(this);
  };

  SpreadsheetApp.prototype.buildPublishedReportUrl = function () {
    if (!fullscreenRuntimeLoaded) return '';
    return fullscreenRuntimeLoaded.buildPublishedReportUrl(this);
  };

  SpreadsheetApp.prototype.publishCurrentReport = function () {
    return loadFullscreenRuntime().then((runtime) =>
      runtime.publishCurrentReport(this),
    );
  };

  SpreadsheetApp.prototype.exportCurrentReportPdf = function () {
    return loadFullscreenRuntime().then((runtime) =>
      runtime.exportCurrentReportPdf(this),
    );
  };
}
