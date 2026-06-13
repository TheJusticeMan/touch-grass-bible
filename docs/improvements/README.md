# Improvement Review

This folder captures potential improvements and enhancements found during a codebase-wide review of `src/`.

## Recommended first passes

### 1. Reliability and data safety

- Make settings, plugin data, journal files, and layout saves use consistent error handling and safer write flows.
- Add schema validation and migrations for root settings, plugin settings, journal files, and imported JSON.
- Harden path validation and bridge behavior so Electron, web, and Capacitor follow the same rules.

### 2. Accessibility and input quality

- Replace clickable `div` controls with semantic buttons where possible.
- Add `:focus-visible`, dialog semantics, keyboard support, and reduced-motion handling across the workspace and command palette.
- Revisit global CSS rules that suppress scrolling, selection, or normal form behavior.

### 3. Performance and scaling

- Index or offload Bible search instead of scanning on every keystroke.
- Reduce `VerseScreen` DOM churn and bookmark/journal save frequency during navigation.
- Remove always-on workspace tracing and full command-palette rebuilds in common flows.

### 4. Product polish

- Persist translation selection, improve empty states, and make share and journal flows match their advertised behavior.
- Expand Settings so it manages real app preferences and complete backup/restore scope.
- Improve service worker update behavior, install metadata, and desktop packaging consistency.

## File groups

- `core.md` - app boot, Bible models, settings, reading surface, and navigation
- `framework.md` - framework package internals (command palette, workspace, events, DOM helpers, and shared CSS)
- `plugins.md` - AI, bookmarks, notes, journal, search, settings, translations, sharing, and TSK
- `platform.md` - platform bridges, Electron shell, runtime adapters, and packaging

## Suggested implementation order

1. Data integrity and persistence hardening
2. Accessibility fixes in shared UI primitives
3. Search and reading-performance work
4. Plugin UX and product-level enhancements
5. Packaging, offline, and distribution polish
