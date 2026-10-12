# Session 16 — Migration Prompt and Strategy

## Prompt and Directives

Implement the migration batch reviewed and approved for Batch 16.

### Approved Scope
24 production files across authentication, managers, query helpers, controllers, and the primary API router:

#### Group 1: Auth Subsystem (4 files)
1. `server/auth/TokenManager.js` -> `server/auth/TokenManager.ts`
2. `server/auth/LocalAuthStrategy.js` -> `server/auth/LocalAuthStrategy.ts`
3. `server/auth/OidcAuthStrategy.js` -> `server/auth/OidcAuthStrategy.ts`
4. `server/Auth.js` -> `server/Auth.ts`

#### Group 2: Key Operational Managers (7 files)
5. `server/managers/CacheManager.js` -> `server/managers/CacheManager.ts`
6. `server/managers/CoverSearchManager.js` -> `server/managers/CoverSearchManager.ts`
7. `server/managers/CoverManager.js` -> `server/managers/CoverManager.ts`
8. `server/managers/RssFeedManager.js` -> `server/managers/RssFeedManager.ts`
9. `server/managers/PlaybackSessionManager.js` -> `server/managers/PlaybackSessionManager.ts`
10. `server/managers/CronManager.js` -> `server/managers/CronManager.ts`
11. `server/managers/BinaryManager.js` -> `server/managers/BinaryManager.ts`

#### Group 3: Core Route Controllers (9 files)
12. `server/controllers/AuthorController.js` -> `server/controllers/AuthorController.ts`
13. `server/controllers/CollectionController.js` -> `server/controllers/CollectionController.ts`
14. `server/controllers/PlaylistController.js` -> `server/controllers/PlaylistController.ts`
15. `server/controllers/PodcastController.js` -> `server/controllers/PodcastController.ts`
16. `server/controllers/SessionController.js` -> `server/controllers/SessionController.ts`
17. `server/controllers/ShareController.js` -> `server/controllers/ShareController.ts`
18. `server/controllers/UserController.js` -> `server/controllers/UserController.ts`
19. `server/controllers/MeController.js` -> `server/controllers/MeController.ts`
20. `server/controllers/MiscController.js` -> `server/controllers/MiscController.ts`

#### Group 4: Supporting Helpers & Primary Router (4 files)
21. `server/utils/queries/libraryItemFilters.js` -> `server/utils/queries/libraryItemFilters.ts`
22. `server/utils/queries/libraryFilters.js` -> `server/utils/queries/libraryFilters.ts`
23. `server/utils/libraryHelpers.js` -> `server/utils/libraryHelpers.ts`
24. `server/routers/ApiRouter.js` -> `server/routers/ApiRouter.ts`

### Migration Requirements
* Migrate approved files to TypeScript using meaningful types; avoid blanket `any`; preserve existing runtime behaviour, CommonJS exports, and caller contracts.
* Reuse existing types and conventions from earlier sessions.
* Do not redesign architecture or change unrelated configuration.
* Do not delete or weaken tests to make the migration pass.
* Do not push changes upstream or discard existing user changes.
* Exclude `LibraryController.js`, `LibraryItemController.js`, ffmpeg heavy managers (`PodcastManager`, `AbMergeManager`, `AudioMetadataManager`), and `server/models/*`.

### Verification Checkpoints
* TypeScript server compilation: `npm run build:server` (clearing `dist-server/.tsbuildinfo` cache first)
* ESLint verification: `npm run lint`
* Full test suite execution: `npm test`
* Statement/branch/function/line coverage check: `npm run coverage`
* Clean git diff: `git diff --check`
