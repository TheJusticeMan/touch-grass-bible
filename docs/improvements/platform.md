# Platform Improvements

This page covers runtime adapters, Electron shell code, and packaging.

## `src/platform/browserFileIO.ts`

- High: resolve or reject cleanly when file picking is canceled.
- Medium: tighten temporary element/object URL cleanup behavior.
- Medium: prefer modern browser file APIs where available with fallback paths.

## `src/platform/electron.ts`

- High: rely on native dialogs/bridge-first flows for file operations.
- Medium: improve typed error mapping for bridge failures and parse errors.
- Medium: expand malformed payload and missing bridge method coverage.

## `src/platform/capacitor.ts`

- High: harden path normalization and parent traversal rejection.
- High: ensure not-found is distinguishable from permission/disk failures.
- Medium: use safer write paths for user data and JSON content.

## `src/platform/current.ts`

- Medium: centralize unsupported-target diagnostics and fallback behavior.

## `src/platform/types.ts`

- Medium: define richer typed errors to distinguish validation, permission, parse, and not-found classes.

## `src/electron/electron.js`

- High: verify sandbox/navigation hardening remains strict in production builds.
- High: validate IPC payload size and type boundaries consistently.
- Medium: improve atomic write strategy and corruption recovery.

## `src/electron/preload.js`

- High: validate all bridge arguments at preload boundary.
- Medium: freeze exposed API shape for easier auditing.

## `src/electron/index.html`

- Medium: reduce inline boot logic and keep loading states deterministic.
- Medium: align loading behavior with real startup lifecycle events.

## `src/electron/forge.config.js`

- Medium: keep platform icon/signing metadata synchronized across makers.
- Medium: add packaging smoke checks for release artifacts.

## `src/electron/package.json`

- Medium: avoid version/config drift with root package metadata.
- Medium: remove unused desktop dependencies/scripts.

## Cross-platform themes

- High: standardize path validation, typed errors, and safe writes across all adapters.
- High: test unhappy paths consistently (permission denial, malformed JSON, missing files).
- Medium: centralize package/icon/version metadata generation from one source of truth.
