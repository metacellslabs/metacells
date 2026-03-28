# MetaCells Architecture

MetaCells organizes automation using a spreadsheet-inspired computational model.

Instead of writing traditional programs, users build workflows using **cells**, **worksheets**, and **workbooks**.

Each layer builds on the previous one and allows complex systems to emerge from many small components.

---

# Core structural model

cells
↓
worksheets
↓
workbooks
↓
automation modules

Cells perform individual computations.  
Worksheets organize cells into workflows.  
Workbooks combine worksheets into complete automation systems.  
Automation modules allow workbooks to be reused as functional components.

---

# Cells

Cells are the fundamental computational units in MetaCells.

A cell may:

- store structured data
- execute formulas
- run AI prompts
- call connectors
- process files
- transform data
- produce outputs for other cells

Cells operate in a reactive model where outputs can feed other cells.

This creates a directed flow of information across the worksheet.

---

# Worksheets

Worksheets organize cells into **structured pipelines**.

A worksheet typically represents a workflow such as:

- processing incoming emails
- analyzing documents
- transforming API data
- generating reports
- orchestrating automation tasks

Cells in a worksheet may depend on the results of other cells.

This allows workflows to be built incrementally using simple building blocks.

---

# Workbooks

Workbooks combine multiple worksheets into a **complete automation system**.

A workbook may:

- orchestrate multiple workflows
- process datasets
- coordinate AI computations
- integrate external systems

Conceptually, a workbook can behave like a function.

input data + files
↓
workbook
↓
many cells performing
formulas, connectors,
and AI computations
↓
structured outputs
reports
decisions
actions

This model allows complex problems to be solved by many cooperating cells.

---

# Automation modules

Workbooks can evolve into **reusable automation modules**.

Modules accept inputs such as:

- data
- files
- API responses
- messages

and produce outputs such as:

- reports
- structured datasets
- decisions
- automation actions

Modules can be shared, reused, or distributed through the ecosystem.

---

# Data and execution flow

MetaCells workflows often follow a transformation pipeline.

data
↓
formulas
↓
parameterised prompts
↓
AI skills
↓
results
↓
reflection / evaluation
↓
improved outputs

This allows workflows to incorporate:

- reasoning
- iterative refinement
- prompt chaining
- self-improving automation

---

# AI computation model

MetaCells supports **AI-assisted workflows** where prompts and reasoning tasks are executed inside cells.

Prompts may be:

- parameterised using formulas
- generated dynamically from data
- dependent on outputs from other AI computations

This allows the creation of **multi-step AI pipelines**.

Example pattern:

document
↓
extraction prompt
↓
structured data
↓
analysis prompt
↓
decision

Workflows may also include **self-reflection steps**, where results are evaluated or refined by additional prompts.

This enables:

- iterative improvement
- automated validation
- prompt back-testing
- self-improving workflows

---

# Connectors

Connectors allow cells to interact with external systems.

Examples include:

- messaging platforms
- email systems
- CRMs
- SaaS tools
- APIs
- databases
- file storage systems

Connectors may provide:

- data ingestion
- event triggers
- data export
- workflow triggers

This allows MetaCells workflows to integrate with real-world systems.

---

# Files and local context

Cells can reference and process files as inputs.

Examples include:

- documents
- PDFs
- datasets
- spreadsheets
- attachments

Files may be processed directly inside workflows using formulas, connectors, or AI skills.

MetaCells also supports **privacy-first semantic search across local files and emails**, allowing workflows to build context from local data sources.

---

# Extensibility

The architecture is designed to remain minimal at the core.

Additional capabilities can be implemented through ecosystem components such as:

- connectors
- formulas
- AI skills
- worksheets
- automation modules

These components may be distributed through:

- open-source repositories
- private repositories
- organization registries
- ecosystem hubs such as MetaCellsHub

---

# Architectural philosophy

MetaCells follows a simple principle:

**complex systems should emerge from simple, composable building blocks.**

Instead of building large monolithic automation systems, MetaCells encourages workflows constructed from many small cells working together.

This approach makes automation:

- transparent
- composable
- inspectable
- easy to evolve

---

# Engine architecture for developers

This section describes how the workbook engine works in practice across the client and server.

The goal is simple:

- the client is responsible for editing, rendering, and optimistic local UX
- the server is responsible for durable persistence, authoritative recompute, and async job execution

---

# Runtime roles

There are two main runtime roles:

- **client runtime**
  - renders the workbook UI
  - captures user edits
  - applies local optimistic updates
  - runs safe local recompute for cheap synchronous paths
  - subscribes to server workbook events
- **server runtime**
  - persists workbook documents
  - owns the authoritative workbook snapshot
  - maintains dependency metadata
  - runs authoritative recompute
  - runs durable background jobs such as AI and file processing

In production, long-running work is handled by workers, not by the browser UI process.

---

# Workbook document model

A workbook is stored as a document with:

- workbook metadata
- tabs
- named cells
- sheets
- dependency graph
- caches and globals

Each sheet stores:

- `cells`
- `columnWidths`
- `rowHeights`
- `reportContent`

Each cell may contain:

- source text
- source type
- computed state
- rendered output
- attachment metadata
- version metadata

The workbook document is the contract between client and server.

---

# Cell state model

A cell moves through a small number of states:

- **source**
  - raw input entered by the user
  - may be plain text, formula, attachment token, or report reference
- **computed**
  - evaluated value produced by the engine
- **rendered**
  - UI-facing representation such as HTML, chip, table spill, or preview text

Important rule:

- source is durable
- computed is derived
- rendered is presentation only

The engine should never treat rendered UI as the source of truth.

---

# Client to server edit flow

The normal edit lifecycle is:

1. the user edits a cell, report, file input, or named cell in the client
2. the client updates local workbook state immediately for responsive UX
3. the client persists the workbook through `sheets.saveWorkbook`
4. the server writes the new workbook snapshot and marks affected dependents stale
5. the server recomputes only the affected dependency subgraph when possible
6. the server publishes workbook events
7. the client applies the event patch or reloads the latest snapshot

This gives the UI fast feedback while keeping the server authoritative.

---

# Local recompute vs server recompute

The client may do **local recompute** for cheap synchronous cases:

- simple formulas
- local display refresh
- optimistic stale marking

The server does **authoritative recompute** for:

- persisted workbook changes
- dependency graph invalidation
- async AI and file-derived outputs
- anything that must survive refresh, reconnect, or multi-client editing

Practical rule:

- local recompute improves UX
- server recompute defines the final truth

---

# Dependency graph

The engine persists a real dependency graph inside the workbook.

It tracks dependencies such as:

- cell to cell
- cell to region
- cell to named cell
- cell to attachment
- cell to channel
- report to mentioned refs

The graph also stores reverse indexes:

- `dependentsByCell`
- `dependentsByNamedRef`
- `dependentsByChannel`
- `dependentsByAttachment`

This allows the server to invalidate and recompute only downstream dependents instead of rescanning the whole workbook.

Important rule:

- normal compute trusts the persisted dependency graph
- stale or missing graphs must be repaired explicitly, not rediscovered ad hoc in hot paths

---

# Versioning and signatures

To keep async and incremental compute safe, cells persist version metadata:

- `sourceVersion`
  - increments when the source changes
- `computedVersion`
  - increments when a fresh computed result is stored
- `dependencyVersion`
  - increments when the dependency snapshot for the cell changes
- `dependencySignature`
  - compact signature of the upstream state used for the current result

These fields let the engine answer two questions:

- is the current computed value still valid for the latest source?
- was this async result produced against the same upstream dependency state?

This is the core safety mechanism that prevents old async work from overwriting newer edits.

---

# Async AI and file jobs

Long-running operations are not executed inline in the UI request path.

They are executed as durable jobs with states such as:

- `queued`
- `leased`
- `running`
- `retrying`
- `completed`
- `failed`
- `cancelled`

Important properties:

- jobs are durable across restarts
- jobs use leases and heartbeats
- jobs support retries and dead letters
- jobs use dedupe keys for idempotency

The current AI path works roughly like this:

1. a formula or prompt requires AI output
2. the server builds a normalized payload plus queue metadata
3. the request is enqueued as a durable job
4. a worker claims and executes the provider call
5. the result is applied only if it is still valid for the current workbook state
6. downstream dependents are invalidated and recomputed as needed

The same pattern is used for staged file processing and attachment-derived content.

---

# Attachments and large content

Workbook documents do not store large blobs inline whenever possible.

Instead, attachment cells store compact metadata and references such as:

- file name
- mime type
- preview URL
- `binaryArtifactId`
- `contentArtifactId`

During compute, the server may hydrate attachment content from artifacts.
During persistence, the workbook keeps only the durable references and compact metadata.

This keeps workbook documents small and fast to save, diff, and sync.

---

# Reports

Reports are part of the workbook model, not a separate editor product.

Important points:

- report source lives in `sheet.reportContent`
- report view renders linked cells, files, and extracted content
- report edit mode writes back to workbook state
- linked report controls such as `Input:@cell` and `File:@cell` must update the same underlying source cells used by the grid

Practical rule:

- report and sheet are two views over the same workbook state
- they must never create parallel sources of truth

---

# Server to client sync

After persistence or recompute, the server publishes workbook events.

The client consumes them through the workbook subscription channel and then:

- applies a runtime patch when the event is narrow and safe
- falls back to snapshot reload when the patch cannot be trusted

This split is important:

- runtime patching keeps the UI fast
- snapshot fallback keeps the UI correct

The client should prefer correctness over cleverness whenever the runtime patch path is uncertain.

---

# Conflict model

Workbook saves are revision-aware.

The client sends an `expectedRevision`.
The server rejects the save if the workbook changed since that revision.

This prevents one client or one stale UI state from silently overwriting newer workbook state.

Practical rule:

- if persistence conflicts with newer server state, reload and reconcile
- do not force local UI state back onto the server blindly

---

# Design invariants

A contributor should keep these invariants in mind:

- there must be one durable source of truth for workbook state
- source mutations must go through approved facades, not ad hoc DOM paths
- local optimistic UI must converge to server state
- async results must validate against current versions before applying
- dependency invalidation must be graph-driven, not workbook-wide by default
- report, sheet, formula bar, and overlays must all edit the same underlying workbook state
- attachments, linked inputs, and mentions should have one entry path per use case

If a new feature creates a second path for the same mutation, it will almost certainly drift later.

---

# Mental model for contributors

When changing the engine, think in this order:

1. what is the durable source change?
2. what dependency edges become invalid?
3. can the client update optimistically?
4. what must the server recompute authoritatively?
5. what version checks protect against stale async results?
6. what event returns the new truth to the client?

If these six answers are clear, the implementation is usually aligned with the architecture.
