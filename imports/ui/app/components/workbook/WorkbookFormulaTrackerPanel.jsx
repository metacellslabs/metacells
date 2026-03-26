export function WorkbookFormulaTrackerPanel({ workbookUiState, appRef }) {
  const trackerUi =
    workbookUiState && workbookUiState.formulaTrackerUi
      ? workbookUiState.formulaTrackerUi
      : null;
  const entries =
    trackerUi && Array.isArray(trackerUi.entries) ? trackerUi.entries : [];
  const isOpen = trackerUi ? trackerUi.open === true : false;
  const activeSheetId = trackerUi ? String(trackerUi.activeSheetId || '') : '';
  const activeCellId = trackerUi ? String(trackerUi.activeCellId || '') : '';
  const withAssistantOffset =
    trackerUi ? trackerUi.withAssistantOffset === true : false;

  const handleClose = () => {
    if (
      !appRef.current ||
      typeof appRef.current.hideFormulaTrackerPanel !== 'function'
    ) {
      return;
    }
    appRef.current.hideFormulaTrackerPanel();
  };

  const handleSelect = (sheetId, cellId) => {
    if (!appRef.current) return;
    const targetSheetId = String(sheetId || '');
    const targetCellId = String(cellId || '').toUpperCase();
    if (!targetSheetId || !targetCellId) return;
    if (
      targetSheetId !== String(appRef.current.activeSheetId || '') &&
      typeof appRef.current.switchToSheet === 'function'
    ) {
      appRef.current.switchToSheet(targetSheetId);
    }
    window.requestAnimationFrame(() => {
      const input =
        appRef.current && typeof appRef.current.getCellInput === 'function'
          ? appRef.current.getCellInput(targetCellId)
          : appRef.current && appRef.current.inputById
            ? appRef.current.inputById[targetCellId]
            : null;
      if (!input) return;
      appRef.current.setActiveInput(input);
      if (typeof input.focus === 'function') input.focus();
      if (typeof appRef.current.refreshFormulaTrackerPanel === 'function') {
        appRef.current.refreshFormulaTrackerPanel();
      }
    });
  };

  return (
    <aside
      className={`formula-tracker-panel${
        withAssistantOffset ? ' with-assistant-offset' : ''
      }`}
      hidden={!isOpen}
      style={{ display: isOpen ? 'flex' : 'none' }}
    >
      <div className="formula-tracker-head">
        <div className="formula-tracker-title-wrap">
          <div className="formula-tracker-title">Automation</div>
          <div className="formula-tracker-subtitle">Channel and scheduled cells</div>
        </div>
        <button
          type="button"
          className="formula-tracker-close"
          aria-label="Close"
          onClick={handleClose}
        >
          ×
        </button>
      </div>
      <div className="formula-tracker-list">
        {entries.length ? (
          entries.map((entry) => (
            <button
              key={`${entry.sheetId}:${entry.cellId}`}
              type="button"
              className={`formula-tracker-item${
                String(entry.sheetId || '') === activeSheetId &&
                String(entry.cellId || '').toUpperCase() === activeCellId
                  ? ' active'
                  : ''
              }`}
              onClick={() => handleSelect(entry.sheetId, entry.cellId)}
            >
              <div className="formula-tracker-item-title">
                {entry.sheetName} · {entry.cellId}
              </div>
              <div className="formula-tracker-item-meta">
                {Array.isArray(entry.tags) ? entry.tags.join(' · ') : ''}
              </div>
              <div className="formula-tracker-item-preview">
                {String(entry.raw || '').trim() || '(empty)'}
              </div>
            </button>
          ))
        ) : (
          <div className="formula-tracker-empty">
            No channel or scheduled cells yet.
          </div>
        )}
      </div>
    </aside>
  );
}
