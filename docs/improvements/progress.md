# Improvements Progress Tracker

This file tracks the implementation status of all improvements proposed in `docs/improvements/`.

Last updated: 2026-03-10

---

## Architecture Improvements (`architecture.md`)

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 1 | `VerseRef` Static Data Anti-Pattern | ⏳ Deferred | Major refactor; tracked as long-term work |
| 2 | `VerseRef.fromOSIS` Error Handling | ✅ Done | Guards against unknown book codes and NaN chapter/verse |
| 3 | Shallow Settings Merge | ✅ Done | `deepMerge<T>()` + `isPlainObject()` in `main.ts` |
| 4 | Settings Version Migration | ✅ Done | `schemaVersion: 1` added to `TGAppSettings` |
| 5 | `console.log` vs `BrowserConsole` | ✅ Done | `NotesPanel.ts`, `VerseScreen.ts` updated |
| 6 | Unused Dead Code | ✅ Done | Commented-out blocks removed from `VerseScreen.ts`; `notesPanelZZZ` was already removed |
| 7 | Type Safety in `AIchat` | ✅ Done | `ChatMessage`, `ToolCall`, `ChatDelta`, `ChatRequestOptions`, `ChatResponse` types added |
| 8 | Module Circular Dependencies | ⏳ Deferred | Works in practice via esbuild; low risk |
| 9 | `topicListCategory` vs `TopicListCategoryID` | ✅ Done | Hardcoded `"topic-list"` replaced with constant |

---

## Feature Improvements (`features.md`)

### Immediate Fixes (Bugs)

| Item | Status | Notes |
|------|--------|-------|
| Fix TopicalBible Verse Action Navigation | ✅ Done | Uses `TopicListCategoryID` constant |
| Fix `notePreview` Reactive Updates | ✅ Done | `note.on("change", this.update)` re-enabled; `off()` in `destroy()` |
| Save Notes on Every Change | ✅ Done | `saveSettingsAfterDelay(3000)` on title and content input |

### High-Value Features

| Item | Status | Notes |
|------|--------|-------|
| Complete AI Integration | ✅ Done | `AI.ts` integrated with `AIchat`; API key in Settings |
| Deeper Style Customization | ⏳ Deferred | Settings UI for style fields is long-term work |
| Reading Plans | ⏳ Deferred | Long-term vision feature |
| Multiple Notes per Verse | ⏳ Deferred | Long-term vision feature |
| Highlight Verses | ⏳ Deferred | Long-term vision feature |
| Enhanced Search (Orama) | ⏳ Deferred | Current substring scan is functional |
| Cross-Reference Chains/Graph | ⏳ Deferred | Long-term vision feature |
| Audio Bible | ⏳ Deferred | Requires external API |
| Greek/Hebrew Word Study | ⏳ Deferred | Requires Strong's concordance data |

### Accessibility

| Item | Status | Notes |
|------|--------|-------|
| `aria-label` on icon buttons | ✅ Done | `setTooltip()` now sets both `title` and `aria-label` |
| `role="list"` / `role="listitem"` in palette | ⏳ Deferred | Framework-level change |
| `aria-live` for palette results | ⏳ Deferred | Framework-level change |

### Mobile Experience

| Item | Status | Notes |
|------|--------|-------|
| Bottom Sheet Palette | ⏳ Deferred | Long-term vision |
| Swipe Navigation | ⏳ Deferred | Long-term vision |
| Home Screen Verse of the Day | ⏳ Deferred | Requires Capacitor widget work |

---

## Testing Improvements (`testing.md`)

| Item | Status | Notes |
|------|--------|-------|
| Vitest setup | ✅ Done | `vitest.config.ts`, test scripts in `package.json` |
| `VerseRef` unit tests | ✅ Done | 15 tests in `src/VerseRef.test.ts` |
| `BibleTopics` unit tests | ✅ Done | 12 tests in `src/BibleTopics.test.ts` |
| `TGAppSettings` shape tests | ✅ Done | 5 tests in `src/TGAppSettings.test.ts` |
| `deepMerge` utility tests | ✅ Done | Tests in `src/main.test.ts` |
| `VerseListCategory.convertTopicDate` tests | ✅ Done | Tests in `src/plugins/Bookmarks.test.ts` |
| Plugin logic tests (Priority 2) | ⏳ Deferred | Requires more DOM mocking |
| Integration tests (Priority 3) | ⏳ Deferred | Requires mock app infrastructure |
| E2E tests with Playwright (Priority 4) | ⏳ Deferred | Requires running dev server |

---

## Overview Quick Wins (`overview.md`)

| Item | Status | Notes |
|------|--------|-------|
| Fix `notePreview` reactive update | ✅ Done | See features.md |
| Add `aria-label` attributes | ✅ Done | `setTooltip()` sets both `title` and `aria-label` |
| Fix TopicalBible verse action | ✅ Done | See features.md |
| Add keyboard shortcut documentation | ✅ Done | Keyboard shortcuts listed in Settings palette help |
| Save ExtraNotes on every change | ✅ Done | See features.md |
| Error boundary for failed JSON loads | ✅ Done | `translations.json`, `topics.json`, `crossrefs.json` wrapped in try/catch |

---

## Long-Term Vision Items (Out of Scope)

These are tracked for future work and not targeted in the current implementation sprint:

- Sync across devices (requires cloud backend)
- Plugin marketplace (requires registry infrastructure)
- Enhanced reading modes (full-screen, night mode, dyslexia fonts)
- Offline-first AI (local LLM integration)
- Reading plans with progress tracking
- Multiple Bible languages (non-English translations)
