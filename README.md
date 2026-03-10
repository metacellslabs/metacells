# MetaCells

Meteor app for AI-assisted spreadsheets and reports.

## Structure Rule

This repo follows Meteor's application structure guidance:
- official guide: https://guide.meteor.com/structure

Practical rule for this app:
- keep eager entry points thin in `client/` and `server/`
- put startup wiring in `imports/startup/`
- group domain logic under `imports/api/<domain>/`
- keep UI and metacell runtime code under `imports/ui/`
- avoid adding new app logic at the repo root

## Routes

- `/`
  - shows all saved metacells
- `/settings`
  - AI providers, channels, general, advanced
- `/metacell/:id`
  - opens a metacell
- `/metacell/:id/:sheetId`
  - opens a metacell and a specific tab
- legacy routes still resolve:
  - `/sheet/:id`
  - `/sheet/:id/:sheetId`

## Data Model

Collections:
- `sheets`
  - one document per metacell
  - source of truth is `workbook`
- `app_settings`
  - singleton settings document

Workbook data stores only populated state, including:
- tabs and active tab
- cells with source/value/state
- named cells
- row heights and column widths
- report content
- AI caches

## Project Layout

### Startup

- [client/main.jsx](/Users/zentelechia/playground/thinker/client/main.jsx)
  - thin Meteor client entry
- [server/main.js](/Users/zentelechia/playground/thinker/server/main.js)
  - thin Meteor server entry
- [imports/startup/client/index.jsx](/Users/zentelechia/playground/thinker/imports/startup/client/index.jsx)
  - renders the React app and loads client CSS
- [imports/startup/server/index.js](/Users/zentelechia/playground/thinker/imports/startup/server/index.js)
  - loads server API modules

### UI

- [imports/ui/app/App.jsx](/Users/zentelechia/playground/thinker/imports/ui/app/App.jsx)
  - route switch for home, settings, and metacells
- [imports/ui/help/HelpOverlay.jsx](/Users/zentelechia/playground/thinker/imports/ui/help/HelpOverlay.jsx)
  - searchable help modal
- [imports/ui/help/helpContent.js](/Users/zentelechia/playground/thinker/imports/ui/help/helpContent.js)
  - structured help content
- [client/main.css](/Users/zentelechia/playground/thinker/client/main.css)
  - app styling

### Metacell Runtime

- [imports/ui/metacell/runtime/index.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/index.js)
  - imperative spreadsheet/report controller
- [imports/ui/metacell/runtime/storage-service.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/storage-service.js)
  - workbook persistence API used by the runtime
- [imports/ui/metacell/runtime/formula-engine.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/formula-engine.js)
  - formula parsing and evaluation orchestration
- [imports/ui/metacell/runtime/grid-manager.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/grid-manager.js)
  - grid rendering and interaction
- [imports/ui/metacell/runtime/ai-service.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/ai-service.js)
  - client-side AI request coordination
- [imports/ui/metacell/runtime/workbook-storage-adapter.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/workbook-storage-adapter.js)
  - in-memory workbook model for the runtime
- [imports/ui/metacell/sheetDocStorage.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/sheetDocStorage.js)
  - adapter that flushes workbook snapshots to Mongo

### API Domains

- [imports/api/sheets/index.js](/Users/zentelechia/playground/thinker/imports/api/sheets/index.js)
  - collection, publications, methods, migration
- [imports/api/sheets/server/compute.js](/Users/zentelechia/playground/thinker/imports/api/sheets/server/compute.js)
  - server-side cell evaluation
- [imports/api/sheets/workbook-codec.js](/Users/zentelechia/playground/thinker/imports/api/sheets/workbook-codec.js)
  - workbook encode/decode and legacy migration helpers
- [imports/api/sheets/storage-codec.js](/Users/zentelechia/playground/thinker/imports/api/sheets/storage-codec.js)
  - safe key encoding helpers
- [imports/api/settings/index.js](/Users/zentelechia/playground/thinker/imports/api/settings/index.js)
  - AI provider and channel settings
- [imports/api/settings/providers](/Users/zentelechia/playground/thinker/imports/api/settings/providers)
  - file-based AI provider definitions and registry
- [imports/api/ai/index.js](/Users/zentelechia/playground/thinker/imports/api/ai/index.js)
  - server-side AI requests, queueing, dependency refresh, provider selection
- [imports/api/files/index.js](/Users/zentelechia/playground/thinker/imports/api/files/index.js)
  - file content extraction via the server-side converter binary

## Compute Flow

1. User edits a cell, report input, or attachment.
2. The client runtime updates its workbook snapshot.
3. The workbook is saved through `sheets.saveWorkbook`.
4. Server compute runs through `sheets.computeGrid`.
5. Returned computed values are rendered in the grid.
6. Async AI results persist back into Mongo and are republished.

The server is the source of truth for calculation and AI execution.

## Supported Cell Behavior

- plain values
- `=formula`
- `'prompt`
  - asks AI and shows the answer in the cell
- `>prompt`
  - asks AI for a list and spills rows below
- `#prompt`
  - asks AI for a table and spills rows/columns
- attachments
  - cell displays filename
  - formulas and mentions use extracted file content

Supported reference concepts:
- `A1`
- `Sheet 1!A1`
- `A1:B5`
- `@idea`
- `_@idea`
- `@@idea`
- `!@idea`
- `recalc(...)`
- `update(...)`

## Custom Formulas

File-based formulas live in:
- [imports/ui/metacell/runtime/formulas](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/formulas)

Format:
- one formula per file
- export a definition with `defineFormula(...)`
- the definition is auto-discovered at startup through [imports/ui/metacell/runtime/formulas/index.js](/Users/zentelechia/playground/thinker/imports/ui/metacell/runtime/formulas/index.js)
- Help reads the same registry, so registered formulas appear in Help automatically

Definition shape:

```js
import { defineFormula } from "./definition.js";

export default defineFormula({
  name: "MYFORMULA",
  aliases: ["MY_ALIAS"],
  signature: "MYFORMULA(arg1, arg2)",
  summary: "Explain what the formula does.",
  examples: ["`=MYFORMULA(A1:A3, 2)`"],
  execute: ({ args, helpers, engine, sheetId, cellId, stack, options }) => {
    return "";
  },
});
```

Useful execution inputs:
- `args`
  - already evaluated formula arguments
- `helpers`
  - shared coercion and matrix helpers such as `toMatrix`, `flattenValues`, `toNumber`, `matchesCriteria`
- `engine`
  - current `FormulaEngine` instance if custom logic needs deeper access

How to add a new formula:
1. Create a new file in `imports/ui/metacell/runtime/formulas/`
2. Export a formula definition with `defineFormula(...)`
3. Restart the app
4. Startup validation checks the file schema and registry coverage
5. The formula becomes available in evaluation and in Help automatically

Built-in formulas included now:
- `SUM`
- `AVERAGE`
- `IF`
- `VLOOKUP`
- `XLOOKUP`
- `COUNT`
- `COUNTA`
- `LEN`
- `SUMIF`
- `INDEX`

## Reports

Report tabs support:
- rich text editing
- markdown rendering in view mode
- `Input:@cell:[Placeholder]`
- `File:@cell:[Hint]`
- live mentions to cells, regions, and named cells

## AI

AI runs only on the server.

Features:
- provider selection from settings
- DeepSeek and LM Studio support
- provider definitions are file-based and auto-discovered at startup
- queue with max 3 concurrent requests
- dedupe for identical queued tasks
- dependency-aware refresh for queued tasks
- retry on failure
- URL content fetching for AI prompt enrichment

## Custom AI Providers

File-based AI providers live in:
- [imports/api/settings/providers](/Users/zentelechia/playground/thinker/imports/api/settings/providers)

Format:
- one provider per file
- export a definition with `defineAIProvider(...)`
- the definition is auto-discovered at startup through [imports/api/settings/providers/index.js](/Users/zentelechia/playground/thinker/imports/api/settings/providers/index.js)
- the settings UI reads the same registry, so discovered providers show up there automatically

Definition shape:

```js
import { defineAIProvider } from "./definition.js";

export default defineAIProvider({
  id: "my-provider",
  name: "My Provider",
  type: "my_provider",
  baseUrl: "https://api.example.com/v1",
  model: "default-model",
  apiKey: "",
  enabled: true,
  availableModels: ["default-model", "fast-model"],
  fields: [
    { key: "baseUrl", label: "Base URL", type: "text", placeholder: "https://api.example.com/v1" },
    { key: "model", label: "Model", type: "text", placeholder: "default-model" },
    { key: "apiKey", label: "API key", type: "password", placeholder: "sk-..." },
  ],
});
```

How to add a new provider:
1. Create a new file in `imports/api/settings/providers/`
2. Export a provider definition with `defineAIProvider(...)`
3. Restart the app
4. Startup validation checks the file schema and registry coverage
5. The provider appears in `/settings` automatically

Built-in providers included now:
- `DeepSeek`
- `LM Studio`

## File Extraction

Attachments are converted on the server with:
- [server/tools/file-converter/file-converter](/Users/zentelechia/playground/thinker/server/tools/file-converter/file-converter)

Converter notes:
- runtime code lives under `imports/`
- the binary stays under `server/tools/` as a server-side dependency

## Local Development

Run the app:

```bash
meteor run --port 3400
```

Run tests:

```bash
meteor test --once --driver-package meteortesting:mocha
```
