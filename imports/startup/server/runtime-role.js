function normalizeRole(value) {
  const role = String(value || '')
    .trim()
    .toLowerCase();
  if (role === 'worker') return 'worker';
  return 'web';
}

export function getRuntimeRole() {
  return normalizeRole(process.env.METACELLS_ROLE);
}

export function isWorkerRuntime() {
  return getRuntimeRole() === 'worker';
}

export function isWebRuntime() {
  return getRuntimeRole() !== 'worker';
}
