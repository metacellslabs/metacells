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
