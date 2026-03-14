function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTimeString(value, fallback = '09:00') {
  const raw = String(value || '').trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) return fallback;
  const hour = Math.max(0, Math.min(23, parseInt(match[1], 10) || 0));
  const minute = Math.max(0, Math.min(59, parseInt(match[2], 10) || 0));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function normalizeWeekdayList(days) {
  if (!Array.isArray(days)) return [];
  const seen = {};
  return days
    .map((value) => Math.max(0, Math.min(6, parseInt(value, 10) || 0)))
    .filter((value) => {
      const key = String(value);
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    })
    .sort((a, b) => a - b);
}

function parseDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeCronFieldToken(token, min, max) {
  const raw = String(token || '').trim();
  if (!raw || raw === '*') return { any: true };

  const values = {};
  const parts = raw.split(',');
  for (let i = 0; i < parts.length; i += 1) {
    const part = String(parts[i] || '').trim();
    if (!part) return null;

    let step = 1;
    let base = part;
    if (part.includes('/')) {
      const pair = part.split('/');
      if (pair.length !== 2) return null;
      base = String(pair[0] || '').trim();
      step = Math.max(1, parseInt(pair[1], 10) || 0);
      if (!step) return null;
    }

    if (base === '*') {
      for (let value = min; value <= max; value += step) {
        values[value] = true;
      }
      continue;
    }

    if (base.includes('-')) {
      const bounds = base.split('-');
      if (bounds.length !== 2) return null;
      const start = parseInt(bounds[0], 10);
      const end = parseInt(bounds[1], 10);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
        return null;
      for (let value = start; value <= end; value += step) {
        if (value >= min && value <= max) values[value] = true;
      }
      continue;
    }

    const numeric = parseInt(base, 10);
    if (!Number.isFinite(numeric)) return null;
    if (numeric < min || numeric > max) return null;
    values[numeric] = true;
  }

  const normalizedValues = Object.keys(values).map((value) => parseInt(value, 10));
  return normalizedValues.length ? { any: false, values: normalizedValues } : null;
}

function normalizeCronExpression(value) {
  const raw = String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!raw) return '';
  const parts = raw.split(' ');
  if (parts.length !== 5) return '';
  const fieldDefs = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 6],
  ];
  for (let i = 0; i < parts.length; i += 1) {
    if (!normalizeCronFieldToken(parts[i], fieldDefs[i][0], fieldDefs[i][1])) {
      return '';
    }
  }
  return raw;
}

export function normalizeCellSchedule(scheduleValue) {
  const value = isPlainObject(scheduleValue) ? scheduleValue : {};
  const kind = String(value.kind || '').trim().toLowerCase();
  const enabled = value.enabled !== false;
  const schedule = {
    enabled,
    origin:
      String(value.origin || '').trim().toLowerCase() === 'manual'
        ? 'manual'
        : 'detected',
    triggerSource:
      String(value.triggerSource || '').trim().toLowerCase() === 'value'
        ? 'value'
        : 'source',
    kind: '',
    label: String(value.label || '').trim(),
    timezone: String(value.timezone || '').trim(),
    datetime: '',
    time: '09:00',
    daysOfWeek: [],
    dayOfMonth: null,
    intervalMinutes: null,
    cron: '',
    sourcePreview: String(value.sourcePreview || '').trim(),
    sourceHash: String(value.sourceHash || '').trim(),
    updatedAt: String(value.updatedAt || '').trim(),
  };

  if (kind === 'once') {
    const dt = parseDateTime(value.datetime || value.at || value.dateTime);
    schedule.kind = 'once';
    schedule.datetime = dt ? dt.toISOString() : '';
    return schedule.datetime ? schedule : null;
  }

  if (kind === 'daily') {
    schedule.kind = 'daily';
    schedule.time = normalizeTimeString(value.time, '09:00');
    return schedule;
  }

  if (kind === 'weekly') {
    schedule.kind = 'weekly';
    schedule.time = normalizeTimeString(value.time, '09:00');
    schedule.daysOfWeek = normalizeWeekdayList(value.daysOfWeek);
    if (!schedule.daysOfWeek.length) schedule.daysOfWeek = [1];
    return schedule;
  }

  if (kind === 'monthly') {
    schedule.kind = 'monthly';
    schedule.time = normalizeTimeString(value.time, '09:00');
    schedule.dayOfMonth = Math.max(
      1,
      Math.min(31, parseInt(value.dayOfMonth, 10) || 1),
    );
    return schedule;
  }

  if (kind === 'interval') {
    schedule.kind = 'interval';
    schedule.intervalMinutes = Math.max(
      1,
      parseInt(value.intervalMinutes, 10) || 0,
    );
    return schedule.intervalMinutes ? schedule : null;
  }

  if (kind === 'cron') {
    schedule.kind = 'cron';
    schedule.cron = normalizeCronExpression(value.cron);
    return schedule.cron ? schedule : null;
  }

  return null;
}

export function hasEnabledCellSchedule(scheduleValue) {
  const schedule = normalizeCellSchedule(scheduleValue);
  return !!(schedule && schedule.enabled !== false);
}

function setDateTimeFromTime(baseDate, timeString) {
  const normalized = normalizeTimeString(timeString, '09:00');
  const parts = normalized.split(':');
  const next = new Date(baseDate.getTime());
  next.setHours(parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0, 0, 0);
  return next;
}

function cronFieldMatches(field, value) {
  if (!field) return false;
  if (field.any) return true;
  return Array.isArray(field.values) && field.values.indexOf(value) !== -1;
}

function cronMatches(fields, date) {
  return (
    cronFieldMatches(fields[0], date.getMinutes()) &&
    cronFieldMatches(fields[1], date.getHours()) &&
    cronFieldMatches(fields[2], date.getDate()) &&
    cronFieldMatches(fields[3], date.getMonth() + 1) &&
    cronFieldMatches(fields[4], date.getDay())
  );
}

function computeCronNextRun(schedule, afterDate) {
  const expression = normalizeCronExpression(schedule && schedule.cron);
  if (!expression) return null;
  const parts = expression.split(' ');
  const fields = [
    normalizeCronFieldToken(parts[0], 0, 59),
    normalizeCronFieldToken(parts[1], 0, 23),
    normalizeCronFieldToken(parts[2], 1, 31),
    normalizeCronFieldToken(parts[3], 1, 12),
    normalizeCronFieldToken(parts[4], 0, 6),
  ];
  let cursor = new Date(afterDate.getTime());
  cursor.setSeconds(0, 0);
  cursor = new Date(cursor.getTime() + 60 * 1000);
  const maxIterations = 60 * 24 * 366 * 2;
  for (let i = 0; i < maxIterations; i += 1) {
    if (cronMatches(fields, cursor)) return cursor;
    cursor = new Date(cursor.getTime() + 60 * 1000);
  }
  return null;
}

export function computeCellScheduleNextRun(scheduleValue, afterDateValue = new Date()) {
  const schedule = normalizeCellSchedule(scheduleValue);
  if (!schedule || schedule.enabled === false) return null;
  const afterDate =
    afterDateValue instanceof Date ? afterDateValue : new Date(afterDateValue);
  if (Number.isNaN(afterDate.getTime())) return null;

  if (schedule.kind === 'once') {
    const target = parseDateTime(schedule.datetime);
    if (!target) return null;
    return target.getTime() > afterDate.getTime() ? target : null;
  }

  if (schedule.kind === 'interval') {
    return new Date(
      afterDate.getTime() + Math.max(1, Number(schedule.intervalMinutes) || 1) * 60 * 1000,
    );
  }

  if (schedule.kind === 'daily') {
    let candidate = setDateTimeFromTime(afterDate, schedule.time);
    if (candidate.getTime() <= afterDate.getTime()) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate;
  }

  if (schedule.kind === 'weekly') {
    const days = schedule.daysOfWeek && schedule.daysOfWeek.length
      ? schedule.daysOfWeek
      : [1];
    for (let offset = 0; offset < 14; offset += 1) {
      const candidate = setDateTimeFromTime(afterDate, schedule.time);
      candidate.setDate(candidate.getDate() + offset);
      if (days.indexOf(candidate.getDay()) === -1) continue;
      if (candidate.getTime() <= afterDate.getTime()) continue;
      return candidate;
    }
    return null;
  }

  if (schedule.kind === 'monthly') {
    const dayOfMonth = Math.max(1, Math.min(31, Number(schedule.dayOfMonth) || 1));
    for (let offset = 0; offset < 24; offset += 1) {
      const candidate = setDateTimeFromTime(afterDate, schedule.time);
      candidate.setMonth(candidate.getMonth() + offset, 1);
      const daysInMonth = new Date(
        candidate.getFullYear(),
        candidate.getMonth() + 1,
        0,
      ).getDate();
      candidate.setDate(Math.min(dayOfMonth, daysInMonth));
      if (candidate.getTime() <= afterDate.getTime()) continue;
      return candidate;
    }
    return null;
  }

  if (schedule.kind === 'cron') {
    return computeCronNextRun(schedule, afterDate);
  }

  return null;
}

export function describeCellSchedule(scheduleValue) {
  const schedule = normalizeCellSchedule(scheduleValue);
  if (!schedule || schedule.enabled === false) return '';
  if (schedule.kind === 'once') {
    return schedule.datetime
      ? `Once at ${new Date(schedule.datetime).toLocaleString()}`
      : 'One-time run';
  }
  if (schedule.kind === 'daily') {
    return `Daily at ${schedule.time}`;
  }
  if (schedule.kind === 'weekly') {
    return `Weekly at ${schedule.time}`;
  }
  if (schedule.kind === 'monthly') {
    return `Monthly on day ${schedule.dayOfMonth} at ${schedule.time}`;
  }
  if (schedule.kind === 'interval') {
    return `Every ${schedule.intervalMinutes} minute${schedule.intervalMinutes === 1 ? '' : 's'}`;
  }
  if (schedule.kind === 'cron') {
    return `Cron: ${schedule.cron}`;
  }
  return '';
}
