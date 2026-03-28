# Runtime Port Plan

## Current state

The `/vite` app already has:

- Vite + React shell
- SQLite-backed server and RPC transport
- workbook storage and formula engine copies
- a legacy DOM-driven spreadsheet runtime under `vite/imports/ui/metacell/runtime`

The root app contains the newer runtime implementation with:

- split bootstrap and app methods
- resolver-based grid access
- viewport row windowing and mounted-row iteration
- React-driven overlay rendering
- newer selection/editor/formula bar behavior
- newer clipboard/fill/mention behavior

This means the migration target is **not** "replace `/vite` with the root app".
The correct target is: **keep `/vite` as the host platform and replace its legacy workbook runtime with the current runtime slices**.

## Key finding

The root runtime has many modules that do not exist in `/vite` yet.

Present in root only:

- `app-bootstrap-init-runtime.js`
- `app-bootstrap-runtime.js`
- `app-bootstrap-setup-runtime.js`
- `app-cleanup-runtime.js`
- `app-dom-runtime.js`
- `app-methods-*.js`
- `cell-content-renderer.js`
- `cell-content-store.js`
- `cell-render-model.js`
- `compute-layout-runtime.js`
- `compute-render-runtime.js`
- `compute-support-runtime.js`
- `dependency-visual-runtime.js`
- `dom-cell-resolver-runtime.js`
- `editing-session-runtime.js`
- `editor-controller-runtime.js`
- `editor-overlay-runtime.js`
- `formula-bar-runtime.js`
- `formula-mention-runtime.js`
- `grid-capacity-runtime.js`
- `grid-cell-runtime.js`
- `grid-focus-runtime.js`
- `grid-navigation-runtime.js`
- `grid-render-runtime.js`
- `grid-resize-runtime.js`
- `grid-size-runtime.js`
- `grid-surface-runtime.js`
- `grid-view-layout-runtime.js`
- `keyboard-cell-shell-runtime.js`
- `keyboard-focus-proxy-runtime.js`
- `keyboard-grid-runtime.js`
- `keyboard-menu-runtime.js`
- `keyboard-shortcuts-runtime.js`
- `mention-controller-runtime.js`
- `named-cell-jump-runtime.js`
- `selection-model.js`
- `selection-visual-runtime.js`
- `spill-model.js`
- `spill-runtime.js`
- `structure-edit-runtime.js`
- `structure-sort-runtime.js`
- `toolbar-actions-runtime.js`
- `toolbar-layout-runtime.js`
- `toolbar-popover-runtime.js`
- `toolbar-sync-runtime.js`
- `toolbar-wiring-runtime.js`
- `ui-snapshot-runtime.js`
- `viewport-render-runtime.js`
- `workbook-shell-model.js`
- `workbook-shell-runtime.js`
- `workbook-ui-store.js`

Present in `/vite` only:

- `editor-controls-runtime.js`
- `keyboard-context-runtime.js`

This confirms that `/vite` is still using the older monolithic runtime shape.

## Host boundaries to keep from `/vite`

Keep these as the platform shell for now:

- `vite/imports/ui/app/App.jsx`
- `vite/client/main.jsx`
- `vite/imports/ui/metacell/sheetDocStorage.js`
- `vite/lib/rpc-client.js`
- SQLite-backed server and RPC handlers

These files already define the right host:

- workbook load/save
- route handling
- settings fetching
- channel list wiring
- Vite entrypoint

## Migration strategy

Do not port file-by-file in arbitrary order.
Port by vertical slices with a compatibility layer.

### Slice 1: Runtime host split

Goal:

- make `/vite` runtime structurally match the root app
- keep existing UI working while changing internals

Port first:

- `app-bootstrap-runtime.js`
- `app-bootstrap-init-runtime.js`
- `app-bootstrap-setup-runtime.js`
- `app-cleanup-runtime.js`
- `app-dom-runtime.js`
- `app-methods-grid.js`
- `app-methods-selection.js`
- `app-methods-editor.js`
- `app-methods-recompute.js`
- `app-methods-workbook-ui.js`

Why first:

- the root app moved behavior out of `runtime/index.js` into smaller method installers
- without this split, later grid/editor/selection ports will turn into hand-merges

### Slice 2: New grid foundation

Goal:

- replace legacy grid construction and access with the current grid stack

Port next:

- `grid-surface-runtime.js`
- `grid-cell-runtime.js`
- `grid-manager.js`
- `grid-size-runtime.js`
- `grid-resize-runtime.js`
- `grid-navigation-runtime.js`
- `grid-focus-runtime.js`
- `grid-focus-helpers-runtime.js`
- `dom-cell-resolver-runtime.js`
- `grid-capacity-runtime.js`
- `grid-view-layout-runtime.js`

Why second:

- the current performance work depends on resolver-based access and mounted-row awareness
- the `/vite` grid is still the old `innerHTML` builder inside `grid-manager.js`

### Slice 3: Selection, editor, formula bar

Goal:

- restore current UX behavior on top of the new grid

Port next:

- `selection-model.js`
- `selection-runtime.js`
- `selection-visual-runtime.js`
- `editor-selection-runtime.js`
- `editing-session-runtime.js`
- `editor-controller-runtime.js`
- `editor-overlay-runtime.js`
- `formula-bar-runtime.js`
- `formula-mention-runtime.js`
- `mention-controller-runtime.js`
- `keyboard-grid-runtime.js`
- `keyboard-cell-shell-runtime.js`
- `keyboard-focus-proxy-runtime.js`
- `keyboard-menu-runtime.js`
- `keyboard-shortcuts-runtime.js`

Why third:

- this is where most of the current interaction fixes live
- dragging, fill handle, formula bar, mentions, clipboard and focus all depend on this layer

### Slice 4: Render and compute pipeline

Goal:

- move `/vite` off the legacy full-scan render path

Port next:

- `cell-render-model.js`
- `grid-render-runtime.js`
- `compute-support-runtime.js`
- `compute-render-runtime.js`
- `compute-layout-runtime.js`
- `compute-runtime.js`
- `spill-model.js`
- `spill-runtime.js`
- `ui-snapshot-runtime.js`
- `viewport-render-runtime.js`

Why fourth:

- this is where dirty-row rendering, formatter caching and viewport-aware behavior now live

### Slice 5: Workbook shell and React overlays

Goal:

- replace remaining legacy shell behavior while preserving the `/vite` host app

Port next:

- `workbook-ui-store.js`
- `workbook-shell-model.js`
- `workbook-shell-runtime.js`
- `WorkbookOverlays.jsx`
- `WorkbookPanels.jsx`
- other workbook shell React components that depend on the new UI store

Why fifth:

- `/vite` already has a React shell, so these can be integrated after runtime internals are stable

## First concrete code move

The first implementation step should be:

1. create the split runtime host in `/vite`
2. keep `vite/imports/ui/app/App.jsx` and `vite/imports/ui/metacell/sheetDocStorage.js` unchanged
3. replace the body of `vite/imports/ui/metacell/runtime/index.js` with the root app structure based on installed method modules
4. wire any `/vite`-specific RPC calls back in through the host layer

Reason:

- it minimizes merge noise later
- it gives a stable place to plug in root modules one slice at a time
- it avoids mixing new grid code into the old monolithic runtime entry

## Compatibility rules

During the port:

- keep `/vite` RPC and SQLite storage semantics
- do not port Meteor imports
- do not port server transport assumptions from the root app
- do not try to preserve the old `/vite` grid internals once the new grid slice lands
- prefer copying root modules with minimal edits, then adapt imports and host hooks

## Short-term recommendation

Start with **Slice 1 only**.

Do not attempt grid or viewport migration before the `/vite` runtime is split into:

- bootstrap
- cleanup
- app methods
- UI state collection

Once Slice 1 is in place, Slice 2 and Slice 3 become mechanical ports instead of architectural rewrites.
