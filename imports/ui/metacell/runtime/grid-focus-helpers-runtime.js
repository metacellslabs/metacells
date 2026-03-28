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
    typeof activeInput.focus === 'function'
  ) {
    activeInput.focus();
    return true;
  }
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
