# Workbook Test Framework

This project includes a file-based integration test framework for workbook scenarios.

It is designed for cases where plain unit tests are not enough:

- multi-sheet recalculation
- named cell relinking
- AI chains
- attachment-backed prompts
- report tabs that live in the same workbook
- race-prone scenarios where one cell changes, async recalculation starts, and another dependent cell can break during the chain

The framework reads workbook specs from `tests/workbook-specs/**/*.workbook-test.json`.

## What It Tests

Each workbook spec describes:

- the workbook structure
- tabs and report tabs
- cells and named cells
- file-backed cells via relative local file paths
- mocked AI responses
- test scenarios with ordered steps

Each scenario runs against a fresh workbook document inside the backend test environment.

## Spec File Format

Top-level shape:

```json
{
  "name": "Human readable workbook name",
  "workbook": {
    "activeTabId": "sheet-1",
    "aiMode": "auto",
    "namedCells": {
      "base_value": { "sheetId": "sheet-1", "cellId": "A1" },
      "prices": {
        "sheetId": "sheet-2",
        "startCellId": "B2",
        "endCellId": "D5"
      }
    },
    "tabs": [
      {
        "id": "sheet-1",
        "name": "Main",
        "type": "sheet",
        "cells": [
          { "address": "A1", "value": "2" },
          { "address": "B1", "formula": "=@A1+3" }
        ]
      },
      {
        "id": "report-1",
        "name": "Report",
        "type": "report",
        "reportContent": "# Summary"
      }
    ]
  },
  "aiMocks": [
    {
      "match": { "prompt": "exact final prompt text" },
      "response": "mocked AI answer",
      "delayMs": 50
    },
    {
      "match": { "includes": "substring from final prompt" },
      "response": "another answer"
    }
  ],
  "tests": [
    {
      "name": "Scenario name",
      "steps": [
        { "expect": { "target": "B1", "value": "5", "state": "resolved" } },
        { "set": { "target": "A1", "value": "7" } },
        { "waitMs": 200 },
        { "expect": { "target": "B1", "value": "10" } }
      ]
    }
  ]
}
```

## Workbook Description

### `workbook.activeTabId`

The initial active tab. If omitted, the first sheet tab is used.

### `workbook.aiMode`

Optional. `auto` by default.

### `workbook.namedCells`

Optional explicit named refs.

Supported forms:

```json
{ "sheetId": "sheet-1", "cellId": "J7" }
```

or:

```json
{
  "sheetId": "sheet-1",
  "startCellId": "A2",
  "endCellId": "C5"
}
```

### `workbook.tabs`

Workbook tabs. Each tab must have:

- `id`
- `name`
- `type`: `sheet` or `report`

#### Sheet tabs

Sheet tabs may include `cells`.

Each cell supports:

- `address`: cell id like `A1`
- `value`: raw non-formula source
- `formula`: raw formula source such as `=SUM(A1:A3)` or `'prompt @A1`
- `source`: full raw source if you want to bypass `value` / `formula`
- `name`: optional shortcut for creating a single-cell named ref
- `file`: relative path to a local file
- `mimeType`: optional MIME type override
- `fileName`: optional attachment display name override
- `fileEncoding`: optional `base64`; otherwise files are read as UTF-8 text

If `file` is present, the framework creates an attachment cell source automatically.

Example:

```json
{
  "address": "A1",
  "name": "policy_file",
  "file": "./fixtures/policy.txt",
  "mimeType": "text/plain"
}
```

#### Report tabs

Report tabs use:

- `reportContent`

Example:

```json
{
  "id": "report-1",
  "name": "Report",
  "type": "report",
  "reportContent": "# Weekly report"
}
```

## AI Mocks

`aiMocks` replaces outbound provider fetches during a scenario.

Each entry supports:

- `match.prompt`: exact final user prompt
- `match.includes`: substring match against the final user prompt
- `delayMs`: optional artificial delay
- `response`: mocked response text
- `error`: optional error message instead of a successful response
- `status`: optional HTTP status for error responses

The match runs against the final resolved prompt after mentions have been expanded.

## Test Steps

### `set`

Change a cell by address or name.

```json
{ "set": { "target": "A1", "value": "5" } }
```

Named target:

```json
{ "set": { "target": "seed", "value": "10" } }
```

Cross-sheet explicit target:

```json
{ "set": { "target": "Main!A1", "value": "8" } }
```

### `waitMs` / `waitSeconds`

Pause to let async recompute chains finish.

```json
{ "waitMs": 250 }
```

or:

```json
{ "waitSeconds": 1.5 }
```

Use this for cases where:

- several linked AI cells recompute in sequence
- a bug only appears while dependent cells are still pending
- a previous change triggers multiple async jobs

### `expect`

Cell assertion step.

Supported fields:

- `target`
- `sheetId` optional
- `value`
- `source`
- `state`
- `error`
- `contains`

Example:

```json
{
  "expect": {
    "target": "B4",
    "value": "eще-3",
    "state": "resolved"
  }
}
```

### `expectReport`

Report assertion step.

Supported fields:

- `reportTabId`
- `reportTabName`
- `content`
- `contains`

Example:

```json
{
  "expectReport": {
    "reportTabId": "report-1",
    "contains": "Policy report"
  }
}
```

## Target Resolution

`target` can be:

- a direct cell address: `B3`
- a named cell: `current_cash`
- a sheet-qualified address: `Sheet 1!B3`
- a quoted sheet-qualified address: `'My Sheet'!B3`

Named ranges are allowed in workbook definitions, but `set` and `expect` require a single cell target.

## Example Specs

### 1. Basic formula recalculation

See:

- `tests/workbook-specs/basic-recalc.workbook-test.json`

This example shows:

- named cell definition from a cell
- formula recomputation after `set`
- direct value assertions

### 2. Chained AI recomputation

See:

- `tests/workbook-specs/ai-chain.workbook-test.json`

This example shows:

- AI prompt cells that depend on each other
- mocked AI responses
- `waitMs` between changes and assertions
- validating that a change in an upstream cell propagates through the chain

### 3. Reports + local files

See:

- `tests/workbook-specs/report-and-files.workbook-test.json`
- `tests/workbook-specs/fixtures/policy.txt`

This example shows:

- report tab declaration
- local file attachment via relative path
- AI prompt referencing the file cell
- report content assertion

## Running The Framework

Run the normal full test suite:

```bash
npm test
```

Run the suite with workbook specs included using the dedicated script:

```bash
npm run test:workbooks
```

Filter workbook specs by path substring:

```bash
WORKBOOK_SPEC_FILTER=ai-chain npm run test:workbooks
```

Point the framework at another spec directory:

```bash
WORKBOOK_SPEC_DIR=tests/workbook-specs npm run test:workbooks
```

## Notes

- The framework runs inside the existing backend server test environment.
- Workbook spec tests are integration tests, not snapshot-only parsers.
- File attachments are loaded from disk at test runtime.
- AI responses are mocked through `fetch`, so no external provider call is required.
