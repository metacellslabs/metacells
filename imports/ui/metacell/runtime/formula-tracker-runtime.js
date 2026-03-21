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
  if (!app.formulaTrackerPanelList) return;
  var entries = getTrackerEntries(app);
  app.formulaTrackerEntries = entries;
  app.formulaTrackerPanelList.innerHTML = '';

  if (!entries.length) {
    var empty = document.createElement('div');
    empty.className = 'formula-tracker-empty';
    empty.textContent = 'No channel or scheduled cells yet.';
    app.formulaTrackerPanelList.appendChild(empty);
    return;
  }

  for (var i = 0; i < entries.length; i += 1) {
    var entry = entries[i];
    var item = document.createElement('button');
    item.type = 'button';
    item.className = 'formula-tracker-item';
    if (
      String(entry.sheetId || '') === String(app.activeSheetId || '') &&
      app.activeInput &&
      String(app.activeInput.id || '').toUpperCase() === entry.cellId
    ) {
      item.classList.add('active');
    }
    item.dataset.sheetId = entry.sheetId;
    item.dataset.cellId = entry.cellId;

    var title = document.createElement('div');
    title.className = 'formula-tracker-item-title';
    title.textContent = `${entry.sheetName} · ${entry.cellId}`;
    item.appendChild(title);

    var meta = document.createElement('div');
    meta.className = 'formula-tracker-item-meta';
    meta.textContent = entry.tags.join(' · ');
    item.appendChild(meta);

    var preview = document.createElement('div');
    preview.className = 'formula-tracker-item-preview';
    preview.textContent = String(entry.raw || '').trim() || '(empty)';
    item.appendChild(preview);

    item.addEventListener('click', function (event) {
      var button = event.currentTarget;
      var targetSheetId = String(button.dataset.sheetId || '');
      var targetCellId = String(button.dataset.cellId || '').toUpperCase();
      if (!targetSheetId || !targetCellId) return;
      if (targetSheetId !== app.activeSheetId) app.switchToSheet(targetSheetId);
      window.requestAnimationFrame(function () {
        var input = app.inputById ? app.inputById[targetCellId] : null;
        if (!input) return;
        app.setActiveInput(input);
        if (typeof input.focus === 'function') input.focus();
        refreshFormulaTrackerPanel(app);
      });
    });

    app.formulaTrackerPanelList.appendChild(item);
  }
}

function updatePanelOffset(app) {
  if (!app.formulaTrackerPanel) return;
  var assistantVisible = !!(
    app.assistantPanel && app.assistantPanel.style.display !== 'none'
  );
  app.formulaTrackerPanel.classList.toggle(
    'with-assistant-offset',
    assistantVisible,
  );
}

function ensureFormulaTrackerPanel(app) {
  if (app.formulaTrackerPanel) return app.formulaTrackerPanel;
  var panel = document.createElement('aside');
  panel.className = 'formula-tracker-panel';
  panel.style.display = 'none';
  panel.innerHTML =
    "<div class='formula-tracker-head'>" +
    "<div class='formula-tracker-title-wrap'>" +
    "<div class='formula-tracker-title'>Automation</div>" +
    "<div class='formula-tracker-subtitle'>Channel and scheduled cells</div>" +
    '</div>' +
    "<button type='button' class='formula-tracker-close' aria-label='Close'>×</button>" +
    '</div>' +
    "<div class='formula-tracker-list'></div>";
  document.body.appendChild(panel);

  panel
    .querySelector('.formula-tracker-close')
    .addEventListener('click', function () {
      hideFormulaTrackerPanel(app);
    });

  app.formulaTrackerPanel = panel;
  app.formulaTrackerPanelList = panel.querySelector('.formula-tracker-list');
  return panel;
}

export function setupFormulaTrackerPanel(app) {
  ensureFormulaTrackerPanel(app);
  document.addEventListener('click', function (event) {
    if (!app.formulaTrackerPanel || app.formulaTrackerPanel.style.display === 'none')
      return;
    if (
      app.formulaTrackerButton &&
      (event.target === app.formulaTrackerButton ||
        (app.formulaTrackerButton.contains &&
          app.formulaTrackerButton.contains(event.target)))
    ) {
      return;
    }
    if (
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
  if (panel.style.display !== 'none') {
    hideFormulaTrackerPanel(app);
    return;
  }
  updatePanelOffset(app);
  renderTrackerEntries(app);
  panel.style.display = 'flex';
  if (app.formulaTrackerButton) {
    app.formulaTrackerButton.classList.add('active');
  }
}

export function hideFormulaTrackerPanel(app) {
  if (!app.formulaTrackerPanel) return;
  app.formulaTrackerPanel.style.display = 'none';
  if (app.formulaTrackerButton) {
    app.formulaTrackerButton.classList.remove('active');
  }
}

export function refreshFormulaTrackerPanel(app) {
  if (!app.formulaTrackerPanel || app.formulaTrackerPanel.style.display === 'none')
    return;
  updatePanelOffset(app);
  renderTrackerEntries(app);
}
