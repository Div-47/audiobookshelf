# Session 15 — Migration Prompt and Strategy

## Prompt and Directives

Implement the migration batch reviewed and approved for Batch 15.

### Approved Scope
28 production files across providers, finders, utility cores, settings objects, playback objects, query filters, and managers:

1. `server/utils/areEquivalent.js` -> `server/utils/areEquivalent.ts`
2. `server/utils/parsers/parseFullName.js` -> `server/utils/parsers/parseFullName.ts`
3. `server/utils/index.js` -> `server/utils/index.ts`
4. `server/utils/zipHelpers.js` -> `server/utils/zipHelpers.ts`
5. `server/utils/podcastUtils.js` -> `server/utils/podcastUtils.ts`
6. `server/providers/AudiobookCovers.js` -> `server/providers/AudiobookCovers.ts`
7. `server/providers/MusicBrainz.js` -> `server/providers/MusicBrainz.ts`
8. `server/providers/GoogleBooks.js` -> `server/providers/GoogleBooks.ts`
9. `server/providers/iTunes.js` -> `server/providers/iTunes.ts`
10. `server/providers/OpenLibrary.js` -> `server/providers/OpenLibrary.ts`
11. `server/providers/FantLab.js` -> `server/providers/FantLab.ts`
12. `server/providers/Audnexus.js` -> `server/providers/Audnexus.ts`
13. `server/providers/Audible.js` -> `server/providers/Audible.ts`
14. `server/providers/CustomProviderAdapter.js` -> `server/providers/CustomProviderAdapter.ts`
15. `server/finders/BookFinder.js` -> `server/finders/BookFinder.ts`
16. `server/objects/DailyLog.js` -> `server/objects/DailyLog.ts`
17. `server/objects/PlaybackSession.js` -> `server/objects/PlaybackSession.ts`
18. `server/objects/PodcastEpisodeDownload.js` -> `server/objects/PodcastEpisodeDownload.ts`
19. `server/objects/settings/EmailSettings.js` -> `server/objects/settings/EmailSettings.ts`
20. `server/objects/settings/NotificationSettings.js` -> `server/objects/settings/NotificationSettings.ts`
21. `server/objects/settings/ServerSettings.js` -> `server/objects/settings/ServerSettings.ts`
22. `server/objects/Stream.js` -> `server/objects/Stream.ts`
23. `server/utils/queries/authorFilters.js` -> `server/utils/queries/authorFilters.ts`
24. `server/utils/queries/adminStats.js` -> `server/utils/queries/adminStats.ts`
25. `server/utils/queries/userStats.js` -> `server/utils/queries/userStats.ts`
26. `server/utils/queries/seriesFilters.js` -> `server/utils/queries/seriesFilters.ts`
27. `server/managers/ShareManager.js` -> `server/managers/ShareManager.ts`
28. `server/managers/NotificationManager.js` -> `server/managers/NotificationManager.ts`

### Migration Requirements
* Migrate approved files to TypeScript using meaningful types; avoid blanket `any`; preserve existing runtime behaviour, CommonJS exports, and caller contracts.
* Reuse existing types and conventions from earlier sessions.
* Do not redesign architecture or change unrelated configuration.
* Do not delete or weaken tests to make the migration pass.
* Do not push changes upstream or discard existing user changes.

### Verification Checkpoints
* TypeScript server compilation: `npm run build:server` (clearing `dist-server/.tsbuildinfo` cache first)
* ESLint verification: `npm run lint`
* Full test suite execution: `npm test`
* Statement/branch/function/line coverage check: `npm run coverage`
* Clean git diff: `git diff --check`
