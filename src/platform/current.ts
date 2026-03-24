import { createPlatformBridge as createCapacitorPlatformBridge } from "./capacitor";
import { createPlatformBridge as createElectronPlatformBridge } from "./electron";
import type { PlatformBridge, PlatformFileAdapter, PlatformStorageAdapter, PlatformTarget } from "./types";
import { createPlatformBridge as createWebPlatformBridge } from "./web";

declare const __TG_PLATFORM_TARGET__: PlatformTarget | undefined;

function getBuildTarget(): PlatformTarget {
  if (typeof __TG_PLATFORM_TARGET__ === "string") {
    return __TG_PLATFORM_TARGET__;
  }
  return "web";
}

export function createPlatformBridge(): PlatformBridge {
  switch (getBuildTarget()) {
    case "electron":
      return createElectronPlatformBridge();
    case "capacitor":
      return createCapacitorPlatformBridge();
    case "web":
    default:
      return createWebPlatformBridge();
  }
}

export type { PlatformBridge, PlatformFileAdapter, PlatformStorageAdapter, PlatformTarget };
