# Session 17 — Migration Prompt and Strategy

## Prompt and Directives

Implement the migration batch reviewed and approved for Batch 17.

### Approved Scope
The complete Sequelize Models subsystem (`server/models/*`, 25 production files total):

#### Group 1: Junction & Light Support Models (8 files)
1. `server/models/Setting.js` -> `server/models/Setting.ts`
2. `server/models/LibraryFolder.js` -> `server/models/LibraryFolder.ts`
3. `server/models/BookAuthor.js` -> `server/models/BookAuthor.ts`
4. `server/models/BookSeries.js` -> `server/models/BookSeries.ts`
5. `server/models/CollectionBook.js` -> `server/models/CollectionBook.ts`
6. `server/models/PlaylistMediaItem.js` -> `server/models/PlaylistMediaItem.ts`
7. `server/models/CustomMetadataProvider.js` -> `server/models/CustomMetadataProvider.ts`
8. `server/models/Session.js` -> `server/models/Session.ts`

#### Group 2: User, Auth & Peripheral Models (5 files)
9. `server/models/ApiKey.js` -> `server/models/ApiKey.ts`
10. `server/models/Device.js` -> `server/models/Device.ts`
11. `server/models/MediaItemShare.js` -> `server/models/MediaItemShare.ts`
12. `server/models/MediaProgress.js` -> `server/models/MediaProgress.ts`
13. `server/models/User.js` -> `server/models/User.ts`

#### Group 3: Metadata, Collections & Playback Models (6 files)
14. `server/models/Author.js` -> `server/models/Author.ts`
15. `server/models/Series.js` -> `server/models/Series.ts`
16. `server/models/Collection.js` -> `server/models/Collection.ts`
17. `server/models/Playlist.js` -> `server/models/Playlist.ts`
18. `server/models/PlaybackSession.js` -> `server/models/PlaybackSession.ts`
19. `server/models/Library.js` -> `server/models/Library.ts`

#### Group 4: Core Media Models (6 files)
20. `server/models/PodcastEpisode.js` -> `server/models/PodcastEpisode.ts`
21. `server/models/Podcast.js` -> `server/models/Podcast.ts`
22. `server/models/FeedEpisode.js` -> `server/models/FeedEpisode.ts`
23. `server/models/Feed.js` -> `server/models/Feed.ts`
24. `server/models/Book.js` -> `server/models/Book.ts`
25. `server/models/LibraryItem.js` -> `server/models/LibraryItem.ts`

### Migration Requirements
* Migrate approved files to TypeScript using meaningful types; avoid blanket `any`; preserve existing runtime behaviour, CommonJS exports, and caller contracts.
* Reuse existing types and conventions from earlier sessions.
* Use `declare` for Sequelize model instance attributes and associations to prevent public class fields from shadowing Sequelize getters and setters under ES2022 target.
* Do not redesign architecture or change unrelated configuration.
* Do not delete or weaken tests to make the migration pass.
* Do not push changes upstream or discard existing user changes.

### Verification Checkpoints
* TypeScript server compilation: `npm run build:server` (clearing `dist-server/.tsbuildinfo` cache first)
* Focused model tests: `npx mocha dist-server/test/server/models/oldJsonSerialization.test.js`
* Focused controller tests: `npx mocha dist-server/test/server/controllers/UserController.test.js`
* ESLint verification: `npm run lint`
* Full test suite execution: `npm test`
* Statement/branch/function/line coverage check: `npm run coverage`
* Clean git diff: `git diff --check`
