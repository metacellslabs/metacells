export function columnIndexToLabel(index) {
  var n = Number(index) || 0;
  var label = '';
  while (n > 0) {
    var rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

export function buildGridCellMarkup(rowIndex, colIndex) {
  var letter = columnIndexToLabel(colIndex);
  var cellId = letter + rowIndex;
  if (!rowIndex || !colIndex) return rowIndex || letter;
  return (
    "<div class='cell-output'></div>" +
    "<div class='cell-status' aria-hidden='true'></div>" +
    "<div class='cell-schedule-indicator' aria-hidden='true'></div>" +
    "<button type='button' class='cell-focus-proxy' tabindex='0' data-testid='grid-cell-focus-proxy' data-cell-id='" +
    cellId +
    "' aria-label='Select cell " +
    cellId +
    "'></button>" +
    "<input id='" +
    cellId +
    "' class='cell-anchor-input' data-testid='grid-cell-input' data-cell-id='" +
    cellId +
    "' readonly tabindex='-1' aria-hidden='true' aria-readonly='true' autocomplete='off' spellcheck='false'/>" +
    "<div class='cell-actions'>" +
    "<button type='button' class='cell-action cell-action-trigger' data-action='menu' title='More actions' aria-label='More actions'>...</button>" +
    "<div class='cell-action-menu' hidden></div>" +
    '</div>' +
    "<div class='fill-handle'></div>"
  );
}

export function getDirectGridCellChild(cell, className) {
  if (!cell || !className || !cell.children) return null;
  for (var i = 0; i < cell.children.length; i++) {
    var child = cell.children[i];
    if (
      child &&
      child.classList &&
      typeof child.classList.contains === 'function' &&
      child.classList.contains(className)
    ) {
      return child;
    }
  }
  return null;
}

export function removeAllDirectGridCellChildren(cell, className) {
  if (!cell || !className || !cell.children) return 0;
  var removedCount = 0;
  for (var i = cell.children.length - 1; i >= 0; i--) {
    var child = cell.children[i];
    if (
      child &&
      child.classList &&
      typeof child.classList.contains === 'function' &&
      child.classList.contains(className)
    ) {
      cell.removeChild(child);
      removedCount += 1;
    }
  }
  return removedCount;
}

export function removeDirectGridCellChild(cell, className) {
  var child = getDirectGridCellChild(cell, className);
  if (child && child.parentNode === cell) {
    child.parentNode.removeChild(child);
  }
  return child;
}

function buildCellFocusProxy(inputId) {
  var proxy = document.createElement('button');
  proxy.type = 'button';
  proxy.className = 'cell-focus-proxy';
  proxy.tabIndex = 0;
  proxy.dataset.testid = 'grid-cell-focus-proxy';
  proxy.dataset.cellId = String(inputId || '').toUpperCase();
  proxy.setAttribute('aria-label', 'Select cell ' + String(inputId || ''));
  return proxy;
}

function buildCellActions() {
  var actions = document.createElement('div');
  actions.className = 'cell-actions';
  actions.innerHTML =
    "<button type='button' class='cell-action cell-action-trigger' data-action='menu' title='More actions' aria-label='More actions'>...</button>" +
    "<div class='cell-action-menu' hidden></div>";
  return actions;
}

export function ensureGridCellChrome(cell, input) {
  if (!cell || !input) return;
  removeDirectGridCellChild(cell, 'cell-react-shell');
  removeAllDirectGridCellChildren(cell, 'cell-output');
  removeAllDirectGridCellChildren(cell, 'cell-status');
  removeAllDirectGridCellChildren(cell, 'cell-schedule-indicator');
  var output = getDirectGridCellChild(cell, 'cell-output');
  if (!output) {
    output = document.createElement('div');
    output.className = 'cell-output';
    cell.insertBefore(output, cell.firstChild || null);
  }

  var status = getDirectGridCellChild(cell, 'cell-status');
  if (!status) {
    status = document.createElement('div');
    status.className = 'cell-status';
    status.setAttribute('aria-hidden', 'true');
    if (output.nextSibling) cell.insertBefore(status, output.nextSibling);
    else cell.appendChild(status);
  }

  var schedule = getDirectGridCellChild(cell, 'cell-schedule-indicator');
  if (!schedule) {
    schedule = document.createElement('div');
    schedule.className = 'cell-schedule-indicator';
    schedule.setAttribute('aria-hidden', 'true');
    if (status.nextSibling) cell.insertBefore(schedule, status.nextSibling);
    else cell.appendChild(schedule);
  }

  var proxy = getDirectGridCellChild(cell, 'cell-focus-proxy');
  if (!proxy) {
    proxy = buildCellFocusProxy(input.id);
    if (input.parentNode === cell) cell.insertBefore(proxy, input);
    else cell.appendChild(proxy);
  }

  var actions = getDirectGridCellChild(cell, 'cell-actions');
  if (!actions) {
    actions = buildCellActions();
    cell.appendChild(actions);
  }

  var fillHandle = getDirectGridCellChild(cell, 'fill-handle');
  if (!fillHandle) {
    fillHandle = document.createElement('div');
    fillHandle.className = 'fill-handle';
    cell.appendChild(fillHandle);
  }
}

export function getGridCellFocusProxy(input) {
  if (!input || !input.parentElement) return null;
  return getDirectGridCellChild(input.parentElement, 'cell-focus-proxy');
}

export function focusGridCellInput(input) {
  if (!input) return false;
  var focusProxy = getGridCellFocusProxy(input);
  if (focusProxy && typeof focusProxy.focus === 'function') {
    focusProxy.focus();
    return true;
  }
  if (typeof input.focus === 'function') {
    input.focus();
    return true;
  }
  return false;
}
