import { LucideIcon } from '../icons/LucideIcon.jsx';
import { Link } from '../../router.jsx';
import {
  getWorkbookToolbarSurface,
  getWorkbookToolbarLayoutZone,
  isWorkbookToolbarControlVisible,
} from './workbookToolbarVisibility.js';

export function SheetFormulaBarMainRow({
  workbookName,
  setWorkbookName,
  commitWorkbookRename,
  isRenaming,
  sheetName,
  workbookUiState,
  onUpdateAI,
  onOpenHelp,
  onToggleNamedCellJumpPicker,
  onNavigateToNamedCell,
  onToggleAIModePicker,
  onApplyAIMode,
  onToggleDisplayModePicker,
  onApplyDisplayMode,
}) {
  const ui =
    workbookUiState && typeof workbookUiState === 'object'
      ? workbookUiState
      : {};
  const toolbarSurface = getWorkbookToolbarSurface(ui);
  const isVisible = (control) =>
    isWorkbookToolbarControlVisible('main', control, toolbarSurface);
  const getZoneClassName = (cluster) =>
    `formula-bar-zone formula-bar-zone-${getWorkbookToolbarLayoutZone(
      'main',
      cluster,
    )}`;
  const toolbarUi =
    ui.toolbarUi && typeof ui.toolbarUi === 'object' ? ui.toolbarUi : {};
  const namedCellJumpUi =
    toolbarUi.namedCellJumpUi && typeof toolbarUi.namedCellJumpUi === 'object'
      ? toolbarUi.namedCellJumpUi
      : ui.namedCellJumpUi && typeof ui.namedCellJumpUi === 'object'
        ? ui.namedCellJumpUi
        : {};
  const aiModeUi =
    toolbarUi.aiModeUi && typeof toolbarUi.aiModeUi === 'object'
      ? toolbarUi.aiModeUi
      : ui.aiModeUi && typeof ui.aiModeUi === 'object'
        ? ui.aiModeUi
        : {};
  const displayMode = String(toolbarUi.displayMode || ui.displayMode || 'values');
  const displayModeUi =
    toolbarUi.displayModeUi && typeof toolbarUi.displayModeUi === 'object'
      ? toolbarUi.displayModeUi
      : {};
  const surfaceStatusUi =
    ui.surfaceStatusUi && typeof ui.surfaceStatusUi === 'object'
      ? ui.surfaceStatusUi
      : {};
  const surfaceStatus = String(surfaceStatusUi.status || 'ready');
  const surfaceScope = String(
    surfaceStatusUi.scope || (ui.isReportActive ? 'report' : 'sheet'),
  );
  const surfaceStatusLabel = String(
    surfaceStatusUi.label || (surfaceStatus === 'processing' ? 'Processing' : 'Ready'),
  );
  const surfaceStatusDetail = String(surfaceStatusUi.detail || '');
  const showBrandZone = isVisible('home') || isVisible('workbookName');
  const showAddressZone = isVisible('namedCellInput');
  const showEditorZone = isVisible('formulaInput');
  const showModesZone = isVisible('aiMode') || isVisible('displayMode');
  const showActionsZone = isVisible('updateAi') || isVisible('help');

  return (
    <div className="formula-bar-row formula-bar-row-main">
      {showBrandZone || showAddressZone ? (
        <div className={getZoneClassName('brand')}>
          {showBrandZone ? (
            <div className="formula-cluster formula-cluster-brand">
              <div className="workbook-name-combo">
                {isVisible('home') ? (
                  <Link
                    className="formula-home-link"
                    to="/"
                    aria-label="Home"
                    data-testid="toolbar-home-link"
                  >
                    <LucideIcon>
                      <path d="M3 9.5 12 3l9 6.5" />
                      <path d="M5 10v10a1 1 0 0 0 1 1h4v-6a2 2 0 0 1 2 -2h0a2 2 0 0 1 2 2v6h4a1 1 0 0 0 1 -1V10" />
                    </LucideIcon>
                  </Link>
                ) : null}
                {isVisible('workbookName') ? (
                  <input
                    id="workbook-name-input"
                    type="text"
                    data-testid="workbook-name-input"
                    value={workbookName}
                    onChange={(event) => setWorkbookName(event.target.value)}
                    onBlur={commitWorkbookRename}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        event.currentTarget.blur();
                      }
                      if (event.key === 'Escape') {
                        setWorkbookName(String(sheetName || ''));
                        event.currentTarget.blur();
                      }
                    }}
                    placeholder="Metacell name"
                    disabled={isRenaming}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
          {showAddressZone ? (
            <div className="formula-cluster formula-cluster-address">
              <div className="cell-name-combo">
                <input
                  id="cell-name-input"
                  type="text"
                  data-testid="named-cell-input"
                  placeholder="A1 or @name"
                  defaultValue={String(ui.activeInputId || '')}
                />
                <div className="named-cell-jump-picker">
                  <button
                    id="named-cell-jump"
                    type="button"
                    data-testid="named-cell-jump-button"
                    aria-label="Jump to named cell"
                    title="Jump to named cell"
                    aria-haspopup="menu"
                    aria-expanded={namedCellJumpUi.pickerOpen ? 'true' : 'false'}
                    disabled={namedCellJumpUi.disabled === true}
                    onClick={onToggleNamedCellJumpPicker}
                  >
                    <LucideIcon size={14}>
                      <path d="M6 9l6 6 6-6" />
                    </LucideIcon>
                  </button>
                  <div
                    id="named-cell-jump-popover"
                    className="named-cell-jump-popover"
                    hidden={!namedCellJumpUi.pickerOpen}
                  >
                    {Array.isArray(namedCellJumpUi.items) &&
                    namedCellJumpUi.items.length ? (
                      namedCellJumpUi.items.map((item, index) => {
                        const location =
                          item.cellId ||
                          (item.startCellId && item.endCellId
                            ? `${item.startCellId}:${item.endCellId}`
                            : '');
                        return (
                          <button
                            key={`${item.name}:${item.sheetId}:${location}:${index}`}
                            type="button"
                            data-testid="named-cell-jump-option"
                            className={`named-cell-jump-option${
                              namedCellJumpUi.activeIndex === index ? ' is-active' : ''
                            }`}
                            data-name={item.name}
                            data-sheet-id={String(item.sheetId || '')}
                            data-location={String(location || '')}
                            data-index={index}
                            onClick={() => onNavigateToNamedCell(item.name)}
                          >
                            <span className="named-cell-jump-name">{item.name}</span>
                            <span className="named-cell-jump-location">
                              {item.sheetName}
                              {'!'}
                              {location}
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <span className="named-cell-jump-empty">No named cells</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {showEditorZone ? (
        <div className={getZoneClassName('editor')}>
          <div className="formula-cluster formula-cluster-editor">
            <div className="formula-input-combo">
              <span className="formula-input-prefix" aria-hidden="true">
                Fx
              </span>
              <input
                id="formula-input"
                type="text"
                data-testid="formula-input"
                placeholder="edit active cell formula/value"
                defaultValue={String(ui.formulaValue || '')}
              />
            </div>
            <input
              id="attach-file-input"
              type="file"
              data-testid="attach-file-input"
              hidden
            />
            {isVisible('calcProgress') ? (
              <span
                id="calc-progress"
                data-testid="calc-progress"
                className="calc-progress"
                aria-live="polite"
              ></span>
            ) : null}
            {isVisible('surfaceStatus') ? (
              <span
                className={`surface-status-indicator is-${surfaceStatus}`}
                data-testid="surface-status"
                data-surface-scope={surfaceScope}
                data-surface-status={surfaceStatus}
                data-surface-processing={surfaceStatus === 'processing' ? 'true' : 'false'}
                title={
                  surfaceStatusDetail
                    ? `${surfaceScope}: ${surfaceStatusLabel} (${surfaceStatusDetail})`
                    : `${surfaceScope}: ${surfaceStatusLabel}`
                }
                aria-label={
                  surfaceStatusDetail
                    ? `${surfaceScope} ${surfaceStatusLabel} ${surfaceStatusDetail}`
                    : `${surfaceScope} ${surfaceStatusLabel}`
                }
              >
                <span
                  className="surface-status-indicator-dot"
                  aria-hidden="true"
                ></span>
                <span className="surface-status-indicator-label">
                  {surfaceStatusLabel}
                </span>
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      {showModesZone || showActionsZone ? (
        <div className={getZoneClassName('actions')}>
          {showModesZone ? (
            <div className="formula-cluster formula-cluster-modes">
              <div
                className="formula-icon-select"
                style={{ display: isVisible('aiMode') ? undefined : 'none' }}
              >
                <div className="ai-mode-picker">
                  <button
                    id="ai-mode"
                    type="button"
                    data-testid="ai-mode-button"
                    aria-label="AI mode"
                    title="AI mode"
                    aria-haspopup="menu"
                    aria-expanded={aiModeUi.pickerOpen ? 'true' : 'false'}
                    data-ai-mode-current={String(aiModeUi.mode || 'manual')}
                    onClick={onToggleAIModePicker}
                  >
                    <span className="toolbar-mode-icon" aria-hidden="true">
                      {aiModeUi.mode === 'auto' ? (
                        <LucideIcon size={16}>
                          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
                          <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14Z" />
                          <path d="M5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z" />
                        </LucideIcon>
                      ) : (
                        <LucideIcon size={16}>
                          <path d="M9 11V5a3 3 0 0 1 6 0v6" />
                          <path d="M6 11h12" />
                          <path d="M8 11v4a4 4 0 0 0 8 0v-4" />
                          <path d="M12 19v2" />
                        </LucideIcon>
                      )}
                    </span>
                    <span className="toolbar-mode-label">
                      {aiModeUi.mode === 'auto' ? 'Automatic' : 'Manual'}
                    </span>
                  </button>
                  <div
                    id="ai-mode-popover"
                    className="ai-mode-popover"
                    hidden={!aiModeUi.pickerOpen}
                  >
                    <button
                      type="button"
                      data-testid="ai-mode-option"
                      className={`ai-mode-option${
                        aiModeUi.mode === 'auto' ? ' is-active' : ''
                      }`}
                      data-ai-mode="auto"
                      onClick={() => onApplyAIMode('auto')}
                    >
                      Auto AI
                    </button>
                    <button
                      type="button"
                      data-testid="ai-mode-option"
                      className={`ai-mode-option${
                        !aiModeUi.mode || aiModeUi.mode === 'manual'
                          ? ' is-active'
                          : ''
                      }`}
                      data-ai-mode="manual"
                      onClick={() => onApplyAIMode('manual')}
                    >
                      Manual AI
                    </button>
                  </div>
                </div>
              </div>
              <div
                className="formula-icon-select"
                style={{ display: isVisible('displayMode') ? undefined : 'none' }}
              >
                <div className="display-mode-picker">
                  <button
                    id="display-mode"
                    type="button"
                    data-testid="display-mode-button"
                    aria-label="Display mode"
                    title="Display mode"
                    aria-haspopup="menu"
                    aria-expanded={displayModeUi.pickerOpen ? 'true' : 'false'}
                    data-display-mode-current={displayMode}
                    onClick={onToggleDisplayModePicker}
                  >
                    <span className="toolbar-mode-icon" aria-hidden="true">
                      {displayMode === 'formulas' ? (
                        <LucideIcon size={16}>
                          <path d="M8 5h8" />
                          <path d="M8 19h8" />
                          <path d="M14 5 10 19" />
                        </LucideIcon>
                      ) : (
                        <LucideIcon size={16}>
                          <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
                          <circle cx="12" cy="12" r="2.5" />
                        </LucideIcon>
                      )}
                    </span>
                    <span className="toolbar-mode-label">
                      {displayMode === 'formulas' ? 'Formulas' : 'Values'}
                    </span>
                  </button>
                  <div
                    id="display-mode-popover"
                    className="display-mode-popover"
                    hidden={!displayModeUi.pickerOpen}
                  >
                    <button
                      type="button"
                      data-testid="display-mode-option"
                      className={`display-mode-option${
                        displayMode !== 'formulas' ? ' is-active' : ''
                      }`}
                      data-display-mode="values"
                      onClick={() => onApplyDisplayMode('values')}
                    >
                      Values
                    </button>
                    <button
                      type="button"
                      data-testid="display-mode-option"
                      className={`display-mode-option${
                        displayMode === 'formulas' ? ' is-active' : ''
                      }`}
                      data-display-mode="formulas"
                      onClick={() => onApplyDisplayMode('formulas')}
                    >
                      Formulas
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          {showActionsZone ? (
            <div className="formula-cluster formula-cluster-actions">
              {isVisible('updateAi') ? (
                <button
                  id="update-ai"
                  type="button"
                  data-testid="update-ai-button"
                  onClick={onUpdateAI}
                  disabled={aiModeUi.updateButtonDisabled === true}
                  className={aiModeUi.updateButtonLoading ? 'is-loading' : ''}
                  aria-busy={aiModeUi.updateButtonLoading ? 'true' : 'false'}
                  style={{
                    display:
                      aiModeUi.showUpdateButton === false ? 'none' : undefined,
                  }}
                >
                  {aiModeUi.updateButtonLoading ? 'Updating...' : 'Update'}
                </button>
              ) : null}
              {isVisible('help') ? (
                <button
                  type="button"
                  className="help-button"
                  data-testid="help-button"
                  onClick={onOpenHelp}
                >
                  ?
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
