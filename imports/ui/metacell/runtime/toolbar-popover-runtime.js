export function setToolbarPickerOpenState(app, key, isOpen) {
  if (!app) return;
  if (!app.toolbarPopoverState || typeof app.toolbarPopoverState !== 'object') {
    app.toolbarPopoverState = {};
  }
  app.toolbarPopoverState[String(key || '')] = isOpen === true;
}

export function getToolbarPickerOpenState(app, key, fallbackNode) {
  if (
    app &&
    app.toolbarPopoverState &&
    Object.prototype.hasOwnProperty.call(
      app.toolbarPopoverState,
      String(key || ''),
    )
  ) {
    return app.toolbarPopoverState[String(key || '')] === true;
  }
  return !!(fallbackNode && fallbackNode.hidden === false);
}
