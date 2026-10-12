Continue Workflow B from the completed scanner migrations.

The scanner subsystem currently includes these migrated TypeScript components:

* `server/utils/scandir.ts`
* `server/scanner/LibraryItemScanData.ts`
* `server/scanner/LibraryScan.ts`
* `server/scanner/ScanLogger.ts`
* `server/scanner/LibraryItemScanner.ts`
* `server/scanner/LibraryScanner.ts`
* `server/scanner/AudioFileScanner.ts`
* `server/scanner/BookScanner.ts`

## Task

Migrate `server/scanner/PodcastScanner.js` to TypeScript.

This should complete the main media-specific scanner layer.

Before editing, inspect its callers and dependencies, especially its relationship with the already typed `AudioFileScanner` and the existing `LibraryItemScanner`.

## Requirements

* Preserve existing runtime behaviour.
* Preserve the CommonJS singleton export and caller-facing API.
* Reuse the existing scanner types where appropriate.
* Introduce meaningful types for podcast metadata, episodes, audio files, feeds, chapters, scan input, scan results, and other actual data boundaries.
* Avoid broad `any` where the shape can reasonably be determined.
* Do not migrate unrelated providers, models, managers, or utilities.
* Do not redesign the scanner architecture.
* Do not weaken or remove existing tests.
* Add focused tests where useful.
* Do not change TypeScript configuration unless technically necessary.

Pay particular attention to:

* interaction with `AudioFileScanner`
* podcast/episode metadata
* feed information
* audio files and chapters
* optional and nullable metadata
* database/model values
* error handling
* return values consumed by `LibraryItemScanner`
* CommonJS compatibility

## Verification

Run:

1. Focused PodcastScanner tests
2. Relevant scanner tests
3. `npm run build:server`
4. `npm run lint`
5. `npm test`
6. `npm run coverage`

Preserve existing behaviour when tests expose filesystem or global-setting preconditions; prefer correcting the test fixture rather than changing production behaviour.

At the end, briefly report:

* files migrated or changed
* important types/design decisions
* how PodcastScanner integrates with the typed AudioFileScanner
* tests added/updated
* verification results
* problems encountered
* recommended next migration boundary

Keep the focus on the large-scale JavaScript-to-TypeScript migration. Do not spend time on Git operations or documentation.
