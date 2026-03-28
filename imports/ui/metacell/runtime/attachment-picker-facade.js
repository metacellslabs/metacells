export function getLiveAttachFileInput(app) {
  var input =
    typeof document !== 'undefined'
      ? document.querySelector('#attach-file-input')
      : null;
  if (input && app) app.attachFileInput = input;
  return input || (app && app.attachFileInput) || null;
}

export function ensureAttachFileInputBinding(app) {
  var input = getLiveAttachFileInput(app);
  if (!input || input.__metacellsAttachmentBound) return input;
  input.__metacellsAttachmentBound = true;
  if (
    typeof window !== 'undefined' &&
    !window.__metacellsAttachmentFocusRestoreBound
  ) {
    window.__metacellsAttachmentFocusRestoreBound = true;
    window.addEventListener('focus', function () {
      window.setTimeout(function () {
        if (!app || !app.pendingAttachmentContext) return;
        var liveInput = getLiveAttachFileInput(app) || app.attachFileInput;
        var pendingCtx = app.pendingAttachmentContext || null;
        var pickerState =
          app.pendingAttachmentPickerState &&
          typeof app.pendingAttachmentPickerState === 'object'
            ? app.pendingAttachmentPickerState
            : null;
        if (
          pickerState &&
          pendingCtx &&
          String(pickerState.token || '') !== String(pendingCtx.pickerToken || '')
        ) {
          return;
        }
        var hasSelectedFile = !!(
          liveInput &&
          liveInput.files &&
          typeof liveInput.files.length === 'number' &&
          liveInput.files.length > 0
        );
        if (hasSelectedFile) return;
        if (pickerState && pickerState.changeSeen) return;
        if (
          typeof app.commitPendingAttachmentSelection === 'function'
        ) {
          app.commitPendingAttachmentSelection(null);
        }
      }, 300);
    });
  }
  input.addEventListener('change', function (event) {
    var inputEl =
      (event && event.currentTarget) || getLiveAttachFileInput(app) || input;
    var file = inputEl && inputEl.files && inputEl.files[0];
    if (
      app &&
      app.pendingAttachmentPickerState &&
      typeof app.pendingAttachmentPickerState === 'object'
    ) {
      app.pendingAttachmentPickerState.changeSeen = true;
    }
    if (typeof app.commitPendingAttachmentSelection === 'function') {
      void app.commitPendingAttachmentSelection(file || null);
    }
  });
  return input;
}
