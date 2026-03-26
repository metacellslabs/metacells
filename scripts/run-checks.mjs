#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const checks = [
  ['node', ['scripts/check-no-direct-cell-mutations.mjs']],
  ['node', ['scripts/check-no-direct-sheet-updates.mjs']],
  ['node', ['scripts/check-no-direct-selection-state.mjs']],
  ['node', ['scripts/check-no-direct-cell-record-access.mjs']],
  ['node', ['scripts/check-no-unsafe-selection-mutations.mjs']],
  ['node', ['scripts/check-no-runtime-db-fallbacks.mjs']],
  ['node', ['scripts/check-formula-source-normalizers.mjs']],
  ['node', ['scripts/check-ai-queue-entrypoints.mjs']],
  ['node', ['scripts/check-dependency-version-entrypoints.mjs']],
  ['node', ['scripts/check-display-sync-runtime-patches.mjs']],
  ['node', ['scripts/check-compute-reload-entrypoints.mjs']],
  ['node', ['scripts/check-history-covered-raw-mutations.mjs']],
  ['node', ['scripts/check-no-transient-attachment-drop.mjs']],
  ['node', ['scripts/check-no-attachment-source-entrypoints.mjs']],
  [
    'node',
    ['scripts/check-no-attachment-formula-handling-outside-approved-files.mjs'],
  ],
  [
    'node',
    ['scripts/check-no-attachment-mention-resolution-outside-mention-engine.mjs'],
  ],
  [
    'node',
    ['scripts/check-no-attachment-runtime-patch-without-display-sync.mjs'],
  ],
  ['node', ['scripts/check-no-sensitive-data-in-git.mjs']],
];

for (const [command, args] of checks) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
