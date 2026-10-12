Continue the system-wide JavaScript → TypeScript migration.

We have now demonstrated that larger batches are workable. The previous session migrated 14 production files successfully and increased the non-vendored server to 33 TypeScript files with 149 JavaScript files remaining.

For this session, increase the migration speed again.

### Primary goal

Treat this as a **migration campaign**, not a single-file or single-batch task.

Repeatedly:

1. Inspect the remaining dependency graph.
2. Select the largest safe connected migration cluster.
3. Migrate the cluster.
4. Run appropriate focused verification.
5. Fix genuine typing/integration problems.
6. Move immediately to the next connected cluster.
7. Continue until verification becomes unreliable or a major architectural boundary requires a different strategy.

Do not artificially limit the number of files migrated.

If the dependency graph allows it, **20–40+ production files in this session is acceptable and encouraged**.

### Optimise for throughput

Do not spend most of the session trying to perfectly migrate one difficult file.

If a module is unusually dynamic or tightly coupled:

* define a reasonable typed boundary,
* migrate surrounding compatible modules,
* leave the difficult module as JavaScript temporarily,
* continue elsewhere.

The objective is to maximise the amount of the server converted while keeping the application working.

### Migration priorities

Prefer broad connected areas such as:

* remaining scanner/metadata dependencies
* objects and shared data structures
* filesystem utilities
* parser utilities
* finders
* managers
* database-facing application modules
* authentication/application services
* controllers and routers

Use the dependency graph to determine the actual order.

Avoid vendored third-party implementations unless they are clearly part of the application's own migration boundary.

### Type strategy

Use the existing migrated TypeScript code as the foundation.

Where several JavaScript modules share a data structure, establish one shared type and reuse it.

Prioritise typing:

* function parameters
* return values
* object/data structures
* module boundaries
* external library results
* nullable/optional values
* database/API boundaries

Do not waste time attempting to model every internal intermediate value perfectly.

Avoid broad `any`, but a narrow temporary boundary is preferable to blocking the entire migration.

Do not redesign the application.

Preserve:

* runtime behaviour
* CommonJS compatibility
* public APIs
* database behaviour
* HTTP/API behaviour
* existing business logic
* existing error handling

### Verification strategy

Verification should be continuous but lightweight.

After each substantial cluster:

* run its focused tests
* run relevant tests
* build when the cluster affects shared application boundaries

Run the full verification suite at appropriate checkpoints:

* `npm run build:server`
* `npm run lint`
* `npm test`
* `npm run coverage`
* `git diff --check`

Do not wait until dozens of files have changed before discovering a basic compiler failure.

If the TypeScript incremental compiler produces an internal failure, use a clean/nonincremental build to determine whether it is a cache problem or a real source/type problem.

Never remove or weaken tests to obtain a passing result.

### Important boundary rule

If you encounter a difficult subsystem such as the audio/probe classes, Sequelize internals, vendor libraries, or highly dynamic provider code:

**do not get stuck there.**

Record the boundary, leave the difficult dependency in JavaScript if necessary, and continue migrating other application modules around it.

A partially typed system with clear boundaries is preferable to spending the entire session on one highly dynamic module.

### Completion condition

Keep going.

Do not stop after the first successful cluster.

Only stop when:

* a major architectural boundary is reached,
* verification becomes unreliable,
* the remaining code requires a fundamentally different migration strategy,
* or you have made substantial progress across multiple subsystems.

### Final report

At the end provide only a concise migration summary:

* number of production files migrated
* total TS/JS counts
* major areas migrated
* important shared types/boundaries created
* tests passing
* build/lint/coverage results
* current coverage
* significant failures and resolutions
* major areas intentionally left as JavaScript
* next largest migration boundary

Do not spend time on Git history, commits, pushing, documentation, or report writing.

**The priority is throughput: migrate as much of the remaining server as can be done safely in this session.**
