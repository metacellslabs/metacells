export function WorkbookAddTabMenu({ workbookUiState, appRef }) {
  const menuUi =
    workbookUiState && workbookUiState.addTabMenuUi
      ? workbookUiState.addTabMenuUi
      : null;
  const isOpen = menuUi ? menuUi.open === true : false;
  const left = menuUi ? Number(menuUi.left || 0) : 0;
  const top = menuUi ? Number(menuUi.top || 0) : 0;

  const handlePick = (kind) => {
    const app = appRef && appRef.current ? appRef.current : null;
    if (!app) return;
    if (kind === 'report' && typeof app.addReportTab === 'function') {
      app.addReportTab();
    } else if (typeof app.addTab === 'function') {
      app.addTab();
    }
    if (typeof app.hideAddTabMenu === 'function') {
      app.hideAddTabMenu();
    }
  };

  return (
    <div
      className="add-tab-menu"
      hidden={!isOpen}
      style={{
        display: isOpen ? 'flex' : 'none',
        left: `${left}px`,
        top: `${top}px`,
      }}
    >
      <button type="button" className="add-tab-option" onClick={() => handlePick('sheet')}>
        Sheet
      </button>
      <button type="button" className="add-tab-option" onClick={() => handlePick('report')}>
        Report
      </button>
    </div>
  );
}

export function WorkbookContextMenu({ workbookUiState, appRef }) {
  const menuUi =
    workbookUiState && workbookUiState.contextMenuUi
      ? workbookUiState.contextMenuUi
      : null;
  const isOpen = menuUi ? menuUi.open === true : false;
  const left = menuUi ? Number(menuUi.left || 0) : 0;
  const top = menuUi ? Number(menuUi.top || 0) : 0;
  const showCellActions = menuUi ? menuUi.showCellActions === true : false;

  const items = [
    { action: 'insert-row-before', label: 'Insert row before' },
    { action: 'insert-row-after', label: 'Insert row after' },
    { action: 'insert-col-before', label: 'Insert column before' },
    { action: 'insert-col-after', label: 'Insert column after' },
    { action: 'delete-row', label: 'Delete row' },
    { action: 'delete-col', label: 'Delete column' },
    { sep: true },
    { action: 'recalc', label: 'Re-calc', cellOnly: true },
    { action: 'schedule', label: 'Schedule', cellOnly: true },
    { action: 'copy', label: 'Copy' },
    { action: 'paste', label: 'Paste' },
  ];

  const handleAction = (action) => {
    const app = appRef && appRef.current ? appRef.current : null;
    if (!app || typeof app.runContextMenuAction !== 'function') return;
    app.hideContextMenu();
    app.runContextMenuAction(action);
  };

  return (
    <div
      className="sheet-context-menu"
      hidden={!isOpen}
      style={{
        display: isOpen ? 'flex' : 'none',
        left: `${left}px`,
        top: `${top}px`,
      }}
    >
      {items.map((item, index) => {
        if (item.sep) {
          return <div key={`sep-${index}`} className="sheet-context-sep" />;
        }
        if (item.cellOnly && !showCellActions) return null;
        return (
          <button
            key={item.action}
            type="button"
            className="sheet-context-item"
            onClick={() => handleAction(item.action)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
