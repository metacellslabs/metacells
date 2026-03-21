export function ensureEditingSession(app) {
  if (!app.editingSession || typeof app.editingSession !== 'object') {
    app.editingSession = {
      sheetId: '',
      cellId: '',
      draftRaw: '',
      origin: '',
      startedAt: 0,
    };
  }
  return app.editingSession;
}

export function syncEditingSessionWithGridState(app, input, editing) {
  if (!input) return;
  var session = ensureEditingSession(app);
  var cellId = String(input.id || '').toUpperCase();
  var sheetId = String(app.activeSheetId || '');
  if (!cellId || !sheetId) return;

  if (editing) {
    session.sheetId = sheetId;
    session.cellId = cellId;
    session.draftRaw = String(input.value == null ? '' : input.value);
    session.origin = session.origin || 'cell';
    session.startedAt = session.startedAt || Date.now();
    return;
  }

  if (session.sheetId === sheetId && session.cellId === cellId) {
    session.sheetId = '';
    session.cellId = '';
    session.draftRaw = '';
    session.origin = '';
    session.startedAt = 0;
  }
}

export function isEditingCell(app, input) {
  if (!input) return false;
  var session = ensureEditingSession(app);
  var cellId = String(input.id || '').toUpperCase();
  return !!(
    session.sheetId &&
    session.sheetId === String(app.activeSheetId || '') &&
    session.cellId &&
    session.cellId === cellId
  );
}

export function beginEditingSession(app, input, options) {
  if (!input) return;
  var session = ensureEditingSession(app);
  var opts = options || {};
  var cellId = String(input.id || '').toUpperCase();
  var draftRaw =
    opts.draftRaw != null
      ? String(opts.draftRaw)
      : String(input.value == null ? '' : input.value);
  session.sheetId = String(app.activeSheetId || '');
  session.cellId = cellId;
  session.draftRaw = draftRaw;
  session.origin = String(opts.origin || session.origin || 'cell');
  session.startedAt = session.startedAt || Date.now();
}

export function updateEditingSessionDraft(app, value, options) {
  var session = ensureEditingSession(app);
  if (!session.sheetId || !session.cellId) return;
  session.draftRaw = String(value == null ? '' : value);
  if (options && options.origin) {
    session.origin = String(options.origin || '');
  }
}

export function getEditingSessionDraft(app, cellId) {
  var session = ensureEditingSession(app);
  var normalizedCellId = String(cellId || '').toUpperCase();
  if (
    !session.sheetId ||
    session.sheetId !== String(app.activeSheetId || '') ||
    session.cellId !== normalizedCellId
  ) {
    return null;
  }
  return String(session.draftRaw == null ? '' : session.draftRaw);
}

export function clearEditingSession(app, options) {
  var session = ensureEditingSession(app);
  var opts = options || {};
  var targetCellId = String(opts.cellId || '').toUpperCase();
  var targetSheetId = String(
    opts.sheetId == null ? app.activeSheetId || '' : opts.sheetId,
  );
  if (
    targetCellId &&
    (session.cellId !== targetCellId || session.sheetId !== targetSheetId)
  ) {
    return;
  }
  session.sheetId = '';
  session.cellId = '';
  session.draftRaw = '';
  session.origin = '';
  session.startedAt = 0;
}
