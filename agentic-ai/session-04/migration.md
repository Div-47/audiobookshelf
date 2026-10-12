Continue Workflow B from the completed scanner migrations.

Current TypeScript scanner boundaries:

* `server/utils/scandir.ts`
* `server/scanner/LibraryItemScanData.ts`
* `server/scanner/LibraryScan.ts`
* `server/scanner/ScanLogger.ts`

## Task

Migrate `server/scanner/LibraryItemScanner.js` to TypeScript.

This is the next major scanner boundary because `LibraryItemScanner` coordinates the scan data and lifecycle state with the downstream book, podcast, and audio scanners.

Before editing, inspect its callers and dependencies so the migration preserves the existing architecture.

## Requirements

* Preserve all existing runtime behaviour.
* Preserve CommonJS compatibility and existing import/require behaviour.
* Use meaningful TypeScript types based on the actual data flowing through the scanner.
* Reuse the types already established in `LibraryItemScanData.ts`, `LibraryScan.ts`, and `ScanLogger.ts`.
* Avoid broad `any` types where the actual shape can reasonably be determined.
* Do not migrate the downstream BookScanner, PodcastScanner, or AudioFileScanner yet unless a tiny compatibility change is genuinely required.
* Do not change unrelated production code.
* Do not weaken or remove tests.
* Add focused tests only where they provide useful coverage for the migrated coordinator.
* Do not change TypeScript configuration unless technically necessary.

Pay particular attention to:

* scanner lifecycle and cancellation
* interaction with `LibraryItemScanData`
* interaction with `LibraryScan` and `ScanLogger`
* book versus podcast handling
* downstream scanner calls
* error handling and partial failures
* database/model values passed through the coordinator
* CommonJS module boundaries

## Verification

Run:

1. Focused scanner tests
2. `npm run build:server`
3. `npm run lint`
4. `npm test`
5. `npm run coverage`

If something fails, investigate whether it is a migration problem or an existing project precondition before changing production behaviour.

At the end, report briefly:

* files changed
* important types/design decisions
* how the existing scanner boundaries were reused
* tests added/updated
* verification results
* any problems encountered
* what should be migrated next

Keep the focus on the large-scale scanner migration. Do not spend time on Git operations or documentation.
