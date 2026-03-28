import { AI_MODE } from './constants.js';
import {
  getToolbarPickerOpenState,
  setToolbarPickerOpenState,
} from './toolbar-popover-runtime.js';
import { runCommandRecompute } from './command-recompute-facade.js';

function closeDisplayModePicker(app) {
  if (!app || !app.displayModePopover || !app.displayModeButton) return;
  setToolbarPickerOpenState(app, 'displayMode', false);
  if (!app.useReactShellControls) {
    app.displayModePopover.hidden = true;
    app.displayModeButton.setAttribute('aria-expanded', 'false');
  }
  if (app && typeof app.publishUiState === 'function') app.publishUiState();
}

function openDisplayModePicker(app) {
  if (!app || !app.displayModePopover || !app.displayModeButton) return;
  setToolbarPickerOpenState(app, 'displayMode', true);
  if (!app.useReactShellControls) {
    app.displayModePopover.hidden = false;
    app.displayModeButton.setAttribute('aria-expanded', 'true');
  }
  if (app && typeof app.publishUiState === 'function') app.publishUiState();
}

function closeAIModePicker(app) {
  if (!app || !app.aiModePopover || !app.aiModeButton) return;
  setToolbarPickerOpenState(app, 'aiMode', false);
  if (!app.useReactShellControls) {
    app.aiModePopover.hidden = true;
    app.aiModeButton.setAttribute('aria-expanded', 'false');
  }
  if (app && typeof app.publishUiState === 'function') app.publishUiState();
}

function openAIModePicker(app) {
  if (!app || !app.aiModePopover || !app.aiModeButton) return;
  setToolbarPickerOpenState(app, 'aiMode', true);
  if (!app.useReactShellControls) {
    app.aiModePopover.hidden = false;
    app.aiModeButton.setAttribute('aria-expanded', 'true');
  }
  if (app && typeof app.publishUiState === 'function') app.publishUiState();
}

export function syncAIModeControl(app) {
  if (!app || !app.aiModeButton) return;
  var mode = String(app.aiService.getMode() || AI_MODE.manual);
  app.aiModeButton.setAttribute('data-ai-mode-current', mode);
  if (!app.useReactShellControls && app.aiModeOptions && app.aiModeOptions.length) {
    app.aiModeOptions.forEach(function (option) {
      var optionValue = String(option.getAttribute('data-ai-mode') || 'manual');
      option.classList.toggle('is-active', optionValue === mode);
    });
  }
}

export function syncDisplayModeControlCompat(app) {
  if (!app || !app.displayModeButton) return;
  var mode = app.displayMode === 'formulas' ? 'formulas' : 'values';
  app.displayModeButton.setAttribute('data-display-mode-current', mode);
  if (!app.useReactShellControls && app.displayModeOptions && app.displayModeOptions.length) {
    app.displayModeOptions.forEach(function (option) {
      var optionValue = String(
        option.getAttribute('data-display-mode') || 'values',
      );
      option.classList.toggle('is-active', optionValue === mode);
    });
  }
}

export function toggleDisplayModePicker(app) {
  if (!app || !app.displayModePopover) return;
  if (getToolbarPickerOpenState(app, 'displayMode', app.displayModePopover)) {
    closeDisplayModePicker(app);
  } else {
    openDisplayModePicker(app);
  }
}

export function toggleAIModePicker(app) {
  if (!app || !app.aiModePopover) return;
  if (getToolbarPickerOpenState(app, 'aiMode', app.aiModePopover)) {
    closeAIModePicker(app);
  } else {
    openAIModePicker(app);
  }
}

export function applyAIMode(app, mode) {
  if (!app || !app.aiService) return;
  var nextMode = String(mode || AI_MODE.manual);
  app.captureHistorySnapshot('ai-mode');
  app.aiService.setMode(nextMode);
  syncAIModeControl(app);
  app.syncAIModeUI();
  runCommandRecompute(app);
  closeAIModePicker(app);
}

export function applyDisplayMode(app, mode) {
  if (!app) return;
  app.setDisplayMode(String(mode || 'values'));
  syncDisplayModeControlCompat(app);
  closeDisplayModePicker(app);
  if (typeof app.publishUiState === 'function') app.publishUiState();
}

export function setupAIModeControls(app) {
  if (!app.aiModeButton) return;
  app.aiService.setMode(app.storage.getAIMode());
  syncAIModeControl(app);
  app.syncAIModeUI();
  if (app.useReactShellControls) return;
  app.aiModeButton.addEventListener('click', function (event) {
    event.preventDefault();
    toggleAIModePicker(app);
  });
  if (app.aiModePopover) {
    app.aiModePopover.addEventListener('click', function (event) {
      var option =
        event.target && event.target.closest
          ? event.target.closest('.ai-mode-option')
          : null;
      if (!option) return;
      event.preventDefault();
      var mode = String(option.getAttribute('data-ai-mode') || AI_MODE.manual);
      applyAIMode(app, mode);
    });
    document.addEventListener('click', function (event) {
      if (app.aiModePopover.hidden) return;
      var target = event.target;
      if (app.aiModeButton === target) return;
      if (app.aiModeButton.contains && app.aiModeButton.contains(target)) {
        return;
      }
      if (app.aiModePopover.contains && app.aiModePopover.contains(target)) {
        return;
      }
      closeAIModePicker(app);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeAIModePicker(app);
    });
  }
}

export function setupDisplayModeControls(app) {
  if (!app.displayModeButton) return;
  syncDisplayModeControlCompat(app);
  if (app.useReactShellControls) return;
  app.displayModeButton.addEventListener('click', function (event) {
    event.preventDefault();
    toggleDisplayModePicker(app);
  });
  if (app.displayModePopover) {
    app.displayModePopover.addEventListener('click', function (event) {
      var option =
        event.target && event.target.closest
          ? event.target.closest('.display-mode-option')
          : null;
      if (!option) return;
      event.preventDefault();
      applyDisplayMode(
        app,
        String(option.getAttribute('data-display-mode') || 'values'),
      );
    });
    document.addEventListener('click', function (event) {
      if (app.displayModePopover.hidden) return;
      var target = event.target;
      if (app.displayModeButton === target) return;
      if (
        app.displayModeButton.contains &&
        app.displayModeButton.contains(target)
      ) {
        return;
      }
      if (
        app.displayModePopover.contains &&
        app.displayModePopover.contains(target)
      ) {
        return;
      }
      closeDisplayModePicker(app);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeDisplayModePicker(app);
    });
  }
}
