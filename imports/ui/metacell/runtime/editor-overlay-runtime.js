function getRelativeCellRect(container, element) {
  if (!container || !element) return null;
  var containerRect = container.getBoundingClientRect();
  var elementRect = element.getBoundingClientRect();
  return {
    left: elementRect.left - containerRect.left + container.scrollLeft,
    top: elementRect.top - containerRect.top + container.scrollTop,
    width: elementRect.width,
    height: elementRect.height,
  };
}

function getViewportCellRect(element) {
  if (!element) return null;
  var rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function syncOverlayInputSelection(app, sourceInput) {
  if (!app || !app.editorOverlayInput || !sourceInput) return;
  var overlayInput = app.editorOverlayInput;
  var start =
    typeof sourceInput.selectionStart === 'number'
      ? sourceInput.selectionStart
      : overlayInput.value.length;
  var end =
    typeof sourceInput.selectionEnd === 'number'
      ? sourceInput.selectionEnd
      : start;
  if (typeof overlayInput.setSelectionRange === 'function') {
    overlayInput.setSelectionRange(start, end);
  }
}

function setSourceOverlayEditingState(app, active) {
  if (!app || !app.activeInput) return;
  app.activeInput.classList.toggle('overlay-source-editing', !!active);
}

export function focusEditorOverlayInput(app) {
  if (!app || !app.editorOverlayInput || !app.activeInput) return;
  if (
    app.editorOverlay.style.display === 'none' ||
    !app.isEditingCell(app.activeInput)
  ) {
    return;
  }
  app.editorOverlayPendingFocus = false;
  app.editorOverlayInput.focus();
  syncOverlayInputSelection(app, app.activeInput);
}

export function syncEditorOverlay(app) {
  if (!app || !app.editorOverlay || !app.tableWrap) return;
  if (
    !app.activeInput ||
    !app.activeInput.parentElement ||
    !app.isEditingCell(app.activeInput) ||
    (app.isReportActive && app.isReportActive())
  ) {
    setSourceOverlayEditingState(app, false);
    hideEditorOverlay(app);
    return;
  }

  var td = app.activeInput.parentElement;
  var relativeRect = getRelativeCellRect(app.tableWrap, td);
  var viewportRect = getViewportCellRect(td);
  if (!relativeRect || !viewportRect) {
    setSourceOverlayEditingState(app, false);
    hideEditorOverlay(app);
    return;
  }

  app.editorOverlay.style.display = 'block';
  app.editorOverlay.style.left = Math.round(relativeRect.left) + 'px';
  app.editorOverlay.style.top = Math.round(relativeRect.top) + 'px';
  app.editorOverlay.style.width =
    Math.max(0, Math.round(relativeRect.width)) + 'px';
  app.editorOverlay.style.height =
    Math.max(0, Math.round(relativeRect.height)) + 'px';
  app.editorOverlay.dataset.cellId = String(app.activeInput.id || '');
  setSourceOverlayEditingState(app, true);
  if (app.editorOverlayInput) {
    app.editorOverlayInput.style.left = Math.round(viewportRect.left) + 'px';
    app.editorOverlayInput.style.top = Math.round(viewportRect.top) + 'px';
    app.editorOverlayInput.style.width =
      Math.max(0, Math.round(viewportRect.width)) + 'px';
    app.editorOverlayInput.style.height =
      Math.max(0, Math.round(viewportRect.height)) + 'px';
    if (document.activeElement !== app.editorOverlayInput) {
      app.editorOverlayInput.value = String(app.activeInput.value || '');
    }
    if (app.editorOverlayPendingFocus) {
      focusEditorOverlayInput(app);
    }
  }
}

export function hideEditorOverlay(app) {
  if (!app || !app.editorOverlay) return;
  setSourceOverlayEditingState(app, false);
  if (app.editorOverlayInput) {
    app.editorOverlayInput.value = '';
  }
  app.editorOverlayPendingFocus = false;
  app.editorOverlay.style.display = 'none';
  app.editorOverlay.dataset.cellId = '';
}

export function setupEditorOverlay(app) {
  if (!app || !app.tableWrap || app.editorOverlay) return;
  if (getComputedStyle(app.tableWrap).position === 'static') {
    app.tableWrap.style.position = 'relative';
  }

  var overlay = document.createElement('div');
  overlay.className = 'cell-editor-overlay';
  overlay.style.display = 'none';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML =
    "<div class='cell-editor-overlay-frame'></div>" +
    "<div class='cell-editor-overlay-label'>Editing</div>" +
    "<input class='cell-editor-overlay-input' spellcheck='false' />";
  app.tableWrap.appendChild(overlay);
  app.editorOverlay = overlay;
  app.editorOverlayInput = overlay.querySelector('.cell-editor-overlay-input');
  app.editorOverlayPendingFocus = false;

  var sync = () => syncEditorOverlay(app);
  app.handleEditorOverlayViewportSync = sync;
  app.tableWrap.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
}
