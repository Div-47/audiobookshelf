## Session 13 — High-Throughput Application-Layer Migration

### Starting position

After the previous migration session:

* Original backend baseline: **426 JavaScript files**
* TypeScript files: **48**
* Remaining non-vendored JavaScript: **134**
* Migration progress: **48 / 426 = 11.3%**

The previous sessions had successfully established the migration approach and verified that connected scanner, parser, utility, metadata, and audio boundaries could be migrated safely. However, most of the remaining application was still JavaScript.

### Strategy change

The workflow was deliberately changed from small 5–15 file batches to a **high-throughput migration campaign**.

The agent was instructed to target approximately **30–50 production files** in one session, prioritising:

* Routes
* Controllers
* Controller/API helpers
* Independent application services
* Finders
* Managers with stable interfaces
* Other relatively independent server modules

The agent was instructed to use the dependency graph to select large safe groups rather than migrating files individually.

Difficult dependencies such as dynamic Sequelize models, ffmpeg/prober code, provider-heavy modules, and vendored libraries were not allowed to block progress. Where necessary, the agent should establish a typed boundary and continue migrating surrounding application code.

### Verification approach

The same verification requirements were retained:

* Focused tests after each major group
* `npm run build:server`
* `npm run lint`
* Full `npm test` at checkpoints
* `npm run coverage`
* `git diff --check`

Existing behaviour, CommonJS compatibility, APIs, database behaviour, HTTP responses, and tests were to be preserved.

### Reason for the change

The earlier incremental workflow was effective for establishing safe migration boundaries, but it was producing relatively small file-count increases. With only 48 of the original 426 JavaScript files converted, continuing at the same rate would make the system-wide migration unnecessarily slow.

The new workflow therefore increases the **scope per agent session while keeping verification checkpoints**, allowing the experiment to test whether agentic development can handle a substantially larger migration unit without losing reliability.

### Expected outcome

The target for this session is a **30–50 production-file migration**, producing a substantially larger increase in the overall migration percentage.

The session will be evaluated not only by the number of files converted, but also by:

* Whether the agent maintains type quality
* Whether existing behaviour is preserved
* How effectively it handles shared dependencies
* How often human intervention is required
* Whether verification remains reliable at the larger scale
* Which application boundaries remain difficult to migrate
