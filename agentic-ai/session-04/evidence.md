### Session 04 — Per-Item Scanner Coordinator

The fourth session migrated `LibraryItemScanner.js` to TypeScript. This was a larger step than the previous scanner boundaries because `LibraryItemScanner` coordinates scan data, lifecycle state, watcher updates, and the downstream book and podcast scanners.

The migration introduced explicit types for library and folder records, watcher updates, file statistics, scan files, and downstream scanner contracts. It reused the types from `LibraryItemScanData`, `LibraryScan`, and `ScanLogger`, while leaving the downstream scanners in JavaScript.

Focused tests were added for filesystem scan-data construction, watcher-pending file filtering, and book/podcast dispatch for new and existing items. Verification passed with 12 focused tests, the server build, lint, and the full suite with 372 passing tests. Overall coverage increased to 19.77% statements, 8.35% branches, 13.88% functions, and 19.81% lines. `LibraryItemScanner` reached 51.19% statement coverage.

One filesystem test initially failed because temporary paths could resolve through `/var` and `/private/var`, preventing watcher filtering from matching. Resolving fixture paths before scanning fixed the test without changing production behaviour.

The scanner dependency chain is now substantially typed, and the next stage is `LibraryScanner`, which directly coordinates the full-library scan using the migrated per-item coordinator.
