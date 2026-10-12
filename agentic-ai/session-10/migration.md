Continue Workflow B, but increase the migration scope for this session.

The migration has now established a typed scanner foundation:

* `server/utils/scandir.ts`
* `server/scanner/LibraryItemScanData.ts`
* `server/scanner/LibraryScan.ts`
* `server/scanner/ScanLogger.ts`
* `server/scanner/LibraryItemScanner.ts`
* `server/scanner/LibraryScanner.ts`
* `server/scanner/AudioFileScanner.ts`
* `server/scanner/BookScanner.ts`
* `server/scanner/PodcastScanner.ts`
* `server/scanner/AbsMetadataFileScanner.ts`

We now need to increase the migration rate. Do NOT continue migrating only one file at a time.

### Objective

Identify and migrate a **larger cohesive group of related backend JavaScript files**, ideally around 5–10 production files, continuing outward from the scanner/metadata subsystem.

Start by inspecting the current scanner dependency graph and identify the next connected boundary that can reasonably be migrated as one batch.

Prioritise files related to:

* NFO/file-based metadata scanning
* book metadata parsing
* podcast metadata parsing
* scanner utilities
* scanner data structures
* closely related filesystem/metadata helpers

Do not choose unrelated files simply to increase the file count.

### Migration requirements

For the selected batch:

1. Inspect callers, dependencies, exports and actual runtime data flow before changing files.
2. Migrate the whole selected cohesive group from `.js` to `.ts`.
3. Preserve existing CommonJS runtime behaviour and public/caller-facing APIs.
4. Reuse the TypeScript types already introduced in the scanner subsystem.
5. Introduce meaningful types at boundaries instead of using broad `any`.
6. Keep existing behaviour unchanged. This is a JavaScript → TypeScript migration, not a redesign.
7. Keep already-migrated scanner files compatible with the newly migrated files.
8. Do not migrate unrelated database, provider, controller, router or server-composition code just because it is encountered as a dependency.
9. Do not change TypeScript configuration, build architecture, module system, or project-wide tooling unless absolutely required for compilation.
10. Do not weaken, delete, or rewrite existing tests merely to make the migration pass.

### Testing

Add or extend focused tests where the selected files lack meaningful coverage.

Tests should verify important existing behaviour and integration between the migrated files, rather than merely checking that functions execute.

After the batch migration, run:

* focused tests for the migrated subsystem
* relevant existing scanner tests
* `npm run build:server`
* `npm run lint`
* `npm test`
* `npm run coverage`
* `git diff --check`

If a test fails because of a fixture/environment assumption, fix the fixture rather than changing production behaviour.

If the TypeScript compiler exposes missing type information at boundaries, fix those types properly. Do not solve the problem by broadly adding `any`.

### Important scope rule

The goal of this session is to **increase the scale of the rewrite**.

Do not stop after migrating the first file if several closely related files can safely be migrated together. Aim for approximately **5–10 production files** in this session, but prioritise architectural coherence and correctness over hitting an arbitrary number.

If the first candidate reveals that a larger connected group is unsafe to migrate together, explain why and select the next coherent group instead.

At the end, report:

* which production files were migrated
* which tests were added/changed
* how the migrated files connect to the existing TypeScript scanner layer
* number of focused/relevant/full tests passing
* build/lint/coverage results
* overall coverage change
* any problems encountered and how they were resolved
* any files deliberately left as JavaScript and why
* the recommended next migration boundary

Do not spend time on Git commits, pushing, documentation, or report writing. Focus on the actual system-wide migration and verification.
