export function getEditorSelectionRange(app, input) {
  var target =
    input ||
    (app && typeof app.getActiveEditorInput === 'function'
      ? app.getActiveEditorInput()
      : null);
  var value = String(target && target.value != null ? target.value : '');
  var start =
    target && typeof target.selectionStart === 'number'
      ? target.selectionStart
      : value.length;
  var end =
    target && typeof target.selectionEnd === 'number'
      ? target.selectionEnd
      : start;
  return { start: start, end: end };
}

export function setEditorSelectionRange(app, start, end, input) {
  var target =
    input ||
    (app && typeof app.getActiveEditorInput === 'function'
      ? app.getActiveEditorInput()
      : null);
  if (!target || typeof target.setSelectionRange !== 'function') return;
  target.setSelectionRange(start, end);
  if (
    app &&
    app.activeInput &&
    target !== app.activeInput &&
    typeof app.activeInput.setSelectionRange === 'function'
  ) {
    app.activeInput.setSelectionRange(start, end);
  }
}
