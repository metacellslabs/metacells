function readPendingAttachmentMeta(rawValue) {
  var raw = String(rawValue == null ? '' : rawValue);
  if (raw.indexOf('__ATTACHMENT__:') !== 0) return null;
  try {
    var parsed = JSON.parse(raw.substring('__ATTACHMENT__:'.length));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function isPendingAttachmentRawValue(rawValue) {
  var attachment = readPendingAttachmentMeta(rawValue);
  return !!(
    attachment &&
    (attachment.pending === true || attachment.converting === true)
  );
}

export function shouldForceServerRecomputeForRawEdit(
  app,
  sheetId,
  cellId,
  rawValue,
) {
  if (!app) return false;
  var raw = String(rawValue == null ? '' : rawValue);
  if (isPendingAttachmentRawValue(raw)) {
    return false;
  }
  if (typeof app.isFormulaLikeRawValue === 'function' && app.isFormulaLikeRawValue(raw)) {
    return true;
  }
  if (
    typeof app.hasDownstreamDependentsForCell === 'function' &&
    app.hasDownstreamDependentsForCell(sheetId, cellId)
  ) {
    return true;
  }
  return false;
}

function isExplicitAsyncServerTarget(app, sourceKey) {
  if (!app || typeof app.parseDependencySourceKey !== 'function') return false;
  var parsed = app.parseDependencySourceKey(sourceKey);
  if (!parsed) return false;
  var raw = String(app.storage.getCellValue(parsed.sheetId, parsed.cellId) || '');
  return !!(
    raw &&
    typeof app.isExplicitAsyncFormulaRaw === 'function' &&
    app.isExplicitAsyncFormulaRaw(raw)
  );
}

export function recomputeFromRawEdit(app, options) {
  var opts = options && typeof options === 'object' ? options : {};
  if (!app) return { localTargets: [], serverTargets: [], needsServer: false };
  var sheetId = String(opts.sheetId || app.activeSheetId || '');
  var cellId = String(opts.cellId || '').toUpperCase();
  var raw = String(opts.rawValue == null ? '' : opts.rawValue);
  var recomputePlan =
    typeof app.collectLocalSyncRecomputePlanForCell === 'function'
      ? app.collectLocalSyncRecomputePlanForCell(sheetId, cellId, raw)
      : { localTargets: [], serverTargets: [], needsServer: false };
  var localTargets = Array.isArray(recomputePlan.localTargets)
    ? recomputePlan.localTargets
    : [];
  var serverTargets = Array.isArray(recomputePlan.serverTargets)
    ? recomputePlan.serverTargets
    : [];
  var needsServer = !!recomputePlan.needsServer;
  if (isPendingAttachmentRawValue(raw)) {
    return {
      localTargets: [],
      serverTargets: [],
      needsServer: false,
      deferred: true,
    };
  }

  if (localTargets.length && typeof app.recomputeLocalSyncTargets === 'function') {
    app.recomputeLocalSyncTargets(localTargets);
  }
  if (
    serverTargets.length &&
    typeof app.markServerRecomputeTargetsStale === 'function'
  ) {
    app.markServerRecomputeTargetsStale(serverTargets);
  }

  var shouldDeferManualAsyncRecompute =
    !!serverTargets.length &&
    !(typeof app.isFormulaLikeRawValue === 'function' && app.isFormulaLikeRawValue(raw)) &&
    app.aiService &&
    typeof app.aiService.getMode === 'function' &&
    String(app.aiService.getMode() || '') === 'manual' &&
    serverTargets.every(function (sourceKey) {
      return isExplicitAsyncServerTarget(app, sourceKey);
    });

  if (shouldDeferManualAsyncRecompute) {
    if (opts.renderOnDefer && typeof app.renderCurrentSheetFromStorage === 'function') {
      app.renderCurrentSheetFromStorage();
    }
    return {
      localTargets: localTargets,
      serverTargets: serverTargets,
      needsServer: needsServer,
      deferred: true,
    };
  }

  if (
    (needsServer ||
      shouldForceServerRecomputeForRawEdit(app, sheetId, cellId, raw)) &&
    typeof app.computeAll === 'function'
  ) {
    app.computeAll({
      bypassPendingEdit: true,
      skipExpectedRevision: true,
    });
  }

  return {
    localTargets: localTargets,
    serverTargets: serverTargets,
    needsServer: needsServer,
    deferred: false,
  };
}
