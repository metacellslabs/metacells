export function focusCellProxy(app, input) {
  if (!app || !input) return false;
  var proxy =
    app.grid && typeof app.grid.getFocusProxy === 'function'
      ? app.grid.getFocusProxy(input)
      : null;
  if (proxy && typeof proxy.focus === 'function') {
    proxy.focus();
    return true;
  }
  if (typeof input.focus === 'function') {
    input.focus();
    return true;
  }
  return false;
}

export function focusActiveEditor(app) {
  if (!app) return false;
  var activeInput =
    typeof app.getActiveCellInput === 'function'
      ? app.getActiveCellInput()
      : app.activeInput;
  if (
    activeInput &&
    app.isEditingCell(activeInput) &&
    app.editorOverlayInput &&
    app.editorOverlay &&
    app.editorOverlay.style.display !== 'none'
  ) {
    app.editorOverlayPendingFocus = true;
    if (typeof app.focusEditorOverlayInput === 'function') {
      app.focusEditorOverlayInput();
      return true;
    }
    return false;
  }
  if (activeInput) {
    return focusCellProxy(app, activeInput);
  }
  return false;
}

export function restoreGridKeyboardFocusSoon(app) {
  if (!app) return;
  requestAnimationFrame(() => {
    var activeInput =
      typeof app.getActiveCellInput === 'function'
        ? app.getActiveCellInput()
        : app.activeInput;
    var activeEl = document.activeElement;
    var isBusyWithOtherEditor = !!(
      activeEl &&
      (activeEl === app.editorOverlayInput ||
        activeEl === app.formulaInput ||
        activeEl === app.cellNameInput ||
        activeEl === app.reportEditor ||
        (activeEl.tagName === 'INPUT' &&
          activeEl !== activeInput &&
          activeEl !== app.formulaInput &&
          activeEl !== app.cellNameInput) ||
        (activeEl.tagName === 'TEXTAREA' &&
          activeEl !== app.reportEditor &&
          activeEl !== app.formulaInput))
    );
    if (isBusyWithOtherEditor) return;
    if (!activeInput || app.isReportActive()) return;
    focusActiveEditor(app);
  });
}
