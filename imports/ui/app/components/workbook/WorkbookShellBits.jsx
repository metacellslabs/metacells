function TabDocIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h8" />
      <path d="M8 9h2" />
    </svg>
  );
}

export function WorkbookTabBar({
  workbookUiState,
  appRef,
  onOpenPublishDialog,
  publishedMode = false,
  isPreparingPublishDialog = false,
}) {
  const ui =
    workbookUiState && typeof workbookUiState === 'object'
      ? workbookUiState
      : {};
  const tabs = Array.isArray(ui.tabs) ? ui.tabs : [];
  const tabCount = tabs.length;
  return (
    <div
      className="tabs-bar"
      data-workbook-visible-sheet={String(ui.visibleSheetId || '')}
      data-workbook-tab-count={String(tabCount)}
      data-workbook-report-active={ui.isReportActive ? 'true' : 'false'}
    >
      <button
        id="add-tab"
        type="button"
        data-testid="add-tab-button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!appRef || !appRef.current) return;
          if (typeof appRef.current.toggleAddTabMenu === 'function') {
            appRef.current.toggleAddTabMenu();
          }
        }}
      >
        {' '}
        +{' '}
      </button>
      <div id="tabs">
        {tabs.map((tab) => {
          const isActive =
            String(tab && tab.id ? tab.id : '') ===
            String(ui.visibleSheetId || '');
          const isReport = tab && tab.type === 'report';
          const tabId = String(tab && tab.id ? tab.id : '');
          const tabName = String((tab && tab.name) || '');
          const tabType = String((tab && tab.type) || 'sheet');
          return (
            <button
              key={tabId}
              type="button"
              className={`tab-button${isActive ? ' active' : ''}`}
              data-testid="workbook-tab"
              data-sheet-id={tabId}
              data-sheet-name={tabName}
              data-tab-type={tabType}
              data-active={isActive ? 'true' : 'false'}
              draggable
              onClick={() => {
                if (!appRef || !appRef.current) return;
                appRef.current.onTabButtonClick(tabId);
              }}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!appRef || !appRef.current) return;
                appRef.current.renameTabById(tabId);
              }}
              onDragStart={(event) => {
                if (!appRef || !appRef.current) return;
                appRef.current.onTabDragStart(event, tabId);
              }}
              onDragEnd={() => {
                if (!appRef || !appRef.current) return;
                appRef.current.onTabDragEnd();
              }}
              onDragOver={(event) => {
                if (!appRef || !appRef.current) return;
                appRef.current.onTabDragOver(event, tabId);
              }}
              onDrop={(event) => {
                if (!appRef || !appRef.current) return;
                appRef.current.onTabDrop(event, tabId);
              }}
            >
              {isReport ? (
                <span className="tab-doc-icon" aria-hidden="true">
                  <TabDocIcon />
                </span>
              ) : null}
              <span>{tabName}</span>
            </button>
          );
        })}
      </div>
      {!publishedMode ? (
        <button
          type="button"
          className="tabs-publish-button"
          disabled={isPreparingPublishDialog}
          onClick={() => {
            if (isPreparingPublishDialog) return;
            if (typeof onOpenPublishDialog === 'function') {
              onOpenPublishDialog();
            }
          }}
        >
          {isPreparingPublishDialog ? 'Preparing preview...' : 'Publish to hub'}
        </button>
      ) : null}
      <button
        id="delete-tab"
        type="button"
        data-testid="delete-tab-button"
        onClick={() => {
          if (!appRef || !appRef.current) return;
          if (typeof appRef.current.deleteActiveTab === 'function') {
            appRef.current.deleteActiveTab();
          }
        }}
      >
        delete
      </button>
    </div>
  );
}
