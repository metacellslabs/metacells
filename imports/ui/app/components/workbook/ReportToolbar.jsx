import { isWorkbookToolbarControlVisible } from './workbookToolbarVisibility.js';

function ReportCommandIconBold() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h5a3 3 0 0 1 0 6H8z" />
      <path d="M8 12h6a3 3 0 0 1 0 6H8z" />
    </svg>
  );
}

function ReportCommandIconItalic() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 6h-4" />
      <path d="M14 18h-4" />
      <path d="M14 6 10 18" />
    </svg>
  );
}

function ReportCommandIconUnderline() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 5v6a5 5 0 0 0 10 0V5" />
      <path d="M5 19h14" />
    </svg>
  );
}

function ReportCommandIconList() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6h11" />
      <path d="M9 12h11" />
      <path d="M9 18h11" />
      <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ReportToolbar(props) {
  const {
    isView,
    toolbarSurface,
    canPublish,
    canExportPdf,
    toolbarCommands,
    commandButtonsDisabled,
    selectionInside,
    commandsDisabled,
    onSetMode,
    onPublishReport,
    onExportPdf,
  } = props;

  return (
    <div className="report-toolbar">
      {isWorkbookToolbarControlVisible(
        'report',
        'editModeButton',
        toolbarSurface,
      ) ? (
        <button
          type="button"
          className="report-mode"
          data-report-mode="edit"
          onClick={() => onSetMode('edit')}
        >
          Edit
        </button>
      ) : isWorkbookToolbarControlVisible(
          'report',
          'viewModeButton',
          toolbarSurface,
        ) ? (
        <button
          type="button"
          className="report-mode"
          data-report-mode="view"
          onClick={() => onSetMode('view')}
        >
          View
        </button>
      ) : null}
      {isWorkbookToolbarControlVisible('report', 'publish', toolbarSurface) ? (
        <button type="button" className="report-action" onClick={onPublishReport} disabled={!canPublish}>
        Publish
        </button>
      ) : null}
      {isWorkbookToolbarControlVisible('report', 'pdf', toolbarSurface) ? (
        <button type="button" className="report-action" onClick={onExportPdf} disabled={!canExportPdf}>
        PDF
        </button>
      ) : null}
      {!isView &&
      isWorkbookToolbarControlVisible('report', 'bold', toolbarSurface) ? (
        <>
          <button
            type="button"
            className={`report-cmd${toolbarCommands.bold ? ' is-active' : ''}`}
            data-cmd="bold"
            aria-label="Bold"
            title="Bold"
            disabled={commandButtonsDisabled}
            aria-pressed={toolbarCommands.bold ? 'true' : 'false'}
          >
            <ReportCommandIconBold />
          </button>
          {isWorkbookToolbarControlVisible('report', 'italic', toolbarSurface) ? (
          <button
            type="button"
            className={`report-cmd${toolbarCommands.italic ? ' is-active' : ''}`}
            data-cmd="italic"
            aria-label="Italic"
            title="Italic"
            disabled={commandButtonsDisabled}
            aria-pressed={toolbarCommands.italic ? 'true' : 'false'}
          >
            <ReportCommandIconItalic />
          </button>
          ) : null}
          {isWorkbookToolbarControlVisible(
            'report',
            'underline',
            toolbarSurface,
          ) ? (
          <button
            type="button"
            className={`report-cmd${toolbarCommands.underline ? ' is-active' : ''}`}
            data-cmd="underline"
            aria-label="Underline"
            title="Underline"
            disabled={commandButtonsDisabled}
            aria-pressed={toolbarCommands.underline ? 'true' : 'false'}
          >
            <ReportCommandIconUnderline />
          </button>
          ) : null}
          {isWorkbookToolbarControlVisible(
            'report',
            'bulletList',
            toolbarSurface,
          ) ? (
          <button
            type="button"
            className={`report-cmd${toolbarCommands.insertUnorderedList ? ' is-active' : ''}`}
            data-cmd="insertUnorderedList"
            aria-label="Bullet list"
            title="Bullet list"
            disabled={commandButtonsDisabled}
            aria-pressed={toolbarCommands.insertUnorderedList ? 'true' : 'false'}
          >
            <ReportCommandIconList />
          </button>
          ) : null}
        </>
      ) : null}
      {!isView &&
      isWorkbookToolbarControlVisible('report', 'hint', toolbarSurface) ? (
        <span className="report-hint">
          {!selectionInside && !commandsDisabled ? 'Select text to format. ' : ''}
          Mentions: <code>Sheet 1:A1</code>, <code>@named_cell</code>, region <code>@Sheet 1!A1:B10</code>. Inputs: <code>Input:Sheet 1!A1</code> or <code>Input:@named_cell</code>
        </span>
      ) : null}
    </div>
  );
}
