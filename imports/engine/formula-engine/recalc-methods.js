// Description: recalc methods extracted from FormulaEngine for smaller logical modules.
export const recalcMethods = {
  recalc(sheetId, sourceCellId, condition, targetCellRef, stack) {
    var shouldRecalc = !!condition;
    var targetCellId = this.normalizeRecalcTarget(sourceCellId, targetCellRef);
    if (!targetCellId) return false;
    var stateKey =
      sheetId + ':' + String(sourceCellId).toUpperCase() + '->' + targetCellId;
    if (!shouldRecalc) {
      console.info('[recalc] condition=false', {
        sheetId: sheetId,
        sourceCellId: sourceCellId,
        targetCellId: targetCellId,
      });
      this.recalcState[stateKey] = false;
      return false;
    }
    var wasTriggered = !!this.recalcState[stateKey];
    this.recalcState[stateKey] = true;
    if (wasTriggered) {
      console.info('[recalc] condition=true already triggered', {
        sheetId: sheetId,
        sourceCellId: sourceCellId,
        targetCellId: targetCellId,
      });
      return true;
    }

    console.info('[recalc] condition changed false->true, forcing refresh', {
      sheetId: sheetId,
      sourceCellId: sourceCellId,
      targetCellId: targetCellId,
    });
    this.deferRecalc(sheetId, targetCellId);

    return true;
  },

  updateCellFormula(
    sourceSheetId,
    sourceCellId,
    targetCellRef,
    newFormulaValue,
  ) {
    var target = this.normalizeUpdateTarget(
      sourceSheetId,
      sourceCellId,
      targetCellRef,
    );
    if (!target) return false;
    var nextRaw = String(newFormulaValue == null ? '' : newFormulaValue);
    var prevRaw = this.storageService.getCellValue(
      target.sheetId,
      target.cellId,
    );
    if (prevRaw === nextRaw) return true;
    this.storageService.setCellValue(target.sheetId, target.cellId, nextRaw);
    return true;
  },

  triggerRecalc(sheetId, targetCellId, stack) {
    try {
      console.info('[recalc] triggerRecalc now', {
        sheetId: sheetId,
        targetCellId: targetCellId,
      });
      var value = this.aiService.withManualTrigger(() =>
        this.evaluateCell(sheetId, targetCellId, stack || {}, {
          forceRefreshAI: true,
        }),
      );
      console.info('[recalc] triggerRecalc done', {
        sheetId: sheetId,
        targetCellId: targetCellId,
        value: value,
      });
    } catch (e) {
      console.error('[recalc] triggerRecalc error', {
        sheetId: sheetId,
        targetCellId: targetCellId,
        message: e && e.message ? e.message : String(e),
      });
    }
  },

  deferRecalc(sheetId, targetCellId) {
    var queueKey = sheetId + ':' + targetCellId;
    if (this.recalcQueued[queueKey]) {
      console.info('[recalc] deferRecalc skipped (already queued)', {
        sheetId: sheetId,
        targetCellId: targetCellId,
      });
      return;
    }
    this.recalcQueued[queueKey] = true;
    console.info('[recalc] deferRecalc scheduled', {
      sheetId: sheetId,
      targetCellId: targetCellId,
    });
    setTimeout(() => {
      console.info('[recalc] deferRecalc executing', {
        sheetId: sheetId,
        targetCellId: targetCellId,
      });
      delete this.recalcQueued[queueKey];
      this.triggerRecalc(sheetId, targetCellId, {});
    }, 0);
  },

  normalizeRecalcTarget(sourceCellId, targetCellRef) {
    if (targetCellRef == null) return String(sourceCellId).toUpperCase();

    var normalized = String(targetCellRef).trim();
    if (!normalized) return String(sourceCellId).toUpperCase();
    if (/^cell$/i.test(normalized)) return String(sourceCellId).toUpperCase();

    var match = /^([A-Za-z]+[0-9]+)$/.exec(normalized);
    if (!match) return null;
    return match[1].toUpperCase();
  },

  normalizeUpdateTarget(sourceSheetId, sourceCellId, targetCellRef) {
    var sourceCell = String(sourceCellId || '').toUpperCase();
    if (targetCellRef == null)
      return { sheetId: sourceSheetId, cellId: sourceCell };

    var token = String(targetCellRef).trim();
    if (!token || /^cell$/i.test(token))
      return { sheetId: sourceSheetId, cellId: sourceCell };
    if (token.charAt(0) === '@') token = token.substring(1).trim();

    var sheetCell =
      /^(?:'([^']+)'|([A-Za-z][A-Za-z0-9 _-]*))!([A-Za-z]+[0-9]+)$/.exec(token);
    if (sheetCell) {
      var sheetName = sheetCell[1] || sheetCell[2] || '';
      var refSheetId = this.findSheetIdByName(sheetName);
      if (!refSheetId) return null;
      return { sheetId: refSheetId, cellId: sheetCell[3].toUpperCase() };
    }

    var localCell = /^([A-Za-z]+[0-9]+)$/.exec(token);
    if (localCell)
      return { sheetId: sourceSheetId, cellId: localCell[1].toUpperCase() };

    var named = this.storageService.resolveNamedCell(token);
    if (named && named.sheetId && named.cellId) {
      return {
        sheetId: named.sheetId,
        cellId: String(named.cellId).toUpperCase(),
      };
    }

    return null;
  },
};
