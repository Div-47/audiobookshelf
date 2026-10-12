Continue Workflow B from Session 02.

The filesystem scan boundary is now migrated and verified:

* `server/utils/scandir.ts`
* `server/scanner/LibraryItemScanData.ts`

The next goal is to continue deeper into the scanner subsystem while keeping the migration incremental.

## Task

Inspect the scanner state/orchestration layer and identify the next coherent production boundary to migrate.

In particular, investigate:

* `server/scanner/LibraryScan.js`
* related scan-state or scan-logging code
* how these modules interact with the already migrated `scandir` and `LibraryItemScanData`
* how they are used by `LibraryScanner` and other callers

Choose the smallest **meaningful interconnected boundary** that moves the system further toward a TypeScript scanner subsystem.

Do not blindly migrate every related file. Use the actual dependency relationships to decide the scope.

## Requirements

* Preserve existing behaviour.
* Preserve CommonJS exports and runtime compatibility.
* Use meaningful TypeScript types.
* Avoid unnecessary `any`.
* Do not weaken or remove existing tests.
* Add focused tests where needed to protect the migrated boundary.
* Do not modify unrelated parts of the application.
* Do not change TypeScript configuration unless there is a genuine technical requirement.

## Verification

After the migration:

1. Run focused tests for the changed scanner area.
2. Run `npm run build:server`.
3. Run `npm run lint`.
4. Run `npm test`.
5. Run `npm run coverage`.

If a failure occurs, investigate and fix it while preserving existing behaviour.

Do not move to another subsystem during this session.

At the end, briefly report:

* which files were migrated
* why this boundary was selected
* important types or design decisions
* tests added/updated
* build/test/lint/coverage results
* problems encountered and how they were resolved
* what scanner component should be migrated next

Keep the focus on continuing the large-scale scanner migration, not documentation or Git operations.
