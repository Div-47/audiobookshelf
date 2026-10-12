Continue Workflow B with a larger migration batch.

The previous session successfully migrated five connected scanner/parser files in one pass. The current TypeScript migration now covers the main scanner orchestration and a growing part of the metadata pipeline.

### Current objective

Increase the migration scope again by migrating the next **cohesive metadata/parser subsystem**, targeting approximately **6–12 production JavaScript files** where the dependency structure supports doing so safely.

Start by inspecting the dependency graph around the remaining JavaScript metadata parsers, especially:

* `server/utils/parsers/parseOpfMetadata.js`
* `server/utils/parsers/parseEpubMetadata.js`
* `server/utils/parsers/parseComicMetadata.js`
* related normalisers, parser helpers, and closely connected metadata utilities

Do not blindly migrate a fixed number of files. Select the largest reasonably safe connected boundary based on actual callers, data flow, and test coverage.

### Priority

First investigate `parseOpfMetadata.js` and its relationship with the already-migrated `OpfFileScanner.ts` and `parseEbookMetadata.ts`.

If the OPF normalisation layer can be migrated safely, include its directly related helpers/tests in the same batch.

Then consider whether EPUB and comic metadata parsing belong in the same boundary. These involve archive extraction, so only include them if their dependencies and tests form a manageable cohesive unit. Otherwise leave them for a separate batch.

### Migration requirements

For every selected production file:

1. Inspect its callers, dependencies, exports, and runtime data flow before modifying it.
2. Convert `.js` → `.ts`.
3. Preserve CommonJS exports and all existing caller-facing APIs.
4. Reuse the types already introduced in the scanner and metadata layers.
5. Add meaningful types for dynamic XML/metadata structures instead of using broad `any`.
6. Preserve existing parsing, normalisation, merge, fallback, and error behaviour.
7. Do not redesign the parser architecture.
8. Do not change unrelated production code simply to make the migration easier.
9. Do not modify TypeScript configuration or module/build architecture.
10. Do not remove, weaken, or bypass existing tests.

Where dynamic external data makes exact typing difficult, model the actual supported shapes explicitly and use narrow validation/type guards where appropriate.

### Testing

Before changing production behaviour, inspect the existing parser tests and use them as behavioural constraints.

Add focused tests where coverage is insufficient, especially for:

* dynamic XML shapes
* missing/optional metadata
* metadata precedence
* malformed input
* empty results
* archive parsing boundaries, if EPUB/comic parsers are included

After migration run:

* focused tests for the migrated files
* relevant scanner/parser tests
* `npm run build:server`
* `npm run lint`
* `npm test`
* `npm run coverage`
* `git diff --check`

If tests expose fixture assumptions, fix the fixtures rather than changing production behaviour.

If TypeScript compilation exposes missing types, improve the boundary types rather than adding broad `any`.

### Important experiment goal

This is deliberately a larger batch than the previous sessions.

Do not stop after migrating one convenient file. If several files form a connected subsystem and can be migrated with reasonable confidence, migrate them together.

Target approximately **6–12 production files**, but architectural coherence and correctness are more important than the number.

At the same time, do not force unrelated or high-risk code into the batch merely to increase the count.

At the end, report:

* exact production files migrated
* why they form one cohesive boundary
* important types introduced
* how they integrate with the existing TypeScript scanner layer
* tests added/changed
* focused/relevant/full test counts
* build/lint/coverage results
* current overall coverage
* any failures or unexpected issues
* files intentionally left as JavaScript and why
* recommended next migration boundary

Do not spend time on Git commits, pushing, documentation, or writing the report. Focus on increasing the scale of the actual migration while maintaining behavioural safety.
Continue Workflow B with a larger migration batch.

The previous session successfully migrated five connected scanner/parser files in one pass. The current TypeScript migration now covers the main scanner orchestration and a growing part of the metadata pipeline.

### Current objective

Increase the migration scope again by migrating the next **cohesive metadata/parser subsystem**, targeting approximately **6–12 production JavaScript files** where the dependency structure supports doing so safely.

Start by inspecting the dependency graph around the remaining JavaScript metadata parsers, especially:

* `server/utils/parsers/parseOpfMetadata.js`
* `server/utils/parsers/parseEpubMetadata.js`
* `server/utils/parsers/parseComicMetadata.js`
* related normalisers, parser helpers, and closely connected metadata utilities

Do not blindly migrate a fixed number of files. Select the largest reasonably safe connected boundary based on actual callers, data flow, and test coverage.

### Priority

First investigate `parseOpfMetadata.js` and its relationship with the already-migrated `OpfFileScanner.ts` and `parseEbookMetadata.ts`.

If the OPF normalisation layer can be migrated safely, include its directly related helpers/tests in the same batch.

Then consider whether EPUB and comic metadata parsing belong in the same boundary. These involve archive extraction, so only include them if their dependencies and tests form a manageable cohesive unit. Otherwise leave them for a separate batch.

### Migration requirements

For every selected production file:

1. Inspect its callers, dependencies, exports, and runtime data flow before modifying it.
2. Convert `.js` → `.ts`.
3. Preserve CommonJS exports and all existing caller-facing APIs.
4. Reuse the types already introduced in the scanner and metadata layers.
5. Add meaningful types for dynamic XML/metadata structures instead of using broad `any`.
6. Preserve existing parsing, normalisation, merge, fallback, and error behaviour.
7. Do not redesign the parser architecture.
8. Do not change unrelated production code simply to make the migration easier.
9. Do not modify TypeScript configuration or module/build architecture.
10. Do not remove, weaken, or bypass existing tests.

Where dynamic external data makes exact typing difficult, model the actual supported shapes explicitly and use narrow validation/type guards where appropriate.

### Testing

Before changing production behaviour, inspect the existing parser tests and use them as behavioural constraints.

Add focused tests where coverage is insufficient, especially for:

* dynamic XML shapes
* missing/optional metadata
* metadata precedence
* malformed input
* empty results
* archive parsing boundaries, if EPUB/comic parsers are included

After migration run:

* focused tests for the migrated files
* relevant scanner/parser tests
* `npm run build:server`
* `npm run lint`
* `npm test`
* `npm run coverage`
* `git diff --check`

If tests expose fixture assumptions, fix the fixtures rather than changing production behaviour.

If TypeScript compilation exposes missing types, improve the boundary types rather than adding broad `any`.

### Important experiment goal

This is deliberately a larger batch than the previous sessions.

Do not stop after migrating one convenient file. If several files form a connected subsystem and can be migrated with reasonable confidence, migrate them together.

Target approximately **6–12 production files**, but architectural coherence and correctness are more important than the number.

At the same time, do not force unrelated or high-risk code into the batch merely to increase the count.

At the end, report:

* exact production files migrated
* why they form one cohesive boundary
* important types introduced
* how they integrate with the existing TypeScript scanner layer
* tests added/changed
* focused/relevant/full test counts
* build/lint/coverage results
* current overall coverage
* any failures or unexpected issues
* files intentionally left as JavaScript and why
* recommended next migration boundary

Do not spend time on Git commits, pushing, documentation, or writing the report. Focus on increasing the scale of the actual migration while maintaining behavioural safety.
