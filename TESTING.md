# Testing

This UI exposes stable `data-*` attributes for E2E tests around workbook tabs, cells, and selection overlays.

## Tabs

Each footer tab button has:

- `data-testid="workbook-tab"`
- `data-sheet-id="<sheet id>"`
- `data-sheet-name="<visible tab name>"`
- `data-tab-type="sheet|report"`
- `data-active="true|false"`

Examples:

```css
[data-testid="workbook-tab"][data-sheet-name="Sheet 2"]
[data-testid="workbook-tab"][data-sheet-id="sheet-2"]
[data-testid="workbook-tab"][data-tab-type="report"][data-active="true"]
```

The footer root also exposes workbook-level state:

- `data-workbook-visible-sheet`
- `data-workbook-tab-count`
- `data-workbook-report-active`

## Cells

Each rendered grid cell exposes stable attributes on three elements:

- cell container: `data-testid="grid-cell"`
- anchor input: `data-testid="grid-cell-input"`
- focus proxy: `data-testid="grid-cell-focus-proxy"`

All three expose:

- `data-cell-id="B1"`
- `data-sheet-id="<sheet id>"`

Examples:

```css
[data-testid="grid-cell"][data-sheet-id="sheet-2"][data-cell-id="B1"]
[data-testid="grid-cell-input"][data-sheet-id="sheet-2"][data-cell-id="B1"]
[data-testid="grid-cell-focus-proxy"][data-sheet-id="sheet-2"][data-cell-id="B1"]
```

Notes:

- `#B1` still works as a selector for the active sheet because the anchor input keeps its `id`.
- For cross-sheet tests, prefer `data-sheet-id` + `data-cell-id` over `#B1`.

## Active Cell And Range

Selection overlays expose stable identifiers.

Active-cell overlay:

- `data-testid="selection-active"`
- `data-selection-sheet-id="<sheet id>"`
- `data-active-cell-id="B1"`

Range overlay:

- `data-testid="selection-range"`
- `data-selection-sheet-id="<sheet id>"`
- `data-selection-start-cell-id="A2"`
- `data-selection-end-cell-id="B4"`

Examples:

```css
[data-testid="selection-active"][data-selection-sheet-id="sheet-2"][data-active-cell-id="B1"]
[data-testid="selection-range"][data-selection-sheet-id="sheet-2"][data-selection-start-cell-id="A2"][data-selection-end-cell-id="B4"]
```

## Toolbar And Formula Bar

The main toolbar and formula bar expose stable selectors for common controls.

Main row:

- `data-testid="workbook-name-input"`
- `data-testid="named-cell-input"`
- `data-testid="named-cell-jump-button"`
- `data-testid="named-cell-jump-option"`
- `data-testid="formula-input"`
- `data-testid="ai-mode-button"`
- `data-testid="ai-mode-option"`
- `data-testid="display-mode-button"`
- `data-testid="display-mode-option"`
- `data-testid="update-ai-button"`
- `data-testid="help-button"`
- `data-testid="attach-file-input"`
- `data-testid="server-push-indicator"`
- `data-testid="surface-status"`

Format row:

- `data-testid="toolbar-undo-button"`
- `data-testid="toolbar-redo-button"`
- `data-testid="cell-format-button"`
- `data-testid="cell-format-option"`
- `data-testid="cell-decimals-decrease-button"`
- `data-testid="cell-decimals-increase-button"`
- `data-testid="cell-align-button"`
- `data-testid="cell-borders-button"`
- `data-testid="cell-borders-option"`
- `data-testid="cell-bg-color-button"`
- `data-testid="cell-bg-color-option"`
- `data-testid="cell-bg-color-custom-input"`
- `data-testid="cell-font-size-decrease-button"`
- `data-testid="cell-font-family-button"`
- `data-testid="cell-font-family-option"`
- `data-testid="cell-font-size-increase-button"`
- `data-testid="cell-wrap-button"`
- `data-testid="cell-bold-button"`
- `data-testid="cell-italic-button"`
- `data-testid="bind-channel-mode-select"`
- `data-testid="bind-channel-select"`
- `data-testid="attach-file-button"`
- `data-testid="assistant-chat-button"`
- `data-testid="formula-tracker-button"`
- `data-testid="record-region-button"`
- `data-testid="download-region-recording-button"`

Tab controls:

- `data-testid="add-tab-button"`
- `data-testid="delete-tab-button"`

Examples:

```css
[data-testid="named-cell-input"]
[data-testid="formula-input"]
[data-testid="assistant-chat-button"]
[data-testid="delete-tab-button"]
[data-testid="surface-status"][data-surface-status="ready"]
```

Surface status attributes:

- `data-surface-scope="sheet|report"`
- `data-surface-status="ready|processing"`
- `data-surface-processing="true|false"`

Example:

```css
[data-testid="surface-status"][data-surface-scope="sheet"][data-surface-status="ready"]
[data-testid="surface-status"][data-surface-scope="report"][data-surface-status="processing"]
```

## Row And Column Headers

Grid headers expose stable attributes for row/column targeting.

- column header: `data-testid="grid-column-header"`
- row header: `data-testid="grid-row-header"`
- top-left corner: `data-testid="grid-corner-header"`
- column resize handle: `data-testid="grid-column-resize-handle"`
- row resize handle: `data-testid="grid-row-resize-handle"`

Header attributes:

- column header: `data-col-index`, `data-col-label`
- row header: `data-row-index`

Examples:

```css
[data-testid="grid-column-header"][data-col-label="B"]
[data-testid="grid-row-header"][data-row-index="4"]
[data-testid="grid-column-resize-handle"][data-col-index="2"]
[data-testid="grid-row-resize-handle"][data-row-index="4"]
```

## Recommended Playwright Patterns

Select a sheet tab:

```ts
await page.locator('[data-testid="workbook-tab"][data-sheet-name="Sheet 2"]').click();
```

Select cell `B1` on `Sheet 2`:

```ts
await page
  .locator('[data-testid="grid-cell-focus-proxy"][data-sheet-id="sheet-2"][data-cell-id="B1"]')
  .click();
```

Assert active cell:

```ts
await expect(
  page.locator('[data-testid="selection-active"][data-selection-sheet-id="sheet-2"][data-active-cell-id="B1"]'),
).toBeVisible();
```

Assert selected range `A2:B4`:

```ts
await expect(
  page.locator('[data-testid="selection-range"][data-selection-sheet-id="sheet-2"][data-selection-start-cell-id="A2"][data-selection-end-cell-id="B4"]'),
).toBeVisible();
```

Wait until sheet processing finishes:

```ts
await expect(
  page.locator('[data-testid="surface-status"][data-surface-scope="sheet"][data-surface-status="ready"]'),
).toBeVisible();
```

Wait until report processing finishes:

```ts
await expect(
  page.locator('[data-testid="surface-status"][data-surface-scope="report"][data-surface-status="ready"]'),
).toBeVisible();
```

## Guidance

- Prefer `data-sheet-id` and `data-cell-id` for tests that move between tabs.
- Prefer overlay selectors for asserting current selection state.
- Prefer tab `data-sheet-id` for stability if sheet names can be renamed by the user.
- Prefer `data-testid` on toolbar controls instead of icon/title text.
