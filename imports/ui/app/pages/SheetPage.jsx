import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { rpc } from '../../../../lib/rpc-client.js';
import { subscribeServerEvents } from '../../../../lib/transport/ws-client.js';
import { createCellContentStore } from '../../metacell/runtime/cell-content-store.js';
import { Link, useNavigate, useParams } from '../router.jsx';

const SheetFormulaBarMainRow = lazy(() =>
  import('../components/workbook/SheetFormulaBarMainRow.jsx').then((module) => ({
    default: module.SheetFormulaBarMainRow,
  })),
);
const SheetFormulaBarFormatRow = lazy(() =>
  import('../components/workbook/SheetFormulaBarFormatRow.jsx').then((module) => ({
    default: module.SheetFormulaBarFormatRow,
  })),
);
const SheetWorkbookViewport = lazy(() =>
  import('../components/workbook/SheetWorkbookViewport.jsx').then((module) => ({
    default: module.SheetWorkbookViewport,
  })),
);
const WorkbookTabBar = lazy(() =>
  import('../components/workbook/WorkbookShellBits.jsx').then((module) => ({
    default: module.WorkbookTabBar,
  })),
);

let workbookRuntimeDepsPromise = null;

function parseAttachmentSource(rawValue) {
  const raw = String(rawValue || '');
  if (!raw.startsWith('__ATTACHMENT__:')) return null;
  try {
    const parsed = JSON.parse(raw.slice('__ATTACHMENT__:'.length));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function attachmentCompletenessScore(attachment) {
  const meta = attachment && typeof attachment === 'object' ? attachment : null;
  if (!meta) return -1;
  let score = 0;
  if (meta.pending === true) score -= 2;
  if (meta.converting === true) score -= 2;
  if (String(meta.binaryArtifactId || '').trim()) score += 4;
  if (String(meta.contentArtifactId || '').trim()) score += 3;
  if (String(meta.downloadUrl || meta.url || '').trim()) score += 3;
  if (String(meta.previewUrl || '').trim()) score += 2;
  if (String(meta.content || '').trim()) score += 2;
  if (String(meta.name || '').trim()) score += 1;
  if (String(meta.type || '').trim()) score += 1;
  return score;
}

function preserveMoreCompleteLocalAttachments(storage, nextWorkbook) {
  if (
    !storage ||
    typeof storage.snapshot !== 'function' ||
    !nextWorkbook ||
    typeof nextWorkbook !== 'object'
  ) {
    return nextWorkbook;
  }
  const localWorkbook = storage.snapshot();
  const localSheets =
    localWorkbook && localWorkbook.sheets && typeof localWorkbook.sheets === 'object'
      ? localWorkbook.sheets
      : {};
  const mergedWorkbook = {
    ...nextWorkbook,
    sheets:
      nextWorkbook && nextWorkbook.sheets && typeof nextWorkbook.sheets === 'object'
        ? { ...nextWorkbook.sheets }
        : {},
  };

  Object.keys(localSheets).forEach((sheetId) => {
    const localSheet = localSheets[sheetId];
    const localCells =
      localSheet && localSheet.cells && typeof localSheet.cells === 'object'
        ? localSheet.cells
        : {};
    Object.keys(localCells).forEach((cellId) => {
      const localCell = localCells[cellId];
      const localRaw = String((localCell && localCell.source) || '');
      const localAttachment = parseAttachmentSource(localRaw);
      if (!localAttachment) return;
      const remoteSheet = mergedWorkbook.sheets[sheetId];
      const remoteCells =
        remoteSheet && remoteSheet.cells && typeof remoteSheet.cells === 'object'
          ? remoteSheet.cells
          : {};
      const remoteCell = remoteCells[cellId];
      const remoteRaw = String((remoteCell && remoteCell.source) || '');
      const remoteAttachment = parseAttachmentSource(remoteRaw);
      if (
        attachmentCompletenessScore(localAttachment) <=
        attachmentCompletenessScore(remoteAttachment)
      ) {
        return;
      }
      mergedWorkbook.sheets[sheetId] = {
        ...(mergedWorkbook.sheets[sheetId] || {}),
        cells: {
          ...remoteCells,
          [cellId]: {
            ...(remoteCell || {}),
            ...(localCell || {}),
          },
        },
      };
    });
  });

  return mergedWorkbook;
}

function loadWorkbookRuntimeDeps() {
  if (!workbookRuntimeDepsPromise) {
    workbookRuntimeDepsPromise = Promise.all([
      import('../../../api/sheets/workbook-codec.js'),
      import('../../metacell/sheetDocStorage.js'),
      import('../../metacell/runtime/index.js'),
    ]).then(([codecModule, storageModule, runtimeModule]) => ({
      decodeWorkbookDocument: codecModule.decodeWorkbookDocument,
      createSheetDocStorage: storageModule.createSheetDocStorage,
      mountSpreadsheetApp: runtimeModule.mountSpreadsheetApp,
    }));
  }
  return workbookRuntimeDepsPromise;
}

function isWorkbookHostReady() {
  if (typeof document === 'undefined') return false;
  return !!(
    document.querySelector('.table-wrap table') &&
    document.querySelector('#formula-input') &&
    document.querySelector('#cell-name-input')
  );
}

export function SheetPage({
  sheetId: sheetIdProp,
  initialTabId: initialTabIdProp,
  onOpenHelp,
  publishedMode = false,
  onAppReady,
  onWorkbookUiStateChange,
  syncRouteWithActiveSheet = true,
}) {
  const navigate = useNavigate();
  const params = useParams();
  const sheetId = String(sheetIdProp || params.sheetId || '');
  const initialTabId = String(initialTabIdProp || params.tabId || '');
  const appRef = useRef(null);
  const cellContentStoreRef = useRef(null);
  const storageRef = useRef(null);
  const lastWorkbookDocumentRef = useRef(null);
  const lastWorkbookSyncKeyRef = useRef('');
  const pendingWorkbookDocumentRef = useRef(null);
  const pendingWorkbookSyncKeyRef = useRef('');
  const [workbookName, setWorkbookName] = useState('');
  const [workbookUiState, setWorkbookUiState] = useState(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [bgColorCustomValue, setBgColorCustomValue] = useState('#fff7cc');
  const [isLoading, setIsLoading] = useState(true);
  const [sheet, setSheet] = useState(null);
  const [settings, setSettings] = useState(null);

  if (!cellContentStoreRef.current) {
    cellContentStoreRef.current = createCellContentStore();
  }

  const canApplyRemoteWorkbook = () => {
    if (!appRef.current || !storageRef.current) return false;
    if (
      typeof appRef.current.hasPendingLocalEdit === 'function' &&
      appRef.current.hasPendingLocalEdit()
    ) {
      return false;
    }
    if (
      storageRef.current &&
      typeof storageRef.current.hasPendingPersistence === 'function' &&
      storageRef.current.hasPendingPersistence()
    ) {
      return false;
    }
    return true;
  };

  const applyRemoteWorkbookDocument = (workbookDocument, syncKey) => {
    if (!appRef.current || !storageRef.current) return false;
    const decodeWorkbookDocument = storageRef.current.decodeWorkbookDocument;
    if (typeof decodeWorkbookDocument !== 'function') return false;
    const nextWorkbook = preserveMoreCompleteLocalAttachments(
      storageRef.current,
      decodeWorkbookDocument(workbookDocument),
    );
    lastWorkbookDocumentRef.current = workbookDocument;
    lastWorkbookSyncKeyRef.current = syncKey;
    pendingWorkbookDocumentRef.current = null;
    pendingWorkbookSyncKeyRef.current = '';
    if (
      typeof storageRef.current.setDocumentRevision === 'function' &&
      syncKey
    ) {
      storageRef.current.setDocumentRevision(syncKey);
    }
    storageRef.current.replaceAll(nextWorkbook);
    if (typeof appRef.current.renderCurrentSheetFromStorage === 'function') {
      appRef.current.renderCurrentSheetFromStorage();
    } else {
      appRef.current.computeAll();
    }
    return true;
  };

  const flushPendingRemoteWorkbook = () => {
    if (!pendingWorkbookDocumentRef.current) return false;
    if (!canApplyRemoteWorkbook()) return false;
    return applyRemoteWorkbookDocument(
      pendingWorkbookDocumentRef.current,
      pendingWorkbookSyncKeyRef.current,
    );
  };

  const syncRemoteSheetIntoRuntime = (sheetData) => {
    const nextSheet =
      sheetData && typeof sheetData === 'object' ? sheetData : null;
    if (!nextSheet) return false;
    const nextWorkbookDocument =
      nextSheet.workbook && typeof nextSheet.workbook === 'object'
        ? nextSheet.workbook
        : null;
    const nextDocumentRevision = String(
      (nextSheet && nextSheet.documentRevision) ||
        (nextSheet &&
        nextSheet.updatedAt &&
        typeof nextSheet.updatedAt.getTime === 'function'
          ? nextSheet.updatedAt.getTime()
          : nextSheet && nextSheet.updatedAt
            ? nextSheet.updatedAt
            : ''),
    );
    const nextRuntimeRevision = String(
      (nextSheet && nextSheet.runtimeRevision) ||
        (nextSheet &&
        nextSheet.runtimeUpdatedAt &&
        typeof nextSheet.runtimeUpdatedAt.getTime === 'function'
          ? nextSheet.runtimeUpdatedAt.getTime()
          : nextSheet && nextSheet.runtimeUpdatedAt
            ? nextSheet.runtimeUpdatedAt
            : ''),
    );

    if (
      storageRef.current &&
      typeof storageRef.current.setDocumentRevision === 'function' &&
      nextDocumentRevision
    ) {
      storageRef.current.setDocumentRevision(nextDocumentRevision);
    }
    if (appRef.current && nextRuntimeRevision) {
      appRef.current.serverWorkbookRevision = nextRuntimeRevision;
    }

    if (!nextWorkbookDocument) return false;
    if (!canApplyRemoteWorkbook()) {
      pendingWorkbookDocumentRef.current = nextWorkbookDocument;
      pendingWorkbookSyncKeyRef.current = nextDocumentRevision;
      return false;
    }
    return applyRemoteWorkbookDocument(
      nextWorkbookDocument,
      nextDocumentRevision,
    );
  };

  useEffect(() => {
    document.body.classList.add(
      publishedMode ? 'route-published-report' : 'route-sheet',
    );
    document.body.classList.remove('route-home');
    document.body.classList.remove('route-settings');

    return () => {
      document.body.classList.remove('route-sheet');
      document.body.classList.remove('route-published-report');
    };
  }, [publishedMode]);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([rpc('sheets.one', sheetId), rpc('settings.get')])
      .then(([sheetData, settingsData]) => {
        setSheet(sheetData);
        setSettings(settingsData);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load sheet data', err);
        setIsLoading(false);
      });
  }, [sheetId]);

  useEffect(() => {
    const unsubscribe = subscribeServerEvents((message) => {
      const event =
        message &&
        message.type === 'server.event' &&
        message.event &&
        typeof message.event === 'object'
          ? message.event
          : null;
      if (!event || String(event.scope || '') !== 'sheets') return;

      const type = String(event.type || '');
      const payload =
        event.payload && typeof event.payload === 'object' ? event.payload : {};
      const eventSheetId = String(event.sheetId || payload.sheetId || '');
      if (!eventSheetId || eventSheetId !== String(sheetId || '')) return;

      if (type === 'sheets.removed') {
        setSheet(null);
        navigate('/', { replace: true });
        return;
      }

      if (type === 'sheets.renamed') {
        setSheet((current) =>
          !current
            ? current
            : {
                ...current,
                name: String(payload.name || current.name || ''),
                updatedAt: payload.updatedAt || current.updatedAt || null,
              },
        );
      }
    });
    return unsubscribe;
  }, [navigate, sheetId]);

  const availableChannels = Array.isArray(
    settings && settings.communicationChannels,
  )
    ? settings.communicationChannels
        .filter((channel) => channel && channel.enabled !== false)
        .map((channel) => ({
          id: String(channel.id || ''),
          label: String(channel.label || '').trim(),
        }))
        .filter((channel) => channel.label)
    : [];

  useEffect(() => {
    if (!sheet) return;
    setWorkbookName(String(sheet.name || ''));
  }, [sheet && sheet.name]);

  const commitWorkbookRename = () => {
    if (!sheet || isRenaming) return;
    const nextName = String(workbookName || '').trim();
    const currentName = String(sheet.name || '');

    if (!nextName) {
      setWorkbookName(currentName);
      return;
    }

    if (nextName === currentName) return;

    setIsRenaming(true);
    rpc('sheets.rename', sheetId, nextName)
      .then(() => {
        setIsRenaming(false);
      })
      .catch((error) => {
        setIsRenaming(false);
        setWorkbookName(currentName);
        window.alert(
          error.reason || error.message || 'Failed to rename metacell',
        );
      });
  };

  useEffect(() => {
    if (isLoading || !sheet || appRef.current) return;
    let cancelled = false;
    let mountRetryTimer = null;

    loadWorkbookRuntimeDeps()
      .then(
        ({
          decodeWorkbookDocument,
          createSheetDocStorage,
          mountSpreadsheetApp,
        }) => {
          if (cancelled || appRef.current) return;
          const tryMountRuntime = () => {
            if (cancelled || appRef.current) return;
            if (!isWorkbookHostReady()) {
              mountRetryTimer = window.setTimeout(tryMountRuntime, 16);
              return;
            }
            const workbookDocument = sheet.workbook || {};
            const workbook = decodeWorkbookDocument(workbookDocument);
            const initialDocumentRevision = String(
              (sheet && sheet.documentRevision) ||
                (sheet && sheet.updatedAt && typeof sheet.updatedAt.getTime === 'function'
                  ? sheet.updatedAt.getTime()
                  : sheet && sheet.updatedAt
                    ? sheet.updatedAt
                    : ''),
            );
            const initialRuntimeRevision = String(
              (sheet && sheet.runtimeRevision) ||
                (sheet &&
                sheet.runtimeUpdatedAt &&
                typeof sheet.runtimeUpdatedAt.getTime === 'function'
                  ? sheet.runtimeUpdatedAt.getTime()
                  : sheet && sheet.runtimeUpdatedAt
                    ? sheet.runtimeUpdatedAt
                    : ''),
            );
            const storage = createSheetDocStorage(sheetId, workbook, {
              initialDocumentRevision: initialDocumentRevision,
              onRevisionConflict: (error) => {
                const conflictRevision = String(
                  (error &&
                    error.details &&
                    (error.details.documentRevision || error.details.revision)) ||
                    '',
                );
                if (
                  storageRef.current &&
                  typeof storageRef.current.setDocumentRevision === 'function' &&
                  conflictRevision
                ) {
                  storageRef.current.setDocumentRevision(conflictRevision);
                }
                rpc('sheets.one', sheetId)
                  .then((sheetData) => {
                    syncRemoteSheetIntoRuntime(sheetData);
                  })
                  .catch((error) => {
                    console.error('Failed to reload sheet after revision conflict', error);
                  });
              },
            });
            storage.decodeWorkbookDocument = decodeWorkbookDocument;
            storageRef.current = storage;
            lastWorkbookDocumentRef.current = workbookDocument;
            lastWorkbookSyncKeyRef.current = initialDocumentRevision;
            appRef.current = mountSpreadsheetApp({
              storage: storageRef.current,
              cellContentStore: cellContentStoreRef.current,
              sheetDocumentId: sheetId,
              initialWorkbookRevision: initialRuntimeRevision,
              initialSheetId: initialTabId,
              availableChannels,
              onUiStateChange: setWorkbookUiState,
              onActiveSheetChange: (nextTabId) => {
                if (!syncRouteWithActiveSheet) return;
                const nextPath = publishedMode
                  ? `/report/${encodeURIComponent(sheetId)}/${encodeURIComponent(nextTabId || initialTabId || '')}`
                  : nextTabId
                    ? `/metacell/${encodeURIComponent(sheetId)}/${encodeURIComponent(nextTabId)}`
                    : `/metacell/${encodeURIComponent(sheetId)}`;
                if (window.location.pathname !== nextPath) {
                  navigate(nextPath, { replace: true });
                }
              },
            });
            if (typeof onAppReady === 'function') {
              onAppReady(appRef.current);
            }
            flushPendingRemoteWorkbook();
          };

          tryMountRuntime();
        },
      )
      .catch((error) => {
        if (!cancelled) {
          console.error('Failed to load workbook runtime', error);
        }
      });

    return () => {
      cancelled = true;
      if (mountRetryTimer) {
        clearTimeout(mountRetryTimer);
        mountRetryTimer = null;
      }
      if (appRef.current && typeof appRef.current.destroy === 'function') {
        appRef.current.destroy();
      }
      if (typeof onAppReady === 'function') {
        onAppReady(null);
      }
      appRef.current = null;
      storageRef.current = null;
      if (
        cellContentStoreRef.current &&
        typeof cellContentStoreRef.current.clear === 'function'
      ) {
        cellContentStoreRef.current.clear();
      }
      setWorkbookUiState(null);
      lastWorkbookDocumentRef.current = null;
      lastWorkbookSyncKeyRef.current = '';
      pendingWorkbookDocumentRef.current = null;
      pendingWorkbookSyncKeyRef.current = '';
    };
  }, [
    isLoading,
    sheetId,
    initialTabId,
    publishedMode,
    sheet,
    onAppReady,
    syncRouteWithActiveSheet,
  ]);

  useEffect(() => {
    if (typeof onWorkbookUiStateChange === 'function') {
      onWorkbookUiStateChange(workbookUiState);
    }
  }, [workbookUiState, onWorkbookUiStateChange]);

  useEffect(() => {
    flushPendingRemoteWorkbook();
  }, [workbookUiState]);

  useEffect(() => {
    if (
      !appRef.current ||
      typeof appRef.current.setAvailableChannels !== 'function'
    ) {
      return;
    }
    appRef.current.setAvailableChannels(availableChannels);
  }, [JSON.stringify(availableChannels)]);

  useEffect(() => {
    if (!appRef.current || !initialTabId) return;
    if (typeof appRef.current.switchToSheet !== 'function') return;
    if (
      !(
        typeof appRef.current.activeSheetId === 'string' &&
        appRef.current.activeSheetId === initialTabId
      )
    ) {
      appRef.current.switchToSheet(initialTabId);
    }
    if (publishedMode && typeof appRef.current.setReportMode === 'function') {
      appRef.current.setReportMode('view');
    }
  }, [initialTabId, publishedMode]);

  useEffect(() => {
    if (isLoading || !sheet || !appRef.current || !storageRef.current) return;

    const nextWorkbookDocument = sheet.workbook || {};
    const nextWorkbookSyncKey = String(
      (sheet && sheet.documentRevision) ||
        (sheet && sheet.updatedAt && typeof sheet.updatedAt.getTime === 'function'
          ? sheet.updatedAt.getTime()
          : sheet && sheet.updatedAt
            ? sheet.updatedAt
            : ''),
    );
    if (
      nextWorkbookDocument === lastWorkbookDocumentRef.current &&
      nextWorkbookSyncKey === lastWorkbookSyncKeyRef.current
    ) {
      return;
    }
    if (!canApplyRemoteWorkbook()) {
      pendingWorkbookDocumentRef.current = nextWorkbookDocument;
      pendingWorkbookSyncKeyRef.current = nextWorkbookSyncKey;
      return;
    }
    applyRemoteWorkbookDocument(nextWorkbookDocument, nextWorkbookSyncKey);
  }, [isLoading, sheet]);

  if (isLoading) {
    return <main className="sheet-loading">Loading metacell...</main>;
  }

  if (!sheet) {
    return (
      <main className="sheet-loading">
        <p>Metacell not found.</p>
        <Link to="/">← Back</Link>
      </main>
    );
  }

  const handlePublishReport = () => {
    if (
      !appRef.current ||
      typeof appRef.current.publishCurrentReport !== 'function'
    ) {
      return;
    }
    appRef.current.publishCurrentReport();
  };

  const handleUpdateAI = () => {
    if (
      !appRef.current ||
      typeof appRef.current.runManualAIUpdate !== 'function'
    ) {
      return;
    }
    appRef.current.runManualAIUpdate();
  };

  const handleExportPdf = () => {
    if (
      !appRef.current ||
      typeof appRef.current.exportCurrentReportPdf !== 'function'
    ) {
      return;
    }
    appRef.current.exportCurrentReportPdf();
  };

  const handleToolbarAttachFileClick = () => {
    if (
      !appRef.current ||
      typeof appRef.current.prepareActiveCellAttachmentSelection !== 'function'
    ) {
      return;
    }
    appRef.current.prepareActiveCellAttachmentSelection();
  };

  const handleToggleNamedCellJumpPicker = () => {
    if (
      !appRef.current ||
      typeof appRef.current.toggleNamedCellJumpPicker !== 'function'
    ) {
      return;
    }
    appRef.current.toggleNamedCellJumpPicker();
  };

  const handleNavigateToNamedCell = (name) => {
    if (
      !appRef.current ||
      typeof appRef.current.navigateToNamedCell !== 'function'
    ) {
      return;
    }
    appRef.current.navigateToNamedCell(name);
  };

  const handleToggleAIModePicker = () => {
    if (
      !appRef.current ||
      typeof appRef.current.toggleAIModePicker !== 'function'
    ) {
      return;
    }
    appRef.current.toggleAIModePicker();
  };

  const handleApplyAIMode = (mode) => {
    if (!appRef.current || typeof appRef.current.applyAIMode !== 'function') {
      return;
    }
    appRef.current.applyAIMode(mode);
  };

  const handleToggleDisplayModePicker = () => {
    if (
      !appRef.current ||
      typeof appRef.current.toggleDisplayModePicker !== 'function'
    ) {
      return;
    }
    appRef.current.toggleDisplayModePicker();
  };

  const handleApplyDisplayMode = (mode) => {
    if (
      !appRef.current ||
      typeof appRef.current.applyDisplayMode !== 'function'
    ) {
      return;
    }
    appRef.current.applyDisplayMode(mode);
  };

  const handleUndo = () => {
    if (!appRef.current || typeof appRef.current.undo !== 'function') return;
    appRef.current.undo();
  };

  const handleRedo = () => {
    if (!appRef.current || typeof appRef.current.redo !== 'function') return;
    appRef.current.redo();
  };

  const handleToggleCellFormatPicker = () => {
    if (
      !appRef.current ||
      typeof appRef.current.toggleCellFormatPicker !== 'function'
    ) {
      return;
    }
    appRef.current.toggleCellFormatPicker();
  };

  const handleApplyCellFormat = (format) => {
    if (
      !appRef.current ||
      typeof appRef.current.applyCellFormat !== 'function'
    ) {
      return;
    }
    appRef.current.applyCellFormat(format);
  };

  const handleAdjustDecimalPlaces = (delta) => {
    if (
      !appRef.current ||
      typeof appRef.current.adjustDecimalPlaces !== 'function'
    ) {
      return;
    }
    appRef.current.adjustDecimalPlaces(delta);
  };

  const handleApplyCellAlign = (align) => {
    if (
      !appRef.current ||
      typeof appRef.current.applyCellAlign !== 'function'
    ) {
      return;
    }
    appRef.current.applyCellAlign(align);
  };

  const handleToggleCellBordersPicker = () => {
    if (
      !appRef.current ||
      typeof appRef.current.toggleCellBordersPicker !== 'function'
    ) {
      return;
    }
    appRef.current.toggleCellBordersPicker();
  };

  const handleApplyCellBordersPreset = (preset) => {
    if (
      !appRef.current ||
      typeof appRef.current.applyCellBordersPreset !== 'function'
    ) {
      return;
    }
    appRef.current.applyCellBordersPreset(preset);
  };

  const handleToggleBgColorPicker = () => {
    if (
      !appRef.current ||
      typeof appRef.current.toggleBgColorPicker !== 'function'
    ) {
      return;
    }
    appRef.current.toggleBgColorPicker();
  };

  const handleApplyCellBgColor = (color) => {
    if (
      !appRef.current ||
      typeof appRef.current.applyCellBgColor !== 'function'
    ) {
      return;
    }
    appRef.current.applyCellBgColor(color);
  };

  const handleAdjustFontSize = (delta) => {
    if (
      !appRef.current ||
      typeof appRef.current.adjustFontSize !== 'function'
    ) {
      return;
    }
    appRef.current.adjustFontSize(delta);
  };

  const handleToggleCellFontFamilyPicker = () => {
    if (
      !appRef.current ||
      typeof appRef.current.toggleCellFontFamilyPicker !== 'function'
    ) {
      return;
    }
    appRef.current.toggleCellFontFamilyPicker();
  };

  const handleApplyCellFontFamily = (fontFamily) => {
    if (
      !appRef.current ||
      typeof appRef.current.applyCellFontFamily !== 'function'
    ) {
      return;
    }
    appRef.current.applyCellFontFamily(fontFamily);
  };

  const handleToggleCellWrap = () => {
    if (
      !appRef.current ||
      typeof appRef.current.toggleCellWrap !== 'function'
    ) {
      return;
    }
    appRef.current.toggleCellWrap();
  };

  const handleToggleCellBold = () => {
    if (
      !appRef.current ||
      typeof appRef.current.toggleCellBold !== 'function'
    ) {
      return;
    }
    appRef.current.toggleCellBold();
  };

  const handleToggleCellItalic = () => {
    if (
      !appRef.current ||
      typeof appRef.current.toggleCellItalic !== 'function'
    ) {
      return;
    }
    appRef.current.toggleCellItalic();
  };

  const handleToggleAssistantPanel = () => {
    if (
      !appRef.current ||
      typeof appRef.current.toggleAssistantPanel !== 'function'
    ) {
      return;
    }
    appRef.current.toggleAssistantPanel();
  };

  const handleToggleFormulaTrackerPanel = () => {
    if (
      !appRef.current ||
      typeof appRef.current.toggleFormulaTrackerPanel !== 'function'
    ) {
      return;
    }
    appRef.current.toggleFormulaTrackerPanel();
  };

  const handleApplyChannelBindingSelection = (channelLabel, mode) => {
    if (
      !appRef.current ||
      typeof appRef.current.applyChannelBindingSelection !== 'function'
    ) {
      return;
    }
    appRef.current.applyChannelBindingSelection(channelLabel, mode);
  };

  const handleRegionRecording = () => {
    if (
      !appRef.current ||
      typeof appRef.current.toggleRegionRecordingControl !== 'function'
    ) {
      return;
    }
    appRef.current.toggleRegionRecordingControl();
  };

  const handleDownloadRegionRecording = () => {
    if (
      !appRef.current ||
      typeof appRef.current.downloadRegionRecording !== 'function'
    ) {
      return;
    }
    appRef.current.downloadRegionRecording();
  };

  return (
    <Suspense
      fallback={
        <main className="sheet-loading">Loading workbook UI...</main>
      }
    >
      <div
        className={`sheet-page-shell${publishedMode ? ' is-published-report' : ''}`}
      >
        <div className="formula-bar">
          <SheetFormulaBarMainRow
            workbookName={workbookName}
            setWorkbookName={setWorkbookName}
            commitWorkbookRename={commitWorkbookRename}
            isRenaming={isRenaming}
            sheetName={sheet && sheet.name ? sheet.name : ''}
            workbookUiState={workbookUiState}
            onUpdateAI={handleUpdateAI}
            onOpenHelp={onOpenHelp}
            onToggleNamedCellJumpPicker={handleToggleNamedCellJumpPicker}
            onNavigateToNamedCell={handleNavigateToNamedCell}
            onToggleAIModePicker={handleToggleAIModePicker}
            onApplyAIMode={handleApplyAIMode}
            onToggleDisplayModePicker={handleToggleDisplayModePicker}
            onApplyDisplayMode={handleApplyDisplayMode}
          />
          <SheetFormulaBarFormatRow
            workbookUiState={workbookUiState}
            bgColorCustomValue={bgColorCustomValue}
            setBgColorCustomValue={setBgColorCustomValue}
            onAttachFileClick={handleToolbarAttachFileClick}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onToggleCellFormatPicker={handleToggleCellFormatPicker}
            onApplyCellFormat={handleApplyCellFormat}
            onAdjustDecimalPlaces={handleAdjustDecimalPlaces}
            onApplyCellAlign={handleApplyCellAlign}
            onToggleCellBordersPicker={handleToggleCellBordersPicker}
            onApplyCellBordersPreset={handleApplyCellBordersPreset}
            onToggleBgColorPicker={handleToggleBgColorPicker}
            onApplyCellBgColor={handleApplyCellBgColor}
            onAdjustFontSize={handleAdjustFontSize}
            onToggleCellFontFamilyPicker={handleToggleCellFontFamilyPicker}
            onApplyCellFontFamily={handleApplyCellFontFamily}
            onToggleCellWrap={handleToggleCellWrap}
            onToggleCellBold={handleToggleCellBold}
            onToggleCellItalic={handleToggleCellItalic}
            onToggleAssistantPanel={handleToggleAssistantPanel}
            onToggleFormulaTrackerPanel={handleToggleFormulaTrackerPanel}
            onApplyChannelBindingSelection={handleApplyChannelBindingSelection}
            onHandleRegionRecording={handleRegionRecording}
            onDownloadRegionRecording={handleDownloadRegionRecording}
          />
        </div>
        <SheetWorkbookViewport
          workbookUiState={workbookUiState}
          appRef={appRef}
          cellContentStore={cellContentStoreRef.current}
          onPublishReport={handlePublishReport}
          onExportPdf={handleExportPdf}
        />
        <WorkbookTabBar workbookUiState={workbookUiState} appRef={appRef} />
      </div>
    </Suspense>
  );
}
