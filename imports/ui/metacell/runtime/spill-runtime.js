export function clearSpillVisualState(app, options) {
  if (!app || !Array.isArray(app.inputs)) return;
  var opts = options && typeof options === 'object' ? options : {};
  var rowIndexes = Array.isArray(opts.rowIndexes) ? opts.rowIndexes : null;
  var rowMap = null;
  if (rowIndexes && rowIndexes.length) {
    rowMap = {};
    for (var i = 0; i < rowIndexes.length; i++) {
      var rowIndex = Number(rowIndexes[i]);
      if (!Number.isFinite(rowIndex) || rowIndex < 1) continue;
      rowMap[rowIndex] = true;
    }
  }

  var iterate =
    typeof app.forEachInput === 'function'
      ? app.forEachInput.bind(app)
      : function (callback) {
          (app.inputs || []).forEach(callback);
        };
  iterate(
    function (input) {
      if (!input || !input.parentElement) return;
      var td = input.parentElement;
      var row = td.parentElement;
      if (rowMap && !rowMap[row ? row.rowIndex : 0]) return;
      var output = td.querySelector('.cell-output');
      if (output) {
        output.classList.remove('spill-overflow');
        output.style.width = '';
      }
      td.classList.remove('spill-covered');
      td.classList.remove('spill-source');
    },
    { includeDetached: false },
  );
}

export function applySpillVisualStateFromModel(app, sheetId) {
  if (!app || typeof app.listSpillEntries !== 'function') return;
  var entries = app.listSpillEntries(sheetId || app.activeSheetId);
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (!entry || !entry.sourceCellId) continue;
    var sourceInput =
      typeof app.getCellInput === 'function'
        ? app.getCellInput(String(entry.sourceCellId || '').toUpperCase())
        : app.inputById
          ? app.inputById[String(entry.sourceCellId || '').toUpperCase()]
          : null;
    if (!sourceInput || !sourceInput.parentElement) continue;
    var sourceTd = sourceInput.parentElement;
    var output = sourceTd.querySelector('.cell-output');
    if (!output) continue;
    sourceTd.classList.add('spill-source');
    output.classList.add('spill-overflow');
    output.style.width =
      String(Math.max(0, Number(entry.appliedWidth || 0))) + 'px';
    var coveredCellIds = Array.isArray(entry.coveredCellIds)
      ? entry.coveredCellIds
      : [];
    for (var c = 0; c < coveredCellIds.length; c++) {
      var coveredInput =
        typeof app.getCellInput === 'function'
          ? app.getCellInput(String(coveredCellIds[c] || '').toUpperCase())
          : app.inputById
            ? app.inputById[String(coveredCellIds[c] || '').toUpperCase()]
            : null;
      if (!coveredInput || !coveredInput.parentElement) continue;
      coveredInput.parentElement.classList.add('spill-covered');
    }
  }
}
