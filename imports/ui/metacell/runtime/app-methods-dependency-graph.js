export function installDependencyGraphMethods(SpreadsheetApp) {
  if (!SpreadsheetApp || !SpreadsheetApp.prototype) return;

  SpreadsheetApp.prototype.getDependentSourceKeysForActiveCell =
    function getDependentSourceKeysForActiveCell(cellId) {
      var graph = this.storage.getDependencyGraph();
      var key =
        String(this.activeSheetId || '') +
        ':' +
        String(cellId || '').toUpperCase();
      var results = [];
      var seen = Object.create(null);
      var addKeys = function (keys) {
        var list = Array.isArray(keys) ? keys : [];
        for (var i = 0; i < list.length; i++) {
          var item = String(list[i] || '');
          if (!item || seen[item]) continue;
          seen[item] = true;
          results.push(item);
        }
      };

      addKeys(graph && graph.dependentsByCell ? graph.dependentsByCell[key] : []);

      var namedCells = this.storage.readNamedCells();
      for (var name in namedCells) {
        if (!Object.prototype.hasOwnProperty.call(namedCells, name)) continue;
        var ref = namedCells[name];
        if (!ref || ref.sheetId !== this.activeSheetId) continue;
        if (
          String(ref.cellId || '').toUpperCase() !==
          String(cellId || '').toUpperCase()
        ) {
          continue;
        }
        addKeys(
          graph && graph.dependentsByNamedRef
            ? graph.dependentsByNamedRef[String(name)]
            : [],
        );
      }

      addKeys(this.scanDependentSourceKeys(key));
      return results;
    };

  SpreadsheetApp.prototype.hasDownstreamDependents = function hasDownstreamDependents(
    cellId,
  ) {
    return this.getDependentSourceKeysForActiveCell(cellId).length > 0;
  };

  SpreadsheetApp.prototype.hasDownstreamDependentsForCell =
    function hasDownstreamDependentsForCell(sheetId, cellId) {
      return this.getTransitiveDependentSourceKeysForCell(sheetId, cellId).length > 0;
    };

  SpreadsheetApp.prototype.parseDependencySourceKey = function parseDependencySourceKey(
    sourceKey,
  ) {
    var normalized = String(sourceKey || '');
    var separatorIndex = normalized.indexOf(':');
    if (separatorIndex === -1) return null;
    return {
      sheetId: normalized.slice(0, separatorIndex),
      cellId: normalized.slice(separatorIndex + 1).toUpperCase(),
    };
  };

  SpreadsheetApp.prototype.getTransitiveDependentSourceKeys =
    function getTransitiveDependentSourceKeys(cellId) {
      return this.getTransitiveDependentSourceKeysForCell(this.activeSheetId, cellId);
    };

  SpreadsheetApp.prototype.getTransitiveDependentSourceKeysForCell =
    function getTransitiveDependentSourceKeysForCell(sheetId, cellId) {
      var graph = this.storage.getDependencyGraph();
      var startKey =
        String(sheetId || '') +
        ':' +
        String(cellId || '').toUpperCase();
      var queue = [];
      var seen = Object.create(null);
      var result = [];
      var enqueue = function (key) {
        var normalized = String(key || '');
        if (!normalized || seen[normalized]) return;
        seen[normalized] = true;
        queue.push(normalized);
        result.push(normalized);
      };

      var direct =
        graph && graph.dependentsByCell ? graph.dependentsByCell[startKey] : [];
      direct = Array.isArray(direct) ? direct : [];
      for (var i = 0; i < direct.length; i++) enqueue(direct[i]);
      var scannedDirect = this.scanDependentSourceKeys(startKey);
      for (var s = 0; s < scannedDirect.length; s++) enqueue(scannedDirect[s]);

      var namedCells = this.storage.readNamedCells();
      for (var name in namedCells) {
        if (!Object.prototype.hasOwnProperty.call(namedCells, name)) continue;
        var ref = namedCells[name];
        if (!ref || ref.sheetId !== String(sheetId || '')) continue;
        if (
          String(ref.cellId || '').toUpperCase() !==
          String(cellId || '').toUpperCase()
        ) {
          continue;
        }
        var namedDependents =
          graph && graph.dependentsByNamedRef
            ? graph.dependentsByNamedRef[String(name)]
            : [];
        namedDependents = Array.isArray(namedDependents) ? namedDependents : [];
        for (var j = 0; j < namedDependents.length; j++) enqueue(namedDependents[j]);
      }

      while (queue.length) {
        var current = queue.shift();
        var downstream =
          graph && graph.dependentsByCell ? graph.dependentsByCell[current] : [];
        downstream = Array.isArray(downstream) ? downstream : [];
        for (var d = 0; d < downstream.length; d++) enqueue(downstream[d]);
        var scannedDownstream = this.scanDependentSourceKeys(current);
        for (var sd = 0; sd < scannedDownstream.length; sd++) {
          enqueue(scannedDownstream[sd]);
        }
      }

      return result;
    };

  SpreadsheetApp.prototype.scanDependentSourceKeys = function scanDependentSourceKeys(
    sourceKey,
  ) {
    var normalizedSourceKey = String(sourceKey || '');
    if (!normalizedSourceKey) return [];
    var separatorIndex = normalizedSourceKey.indexOf(':');
    if (separatorIndex === -1) return [];
    var targetSheetId = normalizedSourceKey.slice(0, separatorIndex);
    var targetCellId = normalizedSourceKey.slice(separatorIndex + 1).toUpperCase();
    var results = [];
    var seen = Object.create(null);
    var escapeRegExp = function (value) {
      return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };
    var sourceNames = [];
    var namedCells = this.storage.readNamedCells();
    for (var name in namedCells) {
      if (!Object.prototype.hasOwnProperty.call(namedCells, name)) continue;
      var ref = namedCells[name];
      if (!ref || String(ref.sheetId || '') !== targetSheetId) continue;
      if (String(ref.cellId || '').toUpperCase() !== targetCellId) continue;
      sourceNames.push(String(name));
    }
    var allCells =
      this.storage && typeof this.storage.listAllCellIds === 'function'
        ? this.storage.listAllCellIds()
        : [];

    for (var i = 0; i < allCells.length; i++) {
      var entry = allCells[i];
      if (!entry || !entry.sheetId || !entry.cellId) continue;
      var sourceSheetId = String(entry.sheetId || '');
      var sourceCellId = String(entry.cellId || '').toUpperCase();
      var raw = String(this.storage.getCellValue(sourceSheetId, sourceCellId) || '');
      if (!this.isFormulaLikeRawValue(raw)) continue;
      var dependencies = [];
      try {
        dependencies = this.formulaEngine.collectCellDependencies(
          sourceSheetId,
          sourceCellId,
        );
      } catch (error) {
        dependencies = [];
      }
      var matches = false;
      for (var d = 0; d < dependencies.length; d++) {
        var dependency = dependencies[d];
        if (!dependency || dependency.kind !== 'cell') continue;
        if (String(dependency.sheetId || '') !== targetSheetId) continue;
        if (String(dependency.cellId || '').toUpperCase() !== targetCellId) continue;
        matches = true;
        break;
      }
      if (!matches) {
        var body =
          raw.charAt(0) === '=' ||
          raw.charAt(0) === "'" ||
          raw.charAt(0) === '>' ||
          raw.charAt(0) === '#'
            ? raw.substring(1)
            : raw;
        if (sourceSheetId === targetSheetId) {
          var cellPattern = new RegExp(
            '(^|[^A-Za-z0-9_!])@?' + escapeRegExp(targetCellId) + '\\b',
            'i',
          );
          matches = cellPattern.test(body);
        }
        if (!matches && sourceNames.length) {
          for (var n = 0; n < sourceNames.length; n++) {
            var namedPattern = new RegExp(
              '(^|[^A-Za-z0-9_])@?' + escapeRegExp(sourceNames[n]) + '\\b',
              'i',
            );
            if (namedPattern.test(body)) {
              matches = true;
              break;
            }
          }
        }
      }
      if (!matches) continue;
      var key = sourceSheetId + ':' + sourceCellId;
      if (seen[key]) continue;
      seen[key] = true;
      results.push(key);
    }

    return results;
  };

  SpreadsheetApp.prototype.canLocallyResolveSyncSourceKey =
    function canLocallyResolveSyncSourceKey(sourceKey, trace) {
      var parsed = this.parseDependencySourceKey(sourceKey);
      if (!parsed) return false;
      var visiting = trace || Object.create(null);
      var normalizedKey = parsed.sheetId + ':' + parsed.cellId;
      if (visiting[normalizedKey]) return true;
      visiting[normalizedKey] = true;

      try {
        var raw = String(this.storage.getCellValue(parsed.sheetId, parsed.cellId) || '');
        if (!raw || raw.charAt(0) !== '=') return false;
        if (this.isExplicitAsyncFormulaRaw(raw)) return false;
        if (this.parseAttachmentSource(raw)) return false;

        var deps = this.storage.getCellDependencies(parsed.sheetId, parsed.cellId) || {};
        if (Array.isArray(deps.channelLabels) && deps.channelLabels.length) return false;

        var namedRefs = Array.isArray(deps.namedRefs) ? deps.namedRefs : [];
        for (var nr = 0; nr < namedRefs.length; nr++) {
          var ref = this.storage.resolveNamedCell(namedRefs[nr]);
          if (!ref || !ref.sheetId) return false;
          if (ref.cellId) {
            var namedRaw = String(this.storage.getCellValue(ref.sheetId, ref.cellId) || '');
            if (this.isFormulaLikeRawValue(namedRaw)) {
              if (
                !this.canLocallyResolveSyncSourceKey(
                  ref.sheetId + ':' + String(ref.cellId).toUpperCase(),
                  visiting,
                )
              ) {
                return false;
              }
            }
          } else {
            return false;
          }
        }

        var cells = Array.isArray(deps.cells) ? deps.cells : [];
        for (var i = 0; i < cells.length; i++) {
          var entry = cells[i];
          if (!entry || typeof entry !== 'object') continue;
          var depSheetId = String(entry.sheetId || '');
          var depCellId = String(entry.cellId || '').toUpperCase();
          var depRaw = String(this.storage.getCellValue(depSheetId, depCellId) || '');
          if (this.isFormulaLikeRawValue(depRaw)) {
            if (
              !this.canLocallyResolveSyncSourceKey(
                depSheetId + ':' + depCellId,
                visiting,
              )
            ) {
              return false;
            }
          }
        }

        return true;
      } finally {
        delete visiting[normalizedKey];
      }
    };
}
