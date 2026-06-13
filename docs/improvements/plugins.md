# Plugin Improvements

This page covers user-facing feature improvements under `src/plugins/`.

## `src/plugins/AI/AI.ts` and `src/plugins/AI/AIchat.ts`

- High: add cancellation/single-flight handling for overlapping requests.
- High: improve API-key UX (masked display, clear action, validation feedback).
- Medium: add explicit chat/session controls and better failure recovery.

## `src/plugins/Bookmarks.ts`

- High: batch/debounce persistence writes during rapid verse navigation.
- Medium: improve tag normalization (trim, dedupe, rename support).

## `src/plugins/Notes/Notes.ts` and `src/plugins/Notes/NotesPanel.ts`

- High: route all note persistence through note-specific storage paths.
- Medium: debounce editor writes to reduce save churn.
- Medium: support richer search across note body, tags, and verse refs.

## `src/plugins/Journal/Journal.ts`

- High: reconcile append-only versus editable mode behavior with UI copy.
- High: throttle history capture and avoid duplicate entry bursts.
- Medium: improve verse-link navigation and large-history tooling.

## `src/plugins/Search.ts` and `src/plugins/searchParser.ts`

- High: optimize full-text search for larger datasets.
- High: improve parser handling for abbreviations, ranges, and numbered books.
- Medium: tune ranking and scope controls.

## `src/plugins/Settings.ts`

- High: ensure backup/restore includes plugin and file-backed data consistently.
- High: validate imported settings payloads with migrations.
- Medium: surface more live app settings in the command UI.

## `src/plugins/Translations.ts`

- High: persist selected translation and rerender immediately when changed.
- Medium: expose active translation state more clearly in UI.

## `src/plugins/Share.ts`

- High: complete clipboard copy behavior advertised by the feature.
- Medium: support layered fallback between Web Share, clipboard, and links.

## `src/plugins/BibleMap/*`

- Medium: improve empty/loading/error states and map interaction affordances.

## `src/plugins/GestureCommands/*`

- Medium: align gesture discoverability with command palette and settings help.

## `src/plugins/NavesTopicalBible/*` and `src/plugins/TopicalBible.ts`

- Medium: improve topic discovery when query is empty.
- Medium: preserve and show topical relevance/strength metadata.

## Cross-plugin themes

- High: create one shared persistence/export/reset workflow for root and plugin data.
- High: standardize async UX states (loading, success, error, retry) across plugin panels.
- Medium: unify debounce/backpressure strategies for heavy write paths.
