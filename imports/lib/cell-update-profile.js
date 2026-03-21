function nowMs() {
  if (
    typeof performance !== 'undefined' &&
    typeof performance.now === 'function'
  ) {
    return performance.now();
  }
  return Date.now();
}

export function shouldProfileCellUpdatesClient() {
  try {
    return (
      typeof window !== 'undefined' &&
      window.localStorage &&
      window.localStorage.getItem('PROFILE_CELL_UPDATES') === '1'
    );
  } catch (error) {
    return false;
  }
}

export function createCellUpdateTrace(meta) {
  const base = meta && typeof meta === 'object' ? meta : {};
  return {
    id: `cell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    startedAtMs: nowMs(),
    meta: {
      ...base,
    },
  };
}

export function traceCellUpdateClient(trace, step, extra) {
  if (!trace || !trace.id || !shouldProfileCellUpdatesClient()) return;
  const payload = extra && typeof extra === 'object' ? extra : {};
  const elapsedMs =
    Math.round((nowMs() - Number(trace.startedAtMs || nowMs())) * 1000) / 1000;
  console.log('[cell-profile][client]', {
    traceId: trace.id,
    step: String(step || ''),
    elapsedMs,
    ...trace.meta,
    ...payload,
  });
}

export function createServerCellUpdateProfiler(traceId, meta) {
  if (!traceId) return null;
  const startedAt = Date.now();
  const baseMeta = meta && typeof meta === 'object' ? meta : {};
  return {
    traceId: String(traceId),
    step(stepName, extra) {
      const payload = extra && typeof extra === 'object' ? extra : {};
      console.log('[cell-profile][server]', {
        traceId: String(traceId),
        step: String(stepName || ''),
        elapsedMs: Date.now() - startedAt,
        ...baseMeta,
        ...payload,
      });
    },
  };
}
