import {
  WorkbookAttachmentOverlays,
  WorkbookCellContentLayer,
  WorkbookDebugConsole,
  WorkbookEditorOverlay,
  WorkbookFullscreenOverlay,
  WorkbookLiveIndicators,
  WorkbookMentionAutocomplete,
  WorkbookSelectionOverlay,
} from './WorkbookOverlays.jsx';
import {
  WorkbookAddTabMenu,
  WorkbookAssistantPanel,
  WorkbookContextMenu,
  WorkbookFormulaTrackerPanel,
  WorkbookScheduleDialog,
} from './WorkbookPanels.jsx';
import { WorkbookReportShell } from './WorkbookReportShell.jsx';

export function SheetWorkbookViewport({
  workbookUiState,
  settings,
  appRef,
  cellContentStore,
  onPublishReport,
  onExportPdf,
  children,
}) {
  return (
    <>
      <div className="table-wrap">
        <WorkbookCellContentLayer cellContentStore={cellContentStore} />
        <WorkbookEditorOverlay workbookUiState={workbookUiState} appRef={appRef} />
        <WorkbookSelectionOverlay
          workbookUiState={workbookUiState}
          appRef={appRef}
        />
        <table></table>
      </div>
      <WorkbookMentionAutocomplete
        workbookUiState={workbookUiState}
        appRef={appRef}
      />
      <WorkbookAttachmentOverlays
        workbookUiState={workbookUiState}
        appRef={appRef}
      />
      <WorkbookFullscreenOverlay
        workbookUiState={workbookUiState}
        appRef={appRef}
      />
      <WorkbookAssistantPanel workbookUiState={workbookUiState} appRef={appRef} />
      <WorkbookFormulaTrackerPanel workbookUiState={workbookUiState} appRef={appRef} />
      <WorkbookAddTabMenu workbookUiState={workbookUiState} appRef={appRef} />
      <WorkbookContextMenu workbookUiState={workbookUiState} appRef={appRef} />
      <WorkbookScheduleDialog workbookUiState={workbookUiState} appRef={appRef} />
      <WorkbookReportShell
        workbookUiState={workbookUiState}
        appRef={appRef}
        onPublishReport={onPublishReport}
        onExportPdf={onExportPdf}
      />
      {settings &&
      settings.workbookUi &&
      settings.workbookUi.showDebugConsole === true ? (
        <WorkbookDebugConsole workbookUiState={workbookUiState} />
      ) : null}
      <WorkbookLiveIndicators />
      {children}
    </>
  );
}
