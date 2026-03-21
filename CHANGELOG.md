# Changelog

## 2026-03-20

### Added

- First-run AI provider onboarding when no default provider is configured.
- Fullscreen cell view now supports preview-first mode, formula/value editing, and basic Markdown controls.
- Bare `/channel` formulas such as `/tg` and `/sf` now act as append-only inbox logs that add one row per incoming event with normalized `date`, `from`, `text`, and `file` columns.
- Telegram channels now support inbound receive from the configured `chatId`, including live subscription via Telegraf and materialized inbound file attachments with extracted text artifacts.
- Attachment cards for uploaded files and generated `=PDF(...)` / `=FILE(...)` cells now support hover-only download controls and fullscreen viewing of extracted text content.
- Channel binding controls in the toolbar now let users choose a canonical receive shape (`# Table`, `> List`, `' Note`, or `Log`) before inserting the channel formula.

### Changed

- Shell channel commands such as `/sh pwd` and `/sh:send:{"command":"pwd"}` now preserve the command payload, render runtime status/output in the source cell, and return stderr/stdout without throwing on non-zero exit.
- Report controls now keep `Input:@cell` linked to the target cell value and support sheet-qualified `Input:` / `File:` references, including generated file cells from `=pdf(...)` and `=file(...)`.
- Generated file cells now render as full-cell attachments aligned with uploaded-file typography and controls, including consistent icon backgrounds and hover behavior.
- Bare `/channel` inbox logs now respill newest messages first and write real attachment payloads into the `file` column instead of only filenames.
- Channel send command cells now keep a timestamped send-result log in their computed value, which is visible in fullscreen `Value` mode.
- Local `start:worker` now attaches to the existing Meteor dev bundle instead of starting a second `meteor run`, avoiding `.meteor/local` IPC conflicts with the main app.
- In-app help and README examples now document bare channel logs, bidirectional Telegram behavior, Telegram inbound files, worker startup order, sheet-linked report controls, and generated file cells.
- Channel connector examples now prefer explicit `/label:send:...` syntax for outbound actions instead of mixed shorthand examples.

## 2026-03-14

### Added

- Electron desktop packaging flow with local desktop preparation, packing, and per-OS distribution scripts.
- Self-contained desktop runtime support for bundling the Meteor backend and local services into the packaged Electron app.
- Cell scheduling system:
  - backend schedule persistence and execution
  - schedule detection jobs
  - schedule dialog in the cell context menu
  - schedule indicators in the grid
- Workbook-aware AI assistant:
  - topbar entry point
  - floating chat panel
  - provider selection
  - persisted conversation history in Mongo
  - workbook/tool-aware server orchestration
- Assistant file uploads with extracted-content context and tools to place uploaded files into workbook cells.
- Assistant mutation tools for:
  - cell content
  - formatting and presentation
  - schedules
  - reports
  - tabs
  - batch workbook patching
- Automatic assistant tool exposure for configured channel send/search capabilities.
- AI fallback path for unsupported formulas that now evaluates unknown function-style formulas using workbook context instead of failing immediately.
- Dedicated automation/tracker toolbar panel for navigating to cells that use schedules or channel-linked formulas/commands.
- New channel connectors:
  - Gmail
  - LinkedIn
  - Reddit
  - WhatsApp Web (Baileys)
  - GitHub
  - Facebook
  - Instagram
  - Hacker News
  - Shell
  - Google Drive
- Gmail OAuth credential support.
- Unified channel handler abstraction and registry under:
  - `imports/api/channels/server/handler-definition.js`
  - `imports/api/channels/server/handlers/index.js`
- Unified channel event/message model with normalized attachments and native/view links.
- Standardized channel search contract and assistant search tools.
- Channel/event standard documentation:
  - `docs/channel-handler-standard.md`
  - `docs/channel-event-standard.md`

### Changed

- Desktop packaging and runtime startup flow now supports real backend embedding instead of Electron-only shell packaging.
- Schedule execution now runs safely in the main server path, with stronger dedupe, stale-job guards, queued-job cleanup, and schedule/workbook lifecycle cleanup.
- Editing, deleting, sorting, and row/column structure mutations now preserve or clear schedule metadata correctly.
- Channel feed formulas can now use AI-based per-event filtering/classification and persist decision metadata and extracted attributes.
- Channel feed prompts now describe expected returned fields/columns based on the inferred filter intent.
- Assistant system instructions were expanded to cover:
  - shortcut AI syntax (`'`, `>`, `#`)
  - mentions and examples
  - channels and receive/send behavior
  - file-cell context
  - workbook capabilities and tool usage
- Assistant UI/UX was refined across:
  - header layout
  - compact provider dropdown
  - attachment chips
  - message bubbles
  - inline composer hints
  - thinking indicator
  - auto-scroll
  - draft preservation between reloads
- Assistant now injects hydrated file-cell context and stronger channel context into chat turns.
- Channel connectors now publish standardized capability metadata in their descriptions and assistant manifest output.
- Receive-capable channels can use live subscription-style event handling where available, with polling preserved as fallback.
- `/sh ...` now writes command output back into the source cell, and `>/sh ...` spills line output into generated cells below.
- Global `Delete` / `Backspace` handling was hardened so selected cells clear reliably even when focus is not inside the active cell input.
- Rspack configuration now aliases `simple-yenc` to its ESM entry to avoid the server build failure caused by `@wasm-audio-decoders/common`.

### Verification

- `node --check imports/engine/formula-engine/fallback-methods.js`
- `node --check imports/engine/formula-engine.js`
- `node --check imports/api/ai/index.js`
- `node --check imports/ui/metacell/runtime/assistant-runtime.js`
- `node --check imports/ui/metacell/runtime/formula-tracker-runtime.js`
- `node --check imports/ui/metacell/runtime/index.js`
- `node --check imports/ui/metacell/runtime/keyboard-runtime.js`
- `node --check rspack.config.js`

## 2026-03-10

### Added

- Canonical pure execution engine layer under:
  - `imports/engine/constants.js`
  - `imports/engine/storage-service.js`
  - `imports/engine/workbook-storage-adapter.js`
  - `imports/engine/formula-engine.js`
  - `imports/engine/formula-engine/*`
  - `imports/engine/formulas/*`
- Separate durable job collections:
  - `jobs`
  - `job_logs`
  - `dead_letter_jobs`
- Dedicated `artifacts` collection for binary and text payloads.
- Artifact serving route:
  - `/artifacts/:artifactId`
- Persisted workbook dependency graph storage under `workbook.dependencyGraph.byCell`.
- Dependency edges for:
  - referenced cells
  - named refs
  - channel labels
  - attachment-backed cells
- Reverse-graph based targeted recompute for changed cells and downstream dependents.
- Regression tests for dependency graph persistence and affected-cell traversal.
- Incremental invalidation that marks downstream formulas stale on dependency changes.
- Regression test for downstream stale-state propagation.
- Explicit server runtime roles:
  - `web`
  - `worker`
- Dedicated startup scripts for web and worker processes.
- Persisted per-cell version metadata:
  - `sourceVersion`
  - `computedVersion`
  - `dependencyVersion`
  - `dependencySignature`
- Persisted reverse dependency indexes:
  - `dependentsByCell`
  - `dependentsByNamedRef`
  - `dependentsByChannel`
  - `dependentsByAttachment`
- Explicit dependency graph repair methods:
  - `sheets.rebuildDependencyGraph`
  - `sheets.rebuildAllDependencyGraphs`
- Dedicated runtime modules:
  - `history-runtime.js`
  - `report-runtime.js`
  - `selection-runtime.js`
  - `attachment-runtime.js`
  - `compute-runtime.js`
  - `keyboard-runtime.js`
  - `drag-clipboard-runtime.js`
  - `tab-mention-runtime.js`
  - `fullscreen-runtime.js`
  - `grid-dom-runtime.js`
  - `mention-runtime.js`
  - `browser-runtime.js`
  - `structure-runtime.js`
  - `editor-controls-runtime.js`
  - `sheet-shell-runtime.js`
- Durable job worker states:
  - `queued`
  - `leased`
  - `running`
  - `retrying`
  - `completed`
  - `failed`
  - `cancelled`
- Job lease and heartbeat fields:
  - `leasedAt`
  - `heartbeatAt`
  - `lockToken`
  - `lockUntil`
- Dead-letter snapshots for permanently failed jobs.
- Job-log history entries for queue, claim, running, heartbeat, retry, completion, and failure transitions.
- End-to-end cell update profiling with a shared `traceId` across client commit, client compute RPC, server compute stages, and client render.

### Changed

- Server compute, server AI orchestration, workbook migration helpers, and tests now import shared execution primitives from `imports/engine` instead of `imports/ui/metacell/runtime`.
- Runtime-side execution entry files now act as compatibility re-exports for the canonical engine layer where needed.
- Runtime-side formula registry, formula modules, and formula-engine method modules now re-export `imports/engine` instead of carrying duplicate execution implementations.
- Workbook file attachments now persist artifact references instead of inline blob/text payloads.
- Channel-event attachments now persist binary/content artifact ids instead of embedded `data:` URLs and extracted text.
- Server compute now hydrates attachment text from artifact refs only during evaluation and strips inline attachment content before workbook persistence and compute responses.
- Channel-event attachment delivery now serves binary artifact content via attachment routes, with legacy embedded-URL fallback for older events.
- Durable jobs now use lease ownership and periodic heartbeats instead of a bare running flag.
- Worker startup now recovers interrupted leased/running jobs and periodically requeues expired leases.
- AI and file extraction handlers now declare payload schema, idempotency strategy, timeout, lease timeout, and heartbeat policy.
- Job settings now persist timeout, lease timeout, and heartbeat interval per job type.
- Server compute now collects dependencies during actual formula evaluation instead of relying only on runtime-derived scans.
- Channel-triggered recompute now passes explicit channel dependency signals into server compute.
- Named-cell mapping changes now emit per-name dependency signals instead of only broad invalidation.
- Workbook saves now clear outdated per-cell dependency edges when a source changes.
- Server compute now invalidates only the affected dependency subgraph before recompute.
- Async AI completion invalidation now uses source-cell dependency signals to avoid broad recompute.
- Durable jobs now start only in the worker runtime.
- Channel polling now starts only in the worker runtime.
- The default app startup now runs in `web` mode.
- Local `start:worker` now attaches to the web dev Mongo instead of trying to start a second local Mongo from the same checkout.
- Server compute can now reuse already-resolved cells when the stored dependency signature still matches current upstream state.
- Workbook dependency graph updates now rebuild and persist reverse dependent indexes when cell dependencies change.
- Server compute now reads persisted reverse dependent indexes directly and only rebuilds them for older workbook documents.
- Workbook dependency graphs now carry authority metadata in `dependencyGraph.meta`.
- Source changes now mark the graph non-authoritative until it is explicitly rebuilt.
- Server compute now relies on persisted dependency indexes and explicit graph repair instead of live fallback scans of workbook formulas during evaluation.
- Spreadsheet runtime history orchestration and report-mode orchestration have been extracted out of the monolithic controller into focused runtime modules.
- Spreadsheet runtime selection/navigation, attachment UI, compute/render orchestration, and keyboard/context orchestration have been extracted behind dedicated runtime modules, leaving `index.js` as the coordinator.
- Spreadsheet runtime fill/clipboard flows, tab-and-mention navigation, fullscreen/report publishing helpers, and grid DOM coordination have also been extracted behind dedicated runtime modules, further shrinking the controller surface in `index.js`.
- Spreadsheet runtime mention autocomplete/editor-proxy handling and browser-global report/fullscreen helpers have also been extracted behind dedicated runtime modules.
- Spreadsheet runtime sort orchestration, row/column structure mutations, formula-bar controls, named-cell controls, AI/display mode controls, and report-shell setup have also been extracted behind dedicated runtime modules.
- Spreadsheet runtime tab-shell rendering, tab drag/reorder handling, and sheet switching have also been extracted behind a dedicated runtime module.
- Spreadsheet runtime report mention replacement, report tab/preamble decoration, linked report controls, and leftover uncomputed-monitor helpers have also been extracted behind dedicated runtime modules.
- Plain value edits now use a split recompute path:
  - pure sync downstream formulas are recomputed locally and rendered immediately
  - async or non-local-safe descendants still continue through server compute in the background
- Local dependent discovery for the sync fast path now falls back to live formula scans when client-side dependency graph indexes are stale or incomplete.

### Verification

- `node --check` passed for:
  - [imports/engine/formula-engine.js](/Users/zentelechia/playground/thinker/imports/engine/formula-engine.js)
  - [imports/engine/storage-service.js](/Users/zentelechia/playground/thinker/imports/engine/storage-service.js)
  - [imports/engine/workbook-storage-adapter.js](/Users/zentelechia/playground/thinker/imports/engine/workbook-storage-adapter.js)
  - [imports/engine/formula-engine/ai-methods.js](/Users/zentelechia/playground/thinker/imports/engine/formula-engine/ai-methods.js)
  - [imports/api/sheets/server/compute.js](/Users/zentelechia/playground/thinker/imports/api/sheets/server/compute.js)
  - [imports/api/sheets/index.js](/Users/zentelechia/playground/thinker/imports/api/sheets/index.js)
  - [imports/api/jobs/index.js](/Users/zentelechia/playground/thinker/imports/api/jobs/index.js)
  - [imports/api/settings/index.js](/Users/zentelechia/playground/thinker/imports/api/settings/index.js)
  - [imports/api/ai/index.js](/Users/zentelechia/playground/thinker/imports/api/ai/index.js)
  - [imports/api/files/index.js](/Users/zentelechia/playground/thinker/imports/api/files/index.js)
  - [imports/api/sheets/workbook-codec.js](/Users/zentelechia/playground/thinker/imports/api/sheets/workbook-codec.js)
  - [imports/ui/metacell/runtime/formula-engine.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/formula-engine.js)
  - [imports/ui/metacell/runtime/formula-engine/ai-methods.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/formula-engine/ai-methods.js)
  - [imports/ui/metacell/runtime/formula-engine/mention-methods.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/formula-engine/mention-methods.js)
  - [imports/ui/metacell/runtime/workbook-storage-adapter.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/workbook-storage-adapter.js)
  - [imports/ui/metacell/runtime/index.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/index.js)
  - [imports/ui/metacell/runtime/drag-clipboard-runtime.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/drag-clipboard-runtime.js)
  - [imports/ui/metacell/runtime/tab-mention-runtime.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/tab-mention-runtime.js)
  - [imports/ui/metacell/runtime/fullscreen-runtime.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/fullscreen-runtime.js)
  - [imports/ui/metacell/runtime/grid-dom-runtime.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/grid-dom-runtime.js)
  - [imports/ui/metacell/runtime/mention-runtime.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/mention-runtime.js)
  - [imports/ui/metacell/runtime/browser-runtime.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/browser-runtime.js)
  - [imports/ui/metacell/runtime/structure-runtime.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/structure-runtime.js)
  - [imports/ui/metacell/runtime/editor-controls-runtime.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/editor-controls-runtime.js)
  - [imports/ui/metacell/runtime/sheet-shell-runtime.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/sheet-shell-runtime.js)
- `meteor test --once --port 3188 --driver-package meteortesting:mocha`
  - passed: `24 passing`
- `meteor test --once --port 3189 --driver-package meteortesting:mocha`
  - passed: `24 passing`
- `meteor test --once --port 3191 --driver-package meteortesting:mocha`
  - passed: `24 passing`
- `meteor test --once --port 3192 --driver-package meteortesting:mocha`
  - passed: `24 passing`
- `meteor test --once --port 3193 --driver-package meteortesting:mocha`
  - passed: `24 passing`
- `meteor test --once --port 3197 --driver-package meteortesting:mocha`
  - passed: `24 passing`
- `meteor test --once --port 3198 --driver-package meteortesting:mocha`
  - passed: `24 passing`
