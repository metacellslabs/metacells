import { rpc } from '../../../../lib/rpc-client.js';

function getVisibleSheetId(app) {
  return typeof app.getVisibleSheetId === 'function'
    ? String(app.getVisibleSheetId() || '')
    : String(app.activeSheetId || '');
}

function getRenderedCellOutput(input) {
  if (!input || !input.parentElement) return null;
  var cell = input.parentElement;
  var directMatches = [];
  if (cell.children) {
    for (var i = 0; i < cell.children.length; i++) {
      var child = cell.children[i];
      if (
        child &&
        child.classList &&
        typeof child.classList.contains === 'function' &&
        child.classList.contains('cell-output')
      ) {
        directMatches.push(child);
      }
    }
  }
  for (var directIndex = 0; directIndex < directMatches.length; directIndex++) {
    var direct = directMatches[directIndex];
    if (String(direct.textContent || '').trim()) return direct;
  }
  if (directMatches.length) return directMatches[0];
  var shellOutputs =
    cell.querySelectorAll &&
    typeof cell.querySelectorAll === 'function'
      ? cell.querySelectorAll(':scope > .cell-react-shell .cell-output')
      : null;
  if (shellOutputs && typeof shellOutputs.length === 'number') {
    for (var shellIndex = 0; shellIndex < shellOutputs.length; shellIndex++) {
      var shellOutput = shellOutputs[shellIndex];
      if (String(shellOutput && shellOutput.textContent ? shellOutput.textContent : '').trim()) {
        return shellOutput;
      }
    }
    if (shellOutputs.length) return shellOutputs[0];
  }
  return null;
}

function countRenderedCellOutputs(input) {
  if (!input || !input.parentElement || !input.parentElement.querySelectorAll) return 0;
  try {
    return Number(input.parentElement.querySelectorAll('.cell-output').length || 0);
  } catch (_error) {
    return 0;
  }
}

function getNamedCellNamesForCell(app, sheetId, cellId) {
  if (!app || !app.storage || typeof app.storage.readNamedCells !== 'function') {
    return [];
  }
  var namedCells = app.storage.readNamedCells();
  var targetSheetId = String(sheetId || '');
  var targetCellId = String(cellId || '').toUpperCase();
  var names = [];
  for (var name in namedCells) {
    if (!Object.prototype.hasOwnProperty.call(namedCells, name)) continue;
    var ref = namedCells[name];
    if (!ref) continue;
    if (String(ref.sheetId || '') !== targetSheetId) continue;
    if (String(ref.cellId || '').toUpperCase() !== targetCellId) continue;
    names.push(String(name));
  }
  names.sort();
  return names;
}

function getMentionRefsForRaw(app, raw) {
  var text = String(raw == null ? '' : raw);
  if (
    !app ||
    !app.formulaEngine ||
    typeof app.formulaEngine.collectExplicitMentionTokens !== 'function'
  ) {
    return [];
  }
  try {
    var tokens = app.formulaEngine.collectExplicitMentionTokens(text);
    return (Array.isArray(tokens) ? tokens : [])
      .map(function (item) {
        return String(
          (item && (item.displayToken || item.token || item.cellId || item.sheetName)) ||
            '',
        ).trim();
      })
      .filter(Boolean);
  } catch (error) {
    return [];
  }
}

function getMentionTokensForRaw(app, raw) {
  var text = String(raw == null ? '' : raw);
  if (
    !app ||
    !app.formulaEngine ||
    typeof app.formulaEngine.collectExplicitMentionTokens !== 'function'
  ) {
    return [];
  }
  try {
    var tokens = app.formulaEngine.collectExplicitMentionTokens(text);
    return Array.isArray(tokens) ? tokens : [];
  } catch (error) {
    return [];
  }
}

function enumerateRegionCellIds(app, startCellId, endCellId) {
  if (
    !app ||
    !app.formulaEngine ||
    typeof app.formulaEngine.enumerateRegionCellIds !== 'function'
  ) {
    return [];
  }
  try {
    var ids = app.formulaEngine.enumerateRegionCellIds(startCellId, endCellId);
    return Array.isArray(ids) ? ids : [];
  } catch (error) {
    return [];
  }
}

function findSheetIdByMentionName(app, sheetName) {
  if (app && typeof app.findSheetIdByName === 'function') {
    return String(app.findSheetIdByName(sheetName) || '');
  }
  if (
    app &&
    app.formulaEngine &&
    typeof app.formulaEngine.findSheetIdByName === 'function'
  ) {
    return String(app.formulaEngine.findSheetIdByName(sheetName) || '');
  }
  return '';
}

function resolveNamedRefForDebug(app, token) {
  if (
    !app ||
    !app.storage ||
    typeof app.storage.resolveNamedCell !== 'function' ||
    !token
  ) {
    return null;
  }
  try {
    return app.storage.resolveNamedCell(token) || null;
  } catch (error) {
    return null;
  }
}

function resolveMentionTokenSourceKeys(app, currentSheetId, mention) {
  var token = mention && typeof mention === 'object' ? mention : null;
  var sheetId = String(currentSheetId || '');
  if (!token) return [];

  if (token.kind === 'sheet-cell') {
    var refSheetId = findSheetIdByMentionName(app, token.sheetName);
    return refSheetId && token.cellId
      ? [refSheetId + ':' + String(token.cellId || '').toUpperCase()]
      : [];
  }

  if (token.kind === 'cell') {
    return token.cellId ? [sheetId + ':' + String(token.cellId || '').toUpperCase()] : [];
  }

  if (token.kind === 'sheet-region') {
    var rangeSheetId = findSheetIdByMentionName(app, token.sheetName);
    var rangeIds =
      rangeSheetId && token.startCellId && token.endCellId
        ? enumerateRegionCellIds(app, token.startCellId, token.endCellId)
        : [];
    return rangeIds.map(function (cellId) {
      return rangeSheetId + ':' + String(cellId || '').toUpperCase();
    });
  }

  if (token.kind === 'region') {
    var regionIds =
      token.startCellId && token.endCellId
        ? enumerateRegionCellIds(app, token.startCellId, token.endCellId)
        : [];
    return regionIds.map(function (cellId) {
      return sheetId + ':' + String(cellId || '').toUpperCase();
    });
  }

  if (token.kind === 'plain') {
    if (
      app &&
      app.formulaEngine &&
      typeof app.formulaEngine.isExistingCellId === 'function' &&
      app.formulaEngine.isExistingCellId(token.token)
    ) {
      return [sheetId + ':' + String(token.token || '').toUpperCase()];
    }
    var named = resolveNamedRefForDebug(app, token.token);
    if (!named || !named.sheetId) return [];
    if (named.startCellId && named.endCellId) {
      return enumerateRegionCellIds(app, named.startCellId, named.endCellId).map(
        function (cellId) {
          return String(named.sheetId || '') + ':' + String(cellId || '').toUpperCase();
        },
      );
    }
    return named.cellId
      ? [String(named.sheetId || '') + ':' + String(named.cellId || '').toUpperCase()]
      : [];
  }

  return [];
}

function addDebugSourceKey(results, seen, sourceKey) {
  var normalized = String(sourceKey || '');
  if (!normalized || seen[normalized]) return;
  seen[normalized] = true;
  results.push(normalized);
}

function collectStandardRefSourceKeys(app, currentSheetId, raw) {
  var text = String(raw == null ? '' : raw);
  var sheetId = String(currentSheetId || '');
  var results = [];
  var seen = Object.create(null);
  if (!text || text.charAt(0) !== '=') return results;

  text.replace(
    /(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+):([A-Za-z]+[0-9]+)/g,
    function (_, quoted, plain, startCellId, endCellId) {
      var refSheetId = findSheetIdByMentionName(app, quoted || plain || '');
      var ids = refSheetId
        ? enumerateRegionCellIds(app, startCellId, endCellId)
        : [];
      for (var i = 0; i < ids.length; i++) {
        addDebugSourceKey(
          results,
          seen,
          refSheetId + ':' + String(ids[i] || '').toUpperCase(),
        );
      }
      return _;
    },
  );

  text.replace(/([A-Za-z]+[0-9]+):([A-Za-z]+[0-9]+)/g, function (_, startCellId, endCellId) {
    var ids = enumerateRegionCellIds(app, startCellId, endCellId);
    for (var i = 0; i < ids.length; i++) {
      addDebugSourceKey(
        results,
        seen,
        sheetId + ':' + String(ids[i] || '').toUpperCase(),
      );
    }
    return _;
  });

  text.replace(
    /(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+)/g,
    function (_, quoted, plain, cellId) {
      var refSheetId = findSheetIdByMentionName(app, quoted || plain || '');
      if (refSheetId) {
        addDebugSourceKey(
          results,
          seen,
          refSheetId + ':' + String(cellId || '').toUpperCase(),
        );
      }
      return _;
    },
  );

  text.replace(/\b([A-Za-z]+[0-9]+)\b/g, function (_, cellId) {
    addDebugSourceKey(
      results,
      seen,
      sheetId + ':' + String(cellId || '').toUpperCase(),
    );
    return _;
  });

  return results;
}

function parseDependencySourceKeyForDebug(sourceKey) {
  var normalized = String(sourceKey || '');
  var separatorIndex = normalized.indexOf(':');
  if (separatorIndex === -1) return null;
  return {
    sheetId: normalized.slice(0, separatorIndex),
    cellId: normalized.slice(separatorIndex + 1).toUpperCase(),
  };
}

function formatDebugAddress(currentSheetId, sheetId, cellId) {
  var normalizedSheetId = String(sheetId || '');
  var normalizedCellId = String(cellId || '').toUpperCase();
  if (!normalizedSheetId || normalizedSheetId === String(currentSheetId || '')) {
    return normalizedCellId;
  }
  return normalizedSheetId + '!' + normalizedCellId;
}

function getCellVersionInfoForDebug(app, sheetId, cellId) {
  if (!app || !app.storage || typeof app.storage.getCellVersionInfo !== 'function') {
    return {
      sourceVersion: 0,
      computedVersion: 0,
      dependencyVersion: 0,
      dependencySignature: '',
    };
  }
  try {
    return (
      app.storage.getCellVersionInfo(sheetId, cellId) || {
        sourceVersion: 0,
        computedVersion: 0,
        dependencyVersion: 0,
        dependencySignature: '',
      }
    );
  } catch (_error) {
    return {
      sourceVersion: 0,
      computedVersion: 0,
      dependencyVersion: 0,
      dependencySignature: '',
    };
  }
}

function getGeneratedCountForDebug(app, sheetId, cellId) {
  if (
    !app ||
    !app.storage ||
    typeof app.storage.listGeneratedCellsBySource !== 'function'
  ) {
    return 0;
  }
  try {
    var ids = app.storage.listGeneratedCellsBySource(sheetId, cellId);
    return Array.isArray(ids) ? ids.length : 0;
  } catch (_error) {
    return 0;
  }
}

function getAttachmentMetaForDebug(app, raw) {
  if (!app || typeof app.parseAttachmentSource !== 'function') return null;
  try {
    var attachment = app.parseAttachmentSource(raw);
    if (!attachment || typeof attachment !== 'object') return null;
    return {
      name: String(attachment.name || ''),
      type: String(attachment.type || ''),
      pending: attachment.pending === true,
      converting: attachment.converting === true,
      binaryArtifactId: String(attachment.binaryArtifactId || ''),
      contentArtifactId: String(attachment.contentArtifactId || ''),
      downloadUrl: String(attachment.downloadUrl || ''),
      previewUrl: String(attachment.previewUrl || ''),
    };
  } catch (_error) {
    return null;
  }
}

function serializeDebugEntryData(data) {
  var entry = data && typeof data === 'object' ? data : {};
  return [
    'address=' + String(entry.address || ''),
    'name=' + String(entry.name || ''),
    'formula=' + JSON.stringify(String(entry.formula || '')),
    'cellState=' + JSON.stringify(String(entry.cellState || '')),
    'errorHint=' + JSON.stringify(String(entry.errorHint || '')),
    'generatedBy=' + JSON.stringify(String(entry.generatedBy || '')),
    'displayValue=' + JSON.stringify(String(entry.displayValue || '')),
    'value=' + JSON.stringify(String(entry.value || '')),
    'computedValue=' + JSON.stringify(String(entry.computedValue || '')),
    'shownOutput=' + JSON.stringify(String(entry.shownOutput || '')),
    'shownHtml=' + JSON.stringify(String(entry.shownHtml || '')),
    'outputNodes=' + JSON.stringify(Number(entry.outputNodes || 0)),
    'mentionRefs=' + JSON.stringify(Array.isArray(entry.mentionRefs) ? entry.mentionRefs : []),
    'runtimeRevision=' + JSON.stringify(String(entry.runtimeRevision || '')),
    'serverPushEnabled=' + JSON.stringify(entry.serverPushEnabled === true),
    'serverPushState=' + JSON.stringify(String(entry.serverPushState || '')),
    'sourceVersion=' + JSON.stringify(Number(entry.sourceVersion || 0)),
    'computedVersion=' + JSON.stringify(Number(entry.computedVersion || 0)),
    'dependencyVersion=' + JSON.stringify(Number(entry.dependencyVersion || 0)),
    'dependencySignature=' + JSON.stringify(String(entry.dependencySignature || '')),
    'generatedCount=' + JSON.stringify(Number(entry.generatedCount || 0)),
    'attachmentMeta=' + JSON.stringify(entry.attachmentMeta || null),
  ].join('\t');
}

function buildClientDebugEntryData(app, currentSheetId, sheetId, cellId) {
  var normalizedCellId = String(cellId || '').toUpperCase();
  var raw = String(app.storage.getCellValue(sheetId, normalizedCellId) || '');
  var display = String(app.storage.getCellDisplayValue(sheetId, normalizedCellId) || '');
  var computed = String(app.storage.getCellComputedValue(sheetId, normalizedCellId) || '');
  var state = String(app.storage.getCellState(sheetId, normalizedCellId) || '');
  var errorHint = String(app.storage.getCellError(sheetId, normalizedCellId) || '');
  var generatedBy = String(app.storage.getGeneratedCellSource(sheetId, normalizedCellId) || '');
  var mountedInput =
    app &&
    typeof app.getCellInput === 'function' &&
    String(currentSheetId || '') === String(sheetId || '')
      ? app.getCellInput(normalizedCellId)
      : null;
  var output =
    mountedInput && mountedInput.parentElement
      ? getRenderedCellOutput(mountedInput)
      : null;
  var shownOutput = String(output && output.textContent ? output.textContent : '');
  var shownHtml = String(output && output.innerHTML ? output.innerHTML : '');
  var outputNodes = mountedInput ? countRenderedCellOutputs(mountedInput) : 0;
  var names = getNamedCellNamesForCell(app, sheetId, normalizedCellId);
  var mentionRefs = getMentionRefsForRaw(app, raw);
  var versionInfo = getCellVersionInfoForDebug(app, sheetId, normalizedCellId);
  var generatedCount = getGeneratedCountForDebug(app, sheetId, normalizedCellId);
  var attachmentMeta = getAttachmentMetaForDebug(app, raw);
  return {
    address: formatDebugAddress(currentSheetId, sheetId, normalizedCellId),
    name: names.length ? names.join(',') : '',
    formula: raw,
    cellState: state,
    errorHint: errorHint,
    generatedBy: generatedBy,
    displayValue: display,
    value: display || computed,
    computedValue: computed,
    shownOutput: shownOutput,
    shownHtml: shownHtml,
    outputNodes: outputNodes,
    mentionRefs: mentionRefs,
    runtimeRevision: String(app.serverWorkbookRevision || ''),
    serverPushEnabled: app.serverPushEventsEnabled === true,
    serverPushState: String(app.serverPushConnectionState || ''),
    sourceVersion: Number(versionInfo.sourceVersion || 0),
    computedVersion: Number(versionInfo.computedVersion || 0),
    dependencyVersion: Number(versionInfo.dependencyVersion || 0),
    dependencySignature: String(versionInfo.dependencySignature || ''),
    generatedCount: generatedCount,
    attachmentMeta: attachmentMeta,
  };
}

function buildClientDebugEntryLine(app, currentSheetId, sheetId, cellId) {
  return serializeDebugEntryData(
    buildClientDebugEntryData(app, currentSheetId, sheetId, cellId),
  );
}

function collectSelectedDebugEntries(app) {
  var ids = typeof app.getSelectedCellIds === 'function' ? app.getSelectedCellIds() : [];
  if (!ids.length) return [];
  var sheetId = getVisibleSheetId(app);
  var queue = ids.map(function (cellId) {
    return String(sheetId || '') + ':' + String(cellId || '').toUpperCase();
  });
  var seen = Object.create(null);
  var entries = [];

  while (queue.length) {
    var sourceKey = String(queue.shift() || '');
    if (!sourceKey || seen[sourceKey]) continue;
    seen[sourceKey] = true;
    var parsed = parseDependencySourceKeyForDebug(sourceKey);
    if (!parsed || !parsed.sheetId || !parsed.cellId) continue;
    entries.push({
      sourceKey: sourceKey,
      sheetId: parsed.sheetId,
      cellId: parsed.cellId,
      currentSheetId: sheetId,
    });
    var raw = String(app.storage.getCellValue(parsed.sheetId, parsed.cellId) || '');
    var tokens = getMentionTokensForRaw(app, raw);
    for (var i = 0; i < tokens.length; i++) {
      var sourceKeys = resolveMentionTokenSourceKeys(
        app,
        parsed.sheetId,
        tokens[i],
      );
      for (var j = 0; j < sourceKeys.length; j++) {
        var nextKey = String(sourceKeys[j] || '');
        if (!nextKey || seen[nextKey]) continue;
        queue.push(nextKey);
      }
    }
    var standardRefs = collectStandardRefSourceKeys(app, parsed.sheetId, raw);
    for (var k = 0; k < standardRefs.length; k++) {
      var refKey = String(standardRefs[k] || '');
      if (!refKey || seen[refKey]) continue;
      queue.push(refKey);
    }
  }
  return entries;
}

function getWorkbookCellRecordForDebug(workbook, sheetId, cellId) {
  var sourceWorkbook = workbook && typeof workbook === 'object' ? workbook : null;
  var sheets = sourceWorkbook && sourceWorkbook.sheets && typeof sourceWorkbook.sheets === 'object'
    ? sourceWorkbook.sheets
    : null;
  var sheet = sheets && sheets[sheetId] && typeof sheets[sheetId] === 'object'
    ? sheets[sheetId]
    : null;
  var cells = sheet && sheet.cells && typeof sheet.cells === 'object' ? sheet.cells : null;
  var cell = cells && cells[cellId] && typeof cells[cellId] === 'object' ? cells[cellId] : null;
  return cell || null;
}

function getGeneratedCountForWorkbookDebug(workbook, sheetId, cellId) {
  var sourceWorkbook = workbook && typeof workbook === 'object' ? workbook : null;
  var sheets = sourceWorkbook && sourceWorkbook.sheets && typeof sourceWorkbook.sheets === 'object'
    ? sourceWorkbook.sheets
    : null;
  var sheet = sheets && sheets[sheetId] && typeof sheets[sheetId] === 'object'
    ? sheets[sheetId]
    : null;
  var cells = sheet && sheet.cells && typeof sheet.cells === 'object' ? sheet.cells : null;
  if (!cells) return 0;
  var normalizedCellId = String(cellId || '').toUpperCase();
  var count = 0;
  var ids = Object.keys(cells);
  for (var i = 0; i < ids.length; i++) {
    var record = cells[ids[i]];
    if (!record || typeof record !== 'object') continue;
    if (String(record.generatedBy || '').toUpperCase() === normalizedCellId) count += 1;
  }
  return count;
}

function buildServerDebugEntryData(app, currentSheetId, workbook, sheetId, cellId, syncState) {
  var normalizedCellId = String(cellId || '').toUpperCase();
  var cell = getWorkbookCellRecordForDebug(workbook, sheetId, normalizedCellId) || {};
  var raw = String(cell.source || '');
  var display = String(cell.displayValue || '');
  var computed = String(cell.value || '');
  var state = String(cell.state || '');
  var errorHint = String(cell.error || '');
  var generatedBy = String(cell.generatedBy || '');
  var mentionRefs = getMentionRefsForRaw(app, raw);
  var attachmentMeta = getAttachmentMetaForDebug(app, raw);
  return {
    address: formatDebugAddress(currentSheetId, sheetId, normalizedCellId),
    name: '',
    formula: raw,
    cellState: state,
    errorHint: errorHint,
    generatedBy: generatedBy,
    displayValue: display,
    value: display || computed,
    computedValue: computed,
    shownOutput: '',
    shownHtml: '',
    outputNodes: 0,
    mentionRefs: mentionRefs,
    runtimeRevision: String((syncState && syncState.runtimeRevision) || ''),
    serverPushEnabled: false,
    serverPushState: 'server-snapshot',
    sourceVersion: Number(cell.sourceVersion || cell.version || 0),
    computedVersion: Number(cell.computedVersion || 0),
    dependencyVersion: Number(cell.dependencyVersion || 0),
    dependencySignature: String(cell.dependencySignature || ''),
    generatedCount: getGeneratedCountForWorkbookDebug(workbook, sheetId, normalizedCellId),
    attachmentMeta: attachmentMeta,
  };
}

function buildDebugDiffLine(entry, clientData, serverData) {
  var client = clientData && typeof clientData === 'object' ? clientData : {};
  var server = serverData && typeof serverData === 'object' ? serverData : {};
  var fields = [
    'formula',
    'cellState',
    'errorHint',
    'generatedBy',
    'displayValue',
    'value',
    'computedValue',
    'mentionRefs',
    'sourceVersion',
    'computedVersion',
    'dependencyVersion',
    'dependencySignature',
    'generatedCount',
    'attachmentMeta',
  ];
  var changes = [];
  for (var i = 0; i < fields.length; i++) {
    var field = fields[i];
    var clientValue = JSON.stringify(client[field] == null ? null : client[field]);
    var serverValue = JSON.stringify(server[field] == null ? null : server[field]);
    if (clientValue === serverValue) continue;
    changes.push(field + ': client=' + clientValue + ' server=' + serverValue);
  }
  if (!changes.length) {
    return 'address=' + String((entry && entry.sourceKey) || '') + '\tdiff="no differences"';
  }
  return (
    'address=' +
    String((entry && entry.sourceKey) || '') +
    '\tdiff=' +
    JSON.stringify(changes.join(' | '))
  );
}

export function getSelectedRangeDebugText(app) {
  var entries = collectSelectedDebugEntries(app);
  if (!entries.length) return '';
  return entries
    .map(function (entry) {
      return buildClientDebugEntryLine(
        app,
        entry.currentSheetId,
        entry.sheetId,
        entry.cellId,
      );
    })
    .join('\n');
}

async function getSelectedRangeDebugBundleText(app) {
  var entries = collectSelectedDebugEntries(app);
  if (!entries.length) return '';
  var clientLines = [];
  var serverLines = [];
  var diffLines = [];
  var currentSheetId = getVisibleSheetId(app);
  var serverWorkbook = null;
  var syncState = null;

  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var clientData = buildClientDebugEntryData(
      app,
      entry.currentSheetId,
      entry.sheetId,
      entry.cellId,
    );
    clientLines.push(serializeDebugEntryData(clientData));
  }

  if (app && app.sheetDocumentId) {
    try {
      var serverResult = await rpc('sheets.one', app.sheetDocumentId);
      serverWorkbook =
        serverResult && serverResult.workbook && typeof serverResult.workbook === 'object'
          ? serverResult.workbook
          : null;
      syncState = serverResult && typeof serverResult === 'object'
        ? {
            documentRevision: String(serverResult.documentRevision || ''),
            runtimeRevision: String(serverResult.runtimeRevision || ''),
          }
        : null;
    } catch (_error) {
      serverWorkbook = null;
      syncState = null;
    }
  }

  if (!serverWorkbook) {
    return ['CLIENT', clientLines.join('\n'), 'SERVER', 'unavailable', 'DIFF', 'unavailable'].join(
      '\n',
    );
  }

  for (var j = 0; j < entries.length; j++) {
    var serverEntry = entries[j];
    var clientEntryData = buildClientDebugEntryData(
      app,
      serverEntry.currentSheetId,
      serverEntry.sheetId,
      serverEntry.cellId,
    );
    var serverEntryData = buildServerDebugEntryData(
      app,
      currentSheetId,
      serverWorkbook,
      serverEntry.sheetId,
      serverEntry.cellId,
      syncState,
    );
    serverLines.push(serializeDebugEntryData(serverEntryData));
    diffLines.push(buildDebugDiffLine(serverEntry, clientEntryData, serverEntryData));
  }

  return [
    'CLIENT',
    clientLines.join('\n'),
    'SERVER',
    serverLines.join('\n'),
    'DIFF',
    diffLines.join('\n'),
  ].join('\n');
}

export async function copySelectedRangeDebugToClipboard(app, copyTextFallback) {
  var text = await getSelectedRangeDebugBundleText(app);
  if (!text) return;
  var focusedElement = document.activeElement;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => {
      copyTextFallback(app, text, focusedElement);
    });
    return;
  }
  copyTextFallback(app, text, focusedElement);
}
