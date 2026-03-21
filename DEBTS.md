# Technical Debts

## 1. Spreadsheet Runtime Is A Large Imperative Controller

Severity:

- High

Problem:

- The main runtime controller is smaller than before, but it still coordinates too many DOM-heavy behaviors and still contains several high-churn interaction flows.

Impact:

- High regression risk
- Harder onboarding and debugging
- Difficult targeted testing
- Harder performance tuning

Main areas:

- [imports/ui/metacell/runtime/index.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/index.js)
- [imports/ui/metacell/runtime/report-runtime.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/report-runtime.js)
- [imports/ui/metacell/runtime/history-runtime.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/history-runtime.js)
- [imports/ui/metacell/runtime/selection-runtime.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/selection-runtime.js)
- [imports/ui/metacell/runtime/attachment-runtime.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/attachment-runtime.js)
- [imports/ui/metacell/runtime/compute-runtime.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/compute-runtime.js)
- [imports/ui/metacell/runtime/keyboard-runtime.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/keyboard-runtime.js)
- [imports/ui/metacell/runtime/drag-clipboard-runtime.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/drag-clipboard-runtime.js)
- [imports/ui/metacell/runtime/tab-mention-runtime.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/tab-mention-runtime.js)
- [imports/ui/metacell/runtime/fullscreen-runtime.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/fullscreen-runtime.js)
- [imports/ui/metacell/runtime/grid-dom-runtime.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/grid-dom-runtime.js)
- [imports/ui/metacell/runtime/mention-runtime.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/mention-runtime.js)
- [imports/ui/metacell/runtime/browser-runtime.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/browser-runtime.js)
- [imports/ui/metacell/runtime/structure-runtime.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/structure-runtime.js)
- [imports/ui/metacell/runtime/editor-controls-runtime.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/editor-controls-runtime.js)
- [imports/ui/metacell/runtime/sheet-shell-runtime.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/sheet-shell-runtime.js)

What has already been fixed:

- The runtime has already been split into focused modules for:
  - report-mode orchestration
  - history orchestration
  - selection/navigation
  - attachment UI
  - compute/render orchestration
  - keyboard/context orchestration
  - fill-drag and clipboard flows
  - tab management and mention-navigation flows
  - fullscreen/report publishing helpers
  - lower-level grid/runtime DOM coordination
  - mention autocomplete/editor-proxy handling
  - browser-global fullscreen/report helpers
  - sort orchestration and row/column structure mutations
  - formula-bar, AI-mode, display-mode, named-cell, and report-shell control setup
  - tab-shell rendering, sheet switching, and tab drag/reorder coordination
  - report mention replacement, report tab/preamble decoration, and linked report controls
  - leftover compute monitor and width-measurement helpers

Remaining fix:

- Continue narrowing the controller boundary around:
  - drag/clipboard flows that still mutate DOM state directly
  - a narrower controller-to-view state boundary for selection and active cell state

Progress:

- Report-mode orchestration and history orchestration have been extracted into dedicated runtime modules.
- Selection/navigation, attachment UI, compute/render orchestration, and keyboard/context orchestration have also been extracted into dedicated runtime modules.
- Fill-drag and clipboard flows, tab management and mention-navigation flows, fullscreen/report publishing helpers, and lower-level grid/runtime DOM coordination have also been extracted into dedicated runtime modules.
- Mention autocomplete/editor-proxy handling and browser-global fullscreen/report publish helpers have also been extracted into dedicated runtime modules.
- Sort orchestration, row/column insertion-deletion flows, and formula-bar / named-cell / report-shell control setup have also been extracted into dedicated runtime modules.
- Tab-shell rendering, sheet switching, and tab drag/reorder orchestration have also been extracted into a dedicated runtime module.
- Report mention replacement, report tab/preamble decoration, linked report controls, and leftover compute monitor helpers have also been extracted into dedicated runtime modules.
- Remaining largest concerns are still:
  - drag/clipboard modules still operate through direct DOM state instead of a narrower view model
  - active-cell, selection, and formula-bar state are still coordinated through shared mutable controller fields

## 2. Engine/Runtime Duplication Still Exists Around Execution Modules

Severity:

- Medium

Problem:

- A canonical pure execution layer now exists under `imports/engine`, and runtime-side formula and formula-engine trees now re-export it, but the repo still carries a compatibility layer instead of a fully engine-only package boundary.

Impact:

- Some maintenance overhead remains around compatibility shims
- Engine packaging is still app-local instead of a cleaner standalone boundary
- Long-term extraction into a reusable worker/package is still harder than it should be

Main areas:

- [imports/engine/formula-engine.js](/Users/zentelechia/playground/thinker/imports/engine/formula-engine.js)
- [imports/engine/storage-service.js](/Users/zentelechia/playground/thinker/imports/engine/storage-service.js)
- [imports/engine/workbook-storage-adapter.js](/Users/zentelechia/playground/thinker/imports/engine/workbook-storage-adapter.js)
- [imports/engine/formula-engine](/Users/zentelechia/playground/thinker/imports/engine/formula-engine)
- [imports/engine/formulas](/Users/zentelechia/playground/thinker/imports/engine/formulas)
- [imports/api/sheets/server/compute.js](/Users/zentelechia/playground/thinker/imports/api/sheets/server/compute.js)

Suggested fix:

- Keep `imports/engine` as the single source of truth and continue shrinking the runtime compatibility layer until execution code is fully engine-owned with a cleaner package boundary.

## 3. AI Execution State Is Still Fragile

Severity:

- High

Problem:

- AI execution depends on the interaction between:
  - workbook state
  - dependency invalidation
  - cache state
  - job state
  - async recompute callbacks

Impact:

- Race-condition style bugs
- Cells not rerunning when dependencies change
- Duplicate calls
- Pending cells getting stuck

Main areas:

- [imports/api/ai/index.js](/Users/zentelechia/playground/thinker/imports/api/ai/index.js)
- [imports/api/sheets/server/compute.js](/Users/zentelechia/playground/thinker/imports/api/sheets/server/compute.js)
- [imports/ui/metacell/runtime/ai-service.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/ai-service.js)

Suggested fix:

- Introduce stronger async version checks, clearer source/dependent invalidation rules, and explicit execution state transitions for AI cells.

## 4. Channel Fanout Still Relies On Workbook-Level Discovery

Severity:

- Medium

Problem:

- Channel-triggered recompute still depends partly on workbook-level scans and broad matching logic.

Impact:

- Expensive for larger workbook counts
- Harder to reason about trigger coverage
- More work than necessary when a single channel event arrives

Main areas:

- [imports/api/sheets/index.js](/Users/zentelechia/playground/thinker/imports/api/sheets/index.js)
- [imports/api/channels/server/index.js](/Users/zentelechia/playground/thinker/imports/api/channels/server/index.js)

Suggested fix:

- Persist direct channel label -> formula cell indexes and use them for fanout.

## 5. Settings Mix Durable Config With Runtime State

Severity:

- Medium

Problem:

- `app_settings` currently stores both real configuration and runtime channel tracking state.

Impact:

- Harder cleanup
- Larger settings documents
- Mixed lifecycle responsibilities

Main areas:

- [imports/api/settings/index.js](/Users/zentelechia/playground/thinker/imports/api/settings/index.js)

Suggested fix:

- Keep durable configuration in settings, and move active runtime/channel polling state into dedicated runtime collections.

## 6. Attachment Delivery Is Still App-Server Bound

Severity:

- Medium

Problem:

- Internal attachment preview/download flows still depend on application routes serving artifact and event attachment content.

Impact:

- More app-server bandwidth pressure
- Worse scalability for bigger files and more previews
- More memory pressure if usage grows

Main areas:

- [imports/api/artifacts/server.js](/Users/zentelechia/playground/thinker/imports/api/artifacts/server.js)
- [imports/api/channels/events-server.js](/Users/zentelechia/playground/thinker/imports/api/channels/events-server.js)
- [imports/ui/metacell/runtime/grid-manager.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/grid-manager.js)

Suggested fix:

- Move attachment serving to artifact storage or signed URLs backed by dedicated storage.

## 7. Artifact Hydration Still Adds Hot-Path Read Amplification

Severity:

- Medium

Problem:

- Blob payloads are no longer embedded in workbook and channel-event documents, but compute/runtime still has to hydrate artifact content from the artifact store on demand.

Impact:

- Extra Mongo reads during compute
- More moving parts during channel-event fanout
- Attachment-heavy workbooks can still create server-side read amplification

Main areas:

- [imports/api/artifacts/index.js](/Users/zentelechia/playground/thinker/imports/api/artifacts/index.js)
- [imports/api/sheets/index.js](/Users/zentelechia/playground/thinker/imports/api/sheets/index.js)
- [imports/api/channels/runtime-state.js](/Users/zentelechia/playground/thinker/imports/api/channels/runtime-state.js)

Suggested fix:

- Add artifact caching, batched hydration, or materialized compact previews so compute does not repeatedly fetch the same artifact payloads.

## 8. Observability Is Too Thin

Severity:

- Medium

Problem:

- There are logs, but not enough structured metrics or dashboards for the engine.

Impact:

- Hard to measure:
  - queue depth
  - recompute fanout
  - stale-result drops
  - dependency-graph repair frequency
  - channel poll latency
  - publication/document size

Main areas:

- [imports/api/jobs/index.js](/Users/zentelechia/playground/thinker/imports/api/jobs/index.js)
- [imports/api/sheets/server/compute.js](/Users/zentelechia/playground/thinker/imports/api/sheets/server/compute.js)
- [imports/api/channels/server/index.js](/Users/zentelechia/playground/thinker/imports/api/channels/server/index.js)

Suggested fix:

- Add structured metrics, counters, timings, and an internal admin/debug screen.

## 9. Tooling Stability In Dev Is Weak

Severity:

- Medium

Problem:

- Meteor/Rspack local dev startup has shown repeated cache corruption and panic issues.

Impact:

- Slower iteration
- Lower confidence in test/build results
- More manual cleanup cycles

Main areas:

- [package.json](/Users/zentelechia/playground/thinker/package.json)
- [rspack.config.js](/Users/zentelechia/playground/thinker/rspack.config.js)

Suggested fix:

- Keep dev build settings conservative, reduce client build requirements for worker mode, and document cache recovery steps clearly.

## 10. Test Coverage Is Behind Engine Complexity

Severity:

- Medium

Problem:

- Core logic has grown significantly faster than robust automated coverage.

Impact:

- Regressions are easy to introduce
- Fixes often require iterative production-like debugging

Main areas:

- [tests/main.js](/Users/zentelechia/playground/thinker/tests/main.js)
- [imports/ui/metacell/runtime/index.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/index.js)

Suggested fix:

- Expand coverage for:
  - dependency invalidation chains
  - async AI recompute fanout
  - channel-triggered batched AI
  - artifact-backed attachment hydration
  - report tab segmentation and published-report rendering

## 12. Recently Resolved

Resolved on 2026-03-10:

- Durable job architecture now includes leases, heartbeats, job logs, and dead-letter storage.
- Large workbook and channel-event blobs have been moved into the dedicated `artifacts` collection, with artifact ids and internal routes replacing inline payloads.
- Persisted workbook dependency graphs are now authoritative after explicit repair/rebuild, and server compute no longer relies on live fallback scans of workbook formulas during the hot path.
- A canonical pure execution engine layer now exists under `imports/engine`, and server compute no longer imports its core formula/storage/workbook primitives from `imports/ui/metacell/runtime`.
- Runtime-side formula and formula-engine module trees now re-export the engine layer instead of carrying their own duplicate execution implementations.
  - channel-triggered updates
  - report tab parsing/rendering
  - attachment rendering and mention behavior

## Highest-Value Next Fixes

1. Split the monolithic spreadsheet runtime controller into smaller modules.
2. Keep shrinking engine/runtime duplication so `imports/engine` becomes the only source of truth for execution logic.
3. Persist direct channel label to formula indexes for faster event fanout.
4. Reduce artifact hydration read amplification with caching or batched loading.
5. Add stronger metrics and debug views around compute, AI, and channel fanout.
