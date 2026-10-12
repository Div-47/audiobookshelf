Continue Workflow B from the completed scanner migrations.

The scanner subsystem currently has these TypeScript components:

* `server/utils/scandir.ts`
* `server/scanner/LibraryItemScanData.ts`
* `server/scanner/LibraryScan.ts`
* `server/scanner/ScanLogger.ts`
* `server/scanner/LibraryItemScanner.ts`
* `server/scanner/LibraryScanner.ts`
* `server/scanner/AudioFileScanner.ts`

## Task

Migrate `server/scanner/BookScanner.js` to TypeScript.

Before editing, inspect its callers and dependencies and identify the important data boundaries.

This is a larger media-specific scanner, so keep the migration focused on `BookScanner` rather than expanding into unrelated metadata providers or other subsystems.

## Requirements

* Preserve existing runtime behaviour.
* Preserve the CommonJS singleton export and caller-facing API.
* Reuse the existing types from the migrated scanner modules, especially `AudioFileScanner`.
* Introduce meaningful types for book scan input, metadata, files/tracks, chapters, authors/series, and scan results where supported by the actual code.
* Avoid broad `any` where the data shape can reasonably be determined.
* Keep `PodcastScanner.js` unchanged for this session unless a minimal compatibility adjustment is genuinely required.
* Do not migrate unrelated metadata providers or database models.
* Do not redesign the scanner.
* Do not weaken or remove existing tests.
* Add focused tests where useful.
* Do not change TypeScript configuration unless technically necessary.

Pay particular attention to:

* calls to `AudioFileScanner`
* book metadata and optional fields
* authors and series handling
* chapters and tracks
* ebook and supplementary files
* filesystem values
* database/model interactions
* error and cancellation behaviour
* return values consumed by `LibraryItemScanner`
* CommonJS compatibility

## Verification

Run:

1. Focused BookScanner tests
2. `npm run build:server`
3. `npm run lint`
4. `npm test`
5. `npm run coverage`

If the incremental TypeScript build produces an internal `Debug Failure`, first verify whether a clean/nonincremental build succeeds and clear stale generated build state if necessary. Do not change TypeScript configuration merely to work around stale cache state.

If tests expose existing behaviour or filesystem assumptions, preserve production behaviour and fix the test fixture where appropriate.

At the end, briefly report:

* files migrated or changed
* important types and design decisions
* how `BookScanner` integrates with the typed `AudioFileScanner`
* tests added/updated
* verification results
* problems encountered
* recommended next migration boundary

Keep the focus on the large-scale JavaScript-to-TypeScript migration. Do not spend time on Git operations or documentation.
