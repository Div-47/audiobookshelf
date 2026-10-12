Continue Workflow B, but substantially increase the migration scope.

We are testing whether an agentic coding workflow can perform a genuinely large-scale JavaScript → TypeScript migration. The previous sessions deliberately used small incremental batches to establish safe patterns. That phase is now complete.

The current migration has established a working TypeScript foundation across the scanner and metadata pipeline. We now need to move from incremental file-by-file migration toward **high-throughput subsystem migration**.

### Main objective

Migrate **as much of the remaining backend JavaScript as can reasonably be migrated in this session**.

Do not limit the session to 4, 5, or 10 files.

Instead:

1. Inspect the current backend dependency structure.
2. Identify a substantial connected region of remaining JavaScript.
3. Migrate that region in a coordinated pass.
4. Continue into the next connected region if the previous one verifies successfully.
5. Keep going until you encounter a genuine architectural boundary, high-risk dependency, or verification problem that makes continuing unsafe.

The goal is to maximise meaningful migration progress while maintaining the existing application's behaviour.

### Migration strategy

Use the existing TypeScript migration as the pattern.

Prioritise production areas in roughly this order where practical:

1. Remaining scanner and metadata code
2. Scanner/parser dependencies and filesystem utilities
3. Closely related objects/data structures
4. Finders and managers with manageable dependency boundaries
5. Database-facing application modules where their contracts can be typed safely
6. Controllers and routers
7. Remaining server/application composition

Do not migrate purely by filename or directory.

Use the actual dependency graph to determine which files should move together.

If migrating one file exposes several tightly coupled JavaScript dependencies, consider migrating those dependencies in the same pass rather than stopping immediately.

### Important change from previous sessions

Do NOT treat every JavaScript file as requiring an individual investigation and separate migration decision.

For a clearly connected subsystem, inspect the subsystem once, establish its important contracts, and migrate the relevant files together.

Prefer:

**inspect subsystem → establish boundaries → migrate many files → verify → continue**

over:

**inspect one file → migrate one file → verify → repeat**

### Scale target

There is deliberately **no small file-count target**.

Aim for a substantial increase in TypeScript coverage.

If the dependency structure allows it, migrating **dozens of production files in one session is acceptable and encouraged**.

Do not artificially stop at 10 files.

However, do not convert unrelated or unsafe code merely to increase the number. The files should belong to connected application boundaries.

### TypeScript requirements

For migrated code:

* Preserve runtime behaviour.
* Preserve CommonJS compatibility where currently required.
* Preserve public/caller-facing APIs.
* Reuse existing types wherever possible.
* Create shared interfaces/types for genuinely shared data structures.
* Prefer proper boundary types, type aliases, interfaces, and narrow validation over broad `any`.
* Do not redesign architecture.
* Do not introduce unnecessary abstractions.
* Do not change business logic.
* Do not change database schemas.
* Do not change API behaviour.
* Do not change module/build architecture.
* Do not change TypeScript configuration unless compilation genuinely requires it.
* Do not migrate vendored third-party implementations unless there is a strong reason.

If several modules share the same data shape, define the type once at the appropriate boundary and reuse it rather than creating duplicated incompatible types.

### Tests and verification

Do not wait until the entire server has been migrated before testing.

After each meaningful subsystem or batch:

* run the relevant focused tests
* fix type errors and behavioural regressions
* continue to the next subsystem

At suitable checkpoints run:

* `npm run build:server`
* `npm run lint`
* `npm test`
* `npm run coverage`
* `git diff --check`

Existing tests are behavioural constraints.

Never remove, weaken, skip, or rewrite tests simply to make the migration pass.

If coverage is poor, add focused characterization tests for important boundaries before or during migration.

If a failure is caused by a stale TypeScript cache, clean the cache and continue.

If a failure exposes a genuine typing or integration issue, fix the underlying boundary rather than hiding it with `any`.

If a fixture or test depends on global state, cached modules, filesystem paths, or environment setup, correct the test/fixture rather than changing production behaviour.

### Handling difficult areas

Do not get stuck trying to perfectly type one difficult module.

If a module depends heavily on dynamic data, third-party libraries, archive implementations, Sequelize models, filesystem APIs, or other difficult JavaScript code:

* establish a sensible typed boundary,
* migrate what can safely be migrated,
* leave the difficult dependency temporarily in JavaScript if necessary,
* continue migrating other connected application code.

The objective is **system-wide progress**, not perfect completion of one subsystem.

### Completion condition

Continue migrating connected production code until one of the following occurs:

* verification becomes unreliable,
* a major architectural boundary is reached,
* remaining files require a fundamentally different migration strategy,
* or the session has made a substantial system-wide migration that is sufficient to evaluate the high-throughput workflow.

Do not stop merely because the first batch succeeds.

### Final report from this session

At the end, report concisely:

* total production JS files migrated in this session
* total production TS files now migrated
* major subsystems/boundaries migrated
* important shared types introduced
* tests added/changed
* focused/relevant/full test counts
* build/lint/coverage results
* current coverage
* significant failures and how they were resolved
* major areas intentionally left as JavaScript
* the largest remaining migration boundary
* recommended next step

Do not spend time on Git commits, pushing, documentation, or writing the university report.

The priority is simple:

**Move the JavaScript → TypeScript migration forward as far and as safely as possible in one session.**
