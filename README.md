# MetaCells

**MetaCells** is an open-source spreadsheet runtime for AI workflows, automations, files, and integrations.
![Demo](output.gif)
Instead of hiding logic in scripts, prompts, and backend glue code, **everything lives in cells**:

- formulas
- AI prompts
- files
- reports
- connectors
- actions

Your entire workflow becomes **visible, editable, and composable inside a spreadsheet**.

Think:

**Spreadsheets + AI agents + automations, in one open system.**

---

## Why MetaCells exists

AI workflows today are fragmented.

Logic lives across:

- prompts
- scripts
- cron jobs
- automation tools
- connectors
- backend glue code

MetaCells turns this into something simpler:

**a programmable spreadsheet where cells can think, compute, and act.**

---

## Example

A simple workbook might look like this:

```text
Input:@idea:[Describe your startup idea]
'Summarize the idea in one sentence: @idea
>top 10 user complaints about products like @idea
#compare @idea with competitors;4;6
/tg Launch update is live
/sf:send:{"to":"team@example.com","subj":"Status","body":"See @report"}
```

Each cell can:

- generate text
- produce lists
- create tables
- trigger actions
- feed other cells

Everything updates reactively.

Newer workbook patterns also supported:

```text
'Write with @@brief and @idea
'Audit _@idea
!@idea
=update(@target, "#compare @idea with competitors;4;6")
=B1>5 && recalc(B1>5, @target)
/x shipping update is live
```

---
## 🔥 Hot fixes wanted

<!-- featured-issues:start -->

### ui/ux

- [#3 Formula bar behavior](https://github.com/metacellslabs/MetaCells/issues/3)

### enhancement

- [#5 npm license compliance check](https://github.com/metacellslabs/MetaCells/issues/5)

<!-- featured-issues:end -->

## What you can build

MetaCells is a **runtime for AI-native workflows**.

### AI research notebooks

- summarize PDFs
- compare competitors
- generate structured insights

### Internal AI tools

- AI reports
- document processing
- automated analysis

### Automation workspaces

- process email
- react to Telegram messages
- generate reports
- trigger actions

### AI agents in spreadsheets

Cells can call AI, generate outputs, and pass results to other cells.

No hidden pipelines.

---

## Why developers fork MetaCells

MetaCells is designed to be **forkable infrastructure**.

You can extend it with:

- new formulas
- new AI providers
- new connectors
- custom workflow primitives

Developers fork MetaCells to build:

- internal AI tools
- automation systems
- research environments
- AI notebook platforms

If you ever wanted to build something like:

- Airtable for AI
- AI-native spreadsheets
- automation workbooks

MetaCells gives you the base runtime.

---

## Core ideas

### Cells are programmable

Cells are not just data.

They can be:

- prompts
- formulas
- reports
- file inputs
- integrations
- actions

### AI is a native cell operation

Example:

```text
'Write 3 launch taglines for @idea
```

### Tables spill automatically

```text
#compare @product with competitors;4;6
```

### Files become AI context

```text
File:@policy:[Upload policy PDF]
```

AI prompts can read the file automatically.

### Reports can collect inputs directly

MetaCells report views can render controls that write back into cells.

```text
Input:@case:[Enter your business case]
File:@policy:[Upload policy PDF]
```

This makes it possible to build guided AI workflows and internal tools without leaving the workbook.

### Cells can generate files

You can turn any cell content into a downloadable attachment.

```text
=pdf("invoice.pdf", A1)
=FILE("invoice.pdf", A1, "PDF")
```

This is useful when another cell already contains the text you want to package, including content extracted from an uploaded file.

```text
File:@policy:[Upload policy PDF]
=PDF("policy-copy.pdf", @policy)
```

### Cells can trigger actions

```text
/tg Launch update is live
/x shipping update is live
/sf:send:{"to":"team@example.com","subj":"Report","body":"See @summary"}
```

### Mentioning is first-class

MetaCells supports several ways to reference workbook context:

- `@idea` for the computed value of a named cell
- `@@brief` for hidden AI context
- `_@idea` for the raw source of a cell
- `!@idea` for an internal report link
- `A1:B5` for a region
- `@policy` for extracted file contents from a file cell
- `https://...` inside AI prompts to fetch page content into the prompt

---

## How it works

MetaCells uses a spreadsheet-native computation model:

```text
data -> formulas -> prompts -> AI computation -> new data -> actions
```

Cells reference each other with:

```text
@cell
```

Everything updates reactively across the workbook.

Formulas can also drive workflow control:

```text
=update(@target, newValue)
=recalc(condition, @target)
```

This makes it possible to build chained flows and conditional reruns directly in the sheet model.

---

## Quick start

### Run locally

Requirements:

- Node.js 20+
- MongoDB (external instance or the app will use an embedded one for Electron)

Install dependencies:

```bash
npm install
```

Start the server:

```bash
npm start
```

For development, run the Vite dev server and Express backend separately:

```bash
npm run start:server   # Express API server
npm run start:client   # Vite dev server
```

Open:

```text
http://localhost:3400
```

Optional worker for background jobs and connectors:

```bash
npm run start:worker
```

### Run with Electron

Electron is configured as a desktop shell for the Express server.

Development mode starts the server and Electron together:

```bash
npm run desktop:dev
```

If you already have the server running elsewhere, point Electron at that URL:

```bash
METACELLS_DESKTOP_URL=http://127.0.0.1:3400 npm run desktop:dev:frontend-only
```

### Build desktop packages

Install dependencies first:

```bash
npm install
```

Build the client assets:

```bash
npm run build
```

Build a self-contained desktop app for the current host platform:

```bash
npm run desktop:dist
```

Build platform-specific self-contained packages:

```bash
npm run desktop:dist:mac
npm run desktop:dist:mac:arm64
npm run desktop:dist:mac:x64
npm run desktop:dist:linux
npm run desktop:dist:win
```

Create an unpacked app directory without installers:

```bash
npm run desktop:pack
```

Artifacts are written to:

```text
dist/electron
```

The package commands prepare a bundled local backend before packaging:

- Express server bundle with production dependencies
- Vite-built client assets
- MongoDB server binary for the current host OS/architecture

The first packaging run may take longer because it downloads the MongoDB binary.

### Run with Docker

```bash
docker compose up --build
```

Open:

```text
http://localhost:3400
```

## First 3 minutes

1. Open MetaCells.
2. Create a workbook.
3. Open `Settings`.
4. Add an AI provider.

Supported providers:

- OpenAI
- Groq
- DeepSeek
- OpenRouter
- Ollama
- LM Studio
- Together
- Fireworks
- xAI

The Settings page includes:

- AI provider configuration
- communication channel setup and testing
- job/worker controls
- general and advanced runtime settings

In the Electron app, Settings is also available from the native application menu.
