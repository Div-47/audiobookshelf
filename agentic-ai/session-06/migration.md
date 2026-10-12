Continue Workflow B from the completed scanner migrations.

The main library scanning coordination path is now TypeScript:

* `server/utils/scandir.ts`
* `server/scanner/LibraryItemScanData.ts`
* `server/scanner/LibraryScan.ts`
* `server/scanner/ScanLogger.ts`
* `server/scanner/LibraryItemScanner.ts`
* `server/scanner/LibraryScanner.ts`

## Task

Migrate `server/scanner/AudioFileScanner.js` to TypeScript.

This module is shared by both book and podcast scanning, so first inspect its callers and the data passed into and returned from it.

The goal is to move a shared downstream scanner component into TypeScript while keeping the existing JavaScript BookScanner and PodcastScanner compatible with it.

## Requirements

* Preserve existing runtime behaviour.
* Preserve CommonJS exports and existing callers.
* Keep `BookScanner.js` and `PodcastScanner.js` unchanged unless a minimal compatibility adjustment is genuinely required.
* Reuse the existing scanner types where appropriate.
* Introduce meaningful types for audio file metadata, scan results, filesystem/file information, and downstream values actually used by the module.
* Avoid broad `any` where the actual shape can reasonably be determined.
* Do not redesign the scanner architecture.
* Do not change unrelated production code.
* Do not weaken or remove existing tests.
* Add focused tests where useful.
* Do not change TypeScript configuration unless technically necessary.

Pay particular attention to:

* how BookScanner and PodcastScanner call AudioFileScanner
* audio metadata and ffprobe-related values
* file paths and file information
* database/model values
* error handling
* optional and nullable metadata
* return values consumed by the callers
* CommonJS compatibility

## Verification

Run:

1. Focused scanner tests
2. `npm run build:server`
3. `npm run lint`
4. `npm test`
5. `npm run coverage`

If failures occur, distinguish migration problems from existing project behaviour or test/environment assumptions before making changes.

At the end, briefly report:

* files migrated or changed
* important types and boundary decisions
* how both BookScanner and PodcastScanner remain compatible
* tests added/updated
* verification results
* problems encountered
* recommended next migration boundary

Keep the focus on the large-scale JavaScript-to-TypeScript migration. Do not spend time on Git operations or documentation.
