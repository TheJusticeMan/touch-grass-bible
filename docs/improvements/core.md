# Core Improvements

This page lists improvement opportunities in the root app layer, Bible data models, settings, and the main reading experience.

## `src/AIchat.ts`

- High: split provider-specific behavior into adapters so OpenAI and Anthropic requests are not mixed in one partial implementation
- High: add cancellation, timeout, and retry handling for streaming requests
- High: avoid mutating message history before a request is validated or succeeds
- Medium: surface richer API errors instead of relying mostly on `statusText`
- Medium: add direct tests for stream parsing, tool-call assembly, and missing-key flows

## `src/BibleTopics.ts`

- High: add a reverse index from verse OSIS to topics so `getTopicsFromVerse()` does not scan every topic
- Medium: either expose stored topic ratings in the public API or remove them from the model
- Medium: validate and normalize topic names and OSIS input at the boundary
- Medium: separate reading history from topical tags instead of storing dates as pseudo-topics
- Medium: expand `src/BibleTopics.test.ts` to cover ratings, merge rules, and history/date behavior

## `src/booksOfTheBible.ts`

- High: replace parallel arrays with one readonly metadata table to remove index-coupling risks
- Medium: derive strongly typed book/code unions from the metadata table
- Medium: add integrity tests for length, uniqueness, and canonical ordering
- Low: centralize book aliases instead of scattering naming differences downstream

## `src/main.ts`

- High: break `onload()` into smaller startup phases for settings, data loading, layout setup, plugin registration, and UI wiring
- High: tear down global listeners and delayed-save timers on unload
- High: make settings saves awaited and error-aware
- Medium: actively apply persisted style settings or remove dead style config
- Medium: move `deepMerge()` into a shared utility and test that implementation directly

## `src/Plugin.ts`

- High: isolate plugin load failures so one broken plugin does not break startup
- High: deep-merge plugin settings with defaults instead of shallow replacement
- Medium: await child lifecycle operations and report failures clearly
- Medium: clear unload bookkeeping after unload to avoid stale callbacks on reload
- Medium: add tests for duplicate registration, idempotent load/unload, and cleanup behavior

## `src/Scroll.ts`

- High: handle missing data and zero-range states explicitly instead of treating both as falsey `maxScroll`
- High: add keyboard and ARIA support for the drag-based navigation controls
- Medium: deduplicate `BookScroll` and `ChapterScroll` into a generic navigator
- Medium: add tests for wraparound and callback firing behavior

## `src/sidepanels.ts`

- High: use semantic buttons or links instead of clickable `div` items
- Medium: generate the menu from config data to reduce repetition
- Medium: handle missing plugin categories gracefully so dead navigation targets do not appear
- Low: show an active/current section state for orientation in multi-pane layouts

## `src/TGAppSettings.ts`

- High: add runtime schema validation and migrations keyed by `schemaVersion`
- High: move deprecated fields into a dedicated migration layer instead of the live runtime type
- Medium: make defaults immutable or factory-based to avoid accidental mutation
- Medium: tighten style field naming and use narrower unions where possible
- High: expand `src/TGAppSettings.test.ts` to cover migrations and invalid persisted settings

## `src/VerseRef.ts`

- High: derive strong `BookName` and translation types from metadata instead of using raw strings
- High: harden navigation and text access when translation data is missing or incomplete
- High: review edge-case math such as chapter wraparound and random selection assumptions
- Medium: remove dependency on global `String.prototype.toTitleCase()` from the core model
- High: expand `src/VerseRef.test.ts` to cover malformed OSIS, missing translations, URL generation, and chapter transitions

## `src/VerseScreen.ts`

- High: split the file into smaller units for chapter rendering, scroll state, verse actions, and persisted view state
- High: audit listener teardown so repeated attach/detach cycles do not leak handlers
- High: improve accessibility for verses, action buttons, and focus states
- High: reduce DOM churn from buffered chapter rendering and repeated action UI rebuilds
- Medium: validate restored state against real chapter and verse bounds and add direct behavior tests

## Related styles

### `src/main.css`

- Medium: align global design tokens with settings-driven theming if style settings remain part of the product
- Medium: add stronger keyboard focus and reduced-motion support to reading-surface controls

### `src/VerseScreen.css`

- High: add clearer focus styling and keyboard-visible interaction states
- Medium: revisit hidden scrollbars and touch-target sizing for accessibility and mobile usability
