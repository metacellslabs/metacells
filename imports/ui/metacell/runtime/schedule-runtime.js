import {
  describeCellSchedule,
  normalizeCellSchedule,
} from '../../../lib/cell-schedule.js';

function ensureScheduleDialog(app) {
  if (app.scheduleDialog) return app.scheduleDialog;
  const overlay = document.createElement('div');
  overlay.className = 'cell-schedule-overlay';
  overlay.style.display = 'none';
  overlay.innerHTML =
    "<div class='cell-schedule-modal' role='dialog' aria-modal='true' aria-labelledby='cell-schedule-title'>" +
    "<div class='cell-schedule-head'><h2 id='cell-schedule-title'>Schedule Cell</h2><button type='button' class='cell-schedule-close' data-action='cancel' aria-label='Close'>×</button></div>" +
    "<p class='cell-schedule-copy'>Run this cell on the server using a one-time, recurring, or cron schedule.</p>" +
    "<label class='cell-schedule-field'><span>Pattern</span><select name='kind'><option value='once'>Once</option><option value='daily'>Daily</option><option value='weekly'>Weekly</option><option value='monthly'>Monthly</option><option value='interval'>Every N minutes</option><option value='cron'>Cron</option></select></label>" +
    "<label class='cell-schedule-field cell-schedule-only cell-schedule-kind-once'><span>Date & time</span><input name='datetime' type='datetime-local' /></label>" +
    "<label class='cell-schedule-field cell-schedule-only cell-schedule-kind-daily cell-schedule-kind-weekly cell-schedule-kind-monthly'><span>Time</span><input name='time' type='time' value='09:00' /></label>" +
    "<div class='cell-schedule-field cell-schedule-only cell-schedule-kind-weekly'><span>Weekdays</span><div class='cell-schedule-weekdays'>" +
    [0, 1, 2, 3, 4, 5, 6]
      .map(
        (day) =>
          "<label><input type='checkbox' name='weekday' value='" +
          day +
          "'" +
          (day === 1 ? ' checked' : '') +
          " /><span>" +
          ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day] +
          '</span></label>',
      )
      .join('') +
    '</div></div>' +
    "<label class='cell-schedule-field cell-schedule-only cell-schedule-kind-monthly'><span>Day of month</span><input name='dayOfMonth' type='number' min='1' max='31' value='1' /></label>" +
    "<label class='cell-schedule-field cell-schedule-only cell-schedule-kind-interval'><span>Interval (minutes)</span><input name='intervalMinutes' type='number' min='1' step='1' value='60' /></label>" +
    "<label class='cell-schedule-field cell-schedule-only cell-schedule-kind-cron'><span>Cron expression</span><input name='cron' type='text' placeholder='0 9 * * 1-5' /></label>" +
    "<label class='cell-schedule-field'><span>Label</span><input name='label' type='text' placeholder='Morning refresh' /></label>" +
    "<div class='cell-schedule-summary'></div>" +
    "<div class='cell-schedule-actions'><button type='button' class='secondary' data-action='clear'>Clear</button><button type='button' class='secondary' data-action='cancel'>Cancel</button><button type='button' data-action='save'>Save</button></div>" +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) hideScheduleDialog(app);
  });
  overlay.addEventListener('click', (event) => {
    const actionTarget =
      event.target && event.target.closest
        ? event.target.closest('[data-action]')
        : null;
    if (!actionTarget) return;
    const action = String(actionTarget.dataset.action || '');
    if (action === 'cancel') {
      hideScheduleDialog(app);
      return;
    }
    if (action === 'clear') {
      saveScheduleFromDialog(app, null);
      return;
    }
    if (action === 'save') {
      saveScheduleFromDialog(app, readScheduleDialog(app));
    }
  });
  overlay.addEventListener('input', () => syncScheduleDialogVisibility(app));
  app.scheduleDialog = overlay;
  return overlay;
}

function syncScheduleDialogVisibility(app) {
  const overlay = ensureScheduleDialog(app);
  const form = overlay.querySelector('.cell-schedule-modal');
  const kindInput = form.querySelector("[name='kind']");
  const kind = String(kindInput && kindInput.value ? kindInput.value : 'once');
  form
    .querySelectorAll('.cell-schedule-only')
    .forEach((node) => {
      node.style.display = node.classList.contains(`cell-schedule-kind-${kind}`)
        ? 'grid'
        : 'none';
    });
  const summary = form.querySelector('.cell-schedule-summary');
  if (summary) {
    const schedule = readScheduleDialog(app, true);
    summary.textContent = schedule ? describeCellSchedule(schedule) : '';
  }
}

function toDateTimeLocalValue(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function fillScheduleDialog(app, scheduleValue) {
  const overlay = ensureScheduleDialog(app);
  const form = overlay.querySelector('.cell-schedule-modal');
  const schedule = normalizeCellSchedule(scheduleValue) || {
    kind: 'once',
    time: '09:00',
    daysOfWeek: [1],
    dayOfMonth: 1,
    intervalMinutes: 60,
    cron: '',
    label: '',
  };
  form.querySelector("[name='kind']").value = schedule.kind || 'once';
  form.querySelector("[name='datetime']").value = toDateTimeLocalValue(
    schedule.datetime || '',
  );
  form.querySelector("[name='time']").value = schedule.time || '09:00';
  form.querySelector("[name='dayOfMonth']").value = String(
    schedule.dayOfMonth || 1,
  );
  form.querySelector("[name='intervalMinutes']").value = String(
    schedule.intervalMinutes || 60,
  );
  form.querySelector("[name='cron']").value = String(schedule.cron || '');
  form.querySelector("[name='label']").value = String(schedule.label || '');
  form.querySelectorAll("input[name='weekday']").forEach((checkbox) => {
    checkbox.checked =
      Array.isArray(schedule.daysOfWeek) &&
      schedule.daysOfWeek.indexOf(parseInt(checkbox.value, 10) || 0) !== -1;
  });
  syncScheduleDialogVisibility(app);
}

function readScheduleDialog(app, lenient) {
  const overlay = ensureScheduleDialog(app);
  const form = overlay.querySelector('.cell-schedule-modal');
  const kind = String(form.querySelector("[name='kind']").value || 'once');
  const base = {
    origin: 'manual',
    kind,
    label: String(form.querySelector("[name='label']").value || '').trim(),
  };
  if (kind === 'once') {
    const datetime = String(form.querySelector("[name='datetime']").value || '');
    if (!datetime && !lenient) return null;
    return { ...base, datetime };
  }
  if (kind === 'daily') {
    return {
      ...base,
      time: String(form.querySelector("[name='time']").value || '09:00'),
    };
  }
  if (kind === 'weekly') {
    return {
      ...base,
      time: String(form.querySelector("[name='time']").value || '09:00'),
      daysOfWeek: Array.prototype.slice
        .call(form.querySelectorAll("input[name='weekday']:checked"))
        .map((node) => parseInt(node.value, 10) || 0),
    };
  }
  if (kind === 'monthly') {
    return {
      ...base,
      time: String(form.querySelector("[name='time']").value || '09:00'),
      dayOfMonth: parseInt(
        form.querySelector("[name='dayOfMonth']").value,
        10,
      ),
    };
  }
  if (kind === 'interval') {
    return {
      ...base,
      intervalMinutes: parseInt(
        form.querySelector("[name='intervalMinutes']").value,
        10,
      ),
    };
  }
  if (kind === 'cron') {
    return {
      ...base,
      cron: String(form.querySelector("[name='cron']").value || '').trim(),
    };
  }
  return null;
}

function saveScheduleFromDialog(app, scheduleValue) {
  const target = app.scheduleDialogCellId;
  if (!target) {
    hideScheduleDialog(app);
    return;
  }
  app.captureHistorySnapshot(`schedule:${app.activeSheetId}:${target}`);
  app.setCellSchedule(target, scheduleValue);
  app.renderCurrentSheetFromStorage();
  hideScheduleDialog(app);
}

export function setupScheduleDialog(app) {
  ensureScheduleDialog(app);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideScheduleDialog(app);
  });
}

export function showScheduleDialogForCell(app, cellId) {
  const targetCellId = String(cellId || '').toUpperCase();
  if (!targetCellId) return;
  const overlay = ensureScheduleDialog(app);
  app.scheduleDialogCellId = targetCellId;
  fillScheduleDialog(app, app.storage.getCellSchedule(app.activeSheetId, targetCellId));
  overlay.style.display = 'flex';
}

export function showScheduleDialogForContextCell(app) {
  if (!app.contextMenuState || app.contextMenuState.type !== 'cell') return;
  const cellId = app.cellIdFrom(app.contextMenuState.col, app.contextMenuState.row);
  showScheduleDialogForCell(app, cellId);
}

export function hideScheduleDialog(app) {
  if (!app.scheduleDialog) return;
  app.scheduleDialog.style.display = 'none';
  app.scheduleDialogCellId = '';
}
