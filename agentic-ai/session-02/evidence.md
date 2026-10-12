
Files changed
- [`server/utils/stringifySequelizeQuery.ts`](/Users/div/Documents/Uni/COMPX574 Open Source/audiobookshelf/server/utils/stringifySequelizeQuery.ts) — migrated from stringifySequelizeQuery.js and added TypeScript types.
No tests or project configuration were changed.
Changes made
Added types for the input, return value, class check, and JSON replacer. Kept the implementation logic and module.exports interface intact so the existing JavaScript callers can continue requiring it without an extension.
The behavior preserved includes symbol-key conversion, class-name serialization, omission of non-class functions through native JSON behavior, and native JSON.stringify handling of other values.
Checks run
- npm run build:server — passed.
- Focused existing test, npx mocha dist-server/test/server/utils/stringifySequeslizeQuery.test.js — passed, 4 tests.
- npm run lint — passed.
- git diff --check — passed.
- Inspected the diff: it contains only the source rename and typing changes.
Errors and assumptions
The first build attempt failed because tsc was unavailable; this checkout had no node_modules. I installed dependencies with npm ci using the repository lockfile, then reran the checks successfully. The install reported 58 dependency audit findings; I did not change dependencies.
The environment uses Node 22, while the repository’s CI and Docker configuration use Node 24. Validation therefore passed locally on Node 22, but was not repeated on Node 24.
A permission request was needed to install the locked dependencies. No source changes required further human intervention.
Before the next migration
Keep the next step similarly narrow. Audit its callers and runtime behavior before selecting it, and consider adding dedicated TypeScript lint or type-checking only if the next component demonstrates that the current build is insufficient.

changes -
function stringifySequelizeQuery(findOptions) {
  function isClass(func) {
function stringifySequelizeQuery(findOptions: unknown): string | undefined {
  function isClass(func: unknown): func is Function {
    return typeof func === 'function' && /^class\s/.test(func.toString())

  function replacer(key, value) {
  function replacer(_key: string, value: unknown): unknown {
    if (typeof value === 'object' && value !== null) {
      const symbols = Object.getOwnPropertySymbols(value).reduce((acc, sym) => {
        acc[sym.toString()] = value[sym]
        acc[sym.toString()] = (value as Record<PropertyKey, unknown>)[sym]
        return acc
      }, {})
      }, {} as Record<string, unknown>)

}

module.exports = stringifySequelizeQuery