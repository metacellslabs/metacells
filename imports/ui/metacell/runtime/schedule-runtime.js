import {
  describeCellSchedule,
  normalizeCellSchedule,
} from '../../../lib/cell-schedule.js';
import { resolveSelectionSourceCellId } from './selection-source-runtime.js';

var DEFAULT_SCHEDULE = {
  kind: 'once',
  datetime: '',
  time: '09:00',
  daysOfWeek: [1],
  dayOfMonth: 1,
  intervalMinutes: 60,
  cron: '',
  label: '',
};

function buildScheduleDialogDraft(scheduleValue) {
  var schedule = normalizeCellSchedule(scheduleValue) || DEFAULT_SCHEDULE;
  return {
    kind: String(schedule.kind || 'once'),
    datetime: String(schedule.datetime || ''),
    time: String(schedule.time || '09:00'),
    daysOfWeek: Array.isArray(schedule.daysOfWeek)
      ? schedule.daysOfWeek.slice()
      : [1],
    dayOfMonth: String(schedule.dayOfMonth || 1),
    intervalMinutes: String(schedule.intervalMinutes || 60),
    cron: String(schedule.cron || ''),
    label: String(schedule.label || ''),
  };
}

function readScheduleFromDraft(app, lenient) {
  var ui =
    app && app.scheduleDialogUiState && typeof app.scheduleDialogUiState === 'object'
      ? app.scheduleDialogUiState
      : null;
  var draft = ui && ui.draft && typeof ui.draft === 'object' ? ui.draft : null;
  if (!draft) return null;
  var kind = String(draft.kind || 'once');
  var base = {
    origin: 'manual',
    kind: kind,
    label: String(draft.label || '').trim(),
  };
  if (kind === 'once') {
    var datetime = String(draft.datetime || '').trim();
    if (!datetime && !lenient) return null;
    return { ...base, datetime: datetime };
  }
  if (kind === 'daily') {
    return { ...base, time: String(draft.time || '09:00') };
  }
  if (kind === 'weekly') {
    return {
      ...base,
      time: String(draft.time || '09:00'),
      daysOfWeek: Array.isArray(draft.daysOfWeek)
        ? draft.daysOfWeek.map(function (value) {
            return parseInt(value, 10) || 0;
          })
        : [],
    };
  }
  if (kind === 'monthly') {
    return {
      ...base,
      time: String(draft.time || '09:00'),
      dayOfMonth: parseInt(draft.dayOfMonth, 10),
    };
  }
  if (kind === 'interval') {
    return {
      ...base,
      intervalMinutes: parseInt(draft.intervalMinutes, 10),
    };
  }
  if (kind === 'cron') {
    return {
      ...base,
      cron: String(draft.cron || '').trim(),
    };
  }
  return null;
}

function updateScheduleDialogUiState(app, nextState) {
  app.scheduleDialogUiState = {
    ...(app.scheduleDialogUiState && typeof app.scheduleDialogUiState === 'object'
      ? app.scheduleDialogUiState
      : null),
    ...(nextState && typeof nextState === 'object' ? nextState : null),
  };
  if (typeof app.publishUiState === 'function') {
    app.publishUiState();
  }
}

export function getScheduleDialogUiState(app) {
  var state =
    app && app.scheduleDialogUiState && typeof app.scheduleDialogUiState === 'object'
      ? app.scheduleDialogUiState
      : null;
  var draft =
    state && state.draft && typeof state.draft === 'object'
      ? { ...state.draft }
      : buildScheduleDialogDraft(null);
  var summarySchedule = readScheduleFromDraft(
    { scheduleDialogUiState: { draft: draft } },
    true,
  );
  return {
    open: state ? state.open === true : false,
    cellId: state ? String(state.cellId || '') : '',
    draft: draft,
    summary: summarySchedule ? describeCellSchedule(summarySchedule) : '',
  };
}

export function setupScheduleDialog(app) {
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') hideScheduleDialog(app);
  });
}

export function showScheduleDialogForCell(app, cellId) {
  var targetCellId = resolveSelectionSourceCellId(app, cellId);
  if (!targetCellId) return;
  updateScheduleDialogUiState(app, {
    open: true,
    cellId: targetCellId,
    draft: buildScheduleDialogDraft(
      app.storage.getCellSchedule(app.activeSheetId, targetCellId),
    ),
  });
}

export function showScheduleDialogForContextCell(app) {
  if (!app.contextMenuState || app.contextMenuState.type !== 'cell') return;
  var cellId = app.cellIdFrom(app.contextMenuState.col, app.contextMenuState.row);
  showScheduleDialogForCell(app, cellId);
}

export function hideScheduleDialog(app) {
  updateScheduleDialogUiState(app, {
    open: false,
    cellId: '',
  });
}

export function updateScheduleDialogDraft(app, patch) {
  var current =
    app && app.scheduleDialogUiState && app.scheduleDialogUiState.draft
      ? app.scheduleDialogUiState.draft
      : buildScheduleDialogDraft(null);
  updateScheduleDialogUiState(app, {
    draft: {
      ...current,
      ...(patch && typeof patch === 'object' ? patch : null),
    },
  });
}

export function saveScheduleDialog(app) {
  var target = resolveSelectionSourceCellId(
    app,
    app && app.scheduleDialogUiState
      ? String(app.scheduleDialogUiState.cellId || '')
      : '',
  );
  if (!target) {
    hideScheduleDialog(app);
    return;
  }
  var scheduleValue = readScheduleFromDraft(app, false);
  app.captureHistorySnapshot('schedule:' + app.activeSheetId + ':' + target);
  app.setCellSchedule(target, scheduleValue);
  app.renderCurrentSheetFromStorage();
  hideScheduleDialog(app);
}

export function clearScheduleDialog(app) {
  var target = resolveSelectionSourceCellId(
    app,
    app && app.scheduleDialogUiState
      ? String(app.scheduleDialogUiState.cellId || '')
      : '',
  );
  if (!target) {
    hideScheduleDialog(app);
    return;
  }
  app.captureHistorySnapshot('schedule:' + app.activeSheetId + ':' + target);
  app.setCellSchedule(target, null);
  app.renderCurrentSheetFromStorage();
  hideScheduleDialog(app);
}
