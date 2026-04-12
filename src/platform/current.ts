import { createPlatformBridge as createCapacitorPlatformBridge } from "./capacitor";
import { createPlatformBridge as createElectronPlatformBridge } from "./electron";
import type { PlatformBridge, PlatformFileAdapter, PlatformStorageAdapter, PlatformTarget } from "./types";

declare const __TG_PLATFORM_TARGET__: PlatformTarget | undefined;

function getBuildTarget(): PlatformTarget {
  if (typeof __TG_PLATFORM_TARGET__ === "string") {
    return __TG_PLATFORM_TARGET__;
  }
  return "capacitor";
}

export function createPlatformBridge(): PlatformBridge {
  switch (getBuildTarget()) {
    case "electron":
      return createElectronPlatformBridge();
    default:
      return createCapacitorPlatformBridge();
  }
}

export type { PlatformBridge, PlatformFileAdapter, PlatformStorageAdapter, PlatformTarget };
