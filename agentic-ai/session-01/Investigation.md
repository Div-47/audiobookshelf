# Session 01 — Investigation

## Objective

The first session established the architecture and migration strategy for the large-scale JavaScript-to-TypeScript rewrite. No production source files or project configuration were changed.

## Architecture

The backend is a CommonJS Node.js application centred around `server/Server.js`. It contains controllers, managers, database models, scanners, utilities, providers, authentication, background jobs, filesystem watching, and Socket.IO communication.

The scanner subsystem is particularly interconnected. Library scans flow through `LibraryScanner`, `scandir`, `LibraryItemScanData`, `LibraryItemScanner`, and the book, podcast, and audio-file scanners. These components combine filesystem traversal, metadata parsing, database reconciliation, incremental changes, cancellation, and watcher events.

## Main Risks

The agent identified several risks for a large-scale migration:

* Dynamic runtime data from Sequelize, filesystem operations, metadata parsers, ffprobe, and HTTP requests.
* Highly shared utilities, models, globals, and database code.
* Scanner side effects involving filesystem, database, watcher, task, and socket behaviour.
* Maintaining CommonJS module and build compatibility.
* Vendored code under `server/libs`, which should generally remain outside the application migration.
* Limited coverage in some areas, particularly scanner behaviour.

## Migration Strategy

The recommended migration order is:

1. Establish patterns with small typed utilities and data shapes.
2. Migrate the filesystem scan boundary, particularly `scandir` and `LibraryItemScanData`.
3. Migrate the per-item scanner pipeline.
4. Migrate library scan orchestration.
5. Migrate database and model groups.
6. Migrate managers and finders.
7. Migrate authentication, routers, and controllers.
8. Finish remaining application and server composition modules.

The scanner subsystem was identified as a strong target because it is substantial and interconnected while still allowing the migration to progress through identifiable boundaries.

## Verification

Each stage will be verified using focused tests, the server build, linting, and eventually the full test suite. Scanner migration will require additional regression coverage for scan results, incremental changes, cancellation, and book-versus-podcast behaviour.

## Outcome

Session 01 produced a migration strategy without modifying production code. The next stage will begin the actual migration at the filesystem scan boundary while preserving the existing CommonJS runtime behaviour.
