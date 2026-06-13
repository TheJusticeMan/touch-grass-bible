# Core Source Files

This page summarizes the current root app layer in `src/`, with model code under `src/models`, UI under `src/ui`, and settings schema under `src/config`.

## `src/main.ts`

- Purpose: app entrypoint and main application boot sequence
- Key APIs: `TouchGrassBibleApp`, `app`
- Loads settings, translation data, workspace views, and internal plugins.
- Wires command palette behavior, verse actions, and delayed persistence flows.

## `src/main.css`

- Purpose: app-wide style tokens and base reading styles
- Key selectors: root token definitions, reading content selectors, shared controls
- Provides base color/spacing/type variables used by app and plugin surfaces.

## `src/main.test.ts`

- Purpose: startup-settings and deep-merge behavior tests
- Covers `DEFAULT_SETTINGS` expectations and recursive merge behavior mirrored from `src/main.ts`.

## `src/build-info.d.ts`

- Purpose: typed build metadata declarations injected at build time
- Helps keep build/version values type-safe inside TypeScript modules.

## `src/globals.d.ts`

- Purpose: shared global type declarations used by app/runtime targets.

## `src/test-setup.ts`

- Purpose: shared Vitest setup file
- Installs test-only globals and helper behavior used across suites.

## `src/config/TGAppSettings.ts`

- Purpose: persisted app settings schema and defaults
- Key APIs: `TGAppSettings`, `DEFAULT_SETTINGS`, `DEFAULT_CATEGORY_ORDER`
- Defines root settings used by app startup and plugin defaults.

## `src/config/TGAppSettings.test.ts`

- Purpose: tests for settings defaults and schema-related expectations.

## `src/models/BibleTopics.ts`

- Purpose: topic map model keyed by verse OSIS references
- Key APIs: `BibleTopics`, `BibleTopicsType`
- Supports topic add/remove/merge, reverse lookup, and serialized data flows.

## `src/BibleTopics.test.ts`

- Purpose: model tests for topic mapping and merge behavior.

## `src/models/booksOfTheBible.ts`

- Purpose: canonical book names, abbreviations, and lookup metadata.

## `src/models/VerseRef.ts`

- Purpose: core verse reference model and scripture lookup utilities
- Key APIs: `VerseRef`, OSIS conversion helpers, translation text accessors
- Powers parsing, navigation, display formatting, and external URL generation.

## `src/models/VerseRef.test.ts`

- Purpose: baseline parsing/formatting tests for `VerseRef`.

## `src/models/VerseRef.extended.test.ts`

- Purpose: extended edge-case and behavior coverage for `VerseRef`.

## `src/models/VerseRef.distance.bench.ts`

- Purpose: benchmark for verse-distance calculations and navigation cost.

## `src/models/DataTypes.ts`

- Purpose: shared model-level data types used across scripture/topic features.

## `src/ui/VerseScreen.ts`

- Purpose: main scripture-reading workspace view
- Key APIs: `VerseScreen` and chapter/verse rendering helpers
- Coordinates buffered chapter rendering, verse actions, scroll behavior, and state restore.

## `src/ui/VerseScreen.css`

- Purpose: verse-screen specific styling for reading and verse interaction surfaces.

## `src/ui/pinchZoom.ts`

- Purpose: pinch-zoom gesture behavior for reading surfaces.

## `src/ui/pinchZoom.test.ts`

- Purpose: tests for pinch gesture handling and interaction boundaries.

## `src/core/Plugin.ts`

- Purpose: plugin base classes and internal plugin manager
- Key APIs: `Plugin`, `InternalPlugins`, `IconActionItem`
- Handles plugin lifecycle, registration helpers, and cleanup wiring.

## `src/core/ExternalHostApi.ts`

- Purpose: host API contracts used by external plugin runtime integration.

## `src/core/ExternalPlugins.ts`

- Purpose: external plugin loading/runtime management layer.

## `src/core/ExternalPlugins.test.ts`

- Purpose: tests for external plugin registration and runtime behavior.

## `src/core/Plugin.test.ts`

- Purpose: tests for plugin lifecycle and manager behavior.

## `src/core/TranslationManager.ts`

- Purpose: translation loading and metadata coordination utilities.

## `src/electron/index.html`

- Purpose: Electron renderer HTML shell loaded by `src/electron/electron.js`.

## `src/__mocks__/external-App.stub.ts`

- Purpose: lightweight test stub that re-exports the highlighter for isolated tests.

## `src/parsedNave.test.ts`

- Purpose: tests around parsed Nave topical data integration.
