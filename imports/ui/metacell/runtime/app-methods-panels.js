let panelRuntimePromise = null;
let panelRuntimeLoaded = null;

function loadPanelRuntime() {
  if (!panelRuntimePromise) {
    panelRuntimePromise = Promise.all([
      import('./schedule-runtime.js'),
      import('./assistant-runtime.js'),
      import('./formula-tracker-runtime.js'),
    ]).then(([scheduleModule, assistantModule, trackerModule]) => ({
      schedule: scheduleModule,
      assistant: assistantModule,
      tracker: trackerModule,
    }));
  }
  return panelRuntimePromise.then((runtime) => {
    panelRuntimeLoaded = runtime;
    return runtime;
  });
}

function publishIfReady(app) {
  if (app && typeof app.publishUiState === 'function') {
    app.publishUiState();
  }
}

export function installPanelMethods(SpreadsheetApp) {
  SpreadsheetApp.prototype.setupScheduleDialog = function () {
    if (this._scheduleDialogSetupRequested) return;
    this._scheduleDialogSetupRequested = true;
    loadPanelRuntime().then(({ schedule }) => {
      schedule.setupScheduleDialog(this);
      publishIfReady(this);
    });
  };

  SpreadsheetApp.prototype.setupAssistantPanel = function () {
    if (this._assistantPanelSetupRequested) return;
    this._assistantPanelSetupRequested = true;
    loadPanelRuntime().then(({ assistant }) => {
      assistant.setupAssistantPanel(this);
      publishIfReady(this);
    });
  };

  SpreadsheetApp.prototype.setupFormulaTrackerPanel = function () {
    if (this._formulaTrackerSetupRequested) return;
    this._formulaTrackerSetupRequested = true;
    loadPanelRuntime().then(({ tracker }) => {
      tracker.setupFormulaTrackerPanel(this);
      publishIfReady(this);
    });
  };

  SpreadsheetApp.prototype.toggleAssistantPanel = function () {
    return loadPanelRuntime().then(({ assistant, tracker }) => {
      assistant.toggleAssistantPanel(this);
      tracker.refreshFormulaTrackerPanel(this);
      publishIfReady(this);
    });
  };

  SpreadsheetApp.prototype.hideAssistantPanel = function () {
    return loadPanelRuntime().then(({ assistant, tracker }) => {
      assistant.hideAssistantPanel(this);
      tracker.refreshFormulaTrackerPanel(this);
      publishIfReady(this);
    });
  };

  SpreadsheetApp.prototype.toggleFormulaTrackerPanel = function () {
    return loadPanelRuntime().then(({ tracker }) => {
      tracker.toggleFormulaTrackerPanel(this);
      publishIfReady(this);
    });
  };

  SpreadsheetApp.prototype.hideFormulaTrackerPanel = function () {
    return loadPanelRuntime().then(({ tracker }) => {
      tracker.hideFormulaTrackerPanel(this);
      publishIfReady(this);
    });
  };

  SpreadsheetApp.prototype.getFormulaTrackerUiState = function () {
    if (!this._formulaTrackerSetupRequested || !panelRuntimeLoaded) {
      return { open: false, groups: [], disabled: false };
    }
    return panelRuntimeLoaded.tracker.getFormulaTrackerUiState(this);
  };

  SpreadsheetApp.prototype.refreshFormulaTrackerPanel = function () {
    return loadPanelRuntime().then(({ tracker }) => {
      tracker.refreshFormulaTrackerPanel(this);
      publishIfReady(this);
    });
  };

  SpreadsheetApp.prototype.showScheduleDialogForCell = function (cellId) {
    return loadPanelRuntime().then(({ schedule }) => {
      schedule.showScheduleDialogForCell(this, cellId);
      publishIfReady(this);
    });
  };

  SpreadsheetApp.prototype.showScheduleDialogForContextCell = function () {
    return loadPanelRuntime().then(({ schedule }) => {
      schedule.showScheduleDialogForContextCell(this);
      publishIfReady(this);
    });
  };

  SpreadsheetApp.prototype.hideScheduleDialog = function () {
    return loadPanelRuntime().then(({ schedule }) => {
      schedule.hideScheduleDialog(this);
      publishIfReady(this);
    });
  };

  SpreadsheetApp.prototype.getScheduleDialogUiState = function () {
    if (!this._scheduleDialogSetupRequested || !panelRuntimeLoaded) {
      return { open: false, cellId: '', cron: '', timezone: '', isSaving: false };
    }
    return panelRuntimeLoaded.schedule.getScheduleDialogUiState(this);
  };

  SpreadsheetApp.prototype.getAssistantUiState = function () {
    if (!this._assistantPanelSetupRequested || !panelRuntimeLoaded) {
      return {
        open: false,
        draft: '',
        providerId: '',
        uploads: [],
        messages: [],
        isSubmitting: false,
      };
    }
    return panelRuntimeLoaded.assistant.getAssistantUiState(this);
  };

  SpreadsheetApp.prototype.updateAssistantDraft = function (value) {
    return loadPanelRuntime().then(({ assistant }) => {
      assistant.updateAssistantDraft(this, value);
      publishIfReady(this);
    });
  };

  SpreadsheetApp.prototype.submitAssistantDraft = function (value) {
    return loadPanelRuntime().then(({ assistant }) =>
      assistant.submitAssistantDraft(this, value),
    );
  };

  SpreadsheetApp.prototype.clearAssistantConversation = function () {
    return loadPanelRuntime().then(({ assistant }) => {
      assistant.clearAssistantConversation(this);
      publishIfReady(this);
    });
  };

  SpreadsheetApp.prototype.removeAssistantUpload = function (uploadId) {
    return loadPanelRuntime().then(({ assistant }) => {
      assistant.removeAssistantUpload(this, uploadId);
      publishIfReady(this);
    });
  };

  SpreadsheetApp.prototype.setAssistantProvider = function (providerId) {
    return loadPanelRuntime().then(({ assistant }) => {
      assistant.setAssistantProvider(this, providerId);
      publishIfReady(this);
    });
  };

  SpreadsheetApp.prototype.uploadAssistantFile = function (file) {
    return loadPanelRuntime().then(({ assistant }) =>
      assistant.uploadAssistantFile(this, file),
    );
  };
}
