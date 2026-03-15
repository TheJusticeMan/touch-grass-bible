# Platform Abstraction (platform/)

## Overview

The platform layer provides abstraction for different runtime environments:

- **Web**: Browser-based (default)
- **Electron**: Desktop app
- **Capacitor**: Mobile app (iOS/Android)

## Architecture

```
src/platform/
├── types.ts          # Platform interfaces
├── current.ts        # Platform detection
├── web.ts            # Web implementation
├── electron.ts       # Electron implementation
├── capacitor.ts     # Capacitor implementation
└── browserFileIO.ts # Browser file I/O
```

## PlatformBridge Interface

```typescript
interface PlatformBridge {
  target: PlatformTarget;
  storage: PlatformStorageAdapter;
  files: PlatformFileAdapter;
}

interface PlatformStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

interface PlatformFileAdapter {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
  readJsonFile<T>(path: string): Promise<T>;
  writeJsonFile(path: string, data: unknown): Promise<void>;
  loadAssetText(path: string): Promise<string>;
  loadAssetJson<T>(path: string): Promise<T>;
  pickFileText(accept: string): Promise<string | null>;
  saveFile(filename: string, content: string, mimeType?: string): Promise<void>;
}
```

## Platform Detection

Platform is detected at build time using a global variable:

```typescript
// Set by build system
declare const __TG_PLATFORM_TARGET__: PlatformTarget;

function getBuildTarget(): PlatformTarget {
  if (typeof __TG_PLATFORM_TARGET__ === "string") {
    return __TG_PLATFORM_TARGET__;
  }
  return "web"; // Default
}
```

## Web Platform

Uses browser APIs:

- `localStorage` for persistent storage
- `fetch` for loading assets
- `<input type="file">` for file picking
- `URL.createObjectURL` for downloads

## Electron Platform

Uses Electron IPC:

- `storage.getItem/setItem` → IPC to main process
- File operations via IPC
- Window controls via IPC (`windowMinimize`, `windowMaximize`, `windowClose`)

## Capacitor Platform

Uses Capacitor plugins:

- `@capacitor/storage` for persistent storage
- `@capacitor/filesystem` for file operations

## Potential Improvements

1. **Service Workers**: Add offline support with service workers
2. **IndexedDB**: Use IndexedDB for larger data storage
3. **File Sync**: Add cloud sync capabilities
4. **Platform Features**: Expose more native features per platform
5. **PWA**: Add progressive web app support
