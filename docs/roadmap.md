# MetaCells Roadmap

This roadmap reflects the current architecture direction and a practical delivery sequence through the end of 2026.

Roadmap is decided by the maintainer.

Suggestions are welcome but not guaranteed to be implemented.

Estimates are intentionally rough and assume a small team shipping continuously.

## 2026 Q1

Focus: stabilize the core execution model and make the product reliable enough for more ambitious workflow features.

Estimated delivery: 8-10 weeks

- core engine hardening
  - split web and worker responsibilities cleanly
  - durable jobs for AI, file extraction, and channel processing
  - persisted dependency graph and targeted recompute
  - workbook persistence cleanup and execution/runtime separation
- API foundation
  - stable workbook save and compute flows
  - clearer persistence and execution boundaries for future connectors and modules
  - server-side source of truth for compute and AI execution
- baseline performance and reliability
  - reduce unnecessary recompute
  - improve observability for compute, job retries, and worker health

## 2026 Q2

Focus: make cells, worksheets, and workbooks feel like a complete AI-native automation environment instead of only a reactive spreadsheet.

Estimated delivery: 10-12 weeks

- AI workflow primitives
  - parameterised prompt cells
  - multi-step AI pipelines across worksheets
  - reflection and evaluation steps for result checking
  - better handling of files, attachments, and document-based context
- workbook structure improvements
  - clearer worksheet orchestration inside a workbook
  - reusable worksheet patterns for common workflows
  - stronger report generation and structured output flows
- first reusable building blocks
  - formula and skill patterns that can be reused across workbooks
  - initial template/workflow library for repeatable automation use cases

## 2026 Q3

Focus: open the platform beyond the core app through connectors, reusable modules, and ecosystem distribution.

Estimated delivery: 10-14 weeks

- connectors platform
  - cleaner connector model for APIs, email, messaging, databases, and file sources
  - connector-triggered workflows and data ingestion paths
  - export and action hooks back into external systems
- reusable automation modules
  - workbooks that behave more like callable modules with defined inputs and outputs
  - packaging and sharing of reusable worksheet/workbook automations
  - internal registry or hub foundations for private and public components
- ecosystem support
  - external formulas, AI skills, worksheets, and templates
  - versioning and distribution model for ecosystem components

## 2026 Q4

Focus: enterprise readiness, operational scale, and product polish for broader adoption.

Estimated delivery: 10-12 weeks

- enterprise features
  - access control and organization-ready sharing patterns
  - auditability, safer operations, and stronger governance around automation
  - private ecosystem support for internal connectors, skills, and templates
- scaling
  - more predictable worker scaling and queue throughput
  - better cold/warm/hot state separation
  - retention and lifecycle rules for jobs, logs, outputs, and events
- platform polish
  - onboarding templates for common business workflows
  - better observability and admin tooling
  - stronger reliability around long-running and event-driven automations

## By End Of 2026

The expected outcome is a platform where:

- cells can combine formulas, prompts, files, and connectors in one workflow model
- worksheets can represent structured automation pipelines
- workbooks can orchestrate multi-step AI and operational workflows
- reusable modules, templates, and skills can be shared across teams or ecosystems
- the runtime is stable enough for enterprise deployments and larger-scale automation workloads

## Notes

- Q1 work is already substantially underway in the current codebase.
- Q2-Q4 estimates depend on how much effort goes into product polish versus platform depth.
- Ecosystem distribution and enterprise controls can move earlier if partner or customer demand requires it.
