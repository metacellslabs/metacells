# Node.js + SQLite Migration Checklist

Target migration:

- from `Meteor + Mongo`
- to `Node.js + SQLite + WebSockets`

Keep the existing React UI and Electron desktop shell. Replace the local backend architecture incrementally.

## 1. Introduce Backend Domain Interfaces

Description:
Create explicit service and repository interfaces for desktop-critical backend domains so feature code no longer depends directly on `Mongo.Collection`.

Scope:

- Add interfaces for:
- `WorkbookRepository`
- `SettingsRepository`
- `JobRepository`
- `ArtifactRepository`
- `ChannelEventRepository`
- Refactor new code paths to depend on interfaces, not Meteor collections

Acceptance criteria:

- New backend interfaces exist in a dedicated module
- No new feature logic imports `meteor/mongo` directly
- Existing behavior is unchanged

## 2. Inventory Meteor-Specific Server Dependencies

Description:
Document all current Meteor-specific backend coupling to support migration planning.

Scope:

- List all `Mongo.Collection` usages
- List Meteor methods and publications
- List places relying on Meteor reactivity
- List desktop-critical flows vs web-only flows

Acceptance criteria:

- A migration inventory document exists
- Each dependency is tagged by domain and migration priority

## 3. Create Local Node Backend Skeleton

Description:
Add a standalone local Node backend process structure for desktop use.

Scope:

- New backend entrypoint
- Config loading
- Structured logging
- Graceful startup and shutdown
- Health check endpoint or startup probe

Acceptance criteria:

- Backend starts independently from Meteor
- Electron can launch the process locally
- Logs are written to the app support directory

## 4. Add SQLite Integration and Migration Runner

Description:
Introduce SQLite as the new embedded local database.

Scope:

- Add SQLite library, preferably `better-sqlite3`
- Add migration runner
- Add `migrations` table
- Add DB path resolution under app data

Acceptance criteria:

- Backend initializes SQLite on startup
- SQL migrations run automatically
- Database file location is deterministic

## 5. Define WebSocket Protocol for Local Backend

Description:
Design the request-response and event protocol between frontend and local Node backend.

Scope:

- Define message envelope
- Define request, response, event, error, subscribe, unsubscribe shapes
- Version the protocol

Acceptance criteria:

- Protocol is documented
- Shared type definitions or schemas exist
- Protocol supports realtime workbook and job updates

## 6. Add Local WebSocket Server to Node Backend

Description:
Implement the runtime WebSocket layer in the new backend.

Scope:

- Start local WebSocket server
- Accept client connections from Electron frontend
- Basic request-response handling
- Connection lifecycle logging

Acceptance criteria:

- Frontend can connect to backend over WebSocket
- Ping and reconnect behavior is defined
- Basic request roundtrip works

## 7. Build Frontend Transport Layer for Node Backend

Description:
Add a frontend client module that talks to the local backend over WebSockets.

Scope:

- Request helper
- Event subscription helper
- Reconnect handling
- Error propagation

Acceptance criteria:

- React app can call backend through the transport layer
- No Meteor client API is required for the new path
- Transport is isolated behind one module

## 8. Add Mongo-Backed Adapters Behind New Interfaces

Description:
Keep current behavior while moving code behind repository abstractions.

Scope:

- Implement repository interfaces using current Meteor and Mongo data sources
- Wire desktop-critical flows to use repositories

Acceptance criteria:

- Existing app behavior is preserved
- Core domains can be accessed via interfaces instead of direct collection usage

## 9. Migrate Settings Domain to SQLite

Description:
Move app settings persistence from Meteor and Mongo to SQLite.

Scope:

- Add SQLite schema for settings
- Implement `SettingsRepositorySqlite`
- Add migration or import from the existing settings document

Acceptance criteria:

- Settings read and write through SQLite in local backend mode
- Existing settings are imported successfully
- UI behavior remains unchanged

## 10. Migrate Jobs and Job Logs to SQLite

Description:
Move job queue persistence and logs to SQLite.

Scope:

- Add `jobs` and `job_logs` schema
- Implement lease, heartbeat, and retry persistence
- Preserve recovery semantics after restart

Acceptance criteria:

- Jobs survive app restart
- Retry and recovery behavior still works
- Existing desktop workflows continue to function

## 11. Migrate Artifacts and File Metadata to SQLite

Description:
Move artifact metadata and attachment references to SQLite.

Scope:

- Add schema for artifacts and file records
- Implement repository and queries
- Preserve attachment resolution behavior

Acceptance criteria:

- Existing file-related workflows function in local backend mode
- Metadata persists without Mongo

## 12. Migrate Channel Events to SQLite

Description:
Move channel event persistence to SQLite.

Scope:

- Add channel events schema
- Implement repository
- Preserve lookup and filter behavior used by workbook logic

Acceptance criteria:

- Channel event history persists locally
- Existing prompt and context integrations still work

## 13. Design Workbook Persistence Model for SQLite

Description:
Choose and document how workbook, sheet, and cell state will be stored in SQLite.

Scope:

- Decide normalized vs snapshot vs hybrid storage
- Document indexing strategy
- Document migration path from Mongo documents

Acceptance criteria:

- Workbook storage model is approved
- Schema design covers current workbook features
- Performance considerations are documented

## 14. Implement Workbook and Sheet Persistence in SQLite

Description:
Move workbook and sheet persistence from Mongo to SQLite.

Scope:

- Add schema and repositories
- Implement load, save, and update operations
- Preserve workbook compute and dependency invalidation flow

Acceptance criteria:

- Workbooks open and save correctly in local backend mode
- Existing workbook behavior is preserved
- No Mongo dependency remains for workbook persistence

## 15. Replace Desktop Meteor APIs with Node Handlers

Description:
Reimplement desktop-used Meteor methods and publications as Node backend handlers.

Scope:

- Map Meteor operations to explicit backend commands
- Remove desktop reliance on Meteor method and publication transport

Acceptance criteria:

- Desktop flows work against Node backend APIs
- Meteor client APIs are no longer required for desktop mode

## 16. Add Realtime Event Push for Workbooks and Jobs

Description:
Use WebSockets for live updates instead of Meteor reactivity.

Scope:

- Emit workbook update events
- Emit job progress and completion events
- Update frontend state from backend events

Acceptance criteria:

- UI reflects backend changes in realtime
- Reconnect and resync behavior is defined and working

## 17. Build Mongo-to-SQLite Import Tool

Description:
Provide a one-time migration path for existing local desktop users.

Scope:

- Read existing Mongo-backed local data
- Write equivalent SQLite records
- Validate migrated entities

Acceptance criteria:

- Existing data can be imported successfully
- Import reports errors clearly
- Import can be run safely once

## 18. Remove Bundled Mongo from Desktop Packaging

Description:
Stop packaging and launching local `mongod` for desktop builds.

Scope:

- Remove `mongodb-memory-server-core` packaging step
- Remove Mongo manifest data
- Remove Mongo startup from Electron desktop flow

Acceptance criteria:

- Desktop app no longer bundles Mongo binary
- Package size drops materially
- Desktop app still starts with Node and SQLite backend

## 19. Remove Bundled Meteor Backend from Desktop Packaging

Description:
Stop packaging the Meteor server bundle for desktop builds.

Scope:

- Remove desktop dependency on bundled Meteor runtime
- Update Electron startup to launch only Node backend
- Keep web deployment unaffected for now

Acceptance criteria:

- Desktop app no longer bundles Meteor server
- Desktop packaging is simpler and smaller
- Desktop startup uses only Node and SQLite backend

## 20. Enterprise Hardening for Local Backend

Description:
Prepare the local backend architecture for corporate distribution and review.

Scope:

- Bind backend to localhost only or use IPC where appropriate
- Document storage paths
- Add backup and export documentation
- Add log rotation
- Review code-signing and notarization impact

Acceptance criteria:

- Local backend security posture is documented
- Storage and logging paths are deterministic
- Enterprise review concerns are addressed

## 21. Update Desktop Architecture Documentation

Description:
Document the new Node + SQLite + WebSocket desktop architecture.

Scope:

- Add architecture diagram
- Add startup sequence
- Add data flow docs
- Add migration notes for contributors

Acceptance criteria:

- Documentation is sufficient for a new contributor to understand the desktop runtime
- Meteor vs Node responsibilities are clearly described

## 22. Remove Dead Meteor and Mongo Desktop Code Paths

Description:
Clean up unused desktop-only Meteor and Mongo code after migration is complete.

Scope:

- Remove obsolete packaging code
- Remove unused runtime manifest fields
- Remove desktop-only Mongo startup code
- Remove dead adapters if no longer needed

Acceptance criteria:

- Desktop no longer depends on Mongo or Meteor runtime paths
- Dead code is removed without breaking web mode
