We are continuing the system-wide JavaScript → TypeScript migration of the Audiobookshelf backend.

This is now a HIGH-THROUGHPUT migration stage.

Current migration state:

* Original backend baseline: 426 JavaScript files
* Currently migrated: 48 TypeScript files
* Remaining current non-vendored JavaScript: 134 files
* Migration progress by original-file baseline: ~11.3%
* Build, lint, full tests and coverage are currently passing.
* Do not spend time on Git commits, documentation, or report writing.

## Objective

Migrate a LARGE, cohesive portion of the remaining application layer in this session.

Target approximately **30–50 production JavaScript files** if the codebase allows it.

Do NOT artificially stop after 5–10 files.

The priority is now to make a substantial jump in migration coverage while maintaining runtime behaviour and keeping the project buildable.

## Priority areas

Start by inspecting the remaining non-vendored JavaScript dependency structure and identify the largest safe connected regions.

Prioritize:

1. `server/routes/`
2. `server/controllers/`
3. Controller-adjacent request/response or API helper modules
4. Independent application services
5. Remaining finders
6. Managers that have relatively stable contracts
7. Other independent server modules that do not require migrating a difficult dependency first

Use the dependency graph rather than filenames alone.

If routes depend on controllers, migrate the relevant route/controller group together.

If controllers depend on managers, type the manager boundary where practical, but do not allow one difficult manager to block migration of an otherwise safe controller group.

## Large-batch strategy

Work as a migration campaign:

1. Inspect the remaining application architecture.
2. Identify several large groups of related files.
3. Select the largest safe group.
4. Migrate the group to TypeScript.
5. Establish shared types for repeated request, response, parameter, configuration and domain shapes.
6. Preserve existing runtime behaviour and CommonJS compatibility.
7. Run focused tests/build/lint.
8. Fix problems.
9. Immediately continue to the next safe group.
10. Repeat until approximately 30–50 production files have been migrated, or until a genuine architectural boundary prevents further progress.

Do not treat each file as a separate task.

## TypeScript requirements

The purpose is a meaningful system-wide migration, not simply renaming `.js` files to `.ts`.

Add useful types for:

* Express request parameters
* request bodies
* query parameters
* response values
* controller arguments/results
* route handlers
* manager/finder interfaces
* shared application data structures
* nullable values
* configuration objects
* common domain objects

Avoid replacing uncertainty with broad `any`.

Use `unknown`, explicit interfaces/types, unions, optional properties, or narrow boundary types where appropriate.

When several controllers/routes share the same shape, create or reuse a shared type rather than duplicating definitions.

## Preserve the existing architecture

Do NOT redesign the application.

Do NOT:

* change API behaviour
* change HTTP routes
* change response formats
* change authentication behaviour
* change database behaviour
* replace Express
* replace Sequelize
* introduce a new framework
* change module architecture unnecessarily
* change build configuration unless absolutely required
* rewrite business logic merely to make TypeScript easier

Preserve existing CommonJS exports and caller-facing APIs wherever possible.

The migration should make the existing system typed, not turn this into an architecture rewrite.

## Handling difficult dependencies

Some areas are intentionally difficult and should NOT block the campaign.

If a controller depends on:

* highly dynamic Sequelize models
* dynamic ffmpeg/prober data
* provider-heavy code
* complex managers
* vendored libraries
* highly dynamic runtime objects

establish a typed boundary where practical and continue migrating the surrounding application layer.

Do not spend the entire session trying to solve one difficult dependency.

If necessary, leave that dependency as JavaScript temporarily and migrate the surrounding routes/controllers/application modules.

This is a system-wide migration, so breadth matters.

## Verification

After each substantial group:

* run relevant focused tests
* run `npm run build:server`
* run `npm run lint`

At major checkpoints, run:

* `npm test`
* `npm run coverage`
* `git diff --check`

Do not weaken or delete existing tests just to make the migration pass.

If a test fails because the fixture was relying on an existing environment/global precondition, fix the test fixture rather than changing production behaviour.

If TypeScript's incremental compiler produces an internal `Debug Failure`, first distinguish cache/tooling problems from actual source errors. Use a clean/nonincremental build or clear the generated `.tsbuildinfo` cache rather than changing compiler configuration unnecessarily.

## Important throughput rule

Do not stop simply because one subsystem is difficult.

If controllers are blocked by one manager:
→ move to other controllers.

If models are difficult:
→ continue with routes/controllers/finders/utilities.

If one route group is highly dynamic:
→ migrate another route/controller group.

Keep moving through the dependency graph.

The objective is to maximize the amount of meaningful production code migrated while maintaining a passing system.

## Success criteria

Aim for:

**30–50 production JavaScript files migrated to TypeScript in this session.**

A smaller result is acceptable only if the remaining candidates genuinely require a different strategy or major architectural boundary.

A larger result is welcome if verification remains reliable.

At the end, report:

1. Exact production files migrated.
2. Number of JS → TS conversions.
3. New total TypeScript file count.
4. Remaining JavaScript count.
5. Updated migration percentage using the original 426-file baseline.
6. Major application areas covered.
7. Important shared types introduced.
8. Focused test results.
9. Full test result.
10. Build/lint/coverage results.
11. Coverage change from the previous session.
12. Any failures or difficult boundaries encountered.
13. Which major application area should be attacked next.

Do not spend time creating documentation or Git evidence files unless absolutely necessary.

The main goal of this session is **large-scale migration throughput with reliable verification**.
