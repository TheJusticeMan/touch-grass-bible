# Core Improvements

This page lists improvement opportunities in the root app layer, Bible models, settings, and reading experience.

## `src/main.ts`

- High: split startup into smaller phases and isolate plugin-load failures.
- High: ensure all global listeners/timers are cleaned up on unload.
- Medium: centralize startup diagnostics and migration logging.

## `src/config/TGAppSettings.ts`

- High: add runtime schema validation and explicit migrations by `schemaVersion`.
- High: keep deprecated fields in migration adapters rather than live runtime types.
- Medium: tighten style/settings unions and improve default immutability.

## `src/models/BibleTopics.ts`

- High: add an OSIS reverse index so verse-to-topic lookups avoid full scans.
- Medium: clarify whether topic scores are public API and document them consistently.
- Medium: expand tests around merge semantics and history/date tagging behavior.

## `src/models/booksOfTheBible.ts`

- High: replace parallel arrays with a single readonly metadata table.
- Medium: derive typed book/code unions from one metadata source.

## `src/models/VerseRef.ts`

- High: harden malformed input and missing-translation behavior across all text accessors.
- High: remove hidden reliance on global prototype helpers where possible.
- Medium: expand malformed OSIS and chapter-wrap edge-case tests.

## `src/ui/VerseScreen.ts`

- High: split chapter rendering, verse actions, and persisted state logic into smaller modules.
- High: audit event/listener teardown for repeated mount/unmount cycles.
- High: reduce DOM churn in buffered rendering and action-button rebuilds.
- Medium: improve accessibility semantics for verse actions and keyboard focus.

## `src/ui/VerseScreen.css`

- Medium: unify focus/hover/pressed styling with shared token conventions.
- Medium: revisit hidden-scrollbar behavior and mobile touch-target sizing.

## `src/core/Plugin.ts`

- High: isolate broken plugin startup so one failure does not block all plugins.
- Medium: add stronger typed validation for plugin registration contracts.
- Medium: expand lifecycle tests for reload/idempotent unload paths.

## Related tests

- High: expand `src/core/Plugin.test.ts`, `src/models/VerseRef.extended.test.ts`, and `src/ui/pinchZoom.test.ts` around regressions discovered during refactors.
- Medium: add targeted tests for settings migrations and startup fallback behavior.
