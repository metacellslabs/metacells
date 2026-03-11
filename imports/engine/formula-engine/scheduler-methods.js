export const schedulerMethods = {
  expandDependencyToCells(dependency) {
    if (!dependency || !dependency.kind) return [];
    if (dependency.kind === 'cell' && dependency.sheetId && dependency.cellId) {
      return [
        {
          sheetId: String(dependency.sheetId),
          cellId: String(dependency.cellId).toUpperCase(),
        },
      ];
    }
    if (
      dependency.kind !== 'region' ||
      !dependency.sheetId ||
      !dependency.startCellId ||
      !dependency.endCellId
    ) {
      return [];
    }

    var start = this.parseCellId(dependency.startCellId);
    var end = this.parseCellId(dependency.endCellId);
    if (!start || !end) return [];

    var rowStart = Math.min(start.row, end.row);
    var rowEnd = Math.max(start.row, end.row);
    var colStart = Math.min(start.col, end.col);
    var colEnd = Math.max(start.col, end.col);
    var cells = [];

    for (var r = rowStart; r <= rowEnd; r++) {
      for (var c = colStart; c <= colEnd; c++) {
        cells.push({
          sheetId: String(dependency.sheetId),
          cellId: this.columnIndexToLabel(c) + r,
        });
      }
    }

    return cells;
  },

  collectFormulaReferenceDependencies(sheetId, formulaText) {
    var source = String(formulaText == null ? '' : formulaText);
    if (!source) return [];

    var results = [];
    var seen = {};
    var pushDependency = (dependency) => {
      var expanded = this.expandDependencyToCells(dependency);
      for (var i = 0; i < expanded.length; i++) {
        var ref = expanded[i];
        var key = String(ref.sheetId) + ':' + String(ref.cellId).toUpperCase();
        if (seen[key]) continue;
        seen[key] = true;
        results.push({
          kind: 'cell',
          sheetId: String(ref.sheetId),
          cellId: String(ref.cellId).toUpperCase(),
        });
      }
    };

    var promptDeps = this.collectAIPromptDependencies(sheetId, source);
    for (var p = 0; p < promptDeps.length; p++) {
      pushDependency(promptDeps[p]);
    }

    source.replace(
      /(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+):([A-Za-z]+[0-9]+)/g,
      (_, quoted, plain, startCellId, endCellId) => {
        var refSheetId = this.findSheetIdByName(quoted || plain || '');
        if (!refSheetId) return _;
        pushDependency({
          kind: 'region',
          sheetId: refSheetId,
          startCellId: String(startCellId).toUpperCase(),
          endCellId: String(endCellId).toUpperCase(),
        });
        return _;
      },
    );

    source.replace(
      /\b([A-Za-z]+[0-9]+):([A-Za-z]+[0-9]+)\b/g,
      (_, startCellId, endCellId) => {
        pushDependency({
          kind: 'region',
          sheetId: sheetId,
          startCellId: String(startCellId).toUpperCase(),
          endCellId: String(endCellId).toUpperCase(),
        });
        return _;
      },
    );

    source.replace(
      /(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+)/g,
      (_, quoted, plain, cellId) => {
        var refSheetId = this.findSheetIdByName(quoted || plain || '');
        if (!refSheetId) return _;
        pushDependency({
          kind: 'cell',
          sheetId: refSheetId,
          cellId: String(cellId).toUpperCase(),
        });
        return _;
      },
    );

    source.replace(/\b([A-Za-z]+[0-9]+)\b/g, (_, cellId) => {
      pushDependency({
        kind: 'cell',
        sheetId: sheetId,
        cellId: String(cellId).toUpperCase(),
      });
      return _;
    });

    return results;
  },

  collectCellDependencies(sheetId, cellId) {
    var raw = String(this.storageService.getCellValue(sheetId, cellId) || '');
    if (!raw) return [];

    if (raw.charAt(0) === "'") {
      return this.collectFormulaReferenceDependencies(
        sheetId,
        raw.substring(1),
      );
    }

    if (raw.charAt(0) === '>') {
      return this.collectFormulaReferenceDependencies(
        sheetId,
        this.parseListShortcutPrompt(raw),
      );
    }

    if (raw.charAt(0) === '#') {
      var spec =
        typeof this.parseTablePromptSpec === 'function'
          ? this.parseTablePromptSpec(raw)
          : null;
      return this.collectFormulaReferenceDependencies(
        sheetId,
        spec && spec.prompt ? spec.prompt : raw.substring(1),
      );
    }

    if (raw.charAt(0) === '=') {
      return this.collectFormulaReferenceDependencies(
        sheetId,
        raw.substring(1),
      );
    }

    return [];
  },

  buildEvaluationPlan(sheetId) {
    var targetSheetId = String(sheetId || '');
    var order = this.cellIds.slice();
    var indegree = {};
    var outgoing = {};
    var known = {};

    for (var i = 0; i < order.length; i++) {
      known[order[i]] = true;
      indegree[order[i]] = 0;
      outgoing[order[i]] = [];
    }

    for (var j = 0; j < order.length; j++) {
      var cellId = order[j];
      var dependencies = this.collectCellDependencies(targetSheetId, cellId);
      for (var d = 0; d < dependencies.length; d++) {
        var dependency = dependencies[d];
        if (!dependency || String(dependency.sheetId || '') !== targetSheetId)
          continue;
        var depCellId = String(dependency.cellId || '').toUpperCase();
        if (!known[depCellId]) continue;
        if (depCellId === cellId) continue;
        outgoing[depCellId].push(cellId);
        indegree[cellId] += 1;
      }
    }

    var queue = [];
    for (var q = 0; q < order.length; q++) {
      if (!indegree[order[q]]) queue.push(order[q]);
    }

    var scheduled = [];
    var queued = {};
    for (var qi = 0; qi < queue.length; qi++) queued[queue[qi]] = true;

    while (queue.length) {
      var next = queue.shift();
      scheduled.push(next);
      var dependents = outgoing[next] || [];
      for (var k = 0; k < dependents.length; k++) {
        indegree[dependents[k]] -= 1;
        if (indegree[dependents[k]] <= 0 && !queued[dependents[k]]) {
          queue.push(dependents[k]);
          queued[dependents[k]] = true;
        }
      }
    }

    if (scheduled.length < order.length) {
      for (var r = 0; r < order.length; r++) {
        if (scheduled.indexOf(order[r]) === -1) {
          scheduled.push(order[r]);
        }
      }
    }

    return scheduled;
  },
};
