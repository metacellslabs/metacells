# Vision

## Cells that work for you

By learning a few simple concepts for working with data and its meta-processing — such as building dynamic prompts based on formulas and the results of AI computations — users can gain a flexible and powerful tool for solving a wide range of personal and professional tasks.

Metacells explores a new kind of automation environment where spreadsheets become intelligent workspaces.

Instead of static tables, cells can analyze data, call connectors, run AI tasks, and automate workflows.

The goal is simple:

**make powerful automation accessible to people who understand their work, not only to people who can program.**

---

# What you can build

With Metacells you can create tools and workflows such as:

- analyzing incoming emails and extracting structured data
- generating reports from documents or datasets
- processing files uploaded by users
- transforming API responses into structured tables
- building internal tools powered by intelligent spreadsheets
- automating repetitive workflows
- building decision-support systems

Instead of building software from scratch, users can assemble workflows using cells that process data and collaborate.

---

# Philosophy of spreadsheets

Most modern automation systems are built **by engineers for engineers**.

Logic often lives deep inside code, configuration files, scripts, or infrastructure.  
To understand what is happening inside the system, users often need to work with:

- terminal commands
- logs
- configuration files
- environment variables
- scripts and pipelines

Users often have to keep many variables, parameters, and settings in their head at the same time, without clearly seeing how they relate to each other.

Even simple automation can require technical skills just to connect systems, configure integrations, and inspect results.

Metacells explores a different model.

Instead of hiding logic inside code or infrastructure, **everything is brought into the open and represented as cells**.

In Metacells:

- data lives in cells
- logic lives in cells
- prompts live in cells
- results appear in cells
- context is visible in cells

This makes the entire system transparent and interactive.

Users can see how information flows, how decisions are made, and how results are produced.

Automation becomes something that can be **observed, edited, and improved directly in the worksheet**.

Instead of writing code, users often work with:

- prompts
- formulas
- simple logic
- structured data

This allows powerful systems to be created using concepts that are already familiar to millions of people who use spreadsheets.

Metacells aims to combine the **accessibility of spreadsheets** with the **power of automation systems and AI agents**.

The result is a system where complex workflows can emerge from many simple cells working together.

# Open ecosystem

Metacells is designed as an **open platform**.

The core provides the runtime and core model, while functionality can grow through contributions from the community.

Users and developers can contribute:

- connectors
- formulas
- AI skills
- worksheets
- workflow templates

Over time, the ecosystem can grow into a large library of reusable automation components.

---

# Core idea

Metacells combines spreadsheets, automation, and AI into a single environment.

data → formulas → dynamic prompts → AI computation → new data → workflows

Cells continuously transform and enrich information as it flows through the worksheet.

Over time, spreadsheets become **living automation systems** rather than static documents.

---

# Cells with embedded intelligence

In Metacells, the basic unit is a **cell**.

Cells are not just data containers. They can contain:

- formulas
- logic
- automation steps
- AI-powered skills or agents
- file references and file-processing tasks
- source connectors to external systems
- connectors to third-party services such as messengers, email systems, CRMs, and APIs

Cells ingest data from multiple sources, process it, and pass structured outputs to other cells.

This allows spreadsheets to behave more like **automation platforms**.

---

# Context-aware spreadsheets

Metacells enables **context-aware spreadsheets**.

Cells can incorporate context from:

- files
- emails
- APIs
- datasets
- user inputs
- external systems

Spreadsheets dynamically adapt as new information appears.

Cells evaluate context and produce results automatically.

---

# Decision-aware spreadsheets

Metacells also enables **decision-aware spreadsheets**.

Users can build spreadsheets that follow their own logic when:

- analyzing situations
- evaluating conditions
- interpreting incoming data
- applying rules
- generating outcomes

Cells can incorporate reasoning, context, and AI assistance.

These spreadsheets become tools for **analysis and decision support**.

---

# From cells to programmable workbooks

Cells combine into **worksheets**, and worksheets combine into **workbooks**.

A workbook represents a complete workflow composed of many cells working together.

Over time, a workbook can become something more powerful: **a reusable formula-like system**.

A workbook can behave like a function:

input data + files
↓
workbook
↓
many cells with formulas,
connectors and AI processing
↓
structured results
reports
decisions
actions

The structural model of MetaCells is described in more detail in
[ARCHITECTURE.md](docs/ARCHITECTURE.md).

A complex task can be executed by **an armada of cells** working together.

Workbooks may eventually become reusable modules that accept inputs and produce outputs, similar to functions in programming systems.

---

# Continuous improvement through prompt self-reflection

Automation workflows in Metacells can evolve over time.

Prompts and AI tasks may include **self-reflection and evaluation mechanisms**, allowing workflows to analyze results and improve future behavior.

This enables systems that gradually become more effective as they are used.

---

# Working with files and local context

A large part of real work context lives in **local files and emails**.

Metacells supports workflows that reference local data sources such as:

- documents
- folders
- archived emails
- attachments
- datasets
- notes

Cells can reference files directly and use them as inputs for processing.

AI-enabled cells may analyze documents, extract structured information, generate summaries, and support decision-making.

---

# Privacy-first semantic search

Metacells aims to support **privacy-first semantic search across local files and emails**.

This enables:

- fast semantic search across local data
- context generation from files and emails
- local-first data processing
- privacy-preserving workflows

AI agents inside cells can use this context to analyze documents and assist decision-making.

---

# Simple interfaces powered by intelligent cells

Metacells allows users to build **simple interfaces on top of worksheets**.

Users may only need to:

- enter data
- upload files
- trigger actions

The cells perform the complex work behind the scenes.

This enables lightweight internal tools where the interface remains simple while the logic lives in intelligent cells.

---

# AI provider agnostic

Metacells is designed to be **AI-provider agnostic**.

Users can connect the AI systems they prefer:

- cloud AI providers
- private APIs
- local models

Initial experimentation includes support for local model environments such as **LM Studio**, but the architecture remains flexible.

---

# MetaCellsHub ecosystem

Metacells supports an ecosystem of reusable components that can be distributed through public repositories, private registries, or organizational hubs.

These components may include:

- connectors
- AI skills
- formulas
- worksheets
- workflow templates

A shared hub or registry, such as **MetaCellsHub**, may host reusable components and automation modules.

This allows individuals, teams, and companies to share automation building blocks, assemble solutions quickly, and keep sensitive workflows, data connections, or business logic private when necessary.

Metacells is designed to support both **open and private ecosystems**.

---

# Community-driven development

Metacells is intended to grow as an open project developed together with its community.

Contributors can help by:

- improving the core platform
- building connectors
- creating formulas and tools
- sharing worksheets that solve real tasks
- improving documentation

---

# Design principles

Metacells follows several core principles:

- local-first where possible
- composable cells instead of monolithic automation
- open ecosystem of connectors and skills
- AI used as an assistant, not a black box
- simple interfaces powered by intelligent cells

---

# Governance

Metacells is currently maintained by the project founder.

The long-term goal is to grow a community of contributors while keeping the core architecture coherent and stable.

---

# What We Will Not Merge (For Now)

To keep the project focused and maintain a clear architecture, some types of contributions will not be merged at this stage.

This list is a roadmap guardrail rather than a rigid rule.

### Core features that belong in external hubs

New skills, connectors, or extensions that can live in external hubs or registries such as **MetaCellsHub** will usually not be merged into the main repository.

### Large documentation translation sets

Full translations of documentation are not a priority right now.

Future directions may include **AI-assisted translation workflows**.

### Highly specific commercial integrations

Integrations with commercial services that do not clearly fit the connector model are better implemented as external modules.

### Redundant channel wrappers

Wrapper connectors around already supported systems will generally not be merged unless they introduce clear benefits.

### Alternative runtime layers

Alternative runtimes should be implemented through connectors or modules rather than the core.

### Complex hierarchical agent frameworks

Deep hierarchies of agents are not planned as the default architecture.

Metacells focuses on **composable cells and workflows**.

### Heavy orchestration layers

Large orchestration frameworks duplicating existing infrastructure are unlikely to be merged into the core.

---

Strong user demand and strong technical reasoning may change these boundaries over t
