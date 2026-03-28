import { LucideIcon } from '../icons/LucideIcon.jsx';
import { getFontFamilyLabel, getFormatLabel } from './WorkbookLabels.js';

const STANDARD_BG_COLORS = [
  ['#fff7cc', 'Soft yellow'],
  ['#e6f4f1', 'Mint'],
  ['#dce9ff', 'Blue'],
  ['#fde2e4', 'Rose'],
  ['#f1e7ff', 'Lavender'],
  ['#f4f1ea', 'Sand'],
  ['#ffd9b8', 'Peach'],
  ['#d9f0d2', 'Green'],
  ['#d7ebff', 'Sky'],
];

const BORDER_PRESETS = [
  ['none', <><rect x="5" y="5" width="14" height="14" rx="1.5" /><path d="M7 17L17 7" /></>],
  ['all', <><rect x="5" y="5" width="14" height="14" rx="1.5" /><path d="M12 5v14" /><path d="M5 12h14" /></>],
  ['outer', <rect x="5" y="5" width="14" height="14" rx="1.5" />],
  ['inner', <><rect x="5" y="5" width="14" height="14" rx="1.5" opacity="0.28" /><path d="M12 5v14" /><path d="M5 12h14" /></>],
  ['top', <><path d="M5 7h14" /><rect x="5" y="5" width="14" height="14" rx="1.5" opacity="0.18" /></>],
  ['bottom', <><path d="M5 17h14" /><rect x="5" y="5" width="14" height="14" rx="1.5" opacity="0.18" /></>],
  ['left', <><path d="M7 5v14" /><rect x="5" y="5" width="14" height="14" rx="1.5" opacity="0.18" /></>],
  ['right', <><path d="M17 5v14" /><rect x="5" y="5" width="14" height="14" rx="1.5" opacity="0.18" /></>],
];

export function SheetFormulaBarFormatRow({
  workbookUiState,
  bgColorCustomValue,
  setBgColorCustomValue,
  onAttachFileClick,
  onUndo,
  onRedo,
  onToggleCellFormatPicker,
  onApplyCellFormat,
  onAdjustDecimalPlaces,
  onApplyCellAlign,
  onToggleCellBordersPicker,
  onApplyCellBordersPreset,
  onToggleBgColorPicker,
  onApplyCellBgColor,
  onAdjustFontSize,
  onToggleCellFontFamilyPicker,
  onApplyCellFontFamily,
  onToggleCellWrap,
  onToggleCellBold,
  onToggleCellItalic,
  onToggleAssistantPanel,
  onToggleFormulaTrackerPanel,
  onApplyChannelBindingSelection,
  onHandleRegionRecording,
  onDownloadRegionRecording,
}) {
  const toolbarUi =
    workbookUiState &&
    workbookUiState.toolbarUi &&
    typeof workbookUiState.toolbarUi === 'object'
      ? workbookUiState.toolbarUi
      : {};
  const formulaBarUi =
    toolbarUi.formulaBarUi && typeof toolbarUi.formulaBarUi === 'object'
      ? toolbarUi.formulaBarUi
      : workbookUiState &&
          workbookUiState.formulaBarUi &&
          typeof workbookUiState.formulaBarUi === 'object'
        ? workbookUiState.formulaBarUi
        : {};

  return (
    <div className="formula-bar-row formula-bar-row-format">
      <div className="formula-cluster formula-cluster-format">
        <button
          id="undo-action"
          type="button"
          data-testid="toolbar-undo-button"
          aria-label="Undo"
          title="Undo"
          onClick={onUndo}
        >
          <LucideIcon size={18}>
            <path d="m9 14-5-5 5-5" />
            <path d="M4 9h11a4 4 0 1 1 0 8h-1" />
          </LucideIcon>
        </button>
        <button
          id="redo-action"
          type="button"
          data-testid="toolbar-redo-button"
          aria-label="Redo"
          title="Redo"
          onClick={onRedo}
        >
          <LucideIcon size={18}>
            <path d="m15 14 5-5-5-5" />
            <path d="M20 9H9a4 4 0 1 0 0 8h1" />
          </LucideIcon>
        </button>
      </div>
      <div className="formula-cluster formula-cluster-format">
        <div className="formula-icon-select">
          <div className="cell-format-picker">
            <button
              id="cell-format"
              type="button"
              data-testid="cell-format-button"
              aria-label="Cell format"
              title="Cell format"
              aria-haspopup="dialog"
              aria-expanded={formulaBarUi.formatPickerOpen ? 'true' : 'false'}
              disabled={formulaBarUi.disabled === true}
              onClick={onToggleCellFormatPicker}
            >
              {getFormatLabel(formulaBarUi.currentFormat)}
            </button>
            <div
              id="cell-format-popover"
              className="cell-format-popover"
              hidden={!formulaBarUi.formatPickerOpen}
            >
              {[
                'text',
                'number',
                'number_0',
                'number_2',
                'percent',
                'percent_2',
                'date',
                'currency_usd',
                'currency_eur',
                'currency_gbp',
              ].map((format) => (
                <button
                  key={format}
                  type="button"
                  data-testid="cell-format-option"
                  className={`cell-format-option${
                    formulaBarUi.currentFormat === format ? ' is-active' : ''
                  }`}
                  data-format={format}
                  onClick={() => onApplyCellFormat(format)}
                >
                  {getFormatLabel(format)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button
          id="cell-decimals-decrease"
          type="button"
          data-testid="cell-decimals-decrease-button"
          aria-label="Decrease decimals"
          title="Decrease decimals"
          disabled={formulaBarUi.decimalsDisabled === true}
          onClick={() => onAdjustDecimalPlaces(-1)}
        >
          <LucideIcon size={16}>
            <path d="M4.5 8h8" />
            <path d="M4.5 16h5" />
            <path d="M13.5 9.5v7" />
            <path d="M16.5 12.5v4" />
            <path d="M19 14.5h-5" />
          </LucideIcon>
        </button>
        <button
          id="cell-decimals-increase"
          type="button"
          data-testid="cell-decimals-increase-button"
          aria-label="Increase decimals"
          title="Increase decimals"
          disabled={formulaBarUi.decimalsDisabled === true}
          onClick={() => onAdjustDecimalPlaces(1)}
        >
          <LucideIcon size={16}>
            <path d="M4.5 8h8" />
            <path d="M4.5 16h5" />
            <path d="M13.5 9.5v7" />
            <path d="M16.5 12.5v4" />
            <path d="M19 14.5h-5" />
            <path d="M16.5 17.5v-6" />
          </LucideIcon>
        </button>
      </div>
      <div className="formula-cluster formula-cluster-format">
        <div className="formula-icon-select">
          <div
            id="cell-align"
            className="cell-align-group"
            role="group"
            aria-label="Cell align"
          >
            {['left', 'center', 'right'].map((align) => (
              <button
                key={align}
                type="button"
                data-testid="cell-align-button"
                className={`cell-align-button${
                  formulaBarUi.align === align ? ' is-active' : ''
                }`}
                data-align={align}
                onClick={() => onApplyCellAlign(align)}
                aria-label={`Align ${align}`}
                title={`Align ${align}`}
              >
                <LucideIcon size={16}>
                  <path d="M5 7h14" />
                  <path
                    d={
                      align === 'left'
                        ? 'M5 12h10'
                        : align === 'center'
                          ? 'M7 12h10'
                          : 'M9 12h10'
                    }
                  />
                  <path d="M5 17h14" />
                </LucideIcon>
              </button>
            ))}
          </div>
        </div>
        <div className="formula-icon-select">
          <div className="cell-borders-picker">
            <button
              id="cell-borders"
              type="button"
              data-testid="cell-borders-button"
              aria-label="Cell borders"
              title="Cell borders"
              aria-haspopup="menu"
              aria-expanded={formulaBarUi.bordersPickerOpen ? 'true' : 'false'}
              disabled={formulaBarUi.disabled === true}
              data-border-preset={String(formulaBarUi.bordersPreset || 'none')}
              onClick={onToggleCellBordersPicker}
            >
              <LucideIcon size={18}>
                <rect x="5" y="5" width="14" height="14" rx="1.5" />
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </LucideIcon>
            </button>
            <div
              id="cell-borders-popover"
              className="cell-borders-popover"
              hidden={!formulaBarUi.bordersPickerOpen}
            >
              {BORDER_PRESETS.map(([preset, icon]) => (
                <button
                  key={preset}
                  type="button"
                  data-testid="cell-borders-option"
                  className={`cell-borders-option${
                    String(formulaBarUi.bordersPreset || 'none') === preset
                      ? ' is-active'
                      : ''
                  }`}
                  data-preset={preset}
                  onClick={() => onApplyCellBordersPreset(preset)}
                  aria-label={`${preset} border`}
                  title={`${preset} border`}
                >
                  <LucideIcon size={16}>{icon}</LucideIcon>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="formula-cluster formula-cluster-format">
        <div className="formula-icon-select">
          <div className="cell-bg-color-picker">
            <button
              id="cell-bg-color"
              type="button"
              data-testid="cell-bg-color-button"
              aria-label="Cell background color"
              title="Cell background color"
              aria-haspopup="dialog"
              aria-expanded={formulaBarUi.bgColorPickerOpen ? 'true' : 'false'}
              disabled={formulaBarUi.disabled === true}
              data-has-color={formulaBarUi.backgroundColor ? 'true' : 'false'}
              onClick={onToggleBgColorPicker}
            >
              <span
                id="cell-bg-color-swatch"
                className="cell-bg-color-swatch"
                aria-hidden="true"
                style={{
                  backgroundColor:
                    formulaBarUi.backgroundColor || 'transparent',
                }}
              ></span>
            </button>
            <div
              id="cell-bg-color-popover"
              className="cell-bg-color-popover"
              hidden={!formulaBarUi.bgColorPickerOpen}
            >
              <div className="cell-bg-color-section">
                <span className="cell-bg-color-heading">Standard</span>
                <div className="cell-bg-color-grid">
                  <button
                    type="button"
                    data-testid="cell-bg-color-option"
                    className={`cell-bg-color-chip is-none${
                      !formulaBarUi.backgroundColor ? ' is-active' : ''
                    }`}
                    data-color=""
                    onClick={() => onApplyCellBgColor('')}
                    title="No fill"
                  >
                    <span className="cell-bg-color-chip-label">None</span>
                  </button>
                  {STANDARD_BG_COLORS.map(([color, title]) => (
                    <button
                      key={color}
                      type="button"
                      data-testid="cell-bg-color-option"
                      className={`cell-bg-color-chip${
                        formulaBarUi.backgroundColor === color
                          ? ' is-active'
                          : ''
                      }`}
                      data-color={color}
                      onClick={() => onApplyCellBgColor(color)}
                      title={title}
                      style={{ '--chip-color': color }}
                    ></button>
                  ))}
                </div>
              </div>
              <div className="cell-bg-color-section">
                <span className="cell-bg-color-heading">Recent</span>
                <div
                  id="cell-bg-color-recent"
                  className="cell-bg-color-grid cell-bg-color-grid-recent"
                >
                  {Array.isArray(formulaBarUi.recentBgColors) &&
                  formulaBarUi.recentBgColors.length ? (
                    formulaBarUi.recentBgColors.map((color) => (
                      <button
                        key={color}
                        type="button"
                        data-testid="cell-bg-color-option"
                        className={`cell-bg-color-chip${
                          formulaBarUi.backgroundColor === color
                            ? ' is-active'
                            : ''
                        }`}
                        data-color={color}
                        onClick={() => onApplyCellBgColor(color)}
                        title={color}
                        style={{ '--chip-color': color }}
                      ></button>
                    ))
                  ) : (
                    <span className="cell-bg-color-empty">No recent colors</span>
                  )}
                </div>
              </div>
              <label
                className="cell-bg-color-custom"
                htmlFor="cell-bg-color-custom"
              >
                <span className="cell-bg-color-heading">Custom</span>
                <input
                  id="cell-bg-color-custom"
                  type="color"
                  data-testid="cell-bg-color-custom-input"
                  value={bgColorCustomValue}
                  onChange={(event) => setBgColorCustomValue(event.target.value)}
                  onBlur={(event) => onApplyCellBgColor(event.target.value)}
                />
              </label>
            </div>
          </div>
        </div>
        <div className="formula-icon-select">
          <button
            id="cell-font-size-decrease"
            type="button"
            data-testid="cell-font-size-decrease-button"
            aria-label="Decrease font size"
            title="Decrease font size"
            disabled={formulaBarUi.fontSizeDisabled === true}
            onClick={() => onAdjustFontSize(-1)}
          >
            <LucideIcon size={16}>
              <path d="M6 12h12" />
            </LucideIcon>
          </button>
          <div className="cell-font-family-picker">
            <button
              id="cell-font-family"
              type="button"
              data-testid="cell-font-family-button"
              aria-label="Cell font family"
              title="Cell font family"
              aria-haspopup="menu"
              aria-expanded={formulaBarUi.fontFamilyPickerOpen ? 'true' : 'false'}
              disabled={formulaBarUi.disabled === true}
              data-font-family-current={String(
                formulaBarUi.fontFamily || 'default',
              )}
              onClick={onToggleCellFontFamilyPicker}
            >
              {getFontFamilyLabel(formulaBarUi.fontFamily)}
            </button>
            <div
              id="cell-font-family-popover"
              className="cell-font-family-popover"
              hidden={!formulaBarUi.fontFamilyPickerOpen}
            >
              {[
                ['default', 'System UI', 'inherit'],
                ['sans', 'Trebuchet MS', '"Trebuchet MS", "Segoe UI", sans-serif'],
                ['serif', 'Georgia', 'Georgia, "Times New Roman", serif'],
                ['mono', 'SF Mono', '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace'],
                ['display', 'Avenir Next', '"Avenir Next", "Gill Sans", "Trebuchet MS", sans-serif'],
              ].map(([fontFamily, label, styleFontFamily]) => (
                <button
                  key={fontFamily}
                  type="button"
                  data-testid="cell-font-family-option"
                  className={`cell-font-family-option${
                    String(formulaBarUi.fontFamily || 'default') === fontFamily
                      ? ' is-active'
                      : ''
                  }`}
                  data-font-family={fontFamily}
                  style={{ fontFamily: styleFontFamily }}
                  onClick={() => onApplyCellFontFamily(fontFamily)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button
            id="cell-font-size-increase"
            type="button"
            data-testid="cell-font-size-increase-button"
            aria-label="Increase font size"
            title="Increase font size"
            disabled={formulaBarUi.fontSizeDisabled === true}
            onClick={() => onAdjustFontSize(1)}
          >
            <LucideIcon size={16}>
              <path d="M6 12h12" />
              <path d="M12 6v12" />
            </LucideIcon>
          </button>
        </div>
        <button
          id="cell-wrap"
          type="button"
          data-testid="cell-wrap-button"
          aria-label="Wrap content"
          title="Wrap content"
          disabled={formulaBarUi.disabled === true}
          className={formulaBarUi.wrapText ? 'is-active' : ''}
          onClick={onToggleCellWrap}
        >
          <LucideIcon size={16}>
            <path d="M4 6v6a4 4 0 0 0 4 4h11" />
            <path d="m15 14 4 4-4 4" />
            <path d="M4 10h8" />
          </LucideIcon>
        </button>
        <button
          id="cell-bold"
          type="button"
          data-testid="cell-bold-button"
          aria-label="Bold"
          title="Bold"
          disabled={formulaBarUi.disabled === true}
          className={formulaBarUi.bold ? 'is-active' : ''}
          onClick={onToggleCellBold}
        >
          <LucideIcon size={18}>
            <path d="M8 6h5a3 3 0 0 1 0 6H8z" />
            <path d="M8 12h6a3 3 0 0 1 0 6H8z" />
          </LucideIcon>
        </button>
        <button
          id="cell-italic"
          type="button"
          data-testid="cell-italic-button"
          aria-label="Italic"
          title="Italic"
          disabled={formulaBarUi.disabled === true}
          className={formulaBarUi.italic ? 'is-active' : ''}
          onClick={onToggleCellItalic}
        >
          <LucideIcon size={18}>
            <path d="M14 6h-4" />
            <path d="M14 18h-4" />
            <path d="M14 6 10 18" />
          </LucideIcon>
        </button>
      </div>
      <div className="formula-cluster formula-cluster-format">
        <select
          id="bind-channel-mode-select"
          data-testid="bind-channel-mode-select"
          className="toolbar-channel-mode-select"
          aria-label="Choose channel formula mode"
          title="Choose how the active cell uses channel events"
          value={String(formulaBarUi.channelMode || 'table')}
          disabled={formulaBarUi.channelDisabled === true}
          onChange={(event) =>
            onApplyChannelBindingSelection(
              formulaBarUi.channelLabel || '',
              event.target.value,
            )
          }
        >
          <option value="table"># Table</option>
          <option value="list">&gt; List</option>
          <option value="note">' Note</option>
          <option value="log">Log</option>
        </select>
        <select
          id="bind-channel-select"
          data-testid="bind-channel-select"
          className="toolbar-channel-select"
          aria-label="Bind channel to active cell"
          title="Bind incoming channel events to active cell"
          value={String(formulaBarUi.channelLabel || '')}
          disabled={formulaBarUi.channelDisabled === true}
          onChange={(event) =>
            onApplyChannelBindingSelection(
              event.target.value,
              formulaBarUi.channelMode || 'table',
            )
          }
        >
          <option value="">Channel</option>
          {Array.isArray(formulaBarUi.channelOptions)
            ? formulaBarUi.channelOptions.map((channel) => (
                <option key={channel.id || channel.label} value={channel.label}>
                  {channel.label}
                </option>
              ))
            : null}
        </select>
        <button
          id="attach-file"
          type="button"
          data-testid="attach-file-button"
          aria-label="Attach file"
          title="Attach file"
          onClick={onAttachFileClick}
        >
          <LucideIcon size={16}>
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L8.76 18.07a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </LucideIcon>
        </button>
        <button
          id="assistant-chat-button"
          type="button"
          data-testid="assistant-chat-button"
          aria-label="Open AI assistant"
          title="Open AI assistant"
          onClick={onToggleAssistantPanel}
        >
          <LucideIcon size={16}>
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
            <path d="M8 9h8" />
            <path d="M8 13h5" />
          </LucideIcon>
        </button>
        <button
          id="formula-tracker-button"
          type="button"
          data-testid="formula-tracker-button"
          aria-label="Open automation list"
          title="Open automation list"
          onClick={onToggleFormulaTrackerPanel}
        >
          <LucideIcon size={16}>
            <path d="M9 6h11" />
            <path d="M9 12h11" />
            <path d="M9 18h11" />
            <path d="M4 6h.01" />
            <path d="M4 12h.01" />
            <path d="M4 18h.01" />
          </LucideIcon>
        </button>
      </div>
      <div
        id="region-recording-controls"
        className="formula-cluster formula-cluster-format region-recording-controls"
        hidden={!formulaBarUi.regionRecordingUi?.visible}
      >
        <button
          id="record-region"
          type="button"
          data-testid="record-region-button"
          aria-label="Record selected region"
          title="Record selected region"
          hidden={!formulaBarUi.regionRecordingUi?.visible}
          disabled={formulaBarUi.regionRecordingUi?.canRecord === false}
          onClick={onHandleRegionRecording}
        >
          <LucideIcon size={16}>
            <circle cx="12" cy="12" r="4.5" />
          </LucideIcon>
          <span id="record-region-label">
            {formulaBarUi.regionRecordingUi?.label || 'Record'}
          </span>
        </button>
        <button
          id="download-region-recording"
          type="button"
          data-testid="download-region-recording-button"
          aria-label="Download region GIF"
          title="Download region GIF"
          hidden={!formulaBarUi.regionRecordingUi?.showDownload}
          disabled={!formulaBarUi.regionRecordingUi?.showDownload}
          onClick={onDownloadRegionRecording}
        >
          <LucideIcon size={16}>
            <path d="M12 3v12" />
            <path d="m7 10 5 5 5-5" />
            <path d="M5 21h14" />
          </LucideIcon>
          Download GIF
        </button>
      </div>
    </div>
  );
}
