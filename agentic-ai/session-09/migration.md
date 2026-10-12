Continue Workflow B from the completed scanner migrations.

The main scanner/media path is now substantially migrated to TypeScript:

* `server/utils/scandir.ts`
* `server/scanner/LibraryItemScanData.ts`
* `server/scanner/LibraryScan.ts`
* `server/scanner/ScanLogger.ts`
* `server/scanner/LibraryItemScanner.ts`
* `server/scanner/LibraryScanner.ts`
* `server/scanner/AudioFileScanner.ts`
* `server/scanner/BookScanner.ts`
* `server/scanner/PodcastScanner.ts`

## Task

Migrate `server/scanner/AbsMetadataFileScanner.js` to TypeScript.

This is a shared boundary used by both BookScanner and PodcastScanner for applying `metadata.json` overrides, so inspect both callers and the scanner's actual data flow before editing.

The goal is to migrate this shared metadata-processing component while keeping both already-migrated media scanners compatible.

## Requirements

* Preserve existing runtime behaviour.
* Preserve CommonJS exports and caller-facing API.
* Reuse existing TypeScript types where appropriate.
* Introduce meaningful types for metadata override input, parsed metadata, files, paths, and returned values based on the actual implementation.
* Avoid broad `any` where the shape can reasonably be determined.
* Keep BookScanner and PodcastScanner behaviour unchanged.
* Do not migrate unrelated metadata providers or database components.
* Do not redesign the metadata system.
* Do not weaken or remove existing tests.
* Add focused tests where useful.
* Do not change TypeScript configuration unless genuinely required.

Pay particular attention to:

* how BookScanner uses metadata overrides
* how PodcastScanner uses metadata overrides
* optional and nullable metadata fields
* JSON parsing and invalid metadata handling
* file/path handling
* metadata precedence and merge behaviour
* CommonJS compatibility
* return values consumed by the two media scanners

## Verification

Run:

1. Focused AbsMetadataFileScanner tests
2. Relevant BookScanner and PodcastScanner tests
3. `npm run build:server`
4. `npm run lint`
5. `npm test`
6. `npm run coverage`

If tests expose existing global settings, filesystem assumptions, or other project preconditions, preserve production behaviour and correct the test fixture where appropriate.

At the end, briefly report:

* files migrated or changed
* important types/design decisions
* how the shared component integrates with BookScanner and PodcastScanner
* tests added/updated
* verification results
* problems encountered
* recommended next migration boundary

Keep the focus on the large-scale JavaScript-to-TypeScript migration. Do not spend time on Git operations or documentation.
