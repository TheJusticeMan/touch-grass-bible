# Plugin Improvements

This page covers user-facing feature improvements under `src/plugins/`.

## `src/plugins/AI.ts`

- High: add cancellation and single-flight protection for overlapping AI requests
- High: improve API-key handling with masked display, clear-key actions, and safer storage guidance
- Medium: add conversation controls like clear history, new chat, or verse-scoped sessions

## `src/plugins/Bookmarks.ts`

- High: debounce or batch bookmark-history persistence so verse navigation does not thrash storage
- High: fix `dateCompare()` so sorting matches the intended behavior
- Medium: improve tag creation with trimming, duplicate prevention, rename support, and better empty-name handling

## `src/plugins/Bookmarks.test.ts`

- Medium: replace duplicated logic with a shared exported helper or add broader coverage around the real implementation

## `src/plugins/Notes/Notes.ts`

- High: save verse-note edits through plugin storage instead of `app.saveSettingsAfterDelay()`
- Medium: align `NotesPluginSettings.ExtraNotes` with runtime note data such as tags
- Medium: make note search work by verse reference as well as note body

## `src/plugins/Notes/NotesPanel.ts`

- High: make the search box search vault notes instead of routing to verse notes only
- Medium: debounce editor saves and avoid writing during render/update churn
- Medium: create notes lazily so empty drafts are not persisted immediately
- Medium: improve tag editing with Enter/blur commit, trimming, and dedupe

## `src/plugins/Notes/NotesPanel.css`

- Medium: add stronger focus states, keyboard-visible affordances, and responsive sizing for the editor overlay

## `src/plugins/Journal/Journal.ts`

- High: either implement true editable mode or remove the `appendOnly` toggle until it is real
- High: throttle reading-history capture so normal navigation does not flood the journal
- Medium: add verse-centric journal entry flows from the reading screen

## `src/plugins/Journal/JournalPanel.ts`

- High: make non-append-only mode actually editable
- High: make verse-reference history entries clickable back into scripture
- Medium: add explicit loading, empty, and error states for async journal operations
- Medium: add date jump, filter, or search tools for larger journals

## `src/plugins/Journal/journal-storage.ts`

- High: store OSIS references alongside display text for stable linking
- Medium: add schema/versioning and better corruption recovery for journal files
- Medium: reduce write amplification when appending to large days

## `src/plugins/Search.ts`

- High: build a search index or move full-text search off the UI thread
- High: improve go-to parsing for abbreviations, ranges, numbered books, and common user input forms
- Medium: add better result ranking, scope options, and translation indicators
- Medium: replace hardcoded category string literals with shared constants everywhere

## `src/plugins/Settings.ts`

- High: include plugin configs and journal files in backup and restore flows
- High: make reset behavior match its label by clearing plugin and file-backed data too, or relabel it
- High: validate imported JSON and support schema migration
- Medium: expose real configurable app settings from `TGAppSettings` instead of mostly utilities

## `src/plugins/Share.ts`

- High: implement the advertised clipboard-copy behavior
- Medium: add Web Share support with clipboard and open-link fallbacks
- Medium: harden external opens with `noopener,noreferrer` and richer share formats

## `src/plugins/TopicalBible.ts`

- Medium: show suggested or browsable topics when the query is empty
- Medium: preserve and expose topical ranking scores from the source data
- Medium: add explicit empty/failure states when topic data is missing or a verse has no topics

## `src/plugins/Translations.ts`

- High: persist the selected translation across sessions
- High: rerender verse content immediately when translation changes
- Medium: mark the active translation clearly in UI and palette lists
- Medium: derive richer translation metadata instead of relying on a tiny hardcoded map

## `src/plugins/TSK.ts`

- Medium: preserve cross-reference strength metadata in the UI
- Medium: show a meaningful empty state when a verse has no cross references
- Medium: validate malformed OSIS input before conversion to avoid silent fallback pollution

## `src/plugins/categoryIDs.ts`

- Low: consider freezing or typing the exported ID map to reduce accidental string drift

## Cross-plugin opportunities

- High: create one unified persistence/export/reset layer for root settings, plugin configs, and journal files
- High: standardize verse action UX with consistent loading, success, and error feedback across plugins
- Medium: build a shared search/index layer for Bible text, notes, journal, bookmarks, topics, and references
- Medium: standardize debounced saves, optimistic UI, and recovery messaging for all plugins
