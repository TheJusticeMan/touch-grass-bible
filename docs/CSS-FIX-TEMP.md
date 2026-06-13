# CSS Improvement Guide

This guide is specific to the current Touch Grass Bible stylesheets.

Reviewed files:

- `src/main.css`
- `src/ui/VerseScreen.css`
- `packages/framework/src/App.css`
- `packages/framework/src/CommandPalette.css`
- `packages/framework/src/UIComponents.css`
- `packages/framework/src/Workspace.css`
- `src/plugins/Notes/NotesPanel.css`
- `src/plugins/Journal/Journal.css`
- `src/plugins/BibleMap/BibleMap.css`
- `src/plugins/GestureCommands/GestureCommands.css`

## What is already working well

- `src/main.css` already centralizes much of the app token surface.
- CSS is split by feature area instead of one monolithic stylesheet.
- Plugin styles are mostly isolated and easier to reason about than before.

## Main problems found

### 1. Tokens are still mixed with hardcoded values

- Some feature styles still use raw colors/shadows where semantic tokens would be clearer.
- App and framework layers still have mixed naming conventions for color/radius tokens.

Fix:

- Keep `src/main.css` as the primary token source.
- Add/align semantic token aliases consumed by framework and plugin CSS.
- Replace repeated hardcoded values with semantic tokens.

### 2. Shared component ownership is inconsistent

- Similar interactive patterns are redefined across framework and plugin styles.
- Button/icon interaction states can drift when not owned by one layer.

Fix:

- Keep shared interaction primitives in `packages/framework/src/UIComponents.css`.
- Keep workspace/palette-specific rules local to their framework CSS files.
- Keep plugin-specific styling in plugin folders only.

### 3. Accessibility patterns need stronger consistency

- Focus-visible styles differ across controls.
- Some surfaces still rely more on hover than keyboard-visible affordances.

Fix:

- Standardize focus-visible tokens and apply them to all interactive primitives.
- Audit contrast on translucent surfaces and muted text.
- Keep touch targets at practical sizes for mobile and tablet.

### 4. Mobile behavior still has structural coupling

- Some layout behavior still depends on structure assumptions rather than explicit roles.

Fix:

- Prefer semantic panel-role classes over positional assumptions.
- Add safe-area aware spacing tokens for fixed overlays/actions.
- Keep gesture-driven layouts and CSS states aligned in naming.

## File-by-file priority

### `src/main.css`

- Expand semantic tokens for overlay, borders, muted text, and motion timings.
- Keep global styles focused on app-wide primitives.

### `packages/framework/src/App.css`

- Keep shell-only rules and avoid overreaching interaction defaults.

### `packages/framework/src/Workspace.css`

- Improve mobile panel semantics and keyboard-visible states.

### `packages/framework/src/CommandPalette.css`

- Strengthen selected/hover/focus distinctions and overflow behavior.

### `packages/framework/src/UIComponents.css`

- Centralize shared button/menu/surface states.

### `src/ui/VerseScreen.css`

- Align verse-surface styles with shared token naming and focus behavior.

### `src/plugins/Notes/NotesPanel.css`

- Replace repeated hardcoded values and normalize overlay behavior.

### `src/plugins/Journal/Journal.css`

- Align surfaces and states with shared framework token usage.

## Short implementation plan

### Phase 1: token alignment

- Add missing semantic tokens in `src/main.css`.
- Replace repeated hardcoded values in framework/plugin CSS.

### Phase 2: primitive ownership cleanup

- Ensure one owner for shared button, menu, and surface patterns.
- Remove duplicate interaction-state definitions where possible.

### Phase 3: mobile and accessibility pass

- Improve role-based panel behavior and safe-area spacing.
- Standardize keyboard-visible focus states across all layers.
