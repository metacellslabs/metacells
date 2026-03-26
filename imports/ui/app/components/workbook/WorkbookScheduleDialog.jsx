export function WorkbookScheduleDialog({ workbookUiState, appRef }) {
  const dialogUi =
    workbookUiState && workbookUiState.scheduleDialogUi
      ? workbookUiState.scheduleDialogUi
      : null;
  const isOpen = dialogUi ? dialogUi.open === true : false;
  const draft =
    dialogUi && dialogUi.draft && typeof dialogUi.draft === 'object'
      ? dialogUi.draft
      : {
          kind: 'once',
          datetime: '',
          time: '09:00',
          daysOfWeek: [1],
          dayOfMonth: '1',
          intervalMinutes: '60',
          cron: '',
          label: '',
        };
  const summary = dialogUi ? String(dialogUi.summary || '') : '';

  const updateDraft = (patch) => {
    const app = appRef && appRef.current ? appRef.current : null;
    if (!app || typeof app.updateScheduleDialogDraft !== 'function') return;
    app.updateScheduleDialogDraft(patch);
  };

  const handleClose = () => {
    const app = appRef && appRef.current ? appRef.current : null;
    if (!app || typeof app.hideScheduleDialog !== 'function') return;
    app.hideScheduleDialog();
  };

  const handleSave = () => {
    const app = appRef && appRef.current ? appRef.current : null;
    if (!app || typeof app.saveScheduleDialog !== 'function') return;
    app.saveScheduleDialog();
  };

  const handleClear = () => {
    const app = appRef && appRef.current ? appRef.current : null;
    if (!app || typeof app.clearScheduleDialog !== 'function') return;
    app.clearScheduleDialog();
  };

  const weekdays = [0, 1, 2, 3, 4, 5, 6];
  const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const selectedDays = Array.isArray(draft.daysOfWeek) ? draft.daysOfWeek : [1];
  const showKind = (kind) => String(draft.kind || 'once') === kind;

  return (
    <div
      className="cell-schedule-overlay"
      hidden={!isOpen}
      style={{ display: isOpen ? 'flex' : 'none' }}
      onClick={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div className="cell-schedule-modal" role="dialog" aria-modal="true" aria-labelledby="cell-schedule-title">
        <div className="cell-schedule-head">
          <h2 id="cell-schedule-title">Schedule Cell</h2>
          <button
            type="button"
            className="cell-schedule-close"
            onClick={handleClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="cell-schedule-body">
          <label className="cell-schedule-field">
            <span>Mode</span>
            <select
              value={String(draft.kind || 'once')}
              onChange={(event) => updateDraft({ kind: event.target.value })}
            >
              <option value="once">Once</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="interval">Every N minutes</option>
              <option value="cron">Cron</option>
            </select>
          </label>

          {showKind('once') ? (
            <label className="cell-schedule-field">
              <span>Date &amp; time</span>
              <input
                type="datetime-local"
                value={String(draft.datetime || '')}
                onChange={(event) => updateDraft({ datetime: event.target.value })}
              />
            </label>
          ) : null}

          {showKind('daily') || showKind('weekly') || showKind('monthly') ? (
            <label className="cell-schedule-field">
              <span>Time</span>
              <input
                type="time"
                value={String(draft.time || '09:00')}
                onChange={(event) => updateDraft({ time: event.target.value })}
              />
            </label>
          ) : null}

          {showKind('weekly') ? (
            <div className="cell-schedule-field">
              <span>Days of week</span>
              <div className="cell-schedule-weekdays">
                {weekdays.map((day) => {
                  const checked = selectedDays.includes(day);
                  return (
                    <label key={day} className="cell-schedule-weekday">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          const nextDays = event.target.checked
                            ? selectedDays.concat([day]).sort()
                            : selectedDays.filter((item) => item !== day);
                          updateDraft({ daysOfWeek: nextDays });
                        }}
                      />
                      <span>{weekdayLabels[day]}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          {showKind('monthly') ? (
            <label className="cell-schedule-field">
              <span>Day of month</span>
              <input
                type="number"
                min="1"
                max="31"
                value={String(draft.dayOfMonth || '1')}
                onChange={(event) => updateDraft({ dayOfMonth: event.target.value })}
              />
            </label>
          ) : null}

          {showKind('interval') ? (
            <label className="cell-schedule-field">
              <span>Interval minutes</span>
              <input
                type="number"
                min="1"
                value={String(draft.intervalMinutes || '60')}
                onChange={(event) =>
                  updateDraft({ intervalMinutes: event.target.value })
                }
              />
            </label>
          ) : null}

          {showKind('cron') ? (
            <label className="cell-schedule-field">
              <span>Cron</span>
              <input
                type="text"
                value={String(draft.cron || '')}
                onChange={(event) => updateDraft({ cron: event.target.value })}
                placeholder="0 9 * * 1-5"
              />
            </label>
          ) : null}

          <label className="cell-schedule-field">
            <span>Label</span>
            <input
              type="text"
              value={String(draft.label || '')}
              onChange={(event) => updateDraft({ label: event.target.value })}
              placeholder="Optional label"
            />
          </label>

          <div className="cell-schedule-summary">
            <span>Summary</span>
            <strong>{summary || 'No schedule yet'}</strong>
          </div>
        </div>
        <div className="cell-schedule-actions">
          <button type="button" onClick={handleClear}>
            Clear
          </button>
          <button type="button" onClick={handleClose}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
