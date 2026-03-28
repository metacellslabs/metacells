import { isChannelSendCommandRaw } from './cell-render-model.js';
import { getAttachmentDisplayLabel } from './attachment-render-runtime.js';
import { restoreRuntimeStateSnapshot } from './runtime-cell-state-facade.js';

function attachmentCompletenessScore(attachment) {
  var meta = attachment && typeof attachment === 'object' ? attachment : null;
  if (!meta) return -1;
  var score = 0;
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

export function collectLocalChannelCommandRuntimeState(app) {
  if (!app || !app.storage || typeof app.storage.listAllCellIds !== 'function') {
    return [];
  }
  var entries = app.storage.listAllCellIds();
  var results = [];
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (!entry || !entry.sheetId || !entry.cellId) continue;
    var sheetId = String(entry.sheetId || '');
    var cellId = String(entry.cellId || '').toUpperCase();
    var raw = String(app.storage.getCellValue(sheetId, cellId) || '');
    if (!isChannelSendCommandRaw(raw)) continue;
    results.push({
      sheetId: sheetId,
      cellId: cellId,
      raw: raw,
      displayValue: String(app.storage.getCellDisplayValue(sheetId, cellId) || ''),
      value: String(app.storage.getCellComputedValue(sheetId, cellId) || ''),
      state: String(app.storage.getCellState(sheetId, cellId) || ''),
      error: String(app.storage.getCellError(sheetId, cellId) || ''),
    });
  }
  return results;
}

export function restoreLocalChannelCommandRuntimeState(app, entries) {
  var items = Array.isArray(entries) ? entries : [];
  for (var i = 0; i < items.length; i++) {
    var entry = items[i] && typeof items[i] === 'object' ? items[i] : null;
    if (!entry || !entry.sheetId || !entry.cellId) continue;
    var currentRaw = String(
      app.storage.getCellValue(entry.sheetId, entry.cellId) || '',
    );
    if (currentRaw !== String(entry.raw || '')) continue;
    restoreRuntimeStateSnapshot(app, entry);
  }
}

export function collectLocalAttachmentRuntimeState(app) {
  if (
    !app ||
    !app.storage ||
    typeof app.storage.listAllCellIds !== 'function' ||
    typeof app.parseAttachmentSource !== 'function'
  ) {
    return [];
  }
  var entries = app.storage.listAllCellIds();
  var results = [];
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    if (!entry || !entry.sheetId || !entry.cellId) continue;
    var sheetId = String(entry.sheetId || '');
    var cellId = String(entry.cellId || '').toUpperCase();
    var raw = String(app.storage.getCellValue(sheetId, cellId) || '');
    var attachment = app.parseAttachmentSource(raw);
    if (!attachment) continue;
    results.push({
      sheetId: sheetId,
      cellId: cellId,
      raw: raw,
      score: attachmentCompletenessScore(attachment),
    });
  }
  return results;
}

export function restoreLocalAttachmentRuntimeState(app, entries) {
  if (!app || !app.storage || typeof app.parseAttachmentSource !== 'function') {
    return;
  }
  var items = Array.isArray(entries) ? entries : [];
  for (var i = 0; i < items.length; i++) {
    var entry = items[i] && typeof items[i] === 'object' ? items[i] : null;
    if (!entry || !entry.sheetId || !entry.cellId) continue;
    var localRaw = String(entry.raw || '');
    var localAttachment = app.parseAttachmentSource(localRaw);
    if (!localAttachment) continue;
    var currentRaw = String(
      app.storage.getCellValue(entry.sheetId, entry.cellId) || '',
    );
    var currentAttachment = app.parseAttachmentSource(currentRaw);
    if (!currentAttachment) {
      app.storage.setCellValue(entry.sheetId, entry.cellId, localRaw);
      continue;
    }
    if (
      attachmentCompletenessScore(localAttachment) >
      attachmentCompletenessScore(currentAttachment)
    ) {
      app.storage.setCellValue(entry.sheetId, entry.cellId, localRaw);
    }
  }
}

export function getRenderTargetsForComputeResult(app, computedValues, didResort) {
  var allInputs = Array.isArray(app.inputs) ? app.inputs : [];
  if (didResort) return allInputs;
  var values =
    computedValues && typeof computedValues === 'object' ? computedValues : {};
  var ids = Object.keys(values);
  if (!ids.length) return [];
  if (ids.length >= allInputs.length) return allInputs;
  var targets = [];
  for (var i = 0; i < ids.length; i++) {
    var input =
      typeof app.getCellInput === 'function'
        ? app.getCellInput(ids[i])
        : app.inputById[ids[i]];
    if (input) targets.push(input);
  }
  return targets.length ? targets : [];
}

export function syncFormulaBarWithActiveCell(app) {
  var activeInput = app.getActiveCellInput
    ? app.getActiveCellInput()
    : app.activeInput;
  if (!activeInput || app.hasPendingLocalEdit()) return;
  var rawValue = app.getRawCellValue(activeInput.id);
  var attachment = app.parseAttachmentSource(rawValue);
  app.formulaInput.value = attachment
    ? getAttachmentDisplayLabel(attachment)
    : rawValue;
}
