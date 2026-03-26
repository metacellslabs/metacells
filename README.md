# MetaCells `vite`

This directory contains the standalone `vite` runtime: client app, Express server, SQLite-backed persistence, workbook compute engine, AI execution, channels, files, schedules, and desktop packaging support.

This README is a technical map of the implemented system on both client and server, with the main code paths for:

- changing cells
- formula evaluation
- AI formulas
- channels
- settings / providers / connector registration

## Top-Level Runtime Layout

### Client

- `client/main.jsx`
  - frontend bootstrap entry
- `imports/startup/client/index.jsx`
  - mounts the React app
- `imports/ui/app/App.jsx`
  - top-level application shell
- `imports/ui/app/router.jsx`
  - page routing
- `imports/ui/app/pages/SheetPage.jsx`
  - workbook page that hosts the spreadsheet runtime
- `imports/ui/metacell/runtime/index.js`
  - spreadsheet app class and workbook UI runtime glue

### Server

- `server.js`
  - Express server bootstrap
  - loads all API modules
  - mounts RPC
  - mounts artifact and channel-attachment routes
  - starts websocket server
  - starts worker-side background systems
- `imports/startup/server/index.js`
  - startup validation and middleware bootstrap

### Shared Engine / Storage

- `imports/engine/storage-service.js`
  - workbook cell/raw/computed storage operations
- `imports/engine/formula-engine.js`
  - formula engine entry
- `imports/engine/formula-engine/*.js`
  - parser, mentions, references, recalc, AI methods
- `imports/engine/workbook-storage-adapter.js`
  - workbook document adapter

## Main Implemented Subsystems

### Workbook UI Runtime

The workbook runtime is assembled from many small runtime modules under:

- `imports/ui/metacell/runtime/`

Important pieces:

- `index.js`
  - SpreadsheetApp runtime entry
  - integrates formulas, mentions, AI, channels, attachments, selection, history
- `app-bootstrap-init-runtime.js`
  - creates app services and FormulaEngine instance
- `app-bootstrap-setup-runtime.js`
  - initial render and first compute
- `app-methods-runtime-core.js`
  - binds render/compute methods onto SpreadsheetApp
- `compute-runtime.js`
  - render pass + compute orchestration
- `app-methods-cell-update.js`
  - raw cell updates, pending edit detection, AI draft locks
- `editor-controller-runtime.js`
  - edit enter/commit/cancel behavior
- `selection-runtime.js`
  - active cell and selection state
- `mention-runtime.js`
  - mention autocomplete and insertion
- `drag-selection-runtime.js`
  - selection drag + mention drag flows
- `ai-service.js`
  - client-side AI formula request orchestration

### Sheets API

- `imports/api/sheets/index.js`
  - workbook CRUD and sheet/server methods
  - server-side workbook recompute hooks
  - channel-triggered sheet recompute
- `imports/api/sheets/server/compute.js`
  - server-side compute graph and dependency propagation

### AI API

- `imports/api/ai/index.js`
  - active provider resolution
  - durable `ai.requestChat`
  - provider-specific transport code
  - server-side request execution

### Settings / Providers / Channels

- `imports/api/settings/index.js`
  - saved settings document
  - AI provider persistence
  - active provider selection
- `imports/api/settings/providers/*.js`
  - AI provider registry entries
- `imports/api/channels/connectors/*.js`
  - channel connector definitions shown in UI and formulas
- `imports/api/channels/server/index.js`
  - channel runtime, send/search/poll/subscribe orchestration
- `imports/api/channels/server/handlers/*.js`
  - connector-specific transport implementations
- `imports/api/channels/runtime-state.js`
  - builds active channel payload map for formulas and assistant context

## Cell Change Path

This is the main path when a user edits a cell in the workbook UI.

### 1. User edits a cell

Key files:

- `imports/ui/metacell/runtime/editing-input-runtime.js`
- `imports/ui/metacell/runtime/editor-controller-runtime.js`
- `imports/ui/metacell/runtime/app-methods-cell-update.js`

Flow:

1. input enters editing mode
2. edit session is tracked
3. commit/cancel is handled by editor controller
4. committed raw value is written into storage

The actual raw write lands in:

- `SpreadsheetApp.prototype.setRawCellValue`
- file: `imports/ui/metacell/runtime/app-methods-cell-update.js`

That calls:

- `this.storage.setCellValue(...)`
- file: `imports/engine/storage-service.js`

### 2. Compute is triggered

The UI then calls:

- `app.computeAll(...)`
- file: `imports/ui/metacell/runtime/compute-runtime.js`

This is the main recomputation entry for the client workbook.

### 3. Render is refreshed

After compute:

- changed cells are rerendered
- formula bar is synced
- editor overlay is synced
- dependency highlight is updated
- report live values are refreshed

Core render methods:

- `renderCurrentSheetFromStorage`
- `renderChangedCellIds`
- file: `imports/ui/metacell/runtime/compute-runtime.js`

## Formula Evaluation Path

### Formula registry

Formula exports are exposed from:

- `imports/ui/metacell/runtime/formulas/index.js`
  - re-exports from engine formulas
- `imports/engine/formulas/index.js`
  - actual formula registry

### Formula engine

Main engine entry:

- `imports/engine/formula-engine.js`

Important internal modules:

- `formula-engine/parser-methods.js`
  - parses formulas and mentions
- `formula-engine/reference-methods.js`
  - cell/range references
- `formula-engine/mention-methods.js`
  - `@A1`, named refs, raw refs, region refs, sheet refs
- `formula-engine/recalc-methods.js`
  - update/recalc behaviors
- `formula-engine/ai-methods.js`
  - `'`, `>`, `#` AI formulas and AI helpers

### What happens

When `computeAll()` runs:

1. raw cell contents are scanned
2. formula-like cells are parsed
3. dependencies are collected
4. computed values / display values / errors / state are written into storage
5. spill results and generated cells are updated

The same engine is also used on the server in:

- `imports/api/sheets/server/compute.js`
- `imports/api/ai/index.js`
- `imports/api/sheets/index.js`

## AI Formula Path

AI formulas are workbook-native and are handled through the formula engine plus the AI service.

### Client-side orchestration

- `imports/ui/metacell/runtime/ai-service.js`

Responsibilities:

- queues AI requests
- debounces in auto mode
- supports manual mode
- caches results
- attaches workbook queue metadata
- calls RPC `ai.requestChat`

Main entry:

- `AIService.requestChat(...)`

### Where AI formulas originate

AI formula behavior lives in:

- `imports/engine/formula-engine/ai-methods.js`

This covers prompt formulas like:

- `'...`
- `>...`
- `#...`

and workbook AI helpers such as generated result tracking, attachment context inclusion, and mention expansion.

### Server-side AI execution

- `imports/api/ai/index.js`

Responsibilities:

- resolves active provider from settings
- selects model
- normalizes messages
- sends provider request
- returns content back into workbook flow

Currently implemented provider routing includes OpenAI-compatible providers and Gemini-specific transport.

### AI provider definitions

Registry path:

- `imports/api/settings/providers/index.js`

Provider files:

- `imports/api/settings/providers/OPENAI.js`
- `imports/api/settings/providers/DEEPSEEK.js`
- `imports/api/settings/providers/GEMINI.js`
- `imports/api/settings/providers/OPENROUTER.js`
- `imports/api/settings/providers/LM_STUDIO.js`
- others in the same directory

### AI settings persistence

- `imports/api/settings/index.js`

Relevant methods:

- `settings.get`
- `settings.upsertAIProvider`
- `settings.setActiveAIProvider`

## Channels Path

Channels are split into connector metadata + runtime handlers.

### Connector registry

- `imports/api/channels/connectors/index.js`

Each connector defines:

- id / type / name
- settings fields
- capabilities
- mentioning formulas
- help text

Files:

- `imports/api/channels/connectors/*.js`

### Handler runtime

- `imports/api/channels/server/handlers/*.js`

Each handler may implement:

- `testConnection`
- `send`
- `poll`
- `subscribe`
- `normalizeEvent`
- `search`

### Server orchestration

- `imports/api/channels/server/index.js`

This file handles:

- saving channel configs
- polling/subscription worker
- incoming event normalization
- saving channel events
- search/send RPC methods
- recomputing sheets mentioning a channel

Important methods:

- `settings.upsertCommunicationChannel`
- `settings.testCommunicationChannel`
- `channels.pollNow`
- `channels.send`
- `channels.sendByLabel`
- `channels.search`
- `channels.searchByLabel`

### Channel payloads in formulas

Active channel payloads are built in:

- `imports/api/channels/runtime-state.js`

Sheet recompute hooks that react to channel events:

- `imports/api/channels/server/index.js`
- `imports/api/sheets/index.js`

Specific recompute entry:

- `recomputeSheetsMentioningChannel(channelLabel)`
- file: `imports/api/sheets/index.js`

## Path for Changing a Normal Cell

Use these files if the change is about plain values, editing UX, or cell commit behavior:

- `imports/ui/metacell/runtime/editing-input-runtime.js`
- `imports/ui/metacell/runtime/editor-controller-runtime.js`
- `imports/ui/metacell/runtime/app-methods-cell-update.js`
- `imports/engine/storage-service.js`
- `imports/ui/metacell/runtime/compute-runtime.js`

## Path for Changing Formula Behavior

Use these files if the change is about parsing, references, dependencies, or formula evaluation:

- `imports/engine/formula-engine.js`
- `imports/engine/formula-engine/parser-methods.js`
- `imports/engine/formula-engine/reference-methods.js`
- `imports/engine/formula-engine/mention-methods.js`
- `imports/engine/formula-engine/recalc-methods.js`
- `imports/engine/formulas/index.js`
- formula implementations under `imports/engine/formulas/`

## Path for Changing AI Formula Behavior

Use these files if the change is about prompt formulas, queueing, provider calls, or AI result handling:

- `imports/engine/formula-engine/ai-methods.js`
- `imports/ui/metacell/runtime/ai-service.js`
- `imports/api/ai/index.js`
- `imports/api/settings/providers/*.js`
- `imports/api/settings/index.js`

## Path for Changing Channels

Use these files if the change is about receive/send/search/mentions/channel configuration:

- `imports/api/channels/connectors/*.js`
- `imports/api/channels/server/handlers/*.js`
- `imports/api/channels/server/index.js`
- `imports/api/channels/runtime-state.js`
- `imports/api/channels/events.js`
- `imports/ui/app/pages/SettingsPage.jsx`
- `imports/ui/app/components/settings/SettingsSections.jsx`

## Path for Changing Server-Side Workbook Compute

Use these files if the change is about durable workbook recompute, dependency graphs, or worker-driven updates:

- `imports/api/sheets/server/compute.js`
- `imports/api/sheets/index.js`
- `imports/api/ai/index.js`
- `imports/api/jobs/index.js`

## Entry Points to Keep in Mind

### Client entrypoints

- `client/main.jsx`
- `imports/startup/client/index.jsx`
- `imports/ui/app/App.jsx`
- `imports/ui/app/router.jsx`
- `imports/ui/app/pages/SheetPage.jsx`

### Server entrypoints

- `server.js`
- `imports/startup/server/index.js`

## Practical Rule of Thumb

If you need to change:

- edit UX or local commit behavior
  - start in `ui/metacell/runtime/*`
- formula semantics
  - start in `engine/formula-engine/*` and `engine/formulas/*`
- AI provider or transport
  - start in `api/ai/index.js` and `api/settings/providers/*`
- channels
  - start in `api/channels/connectors/*`, `api/channels/server/handlers/*`, and `api/channels/server/index.js`
- workbook persistence or computed state storage
  - start in `engine/storage-service.js` and `api/sheets/*`
