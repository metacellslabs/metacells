import { parseChannelSendCommand } from '../../../api/channels/commands.js';
import { describeCellSchedule } from '../../../lib/cell-schedule.js';

function parseCellId(cellId) {
  var match = /^([A-Za-z]+)([0-9]+)$/.exec(String(cellId || '').toUpperCase());
  if (!match) return null;
  var col = 0;
  for (var i = 0; i < match[1].length; i += 1) {
    col = col * 26 + (match[1].charCodeAt(i) - 64);
  }
  return {
    col: col,
    row: parseInt(match[2], 10) || 0,
  };
}

function getSheetName(app, sheetId) {
  var tabs = Array.isArray(app.tabs) ? app.tabs : [];
  for (var i = 0; i < tabs.length; i += 1) {
    if (tabs[i] && String(tabs[i].id || '') === String(sheetId || '')) {
      return String(tabs[i].name || sheetId || '');
    }
  }
  return String(sheetId || '');
}

function normalizeRawForCommand(rawValue) {
  var raw = String(rawValue == null ? '' : rawValue).trim();
  if (raw.charAt(0) === '>') raw = raw.substring(1).trim();
  return raw;
}

function getChannelSpec(app, rawValue) {
  var raw = String(rawValue == null ? '' : rawValue);
  var normalized = normalizeRawForCommand(raw);
  var bareLogMatch = /^\s*\/([A-Za-z][A-Za-z0-9_-]*)\s*$/.exec(raw);
  if (bareLogMatch && bareLogMatch[1]) {
    return {
      kind: 'feed',
      label: String(bareLogMatch[1] || '').trim().toLowerCase(),
      labels: [String(bareLogMatch[1] || '').trim().toLowerCase()],
    };
  }
  var sendCommand = parseChannelSendCommand(normalized);
  if (sendCommand && sendCommand.label) {
    return {
      kind: 'command',
      label: String(sendCommand.label || '').trim().toLowerCase(),
    };
  }
  if (
    app.formulaEngine &&
    typeof app.formulaEngine.parseChannelFeedPromptSpec === 'function'
  ) {
    var feed = app.formulaEngine.parseChannelFeedPromptSpec(raw);
    if (feed && Array.isArray(feed.labels) && feed.labels.length) {
      return {
        kind: 'feed',
        label: String(feed.labels[0] || '').trim().toLowerCase(),
        labels: feed.labels.slice(),
      };
    }
  }
  return null;
}

function getTrackerEntries(app) {
  var refs =
    app.storage && typeof app.storage.listAllCellIds === 'function'
      ? app.storage.listAllCellIds()
      : [];
  var entries = [];

  for (var i = 0; i < refs.length; i += 1) {
    var ref = refs[i];
    if (!ref || typeof ref !== 'object') continue;
    var sheetId = String(ref.sheetId || '');
    var cellId = String(ref.cellId || '').toUpperCase();
    if (!sheetId || !cellId) continue;
    var raw = String(app.storage.getCellValue(sheetId, cellId) || '');
    var schedule = app.storage.getCellSchedule(sheetId, cellId);
    var channelSpec = getChannelSpec(app, raw);
    if (!schedule && !channelSpec) continue;
    var parsed = parseCellId(cellId) || { row: 0, col: 0 };
    var tags = [];
    if (channelSpec) {
      tags.push(
        channelSpec.kind === 'feed'
          ? `channel /${channelSpec.label}`
          : `command /${channelSpec.label}`,
      );
    }
    if (schedule) {
      tags.push(describeCellSchedule(schedule));
    }
    entries.push({
      sheetId: sheetId,
      sheetName: getSheetName(app, sheetId),
      cellId: cellId,
      raw: raw,
      schedule: schedule,
      channelSpec: channelSpec,
      tags: tags,
      row: parsed.row,
      col: parsed.col,
    });
  }

  var tabOrder = {};
  var tabs = Array.isArray(app.tabs) ? app.tabs : [];
  for (var t = 0; t < tabs.length; t += 1) {
    if (!tabs[t]) continue;
    tabOrder[String(tabs[t].id || '')] = t;
  }

  entries.sort(function (a, b) {
    var tabA = Object.prototype.hasOwnProperty.call(tabOrder, a.sheetId)
      ? tabOrder[a.sheetId]
      : 9999;
    var tabB = Object.prototype.hasOwnProperty.call(tabOrder, b.sheetId)
      ? tabOrder[b.sheetId]
      : 9999;
    if (tabA !== tabB) return tabA - tabB;
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });

  return entries;
}

function renderTrackerEntries(app) {
  var entries = getTrackerEntries(app);
  app.formulaTrackerEntries = entries;
  if (app && typeof app.publishUiState === 'function') app.publishUiState();
}

function updatePanelOffset(app) {
  var assistantVisible = !!(app && app.assistantPanelOpen === true);
  app.formulaTrackerWithAssistantOffset = assistantVisible;
  if (app && typeof app.publishUiState === 'function') app.publishUiState();
}

function ensureFormulaTrackerPanel(app) {
  if (app.formulaTrackerPanel) return app.formulaTrackerPanel;
  var panel = document.querySelector('.formula-tracker-panel');
  if (!panel) return null;
  app.formulaTrackerPanel = panel;
  app.formulaTrackerPanelList = panel.querySelector('.formula-tracker-list');
  return panel;
}

export function getFormulaTrackerUiState(app) {
  var entries = Array.isArray(app && app.formulaTrackerEntries)
    ? app.formulaTrackerEntries.slice()
    : [];
  var activeSheetId =
    app && typeof app.getVisibleSheetId === 'function'
      ? String(app.getVisibleSheetId() || '')
      : String((app && app.activeSheetId) || '');
  var activeCellId =
    app && typeof app.getSelectionActiveCellId === 'function'
      ? String(app.getSelectionActiveCellId() || '')
      : String((app && app.activeCellId) || '');
  return {
    open: !!(app && app.formulaTrackerOpen),
    withAssistantOffset: !!(app && app.formulaTrackerWithAssistantOffset),
    entries: entries,
    activeSheetId: activeSheetId,
    activeCellId: activeCellId,
  };
}

export function setupFormulaTrackerPanel(app) {
  ensureFormulaTrackerPanel(app);
  app.formulaTrackerOpen = false;
  app.formulaTrackerEntries = Array.isArray(app.formulaTrackerEntries)
    ? app.formulaTrackerEntries
    : [];
  app.formulaTrackerWithAssistantOffset = false;
  document.addEventListener('click', function (event) {
    if (!app.formulaTrackerOpen) return;
    if (
      app.formulaTrackerButton &&
      (event.target === app.formulaTrackerButton ||
        (app.formulaTrackerButton.contains &&
          app.formulaTrackerButton.contains(event.target)))
    ) {
      return;
    }
    if (
      app.formulaTrackerPanel &&
      app.formulaTrackerPanel.contains &&
      app.formulaTrackerPanel.contains(event.target)
    ) {
      return;
    }
    hideFormulaTrackerPanel(app);
  });
}

export function toggleFormulaTrackerPanel(app) {
  var panel = ensureFormulaTrackerPanel(app);
  if (!panel) return;
  if (app.formulaTrackerOpen) {
    hideFormulaTrackerPanel(app);
    return;
  }
  updatePanelOffset(app);
  renderTrackerEntries(app);
  app.formulaTrackerOpen = true;
  if (app && typeof app.publishUiState === 'function') app.publishUiState();
}

export function hideFormulaTrackerPanel(app) {
  app.formulaTrackerOpen = false;
  if (app && typeof app.publishUiState === 'function') app.publishUiState();
}

export function refreshFormulaTrackerPanel(app) {
  if (!app.formulaTrackerOpen) return;
  updatePanelOffset(app);
  renderTrackerEntries(app);
}
