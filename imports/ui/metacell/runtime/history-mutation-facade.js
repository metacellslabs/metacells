export function runWithHistorySnapshot(app, groupKey, fn) {
  if (!app || typeof fn !== 'function') return undefined;
  if (groupKey && typeof app.captureHistorySnapshot === 'function') {
    app.captureHistorySnapshot(groupKey);
  }
  return fn();
}
