### Session 09 — Shared Metadata Override Boundary

The ninth session migrated `AbsMetadataFileScanner.js` to TypeScript as a shared metadata-processing boundary used by the migrated book and podcast scanners. The CommonJS singleton export and existing methods were preserved, while explicit types were added for metadata, chapters, series, metadata files, paths, scan data, and mutable metadata targets.

Focused tests covered book and podcast overrides, item-ID fallback, empty-array merge behaviour, and invalid JSON. The existing invalid-JSON behaviour was preserved: the error is logged, no override is returned, and the target remains unchanged.

Verification produced 3 focused helper tests, 9 helper/caller tests, 385 full tests, passing build and lint, passing coverage, and a clean `git diff --check`. Overall coverage increased to 20.68% statements, 9.26% branches, 14.73% functions, and 20.75% lines.

This session showed that the incremental approach can continue through shared scanner dependencies while keeping already-migrated callers stable. The next boundary is `NfoFileScanner`, another focused file-based metadata component in the book scanning path.
