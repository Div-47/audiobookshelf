Continue Workflow B from the completed scanner migrations.

The scanner subsystem now has these TypeScript boundaries:

* `server/utils/scandir.ts`
* `server/scanner/LibraryItemScanData.ts`
* `server/scanner/LibraryScan.ts`
* `server/scanner/ScanLogger.ts`
* `server/scanner/LibraryItemScanner.ts`

The next goal is to migrate the higher-level scanner coordinator.

## Task

Migrate `server/scanner/LibraryScanner.js` to TypeScript.

Before editing, inspect its callers and dependencies so the migration fits the existing scanner architecture.

This should complete the main library-level scanner coordination layer while keeping the downstream scanners unchanged for now.

## Requirements

* Preserve existing behaviour.
* Preserve CommonJS exports and existing callers.
* Reuse the types already established by the migrated scanner modules.
* Add meaningful types for library records, scan configuration, scanner state, filesystem results, and values passed to `LibraryItemScanner`.
* Avoid broad `any` where the actual type can reasonably be determined.
* Keep `BookScanner`, `PodcastScanner`, and `AudioFileScanner` in JavaScript for this session.
* Do not refactor the scanner architecture.
* Do not change unrelated production code.
* Do not weaken or remove existing tests.
* Add focused tests where useful.
* Do not modify TypeScript configuration unless genuinely required.

Pay particular attention to:

* full-library scan lifecycle
* interaction with `LibraryScan`
* interaction with `LibraryItemScanData`
* calls to `LibraryItemScanner`
* scan cancellation and errors
* filesystem watcher/incremental scan behaviour
* library and folder configuration
* database updates
* logging
* existing CommonJS module boundaries

## Verification

Run:

1. Focused scanner tests
2. `npm run build:server`
3. `npm run lint`
4. `npm test`
5. `npm run coverage`

If a test or build failure occurs, determine whether it is caused by the migration or by an existing project precondition before changing production behaviour.

At the end, report briefly:

* files changed
* important types/design decisions
* how `LibraryScanner` connects the migrated scanner layers
* tests added/updated
* verification results
* problems encountered
* recommended next migration boundary

Keep the focus on the system-wide JavaScript-to-TypeScript migration. Do not spend time on Git operations or documentation.
