# Platform Improvements

This page covers runtime adapters, Electron, web, Capacitor, packaging, and offline behavior.

## `src/platform/browserFileIO.ts`

- High: resolve or reject cleanly when a file picker is canceled instead of leaving promises hanging
- Medium: clean up temporary DOM and revoke object URLs after a safer delay
- Medium: prefer File System Access APIs when available with current behavior as fallback
- Medium: add tests for cancel, read-error, and cleanup behavior

## `src/platform/web.ts`

- High: move the virtual filesystem off `localStorage` to IndexedDB or OPFS, or at least add quota handling
- Medium: reject `..` path segments so validation matches other platforms
- Medium: add offline-aware asset fallback behavior beyond raw `fetch`
- Medium: expand tests for quota, corrupt JSON, and fetch failures

## `src/platform/electron.ts`

- High: replace browser-style file pick and save flows with native dialogs exposed from preload
- Medium: wrap JSON parse failures with path-aware errors and optional schema validation
- Medium: add tests for malformed JSON, missing bridge methods, and native dialog flows

## `src/platform/capacitor.ts`

- High: reject parent-path traversal explicitly during normalization
- High: return `null` only for real not-found reads and surface permission or disk failures
- Medium: use safer write flows for settings and JSON files
- Medium: prefer native mobile file pick/share/save patterns over browser helpers

## `src/platform/current.ts`

- Medium: centralize platform-target validation and expose clearer diagnostics when an unsupported target is requested

## `src/platform/types.ts`

- Medium: consider richer typed error contracts so callers can distinguish not-found, validation, permission, and parse failures consistently

## `src/electron/electron.js`

- High: enable `sandbox: true` and block unexpected navigation and popup creation
- High: validate IPC payload types and cap allowed content sizes before filesystem access
- Medium: use atomic writes for settings and user data files
- Medium: add main-process tests for traversal rejection and IPC validation

## `src/electron/preload.js`

- High: validate arguments at the preload boundary before invoking IPC
- Medium: freeze and namespace the exposed API for easier auditing
- Medium: add preload-specific tests for bridge shape and rejected calls

## `src/electron/forge.config.js`

- Medium: use proper platform packaging icons such as `.ico`, `.icns`, and Linux icon sets
- Medium: add missing makers if macOS or Linux desktop distribution is a priority
- Medium: add signing, notarization, bundle ID, and richer release metadata
- Low: add CI smoke checks for packaged artifacts and metadata

## `src/electron/package.json`

- High: remove version drift by generating or syncing Electron package metadata from one source of truth
- Medium: either wire up `electron-squirrel-startup` or remove it
- Medium: reduce duplicate package state under `src/electron`

## `src/electron/index.html`

- High: add a CSP and move inline boot logic out of the HTML shell
- Medium: replace fake loading progress with deterministic boot states and a timeout/failure path
- Low: add a packaged-app smoke test to verify the loading screen disappears

## `src/web/index.html`

- High: add a CSP and move inline startup logic into bundled code or a nonce-based approach
- Medium: improve service worker registration UX with update detection and user-facing recovery messaging
- Medium: align install metadata and linked icons with the manifest
- Low: add integration coverage for first-load boot and registration behavior

## `src/web/service-worker.js`

- High: restrict interception to same-origin `GET` requests
- High: replace blanket cache-first behavior with asset-specific strategies
- High: generate the precache list from build output instead of hardcoding assets
- Medium: make install more resilient so one missing asset does not break the entire cache install
- Medium: add direct tests for install, activate, migration, and offline fetch behavior

## `src/web/manifest.json`

- High: fix icon paths so they match the actual built asset locations
- Medium: add `id`, maskable icons, screenshots, and shortcuts for richer install UX
- Medium: revisit `start_url` and `scope` for safer hosting behavior
- Low: validate the manifest in CI

## `src/web/favicon.ico`, `src/web/icon-192.png`, `src/web/icon-512.png`

- Low: treat these as packaging assets from a single source pipeline so web and Electron builds cannot drift in naming or quality

## Test files

- [x] Medium: expand `src/platform/web.test.ts`, `src/platform/electron.test.ts`, and `src/platform/capacitor.test.ts` to cover unhappy paths
- Medium: expand `src/platform/web.test.ts`, `src/platform/electron.test.ts`, and `src/platform/capacitor.test.ts` to cover corrupt data handling

## Cross-platform themes

- High: create one shared path-validation utility for Electron, web, and Capacitor
- High: standardize atomic writes, typed errors, and schema validation across all data stores
- Medium: generate versions, icons, manifests, and package metadata from one source of truth
- Medium: add a small E2E matrix for offline startup, corrupt saved data, permission denial, and upgrade/cache migration
