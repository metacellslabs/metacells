import {
  subscribeWorkbookDocument,
  subscribeWorkbookEvents,
  subscribeWorkbookSocketStatus,
} from '../../../../lib/transport/ws-client.js';
import { rpc } from '../../../../lib/rpc-client.js';
import { renderChangedCellIds } from './compute-runtime.js';

function getStoredCellSource(app, sheetId, cellId) {
  if (
    !app ||
    !app.storage ||
    !app.storage.storage ||
    typeof app.storage.storage.getCellSource !== 'function'
  ) {
    return '';
  }
  return String(app.storage.storage.getCellSource(sheetId, cellId) || '');
}

function applyWorkbookEventRuntimePatch(app, visibleSheetId, sheetPatch) {
  if (!app || !visibleSheetId || !sheetPatch || typeof sheetPatch !== 'object') {
    return { applied: false, requiresSnapshotFallback: false };
  }
  var didApply = false;
  var requiresSnapshotFallback = false;

  Object.keys(sheetPatch).forEach(function (cellId) {
    if (requiresSnapshotFallback) return;
    var normalizedCellId = String(cellId || '').toUpperCase();
    if (!normalizedCellId) return;
    var patch =
      sheetPatch[normalizedCellId] && typeof sheetPatch[normalizedCellId] === 'object'
        ? sheetPatch[normalizedCellId]
        : null;
    if (!patch) return;
    if (patch.clear === true) {
      requiresSnapshotFallback = true;
      return;
    }

    var patchSourceProvided = Object.prototype.hasOwnProperty.call(patch, 'source');
    var patchSource = patchSourceProvided ? String(patch.source || '') : '';
    var currentSource = getStoredCellSource(app, visibleSheetId, normalizedCellId);

    if (patchSourceProvided && currentSource && patchSource !== currentSource) {
      requiresSnapshotFallback = true;
      return;
    }

    if (
      app.storage &&
      typeof app.storage.applyServerCellPatch === 'function' &&
      app.storage.applyServerCellPatch(visibleSheetId, normalizedCellId, {
        source: patchSourceProvided ? patchSource : currentSource,
        generatedBy: String(patch.generatedBy || '').toUpperCase(),
        value: String(patch.value == null ? '' : patch.value),
        displayValue: String(
          patch.displayValue == null ? patch.value || '' : patch.displayValue,
        ),
        state: String(patch.state || ''),
        error: String(patch.error || ''),
      })
    ) {
      didApply = true;
    }
  });

  return {
    applied: didApply,
    requiresSnapshotFallback: requiresSnapshotFallback,
  };
}

function applyWorkbookEventCellPatch(app, event, visibleSheetId, changedCellIds) {
  if (
    !app ||
    !event ||
    !app.storage ||
    !app.storage.storage ||
    typeof app.storage.storage.snapshot !== 'function' ||
    typeof app.storage.storage.replaceAll !== 'function'
  ) {
    return false;
  }
  var patchBySheet =
    event.cellPatchBySheet && typeof event.cellPatchBySheet === 'object'
      ? event.cellPatchBySheet
      : null;
  if (!patchBySheet) return false;
  var sheetPatch =
    patchBySheet[visibleSheetId] && typeof patchBySheet[visibleSheetId] === 'object'
      ? patchBySheet[visibleSheetId]
      : null;
  if (!sheetPatch) return false;
  var runtimePatchResult = applyWorkbookEventRuntimePatch(
    app,
    visibleSheetId,
    sheetPatch,
  );
  if (!runtimePatchResult.applied) return false;
  if (runtimePatchResult.requiresSnapshotFallback) return false;
  renderChangedCellIds(app, changedCellIds);
  return true;
}

export function attachSheetEventSubscription(app) {
  if (!app || !app.sheetDocumentId) return function () {};
  app.serverPushEventsEnabled = false;

  let refreshTimer = null;
  let refreshRevisionCheckToken = 0;
  let lastSeenRevision = String(app.serverWorkbookRevision || '');
  let lastSeenSequence = 0;
  const clearRefreshTimer = () => {
    if (refreshTimer && typeof window !== 'undefined') {
      window.clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  };

  const scheduleRefresh = (eventRevision, changedCellIds, options) => {
    const opts = options && typeof options === 'object' ? options : {};
    const forceRefreshAI = opts.forceRefreshAI === true;
    const forceFetchIfRevisionSeen = opts.forceFetchIfRevisionSeen === true;
    if (
      !app ||
      typeof app.computeAll !== 'function' ||
      typeof app.refreshVisibleSheetFromServer !== 'function'
    ) {
      return;
    }
    if (app.hasPendingLocalEdit && app.hasPendingLocalEdit()) return;
    if (refreshTimer || typeof window === 'undefined') return;
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      if (app.hasPendingLocalEdit && app.hasPendingLocalEdit()) return;
      const knownRevision = String(app.serverWorkbookRevision || lastSeenRevision || '');
      const hintedRevision = String(eventRevision || '');
      if (hintedRevision && hintedRevision === knownRevision && !forceFetchIfRevisionSeen) {
        lastSeenRevision = hintedRevision;
        return;
      }
      const revisionCheckToken = ++refreshRevisionCheckToken;
      rpc('sheets.getSyncState', app.sheetDocumentId)
        .then((result) => {
          if (revisionCheckToken !== refreshRevisionCheckToken) return;
          const nextRevision = String(
            result && result.runtimeRevision ? result.runtimeRevision : '',
          );
          if (!nextRevision) {
            app.refreshVisibleSheetFromServer({
              bypassPendingEdit: true,
              forceRefreshAI: forceRefreshAI,
              targetCellIds: changedCellIds,
            });
            return;
          }
          lastSeenRevision = nextRevision;
          if (nextRevision === knownRevision) {
            return;
          }
          if (nextRevision === hintedRevision) {
            if (nextRevision !== knownRevision) {
              app.serverWorkbookRevision = nextRevision;
            }
            if (forceFetchIfRevisionSeen) {
              app.refreshVisibleSheetFromServer({
                bypassPendingEdit: true,
                forceRefreshAI: forceRefreshAI,
                targetCellIds: changedCellIds,
              });
            }
            return;
          }
          app.refreshVisibleSheetFromServer({
            bypassPendingEdit: true,
            forceRefreshAI: forceRefreshAI,
            targetCellIds: changedCellIds,
          });
        })
        .catch(() => {
          if (revisionCheckToken !== refreshRevisionCheckToken) return;
          app.refreshVisibleSheetFromServer({
            bypassPendingEdit: true,
            forceRefreshAI: forceRefreshAI,
            targetCellIds: changedCellIds,
          });
        });
    }, 40);
  };

  const unsubscribeStatus = subscribeWorkbookSocketStatus((status) => {
    const nextConnected = !!(status && status.connected);
    app.serverPushEventsEnabled = nextConnected;
    app.serverPushConnectionState = status && status.state ? String(status.state) : 'disconnected';
    if (typeof app.publishUiState === 'function') app.publishUiState();
  });
  const unsubscribeEvents = subscribeWorkbookEvents((message) => {
    if (!message || message.type !== 'workbook.event') return;
    if (String(message.sheetDocumentId || '') !== String(app.sheetDocumentId || '')) {
      return;
    }
    const event = message.event && typeof message.event === 'object' ? message.event : {};
    const eventType = String(event.type || '');
    const eventRevision = String(
      event.runtimeRevision ||
        (eventType === 'workbook.runtime.updated' ? event.revision || '' : ''),
    );
    const eventDocumentRevision = String(event.documentRevision || '');
    const eventSequence = Number(event.sequence || message.sequence || 0);
    const eventSheetId = String(event.activeSheetId || '');
    const changedCellIds = Array.isArray(event.changedCellIds)
      ? event.changedCellIds
      : [];
    const visibleSheetId =
      typeof app.getVisibleSheetId === 'function'
        ? String(app.getVisibleSheetId() || '')
        : String(app.activeSheetId || '');
    if (Number.isFinite(eventSequence) && eventSequence > 0) {
      if (eventSequence <= lastSeenSequence) return;
      lastSeenSequence = eventSequence;
    }
    if (eventRevision && eventRevision === String(lastSeenRevision || '')) {
      const patchBySheet =
        event.cellPatchBySheet && typeof event.cellPatchBySheet === 'object'
          ? event.cellPatchBySheet
          : null;
      const visibleSheetPatch =
        patchBySheet &&
        patchBySheet[visibleSheetId] &&
        typeof patchBySheet[visibleSheetId] === 'object'
          ? patchBySheet[visibleSheetId]
          : null;
      if (!visibleSheetPatch) {
        return;
      }
    }
    const appliedPatch = applyWorkbookEventCellPatch(
      app,
      event,
      visibleSheetId,
      changedCellIds,
    );
    if (eventRevision) {
      lastSeenRevision = eventRevision;
    }
    if (appliedPatch && eventRevision) {
      app.serverWorkbookRevision = eventRevision;
    }
    if (
      eventDocumentRevision &&
      app.storage &&
      app.storage.storage &&
      typeof app.storage.storage.setDocumentRevision === 'function'
    ) {
      app.storage.storage.setDocumentRevision(eventDocumentRevision);
    }
    if (
      eventType === 'workbook.runtime.updated' &&
      !appliedPatch &&
      typeof app.refreshVisibleSheetFromServer === 'function'
    ) {
      app.refreshVisibleSheetFromServer({
        bypassPendingEdit: true,
        forceRefreshAI: false,
        targetCellIds: changedCellIds,
        skipExpectedRevision: true,
      });
      return;
    }
    if (
      eventType === 'workbook.runtime.updated' ||
      eventType === 'workbook.document.updated'
    ) {
      if (
        eventType !== 'workbook.document.updated' &&
        eventSheetId &&
        visibleSheetId &&
        eventSheetId !== visibleSheetId
      ) {
        return;
      }
      if (
        appliedPatch &&
        eventType === 'workbook.runtime.updated'
      ) {
        return;
      }
      scheduleRefresh(eventRevision, changedCellIds, {
        forceRefreshAI: false,
        forceFetchIfRevisionSeen: !appliedPatch,
      });
    }
  });
  const unsubscribeDoc = subscribeWorkbookDocument(app.sheetDocumentId);

  return function detachSheetEventSubscription() {
    app.serverPushEventsEnabled = false;
    app.serverPushConnectionState = 'disconnected';
    if (typeof app.publishUiState === 'function') app.publishUiState();
    clearRefreshTimer();
    unsubscribeEvents();
    unsubscribeStatus();
    unsubscribeDoc();
  };
}
