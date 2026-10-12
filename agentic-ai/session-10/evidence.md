### Session 10 — Larger Scanner/Parser Batch

The tenth session increased the migration scope by moving five connected production files to TypeScript: `NfoFileScanner`, `OpfFileScanner`, `parseNfoMetadata`, `parseEbookMetadata`, and `parseComicInfoMetadata`. The batch was selected around the existing book metadata pipeline rather than as a group of unrelated files.

The file scanners now operate directly with the typed metadata object used by `BookScanner`, while the ebook and ComicInfo parsers retain their existing caller-facing APIs. CommonJS exports and metadata merge behaviour were preserved. Tests were added for NFO/OPF file-to-metadata integration, ComicInfo field mapping, and ebook dispatcher edge cases. Existing parser tests were retained.

Verification produced 61 focused/relevant tests, 391 full tests, passing build, lint, coverage, and `git diff --check`. Overall coverage increased to 20.86% statements, 9.53% branches, 14.84% functions, and 20.94% lines.

Three related parsers were deliberately left as JavaScript: `parseOpfMetadata`, `parseEpubMetadata`, and `parseComicMetadata`. Their dynamic XML and archive-extraction behaviour creates a larger boundary that would benefit from dedicated types and tests rather than being forced into the current batch.

This session demonstrated that increasing the batch size is practical when the files form a clear dependency boundary. The next step is to test whether a similarly larger batch can handle the OPF normalisation and archive-parsing layers safely.
