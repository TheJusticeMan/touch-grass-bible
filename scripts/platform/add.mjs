#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const platform = process.argv[2];
if (!platform || !["android", "ios"].includes(platform)) {
  console.error("Usage: node scripts/platform/add.mjs <android|ios>");
  process.exit(1);
}

const manifestPath =
  platform === "android"
    ? "android/app/src/main/AndroidManifest.xml"
    : "ios/App/App.xcodeproj/project.pbxproj";
// eslint-disable-next-line security/detect-non-literal-fs-filename
if (existsSync(manifestPath)) {
  console.log(`${platform.toUpperCase()} platform already present. Skipping.`);
  process.exit(0);
}

console.log(`Adding ${platform} platform via Capacitor...`);
const result = spawnSync("npx", ["cap", "add", platform], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 0);
