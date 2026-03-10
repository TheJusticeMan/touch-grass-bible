# Improvements Overview

This document provides a high-level summary of recommended improvements to the Touch Grass Bible codebase. Detailed discussion is available in the linked documents.

---

## Summary by Category

| Category | Priority | Effort | Impact |
|----------|----------|--------|--------|
| [Testing](testing.md) | High | Medium | High |
| [Architecture](architecture.md) | Medium | High | High |
| [Features](features.md) | Medium | Medium | High |

---

## Top Priority Improvements

### 1. Add a Test Suite

Currently `npm test` fails with "no test specified." A test suite would catch regressions in core functionality:
- `VerseRef` parsing, navigation, and text access
- `BibleTopics` CRUD operations
- Settings serialization/deserialization
- Plugin loading/unloading

See [testing.md](testing.md) for a full testing strategy.

### 2. Fix the `VerseRef` Static Data Anti-Pattern

`VerseRef` uses static properties as a global mutable data store. This makes it difficult to test in isolation, creates hidden dependencies, and prevents multiple app instances. Consider:
- Injecting Bible data via a `BibleDataService` singleton
- Making static state explicit via dependency injection
- Separating the data model from the data store

See [architecture.md](architecture.md) for details.

### 3. Deep-Merge Settings

The current settings load uses a shallow `Object.assign`:
```typescript
this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
```

Nested objects like `style` are replaced wholesale. Adding new fields to `style` in a future version will break backwards compatibility for existing users. A deep-merge utility would preserve new default values for keys missing in saved settings.

### 4. Complete the AI Integration

`AIchat.ts` is a fully functional AI chat class, but it's not integrated into the UI. The `AI.ts` plugin stub exists but does nothing. Completing the integration would unlock a powerful Bible study assistant feature.

### 5. Settings Schema Versioning

There is no version field in `TGAppSettings`. As the app evolves and settings structure changes, there is no mechanism to migrate user data. Adding a `version` field and a migration function would prevent data loss when settings schema changes.

---

## Quick Wins (Low Effort, High Value)

1. **Fix the `notePreview` reactive update** — Re-enable `note.on("change", this.update)` for live preview refreshes
2. **Add `aria-label` attributes** — The app lacks accessibility attributes on interactive elements
3. **Fix the TopicalBible verse action** — The `topCategory: "topic-list"` should be `"topics"`
4. **Add keyboard shortcut documentation** — Users don't know all available shortcuts
5. **Save ExtraNotes on every change** — Currently only saved when leaving the Notes panel tab
6. **Add error boundary for failed JSON loads** — Graceful degradation when `crossrefs.json` or `topics.json` fails

---

## Long-Term Vision

1. **Sync across devices** — Optional cloud sync for bookmarks and notes (opt-in)
2. **Plugin marketplace** — Allow community plugins (commentaries, devotionals, study tools)
3. **Enhanced reading modes** — Full-screen, night mode, large print, dyslexia-friendly fonts
4. **Offline-first AI** — Local LLM integration for completely private Bible study assistance
5. **Reading plans** — Daily reading plans with progress tracking
6. **Multiple Bible languages** — Non-English translations (Greek, Hebrew, Spanish, etc.)
