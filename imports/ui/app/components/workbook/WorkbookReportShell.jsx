import { ReportToolbar } from './ReportToolbar.jsx';
import { getWorkbookToolbarSurface } from './workbookToolbarVisibility.js';

export function WorkbookReportShell({
  workbookUiState,
  appRef,
  onPublishReport,
  onExportPdf,
}) {
  const ui =
    workbookUiState && typeof workbookUiState === 'object'
      ? workbookUiState
      : {};
  const reportUi =
    ui && ui.reportUi && typeof ui.reportUi === 'object' ? ui.reportUi : null;
  const isReportActive = reportUi
    ? reportUi.active === true
    : ui.isReportActive === true;
  const reportMode = reportUi
    ? String(reportUi.mode || 'edit')
    : String(ui.reportMode || 'edit');
  const isView = reportUi ? reportUi.isView === true : reportMode === 'view';
  const commandsDisabled = reportUi
    ? reportUi.commandsDisabled === true
    : isView;
  const canPublish = reportUi ? reportUi.canPublish !== false : isReportActive;
  const canExportPdf = reportUi
    ? reportUi.canExportPdf !== false
    : isReportActive;
  const editorVisible = reportUi ? reportUi.editorVisible === true : !isView;
  const liveVisible = reportUi ? reportUi.liveVisible === true : isView;
  const toolbarCommands =
    reportUi &&
    reportUi.toolbar &&
    reportUi.toolbar.commands &&
    typeof reportUi.toolbar.commands === 'object'
      ? reportUi.toolbar.commands
      : {};
  const selectionInside =
    reportUi && reportUi.toolbar && reportUi.toolbar.selectionInside === true;
  const canExecCommand =
    reportUi && reportUi.toolbar && reportUi.toolbar.canExecCommand === true;
  const commandButtonsDisabled = commandsDisabled || !canExecCommand;
  const toolbarSurface = getWorkbookToolbarSurface(ui);

  const setMode = (mode) => {
    if (
      !appRef ||
      !appRef.current ||
      typeof appRef.current.setReportMode !== 'function'
    ) {
      return;
    }
    appRef.current.setReportMode(mode);
  };

  return (
    <div
      className="report-wrap"
      style={{ display: isReportActive ? 'flex' : 'none' }}
      data-report-mode={reportMode}
      data-report-active={isReportActive ? 'true' : 'false'}
    >
      <ReportToolbar
        isView={isView}
        toolbarSurface={toolbarSurface}
        canPublish={canPublish}
        canExportPdf={canExportPdf}
        toolbarCommands={toolbarCommands}
        commandButtonsDisabled={commandButtonsDisabled}
        selectionInside={selectionInside}
        commandsDisabled={commandsDisabled}
        onSetMode={setMode}
        onPublishReport={onPublishReport}
        onExportPdf={onExportPdf}
      />
      <div
        id="report-editor"
        className="report-editor"
        contentEditable={editorVisible}
        suppressContentEditableWarning
        style={{ display: editorVisible ? 'block' : 'none' }}
      />
      <div
        id="report-live"
        className="report-live"
        style={{ display: liveVisible ? 'block' : 'none' }}
      ></div>
    </div>
  );
}
